use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Manager};
use tiny_http::{Header, Method, Response, Server};

/// Boot-time fallback - `set_obs_presence_port` can rebind later; `presence.ts` re-applies a
/// persisted custom port on every launch.
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

#[derive(Clone, Copy, PartialEq)]
enum Corner {
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
}

impl Corner {
    /// Fixed CSS position for `#card`, keeping it out of `body`'s own centering flex flow
    /// (which still centers the idle placeholder).
    fn css_position(self) -> &'static str {
        match self {
            Corner::TopLeft => "top: 2rem; left: 2rem;",
            Corner::TopRight => "top: 2rem; right: 2rem;",
            Corner::BottomLeft => "bottom: 2rem; left: 2rem;",
            Corner::BottomRight => "bottom: 2rem; right: 2rem;",
        }
    }

    /// Right-anchored corners reverse `.info`'s flex order so the cover art sits nearest the
    /// screen edge (same side the card itself is anchored to) instead of always on the left.
    fn is_right(self) -> bool {
        matches!(self, Corner::TopRight | Corner::BottomRight)
    }
}

/// "How it's presented" - orthogonal to `NowPlaying`. Alert mode needs no server-side "already
/// shown" tracking: the page's own script fades the card once `now - started_at` (a real
/// timestamp, not view history) exceeds `alert_seconds` - stays correct across meta-refreshes.
#[derive(Clone, Copy)]
struct OverlayStyle {
    template: Template,
    mode: Mode,
    alert_seconds: u64,
    corner: Corner,
}

impl Default for OverlayStyle {
    fn default() -> Self {
        Self {
            template: Template::Full,
            mode: Mode::Persistent,
            alert_seconds: 5,
            corner: Corner::BottomLeft,
        }
    }
}

struct NowPlaying {
    title: String,
    cover_url: Option<String>,
    /// Unix seconds - kept across calls for the *same* title so re-activating doesn't reset the
    /// clock; elapsed time itself ticks client-side (see the served page's <script>).
    started_at: u64,
}

/// What the locally-served page shows - `None` renders idle. Read fresh per request rather than
/// pushed to the browser, so the page polls/refreshes itself for changes instead.
pub struct ObsPresenceState {
    now_playing: Mutex<Option<NowPlaying>>,
    /// Swapped, not mutated in place, by `set_obs_presence_port` - a bind failure on the new
    /// port leaves the old one still serving. `unblock()` on the old `Server` ends its thread.
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
            let info_class = if style.corner.is_right() { " reverse" } else { "" };
            format!(
                r#"<div id="card" data-started="{}" style="{}"><div class="info{info_class}">{cover}<div class="text"><div class="title-wrap"><span class="title-inner">{}</span></div>{elapsed}</div></div></div>"#,
                np.started_at,
                style.corner.css_position(),
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
  #card {{ position: fixed; opacity: 1; transition: opacity 0.5s ease; display: flex; }}
  #card.faded {{ opacity: 0; }}
  .info {{ display: flex; align-items: center; gap: 0.75rem; }}
  .info.reverse {{ flex-direction: row-reverse; }}
  .cover {{ width: 4rem; height: 4rem; object-fit: cover; border-radius: 0.3rem; }}
  .text {{ display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }}
  .title-wrap {{ max-width: 16rem; overflow: hidden; white-space: nowrap; }}
  .title-inner {{ display: inline-block; font-size: 2rem; }}
  .title-inner.marquee {{
    animation: marquee-scroll linear infinite;
    animation-duration: var(--marquee-duration, 6s);
  }}
  @keyframes marquee-scroll {{
    0% {{ transform: translateX(0); }}
    100% {{ transform: translateX(var(--marquee-distance, 0)); }}
  }}
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

  const titleWrap = document.querySelector(".title-wrap");
  const titleInner = document.querySelector(".title-inner");
  if (titleWrap && titleInner) {{
    const overflow = titleInner.scrollWidth - titleWrap.clientWidth;
    // Skip the marquee entirely below a small overflow rather than clamping duration to a
    // minimum - a duration floor would speed up short overflows to hit it, breaking the
    // constant-speed (px/sec) scaling every other overflow amount gets.
    if (overflow > 20) {{
      titleInner.style.setProperty("--marquee-distance", `-${{overflow}}px`);
      titleInner.style.setProperty("--marquee-duration", `${{overflow / 30}}s`);
      titleInner.classList.add("marquee");
    }}
  }}
</script>
</body></html>"#
    )
}

/// JSON shape for `/status` - lets a streamer build a custom overlay instead of using
/// `render_page`'s fixed layout.
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

/// Runs until `server.unblock()` is called (port change) or the process exits. Shared by the
/// boot-time server and every later rebind.
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

/// Structured so `ObsPresenceSettings.vue` can build a localized "why" sentence instead of
/// splicing raw OS-language error text into a translated one. `raw` keeps that OS/HTTP text as
/// a secondary detail line rather than dropping it.
#[derive(Serialize)]
#[serde(tag = "kind")]
pub enum ObsPresenceError {
    BindFailed { port: u16, raw: String },
    Unreachable { port: u16, raw: String },
    BadStatus { port: u16, status: u16, raw: String },
}

/// Starts once in `.setup()` and stays up for the app's lifetime - activate/deactivate only
/// change what it reports, never whether it's listening.
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

/// Binds the new port *before* tearing down the old one, so a port already in use fails loudly
/// without taking down the currently-working overlay.
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

/// A real HTTP round trip to `/status`, not just a TCP-connect probe - proves the overlay
/// actually responds, not just that something owns the port.
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

/// Applies instantly - no bind/collision failure mode here, so no Apply-then-rebind dance needed.
#[tauri::command]
pub fn set_obs_overlay_style(
    app: AppHandle,
    template: String,
    mode: String,
    alert_seconds: u64,
    corner: String,
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
    let corner = match corner.as_str() {
        "top-left" => Corner::TopLeft,
        "top-right" => Corner::TopRight,
        "bottom-left" => Corner::BottomLeft,
        "bottom-right" => Corner::BottomRight,
        other => return Err(format!("Unknown overlay corner: {other}")),
    };
    let state = app.state::<ObsPresenceState>();
    let mut guard = state.style.lock().unwrap();
    *guard = OverlayStyle { template, mode, alert_seconds: alert_seconds.max(1), corner };
    Ok(())
}
