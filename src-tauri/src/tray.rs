use std::sync::Mutex;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewWindow, WindowEvent,
};

/// Whether closing the main window should hide it to the tray instead of quitting the app -
/// read synchronously from `WindowEvent::CloseRequested` (see `install_close_to_tray_handler`
/// below), so it can't be an async DB read at that point. Mirrored from the real persisted
/// setting by the frontend (`appSettings.ts`'s `init()`/`setCloseToTray`) via `set_close_to_tray`
/// - defaults to `true` here, matching the app's own chosen default, for the brief window before
/// the frontend's own init has run.
pub struct CloseToTrayState(pub Mutex<bool>);

#[tauri::command]
pub fn set_close_to_tray(state: tauri::State<CloseToTrayState>, enabled: bool) {
    *state.0.lock().unwrap() = enabled;
}

/// Intercepts the main window's close button - hides instead of letting the app quit, as long
/// as `CloseToTrayState` says to. The tray menu's own Quit item calls `app.exit(0)` directly,
/// bypassing this entirely.
pub fn install_close_to_tray_handler(window: &WebviewWindow) {
    let window_for_closure = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            let should_hide = *window_for_closure
                .app_handle()
                .state::<CloseToTrayState>()
                .0
                .lock()
                .unwrap();
            if should_hide {
                api.prevent_close();
                let _ = window_for_closure.hide();
            }
        }
    });
}

pub fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "Show Concourse", true, None::<&str>)?;
    let quick_launch_item = MenuItem::with_id(app, "quick_launch", "Quick Launch", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quick_launch_item, &quit_item])?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().cloned().expect("bundle.icon must be configured"))
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "quick_launch" => crate::quick_launch::toggle_overlay(app),
            "quit" => quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// `.destroy()` (not `.close()`) for every window before `app.exit(0)` - the main window's own
/// close-to-tray handler intercepts `.close()`'s `CloseRequested` and just re-hides it, and a
/// hidden-but-still-registered WebView2 host window (main when hidden to tray, or the
/// quick-launch overlay, which is created once and left alive rather than destroyed on hide)
/// racing an abrupt `app.exit()` is what produces Windows' benign but noisy
/// "Failed to unregister class Chrome_WidgetWin_0" warning on exit. `.destroy()` tears a window
/// down immediately with no event to intercept, so every window is actually gone before exit.
fn quit(app: &AppHandle) {
    for (_, window) in app.webview_windows() {
        let _ = window.destroy();
    }
    app.exit(0);
}
