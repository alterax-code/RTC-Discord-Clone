//! Membres — liste, gestion des rôles, (kick/ban à venir en V2)

use axum::{
    extract::{Extension, Path, State},
    http::StatusCode,
    Json,
};
use uuid::Uuid;

use crate::models::*;
use crate::AppState;
use super::get_member_role;

// ==================== LIST MEMBERS ====================

pub async fn list_members(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path(server_id): Path<Uuid>,
) -> Result<Json<Vec<MemberWithUser>>, StatusCode> {
    let role = get_member_role(&state.db, user_id, server_id).await;
    if role.is_none() {
        return Err(StatusCode::FORBIDDEN);
    }

    let members = sqlx::query_as::<_, MemberWithUser>(
        "SELECT sm.user_id, u.username, sm.role, sm.joined_at
         FROM server_members sm
         INNER JOIN users u ON sm.user_id = u.id
         WHERE sm.server_id = $1
         ORDER BY sm.joined_at ASC",
    )
    .bind(server_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        eprintln!("❌ list_members: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(members))
}

// ==================== UPDATE ROLE ====================

pub async fn update_member_role(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path((server_id, target_user_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateMemberPayload>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let pool = &state.db;

    let caller_role = get_member_role(pool, user_id, server_id)
        .await
        .ok_or(StatusCode::FORBIDDEN)?;
    if caller_role != "owner" {
        return Err(StatusCode::FORBIDDEN);
    }

    let _target_role = get_member_role(pool, target_user_id, server_id)
        .await
        .ok_or(StatusCode::NOT_FOUND)?;

    let new_role = &payload.role;
    if !["admin", "member", "owner"].contains(&new_role.as_str()) {
        return Err(StatusCode::BAD_REQUEST);
    }

    // ── Transfert d'ownership ──
    if new_role == "owner" {
        let _ = sqlx::query(
            "UPDATE server_members SET role = 'admin' WHERE user_id = $1 AND server_id = $2",
        )
        .bind(user_id)
        .bind(server_id)
        .execute(pool)
        .await;

        let _ = sqlx::query(
            "UPDATE server_members SET role = 'owner' WHERE user_id = $1 AND server_id = $2",
        )
        .bind(target_user_id)
        .bind(server_id)
        .execute(pool)
        .await;

        let _ = sqlx::query("UPDATE servers SET owner_id = $1 WHERE id = $2")
            .bind(target_user_id)
            .bind(server_id)
            .execute(pool)
            .await;

        // ★ BROADCAST member_role_updated (transfert ownership)
        let ws_event = serde_json::json!({
            "type": "member_role_updated",
            "data": {
                "server_id": server_id.to_string(),
                "changes": [
                    { "user_id": user_id.to_string(), "new_role": "admin" },
                    { "user_id": target_user_id.to_string(), "new_role": "owner" }
                ]
            }
        });
        let _ = state.bus.send(ws_event.to_string());

        return Ok(Json(serde_json::json!({
            "message": "Ownership transferred",
            "new_owner": target_user_id.to_string()
        })));
    }

    // ── Changement de rôle normal ──
    if _target_role == "owner" {
        return Err(StatusCode::FORBIDDEN);
    }

    sqlx::query("UPDATE server_members SET role = $1 WHERE user_id = $2 AND server_id = $3")
        .bind(new_role)
        .bind(target_user_id)
        .bind(server_id)
        .execute(pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // ★ BROADCAST member_role_updated
    let ws_event = serde_json::json!({
        "type": "member_role_updated",
        "data": {
            "server_id": server_id.to_string(),
            "changes": [
                { "user_id": target_user_id.to_string(), "new_role": new_role }
            ]
        }
    });
    let _ = state.bus.send(ws_event.to_string());

    Ok(Json(serde_json::json!({
        "message": "Role updated",
        "user_id": target_user_id.to_string(),
        "new_role": new_role
    })))
}
// ==================== KICK ====================
 
pub async fn kick_member(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path((server_id, target_user_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, StatusCode> {
    let pool = &state.db;
 
    // 1. Vérifier que le caller est admin ou owner
    let caller_role = get_member_role(pool, user_id, server_id)
        .await
        .ok_or(StatusCode::FORBIDDEN)?;
    if !super::is_admin_or_owner(&caller_role) {
        return Err(StatusCode::FORBIDDEN);
    }
 
    // 2. Vérifier que la target est bien membre
    let target_role = get_member_role(pool, target_user_id, server_id)
        .await
        .ok_or(StatusCode::NOT_FOUND)?;
 
    // 3. Interdire de kicker l'owner
    if target_role == "owner" {
        return Err(StatusCode::FORBIDDEN);
    }
 
    // 4. Supprimer de server_members (= le kick)
    sqlx::query("DELETE FROM server_members WHERE user_id = $1 AND server_id = $2")
        .bind(target_user_id)
        .bind(server_id)
        .execute(pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
 
    // 5. Broadcast WS — Ladji s'occupe de l'event côté WS handler,
    //    on publie juste sur le bus
    let ws_event = serde_json::json!({
        "type": "member_kicked",
        "data": {
            "server_id": server_id.to_string(),
            "user_id": target_user_id.to_string(),
            "kicked_by": user_id.to_string()
        }
    });
    let _ = state.bus.send(ws_event.to_string());
 
    Ok(StatusCode::NO_CONTENT)
}
 
