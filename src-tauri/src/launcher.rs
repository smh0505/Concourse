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
