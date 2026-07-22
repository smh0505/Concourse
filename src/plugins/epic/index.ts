import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { GameEntry, SourcePlugin } from "../types";

interface EpicApp {
  app_name: string;
  display_name: string;
  install_location: string;
}

function appNameFromEntryId(id: string): string {
  return id.replace(/^epic-/, "");
}

function toGameEntry(app: EpicApp): GameEntry {
  return {
    id: `epic-${app.app_name}`,
    title: app.display_name,
    // Launched via Epic's own protocol handler, not a direct executable path - Epic
    // doesn't expose the resolved launch executable/args locally, only the install
    // folder, so the client has to resolve and run it the same way it would itself.
    executablePath: `com.epicgames.launcher://apps/${app.app_name}?action=launch&silent=true`,
    platform: "epic",
    installDir: app.install_location,
  };
}

const plugin: SourcePlugin = {
  id: "epic",
  name: "Epic Games",

  async scan(): Promise<GameEntry[]> {
    const apps = await invoke<EpicApp[]>("find_epic_apps");
    return apps.map(toGameEntry);
  },

  async launch(entry: GameEntry): Promise<void> {
    await openUrl(entry.executablePath);
  },

  async getInstallStatus(entry: GameEntry): Promise<boolean> {
    const appName = appNameFromEntryId(entry.id);
    const apps = await invoke<EpicApp[]>("find_epic_apps");
    return apps.some((app) => app.app_name === appName);
  },
};

export default plugin;
