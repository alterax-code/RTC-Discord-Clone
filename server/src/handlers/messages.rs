//! Messages — envoi (HTTP), historique paginé, suppression

use axum::{
    extract::{Extension, Path, State},
    http::StatusCode,
    Json,
};
use uuid::Uuid;

use crate::models::*;
use crate::mongo;
use crate::AppState;
use super::{get_member_role, is_admin_or_owner};

// ==================== CREATE ====================

pub async fn create_message_http(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path(channel_id): Path<Uuid>,
    Json(payload): Json<CreateMessagePayload>,
) -> Result<(StatusCode, Json<serde_json::Value>), StatusCode> {
    let user =
        sqlx::query_as::<_, UserPublic>("SELECT id, username, email FROM users WHERE id = $1")
            .bind(user_id)
            .fetch_optional(&state.db)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .ok_or(StatusCode::UNAUTHORIZED)?;

    if payload.content.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let msg = mongo::create_message(
        &state.messages,
        channel_id.to_string(),
        user_id.to_string(),
        user.username.clone(),
        payload.content.clone(),
    )
    .await
    .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;

    // ★ BROADCAST new_message
    let ws_event = serde_json::json!({
        "type": "new_message",
        "data": {
            "id": msg.id.map(|id| id.to_hex()).unwrap_or_default(),
            "channel_id": channel_id.to_string(),
            "user_id": user_id.to_string(),
            "username": user.username,
            "content": payload.content,
            "created_at": msg.created_at.to_string()
        }
    });
    let _ = state.bus.send(ws_event.to_string());

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "id": msg.id.map(|id| id.to_hex()).unwrap_or_default(),
            "message": "Message sent"
        })),
    ))
}

// ==================== LIST (paginated) ====================

#[derive(serde::Deserialize, Default)]
pub struct MessagesQuery {
    pub limit: Option<i64>,
    pub before: Option<i64>,
}

pub async fn list_messages(
    State(state): State<AppState>,
    Path(channel_id): Path<Uuid>,
    axum::extract::Query(q): axum::extract::Query<MessagesQuery>,
) -> Json<Vec<Message>> {
    let limit = q.limit.unwrap_or(50).max(1).min(200);
    let messages = mongo::get_messages_paginated(
        &state.messages,
        &channel_id.to_string(),
        limit,
        q.before,
    )
    .await;
    Json(messages)
}

// ==================== DELETE ====================

pub async fn delete_message_http(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path(message_id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let msg = mongo::get_message_by_id(&state.messages, &message_id)
        .await
        .ok_or(StatusCode::NOT_FOUND)?;

    let is_own_message = msg.user_id == user_id.to_string();

    if !is_own_message {
        let channel = sqlx::query_as::<_, Channel>("SELECT * FROM channels WHERE id = $1")
            .bind(Uuid::parse_str(&msg.channel_id).map_err(|_| StatusCode::BAD_REQUEST)?)
            .fetch_optional(&state.db)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .ok_or(StatusCode::NOT_FOUND)?;

        let role = get_member_role(&state.db, user_id, channel.server_id)
            .await
            .ok_or(StatusCode::FORBIDDEN)?;
        if !is_admin_or_owner(&role) {
            return Err(StatusCode::FORBIDDEN);
        }
    }

    if mongo::delete_message(&state.messages, &message_id).await {
        // ★ BROADCAST message_deleted — tous les clients verront le message disparaître
        let ws_event = serde_json::json!({
            "type": "message_deleted",
            "data": {
                "message_id": message_id,
                "channel_id": msg.channel_id,
                "deleted_by": user_id.to_string()
            }
        });
        let _ = state.bus.send(ws_event.to_string());

        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}
