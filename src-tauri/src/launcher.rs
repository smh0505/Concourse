use sysinfo::{ProcessesToUpdate, System};
use tauri::{AppHandle, Emitter};

#[derive(Clone, serde::Serialize)]
pub struct GameSessionStarted {
    game_id: i64,
    title: String,
}

#[derive(Clone, serde::Serialize)]
pub struct GameSessionEnded {
    game_id: i64,
    start_time: String,
    end_time: String,
    duration_seconds: i64,
}

#[tauri::command]
pub fn launch_game(
    app: AppHandle,
    game_id: i64,
    executable_path: String,
    title: String,
    pseudo_fullscreen: bool,
    always_on_top: bool,
) -> Result<(), String> {
    let mut child = std::process::Command::new(&executable_path)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to launch {}: {}", executable_path, e))?;
    let pid = child.id();

    // Emitted here (not by the frontend right after invoking this command) so it fires at the
    // same confirmed-running moment `track_folder_playtime` below fires its own copy - a plugin
    // (presence.ts) reacting to this shouldn't have to know launch_game and track_folder_playtime
    // detect "started" completely differently.
    let _ = app.emit("game-session-started", GameSessionStarted { game_id, title });

    let start = std::time::SystemTime::now();
    let start_time = unix_timestamp(start);

    std::thread::spawn(move || {
        // Applied here, not before spawn returns - needs the game's own window, which doesn't
        // exist until moments after the process starts.
        let mut fullscreen_state = if pseudo_fullscreen {
            crate::pseudo_fullscreen::apply(|| vec![pid])
        } else {
            None
        };
        let mut topmost_state = if always_on_top { crate::always_on_top::apply(|| vec![pid]) } else { None };

        if pseudo_fullscreen || always_on_top {
            // Polls instead of a single blocking child.wait() so a launcher window closing and
            // being replaced by the real game window (same process, new HWND) still gets caught.
            loop {
                match child.try_wait() {
                    Ok(Some(_)) => break,
                    Ok(None) => {
                        if pseudo_fullscreen {
                            fullscreen_state = crate::pseudo_fullscreen::refresh(fullscreen_state, || vec![pid]);
                        }
                        if always_on_top {
                            topmost_state = crate::always_on_top::refresh(topmost_state, || vec![pid]);
                        }
                        std::thread::sleep(std::time::Duration::from_secs(3));
                    }
                    Err(_) => break,
                }
            }
        } else {
            let _ = child.wait();
        }

        if let Some(state) = fullscreen_state {
            crate::pseudo_fullscreen::revert(state);
        }
        if let Some(state) = topmost_state {
            crate::always_on_top::revert(state);
        }

        let end = std::time::SystemTime::now();
        let duration_seconds = end
            .duration_since(start)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let _ = app.emit(
            "game-session-ended",
            GameSessionEnded {
                game_id,
                start_time,
                end_time: unix_timestamp(end),
                duration_seconds,
            },
        );
    });

    Ok(())
}

fn unix_timestamp(t: std::time::SystemTime) -> String {
    let secs = t
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    secs.to_string()
}

fn normalize_path_for_comparison(path: &str) -> String {
    path.replace('/', "\\")
        .trim_end_matches('\\')
        .to_lowercase()
}

fn any_process_under_folder(system: &mut System, install_dir: &str) -> bool {
    find_process_under_folder(system, install_dir).is_some()
}

/// Same match as `any_process_under_folder`, but returns the matched process's PID - Milestone
/// 39 needs a real PID to find the game's window, not just a yes/no.
fn find_process_under_folder(system: &mut System, install_dir: &str) -> Option<u32> {
    all_processes_under_folder(system, install_dir).into_iter().next()
}

