//! Milestone 39 stretch - always-on-top pinning. Built-in feature, per-game opt-in, same
//! reasoning as `pseudo_fullscreen.rs` (see milestones.md). Independent of pseudo-fullscreen -
//! reuses that module's window-finding (`find_window_for_pid`/`wait_for_window`) rather than
//! duplicating the `EnumWindows` callback, but keeps its own state/apply/revert/refresh since
//! the two treatments can be enabled independently for the same game.

use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{
    IsWindow, SetWindowPos, HWND_NOTOPMOST, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
};

use crate::pseudo_fullscreen::{find_window_for_pid, wait_for_window};

pub struct AlwaysOnTopState {
    hwnd: isize,
}

fn set_topmost(hwnd: HWND, topmost: bool) {
    let insert_after = if topmost { HWND_TOPMOST } else { HWND_NOTOPMOST };
    unsafe {
        let _ = SetWindowPos(hwnd, Some(insert_after), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    }
}

/// Finds the game's window and pins it topmost. `None` if no window turns up among
/// `candidate_pids` within ~5s.
pub fn apply(candidate_pids: impl FnMut() -> Vec<u32>) -> Option<AlwaysOnTopState> {
    let hwnd = wait_for_window(candidate_pids)?;
    set_topmost(hwnd, true);
    Some(AlwaysOnTopState { hwnd: hwnd.0 as isize })
}

/// Unpins the window if it's still alive - safe to call on an already-invalid handle.
pub fn revert(state: AlwaysOnTopState) {
    let hwnd = HWND(state.hwnd as *mut _);
    if unsafe { IsWindow(Some(hwnd)) }.as_bool() {
        set_topmost(hwnd, false);
    }
}

/// Same "window closed and got replaced" handling as `pseudo_fullscreen::refresh` - see that
/// function's doc comment for the reasoning. A single lookup attempt per call, not `apply()`'s
/// multi-second retry, since this is already called repeatedly off the caller's own poll loop.
pub fn refresh(
    state: Option<AlwaysOnTopState>,
    mut candidate_pids: impl FnMut() -> Vec<u32>,
) -> Option<AlwaysOnTopState> {
    if let Some(state) = state {
        let hwnd = HWND(state.hwnd as *mut _);
        if unsafe { IsWindow(Some(hwnd)) }.as_bool() {
            return Some(state);
        }
    }

    let hwnd = candidate_pids().into_iter().find_map(find_window_for_pid)?;
    set_topmost(hwnd, true);
    Some(AlwaysOnTopState { hwnd: hwnd.0 as isize })
}
