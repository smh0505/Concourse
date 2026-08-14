use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Manager};
use tiny_http::{Header, Method, Response, Server};

/// Fixed for this pass (not user-configurable in Settings yet) - the OBS plugin's own
/// settingsComponent shows this URL for the user to paste into a Browser Source.
pub const PORT: u16 = 47474;

struct NowPlaying {
    title: String,
    cover_url: Option<String>,
    /// Unix seconds - reused across calls for the *same* title (a plugin re-activating an
    /// already-active game shouldn't reset the clock), reset whenever the title actually
    /// changes. Sent to the client as-is; the elapsed-time display itself ticks client-side
    /// (see the served page's own <script>) rather than being recomputed server-side on every
    /// request, so it updates every second without needing a full page reload that often.
    started_at: u64,
}

/// What the locally-served page currently shows - `None` renders an idle placeholder. Updated
/// by `set_now_playing` (the `obs-presence` TS plugin's activate/deactivate), read fresh on
/// every HTTP request rather than pushed to the browser - simplest way to stay correct without
/// a websocket, at the cost of the page needing to poll/refresh itself for title/cover changes
/// (see the served HTML's own meta-refresh below).
pub struct ObsPresenceState(Mutex<Option<NowPlaying>>);

impl ObsPresenceState {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[tauri::command]
pub fn set_now_playing(
    state: tauri::State<ObsPresenceState>,
    title: Option<String>,
    cover_url: Option<String>,
) {
    let mut guard = state.0.lock().unwrap();
    *guard = title.map(|title| {
        let started_at = match guard.as_ref() {
            Some(existing) if existing.title == title => existing.started_at,
            _ => now_unix(),
        };
        NowPlaying { title, cover_url, started_at }
    });
}

fn render_page(now_playing: &Option<NowPlaying>) -> String {
    let body = match now_playing {
        Some(np) => {
            let cover = np
                .cover_url
                .as_ref()
                .map(|url| format!(r#"<img class="cover" src="{}">"#, html_escape(url)))
                .unwrap_or_default();
            format!(
                r#"{cover}<div class="info"><div class="title">{}</div><div class="elapsed" data-started="{}">0:00</div></div>"#,
                html_escape(&np.title),
                np.started_at,
            )
        }
        None => r#"<div class="idle">Not playing</div>"#.to_string(),
    };
    format!(
        r#"<!doctype html>
<html><head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="15">
<style>
  body {{ margin: 0; background: transparent; font-family: sans-serif; color: #fff;
          text-shadow: 0 1px 3px rgba(0,0,0,0.8); display: flex; align-items: center;
          justify-content: center; height: 100vh; }}
  .idle {{ opacity: 0.5; font-size: 1.2rem; }}
  .info {{ display: flex; flex-direction: column; gap: 0.15rem; }}
  .cover {{ width: 4rem; height: 4rem; object-fit: cover; border-radius: 0.3rem;
            margin-right: 0.75rem; }}
  .title {{ font-size: 2rem; }}
  .elapsed {{ font-size: 1.1rem; opacity: 0.8; font-variant-numeric: tabular-nums; }}
</style>
</head><body>{body}
<script>
  const el = document.querySelector(".elapsed");
  if (el) {{
    const started = Number(el.dataset.started);
    setInterval(() => {{
      const secs = Math.max(0, Math.floor(Date.now() / 1000 - started));
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      const pad = (n) => String(n).padStart(2, "0");
      el.textContent = h > 0 ? `${{h}}:${{pad(m)}}:${{pad(s)}}` : `${{m}}:${{pad(s)}}`;
    }}, 1000);
  }}
</script>
</body></html>"#
    )
}

/// JSON shape for `/status` - lets a streamer build a fully custom overlay in their own HTML/
/// CSS/JS instead of being stuck with `render_page`'s fixed layout.
#[derive(Serialize)]
struct NowPlayingStatus {
    title: Option<String>,
    cover_url: Option<String>,
    started_at: Option<u64>,
}

fn render_status_json(now_playing: &Option<NowPlaying>) -> String {
    let status = match now_playing {
        Some(np) => NowPlayingStatus {
            title: Some(np.title.clone()),
            cover_url: np.cover_url.clone(),
            started_at: Some(np.started_at),
        },
        None => NowPlayingStatus { title: None, cover_url: None, started_at: None },
    };
    serde_json::to_string(&status).unwrap_or_else(|_| "{}".to_string())
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
            let now_playing_snapshot = {
                let state = app.state::<ObsPresenceState>();
                let guard = state.0.lock().unwrap();
                guard.as_ref().map(|np| NowPlaying {
                    title: np.title.clone(),
                    cover_url: np.cover_url.clone(),
                    started_at: np.started_at,
                })
            };
            let is_status = *request.method() == Method::Get && request.url() == "/status";
            if is_status {
                let json = render_status_json(&now_playing_snapshot);
                let header =
                    Header::from_bytes(&b"Content-Type"[..], &b"application/json; charset=utf-8"[..])
                        .expect("static header is valid");
                let _ = request.respond(Response::from_string(json).with_header(header));
            } else {
                let html = render_page(&now_playing_snapshot);
                let header =
                    Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..])
                        .expect("static header is valid");
                let _ = request.respond(Response::from_string(html).with_header(header));
            }
        }
    });
}
