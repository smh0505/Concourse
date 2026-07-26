import type { ThemePlugin } from "../types";
import BrickBlockGameCard from "./BrickBlockGameCard.vue";
import BrickBlockBigPictureTile from "./BrickBlockBigPictureTile.vue";

const FONT_LINK_ID = "brick-block-theme-font";
// Galmuri11: pixel/dot-matrix Korean font (OFL 1.1, commercial+embed OK) - unlike Press Start 2P
// it has real Hangul glyph coverage, so CJK titles render in the theme's own pixel style instead
// of falling back to a mismatched system font. https://github.com/quiple/galmuri
const FONT_HREF = "https://cdn.jsdelivr.net/npm/galmuri@latest/dist/galmuri.css";

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
    // Buttons here sit on saturated orange/red/brown backgrounds where the theme's own dark
    // --color-text (#1a1a2e) is hard to read, especially on --color-surface1's hover state -
    // white reads cleanly against all of them. GameCard/BigPictureTile aren't affected, they
    // use their own slot components' styling, not this shared button rule.
    "--color-button-text": "#ffffff",
    // Text/icon color for anything on top of --color-accent (submit buttons, active tabs/nav
    // items/filter tags, toasts). This theme repurposes --color-base as a saturated sky-blue
    // background color rather than a light neutral, so --color-on-accent (which defaults to
    // --color-base) needs its own override too, separate from --color-button-text above.
    "--color-on-accent": "#ffffff",
    // Galmuri11 covers both Latin and Hangul in one pixel-styled font, so it comes first for
    // everything. Press Start 2P stays as a second-choice pixel look (Latin-only) in case
    // Galmuri11 fails to load; the app's default stack is the final safety net so text never
    // falls through to a completely unstyled system font.
    "--font-pixel": "'Galmuri11', 'Press Start 2P', Inter, Avenir, Helvetica, Arial, sans-serif",
  },
  activate: injectFont,
  deactivate: removeFont,
};

export default plugin;
