import type { ThemePlugin } from "../types";

const plugin: ThemePlugin = {
  id: "catppuccin-frappe",
  name: "Catppuccin Frappé",
  cssVariables: {
    "--color-base": "#303446",
    "--color-mantle": "#292c3c",
    "--color-crust": "#232634",
    "--color-text": "#c6d0f5",
    "--color-text-reverse": "#000000",
    "--color-subtext": "#b5bfe2",
    "--color-surface0": "#414559",
    "--color-surface1": "#51576d",
    "--color-accent": "#8caaee",
    "--color-accent-alt": "#ca9ee6",
    "--color-danger": "#e78284",
  },
};

export default plugin;
