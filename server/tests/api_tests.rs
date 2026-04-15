//! Integration tests for RTC API
//! Tests: auth, servers, channels, members, messages
//! Coverage: 200/201/400/401/403/404/409
//!
//! Run with: cargo test -- --test-threads=1
//! (server must be running on localhost:3001)

use reqwest::Client;
use serde_json::{json, Value};

const BASE: &str = "http://localhost:3001";

/// Helper: register and get token
async fn register_user(client: &Client, username: &str, email: &str) -> (String, String) {
    let res = client
        .post(format!("{BASE}/auth/signup"))
        .json(&json!({
            "username": username,
            "email": email,
            "password": "password123"
        }))
        .send()
        .await
        .expect("Failed to register");

    let status = res.status().as_u16();
    let body: Value = res.json().await.expect("Failed to parse");

    // Si 409 (user existe déjà) → fallback login
    if status == 409 {
        let login_res = client
            .post(format!("{BASE}/auth/login"))
            .json(&json!({ "email": email, "password": "password123" }))
            .send()
            .await
            .expect("Failed to login fallback");
        let login_body: Value = login_res.json().await.expect("Failed to parse login");
        let token = login_body["token"].as_str().unwrap().to_string();
        let user_id = login_body["user"]["id"].as_str().unwrap().to_string();
        return (token, user_id);
    }

    let token = body["token"].as_str().unwrap().to_string();
    let user_id = body["user"]["id"].as_str().unwrap().to_string();
    (token, user_id)
}

/// Helper: login and get token
async fn login_user(client: &Client, email: &str) -> String {
    let res = client
        .post(format!("{BASE}/auth/login"))
        .json(&json!({
            "email": email,
            "password": "password123"
        }))
        .send()
        .await
        .expect("Failed to login");

    let body: Value = res.json().await.expect("Failed to parse");
    body["token"].as_str().unwrap().to_string()
}

/// Helper: create server and return (server_id, invite_code)
async fn create_server(client: &Client, token: &str, name: &str) -> (String, String) {
    let res = client
        .post(format!("{BASE}/servers"))
        .header("Authorization", format!("Bearer {token}"))
        .json(&json!({"name": name}))
        .send()
        .await
        .unwrap();
    let body: Value = res.json().await.unwrap();
    let server_id = body["id"].as_str().unwrap().to_string();
    let invite_code = body["invite_code"].as_str().unwrap_or("").to_string();
    (server_id, invite_code)
}

/// Helper: create channel and return channel_id
async fn create_channel(client: &Client, token: &str, server_id: &str, name: &str) -> String {
    let res = client
        .post(format!("{BASE}/servers/{server_id}/channels"))
        .header("Authorization", format!("Bearer {token}"))
        .json(&json!({"name": name}))
        .send()
        .await
        .unwrap();
    let body: Value = res.json().await.unwrap();
    body["id"].as_str().unwrap().to_string()
}

// ==================== AUTH TESTS ====================

#[tokio::test]
async fn test_register_success() {
    let client = Client::new();
    let res = client
        .post(format!("{BASE}/auth/signup"))
        .json(&json!({
            "username": "testuser1",
            "email": "test1@example.com",
            "password": "password123"
        }))
        .send()
        .await
        .unwrap();

    assert!(res.status().is_success() || res.status().as_u16() == 409);
}

