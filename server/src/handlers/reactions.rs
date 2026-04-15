//! Reactions — ajouter / retirer une réaction sur un message

use axum::{
    extract::{Extension, Path, State},
    http::StatusCode,
    Json,
};
use uuid::Uuid;

use crate::mongo;
use crate::AppState;

#[derive(serde::Deserialize)]
pub struct AddReactionPayload {
    pub emoji: String,
}

// POST /messages/{id}/reactions
pub async fn add_reaction_http(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path(message_id): Path<String>,
    Json(payload): Json<AddReactionPayload>,
) -> Result<StatusCode, StatusCode> {
    if payload.emoji.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    mongo::get_message_by_id(&state.messages, &message_id)
        .await
        .ok_or(StatusCode::NOT_FOUND)?;

    let ok = mongo::add_reaction(
        &state.messages,
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

// DELETE /messages/{id}/reactions/{emoji}
pub async fn remove_reaction_http(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path((message_id, emoji)): Path<(String, String)>,
) -> Result<StatusCode, StatusCode> {
    mongo::get_message_by_id(&state.messages, &message_id)
        .await
        .ok_or(StatusCode::NOT_FOUND)?;

    let ok =
        mongo::remove_reaction(&state.messages, &message_id, &emoji, &user_id.to_string()).await;

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
