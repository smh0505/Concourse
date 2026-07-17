import type { ThemePlugin } from "../types";

const plugin: ThemePlugin = {
  id: "catppuccin-latte",
  name: "Catppuccin Latte",
  cssVariables: {
    "--color-base": "#eff1f5",
    "--color-mantle": "#e6e9ef",
    "--color-crust": "#dce0e8",
    "--color-text": "#4c4f69",
    "--color-subtext": "#5c5f77",
    "--color-surface0": "#ccd0da",
    "--color-surface1": "#bcc0cc",
    "--color-accent": "#1e66f5",
    "--color-accent-alt": "#8839ef",
    "--color-danger": "#d20f39",
  },
};

export default plugin;
