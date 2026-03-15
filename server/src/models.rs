//! Models - Structs de données unifiées
//! Contributions: Lucas (API core), Ladji (messages), Zakary (auth)

use chrono::NaiveDateTime;
use mongodb::bson::{oid::ObjectId, DateTime as BsonDateTime};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

// ===================== USER =====================

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct UserPublic {
    pub id: Uuid,
    pub username: String,
    pub email: String,
}

#[derive(Debug, FromRow)]
pub struct UserLoginRow {
    pub id: Uuid,
    pub username: String,
    pub email: String,
    pub password_hash: String,
}

// ===================== SERVER =====================

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Server {
    pub id: Uuid,
    pub name: String,
    pub description: String,
    pub owner_id: Uuid,
    pub invite_code: Option<String>,
    pub created_at: Option<NaiveDateTime>,
}

#[derive(Debug, Deserialize)]
pub struct CreateServerPayload {
    pub name: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateServerPayload {
    pub name: Option<String>,
    pub description: Option<String>,
}

// ===================== CHANNEL =====================

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Channel {
    pub id: Uuid,
    pub server_id: Uuid,
    pub name: String,
    pub created_at: Option<NaiveDateTime>,
}

#[derive(Debug, Deserialize)]
pub struct CreateChannelPayload {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateChannelPayload {
    pub name: Option<String>,
}

// ===================== SERVER MEMBER =====================

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[allow(dead_code)]
pub struct ServerMember {
    pub id: Uuid,
    pub user_id: Uuid,
    pub server_id: Uuid,
    pub role: String,
    pub joined_at: Option<NaiveDateTime>,
}

/// Vue enrichie avec username pour l'affichage
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct MemberWithUser {
    pub user_id: Uuid,
    pub username: String,
    pub role: String,
    pub joined_at: Option<NaiveDateTime>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateMemberPayload {
    pub role: String,
}

#[derive(Debug, Deserialize)]
pub struct JoinServerPayload {
    pub invite_code: String,
}

// ===================== INVITATION =====================

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Invitation {
    pub id: Uuid,
    pub server_id: Uuid,
    pub code: String,
    pub created_by: Uuid,
    pub expires_at: Option<NaiveDateTime>,
    pub max_uses: Option<i32>,
    pub uses: i32,
    pub created_at: Option<NaiveDateTime>,
}

#[derive(Debug, Deserialize)]
pub struct CreateInvitationPayload {
    pub max_uses: Option<i32>,
    pub expires_in_hours: Option<i64>,
}

// ===================== MESSAGE (MongoDB) =====================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub channel_id: String,
    pub user_id: String,
    pub username: String,
    pub content: String,
    pub created_at: BsonDateTime,
    pub deleted: bool,
    /// "user" (défaut) ou "system" pour les messages d'événements serveur
    #[serde(default = "default_message_type")]
    pub message_type: String,
}

fn default_message_type() -> String {
    "user".to_string()
}

#[derive(Debug, Deserialize)]
pub struct CreateMessagePayload {
    pub content: String,
}

// ===================== AUTH =====================

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub exp: usize,
    pub iat: usize,
}

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: Option<String>,
    pub username: Option<String>,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: UserPublic,
}
