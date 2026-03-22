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
// ==================== BAN ====================

#[derive(serde::Deserialize)]
pub struct BanPayload {
    pub reason: Option<String>,
    pub duration_hours: Option<i64>,
}

pub async fn ban_member(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path((server_id, target_user_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<BanPayload>,
) -> Result<StatusCode, StatusCode> {
    let pool = &state.db;

    // 1. Vérifier que le caller est admin ou owner
    let caller_role = get_member_role(pool, user_id, server_id)
        .await
        .ok_or(StatusCode::FORBIDDEN)?;
    if !super::is_admin_or_owner(&caller_role) {
        return Err(StatusCode::FORBIDDEN);
    }

    // 2. Vérifier que la target est membre et pas owner
    let target_role = get_member_role(pool, target_user_id, server_id)
        .await
        .ok_or(StatusCode::NOT_FOUND)?;
    if target_role == "owner" {
        return Err(StatusCode::FORBIDDEN);
    }

    // 3. Calculer expires_at si durée fournie
    let expires_at = payload.duration_hours.map(|h| {
        (chrono::Utc::now() + chrono::Duration::hours(h)).naive_utc()
    });

    // 4. Insérer dans server_bans
    sqlx::query(
        "INSERT INTO server_bans (server_id, user_id, banned_by, reason, expires_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (server_id, user_id) DO UPDATE
         SET reason = $4, expires_at = $5, banned_by = $3",
    )
    .bind(server_id)
    .bind(target_user_id)
    .bind(user_id)
    .bind(payload.reason.unwrap_or_default())
    .bind(expires_at)
    .execute(pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // 5. Supprimer de server_members
    sqlx::query("DELETE FROM server_members WHERE user_id = $1 AND server_id = $2")
        .bind(target_user_id)
        .bind(server_id)
        .execute(pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // 6. Broadcast WS
    let ws_event = serde_json::json!({
        "type": "member_banned",
        "data": {
            "server_id": server_id.to_string(),
            "user_id": target_user_id.to_string(),
            "banned_by": user_id.to_string(),
            "expires_at": expires_at.map(|dt| dt.to_string())
        }
    });
    let _ = state.bus.send(ws_event.to_string());

    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_bans(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path(server_id): Path<Uuid>,
) -> Result<Json<Vec<serde_json::Value>>, StatusCode> {
    let pool = &state.db;

    let caller_role = get_member_role(pool, user_id, server_id)
        .await
        .ok_or(StatusCode::FORBIDDEN)?;
    if !super::is_admin_or_owner(&caller_role) {
        return Err(StatusCode::FORBIDDEN);
    }

    #[derive(sqlx::FromRow)]
    struct BanRow {
        user_id: uuid::Uuid,
        username: String,
        reason: Option<String>,
        expires_at: Option<chrono::NaiveDateTime>,
        created_at: Option<chrono::NaiveDateTime>,
    }

    let bans = sqlx::query_as::<_, BanRow>(
        "SELECT sb.user_id, sb.reason, sb.expires_at, sb.created_at, u.username
         FROM server_bans sb
         INNER JOIN users u ON sb.user_id = u.id
         WHERE sb.server_id = $1
         ORDER BY sb.created_at DESC",
    )
    .bind(server_id)
    .fetch_all(pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let result: Vec<serde_json::Value> = bans.iter().map(|b| serde_json::json!({
        "user_id": b.user_id.to_string(),
        "username": b.username,
        "reason": b.reason,
        "expires_at": b.expires_at.map(|dt| dt.to_string()),
        "created_at": b.created_at.map(|dt| dt.to_string()),
    })).collect();

    Ok(Json(result))
}

pub async fn unban_member(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path((server_id, target_user_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, StatusCode> {
    let pool = &state.db;

    let caller_role = get_member_role(pool, user_id, server_id)
        .await
        .ok_or(StatusCode::FORBIDDEN)?;
    if !super::is_admin_or_owner(&caller_role) {
        return Err(StatusCode::FORBIDDEN);
    }

    sqlx::query(
        "DELETE FROM server_bans WHERE server_id = $1 AND user_id = $2",
    )
    .bind(server_id)
    .bind(target_user_id)
    .execute(pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::NO_CONTENT)
}
