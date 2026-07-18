use keyvalues_parser::{Obj, Value, Vdf};
use serde::Serialize;
use std::path::PathBuf;

#[cfg(target_os = "windows")]
fn steam_install_path_from_registry() -> Option<PathBuf> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(key) = hkcu.open_subkey("Software\\Valve\\Steam") {
        if let Ok(path) = key.get_value::<String, _>("SteamPath") {
            return Some(PathBuf::from(path));
        }
    }

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    if let Ok(key) = hklm.open_subkey("SOFTWARE\\WOW6432Node\\Valve\\Steam") {
        if let Ok(path) = key.get_value::<String, _>("InstallPath") {
            return Some(PathBuf::from(path));
        }
    }

    None
}

#[cfg(not(target_os = "windows"))]
fn steam_install_path_from_registry() -> Option<PathBuf> {
    None
}

fn find_steam_install_path() -> Option<PathBuf> {
    steam_install_path_from_registry().or_else(|| {
        let fallback = PathBuf::from("C:\\Program Files (x86)\\Steam");
        fallback.exists().then_some(fallback)
    })
}

fn extract_library_paths(obj: &keyvalues_parser::Obj) -> Vec<String> {
    let mut paths = Vec::new();

    for values in obj.values() {
        for value in values {
            match value {
                // New format: numeric key -> { "path": "...", ... }
                Value::Obj(entry) => {
                    if let Some(path_values) = entry.get("path") {
                        for path_value in path_values {
                            if let Value::Str(path_str) = path_value {
                                paths.push(path_str.to_string());
                            }
                        }
                    }
                }
                // Old format: numeric key -> "E:\\Gry\\Steam"
                Value::Str(path_str) => {
                    paths.push(path_str.to_string());
                }
            }
        }
    }

    paths
}

/// Normalizes a path string for equality comparison only (not for filesystem use):
/// Steam's registry `SteamPath` value uses forward slashes while libraryfolders.vdf
/// paths use backslashes, and drive letters may differ in case - none of which affect
/// whether two strings point at the same directory on Windows.
fn normalize_for_comparison(path: &str) -> String {
    path.replace('/', "\\").trim_end_matches('\\').to_lowercase()
}

/// Deduplicates while preserving first-seen order. Unlike `Vec::dedup`, this catches
/// duplicates anywhere in the list, not just consecutive ones (Steam's own install path
/// is prepended separately from the paths parsed out of libraryfolders.vdf, and is
/// commonly also listed inside that file - a non-adjacent duplicate `Vec::dedup` misses),
/// and it compares paths after normalizing separators/case rather than by exact string
/// equality (registry vs. VDF paths are formatted differently for the same directory).
fn dedup_preserve_order(paths: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut result = Vec::new();
    for path in paths {
        if seen.insert(normalize_for_comparison(&path)) {
            result.push(path);
        }
    }
    result
}

#[tauri::command]
pub fn find_steam_library_folders() -> Result<Vec<String>, String> {
    let install_path =
        find_steam_install_path().ok_or_else(|| "Steam installation not found".to_string())?;

    let vdf_path = install_path.join("steamapps").join("libraryfolders.vdf");
    let content = std::fs::read_to_string(&vdf_path)
        .map_err(|e| format!("Failed to read {}: {}", vdf_path.display(), e))?;

    let vdf = keyvalues_parser::parse(&content)
        .map(Vdf::from)
        .map_err(|e| format!("Failed to parse {}: {}", vdf_path.display(), e))?;

    let obj = match &vdf.value {
        Value::Obj(obj) => obj,
        Value::Str(_) => return Err("Unexpected libraryfolders.vdf structure".to_string()),
    };

    let all_paths = std::iter::once(install_path.to_string_lossy().to_string())
        .chain(extract_library_paths(obj));

    Ok(dedup_preserve_order(all_paths))
}

#[derive(Serialize, Debug, PartialEq)]
pub struct SteamApp {
    pub app_id: String,
    pub name: String,
    pub install_dir: String,
    pub library_path: String,
}

fn get_string_field(obj: &Obj, key: &str) -> Option<String> {
    let value = obj.get(key)?.first()?;
    match value {
        Value::Str(s) => Some(s.to_string()),
        Value::Obj(_) => None,
    }
}

fn parse_appmanifest_content(content: &str, library_path: &str) -> Option<SteamApp> {
    let vdf = keyvalues_parser::parse(content).map(Vdf::from).ok()?;
    let obj = match &vdf.value {
        Value::Obj(obj) => obj,
        Value::Str(_) => return None,
    };

    Some(SteamApp {
        app_id: get_string_field(obj, "appid")?,
        name: get_string_field(obj, "name")?,
        install_dir: get_string_field(obj, "installdir")?,
        library_path: library_path.to_string(),
    })
}

