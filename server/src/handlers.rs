//! HTTP Handlers - CRUD complet avec permissions
//! Responsable: Lucas (API core), adapté pour PostgreSQL

use axum::{
    extract::{Extension, Path, State},
    http::StatusCode,
    Json,
};
use uuid::Uuid;

use crate::models::*;
use crate::mongo;
use crate::AppState;

// ==================== HEALTH ====================

pub async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({"status": "ok"}))
}

// ==================== HELPERS ====================

/// Récupère le rôle d'un user dans un serveur
async fn get_member_role(pool: &sqlx::PgPool, user_id: Uuid, server_id: Uuid) -> Option<String> {
    sqlx::query_scalar::<_, String>(
        "SELECT role FROM server_members WHERE user_id = $1 AND server_id = $2",
    )
    .bind(user_id)
    .bind(server_id)
    .fetch_optional(pool)
    .await
    .ok()?
}

/// Vérifie si le user est au moins admin
fn is_admin_or_owner(role: &str) -> bool {
    role == "admin" || role == "owner"
}

/// Génère un code d'invitation aléatoire
fn generate_invite_code() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let chars: Vec<char> = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".chars().collect();
    (0..8)
        .map(|_| chars[rng.gen_range(0..chars.len())])
        .collect()
}

// ==================== SERVERS ====================

/// POST /servers - Créer un serveur (user authentifié devient owner)
pub async fn create_server(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Json(payload): Json<CreateServerPayload>,
) -> Result<(StatusCode, Json<Server>), StatusCode> {
    let pool = &state.db;
let name = payload.name.trim();
if name.is_empty() || name.len() > 100 {
    return Err(StatusCode::BAD_REQUEST);
}
    // Validation nom
    let name = payload.name.trim().to_string();
    if name.is_empty() || name.len() > 100 {
        return Err(StatusCode::BAD_REQUEST);
    }

    let invite_code = generate_invite_code();

    // Créer le serveur
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

    // Ajouter le créateur comme owner
    let _ = sqlx::query(
        "INSERT INTO server_members (user_id, server_id, role) VALUES ($1, $2, 'owner')",
    )
    .bind(user_id)
    .bind(server.id)
    .execute(pool)
    .await;

    // Créer le channel #general automatiquement
    let _ = sqlx::query("INSERT INTO channels (server_id, name) VALUES ($1, 'general')")
        .bind(server.id)
        .execute(pool)
        .await;

    Ok((StatusCode::CREATED, Json(server)))
}

/// GET /servers - Lister les serveurs de l'utilisateur connecté
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

