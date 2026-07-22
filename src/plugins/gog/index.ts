import { invoke } from "@tauri-apps/api/core";
import type { GameEntry, SourcePlugin } from "../types";

interface GogApp {
  game_id: string;
  name: string;
  install_dir: string;
}

function gameIdFromEntryId(id: string): string {
  return id.replace(/^gog-/, "");
}

function toGameEntry(app: GogApp): GameEntry {
  return {
    id: `gog-${app.game_id}`,
    title: app.name,
    // GOG has no registered URI scheme - GalaxyClient.exe is invoked directly with
    // CLI flags (/gameid/command runGame), so this pseudo-URI only exists to route
    // through invoke("launch_gog_game", ...) in the library store instead of openUrl().
    executablePath: `gog://${app.game_id}`,
    platform: "gog",
    installDir: app.install_dir,
  };
}

const plugin: SourcePlugin = {
  id: "gog",
  name: "GOG",

  async scan(): Promise<GameEntry[]> {
    const apps = await invoke<GogApp[]>("find_gog_apps");
    return apps.map(toGameEntry);
  },

  async launch(entry: GameEntry): Promise<void> {
    await invoke("launch_gog_game", { gameId: gameIdFromEntryId(entry.id) });
  },

  async getInstallStatus(entry: GameEntry): Promise<boolean> {
    const gameId = gameIdFromEntryId(entry.id);
    const apps = await invoke<GogApp[]>("find_gog_apps");
    return apps.some((app) => app.game_id === gameId);
  },
};

export default plugin;
