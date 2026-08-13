import { invoke } from "@tauri-apps/api/core";

import type { PresencePlugin } from "@/plugins/types";

// Milestone 28's original Rust-hardcoded integration, migrated into the real plugin kind
// Milestone 29 built. discord_presence.rs's set_presence/clear_presence functions themselves
// are unchanged - this just calls the two commands wrapping them (set_discord_presence/
// clear_discord_presence) instead of launcher.rs calling them inline.
const plugin: PresencePlugin = {
  id: "discord-presence",
  name: "Discord Rich Presence",
  activate: (gameTitle: string) => invoke("set_discord_presence", { title: gameTitle }),
  deactivate: () => invoke("clear_discord_presence"),
};

export default plugin;
