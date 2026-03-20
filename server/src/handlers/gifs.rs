//! GIF Search - Proxy vers l'API Tenor
//! Responsable: Noemie
//! 
//! Ce fichier fait le lien entre le frontend et Tenor.
//! Le frontend demande des GIFs → on appelle Tenor → on renvoie les URLs.

use axum::{extract::Query, Json};
use serde::{Deserialize, Serialize};

// ==================== STRUCTS ====================

/// Ce que le frontend envoie : GET /gif/search?q=hello

#[derive(Deserialize)]
pub struct GifSearchQuery {
    pub q: String, // mot clé de recherche
}

/// Un GIF renvoyé au frontend : juste l'URL et le titre
#[derive(Serialize)]
pub struct GifResult {
    pub url: String,
    pub title: String,
}

/// La réponse complète de Tenor (on garde juste ce dont on a besoin)
#[derive(Deserialize)]
struct TenorResponse {
    results: Vec<TenorGif>,
}

/// Un GIF dans la réponse Tenor
struct TenorGif {
    media_formats: TenorMediaFormats,
    title: String,
}

/// Les formats disponibles pour un GIF sur Tenor
#[derive(Deserialize)]
struct TenorMediaFormats {
    gif: Option<TenorMediaItem>,
}

/// Un format spécifique avec son URL
#[derive(Deserialize)]
struct TenorMediaItem {
    url: String,
}

// ==================== HANDLER ====================

pub async fn search_gifs(
    Query(params): Query<GifSearchQuery>,
) -> Result<Json<Vec<GifResult>>, StatusCode> {
    // 1. Lire la clé API Tenor depuis le .env
    let api_key = std::env::var("TENOR_API_KEY")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // 2. Construire l'URL de recherche Tenor
    let url = format!(
        "https://tenor.googleapis.com/v2/search?q={}&key={}&limit=20",
        params.q, api_key
    );

    // 3. Appeler Tenor
    let response = reqwest::get(&url)
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    // 4. Lire la réponse JSON de Tenor
    let tenor_data = response
        .json::<TenorResponse>()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    // 5. Extraire juste les URLs et titres pour le frontend
    let gifs: Vec<GifResult> = tenor_data
        .results
        .into_iter()
        .filter_map(|gif| {
            gif.media_formats.gif.map(|media| GifResult {
                url: media.url,
                title: gif.title,
            })
        })
        .collect();

    // 6. Renvoyer la liste de GIFs au frontend
    Ok(Json(gifs))
}