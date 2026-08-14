use serde::Serialize;

/// Structured the same way `obs_presence.rs`'s `ObsPresenceError` is - a `kind` the frontend
/// matches on to build a localized headline, plus the underlying `obws`/OBS error text as a
/// `raw` detail line rather than dropped. `obws::Error` already covers URI/handshake/timeout/API
/// failures internally (it's a `thiserror` enum); collapsing all of those into two kinds here is
/// enough for what the Settings UI actually needs to tell the user apart: "couldn't reach/auth
/// to OBS at all" vs. "reached it, but this specific request failed."
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

/// Backs the Settings panel's "Fetch Scenes" button - populates the start/end scene fields'
/// autocomplete list, and doubles as a connectivity test the same way `test_obs_presence_port`
/// does for the overlay port.
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

/// Called from the `obs-presence` TS plugin's `activate`/`deactivate` when scene-switching is
/// enabled in Settings - a fresh connect-switch-disconnect per call rather than holding a
/// persistent connection, since this only fires twice per game session (start/end) and avoids
/// any connection-health/reconnect lifecycle to manage for such a low call rate.
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
