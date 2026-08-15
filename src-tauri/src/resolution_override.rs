//! Milestone 39 stretch - resolution switching at launch. The remaining, riskier half of
//! "forced resolution/DPI override" (see dpi_override.rs for the DPI half, already shipped).
//!
//! Unlike every other M39 treatment, this has to run *before* the game's process even spawns
//! (many games query the desktop resolution at their own startup) - so there's no window yet to
//! target via MonitorFromWindow like remember_window/always_on_top/pseudo_fullscreen do. The
//! frontend resolves a target monitor from the game's last-known window position (if
//! remember_window has one) before calling here, falling back to the primary display otherwise -
//! see library.ts's launchGame.
//!
//! Applies via CDS_FULLSCREEN (a dynamic, non-persisted mode change - deliberately not
//! CDS_UPDATEREGISTRY) so the registry never stops reflecting the display's real default mode.
//! Reverting is just "ask Windows to restore the registry-stored mode" (`lpdevmode: None`), not
//! a manually-captured width/height/refresh - simpler and can't drift from whatever the OS
//! actually considers this display's real setting.

use windows::core::PCWSTR;
use windows::Win32::Foundation::POINT;
use windows::Win32::Graphics::Gdi::{
    ChangeDisplaySettingsExW, EnumDisplaySettingsW, GetMonitorInfoW, MonitorFromPoint, DEVMODEW,
    DISP_CHANGE_SUCCESSFUL, DM_DISPLAYFREQUENCY, DM_PELSHEIGHT, DM_PELSWIDTH, MONITORINFOEXW,
    MONITOR_DEFAULTTONEAREST, CDS_FULLSCREEN, CDS_TYPE,
};

#[derive(Clone, Copy, serde::Serialize)]
pub struct DisplayMode {
    width: u32,
    height: u32,
    refresh: u32,
}

fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// The `\\.\DISPLAYn`-style device name of the monitor containing (x, y), or `None` for "use the
/// primary display" (passing a null device name to the Win32 calls below already means that -
/// this just makes the "no coordinates given" case explicit at the call site).
fn device_name_for_point(x: i32, y: i32) -> Option<String> {
    let hmonitor = unsafe { MonitorFromPoint(POINT { x, y }, MONITOR_DEFAULTTONEAREST) };
    let mut info = MONITORINFOEXW::default();
    info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
    if unsafe { GetMonitorInfoW(hmonitor, &mut info.monitorInfo) }.as_bool() {
        let len = info.szDevice.iter().position(|&c| c == 0).unwrap_or(info.szDevice.len());
        Some(String::from_utf16_lossy(&info.szDevice[..len]))
    } else {
        None
    }
}

/// Every distinct width/height/refresh combination the target display reports supporting, for
/// the per-game resolution picker. `x`/`y` resolve which monitor the same way `apply` does.
#[tauri::command]
pub fn get_display_modes(x: Option<i32>, y: Option<i32>) -> Vec<DisplayMode> {
    let device_name = x.zip(y).and_then(|(x, y)| device_name_for_point(x, y));
    let wide = device_name.as_deref().map(to_wide);
    let device = wide.as_deref().map_or(PCWSTR::null(), |w| PCWSTR(w.as_ptr()));

    let mut modes = Vec::new();
    let mut mode_index = 0u32;
    loop {
        let mut devmode = DEVMODEW { dmSize: std::mem::size_of::<DEVMODEW>() as u16, ..Default::default() };
        let ok = unsafe {
            EnumDisplaySettingsW(device, windows::Win32::Graphics::Gdi::ENUM_DISPLAY_SETTINGS_MODE(mode_index), &mut devmode)
        };
        if !ok.as_bool() {
            break;
        }
        if devmode.dmPelsWidth > 0 && devmode.dmPelsHeight > 0 {
            modes.push(DisplayMode {
                width: devmode.dmPelsWidth,
                height: devmode.dmPelsHeight,
                refresh: devmode.dmDisplayFrequency,
            });
        }
        mode_index += 1;
    }
    modes.sort_by(|a, b| (b.width, b.height, b.refresh).cmp(&(a.width, a.height, a.refresh)));
    modes.dedup_by(|a, b| (a.width, a.height, a.refresh) == (b.width, b.height, b.refresh));
    modes
}

/// Switches the target display to `width`x`height`@`refresh`. Returns the resolved device name
/// (`None` = primary) - the frontend persists this (alongside the game id, for the multi-game
/// case, and across app restarts, for the crash-safety case) so `revert` can be pointed at the
/// exact same display later without re-deriving it from possibly-stale coordinates.
#[tauri::command]
pub fn apply_display_mode(
    x: Option<i32>,
    y: Option<i32>,
    width: i32,
    height: i32,
    refresh: i32,
) -> Result<Option<String>, String> {
    let device_name = x.zip(y).and_then(|(x, y)| device_name_for_point(x, y));
    let wide = device_name.as_deref().map(to_wide);
    let device = wide.as_deref().map_or(PCWSTR::null(), |w| PCWSTR(w.as_ptr()));

    let devmode = DEVMODEW {
        dmSize: std::mem::size_of::<DEVMODEW>() as u16,
        dmFields: DM_PELSWIDTH | DM_PELSHEIGHT | DM_DISPLAYFREQUENCY,
        dmPelsWidth: width as u32,
        dmPelsHeight: height as u32,
        dmDisplayFrequency: refresh as u32,
        ..Default::default()
    };

    let result = unsafe { ChangeDisplaySettingsExW(device, Some(&devmode as *const DEVMODEW), None, CDS_FULLSCREEN, None) };
    if result != DISP_CHANGE_SUCCESSFUL {
        return Err(format!("ChangeDisplaySettingsExW failed: {:?}", result));
    }
    Ok(device_name)
}

/// Restores whatever mode is stored in the registry for `device_name` (`None` = primary) -
/// exactly what was there before `apply_display_mode` ran, since that call used CDS_FULLSCREEN
/// and never touched the registry itself.
#[tauri::command]
pub fn revert_display_mode(device_name: Option<String>) -> Result<(), String> {
    let wide = device_name.as_deref().map(to_wide);
    let device = wide.as_deref().map_or(PCWSTR::null(), |w| PCWSTR(w.as_ptr()));

    let result = unsafe { ChangeDisplaySettingsExW(device, None, None, CDS_TYPE(0), None) };
    if result != DISP_CHANGE_SUCCESSFUL {
        return Err(format!("ChangeDisplaySettingsExW (revert) failed: {:?}", result));
    }
    Ok(())
}