/// GET /servers/:id - Détails d'un serveur
pub async fn get_server(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path(id): Path<Uuid>,
) -> Result<Json<Server>, StatusCode> {
    // Vérifier que le user est membre
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

/// PUT /servers/:id - Mettre à jour (owner/admin)
pub async fn update_server(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateServerPayload>,
) -> Result<Json<Server>, StatusCode> {
    let role = get_member_role(&state.db, user_id, id)
        .await
        .ok_or(StatusCode::FORBIDDEN)?;
    if !is_admin_or_owner(&role) {
        return Err(StatusCode::FORBIDDEN);
    }

    // Récupérer le serveur actuel
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

/// DELETE /servers/:id - Supprimer (owner only)
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
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

// ==================== JOIN / LEAVE ====================

/// POST /servers/:id/join - Rejoindre avec invite_code dans le body
pub async fn join_server(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path(server_id): Path<Uuid>,
    Json(payload): Json<JoinServerPayload>,
) -> Result<StatusCode, StatusCode> {
    let pool = &state.db;

    // Vérifier que le serveur existe et que le code est correct
    let server = sqlx::query_as::<_, Server>("SELECT * FROM servers WHERE id = $1")
        .bind(server_id)
        .fetch_optional(pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    if server.invite_code.as_deref() != Some(&payload.invite_code) {
        // Vérifier aussi dans la table invitations
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

        // Incrémenter le compteur d'utilisation
        let _ = sqlx::query(
            "UPDATE invitations SET uses = uses + 1 WHERE server_id = $1 AND code = $2",
        )
        .bind(server_id)
        .bind(&payload.invite_code)
        .execute(pool)
        .await;
    }

    // Vérifier si déjà membre
    let existing = get_member_role(pool, user_id, server_id).await;
    if existing.is_some() {
        return Err(StatusCode::CONFLICT);
    }

    // Ajouter comme member
    sqlx::query("INSERT INTO server_members (user_id, server_id, role) VALUES ($1, $2, 'member')")
        .bind(user_id)
        .bind(server_id)
        .execute(pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::OK)
}

/// POST /servers/join-by-code - Rejoindre un serveur avec juste le code d'invitation
pub async fn join_server_by_code(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Json(payload): Json<JoinServerPayload>,
) -> Result<Json<Server>, StatusCode> {
    let pool = &state.db;

    // Chercher le serveur par son invite_code
    let server = sqlx::query_as::<_, Server>("SELECT * FROM servers WHERE invite_code = $1")
        .bind(&payload.invite_code)
        .fetch_optional(pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Si pas trouvé dans servers, chercher dans la table invitations
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

            // Incrémenter le compteur
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

    // Vérifier si déjà membre
    let existing = get_member_role(pool, user_id, server.id).await;
    if existing.is_some() {
        return Err(StatusCode::CONFLICT);
    }

    // Ajouter comme member
    sqlx::query("INSERT INTO server_members (user_id, server_id, role) VALUES ($1, $2, 'member')")
        .bind(user_id)
        .bind(server.id)
        .execute(pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(server))
}

/// DELETE /servers/:id/leave - Quitter un serveur (owner interdit)
pub async fn leave_server(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path(server_id): Path<Uuid>,
) -> Result<StatusCode, StatusCode> {
    let role = get_member_role(&state.db, user_id, server_id)
        .await
        .ok_or(StatusCode::NOT_FOUND)?;

    // Owner ne peut PAS quitter son serveur
    if role == "owner" {
        return Err(StatusCode::FORBIDDEN);
    }

    sqlx::query("DELETE FROM server_members WHERE user_id = $1 AND server_id = $2")
        .bind(user_id)
        .bind(server_id)
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::NO_CONTENT)
}

// ==================== MEMBERS ====================

/// GET /servers/:id/members - Lister les membres
pub async fn list_members(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path(server_id): Path<Uuid>,
) -> Result<Json<Vec<MemberWithUser>>, StatusCode> {
    // Vérifier que le user est membre
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

/// PUT /servers/:id/members/:userId - Changer le rôle d'un membre (owner only)
pub async fn update_member_role(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path((server_id, target_user_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateMemberPayload>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let pool = &state.db;

    // Seul le owner peut changer les rôles
    let caller_role = get_member_role(pool, user_id, server_id)
        .await
        .ok_or(StatusCode::FORBIDDEN)?;
    if caller_role != "owner" {
        return Err(StatusCode::FORBIDDEN);
    }

    // Vérifier que la cible est membre
    let target_role = get_member_role(pool, target_user_id, server_id)
        .await
        .ok_or(StatusCode::NOT_FOUND)?;

    // Valider le nouveau rôle
    let new_role = &payload.role;
    if !["admin", "member"].contains(&new_role.as_str()) {
        return Err(StatusCode::BAD_REQUEST);
    }

    // Si on transfère la propriété
    if new_role == "owner" {
        // L'ancien owner devient admin
        let _ = sqlx::query(
            "UPDATE server_members SET role = 'admin' WHERE user_id = $1 AND server_id = $2",
        )
        .bind(user_id)
        .bind(server_id)
        .execute(pool)
        .await;

        // Le nouveau devient owner
        let _ = sqlx::query(
            "UPDATE server_members SET role = 'owner' WHERE user_id = $1 AND server_id = $2",
        )
        .bind(target_user_id)
        .bind(server_id)
        .execute(pool)
        .await;

        // Mettre à jour owner_id du serveur
        let _ = sqlx::query("UPDATE servers SET owner_id = $1 WHERE id = $2")
            .bind(target_user_id)
            .bind(server_id)
            .execute(pool)
            .await;

        return Ok(Json(serde_json::json!({
            "message": "Ownership transferred",
            "new_owner": target_user_id.to_string()
        })));
    }

    // On ne peut pas changer le rôle du owner
    if target_role == "owner" {
        return Err(StatusCode::FORBIDDEN);
    }

    sqlx::query("UPDATE server_members SET role = $1 WHERE user_id = $2 AND server_id = $3")
        .bind(new_role)
        .bind(target_user_id)
        .bind(server_id)
        .execute(pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(serde_json::json!({
        "message": "Role updated",
        "user_id": target_user_id.to_string(),
        "new_role": new_role
    })))
}

// ==================== CHANNELS ====================

/// POST /servers/:serverId/channels - Créer (admin/owner)
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

    Ok((StatusCode::CREATED, Json(channel)))
}

/// GET /servers/:serverId/channels - Lister
pub async fn list_channels(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path(server_id): Path<Uuid>,
) -> Result<Json<Vec<Channel>>, StatusCode> {
    // Vérifier membership
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

/// GET /channels/:id - Détails d'un channel
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

/// PUT /channels/:id - Mettre à jour (admin/owner)
pub async fn update_channel(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateChannelPayload>,
) -> Result<Json<Channel>, StatusCode> {
    // Trouver le serveur du channel
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

/// DELETE /channels/:id - Supprimer (admin/owner)
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

    let role = get_member_role(&state.db, user_id, channel.server_id)
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

    Ok(StatusCode::NO_CONTENT)
}

// ==================== INVITATIONS ====================

/// POST /servers/:id/invitations - Créer une invitation (admin/owner)
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

// ==================== MESSAGES (HTTP) ====================

/// POST /channels/:id/messages - Envoyer un message
pub async fn create_message_http(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path(channel_id): Path<Uuid>,
    Json(payload): Json<CreateMessagePayload>,
) -> Result<(StatusCode, Json<serde_json::Value>), StatusCode> {
    // Récupérer le username
    let user =
        sqlx::query_as::<_, UserPublic>("SELECT id, username, email FROM users WHERE id = $1")
            .bind(user_id)
            .fetch_optional(&state.db)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .ok_or(StatusCode::UNAUTHORIZED)?;

    // Validation contenu message
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

    // Broadcast via WebSocket
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

/// GET /channels/:id/messages - Historique des messages
#[derive(serde::Deserialize, Default)]
pub struct MessagesQuery {
    pub limit: Option<i64>,
    pub before: Option<i64>, // timestamp ms
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

/// DELETE /messages/:id - Supprimer un message
pub async fn delete_message_http(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    Path(message_id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    // Vérifier que le message existe et appartient au user (ou admin)
    let msg = mongo::get_message_by_id(&state.messages, &message_id)
        .await
        .ok_or(StatusCode::NOT_FOUND)?;

    let is_own_message = msg.user_id == user_id.to_string();

    if !is_own_message {
        // Vérifier si admin/owner du serveur du channel
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
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}
