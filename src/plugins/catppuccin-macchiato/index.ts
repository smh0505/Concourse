import type { ThemePlugin } from "../types";

const plugin: ThemePlugin = {
  id: "catppuccin-macchiato",
  name: "Catppuccin Macchiato",
  cssVariables: {
    "--color-base": "#24273a",
    "--color-mantle": "#1e2030",
    "--color-crust": "#181926",
    "--color-text": "#cad3f5",
    "--color-subtext": "#b8c0e0",
    "--color-surface0": "#363a4f",
    "--color-surface1": "#494d64",
    "--color-accent": "#8aadf4",
    "--color-accent-alt": "#c6a0f6",
    "--color-danger": "#ed8796",
  },
};

export default plugin;
