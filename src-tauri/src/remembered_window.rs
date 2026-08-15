//! Milestone 39 stretch - remembered window position/size. Built-in feature, per-game opt-in,
//! same reasoning as `pseudo_fullscreen.rs`/`always_on_top.rs` (see milestones.md). Reuses those
//! modules' window-finding rather than duplicating the `EnumWindows` callback.

use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Gdi::{MonitorFromRect, MONITOR_DEFAULTTONULL};
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowRect, IsWindow, SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER,
};

use crate::pseudo_fullscreen::{find_window_for_pid, wait_for_window};

pub struct RememberedWindowState {
    hwnd: isize,
}

/// A previously-saved rect, `None` until a session with this enabled has actually captured one.
pub struct SavedRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

/// Finds the game's window and, if `saved` is given and still lands on a currently-connected
/// monitor (a saved rect from a monitor that's since been unplugged or resized would place the
/// window somewhere unreachable), moves it there. Always returns a state to track for later
/// capture, even with no `saved` rect to apply yet.
pub fn apply(candidate_pids: impl FnMut() -> Vec<u32>, saved: Option<SavedRect>) -> Option<RememberedWindowState> {
    let hwnd = wait_for_window(candidate_pids)?;

    if let Some(rect) = saved {
        let target = RECT {
            left: rect.x,
            top: rect.y,
            right: rect.x + rect.width,
            bottom: rect.y + rect.height,
        };
        let on_screen = unsafe { !MonitorFromRect(&target, MONITOR_DEFAULTTONULL).is_invalid() };
        if on_screen {
            unsafe {
                let _ = SetWindowPos(
                    hwnd,
                    None,
                    rect.x,
                    rect.y,
                    rect.width,
                    rect.height,
                    SWP_NOZORDER | SWP_NOACTIVATE,
                );
            }
        }
    }

    Some(RememberedWindowState { hwnd: hwnd.0 as isize })
}

/// Same window-replacement handling as the other two Milestone 39 features - if the tracked
/// window closed and got replaced, starts tracking whatever new one appears. No saved rect to
/// apply here (that only happens once, at initial `apply()`) - just keeps tracking the right
/// window so `capture` reads from the correct one at session end.
pub fn refresh(
    state: Option<RememberedWindowState>,
    mut candidate_pids: impl FnMut() -> Vec<u32>,
) -> Option<RememberedWindowState> {
    if let Some(state) = state {
        let hwnd = HWND(state.hwnd as *mut _);
        if unsafe { IsWindow(Some(hwnd)) }.as_bool() {
            return Some(state);
        }
    }
    candidate_pids()
        .into_iter()
        .find_map(find_window_for_pid)
        .map(|hwnd| RememberedWindowState { hwnd: hwnd.0 as isize })
}

/// Reads the tracked window's current position/size - called once right before the session ends,
/// so whatever the user last had it at (moved/resized mid-session or not) gets saved. `None` if
/// the window's already gone by the time this runs.
pub fn capture(state: &RememberedWindowState) -> Option<SavedRect> {
    let hwnd = HWND(state.hwnd as *mut _);
    if !unsafe { IsWindow(Some(hwnd)) }.as_bool() {
        return None;
    }
    let mut rect = RECT::default();
    unsafe {
        GetWindowRect(hwnd, &mut rect).ok()?;
    }
    Some(SavedRect { x: rect.left, y: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top })
}
