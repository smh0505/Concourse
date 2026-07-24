use sysinfo::{ProcessesToUpdate, System};
use tauri::{AppHandle, Emitter};

#[derive(Clone, serde::Serialize)]
pub struct GameSessionEnded {
    game_id: i64,
    start_time: String,
    end_time: String,
    duration_seconds: i64,
}

#[tauri::command]
pub fn launch_game(app: AppHandle, game_id: i64, executable_path: String) -> Result<(), String> {
    let mut child = std::process::Command::new(&executable_path)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to launch {}: {}", executable_path, e))?;

    let start = std::time::SystemTime::now();
    let start_time = unix_timestamp(start);

    std::thread::spawn(move || {
        let _ = child.wait();
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
    path.replace('/', "\\").trim_end_matches('\\').to_lowercase()
}

fn any_process_under_folder(system: &mut System, install_dir: &str) -> bool {
    system.refresh_processes(ProcessesToUpdate::All, true);
    system.processes().values().any(|process| {
        process
            .exe()
            .and_then(|exe| exe.to_str())
            .map(|exe| normalize_path_for_comparison(exe).starts_with(install_dir))
            .unwrap_or(false)
    })
}

/// Tracks playtime for URI-launched games (Steam/Epic/GOG), where we hold no child process
/// handle. Mirrors Playnite's "Folder" tracking mode: poll running processes and treat any
/// whose exe path falls under the game's known install folder as "running".
#[tauri::command]
pub fn track_folder_playtime(app: AppHandle, game_id: i64, install_dir: String) {
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
            if any_process_under_folder(&mut system, &install_dir) {
                break;
            }
            if wait_start.elapsed() > MATCH_TIMEOUT {
                return;
            }
            std::thread::sleep(POLL_INTERVAL);
        }

        let start = std::time::SystemTime::now();
        let start_time = unix_timestamp(start);

        // Phase 2: wait for the game to exit.
        let mut missing_polls = 0;
        loop {
            std::thread::sleep(POLL_INTERVAL);
            if any_process_under_folder(&mut system, &install_dir) {
                missing_polls = 0;
            } else {
                missing_polls += 1;
                if missing_polls >= MISSING_GRACE_POLLS {
                    break;
                }
            }
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
