//! WebSocket - Real-time communication
//! Responsable: Ladji, adapté avec auth JWT + filtrage par channel

use axum::{
    extract::{
        ws::{Message as WsMessage, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::IntoResponse,
};
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::auth::verify_jwt;
use crate::AppState;

pub type OnlineUsers = Arc<RwLock<HashSet<OnlineUser>>>;

#[derive(Debug, Clone, Hash, Eq, PartialEq, Serialize)]
pub struct OnlineUser {
    pub user_id: String,
    pub username: String,
}

#[derive(Debug, Deserialize)]
pub struct WsConnectQuery {
    pub token: String,
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(params): Query<WsConnectQuery>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let claims = match verify_jwt(&params.token, &state.auth_cfg) {
        Ok(c) => c,
        Err(_) => {
            return (axum::http::StatusCode::UNAUTHORIZED, "Invalid token").into_response();
        }
    };

    let user_id = match Uuid::parse_str(&claims.sub) {
        Ok(uid) => uid,
        Err(_) => {
            return (axum::http::StatusCode::UNAUTHORIZED, "Invalid user").into_response();
        }
    };

    let username = sqlx::query_scalar::<_, String>("SELECT username FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten()
        .unwrap_or_else(|| "Unknown".to_string());

    ws.on_upgrade(move |socket| handle_socket(socket, state, user_id.to_string(), username))
        .into_response()
}

async fn handle_socket(socket: WebSocket, state: AppState, user_id: String, username: String) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.bus.subscribe();

    let online_user = OnlineUser {
        user_id: user_id.clone(),
        username: username.clone(),
    };

    state.online_users.write().await.insert(online_user.clone());

    let online_event = serde_json::json!({
        "type": "user_online",
        "data": { "user_id": user_id, "username": username }
    });
    let _ = state.bus.send(online_event.to_string());

    let online_list: Vec<OnlineUser> = state.online_users.read().await.iter().cloned().collect();
    let list_event = serde_json::json!({
        "type": "online_users",
        "data": online_list
    });
    let _ = sender
        .send(WsMessage::Text(list_event.to_string().into()))
        .await;

    let bus = state.bus.clone();
    let user_id_clone = user_id.clone();
    let username_clone = username.clone();

    let mut send_task = tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(msg) => {
                    if sender.send(WsMessage::Text(msg.into())).await.is_err() {
                        break; // Client déconnecté
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                    // ★ FIX: Ne PAS crash — juste skip les messages manqués
                    eprintln!("[WS] ⚠️ Receiver lagged, missed {n} messages — continuing");
                    continue;
                }
                Err(_) => break, // Channel fermé
            }
        }
    });

    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                WsMessage::Text(text) => {
                    let text_str = text.to_string();
                    if let Ok(event) = serde_json::from_str::<serde_json::Value>(&text_str) {
                        let event_type = event.get("type").and_then(|t| t.as_str());

                        match event_type {
                            Some("new_message") => {
                                let channel_id = event
                                    .get("data")
                                    .and_then(|d| d.get("channel_id"))
                                    .and_then(|c| c.as_str())
                                    .unwrap_or("");
                                let content = event
                                    .get("data")
                                    .and_then(|d| d.get("content"))
                                    .and_then(|c| c.as_str())
                                    .unwrap_or("");

                                if !content.is_empty() {
                                    let saved = crate::mongo::create_message(
                                        &state.messages,
                                        channel_id.to_string(),
                                        user_id_clone.clone(),
                                        username_clone.clone(),
                                        content.to_string(),
                                    )
                                    .await;

                                    if let Some(msg) = saved {
                                        let broadcast_event = serde_json::json!({
                                            "type": "new_message",
                                            "data": {
                                                "id": msg.id.map(|id| id.to_hex()).unwrap_or_default(),
                                                "channel_id": channel_id,
                                                "user_id": user_id_clone,
                                                "username": username_clone,
                                                "content": content,
                                                "created_at": msg.created_at.to_string()
                                            }
                                        });
                                        let _ = bus.send(broadcast_event.to_string());
                                    }
                                }
                            }
                            Some("kick_member") => {
                                let server_id = event
                                    .get("data")
                                    .and_then(|d| d.get("server_id"))
                                    .and_then(|c| c.as_str())
                                    .unwrap_or("");
                                let target_user_id = event
                                    .get("data")
                                    .and_then(|d| d.get("user_id"))
                                    .and_then(|c| c.as_str())
                                    .unwrap_or("");
                                let reason = event
                                    .get("data")
                                    .and_then(|d| d.get("reason"))
                                    .and_then(|c| c.as_str())
                                    .unwrap_or("");

                                let kick_event = serde_json::json!({
                                    "type": "member_kicked",
                                    "data": {
                                        "server_id": server_id,
                                        "user_id": target_user_id,
                                        "reason": reason
                                    }
                                });
                                let _ = bus.send(kick_event.to_string());
                            }
                            Some("typing") | Some("user_typing") => {
                                let channel_id = event
                                    .get("data")
                                    .and_then(|d| d.get("channel_id"))
                                    .and_then(|c| c.as_str())
                                    .unwrap_or("");

                                let typing_event = serde_json::json!({
                                    "type": "user_typing",
                                    "data": {
                                        "user_id": user_id_clone,
                                        "username": username_clone,
                                        "channel_id": channel_id
                                    }
                                });
                                let _ = bus.send(typing_event.to_string());
                            }
                            Some("get_history") | Some("message_history") => {
                                let channel_id = event
                                    .get("data")
                                    .and_then(|d| d.get("channel_id"))
                                    .and_then(|c| c.as_str())
                                    .unwrap_or("");

                                let messages = crate::mongo::get_messages_by_channel(
                                    &state.messages,
                                    channel_id,
                                )
                                .await;

                                let history_event = serde_json::json!({
                                    "type": "message_history",
                                    "data": {
                                        "channel_id": channel_id,
                                        "messages": messages
                                    }
                                });
                                let _ = bus.send(history_event.to_string());
                            }
                            Some("kick_member") => {
                                let server_id = event
                                    .get("data")
                                    .and_then(|d| d.get("server_id"))
                                    .and_then(|c| c.as_str())
                                    .unwrap_or("");
                                let target_user_id = event
                                    .get("data")
                                    .and_then(|d| d.get("user_id"))
                                    .and_then(|c| c.as_str())
                                    .unwrap_or("");
                                let reason = event
                                    .get("data")
                                    .and_then(|d| d.get("reason"))
                                    .and_then(|c| c.as_str())
                                    .unwrap_or("");

                                let kick_event = serde_json::json!({
                                    "type": "member_kicked",
                                    "data": {
                                        "server_id": server_id,
                                        "user_id": target_user_id,
                                        "reason": reason
                                    }
                                });
                                let _ = bus.send(kick_event.to_string());
                            }
                            Some("dm_message") => {
                                let to_user_id = event
                                    .get("data")
                                    .and_then(|d| d.get("to_user_id"))
                                    .and_then(|c| c.as_str())
                                    .unwrap_or("");
                                let content = event
                                    .get("data")
                                    .and_then(|d| d.get("content"))
                                    .and_then(|c| c.as_str())
                                    .unwrap_or("");

                                let dm_event = serde_json::json!({
                                    "type": "dm_message",
                                    "data": {
                                        "from_user_id": user_id_clone,
                                        "from_username": username_clone,
                                        "to_user_id": to_user_id,
                                        "content": content
                                    }
                                });
                                let _ = bus.send(dm_event.to_string());
                            }
                            _ => {}
                        }
                    }
                }
                WsMessage::Close(_) => break,
                _ => {}
            }
        }
    });

    tokio::select! {
        _ = &mut send_task => recv_task.abort(),
        _ = &mut recv_task => send_task.abort(),
    }

    state.online_users.write().await.remove(&online_user);

    let offline_event = serde_json::json!({
        "type": "user_offline",
        "data": { "user_id": user_id, "username": username }
    });
    let _ = state.bus.send(offline_event.to_string());
}