/// Every currently-running PID under the install folder, not just the first - the pseudo-
/// fullscreen window search needs to try all of them, since the first match (a launcher stub,
/// an anti-cheat helper) frequently doesn't own the game's window. `find_process_under_folder`'s
/// single-PID version stays separate (fine for the game-session-started emit).
fn all_processes_under_folder(system: &mut System, install_dir: &str) -> Vec<u32> {
    system.refresh_processes(ProcessesToUpdate::All, true);
    system
        .processes()
        .iter()
        .filter(|(_, process)| {
            process
                .exe()
                .and_then(|exe| exe.to_str())
                .map(|exe| normalize_path_for_comparison(exe).starts_with(install_dir))
                .unwrap_or(false)
        })
        .map(|(pid, _)| pid.as_u32())
        .collect()
}

/// Tracks playtime for URI-launched games (Steam/Epic/GOG), where we hold no child process
/// handle. Mirrors Playnite's "Folder" tracking mode: poll running processes and treat any
/// whose exe path falls under the game's known install folder as "running".
#[tauri::command]
pub fn track_folder_playtime(
    app: AppHandle,
    game_id: i64,
    install_dir: String,
    title: String,
    pseudo_fullscreen: bool,
    always_on_top: bool,
) {
    let install_dir = normalize_path_for_comparison(&install_dir);

    std::thread::spawn(move || {
        const POLL_INTERVAL: std::time::Duration = std::time::Duration::from_secs(3);
        const MATCH_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(120);
        // Survives a brief process handoff (e.g. launcher relays to the real game exe)
        // without treating that gap as the end of the session.
        const MISSING_GRACE_POLLS: u32 = 2;

        let mut system = System::new();

        // Phase 1: wait for the game to actually start.
        let wait_start = std::time::Instant::now();
        loop {
            if find_process_under_folder(&mut system, &install_dir).is_some() {
                break;
            }
            if wait_start.elapsed() > MATCH_TIMEOUT {
                return;
            }
            std::thread::sleep(POLL_INTERVAL);
        }

        // Only now (not on command call, which fires right after openUrl() - before the game
        // window necessarily even exists) is this actually confirmed running.
        let _ = app.emit("game-session-started", GameSessionStarted { game_id, title });

        // Re-scans for every matching process on each retry tick (not just the one first seen in
        // Phase 1 above) - the real game window frequently belongs to a different process than
        // whichever one happened to match the folder first (a launcher stub, an anti-cheat
        // helper), and it may not even exist yet at this exact moment.
        let mut fullscreen_state = if pseudo_fullscreen {
            crate::pseudo_fullscreen::apply(|| all_processes_under_folder(&mut system, &install_dir))
        } else {
            None
        };
        let mut topmost_state = if always_on_top {
            crate::always_on_top::apply(|| all_processes_under_folder(&mut system, &install_dir))
        } else {
            None
        };

        let start = std::time::SystemTime::now();
        let start_time = unix_timestamp(start);

        // Phase 2: wait for the game to exit.
        let mut missing_polls = 0;
        loop {
            std::thread::sleep(POLL_INTERVAL);
            // Piggybacked on this same poll tick rather than a separate timer.
            if pseudo_fullscreen {
                fullscreen_state = crate::pseudo_fullscreen::refresh(fullscreen_state, || {
                    all_processes_under_folder(&mut system, &install_dir)
                });
            }
            if always_on_top {
                topmost_state = crate::always_on_top::refresh(topmost_state, || {
                    all_processes_under_folder(&mut system, &install_dir)
                });
            }
            if any_process_under_folder(&mut system, &install_dir) {
                missing_polls = 0;
            } else {
                missing_polls += 1;
                if missing_polls >= MISSING_GRACE_POLLS {
                    break;
                }
            }
        }

        if let Some(state) = fullscreen_state {
            crate::pseudo_fullscreen::revert(state);
        }
        if let Some(state) = topmost_state {
            crate::always_on_top::revert(state);
        }

        let end = std::time::SystemTime::now();
        let duration_seconds = end
            .duration_since(start)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let _ = app.emit(
            "game-session-ended",
            GameSessionEnded {
                game_id,
                start_time,
                end_time: unix_timestamp(end),
                duration_seconds,
            },
        );
    });
}
