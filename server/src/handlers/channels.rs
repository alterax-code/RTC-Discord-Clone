//! Channels — CRUD avec vérification des permissions

use axum::{
    extract::{Extension, Path, State},
    http::StatusCode,
    Json,
};
use uuid::Uuid;

use super::{get_member_role, is_admin_or_owner};
use crate::models::*;
use crate::AppState;

// ==================== CREATE ====================

pub async fn create_channel(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path(server_id): Path<Uuid>,
    Json(payload): Json<CreateChannelPayload>,
) -> Result<(StatusCode, Json<Channel>), StatusCode> {
    let role = get_member_role(&state.db, user_id, server_id)
        .await
        .ok_or(StatusCode::FORBIDDEN)?;
    if !is_admin_or_owner(&role) {
        return Err(StatusCode::FORBIDDEN);
    }

    let channel = sqlx::query_as::<_, Channel>(
        "INSERT INTO channels (server_id, name) VALUES ($1, $2) RETURNING *",
    )
    .bind(server_id)
    .bind(&payload.name)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        eprintln!("❌ create_channel: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // ★ BROADCAST channel_created
    let ws_event = serde_json::json!({
        "type": "channel_created",
        "data": {
            "server_id": server_id.to_string(),
            "channel": {
                "id": channel.id.to_string(),
                "server_id": channel.server_id.to_string(),
                "name": channel.name,
                "created_at": channel.created_at.map(|dt| dt.to_string())
            }
        }
    });
    let _ = state.bus.send(ws_event.to_string());

    Ok((StatusCode::CREATED, Json(channel)))
}

// ==================== LIST ====================

pub async fn list_channels(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path(server_id): Path<Uuid>,
) -> Result<Json<Vec<Channel>>, StatusCode> {
    let role = get_member_role(&state.db, user_id, server_id).await;
    if role.is_none() {
        return Err(StatusCode::FORBIDDEN);
    }

    let channels = sqlx::query_as::<_, Channel>(
        "SELECT * FROM channels WHERE server_id = $1 ORDER BY created_at ASC",
    )
    .bind(server_id)
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(channels))
}

// ==================== GET ====================

pub async fn get_channel(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Channel>, StatusCode> {
    sqlx::query_as::<_, Channel>("SELECT * FROM channels WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .map(Json)
        .ok_or(StatusCode::NOT_FOUND)
}

// ==================== UPDATE ====================

pub async fn update_channel(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateChannelPayload>,
) -> Result<Json<Channel>, StatusCode> {
    let channel = sqlx::query_as::<_, Channel>("SELECT * FROM channels WHERE id = $1")
        .bind(id)
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

    let new_name = payload.name.unwrap_or(channel.name);

    let updated =
        sqlx::query_as::<_, Channel>("UPDATE channels SET name = $1 WHERE id = $2 RETURNING *")
            .bind(&new_name)
            .bind(id)
            .fetch_one(&state.db)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(updated))
}

// ==================== DELETE ====================

pub async fn delete_channel(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, StatusCode> {
    let channel = sqlx::query_as::<_, Channel>("SELECT * FROM channels WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let server_id = channel.server_id;

    let role = get_member_role(&state.db, user_id, server_id)
        .await
        .ok_or(StatusCode::FORBIDDEN)?;
    if !is_admin_or_owner(&role) {
        return Err(StatusCode::FORBIDDEN);
    }

    sqlx::query("DELETE FROM channels WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // ★ BROADCAST channel_deleted
    let ws_event = serde_json::json!({
        "type": "channel_deleted",
        "data": {
            "server_id": server_id.to_string(),
            "channel_id": id.to_string()
        }
    });
    let _ = state.bus.send(ws_event.to_string());

    Ok(StatusCode::NO_CONTENT)
}
