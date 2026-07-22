use serde::Serialize;
use std::path::PathBuf;

#[cfg(target_os = "windows")]
fn gog_galaxy_client_dir_from_registry() -> Option<PathBuf> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    for subkey in [
        "SOFTWARE\\WOW6432Node\\GOG.com\\GalaxyClient\\paths",
        "SOFTWARE\\GOG.com\\GalaxyClient\\paths",
    ] {
        if let Ok(key) = hklm.open_subkey(subkey) {
            if let Ok(client) = key.get_value::<String, _>("client") {
                return Some(PathBuf::from(client));
            }
        }
    }

    None
}

#[cfg(not(target_os = "windows"))]
fn gog_galaxy_client_dir_from_registry() -> Option<PathBuf> {
    None
}

#[derive(Serialize, Debug, PartialEq)]
pub struct GogApp {
    pub game_id: String,
    pub name: String,
    pub install_dir: String,
}

#[cfg(target_os = "windows")]
fn gog_apps_from_registry() -> Vec<GogApp> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    for games_key in [
        "SOFTWARE\\WOW6432Node\\GOG.com\\Games",
        "SOFTWARE\\GOG.com\\Games",
    ] {
        if let Ok(key) = hklm.open_subkey(games_key) {
            let mut apps = Vec::new();
            for game_id in key.enum_keys().flatten() {
                if let Ok(game_key) = key.open_subkey(&game_id) {
                    let name = game_key.get_value::<String, _>("gameName").ok();
                    let path = game_key.get_value::<String, _>("path").ok();
                    if let (Some(name), Some(path)) = (name, path) {
                        apps.push(GogApp {
                            game_id: game_id.clone(),
                            name,
                            install_dir: path,
                        });
                    }
                }
            }
            if !apps.is_empty() {
                return apps;
            }
        }
    }

    Vec::new()
}

#[cfg(not(target_os = "windows"))]
fn gog_apps_from_registry() -> Vec<GogApp> {
    Vec::new()
}

#[tauri::command]
pub fn find_gog_apps() -> Result<Vec<GogApp>, String> {
    Ok(gog_apps_from_registry())
}

/// GalaxyClient relays the launch to the actual game process and returns quickly, so
/// (like Steam/Epic URI launches) there's no child process handle worth waiting on -
/// playtime tracking is intentionally skipped here, same as the other launcher-owned sources.
#[tauri::command]
pub fn launch_gog_game(game_id: String) -> Result<(), String> {
    let client = gog_galaxy_client_dir_from_registry()
        .map(|dir| dir.join("GalaxyClient.exe"))
        .ok_or_else(|| "GOG Galaxy installation not found".to_string())?;

    std::process::Command::new(&client)
        .args(["/gameid", &game_id, "/command", "runGame"])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to launch GOG game {}: {}", game_id, e))?;

    Ok(())
}
