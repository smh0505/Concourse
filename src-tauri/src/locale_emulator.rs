use serde::Serialize;
use std::path::Path;

#[derive(Serialize, Debug, PartialEq)]
pub struct LocaleProfile {
    pub name: String,
    pub guid: String,
}

/// LEConfig.xml lives next to LEProc.exe and lists the locale profiles the user has
/// created via LE's own LEGUI.exe/context-menu GUI - we only read it, never write it.
/// Same `<Profile Name="..." Guid="...">` shape as Locale Remulator (LR forked from LE),
/// just a different filename and root element.
#[tauri::command]
pub fn list_locale_emulator_profiles(leproc_path: String) -> Result<Vec<LocaleProfile>, String> {
    let config_path = Path::new(&leproc_path)
        .parent()
        .ok_or_else(|| "Invalid Locale Emulator path".to_string())?
        .join("LEConfig.xml");

    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read {}: {}", config_path.display(), e))?;

    let doc = roxmltree::Document::parse(&content)
        .map_err(|e| format!("Failed to parse {}: {}", config_path.display(), e))?;

    let profiles = doc
        .descendants()
        .filter(|n| n.has_tag_name("Profile"))
        .filter_map(|n| {
            let name = n.attribute("Name")?.to_string();
            let guid = n.attribute("Guid")?.to_string();
            Some(LocaleProfile { name, guid })
        })
        .collect();

    Ok(profiles)
}

/// Unlike LRProc's positional `<guid> <path>` syntax, LEProc needs the `-runas` flag before
/// the guid to run under a specific global profile (bare `<path>` alone would run under the
/// target's own per-app profile or LE's default, not the one the user picked here).
#[tauri::command]
pub fn launch_via_locale_emulator(
    leproc_path: String,
    profile_guid: String,
    executable_path: String,
) -> Result<(), String> {
    std::process::Command::new(&leproc_path)
        .args(["-runas", &profile_guid, &executable_path])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to launch via Locale Emulator: {}", e))?;

    Ok(())
}
