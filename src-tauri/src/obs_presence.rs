use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Manager};
use tiny_http::{Header, Method, Response, Server};

/// Boot-time default - actually-active port lives in `ObsPresenceState.port`, since
/// `set_obs_presence_port` can rebind it later. The server always starts on this port so a
/// fresh install has a working overlay before Settings is ever opened; a persisted custom port
/// (see `ObsPresenceSettings.vue`) is re-applied by `presence.ts`'s `init()` on every launch.
pub const DEFAULT_PORT: u16 = 47474;

#[derive(Clone, Copy, PartialEq)]
enum Template {
    Minimal,
    Full,
}

#[derive(Clone, Copy, PartialEq)]
enum Mode {
    Persistent,
    Alert,
}

/// "How it's presented" - orthogonal to `NowPlaying` ("what's currently playing"), so changing
/// style never touches activation state and vice versa. Alert mode needs no server-side "have I
/// already shown this" tracking: the served page's own script computes `now - started_at`
/// client-side every second (same clock the elapsed-time display already uses) and fades the
/// card out once that exceeds `alert_seconds` - correct even across the page's own meta-refresh
/// reloads, since it's derived from a real timestamp, not view history.
#[derive(Clone, Copy)]
struct OverlayStyle {
    template: Template,
    mode: Mode,
    alert_seconds: u64,
}

impl Default for OverlayStyle {
    fn default() -> Self {
        Self { template: Template::Full, mode: Mode::Persistent, alert_seconds: 5 }
    }
}

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
pub struct ObsPresenceState {
    now_playing: Mutex<Option<NowPlaying>>,
    /// Current listener - swapped out (not mutated in place) by `set_obs_presence_port`, so a
    /// bind failure on the new port leaves the old one still serving. `Arc` so both this state
    /// and the serving thread can hold a reference; `unblock()` on the old `Server` is what ends
    /// its thread's `incoming_requests()` loop when it's replaced.
    server: Mutex<Option<Arc<Server>>>,
    style: Mutex<OverlayStyle>,
}

