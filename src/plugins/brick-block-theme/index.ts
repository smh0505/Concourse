import type { ThemePlugin } from "../types";
import BrickBlockGameCard from "./BrickBlockGameCard.vue";
import BrickBlockBigPictureTile from "./BrickBlockBigPictureTile.vue";
import fusionPixelKoUrl from "./fusion-pixel-12px-proportional-ko.otf.woff2?url";

const FONT_STYLE_ID = "brick-block-theme-font";
// Fusion Pixel 12px Proportional (Korean build, OFL 1.1, commercial+embed OK) - unlike Press
// Start 2P it has real Hangul glyph coverage (verified it also covers basic Latin/ASCII on its
// own, so no separate Latin file is needed), so CJK titles render in the theme's own pixel style
// instead of falling back to a mismatched system font. Bundled locally rather than the previous
// jsdelivr CDN link - a cross-origin CDN fetch triggered WebView2's tracking-prevention warning
// on every launch and made the theme depend on network access at all.
// https://github.com/TakWolf/fusion-pixel-font
const FONT_FAMILY = "Fusion Pixel 12px Prop ko";
const FONT_FACE_CSS = `@font-face {
  font-family: "${FONT_FAMILY}";
  src: url("${fusionPixelKoUrl}") format("woff2");
  font-display: swap;
}`;

function injectFont() {
  if (document.getElementById(FONT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = FONT_STYLE_ID;
  style.textContent = FONT_FACE_CSS;
  document.head.appendChild(style);
}

function removeFont() {
  document.getElementById(FONT_STYLE_ID)?.remove();
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
    // Fusion Pixel covers both Latin and Hangul in one pixel-styled font, so it comes first for
    // everything. Press Start 2P stays as a second-choice pixel look (Latin-only) in case the
    // bundled @font-face somehow fails to apply; the app's default stack is the final safety net
    // so text never falls through to a completely unstyled system font.
    "--font-pixel": `'${FONT_FAMILY}', 'Press Start 2P', Inter, Avenir, Helvetica, Arial, sans-serif`,
  },
  activate: injectFont,
  deactivate: removeFont,
};

export default plugin;
