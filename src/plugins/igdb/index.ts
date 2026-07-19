import { invoke } from "@tauri-apps/api/core";
import { settings as settingsRepo } from "../../db";
import type { MetadataProviderPlugin, MetadataResult } from "../types";
import IgdbSettingsForm from "./IgdbSettingsForm.vue";

const IGDB_CLIENT_ID_SETTING = "igdb_client_id";
const IGDB_CLIENT_SECRET_SETTING = "igdb_client_secret";

interface IgdbMetadataResponse {
  description: string | null;
  release_date: string | null;
  genres: string[];
}

const plugin: MetadataProviderPlugin = {
  id: "igdb",
  name: "IGDB",
  settingsComponent: IgdbSettingsForm,

  async fetchMetadata(title: string): Promise<MetadataResult | null> {
    const clientId = (await settingsRepo.get(IGDB_CLIENT_ID_SETTING))?.trim();
    const clientSecret = (await settingsRepo.get(IGDB_CLIENT_SECRET_SETTING))?.trim();
    if (!clientId || !clientSecret) {
      throw new Error("Set IGDB client ID and secret first.");
    }

    const meta = await invoke<IgdbMetadataResponse | null>("fetch_igdb_metadata", {
      clientId,
      clientSecret,
      title,
    });

    if (!meta) return null;
    return {
      description: meta.description,
      releaseDate: meta.release_date,
      genres: meta.genres,
    };
  },
};

export default plugin;
