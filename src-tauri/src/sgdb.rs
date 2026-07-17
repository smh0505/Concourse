#[derive(serde::Deserialize)]
struct SearchResponse {
    data: Vec<SearchResult>,
}

#[derive(serde::Deserialize)]
struct SearchResult {
    id: u64,
}

#[derive(serde::Deserialize)]
struct GridsResponse {
    data: Vec<Grid>,
}

#[derive(serde::Deserialize)]
struct Grid {
    url: String,
}

#[tauri::command]
pub async fn fetch_cover_art(api_key: String, title: String) -> Result<Option<String>, String> {
    let client = reqwest::Client::new();
    let auth = format!("Bearer {}", api_key);

    let search_url = format!(
        "https://www.steamgriddb.com/api/v2/search/autocomplete/{}",
        urlencoding::encode(&title)
    );
    let search: SearchResponse = client
        .get(&search_url)
        .header("Authorization", &auth)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let Some(game) = search.data.first() else {
        return Ok(None);
    };

    let grids_url = format!("https://www.steamgriddb.com/api/v2/grids/game/{}", game.id);
    let grids: GridsResponse = client
        .get(&grids_url)
        .header("Authorization", &auth)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    Ok(grids.data.first().map(|g| g.url.clone()))
}