impl ObsPresenceState {
    pub fn new() -> Self {
        Self {
            now_playing: Mutex::new(None),
            server: Mutex::new(None),
            style: Mutex::new(OverlayStyle::default()),
        }
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
    let mut guard = state.now_playing.lock().unwrap();
    *guard = title.map(|title| {
        let started_at = match guard.as_ref() {
            Some(existing) if existing.title == title => existing.started_at,
            _ => now_unix(),
        };
        NowPlaying { title, cover_url, started_at }
    });
}

fn render_page(now_playing: &Option<NowPlaying>, style: &OverlayStyle) -> String {
    let body = match now_playing {
        Some(np) => {
            let cover = if style.template == Template::Full {
                np.cover_url
                    .as_ref()
                    .map(|url| format!(r#"<img class="cover" src="{}">"#, html_escape(url)))
                    .unwrap_or_default()
            } else {
                String::new()
            };
            let elapsed = if style.template == Template::Full {
                format!(r#"<div class="elapsed" data-started="{}">0:00</div>"#, np.started_at)
            } else {
                String::new()
            };
            format!(
                r#"<div id="card" data-started="{}"><div class="info">{cover}<div class="title">{}</div>{elapsed}</div></div>"#,
                np.started_at,
                html_escape(&np.title),
            )
        }
        None => r#"<div class="idle">Not playing</div>"#.to_string(),
    };
    let is_alert = style.mode == Mode::Alert;
    let alert_seconds = style.alert_seconds;
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
  #card {{ opacity: 1; transition: opacity 0.5s ease; display: flex; }}
  #card.faded {{ opacity: 0; }}
  .info {{ display: flex; align-items: center; gap: 0.75rem; }}
  .cover {{ width: 4rem; height: 4rem; object-fit: cover; border-radius: 0.3rem; }}
  .title {{ font-size: 2rem; }}
  .elapsed {{ font-size: 1.1rem; opacity: 0.8; font-variant-numeric: tabular-nums; }}
</style>
</head><body>{body}
<script>
  const card = document.getElementById("card");
  const el = document.querySelector(".elapsed");
  const isAlert = {is_alert};
  const alertSeconds = {alert_seconds};
  if (card) {{
    const started = Number(card.dataset.started);
    const tick = () => {{
      const secs = Math.max(0, Math.floor(Date.now() / 1000 - started));
      if (el) {{
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        const pad = (n) => String(n).padStart(2, "0");
        el.textContent = h > 0 ? `${{h}}:${{pad(m)}}:${{pad(s)}}` : `${{m}}:${{pad(s)}}`;
      }}
      if (isAlert) card.classList.toggle("faded", secs >= alertSeconds);
    }};
    tick();
    setInterval(tick, 1000);
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

/// Runs on its own thread for as long as `server` stays bound - ends when `server.unblock()` is
/// called elsewhere (port change) or the process exits. Shared by both the initial boot-time
/// server and every later rebind from `set_obs_presence_port`.
fn serve(app: AppHandle, server: Arc<Server>) {
    for request in server.incoming_requests() {
        let state = app.state::<ObsPresenceState>();
        let now_playing_snapshot = {
            let guard = state.now_playing.lock().unwrap();
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
            let style = *state.style.lock().unwrap();
            let html = render_page(&now_playing_snapshot, &style);
            let header = Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..])
                .expect("static header is valid");
            let _ = request.respond(Response::from_string(html).with_header(header));
        }
    }
}

/// Structured so `ObsPresenceSettings.vue` can build its own localized "why" sentence instead of
/// splicing an OS-language error string (Windows' own, not this app's i18n) into an otherwise-
/// translated one. `raw` still carries the underlying OS/HTTP error text, shown as a secondary
/// detail line rather than dropped - it's what actually let this session's port-1094/1420 cases
/// get diagnosed, no reason to hide it, just not let it be the *only* message.
#[derive(Serialize)]
#[serde(tag = "kind")]
pub enum ObsPresenceError {
    BindFailed { port: u16, raw: String },
    Unreachable { port: u16, raw: String },
    BadStatus { port: u16, status: u16, raw: String },
}

/// Starts once in `.setup()` and just stays up for the app's whole lifetime - no start/stop
/// lifecycle tied to a plugin being enabled, since the OBS plugin's activate/deactivate only
/// ever change *what the already-running server reports*, not whether it's listening at all.
pub fn start(app: AppHandle, port: u16) {
    let server = match Server::http(("127.0.0.1", port)) {
        Ok(server) => Arc::new(server),
        Err(e) => {
            eprintln!("obs_presence: failed to bind 127.0.0.1:{port}: {e}");
            return;
        }
    };
    *app.state::<ObsPresenceState>().server.lock().unwrap() = Some(server.clone());
    let app_for_thread = app.clone();
    std::thread::spawn(move || serve(app_for_thread, server));
}

/// Rebinds the overlay server to a new port, called from `ObsPresenceSettings.vue`'s Apply
/// button (and once at startup by `presence.ts` if a non-default port was persisted last
/// session). Binds the new port *before* tearing down the old one, so a port already in use by
/// something else fails loudly without taking down the currently-working overlay.
#[tauri::command]
pub fn set_obs_presence_port(app: AppHandle, port: u16) -> Result<(), ObsPresenceError> {
    let new_server = Server::http(("127.0.0.1", port)).map(Arc::new).map_err(|e| {
        ObsPresenceError::BindFailed { port, raw: e.to_string() }
    })?;

    let old_server = {
        let state = app.state::<ObsPresenceState>();
        let mut guard = state.server.lock().unwrap();
        guard.replace(new_server.clone())
    };
    if let Some(old_server) = old_server {
        old_server.unblock();
    }

    let app_for_thread = app.clone();
    std::thread::spawn(move || serve(app_for_thread, new_server));
    Ok(())
}

/// Backs the Settings panel's "Test" button - a real HTTP round trip to `/status` on the given
/// port, not just a "does something own this port" TCP probe, so it actually proves the overlay
/// responds and not merely that some other process is squatting the port.
#[tauri::command]
pub fn test_obs_presence_port(port: u16) -> Result<(), ObsPresenceError> {
    let url = format!("http://127.0.0.1:{port}/status");
    let response = reqwest::blocking::Client::new()
        .get(&url)
        .timeout(Duration::from_secs(3))
        .send()
        .map_err(|e| ObsPresenceError::Unreachable { port, raw: e.to_string() })?;
    if response.status().is_success() {
        Ok(())
    } else {
        Err(ObsPresenceError::BadStatus {
            port,
            status: response.status().as_u16(),
            raw: response.status().to_string(),
        })
    }
}

/// Applies instantly - unlike the port, there's no bind/collision failure mode here, so no
/// Apply-then-rebind dance is needed; `ObsPresenceSettings.vue` calls this directly on change.
#[tauri::command]
pub fn set_obs_overlay_style(
    app: AppHandle,
    template: String,
    mode: String,
    alert_seconds: u64,
) -> Result<(), String> {
    let template = match template.as_str() {
        "minimal" => Template::Minimal,
        "full" => Template::Full,
        other => return Err(format!("Unknown overlay template: {other}")),
    };
    let mode = match mode.as_str() {
        "persistent" => Mode::Persistent,
        "alert" => Mode::Alert,
        other => return Err(format!("Unknown overlay mode: {other}")),
    };
    let state = app.state::<ObsPresenceState>();
    let mut guard = state.style.lock().unwrap();
    *guard = OverlayStyle { template, mode, alert_seconds: alert_seconds.max(1) };
    Ok(())
}
