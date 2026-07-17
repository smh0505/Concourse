export interface GameEntry {
  id: string;
  title: string;
  executablePath: string;
  platform: string;
  coverArtUrl?: string;
}

export interface SourcePlugin {
  id: string;
  name: string;
  scan(): Promise<GameEntry[]>;
  launch(entry: GameEntry): Promise<void>;
  getInstallStatus(entry: GameEntry): Promise<boolean>;
}
