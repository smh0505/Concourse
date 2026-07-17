#[derive(serde::Deserialize)]
struct TwitchTokenResponse {
    access_token: String,
}

#[derive(serde::Deserialize)]
struct IgdbGame {
    summary: Option<String>,
    first_release_date: Option<i64>,
    genres: Option<Vec<IgdbGenre>>,
}

#[derive(serde::Deserialize)]
struct IgdbGenre {
    name: String,
}

#[derive(serde::Serialize)]
pub struct IgdbMetadata {
    description: Option<String>,
    release_date: Option<String>,
    genres: Vec<String>,
}

async fn get_access_token(client: &reqwest::Client, client_id: &str, client_secret: &str) -> Result<String, String> {
    let resp: TwitchTokenResponse = client
        .post("https://id.twitch.tv/oauth2/token")
        .query(&[
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("grant_type", "client_credentials"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    Ok(resp.access_token)
}

/// Civil-from-days algorithm (Howard Hinnant), converts a Unix timestamp to a Y-M-D string.
fn unix_to_date(timestamp: i64) -> String {
    let z = timestamp.div_euclid(86400) + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}-{:02}", y, m, d)
}

#[tauri::command]
pub async fn fetch_igdb_metadata(
    client_id: String,
    client_secret: String,
    title: String,
) -> Result<Option<IgdbMetadata>, String> {
    let client = reqwest::Client::new();
    let token = get_access_token(&client, &client_id, &client_secret).await?;

    let body = format!(
        "search \"{}\"; fields summary,first_release_date,genres.name; limit 1;",
        title.replace('"', "")
    );

    let games: Vec<IgdbGame> = client
        .post("https://api.igdb.com/v4/games")
        .header("Client-ID", &client_id)
        .header("Authorization", format!("Bearer {}", token))
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let Some(game) = games.into_iter().next() else {
        return Ok(None);
    };

    Ok(Some(IgdbMetadata {
        description: game.summary,
        release_date: game.first_release_date.map(unix_to_date),
        genres: game
            .genres
            .unwrap_or_default()
            .into_iter()
            .map(|g| g.name)
            .collect(),
    }))
}
