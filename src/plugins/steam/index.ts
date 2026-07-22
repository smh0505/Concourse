import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { GameEntry, SourcePlugin } from "../types";

interface SteamApp {
  app_id: string;
  name: string;
  install_dir: string;
  library_path: string;
}

function appIdFromEntryId(id: string): string {
  return id.replace(/^steam-/, "");
}

function toGameEntry(app: SteamApp): GameEntry {
  return {
    id: `steam-${app.app_id}`,
    title: app.name,
    // Launched via Steam's own protocol handler, not a direct executable path,
    // so the client handles overlay/DRM/updates the same as launching from Steam itself.
    executablePath: `steam://rungameid/${app.app_id}`,
    platform: "steam",
    installDir: `${app.library_path}\\steamapps\\common\\${app.install_dir}`,
  };
}

const plugin: SourcePlugin = {
  id: "steam",
  name: "Steam",

  async scan(): Promise<GameEntry[]> {
    const apps = await invoke<SteamApp[]>("find_steam_apps");
    return apps.map(toGameEntry);
  },

  async launch(entry: GameEntry): Promise<void> {
    await openUrl(entry.executablePath);
  },

  async getInstallStatus(entry: GameEntry): Promise<boolean> {
    const appId = appIdFromEntryId(entry.id);
    const apps = await invoke<SteamApp[]>("find_steam_apps");
    return apps.some((app) => app.app_id === appId);
  },
};

export default plugin;
