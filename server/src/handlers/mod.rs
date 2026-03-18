//! HTTP Handlers — Architecture modulaire
//! Responsable: Lucas (API core)
//!
//! Chaque sous-module gère un domaine métier :
//! - servers   : CRUD serveurs + join/leave
//! - channels  : CRUD channels
//! - members   : liste, rôles, (kick/ban en V2)
//! - messages  : envoi, historique, suppression
//! - invitations : création d'invitations
//! - health    : health check
pub use members::{ban_member, kick_member, list_bans, list_members, unban_member, update_member_role};
mod channels;
mod health;
mod invitations;
mod members;
mod messages;
mod servers;

// ============================================
// RE-EXPORTS — main.rs importe toujours handlers::create_server, etc.
// ============================================

pub use channels::{create_channel, delete_channel, get_channel, list_channels, update_channel};
pub use health::health;
pub use invitations::create_invitation;
pub use messages::{create_message_http, delete_message_http, list_messages};
pub use servers::{
    create_server, delete_server, get_server, join_server, join_server_by_code, leave_server,
    list_servers, update_server,
};

// ============================================
// HELPERS PARTAGÉS — utilisés par tous les sous-modules
// ============================================

use sqlx::PgPool;
use uuid::Uuid;

/// Récupère le rôle d'un membre dans un serveur
pub(crate) async fn get_member_role(
    pool: &PgPool,
    user_id: Uuid,
    server_id: Uuid,
) -> Option<String> {
    sqlx::query_scalar::<_, String>(
        "SELECT role FROM server_members WHERE user_id = $1 AND server_id = $2",
    )
    .bind(user_id)
    .bind(server_id)
    .fetch_optional(pool)
    .await
    .ok()?
}

/// Vérifie si un rôle est admin ou owner
pub(crate) fn is_admin_or_owner(role: &str) -> bool {
    role == "admin" || role == "owner"
}

/// Génère un code d'invitation aléatoire de 8 caractères
pub(crate) fn generate_invite_code() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let chars: Vec<char> = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".chars().collect();
    (0..8)
        .map(|_| chars[rng.gen_range(0..chars.len())])
        .collect()
}

/// Récupère le username d'un utilisateur
pub(crate) async fn get_username(pool: &PgPool, user_id: Uuid) -> String {
    sqlx::query_scalar::<_, String>("SELECT username FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .unwrap_or_else(|| "Unknown".to_string())
}
