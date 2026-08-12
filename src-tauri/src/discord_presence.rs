use std::sync::Mutex;

use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};

/// TODO: replace with the real Discord Application ID (create one at
/// discord.com/developers/applications). Safe to hardcode once obtained - unlike a metadata
/// provider's API key/secret, this is a public identifier with no attached permission; Discord
/// Rich Presence works entirely over local IPC against whichever Discord client is already
/// logged in on this machine, no network auth or per-user credential involved. One shared ID
/// for every Concourse install, same as how every other app with Rich Presence does this.
const DISCORD_CLIENT_ID: &str = "REPLACE_WITH_DISCORD_APPLICATION_ID";

/// Lazily connected on first use and reused across launches rather than reconnecting every
/// time - `None` both before the first attempt and after any failed/dropped connection (Discord
/// not running), so every call site quietly no-ops instead of erroring.
pub struct DiscordPresenceState(Mutex<Option<DiscordIpcClient>>);

impl DiscordPresenceState {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}

/// Connects (if not already connected) and returns whether a client is now available - `false`
/// means Discord isn't running or the client_id above is still the placeholder.
fn ensure_connected(guard: &mut Option<DiscordIpcClient>) -> bool {
    if guard.is_none() {
        let mut client = DiscordIpcClient::new(DISCORD_CLIENT_ID);
        if client.connect().is_ok() {
            *guard = Some(client);
        }
    }
    guard.is_some()
}

pub fn set_presence(state: &DiscordPresenceState, title: &str) {
    let mut guard = state.0.lock().unwrap();
    if !ensure_connected(&mut guard) {
        return;
    }
    let client = guard.as_mut().unwrap();
    let activity = activity::Activity::new().state("In Library").details(title);
    // A failed send means the connection has gone stale (e.g. Discord was closed while
    // Concourse kept running) - clearing it back to None makes the next call reconnect fresh
    // instead of silently failing forever against a dead client.
    if client.set_activity(activity).is_err() {
        *guard = None;
    }
}

pub fn clear_presence(state: &DiscordPresenceState) {
    let mut guard = state.0.lock().unwrap();
    if !ensure_connected(&mut guard) {
        return;
    }
    let client = guard.as_mut().unwrap();
    if client.clear_activity().is_err() {
        *guard = None;
    }
}
