//! Database connections - PostgreSQL
//! Responsable: Zakary

use sqlx::postgres::PgPoolOptions;
use sqlx::{PgPool, Row};
use std::env;

/// Crée une connexion pool à PostgreSQL
pub async fn create_pool() -> Result<PgPool, sqlx::Error> {
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set in .env file");

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await?;

    println!("✅ Connected to PostgreSQL!");
    Ok(pool)
}

/// Test la connexion à la base de données
pub async fn test_connection(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query("SELECT 1").execute(pool).await?;
    println!("✅ Database connection test passed!");
    Ok(())
}

/// Vérifie que le schema contient les tables attendues
pub async fn assert_schema(pool: &PgPool) -> Result<(), sqlx::Error> {
    let row =
        sqlx::query("SELECT current_database() db, current_schema() schema, current_user usr")
            .fetch_one(pool)
            .await?;

    let db: String = row.get("db");
    let schema: String = row.get("schema");
    let usr: String = row.get("usr");

    println!("🧠 Connected as user={usr}, db={db}, schema={schema}");

    sqlx::query("SELECT 1 FROM public.users LIMIT 1")
        .fetch_optional(pool)
        .await?;

    println!("✅ Schema OK: public.users exists");
    Ok(())
}
