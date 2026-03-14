//! Authentication - JWT + register/login
//! Responsable: Zakary

use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use rand_core::OsRng;
use sqlx::PgPool;
use uuid::Uuid;

use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};

use std::env;

use crate::models::*;
use crate::AppState;

// ==================== Config ====================

#[derive(Clone)]
pub struct AuthConfig {
    pub jwt_secret: String,
    pub exp_minutes: i64,
}

impl AuthConfig {
    pub fn from_env() -> Self {
        let jwt_secret = env::var("JWT_SECRET").expect("JWT_SECRET must be set");
        let exp_minutes = env::var("JWT_EXP_MINUTES")
            .ok()
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(60);

        Self {
            jwt_secret,
            exp_minutes,
        }
    }
}

// ==================== Errors ====================

#[derive(thiserror::Error, Debug)]
pub enum AuthError {
    #[error("bad request")]
    BadRequest,
    #[error("unauthorized")]
    Unauthorized,
    #[error("conflict")]
    Conflict,
    #[error("internal error")]
    Internal,
}

impl IntoResponse for AuthError {
    fn into_response(self) -> axum::response::Response {
        let (status, msg) = match self {
            AuthError::BadRequest => (StatusCode::BAD_REQUEST, "Bad request"),
            AuthError::Unauthorized => (StatusCode::UNAUTHORIZED, "Unauthorized"),
            AuthError::Conflict => (StatusCode::CONFLICT, "Already exists"),
            AuthError::Internal => (StatusCode::INTERNAL_SERVER_ERROR, "Internal error"),
        };
        (status, Json(serde_json::json!({ "error": msg }))).into_response()
    }
}

// ==================== JWT ====================

pub fn create_jwt(user_id: Uuid, config: &AuthConfig) -> Result<String, AuthError> {
    let now = Utc::now();
    let exp = now + Duration::minutes(config.exp_minutes);

    let claims = Claims {
        sub: user_id.to_string(),
        iat: now.timestamp() as usize,
        exp: exp.timestamp() as usize,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(config.jwt_secret.as_bytes()),
    )
    .map_err(|_| AuthError::Internal)
}

pub fn verify_jwt(token: &str, config: &AuthConfig) -> Result<Claims, AuthError> {
    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(config.jwt_secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|_| AuthError::Unauthorized)?;

    Ok(data.claims)
}

// ==================== Password (Argon2) ====================

pub fn hash_password(password: &str) -> Result<String, AuthError> {
    if password.trim().len() < 6 {
        return Err(AuthError::BadRequest);
    }

    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();

    argon2
        .hash_password(password.as_bytes(), &salt)
        .map(|ph| ph.to_string())
        .map_err(|_| AuthError::Internal)
}

pub fn verify_password(password: &str, password_hash: &str) -> Result<(), AuthError> {
    let parsed = PasswordHash::new(password_hash).map_err(|_| AuthError::Internal)?;
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .map_err(|_| AuthError::Unauthorized)
}

// ==================== DB Helpers ====================

async fn user_exists(pool: &PgPool, username: &str, email: &str) -> Result<bool, AuthError> {
    let count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*)::bigint FROM public.users WHERE username = $1 OR email = $2",
    )
    .bind(username)
    .bind(email)
    .fetch_one(pool)
    .await
    .map_err(|e| {
        eprintln!("❌ user_exists SQL error: {e:?}");
        AuthError::Internal
    })?;

    Ok(count > 0)
}

async fn insert_user(
    pool: &PgPool,
    username: &str,
    email: &str,
    password_hash: &str,
) -> Result<UserPublic, AuthError> {
    sqlx::query_as::<_, UserPublic>(
        "INSERT INTO public.users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email",
    )
    .bind(username)
    .bind(email)
    .bind(password_hash)
    .fetch_one(pool)
    .await
    .map_err(|e| {
        eprintln!("❌ insert_user SQL error: {e:?}");
        if let sqlx::Error::Database(db_err) = &e {
            if db_err.code().as_deref() == Some("23505") {
                return AuthError::Conflict;
            }
        }
        AuthError::Internal
    })
}

async fn find_user_for_login(
    pool: &PgPool,
    email: Option<&str>,
    username: Option<&str>,
) -> Result<UserLoginRow, AuthError> {
    let rec = if let Some(email) = email {
        sqlx::query_as::<_, UserLoginRow>(
            "SELECT id, username, email, password_hash FROM public.users WHERE email = $1",
        )
        .bind(email)
        .fetch_optional(pool)
        .await
    } else if let Some(username) = username {
        sqlx::query_as::<_, UserLoginRow>(
            "SELECT id, username, email, password_hash FROM public.users WHERE username = $1",
        )
        .bind(username)
        .fetch_optional(pool)
        .await
    } else {
        return Err(AuthError::BadRequest);
    };

    rec.map_err(|e| {
        eprintln!("❌ find_user SQL error: {e:?}");
        AuthError::Internal
    })?
    .ok_or(AuthError::Unauthorized)
}

pub async fn get_user_public(pool: &PgPool, user_id: Uuid) -> Result<UserPublic, AuthError> {
    sqlx::query_as::<_, UserPublic>("SELECT id, username, email FROM public.users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| {
            eprintln!("❌ get_user_public SQL error: {e:?}");
            AuthError::Internal
        })?
        .ok_or(AuthError::Unauthorized)
}

// ==================== Handlers ====================

pub async fn register_handler(
    State(state): State<AppState>,
    Json(payload): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, AuthError> {
    let pool = &state.db;
    let config = &state.auth_cfg;

    let username = payload.username.trim();
    let email = payload.email.trim().to_lowercase();

    if username.is_empty() || email.is_empty() {
        return Err(AuthError::BadRequest);
    }

    if user_exists(pool, username, &email).await? {
        return Err(AuthError::Conflict);
    }

    let pw_hash = hash_password(&payload.password)?;
    let user = insert_user(pool, username, &email, &pw_hash).await?;
    let token = create_jwt(user.id, config)?;

    // Update last_active_at
    let _ = sqlx::query("UPDATE public.users SET last_active_at = NOW() WHERE id = $1")
        .bind(user.id)
        .execute(pool)
        .await;

    Ok(Json(AuthResponse { token, user }))
}

pub async fn login_handler(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, AuthError> {
    let pool = &state.db;
    let config = &state.auth_cfg;

    let email = payload
        .email
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());
    let username = payload
        .username
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());

    let rec = find_user_for_login(pool, email, username).await?;
    verify_password(&payload.password, &rec.password_hash)?;

    let user = UserPublic {
        id: rec.id,
        username: rec.username,
        email: rec.email,
    };

    let token = create_jwt(user.id, config)?;

    // Update last_active_at
    let _ = sqlx::query("UPDATE public.users SET last_active_at = NOW() WHERE id = $1")
        .bind(user.id)
        .execute(pool)
        .await;

    Ok(Json(AuthResponse { token, user }))
}

/// POST /auth/logout - Invalider le token (côté client)
pub async fn logout_handler() -> Json<serde_json::Value> {
    // JWT stateless : le client supprime le token
    // On pourrait implémenter une blacklist mais c'est overkill
    Json(serde_json::json!({ "message": "Logged out successfully" }))
}

/// GET /me - Obtenir les infos de l'utilisateur connecté
pub async fn me_handler(
    State(state): State<AppState>,
    axum::extract::Extension(user_id): axum::extract::Extension<Uuid>,
) -> Result<Json<UserPublic>, AuthError> {
    let user = get_user_public(&state.db, user_id).await?;
    Ok(Json(user))
}
