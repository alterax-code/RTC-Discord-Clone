//! DM (Direct Messages) handlers

use axum::{
    extract::{Extension, Path, State},
    http::StatusCode,
    Json,
};
use uuid::Uuid;

use crate::models::{
    DmConversationRow, DmMessage, SendDmPayload, StartDmByUsernamePayload, StartDmPayload,
};

#[derive(serde::Deserialize)]
pub struct AddDmReactionPayload {
    pub emoji: String,
}
use crate::mongo;
use crate::AppState;

/// Start or retrieve a DM conversation with another user
pub async fn start_dm(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Json(payload): Json<StartDmPayload>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let other_id = payload.user_id;

    if user_id == other_id {
        return Err(StatusCode::BAD_REQUEST);
    }

    // Check existing conversation (both directions)
    let existing: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM dm_conversations \
         WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1) \
         LIMIT 1",
    )
    .bind(user_id)
    .bind(other_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        eprintln!("start_dm select: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let conversation_id = if let Some(id) = existing {
        id
    } else {
        sqlx::query_scalar(
            "INSERT INTO dm_conversations (id, user1_id, user2_id) \
             VALUES (gen_random_uuid(), $1, $2) RETURNING id",
        )
        .bind(user_id)
        .bind(other_id)
        .fetch_one(&state.db)
        .await
        .map_err(|e| {
            eprintln!("start_dm insert: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
    };

    Ok(Json(serde_json::json!({ "id": conversation_id })))
}

/// List DM conversations for the authenticated user
pub async fn list_dm_conversations(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
) -> Result<Json<Vec<serde_json::Value>>, StatusCode> {
    let rows = sqlx::query_as::<_, DmConversationRow>(
        "SELECT
            dc.id,
            CASE WHEN dc.user1_id = $1 THEN dc.user2_id ELSE dc.user1_id END AS other_user_id,
            u.username AS other_username
         FROM dm_conversations dc
         JOIN users u ON u.id = CASE WHEN dc.user1_id = $1 THEN dc.user2_id ELSE dc.user1_id END
         WHERE dc.user1_id = $1 OR dc.user2_id = $1
         ORDER BY dc.created_at DESC",
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        eprintln!("list_dm_conversations: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let result: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id": r.id,
                "other_user_id": r.other_user_id,
                "other_username": r.other_username,
            })
        })
        .collect();

    Ok(Json(result))
}

/// Start or retrieve a DM conversation by searching a username
pub async fn start_dm_by_username(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Json(payload): Json<StartDmByUsernamePayload>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let username = payload.username.trim().to_string();
    if username.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    // Find target user by username
    let other_id: Option<Uuid> =
        sqlx::query_scalar("SELECT id FROM users WHERE username = $1 LIMIT 1")
            .bind(&username)
            .fetch_optional(&state.db)
            .await
            .map_err(|e| {
                eprintln!("start_dm_by_username lookup: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

    let other_id = other_id.ok_or(StatusCode::NOT_FOUND)?;

    if user_id == other_id {
        return Err(StatusCode::BAD_REQUEST);
    }

    // Check or create conversation
    let existing: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM dm_conversations \
         WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1) \
         LIMIT 1",
    )
    .bind(user_id)
    .bind(other_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        eprintln!("start_dm_by_username select: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let conversation_id = if let Some(id) = existing {
        id
    } else {
        sqlx::query_scalar(
            "INSERT INTO dm_conversations (id, user1_id, user2_id) \
             VALUES (gen_random_uuid(), $1, $2) RETURNING id",
        )
        .bind(user_id)
        .bind(other_id)
        .fetch_one(&state.db)
        .await
        .map_err(|e| {
            eprintln!("start_dm_by_username insert: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
    };

    Ok(Json(serde_json::json!({
        "id": conversation_id,
        "other_username": username,
    })))
}

/// Get message history for a DM conversation
pub async fn get_dm_messages(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<DmMessage>>, StatusCode> {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM dm_conversations WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)",
    )
    .bind(id)
    .bind(user_id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if count == 0 {
        return Err(StatusCode::FORBIDDEN);
    }

    let msgs = mongo::get_dm_messages_by_conversation(&state.dm_messages, &id.to_string()).await;
    Ok(Json(msgs))
}

/// Delete a DM conversation (only participants can delete)
pub async fn delete_dm_conversation(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, StatusCode> {
    let result = sqlx::query(
        "DELETE FROM dm_conversations WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)",
    )
    .bind(id)
    .bind(user_id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        eprintln!("delete_dm_conversation: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if result.rows_affected() > 0 {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

/// Add a reaction to a DM message
pub async fn add_dm_reaction_http(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path(message_id): Path<String>,
    Json(payload): Json<AddDmReactionPayload>,
) -> Result<StatusCode, StatusCode> {
    if payload.emoji.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let ok = mongo::add_dm_reaction(
        &state.dm_messages,
        &message_id,
        &payload.emoji,
        &user_id.to_string(),
    )
    .await;

    if ok {
        let ws_event = serde_json::json!({
            "type": "reaction_added",
            "data": {
                "message_id": message_id,
                "emoji": payload.emoji,
                "user_id": user_id.to_string()
            }
        });
        let _ = state.bus.send(ws_event.to_string());
        Ok(StatusCode::OK)
    } else {
        Err(StatusCode::INTERNAL_SERVER_ERROR)
    }
}

/// Remove a reaction from a DM message
pub async fn remove_dm_reaction_http(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path((message_id, emoji)): Path<(String, String)>,
) -> Result<StatusCode, StatusCode> {
    let ok = mongo::remove_dm_reaction(
        &state.dm_messages,
        &message_id,
        &emoji,
        &user_id.to_string(),
    )
    .await;

    if ok {
        let ws_event = serde_json::json!({
            "type": "reaction_removed",
            "data": {
                "message_id": message_id,
                "emoji": emoji,
                "user_id": user_id.to_string()
            }
        });
        let _ = state.bus.send(ws_event.to_string());
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

/// Send a direct message to a conversation
pub async fn send_dm(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path(id): Path<Uuid>,
    Json(payload): Json<SendDmPayload>,
) -> Result<(StatusCode, Json<DmMessage>), StatusCode> {
    let content = payload.content.trim().to_string();
    if content.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM dm_conversations WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)",
    )
    .bind(id)
    .bind(user_id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if count == 0 {
        return Err(StatusCode::FORBIDDEN);
    }

    let username = super::get_username(&state.db, user_id).await;

    let msg = mongo::create_dm_message(
        &state.dm_messages,
        id.to_string(),
        user_id.to_string(),
        username,
        content,
    )
    .await
    .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;

    let ws_event = serde_json::json!({
        "type": "dm_message",
        "data": {
            "conversation_id": id.to_string(),
            "id": msg.id.as_ref().map(|oid| oid.to_hex()),
            "user_id": msg.user_id,
            "username": msg.username,
            "content": msg.content,
            "created_at": msg.created_at.to_string(),
        }
    });
    let _ = state.bus.send(ws_event.to_string());

    Ok((StatusCode::CREATED, Json(msg)))
}
