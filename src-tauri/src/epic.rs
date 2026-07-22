use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// Epic Games Launcher writes one *.item JSON manifest per installed game to
// %PROGRAMDATA%\Epic\EpicGamesLauncher\Data\Manifests. Confirmed against Playnite's
// EpicLibrary source (LauncherInstalled.cs / EpicLauncher.cs), since Epic doesn't
// document this format itself.
#[derive(Deserialize)]
struct EpicManifestFile {
    #[serde(rename = "AppName")]
    app_name: Option<String>,
    #[serde(rename = "DisplayName")]
    display_name: Option<String>,
    #[serde(rename = "InstallLocation")]
    install_location: Option<String>,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct EpicApp {
    pub app_name: String,
    pub display_name: String,
    pub install_location: String,
}

fn manifests_dir() -> Option<PathBuf> {
    let program_data = std::env::var("PROGRAMDATA").ok()?;
    Some(PathBuf::from(program_data).join("Epic").join("EpicGamesLauncher").join("Data").join("Manifests"))
}

fn parse_manifest_content(content: &str) -> Option<EpicApp> {
    let manifest: EpicManifestFile = serde_json::from_str(content).ok()?;
    Some(EpicApp {
        app_name: manifest.app_name?,
        display_name: manifest.display_name?,
        install_location: manifest.install_location?,
    })
}

#[tauri::command]
pub fn find_epic_apps() -> Result<Vec<EpicApp>, String> {
    let Some(dir) = manifests_dir() else {
        return Ok(Vec::new());
    };

    let entries = match std::fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(_) => return Ok(Vec::new()), // Epic not installed / no games installed yet
    };

    let mut apps = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        let is_item_file = path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("item"))
            .unwrap_or(false);
        if !is_item_file {
            continue;
        }

        if let Ok(content) = std::fs::read_to_string(&path) {
            // Epic's client sometimes writes an empty/corrupt manifest; skip those
            // rather than failing the whole scan.
            if let Some(app) = parse_manifest_content(&content) {
                apps.push(app);
            }
        }
    }

    Ok(apps)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_real_manifest_shape() {
        // Sample field shape verified against Playnite's InstalledManifiest model.
        let content = r#"{
            "FormatVersion": 0,
            "bIsIncompleteInstall": false,
            "AppVersionString": "1.7.1.0",
            "LaunchCommand": "",
            "LaunchExecutable": "FarmingSimulator2019.exe",
            "ManifestLocation": "C:\\Games\\Epic\\FarmingSimulator19/.egstore",
            "bIsApplication": true,
            "bIsExecutable": true,
            "bRequiresAuth": true,
            "bCanRunOffline": true,
            "AppName": "Stellula",
            "DisplayName": "Farming Simulator 19",
            "InstallLocation": "C:\\Games\\Epic\\FarmingSimulator19"
        }"#;

        let app = parse_manifest_content(content).unwrap();
        assert_eq!(
            app,
            EpicApp {
                app_name: "Stellula".to_string(),
                display_name: "Farming Simulator 19".to_string(),
                install_location: "C:\\Games\\Epic\\FarmingSimulator19".to_string(),
            }
        );
    }

    #[test]
    fn rejects_manifest_missing_required_fields() {
        let content = r#"{ "AppName": "Stellula" }"#;
        assert!(parse_manifest_content(content).is_none());
    }

    #[test]
    fn rejects_empty_manifest() {
        assert!(parse_manifest_content("").is_none());
    }
}
