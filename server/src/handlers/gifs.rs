//! GIF Search - Proxy vers l'API Giphy
//! Responsable: Noémie
//!
//! Ce fichier fait le lien entre le frontend et Giphy.
//! Le frontend demande des GIFs → on appelle Giphy → on renvoie les URLs.

use axum::{
    extract::Query,
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

// ==================== STRUCTS ====================

/// Ce que le frontend envoie : GET /gif/search?q=hello
#[derive(Deserialize)]
pub struct GifSearchQuery {
    pub q: String,
}

/// Un GIF renvoyé au frontend : juste l'URL et le titre
#[derive(Serialize)]
pub struct GifResult {
    pub url: String,
    pub title: String,
}

/// La réponse complète de Giphy
#[derive(Deserialize)]
struct GiphyResponse {
    data: Vec<GiphyGif>,
}

/// Un GIF dans la réponse Giphy
#[derive(Deserialize)]
struct GiphyGif {
    title: String,
    images: GiphyImages,
}

/// Les formats disponibles pour un GIF sur Giphy
#[derive(Deserialize)]
struct GiphyImages {
    original: GiphyImageItem,
}

/// Un format spécifique avec son URL
#[derive(Deserialize)]
struct GiphyImageItem {
    url: String,
}

// ==================== HANDLER ====================

pub async fn search_gifs(
    Query(params): Query<GifSearchQuery>,
) -> Result<Json<Vec<GifResult>>, StatusCode> {
    // 1. Lire la clé API Giphy depuis le .env
    let api_key = std::env::var("GIPHY_API_KEY")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // 2. Construire l'URL de recherche Giphy
    let url = format!(
        "https://api.giphy.com/v1/gifs/search?q={}&api_key={}&limit=20",
        params.q, api_key
    );

    // 3. Appeler Giphy
    let response = reqwest::get(&url)
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    // 4. Lire la réponse JSON de Giphy
    let giphy_data = response
        .json::<GiphyResponse>()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    // 5. Extraire juste les URLs et titres pour le frontend
    let gifs: Vec<GifResult> = giphy_data
        .data
        .into_iter()
        .map(|gif| GifResult {
            url: gif.images.original.url,
            title: gif.title,
        })
        .collect();

    // 6. Renvoyer la liste de GIFs au frontend
    Ok(Json(gifs))
}