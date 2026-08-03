import type { ThemePlugin } from "../types";

const plugin: ThemePlugin = {
  id: "catppuccin-mocha",
  name: "Catppuccin Mocha",
  cssVariables: {
    "--color-base": "#1e1e2e",
    "--color-mantle": "#181825",
    "--color-crust": "#11111b",
    "--color-text": "#cdd6f4",
    "--color-text-reverse": "#000000",
    "--color-subtext": "#bac2de",
    "--color-surface0": "#313244",
    "--color-surface1": "#45475a",
    "--color-accent": "#89b4fa",
    "--color-accent-alt": "#cba6f7",
    "--color-danger": "#f38ba8",
  },
};

export default plugin;