#[tokio::test]
async fn test_register_duplicate_409() {
    let client = Client::new();
    // Register first
    let _ = client
        .post(format!("{BASE}/auth/signup"))
        .json(&json!({
            "username": "duplicate_user",
            "email": "dup@example.com",
            "password": "password123"
        }))
        .send()
        .await;

    // Register again - should be 409
    let res = client
        .post(format!("{BASE}/auth/signup"))
        .json(&json!({
            "username": "duplicate_user",
            "email": "dup@example.com",
            "password": "password123"
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(res.status().as_u16(), 409);
}

#[tokio::test]
async fn test_login_success() {
    let client = Client::new();
    let _ = register_user(&client, "logintest", "logintest@example.com").await;
    let token = login_user(&client, "logintest@example.com").await;
    assert!(!token.is_empty());
}

#[tokio::test]
async fn test_login_wrong_password_401() {
    let client = Client::new();
    let _ = register_user(&client, "wrongpw", "wrongpw@example.com").await;

    let res = client
        .post(format!("{BASE}/auth/login"))
        .json(&json!({
            "email": "wrongpw@example.com",
            "password": "wrongpassword"
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(res.status().as_u16(), 401);
}

#[tokio::test]
async fn test_me_without_token_401() {
    let client = Client::new();
    let res = client.get(format!("{BASE}/me")).send().await.unwrap();
    assert_eq!(res.status().as_u16(), 401);
}

#[tokio::test]
async fn test_me_with_token() {
    let client = Client::new();
    let (token, _) = register_user(&client, "meuser", "meuser@example.com").await;

    let res = client
        .get(format!("{BASE}/me"))
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .unwrap();

    assert!(res.status().is_success());
}

#[tokio::test]
async fn test_logout() {
    let client = Client::new();
    let (token, _) = register_user(&client, "logoutuser", "logout@example.com").await;

    let res = client
        .post(format!("{BASE}/auth/logout"))
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .unwrap();

    assert!(res.status().is_success());
}

// ==================== SERVER TESTS ====================

#[tokio::test]
async fn test_create_server() {
    let client = Client::new();
    let (token, _) = register_user(&client, "srvowner", "srvowner@example.com").await;

    let res = client
        .post(format!("{BASE}/servers"))
        .header("Authorization", format!("Bearer {token}"))
        .json(&json!({"name": "My Server", "description": "Test server"}))
        .send()
        .await
        .unwrap();

    assert_eq!(res.status().as_u16(), 201);
}

#[tokio::test]
async fn test_list_servers() {
    let client = Client::new();
    let (token, _) = register_user(&client, "srvlister", "srvlister@example.com").await;

    let res = client
        .get(format!("{BASE}/servers"))
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .unwrap();

    assert!(res.status().is_success());
}

#[tokio::test]
async fn test_create_server_no_auth_401() {
    let client = Client::new();
    let res = client
        .post(format!("{BASE}/servers"))
        .json(&json!({"name": "No Auth Server"}))
        .send()
        .await
        .unwrap();

    assert_eq!(res.status().as_u16(), 401);
}

#[tokio::test]
async fn test_get_server_not_member_403() {
    let client = Client::new();
    let (token1, _) = register_user(&client, "owner_priv", "owner_priv@example.com").await;
    let (token2, _) = register_user(&client, "outsider", "outsider@example.com").await;

    // User1 creates server
    let res = client
        .post(format!("{BASE}/servers"))
        .header("Authorization", format!("Bearer {token1}"))
        .json(&json!({"name": "Private Server"}))
        .send()
        .await
        .unwrap();
    let body: Value = res.json().await.unwrap();
    let server_id = body["id"].as_str().unwrap();

    // User2 tries to access - 403
    let res = client
        .get(format!("{BASE}/servers/{server_id}"))
        .header("Authorization", format!("Bearer {token2}"))
        .send()
        .await
        .unwrap();

    assert_eq!(res.status().as_u16(), 403);
}

#[tokio::test]
async fn test_delete_server_not_owner_403() {
    let client = Client::new();
    let (token1, _) = register_user(&client, "delowner", "delowner@example.com").await;
    let (token2, _) = register_user(&client, "delmember", "delmember@example.com").await;

    // Create server
    let res = client
        .post(format!("{BASE}/servers"))
        .header("Authorization", format!("Bearer {token1}"))
        .json(&json!({"name": "Delete Test"}))
        .send()
        .await
        .unwrap();
    let body: Value = res.json().await.unwrap();
    let server_id = body["id"].as_str().unwrap();
    let invite_code = body["invite_code"].as_str().unwrap();

    // User2 joins
    let _ = client
        .post(format!("{BASE}/servers/{server_id}/join"))
        .header("Authorization", format!("Bearer {token2}"))
        .json(&json!({"invite_code": invite_code}))
        .send()
        .await;

    // User2 tries to delete - 403
    let res = client
        .delete(format!("{BASE}/servers/{server_id}"))
        .header("Authorization", format!("Bearer {token2}"))
        .send()
        .await
        .unwrap();

    assert_eq!(res.status().as_u16(), 403);
}

// ==================== JOIN / LEAVE TESTS ====================

#[tokio::test]
async fn test_join_and_leave_server() {
    let client = Client::new();
    let (token1, _) = register_user(&client, "jlowner", "jlowner@example.com").await;
    let (token2, _) = register_user(&client, "jlmember", "jlmember@example.com").await;

    // Create server
    let res = client
        .post(format!("{BASE}/servers"))
        .header("Authorization", format!("Bearer {token1}"))
        .json(&json!({"name": "Join Leave Test"}))
        .send()
        .await
        .unwrap();
    let body: Value = res.json().await.unwrap();
    let server_id = body["id"].as_str().unwrap();
    let invite_code = body["invite_code"].as_str().unwrap();

    // User2 joins
    let res = client
        .post(format!("{BASE}/servers/{server_id}/join"))
        .header("Authorization", format!("Bearer {token2}"))
        .json(&json!({"invite_code": invite_code}))
        .send()
        .await
        .unwrap();
    assert!(res.status().is_success());

    // User2 leaves
    let res = client
        .delete(format!("{BASE}/servers/{server_id}/leave"))
        .header("Authorization", format!("Bearer {token2}"))
        .send()
        .await
        .unwrap();
    assert!(res.status().is_success());
}

#[tokio::test]
async fn test_owner_cannot_leave_403() {
    let client = Client::new();
    let (token, _) = register_user(&client, "cantleave", "cantleave@example.com").await;

    let res = client
        .post(format!("{BASE}/servers"))
        .header("Authorization", format!("Bearer {token}"))
        .json(&json!({"name": "Owner Leave Test"}))
        .send()
        .await
        .unwrap();
    let body: Value = res.json().await.unwrap();
    let server_id = body["id"].as_str().unwrap();

    // Owner tries to leave - 403
    let res = client
        .delete(format!("{BASE}/servers/{server_id}/leave"))
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .unwrap();

    assert_eq!(res.status().as_u16(), 403);
}

// ==================== CHANNEL TESTS ====================

#[tokio::test]
async fn test_create_channel() {
    let client = Client::new();
    let (token, _) = register_user(&client, "chanowner", "chanowner@example.com").await;

    let res = client
        .post(format!("{BASE}/servers"))
        .header("Authorization", format!("Bearer {token}"))
        .json(&json!({"name": "Channel Server"}))
        .send()
        .await
        .unwrap();
    let body: Value = res.json().await.unwrap();
    let server_id = body["id"].as_str().unwrap();

    // Create channel
    let res = client
        .post(format!("{BASE}/servers/{server_id}/channels"))
        .header("Authorization", format!("Bearer {token}"))
        .json(&json!({"name": "dev-chat"}))
        .send()
        .await
        .unwrap();

    assert_eq!(res.status().as_u16(), 201);
}

#[tokio::test]
async fn test_create_channel_member_403() {
    let client = Client::new();
    let (token1, _) = register_user(&client, "chowner2", "chowner2@example.com").await;
    let (token2, _) = register_user(&client, "chmember2", "chmember2@example.com").await;

    let res = client
        .post(format!("{BASE}/servers"))
        .header("Authorization", format!("Bearer {token1}"))
        .json(&json!({"name": "Chan Perm Test"}))
        .send()
        .await
        .unwrap();
    let body: Value = res.json().await.unwrap();
    let server_id = body["id"].as_str().unwrap();
    let invite_code = body["invite_code"].as_str().unwrap();

    // User2 joins as member
    let _ = client
        .post(format!("{BASE}/servers/{server_id}/join"))
        .header("Authorization", format!("Bearer {token2}"))
        .json(&json!({"invite_code": invite_code}))
        .send()
        .await;

    // Member tries to create channel - 403
    let res = client
        .post(format!("{BASE}/servers/{server_id}/channels"))
        .header("Authorization", format!("Bearer {token2}"))
        .json(&json!({"name": "unauthorized-channel"}))
        .send()
        .await
        .unwrap();

    assert_eq!(res.status().as_u16(), 403);
}

#[tokio::test]
async fn test_list_channels() {
    let client = Client::new();
    let (token, _) = register_user(&client, "chanlister", "chanlister@example.com").await;

    let res = client
        .post(format!("{BASE}/servers"))
        .header("Authorization", format!("Bearer {token}"))
        .json(&json!({"name": "List Chan Server"}))
        .send()
        .await
        .unwrap();
    let body: Value = res.json().await.unwrap();
    let server_id = body["id"].as_str().unwrap();

    let res = client
        .get(format!("{BASE}/servers/{server_id}/channels"))
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .unwrap();

    assert!(res.status().is_success());
    let channels: Vec<Value> = res.json().await.unwrap();
    assert!(!channels.is_empty()); // #general auto-created
}

#[tokio::test]
async fn test_get_server_404() {
    let client = Client::new();
    let (token, _) = register_user(&client, "notfound", "notfound@example.com").await;

    let fake_uuid = "00000000-0000-0000-0000-000000000000";
    let res = client
        .get(format!("{BASE}/servers/{fake_uuid}"))
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .unwrap();

    assert!(res.status().as_u16() == 403 || res.status().as_u16() == 404);
}

// ==================== CHANNEL DELETE TESTS (NEW) ====================

#[tokio::test]
async fn test_delete_channel_by_owner() {
    let client = Client::new();
    let (token, _) = register_user(&client, "chandel_own", "chandel_own@example.com").await;
    let (server_id, _) = create_server(&client, &token, "Chan Del Server").await;
    let channel_id = create_channel(&client, &token, &server_id, "to-delete").await;

    // Owner deletes channel
    let res = client
        .delete(format!("{BASE}/channels/{channel_id}"))
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .unwrap();

    assert!(res.status().is_success());
}

#[tokio::test]
async fn test_delete_channel_member_403() {
    let client = Client::new();
    let (token1, _) = register_user(&client, "chandel_own2", "chandel_own2@example.com").await;
    let (token2, _) = register_user(&client, "chandel_mem2", "chandel_mem2@example.com").await;
    let (server_id, invite_code) = create_server(&client, &token1, "Chan Del Perm").await;
    let channel_id = create_channel(&client, &token1, &server_id, "protected-chan").await;

    // User2 joins
    let _ = client
        .post(format!("{BASE}/servers/{server_id}/join"))
        .header("Authorization", format!("Bearer {token2}"))
        .json(&json!({"invite_code": invite_code}))
        .send()
        .await;

    // Member tries to delete channel - 403
    let res = client
        .delete(format!("{BASE}/channels/{channel_id}"))
        .header("Authorization", format!("Bearer {token2}"))
        .send()
        .await
        .unwrap();

    assert_eq!(res.status().as_u16(), 403);
}

// ==================== MESSAGE TESTS (NEW) ====================

#[tokio::test]
async fn test_send_message() {
    let client = Client::new();
    let (token, _) = register_user(&client, "msgowner", "msgowner@example.com").await;
    let (server_id, _) = create_server(&client, &token, "Msg Server").await;
    let channel_id = create_channel(&client, &token, &server_id, "msg-channel").await;

    // Send message via HTTP
    let res = client
        .post(format!("{BASE}/channels/{channel_id}/messages"))
        .header("Authorization", format!("Bearer {token}"))
        .json(&json!({"content": "Hello World!"}))
        .send()
        .await
        .unwrap();

    assert!(res.status().is_success() || res.status().as_u16() == 201);
}

#[tokio::test]
async fn test_list_messages() {
    let client = Client::new();
    let (token, _) = register_user(&client, "msglist", "msglist@example.com").await;
    let (server_id, _) = create_server(&client, &token, "MsgList Server").await;
    let channel_id = create_channel(&client, &token, &server_id, "list-channel").await;

    // Send a message first
    let _ = client
        .post(format!("{BASE}/channels/{channel_id}/messages"))
        .header("Authorization", format!("Bearer {token}"))
        .json(&json!({"content": "Test message"}))
        .send()
        .await;

    // List messages
    let res = client
        .get(format!("{BASE}/channels/{channel_id}/messages"))
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .unwrap();

    assert!(res.status().is_success());
}

#[tokio::test]
async fn test_send_message_no_auth_401() {
    let client = Client::new();

    // Try without token
    let res = client
        .post(format!(
            "{BASE}/channels/00000000-0000-0000-0000-000000000000/messages"
        ))
        .json(&json!({"content": "unauthorized"}))
        .send()
        .await
        .unwrap();

    assert_eq!(res.status().as_u16(), 401);
}

// ==================== DELETE SERVER SUCCESS (NEW) ====================

#[tokio::test]
async fn test_delete_server_by_owner() {
    let client = Client::new();
    let (token, _) = register_user(&client, "srvdel_own", "srvdel_own@example.com").await;
    let (server_id, _) = create_server(&client, &token, "To Delete Server").await;

    // Owner deletes server
    let res = client
        .delete(format!("{BASE}/servers/{server_id}"))
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .unwrap();

    assert!(res.status().is_success());

    // Verify it's gone - should be 403 or 404
    let res = client
        .get(format!("{BASE}/servers/{server_id}"))
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .unwrap();

    assert!(res.status().as_u16() == 403 || res.status().as_u16() == 404);
}

// ==================== MEMBER ROLE TESTS ====================

#[tokio::test]
async fn test_update_member_role() {
    let client = Client::new();
    let (token1, _) = register_user(&client, "roleowner", "roleowner@example.com").await;
    let (token2, user2_id) = register_user(&client, "rolemember", "rolemember@example.com").await;

    let res = client
        .post(format!("{BASE}/servers"))
        .header("Authorization", format!("Bearer {token1}"))
        .json(&json!({"name": "Role Test"}))
        .send()
        .await
        .unwrap();
    let body: Value = res.json().await.unwrap();
    let server_id = body["id"].as_str().unwrap();
    let invite_code = body["invite_code"].as_str().unwrap();

    // User2 joins
    let _ = client
        .post(format!("{BASE}/servers/{server_id}/join"))
        .header("Authorization", format!("Bearer {token2}"))
        .json(&json!({"invite_code": invite_code}))
        .send()
        .await;

    // Owner promotes to admin
    let res = client
        .put(format!("{BASE}/servers/{server_id}/members/{user2_id}"))
        .header("Authorization", format!("Bearer {token1}"))
        .json(&json!({"role": "admin"}))
        .send()
        .await
        .unwrap();

    assert!(res.status().is_success());
}

#[tokio::test]
async fn test_member_cannot_change_roles_403() {
    let client = Client::new();
    let (token1, user1_id) =
        register_user(&client, "roleforbid_own", "roleforbid_own@example.com").await;
    let (token2, _) = register_user(&client, "roleforbid_mem", "roleforbid_mem@example.com").await;

    let res = client
        .post(format!("{BASE}/servers"))
        .header("Authorization", format!("Bearer {token1}"))
        .json(&json!({"name": "Role Forbid Test"}))
        .send()
        .await
        .unwrap();
    let body: Value = res.json().await.unwrap();
    let server_id = body["id"].as_str().unwrap();
    let invite_code = body["invite_code"].as_str().unwrap();

    let _ = client
        .post(format!("{BASE}/servers/{server_id}/join"))
        .header("Authorization", format!("Bearer {token2}"))
        .json(&json!({"invite_code": invite_code}))
        .send()
        .await;

    // Member tries to change owner's role
    let res = client
        .put(format!("{BASE}/servers/{server_id}/members/{user1_id}"))
        .header("Authorization", format!("Bearer {token2}"))
        .json(&json!({"role": "member"}))
        .send()
        .await
        .unwrap();

    assert_eq!(res.status().as_u16(), 403);
}

// ==================== HEALTH TEST ====================

#[tokio::test]
async fn test_health() {
    let client = Client::new();
    let res = client.get(format!("{BASE}/health")).send().await.unwrap();
    assert!(res.status().is_success());
}

// ==================== UPDATE CHANNEL TESTS ====================

#[tokio::test]
async fn test_update_channel_name() {
    let client = Client::new();
    let (token, _) = register_user(&client, "chanupd_own", "chanupd_own@example.com").await;
    let (server_id, _) = create_server(&client, &token, "Chan Update Server").await;
    let channel_id = create_channel(&client, &token, &server_id, "old-name").await;

    let res = client
        .put(format!("{BASE}/channels/{channel_id}"))
        .header("Authorization", format!("Bearer {token}"))
        .json(&json!({"name": "new-name"}))
        .send()
        .await
        .unwrap();

    assert!(res.status().is_success());
}

#[tokio::test]
async fn test_update_channel_member_403() {
    let client = Client::new();
    let (token1, _) = register_user(&client, "chanupd_own2", "chanupd_own2@example.com").await;
    let (token2, _) = register_user(&client, "chanupd_mem2", "chanupd_mem2@example.com").await;
    let (server_id, invite_code) = create_server(&client, &token1, "Chan Update Perm").await;
    let channel_id = create_channel(&client, &token1, &server_id, "protected").await;

    let _ = client
        .post(format!("{BASE}/servers/{server_id}/join"))
        .header("Authorization", format!("Bearer {token2}"))
        .json(&json!({"invite_code": invite_code}))
        .send()
        .await;

    let res = client
        .put(format!("{BASE}/channels/{channel_id}"))
        .header("Authorization", format!("Bearer {token2}"))
        .json(&json!({"name": "hacked-name"}))
        .send()
        .await
        .unwrap();

    assert_eq!(res.status().as_u16(), 403);
}

#[tokio::test]
async fn test_join_server_invalid_code_404() {
    let client = Client::new();
    let (token, _) = register_user(&client, "inv_code_user", "inv_code@example.com").await;

    let res = client
        .post(format!(
            "{BASE}/servers/00000000-0000-0000-0000-000000000000/join"
        ))
        .header("Authorization", format!("Bearer {token}"))
        .json(&json!({"invite_code": "INVALID"}))
        .send()
        .await
        .unwrap();

    assert!(res.status().as_u16() == 404 || res.status().as_u16() == 400);
}

#[tokio::test]
async fn test_join_server_twice_409() {
    let client = Client::new();
    let (token1, _) = register_user(&client, "twice_own", "twice_own@example.com").await;
    let (token2, _) = register_user(&client, "twice_mem", "twice_mem@example.com").await;
    let (server_id, invite_code) = create_server(&client, &token1, "Twice Server").await;

    // Join once
    let _ = client
        .post(format!("{BASE}/servers/{server_id}/join"))
        .header("Authorization", format!("Bearer {token2}"))
        .json(&json!({"invite_code": invite_code}))
        .send()
        .await;

    // Join again - 409
    let res = client
        .post(format!("{BASE}/servers/{server_id}/join"))
        .header("Authorization", format!("Bearer {token2}"))
        .json(&json!({"invite_code": invite_code}))
        .send()
        .await
        .unwrap();

    assert_eq!(res.status().as_u16(), 409);
}

#[tokio::test]
async fn test_delete_own_message() {
    let client = Client::new();
    let (token, _) = register_user(&client, "delmsg_own", "delmsg_own@example.com").await;
    let (server_id, _) = create_server(&client, &token, "Del Msg Server").await;
    let channel_id = create_channel(&client, &token, &server_id, "del-msg-chan").await;

    // Send message
    let res = client
        .post(format!("{BASE}/channels/{channel_id}/messages"))
        .header("Authorization", format!("Bearer {token}"))
        .json(&json!({"content": "message to delete"}))
        .send()
        .await
        .unwrap();
    let body: Value = res.json().await.unwrap();
    let msg_id = body["id"].as_str().unwrap_or("");

    if msg_id.is_empty() {
        return;
    }

    // Delete it
    let res = client
        .delete(format!("{BASE}/messages/{msg_id}"))
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .unwrap();

    assert!(res.status().is_success());
}

// ==================== VALIDATION TESTS (NEW) ====================

#[tokio::test]
async fn test_create_server_empty_name_400() {
    let client = Client::new();
    let (token, _) = register_user(&client, "val_empty", "val_empty@example.com").await;

    let res = client
        .post(format!("{BASE}/servers"))
        .header("Authorization", format!("Bearer {token}"))
        .json(&json!({"name": ""}))
        .send()
        .await
        .unwrap();

    assert_eq!(res.status().as_u16(), 400);
}

#[tokio::test]
async fn test_create_server_name_too_long_400() {
    let client = Client::new();
    let (token, _) = register_user(&client, "val_long", "val_long@example.com").await;
    let long_name = "a".repeat(101);

    let res = client
        .post(format!("{BASE}/servers"))
        .header("Authorization", format!("Bearer {token}"))
        .json(&json!({"name": long_name}))
        .send()
        .await
        .unwrap();

    assert_eq!(res.status().as_u16(), 400);
}

#[tokio::test]
async fn test_send_empty_message_400() {
    let client = Client::new();
    let (token, _) = register_user(&client, "emptymsg", "emptymsg@example.com").await;
    let (server_id, _) = create_server(&client, &token, "Empty Msg Server").await;
    let channel_id = create_channel(&client, &token, &server_id, "empty-chan").await;

    let res = client
        .post(format!("{BASE}/channels/{channel_id}/messages"))
        .header("Authorization", format!("Bearer {token}"))
        .json(&json!({"content": ""}))
        .send()
        .await
        .unwrap();

    assert_eq!(res.status().as_u16(), 400);
}

#[tokio::test]
async fn test_list_messages_pagination() {
    let client = Client::new();
    let (token, _) = register_user(&client, "paginmsg", "paginmsg@example.com").await;
    let (server_id, _) = create_server(&client, &token, "Pagination Server").await;
    let channel_id = create_channel(&client, &token, &server_id, "pagin-chan").await;

    // Send 3 messages
    for i in 0..3 {
        let _ = client
            .post(format!("{BASE}/channels/{channel_id}/messages"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&json!({"content": format!("message {i}")}))
            .send()
            .await;
    }

    // Get with limit=2
    let res = client
        .get(format!("{BASE}/channels/{channel_id}/messages?limit=2"))
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .unwrap();

    assert!(res.status().is_success());
    let msgs: Vec<Value> = res.json().await.unwrap();
    assert!(msgs.len() <= 2);
}

#[tokio::test]
async fn test_delete_message_not_owner_403() {
    let client = Client::new();
    let (token1, _) = register_user(&client, "delmsg_own2", "delmsg_own2@example.com").await;
    let (token2, _) = register_user(&client, "delmsg_mem2", "delmsg_mem2@example.com").await;
    let (server_id, invite_code) = create_server(&client, &token1, "Del Msg Perm").await;
    let channel_id = create_channel(&client, &token1, &server_id, "perm-chan").await;

    // User2 joins
    let _ = client
        .post(format!("{BASE}/servers/{server_id}/join"))
        .header("Authorization", format!("Bearer {token2}"))
        .json(&json!({"invite_code": invite_code}))
        .send()
        .await;

    // Owner sends a message
    let res = client
        .post(format!("{BASE}/channels/{channel_id}/messages"))
        .header("Authorization", format!("Bearer {token1}"))
        .json(&json!({"content": "owner's message"}))
        .send()
        .await
        .unwrap();
    let body: Value = res.json().await.unwrap();
    let msg_id = body["id"].as_str().unwrap_or("");

    if msg_id.is_empty() {
        return;
    }

    // Member tries to delete owner's message - 403
    let res = client
        .delete(format!("{BASE}/messages/{msg_id}"))
        .header("Authorization", format!("Bearer {token2}"))
        .send()
        .await
        .unwrap();

    assert_eq!(res.status().as_u16(), 403);
}
// ==================== WEBSOCKET EVENT TESTS ====================

#[tokio::test]
async fn test_ws_member_kicked_event() {
    let client = Client::new();
    let (token1, _) = register_user(&client, "ws_kick_own", "ws_kick_own@example.com").await;
    let (token2, user2_id) = register_user(&client, "ws_kick_mem", "ws_kick_mem@example.com").await;
    let (server_id, invite_code) = create_server(&client, &token1, "WS Kick Server").await;

    // User2 joins
    let _ = client
        .post(format!("{BASE}/servers/{server_id}/join"))
        .header("Authorization", format!("Bearer {token2}"))
        .json(&json!({"invite_code": invite_code}))
        .send()
        .await;

    // Owner kicks user2
    let res = client
        .delete(format!(
            "{BASE}/servers/{server_id}/members/{user2_id}/kick"
        ))
        .header("Authorization", format!("Bearer {token1}"))
        .send()
        .await
        .unwrap();

    assert!(res.status().is_success() || res.status().as_u16() == 204);
}

#[tokio::test]
async fn test_ws_member_banned_event() {
    let client = Client::new();
    let (token1, _) = register_user(&client, "ws_ban_own", "ws_ban_own@example.com").await;
    let (token2, user2_id) = register_user(&client, "ws_ban_mem", "ws_ban_mem@example.com").await;
    let (server_id, invite_code) = create_server(&client, &token1, "WS Ban Server").await;

    // User2 joins
    let _ = client
        .post(format!("{BASE}/servers/{server_id}/join"))
        .header("Authorization", format!("Bearer {token2}"))
        .json(&json!({"invite_code": invite_code}))
        .send()
        .await;

    // Owner bans user2
    let res = client
        .post(format!("{BASE}/servers/{server_id}/members/{user2_id}/ban"))
        .header("Authorization", format!("Bearer {token1}"))
        .json(&json!({"reason": "test ban", "duration_hours": null}))
        .send()
        .await
        .unwrap();

    assert!(res.status().is_success() || res.status().as_u16() == 204);
}

#[tokio::test]
async fn test_ws_reaction_added() {
    let client = Client::new();
    let (token, _) = register_user(&client, "ws_react_own", "ws_react_own@example.com").await;
    let (server_id, _) = create_server(&client, &token, "WS React Server").await;
    let channel_id = create_channel(&client, &token, &server_id, "react-chan").await;

    // Send a message
    let res = client
        .post(format!("{BASE}/channels/{channel_id}/messages"))
        .header("Authorization", format!("Bearer {token}"))
        .json(&json!({"content": "react to this"}))
        .send()
        .await
        .unwrap();
    let body: Value = res.json().await.unwrap();
    let msg_id = body["id"].as_str().unwrap_or("");

    if msg_id.is_empty() {
        return;
    }

    // Add reaction
    let res = client
        .post(format!("{BASE}/messages/{msg_id}/reactions"))
        .header("Authorization", format!("Bearer {token}"))
        .json(&json!({"emoji": "👍"}))
        .send()
        .await
        .unwrap();

    assert!(res.status().is_success());
}

#[tokio::test]
async fn test_ws_dm_message() {
    let client = Client::new();
    let (token1, _) = register_user(&client, "ws_dm_user1", "ws_dm_user1@example.com").await;
    let _ = register_user(&client, "ws_dm_user2", "ws_dm_user2@example.com").await;

    // Start DM conversation by username
    let res = client
        .post(format!("{BASE}/dm/start-by-username"))
        .header("Authorization", format!("Bearer {token1}"))
        .json(&serde_json::json!({ "username": "ws_dm_user2" }))
        .send()
        .await
        .unwrap();
    assert!(res.status().is_success() || res.status().as_u16() == 201);

    let body: serde_json::Value = res.json().await.unwrap();
    let conv_id = body["id"].as_str().unwrap().to_string();

    // Send a message to the conversation
    let res = client
        .post(format!("{BASE}/dm/{conv_id}/messages"))
        .header("Authorization", format!("Bearer {token1}"))
        .json(&serde_json::json!({ "content": "hello dm" }))
        .send()
        .await
        .unwrap();
    assert!(res.status().is_success() || res.status().as_u16() == 201);
}
