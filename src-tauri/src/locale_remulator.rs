use serde::Serialize;
use std::path::Path;

/// Both LR and LE ship as portable folders (extract the zip anywhere) with no reliable
/// registry footprint to auto-detect (confirmed against real installs of both - their
/// installers only register a right-click context-menu extension, not a discoverable app
/// install). The user configures each wrapper's exe path once in app settings instead; this
/// just validates whatever path they typed. Shared by both wrappers, not LR-specific.
#[tauri::command]
pub fn wrapper_path_exists(path: String) -> bool {
    Path::new(&path).is_file()
}

/// LR's own launch behavior once it hands off to the hooked target process isn't confirmed
/// (whether LRProc.exe stays alive or exits after injection), so - like the other
/// launcher-owned sources (Steam/Epic/GOG) - this doesn't wait on a child process for
/// playtime; the caller falls back to folder-based tracking instead.
#[derive(Serialize, Debug, PartialEq)]
pub struct LocaleProfile {
    pub name: String,
    pub guid: String,
}

/// LRConfig.xml lives next to LRProc.exe and lists the locale profiles the user has
/// created via LR's own LREditor.exe GUI - we only read it, never write it.
#[tauri::command]
pub fn list_locale_remulator_profiles(lrproc_path: String) -> Result<Vec<LocaleProfile>, String> {
    let config_path = Path::new(&lrproc_path)
        .parent()
        .ok_or_else(|| "Invalid Locale Remulator path".to_string())?
        .join("LRConfig.xml");

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

#[tauri::command]
pub fn launch_via_locale_remulator(
    lrproc_path: String,
    profile_guid: String,
    executable_path: String,
) -> Result<(), String> {
    std::process::Command::new(&lrproc_path)
        .args([&profile_guid, &executable_path])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to launch via Locale Remulator: {}", e))?;

    Ok(())
}
