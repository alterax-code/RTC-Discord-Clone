//! Invitations — création d'invitations serveur

use axum::{
    extract::{Extension, Path, State},
    http::StatusCode,
    Json,
};
use uuid::Uuid;

use super::{generate_invite_code, get_member_role, is_admin_or_owner};
use crate::models::*;
use crate::AppState;

// ==================== CREATE INVITATION ====================

pub async fn create_invitation(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path(server_id): Path<Uuid>,
    Json(payload): Json<CreateInvitationPayload>,
) -> Result<(StatusCode, Json<Invitation>), StatusCode> {
    let role = get_member_role(&state.db, user_id, server_id)
        .await
        .ok_or(StatusCode::FORBIDDEN)?;
    if !is_admin_or_owner(&role) {
        return Err(StatusCode::FORBIDDEN);
    }

    let code = generate_invite_code();
    let expires_at = payload
        .expires_in_hours
        .map(|h| (chrono::Utc::now() + chrono::Duration::hours(h)).naive_utc());

    let invitation = sqlx::query_as::<_, Invitation>(
        "INSERT INTO invitations (server_id, code, created_by, max_uses, expires_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING *",
    )
    .bind(server_id)
    .bind(&code)
    .bind(user_id)
    .bind(payload.max_uses)
    .bind(expires_at)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        eprintln!("❌ create_invitation: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok((StatusCode::CREATED, Json(invitation)))
}
