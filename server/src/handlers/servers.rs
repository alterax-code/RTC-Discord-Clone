//! Serveurs — CRUD + join/leave

use axum::{
    extract::{Extension, Path, State},
    http::StatusCode,
    Json,
};
use uuid::Uuid;

use crate::models::*;
use crate::AppState;
use super::{generate_invite_code, get_member_role, get_username};

// ==================== CREATE ====================

pub async fn create_server(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Json(payload): Json<CreateServerPayload>,
) -> Result<(StatusCode, Json<Server>), StatusCode> {
    let pool = &state.db;
    let name = payload.name.trim().to_string();
    if name.is_empty() || name.len() > 100 {
        return Err(StatusCode::BAD_REQUEST);
    }

    let invite_code = generate_invite_code();

    let server = sqlx::query_as::<_, Server>(
        "INSERT INTO servers (name, description, owner_id, invite_code) VALUES ($1, $2, $3, $4) RETURNING *",
    )
    .bind(&name)
    .bind(&payload.description)
    .bind(user_id)
    .bind(&invite_code)
    .fetch_one(pool)
    .await
    .map_err(|e| {
        eprintln!("❌ create_server: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let _ = sqlx::query(
        "INSERT INTO server_members (user_id, server_id, role) VALUES ($1, $2, 'owner')",
    )
    .bind(user_id)
    .bind(server.id)
    .execute(pool)
    .await;

    let _ = sqlx::query("INSERT INTO channels (server_id, name) VALUES ($1, 'general')")
        .bind(server.id)
        .execute(pool)
        .await;

    Ok((StatusCode::CREATED, Json(server)))
}

// ==================== LIST ====================

pub async fn list_servers(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
) -> Result<Json<Vec<Server>>, StatusCode> {
    let servers = sqlx::query_as::<_, Server>(
        "SELECT s.* FROM servers s
         INNER JOIN server_members sm ON s.id = sm.server_id
         WHERE sm.user_id = $1
         ORDER BY s.created_at DESC",
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        eprintln!("❌ list_servers: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(servers))
}

// ==================== GET ====================

pub async fn get_server(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path(id): Path<Uuid>,
) -> Result<Json<Server>, StatusCode> {
    let role = get_member_role(&state.db, user_id, id).await;
    if role.is_none() {
        return Err(StatusCode::FORBIDDEN);
    }

    sqlx::query_as::<_, Server>("SELECT * FROM servers WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .map(Json)
        .ok_or(StatusCode::NOT_FOUND)
}

// ==================== UPDATE ====================

pub async fn update_server(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateServerPayload>,
) -> Result<Json<Server>, StatusCode> {
    let role = get_member_role(&state.db, user_id, id)
        .await
        .ok_or(StatusCode::FORBIDDEN)?;
    if !super::is_admin_or_owner(&role) {
        return Err(StatusCode::FORBIDDEN);
    }

    let current = sqlx::query_as::<_, Server>("SELECT * FROM servers WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let new_name = payload.name.unwrap_or(current.name);
    let new_desc = payload.description.unwrap_or(current.description);

    let server = sqlx::query_as::<_, Server>(
        "UPDATE servers SET name = $1, description = $2 WHERE id = $3 RETURNING *",
    )
    .bind(&new_name)
    .bind(&new_desc)
    .bind(id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(server))
}

// ==================== DELETE ====================

pub async fn delete_server(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, StatusCode> {
    let role = get_member_role(&state.db, user_id, id)
        .await
        .ok_or(StatusCode::FORBIDDEN)?;
    if role != "owner" {
        return Err(StatusCode::FORBIDDEN);
    }

    let result = sqlx::query("DELETE FROM servers WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if result.rows_affected() > 0 {
        // ★ BROADCAST server_deleted — tous les clients WS connectés seront notifiés
        let ws_event = serde_json::json!({
            "type": "server_deleted",
            "data": {
                "server_id": id.to_string(),
                "deleted_by": user_id.to_string()
            }
        });
        let _ = state.bus.send(ws_event.to_string());

        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

// ==================== JOIN ====================

pub async fn join_server(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path(server_id): Path<Uuid>,
    Json(payload): Json<JoinServerPayload>,
) -> Result<StatusCode, StatusCode> {
    let pool = &state.db;

    let server = sqlx::query_as::<_, Server>("SELECT * FROM servers WHERE id = $1")
        .bind(server_id)
        .fetch_optional(pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    if server.invite_code.as_deref() != Some(&payload.invite_code) {
        let invitation = sqlx::query_as::<_, Invitation>(
            "SELECT * FROM invitations WHERE server_id = $1 AND code = $2",
        )
        .bind(server_id)
        .bind(&payload.invite_code)
        .fetch_optional(pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        if invitation.is_none() {
            return Err(StatusCode::FORBIDDEN);
        }

        let _ = sqlx::query(
            "UPDATE invitations SET uses = uses + 1 WHERE server_id = $1 AND code = $2",
        )
        .bind(server_id)
        .bind(&payload.invite_code)
        .execute(pool)
        .await;
    }

    let existing = get_member_role(pool, user_id, server_id).await;
    if existing.is_some() {
        return Err(StatusCode::CONFLICT);
    }

    sqlx::query("INSERT INTO server_members (user_id, server_id, role) VALUES ($1, $2, 'member')")
        .bind(user_id)
        .bind(server_id)
        .execute(pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // ★ BROADCAST member_joined
    let username = get_username(pool, user_id).await;
    let ws_event = serde_json::json!({
        "type": "member_joined",
        "data": {
            "server_id": server_id.to_string(),
            "user_id": user_id.to_string(),
            "username": username,
            "role": "member"
        }
    });
    let _ = state.bus.send(ws_event.to_string());

    Ok(StatusCode::OK)
}

// ==================== JOIN BY CODE ====================

pub async fn join_server_by_code(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Json(payload): Json<JoinServerPayload>,
) -> Result<Json<Server>, StatusCode> {
    let pool = &state.db;

    let server = sqlx::query_as::<_, Server>("SELECT * FROM servers WHERE invite_code = $1")
        .bind(&payload.invite_code)
        .fetch_optional(pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let server = match server {
        Some(s) => s,
        None => {
            let invitation =
                sqlx::query_as::<_, Invitation>("SELECT * FROM invitations WHERE code = $1")
                    .bind(&payload.invite_code)
                    .fetch_optional(pool)
                    .await
                    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
                    .ok_or(StatusCode::NOT_FOUND)?;

            let _ = sqlx::query("UPDATE invitations SET uses = uses + 1 WHERE code = $1")
                .bind(&payload.invite_code)
                .execute(pool)
                .await;

            sqlx::query_as::<_, Server>("SELECT * FROM servers WHERE id = $1")
                .bind(invitation.server_id)
                .fetch_one(pool)
                .await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        }
    };

    let existing = get_member_role(pool, user_id, server.id).await;
    if existing.is_some() {
        return Err(StatusCode::CONFLICT);
    }

    sqlx::query("INSERT INTO server_members (user_id, server_id, role) VALUES ($1, $2, 'member')")
        .bind(user_id)
        .bind(server.id)
        .execute(pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // ★ BROADCAST member_joined
    let username = get_username(pool, user_id).await;
    let ws_event = serde_json::json!({
        "type": "member_joined",
        "data": {
            "server_id": server.id.to_string(),
            "user_id": user_id.to_string(),
            "username": username,
            "role": "member"
        }
    });
    let _ = state.bus.send(ws_event.to_string());

    Ok(Json(server))
}

// ==================== LEAVE ====================

pub async fn leave_server(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path(server_id): Path<Uuid>,
) -> Result<StatusCode, StatusCode> {
    let role = get_member_role(&state.db, user_id, server_id)
        .await
        .ok_or(StatusCode::NOT_FOUND)?;

    if role == "owner" {
        return Err(StatusCode::FORBIDDEN);
    }

    sqlx::query("DELETE FROM server_members WHERE user_id = $1 AND server_id = $2")
        .bind(user_id)
        .bind(server_id)
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // ★ BROADCAST member_left
    let ws_event = serde_json::json!({
        "type": "member_left",
        "data": {
            "server_id": server_id.to_string(),
            "user_id": user_id.to_string()
        }
    });
    let _ = state.bus.send(ws_event.to_string());

    Ok(StatusCode::NO_CONTENT)
}
