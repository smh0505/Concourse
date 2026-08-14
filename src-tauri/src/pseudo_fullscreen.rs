//! Milestone 39 - borderless pseudo-fullscreen. Built-in feature, not a plugin (see
//! milestones.md for why): strips a game window's border/title bar and resizes it to fit the
//! display it opened on while preserving its own aspect ratio, filling the remaining margin
//! with a plain black overlay window instead of stretching the image.
//!
//! Everything here runs synchronously on whichever background thread already owns tracking that
//! game's session (`launcher.rs`'s `launch_game`/`track_folder_playtime` threads) - the `HWND`s
//! involved are raw pointers (not `Send`), so this deliberately never needs to cross threads
//! except via the dedicated overlay-window thread `spawn_overlay` owns internally.

use std::thread::JoinHandle;
use std::time::Duration;

use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{COLORREF, HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{
    CreateSolidBrush, GetMonitorInfoW, MonitorFromWindow, HBRUSH, MONITORINFO,
    MONITOR_DEFAULTTONEAREST,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, EnumWindows, GetClientRect,
    GetMessageW, GetWindowLongPtrW, GetWindowRect, GetWindowThreadProcessId, IsWindowVisible,
    PostMessageW, PostQuitMessage, RegisterClassExW, SetWindowLongPtrW, SetWindowPos,
    TranslateMessage, CS_HREDRAW, CS_VREDRAW, GWL_STYLE, MSG, SWP_FRAMECHANGED, SWP_NOACTIVATE,
    SWP_NOSIZE, SWP_NOZORDER, WM_CLOSE, WM_DESTROY, WNDCLASSEXW, WS_CAPTION, WS_EX_NOACTIVATE,
    WS_EX_TOOLWINDOW, WS_POPUP, WS_THICKFRAME, WS_VISIBLE,
};

/// State needed to put a game's window back the way it was, plus the overlay to tear down.
pub struct PseudoFullscreenState {
    game_hwnd: isize,
    original_style: isize,
    original_rect: RECT,
    overlay_hwnd: isize,
    overlay_thread: JoinHandle<()>,
}

extern "system" fn find_window_proc(hwnd: HWND, lparam: LPARAM) -> windows::core::BOOL {
    unsafe {
        let state = &mut *(lparam.0 as *mut (u32, Option<isize>));
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == state.0 && IsWindowVisible(hwnd).as_bool() {
            state.1 = Some(hwnd.0 as isize);
            return windows::core::BOOL(0);
        }
        windows::core::BOOL(1)
    }
}

fn find_window_for_pid(pid: u32) -> Option<HWND> {
    let mut state: (u32, Option<isize>) = (pid, None);
    unsafe {
        let _ = EnumWindows(Some(find_window_proc), LPARAM(&mut state as *mut _ as isize));
    }
    state.1.map(|raw| HWND(raw as *mut _))
}

/// Retries for ~5s, re-evaluating `candidate_pids` fresh on every attempt rather than fixing on
/// one PID up front. For a folder-tracked (URI-launched) game, "the process running under this
/// install folder" is frequently *not* the one process that owns the actual game window - a
/// launcher stub, an anti-cheat helper, or a 32-bit bootstrap can share the same folder and get
/// matched first, and none of those own any window at all. Checking every currently-running
/// candidate each tick (not just the first one ever seen) finds the real one once it exists,
/// even if it starts after some other process under the same folder already has.
fn wait_for_window(mut candidate_pids: impl FnMut() -> Vec<u32>) -> Option<HWND> {
    for _ in 0..20 {
        for pid in candidate_pids() {
            if let Some(hwnd) = find_window_for_pid(pid) {
                return Some(hwnd);
            }
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    None
}

/// Contain-fit `content` inside `bounds`, centered, preserving `content`'s own aspect ratio.
fn letterbox_rect(bounds: RECT, content_w: i32, content_h: i32) -> RECT {
    let bounds_w = bounds.right - bounds.left;
    let bounds_h = bounds.bottom - bounds.top;
    if content_w <= 0 || content_h <= 0 || bounds_w <= 0 || bounds_h <= 0 {
        return bounds;
    }
    let scale = f64::min(bounds_w as f64 / content_w as f64, bounds_h as f64 / content_h as f64);
    let w = (content_w as f64 * scale).round() as i32;
    let h = (content_h as f64 * scale).round() as i32;
    let x = bounds.left + (bounds_w - w) / 2;
    let y = bounds.top + (bounds_h - h) / 2;
    RECT { left: x, top: y, right: x + w, bottom: y + h }
}

extern "system" fn overlay_wndproc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    unsafe {
        if msg == WM_DESTROY {
            PostQuitMessage(0);
            return LRESULT(0);
        }
        DefWindowProcW(hwnd, msg, wparam, lparam)
    }
}

const OVERLAY_CLASS_NAME: PCWSTR = w!("ConcoursePseudoFullscreenOverlay");

/// Runs a full window + message-loop lifecycle on its own dedicated thread - a Win32 window must
/// be pumped from the thread that created it, and that thread can't be the one already busy
/// waiting on the game process in `launcher.rs`. `PostMessageW(WM_CLOSE)` from outside this
/// thread is how the caller asks it to tear down and exit.
fn spawn_overlay(bounds: RECT, insert_after: HWND) -> (isize, JoinHandle<()>) {
    let (tx, rx) = std::sync::mpsc::channel::<isize>();
    let insert_after_raw = insert_after.0 as isize;

    let thread = std::thread::spawn(move || unsafe {
        let hinstance = windows::Win32::System::LibraryLoader::GetModuleHandleW(None)
            .map(|h| windows::Win32::Foundation::HINSTANCE(h.0))
            .unwrap_or_default();

        let class = WNDCLASSEXW {
            cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(overlay_wndproc),
            hInstance: hinstance,
            hbrBackground: HBRUSH(CreateSolidBrush(COLORREF(0)).0),
            lpszClassName: OVERLAY_CLASS_NAME,
            ..Default::default()
        };
        // Ignore the error - re-registering an already-registered class fails harmlessly, and
        // this overlay is created/destroyed potentially many times across a session.
        let _ = RegisterClassExW(&class);

        let hwnd = match CreateWindowExW(
            WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
            OVERLAY_CLASS_NAME,
            w!("Concourse Pseudo-Fullscreen Overlay"),
            WS_POPUP | WS_VISIBLE,
            bounds.left,
            bounds.top,
            bounds.right - bounds.left,
            bounds.bottom - bounds.top,
            None,
            None,
            Some(hinstance),
            None,
        ) {
            Ok(hwnd) => hwnd,
            Err(_) => {
                let _ = tx.send(0);
                return;
            }
        };

        let insert_after = if insert_after_raw != 0 {
            Some(HWND(insert_after_raw as *mut _))
        } else {
            None
        };
        let _ = SetWindowPos(hwnd, insert_after, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOACTIVATE);

        let _ = tx.send(hwnd.0 as isize);

        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    });

    let hwnd = rx.recv().unwrap_or(0);
    (hwnd, thread)
}

/// Finds the game's window, strips its title bar/border, resizes it (not stretches - the game's
/// own client content keeps its real aspect ratio) to fit letterboxed within whichever display
/// it opened on, and drops a black overlay behind it to cover the margin. Returns `None` (a
/// no-op) if no window turns up among `candidate_pids` in time - never blocks the caller's own
/// session tracking indefinitely. `candidate_pids` is re-evaluated on every retry tick (see
/// `wait_for_window`) - pass a closure that returns just the one known PID for a direct-exe
/// launch, or one that re-scans for every process under an install folder for a URI-launched one.
pub fn apply(candidate_pids: impl FnMut() -> Vec<u32>) -> Option<PseudoFullscreenState> {
    let hwnd = wait_for_window(candidate_pids)?;

    unsafe {
        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut monitor_info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
        let _ = GetMonitorInfoW(monitor, &mut monitor_info);
        let monitor_rect = monitor_info.rcMonitor;

        let mut client_rect = RECT::default();
        let _ = GetClientRect(hwnd, &mut client_rect);
        let content_w = client_rect.right - client_rect.left;
        let content_h = client_rect.bottom - client_rect.top;

        let mut original_rect = RECT::default();
        let _ = GetWindowRect(hwnd, &mut original_rect);
        let original_style = GetWindowLongPtrW(hwnd, GWL_STYLE);

        let new_style = original_style & !((WS_CAPTION.0 | WS_THICKFRAME.0) as isize);
        SetWindowLongPtrW(hwnd, GWL_STYLE, new_style);

        let target = letterbox_rect(monitor_rect, content_w, content_h);
        let _ = SetWindowPos(
            hwnd,
            None,
            target.left,
            target.top,
            target.right - target.left,
            target.bottom - target.top,
            SWP_FRAMECHANGED | SWP_NOZORDER | SWP_NOACTIVATE,
        );

        let (overlay_hwnd, overlay_thread) = spawn_overlay(monitor_rect, hwnd);

        Some(PseudoFullscreenState {
            game_hwnd: hwnd.0 as isize,
            original_style,
            original_rect,
            overlay_hwnd,
            overlay_thread,
        })
    }
}

/// Restores the game window's original style/position and tears down the overlay. Safe to call
/// even if the game already closed its window - the underlying Win32 calls just no-op/fail
/// silently on a stale handle rather than panicking.
pub fn revert(state: PseudoFullscreenState) {
    unsafe {
        let hwnd = HWND(state.game_hwnd as *mut _);
        SetWindowLongPtrW(hwnd, GWL_STYLE, state.original_style);
        let _ = SetWindowPos(
            hwnd,
            None,
            state.original_rect.left,
            state.original_rect.top,
            state.original_rect.right - state.original_rect.left,
            state.original_rect.bottom - state.original_rect.top,
            SWP_FRAMECHANGED | SWP_NOZORDER | SWP_NOACTIVATE,
        );

        if state.overlay_hwnd != 0 {
            let overlay = HWND(state.overlay_hwnd as *mut _);
            let _ = PostMessageW(Some(overlay), WM_CLOSE, WPARAM(0), LPARAM(0));
        }
    }
    let _ = state.overlay_thread.join();
}
