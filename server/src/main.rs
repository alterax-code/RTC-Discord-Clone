//! RTC - Real Time Chat Application
//! Backend Rust + Axum
//! Équipe: Zakary (auth/db), Lucas (API core), Ladji (WS), Noémi (front)

use axum::{
    routing::{delete, get, post, put},
    Router,
};
use mongodb::Collection;
use sqlx::PgPool;
use std::collections::HashSet;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use tower_http::cors::{Any, CorsLayer};

mod auth;
mod db;
mod handlers;
mod middleware;
mod models;
mod mongo;
mod websocket;

use auth::AuthConfig;
use models::Message;
use websocket::OnlineUsers;

/// État partagé de l'application
#[derive(Clone)]
pub struct AppState {
    /// PostgreSQL pool
    pub db: PgPool,
    /// MongoDB messages collection
    pub messages: Collection<Message>,
    /// Broadcast channel pour WebSocket
    pub bus: broadcast::Sender<String>,
    /// Configuration JWT
    pub auth_cfg: AuthConfig,
    /// Users connectés en temps réel
    pub online_users: OnlineUsers,
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    // Connexions aux bases de données
    let pool = db::create_pool()
        .await
        .expect("❌ Failed to connect to PostgreSQL");
    db::test_connection(&pool)
        .await
        .expect("❌ PostgreSQL test failed");

    // Exécuter la migration (statement par statement)
    let migration_sql = include_str!("../migrations/001_users.sql");
    for statement in migration_sql.split(';') {
        let trimmed = statement.trim();
        if !trimmed.is_empty() {
            sqlx::query(trimmed)
                .execute(&pool)
                .await
                .expect("❌ Migration failed");
        }
    }
    println!("✅ SQL migration applied!");

    db::assert_schema(&pool).await.ok();

    let messages_collection = mongo::init_mongo().await;

    // Broadcast channel (capacité 1024 messages)
    let (bus, _) = broadcast::channel::<String>(1024);

    let auth_cfg = AuthConfig::from_env();

    let state = AppState {
        db: pool,
        messages: messages_collection,
        bus,
        auth_cfg,
        online_users: Arc::new(RwLock::new(HashSet::new())),
    };

    // Routes publiques (pas besoin d'auth)
    let public_routes = Router::new()
        .route("/health", get(handlers::health))
        .route("/auth/signup", post(auth::register_handler))
        .route("/auth/login", post(auth::login_handler))
        .route("/ws", get(websocket::ws_handler));

    // Routes protégées (auth requise)
    let protected_routes = Router::new()
        // Auth
        .route("/auth/logout", post(auth::logout_handler))
        .route("/me", get(auth::me_handler))
        // Servers
        .route("/servers", post(handlers::create_server))
        .route("/servers", get(handlers::list_servers))
        .route("/servers/{id}", get(handlers::get_server))
        .route("/servers/{id}", put(handlers::update_server))
        .route("/servers/{id}", delete(handlers::delete_server))
        // Join / Leave
        .route("/servers/join-by-code", post(handlers::join_server_by_code))
        .route("/servers/{id}/join", post(handlers::join_server))
        .route("/servers/{id}/leave", delete(handlers::leave_server))
        // Members
        .route("/servers/{id}/members", get(handlers::list_members))
        .route(
            "/servers/{id}/members/{userId}",
            put(handlers::update_member_role),
        )
        // Channels
        .route(
            "/servers/{serverId}/channels",
            post(handlers::create_channel),
        )
        .route("/servers/{serverId}/channels", get(handlers::list_channels))
        .route("/channels/{id}", get(handlers::get_channel))
        .route("/channels/{id}", put(handlers::update_channel))
        .route("/channels/{id}", delete(handlers::delete_channel))
        // Invitations
        .route(
            "/servers/{id}/invitations",
            post(handlers::create_invitation),
        )
        // Messages (HTTP)
        .route(
            "/channels/{id}/messages",
            post(handlers::create_message_http),
        )
        .route("/channels/{id}/messages", get(handlers::list_messages))
        .route("/messages/{id}", delete(handlers::delete_message_http))
        // Middleware auth
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            crate::middleware::require_auth,
        ));

    // CORS
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        .layer(cors)
        .with_state(state);

    let port = std::env::var("SERVER_PORT").unwrap_or_else(|_| "3000".to_string());
    let addr = format!("0.0.0.0:{port}");
    println!("🚀 RTC Server running on http://{addr}");

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