#[tauri::command]
pub fn find_steam_apps() -> Result<Vec<SteamApp>, String> {
    let libraries = find_steam_library_folders()?;
    let mut apps = Vec::new();

    for library in &libraries {
        let steamapps_dir = PathBuf::from(library).join("steamapps");
        let entries = match std::fs::read_dir(&steamapps_dir) {
            Ok(entries) => entries,
            Err(_) => continue, // library folder may be missing/unmounted; skip it
        };

        for entry in entries.flatten() {
            let path = entry.path();
            let is_appmanifest = path
                .file_name()
                .and_then(|n| n.to_str())
                .map(|name| name.starts_with("appmanifest_") && name.ends_with(".acf"))
                .unwrap_or(false);
            if !is_appmanifest {
                continue;
            }

            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Some(app) = parse_appmanifest_content(&content, library) {
                    apps.push(app);
                }
            }
        }
    }

    Ok(apps)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse_paths(content: &str) -> Vec<String> {
        let vdf = keyvalues_parser::parse(content).map(Vdf::from).unwrap();
        let obj = match &vdf.value {
            Value::Obj(obj) => obj,
            Value::Str(_) => panic!("expected object"),
        };
        extract_library_paths(obj)
    }

    #[test]
    fn parses_new_format() {
        let content = r#"
"libraryfolders"
{
	"1"
	{
		"path"		"D:\\Games"
		"label"		""
		"mounted"		"1"
		"contentid"		"5313741402461657921"
	}
	"2"
	{
		"path"		"E:\\SteamLibrary"
		"label"		""
		"mounted"		"1"
		"contentid"		"1234567890"
	}
}
"#;
        let paths = parse_paths(content);
        assert_eq!(paths, vec!["D:\\Games", "E:\\SteamLibrary"]);
    }

    #[test]
    fn parses_old_format() {
        let content = r#"
"LibraryFolders"
{
	"1"		"E:\\Gry\\Steam"
	"2"		"F:\\Gry\\Steam"
}
"#;
        let paths = parse_paths(content);
        assert_eq!(paths, vec!["E:\\Gry\\Steam", "F:\\Gry\\Steam"]);
    }

    #[test]
    fn parses_appmanifest() {
        let content = r#"
"AppState"
{
	"appid"		"730"
	"Universe"		"1"
	"name"		"Counter-Strike: Global Offensive"
	"StateFlags"		"4"
	"installdir"		"Counter-Strike Global Offensive"
	"LastUpdated"		"1462547468"
	"SizeOnDisk"		"14990577143"
	"UserConfig"
	{
		"Language"		"english"
	}
}
"#;
        let app = parse_appmanifest_content(content, "D:\\SteamLibrary").unwrap();
        assert_eq!(
            app,
            SteamApp {
                app_id: "730".to_string(),
                name: "Counter-Strike: Global Offensive".to_string(),
                install_dir: "Counter-Strike Global Offensive".to_string(),
                library_path: "D:\\SteamLibrary".to_string(),
            }
        );
    }

    #[test]
    fn dedup_catches_non_adjacent_duplicates() {
        // Regression test: Steam's own install path is commonly *also* listed inside
        // libraryfolders.vdf, non-adjacent to where it's prepended. Vec::dedup() only
        // catches consecutive duplicates and would miss this, causing every appmanifest
        // in that library to be scanned (and imported) twice.
        let paths = vec![
            "C:\\Program Files (x86)\\Steam".to_string(),
            "D:\\SteamLibrary".to_string(),
            "C:\\Program Files (x86)\\Steam".to_string(),
        ];
        let deduped = dedup_preserve_order(paths);
        assert_eq!(
            deduped,
            vec![
                "C:\\Program Files (x86)\\Steam".to_string(),
                "D:\\SteamLibrary".to_string(),
            ]
        );
    }

    #[test]
    fn dedup_catches_slash_and_case_mismatch() {
        // Regression test: Steam's registry SteamPath value uses forward slashes
        // ("C:/Program Files (x86)/Steam") while libraryfolders.vdf paths use backslashes
        // ("C:\\Program Files (x86)\\Steam") - the same directory, but not equal as
        // strings, so exact-string dedup silently fails to catch it.
        let paths = vec![
            "C:/Program Files (x86)/Steam".to_string(),
            "c:\\Program Files (x86)\\Steam\\".to_string(),
            "D:\\SteamLibrary".to_string(),
        ];
        let deduped = dedup_preserve_order(paths);
        assert_eq!(
            deduped,
            vec![
                "C:/Program Files (x86)/Steam".to_string(),
                "D:\\SteamLibrary".to_string(),
            ]
        );
    }

    #[test]
    fn rejects_malformed_appmanifest() {
        let content = r#"
"AppState"
{
	"Universe"		"1"
}
"#;
        assert!(parse_appmanifest_content(content, "D:\\SteamLibrary").is_none());
    }
}
