use serde::Serialize;

/// Same shape as `obs_presence.rs`'s `ObsPresenceError` - `kind` for a localized headline, `raw`
/// for the underlying `obws`/OBS error text. Collapses `obws::Error`'s many internal variants
/// down to the two distinctions the Settings UI actually needs.
#[derive(Serialize)]
#[serde(tag = "kind")]
pub enum ObsWsError {
    ConnectFailed { raw: String },
    RequestFailed { raw: String },
}

async fn connect(host: &str, port: u16, password: Option<&str>) -> Result<obws::Client, ObsWsError> {
    obws::Client::connect(host, port, password)
        .await
        .map_err(|e| ObsWsError::ConnectFailed { raw: e.to_string() })
}

/// Backs "Fetch Scenes" - populates the scene autocomplete list and doubles as a connectivity
/// test, same idea as `test_obs_presence_port`.
#[tauri::command]
pub async fn obs_ws_list_scenes(
    host: String,
    port: u16,
    password: Option<String>,
) -> Result<Vec<String>, ObsWsError> {
    let client = connect(&host, port, password.as_deref()).await?;
    let scenes = client
        .scenes()
        .list()
        .await
        .map_err(|e| ObsWsError::RequestFailed { raw: e.to_string() })?;
    Ok(scenes.scenes.into_iter().map(|scene| scene.id.name).collect())
}

/// Fresh connect-switch-disconnect per call rather than a persistent connection - fires only
/// twice per game session, so no reconnect lifecycle is worth managing.
#[tauri::command]
pub async fn obs_ws_switch_scene(
    host: String,
    port: u16,
    password: Option<String>,
    scene: String,
) -> Result<(), ObsWsError> {
    let client = connect(&host, port, password.as_deref()).await?;
    client
        .scenes()
        .set_current_program_scene(scene.as_str())
        .await
        .map_err(|e| ObsWsError::RequestFailed { raw: e.to_string() })
}
