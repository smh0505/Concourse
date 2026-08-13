use std::sync::Mutex;

use tauri::{AppHandle, Manager};
use tiny_http::{Header, Response, Server};

/// Fixed for this pass (not user-configurable in Settings yet) - the OBS plugin's own
/// settingsComponent shows this URL for the user to paste into a Browser Source.
pub const PORT: u16 = 47474;

/// What the locally-served page currently shows - `None` renders an idle placeholder. Updated
/// by `set_now_playing` (the `obs-presence` TS plugin's activate/deactivate), read fresh on
/// every HTTP request rather than pushed to the browser - simplest way to stay correct without
/// a websocket, at the cost of the page needing to poll/refresh itself (see the served HTML's
/// own meta-refresh below).
pub struct ObsPresenceState(Mutex<Option<String>>);

impl ObsPresenceState {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}

#[tauri::command]
pub fn set_now_playing(state: tauri::State<ObsPresenceState>, title: Option<String>) {
    *state.0.lock().unwrap() = title;
}

fn render_page(title: &Option<String>) -> String {
    let body = match title {
        Some(t) => format!(r#"<div class="title">{}</div>"#, html_escape(t)),
        None => r#"<div class="idle">Not playing</div>"#.to_string(),
    };
    format!(
        r#"<!doctype html>
<html><head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="3">
<style>
  body {{ margin: 0; background: transparent; font-family: sans-serif; color: #fff;
          text-shadow: 0 1px 3px rgba(0,0,0,0.8); display: flex; align-items: center;
          justify-content: center; height: 100vh; font-size: 2rem; }}
  .idle {{ opacity: 0.5; font-size: 1.2rem; }}
</style>
</head><body>{body}</body></html>"#
    )
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// Starts once in `.setup()` and just stays up for the app's whole lifetime - no start/stop
/// lifecycle tied to a plugin being enabled, since the OBS plugin's activate/deactivate only
/// ever change *what the already-running server reports*, not whether it's listening at all.
/// Takes `AppHandle` (not a raw state reference) and re-fetches `ObsPresenceState` per request,
/// the same "go through the handle, not a borrowed reference" pattern this codebase's other
/// background threads (launcher.rs, quick_launch.rs) already use across thread boundaries.
pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        let server = match Server::http(("127.0.0.1", PORT)) {
            Ok(server) => server,
            Err(e) => {
                eprintln!("obs_presence: failed to bind 127.0.0.1:{PORT}: {e}");
                return;
            }
        };

        for request in server.incoming_requests() {
            let title = app.state::<ObsPresenceState>().0.lock().unwrap().clone();
            let html = render_page(&title);
            let header = Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..])
                .expect("static header is valid");
            let _ = request.respond(Response::from_string(html).with_header(header));
        }
    });
}
