import type { ThemePlugin } from "../types";
import BrickBlockGameCard from "./BrickBlockGameCard.vue";
import BrickBlockBigPictureTile from "./BrickBlockBigPictureTile.vue";

const FONT_LINK_ID = "brick-block-theme-font";
const FONT_HREF = "https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap";

function injectFont() {
  if (document.getElementById(FONT_LINK_ID)) return;
  const link = document.createElement("link");
  link.id = FONT_LINK_ID;
  link.rel = "stylesheet";
  link.href = FONT_HREF;
  document.head.appendChild(link);
}

function removeFont() {
  document.getElementById(FONT_LINK_ID)?.remove();
}

const plugin: ThemePlugin = {
  id: "brick-block-theme",
  name: "Brick Block Theme",
  slots: {
    GameCard: BrickBlockGameCard,
    BigPictureTile: BrickBlockBigPictureTile,
  },
  cssVariables: {
    "--color-base": "#5c94fc",
    "--color-mantle": "#a4e4fc",
    "--color-crust": "#0058f8",
    "--color-text": "#1a1a2e",
    "--color-subtext": "#3a3a5e",
    "--color-surface0": "#c84c0c",
    "--color-surface1": "#7c2c00",
    "--color-accent": "#e52521",
    "--color-accent-alt": "#43b047",
    "--color-danger": "#b71c1c",
    "--font-pixel": "'Press Start 2P', monospace",
  },
  activate: injectFont,
  deactivate: removeFont,
};

export default plugin;
