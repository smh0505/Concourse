use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub const OVERLAY_LABEL: &str = "quick-launch";
pub const DEFAULT_HOTKEY: &str = "Ctrl+Alt+Space";

/// Registers the global-shortcut plugin with a handler that toggles the overlay on Pressed -
/// only one shortcut is ever registered at a time (the quick-launch hotkey itself, swapped via
/// `register_hotkey`/`set_quick_launch_hotkey` rather than adding a second one), so the handler
/// doesn't need to disambiguate which shortcut fired.
pub fn init(app: &tauri::App, initial_hotkey: &str) -> Result<(), Box<dyn std::error::Error>> {
    app.handle().plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    toggle_overlay(app);
                }
            })
            .build(),
    )?;
    register_hotkey(app.handle(), initial_hotkey)?;
    Ok(())
}

/// Unregisters whatever's currently bound and registers `hotkey` in its place - used both for
/// the initial registration and every time the user picks a new binding in Settings.
pub fn register_hotkey(app: &AppHandle, hotkey: &str) -> Result<(), String> {
    let shortcut: Shortcut = hotkey
        .parse()
        .map_err(|e| format!("invalid hotkey '{hotkey}': {e:?}"))?;
    let manager = app.global_shortcut();
    let _ = manager.unregister_all();
    manager.register(shortcut).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_quick_launch_hotkey(app: AppHandle, shortcut: String) -> Result<(), String> {
    register_hotkey(&app, &shortcut)
}

#[tauri::command]
pub fn hide_quick_launch(app: AppHandle) {
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = window.hide();
    }
}

pub fn toggle_overlay(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            show_overlay(&window);
        }
    } else {
        create_overlay(app);
    }
}

/// A plain `show()` doesn't reliably hand keyboard focus to the webview's own input element -
/// the `quick-launch-shown` event lets `QuickLaunchOverlay.vue` clear/refocus its search input
/// itself every time the window becomes visible, whether newly created or just re-shown.
fn show_overlay(window: &WebviewWindow) {
    let _ = window.center();
    let _ = window.show();
    let _ = window.set_focus();
    let _ = window.emit("quick-launch-shown", ());
}

fn create_overlay(app: &AppHandle) {
    let builder = WebviewWindowBuilder::new(app, OVERLAY_LABEL, WebviewUrl::App("quick-launch.html".into()))
        .title("Quick Launch")
        .inner_size(560.0, 420.0)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(false)
        .center();

    match builder.build() {
        Ok(window) => {
            // Hides on blur (clicking away) - matches the Spotlight/Alfred/Playnite convention
            // of dismissing on lost focus, not just Escape.
            let window_clone = window.clone();
            window.on_window_event(move |event| {
                if let WindowEvent::Focused(false) = event {
                    let _ = window_clone.hide();
                }
            });
            show_overlay(&window);
        }
        Err(e) => eprintln!("failed to create quick-launch overlay window: {e}"),
    }
}
