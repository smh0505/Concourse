//! Milestone 39 stretch - per-game DPI-awareness compatibility override, the same mechanism as
//! Explorer's own Properties -> Compatibility -> "Change high DPI settings" dialog
//! (`HKCU\Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers`, keyed by the
//! target exe's full path, value `"~ FLAG1 FLAG2"`). Unlike pseudo_fullscreen/always_on_top/
//! remember_window this isn't a session-lifecycle treatment tied to launch/exit - it's a
//! persistent OS-level setting, written or cleared once when the game's edit form is saved.

const LAYERS_KEY: &str = r"Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers";

/// Named presets matching Explorer's own dropdown ("Application"/"System"/"System (enhanced)"),
/// rather than exposing the raw flag list - the audience for this feature wants "fix this
/// blurry old game", not to pick individual AppCompatFlags.
fn flags_for_mode(mode: &str) -> Option<&'static str> {
    match mode {
        "application" => Some("HIGHDPIAWARE"),
        "system" => Some("DPIUNAWARE"),
        "system_enhanced" => Some("GDIDPISCALING DPIUNAWARE"),
        _ => None,
    }
}

#[tauri::command]
pub fn set_dpi_override(executable_path: String, mode: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (layers, _) = hkcu
            .create_subkey(LAYERS_KEY)
            .map_err(|e| format!("Failed to open AppCompatFlags\\Layers: {}", e))?;

        match flags_for_mode(&mode) {
            Some(flags) => {
                layers
                    .set_value(&executable_path, &format!("~ {}", flags))
                    .map_err(|e| format!("Failed to write DPI override: {}", e))?;
            }
            None => {
                // "none" (or anything unrecognized) clears any previously-set override rather
                // than leaving a stale flag behind for an exe the user no longer wants it on.
                let _ = layers.delete_value(&executable_path);
            }
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (executable_path, mode);
        Ok(())
    }
}
