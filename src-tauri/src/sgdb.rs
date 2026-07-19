#[derive(serde::Deserialize)]
struct SearchResponse {
    data: Vec<SearchResult>,
}

#[derive(serde::Deserialize)]
struct SearchResult {
    id: u64,
}

#[derive(serde::Deserialize)]
struct ImageListResponse {
    data: Vec<ImageEntry>,
}

#[derive(serde::Deserialize)]
struct ImageEntry {
    url: String,
}

async fn search_game_id(
    client: &reqwest::Client,
    auth: &str,
    title: &str,
) -> Result<Option<u64>, String> {
    let search_url = format!(
        "https://www.steamgriddb.com/api/v2/search/autocomplete/{}",
        urlencoding::encode(title)
    );
    let search: SearchResponse = client
        .get(&search_url)
        .header("Authorization", auth)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    Ok(search.data.first().map(|g| g.id))
}

async fn fetch_first_image(
    client: &reqwest::Client,
    auth: &str,
    endpoint: &str,
    game_id: u64,
) -> Result<Option<String>, String> {
    let url = format!("https://www.steamgriddb.com/api/v2/{}/game/{}", endpoint, game_id);
    let images: ImageListResponse = client
        .get(&url)
        .header("Authorization", auth)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    Ok(images.data.first().map(|i| i.url.clone()))
}

#[tauri::command]
pub async fn fetch_cover_art(api_key: String, title: String) -> Result<Option<String>, String> {
    let client = reqwest::Client::new();
    let auth = format!("Bearer {}", api_key);

    let Some(game_id) = search_game_id(&client, &auth, &title).await? else {
        return Ok(None);
    };

    fetch_first_image(&client, &auth, "grids", game_id).await
}

#[tauri::command]
pub async fn fetch_background_art(api_key: String, title: String) -> Result<Option<String>, String> {
    let client = reqwest::Client::new();
    let auth = format!("Bearer {}", api_key);

    let Some(game_id) = search_game_id(&client, &auth, &title).await? else {
        return Ok(None);
    };

    fetch_first_image(&client, &auth, "heroes", game_id).await
}
