# Theme Manifests

Themes are the one plugin kind with a meaningfully different manifest shape from the rest -
today, a third-party theme is always the data-only (`runtime: "data"`) tier: a manifest with no
compiled code at all. See [Manifest Reference](./manifest-reference) for the fields every
plugin kind shares (`id`/`name`/`version`/`kind`/`entry`/`runtime`); this page covers the
fields specific to themes.

## Fields

| Field | Type | Notes |
|---|---|---|
| `cssVariables` | `Record<string, string>` | CSS custom properties (e.g. `"--color-base": "#1e1e2e"`) applied to `:root` while this theme is active. This is the entire content of a data-only theme. |
| `cardVisual` | closed-vocabulary JSON AST | Overrides the game-card's cover-visual region (image-or-placeholder) without needing real code. |
| `fontFaces` | array of font declarations | Real font files to load via `@font-face`. |

`cssVariables` alone is a complete, valid theme - `cardVisual`/`fontFaces` are both optional,
opt-in extras.

## `cardVisual`: the node vocabulary

`cardVisual` is validated against a closed set of node types (`validateCardVisualAst` in
`theme/cardVisualAst.ts`) - there's no `eval`/`new Function`/expression evaluation anywhere in
this format, so there's no code-execution primitive for a malicious manifest to escape from. An
AST exceeding depth 5 or 50 total nodes is rejected outright, as is any node shape outside what's
listed below.

| Node type | Shape | Notes |
|---|---|---|
| `if` | `{ type: "if", test: FieldRef, then: AstNode, else?: AstNode }` | Renders `then` if the referenced field is truthy, otherwise `else` (or nothing, if `else` is omitted). |
| `element` | `{ type: "element", tag: "div" \| "span", class?: string, children?: AstNode[] }` | `tag` is closed to these two non-interactive elements - no path exists to render a `button`/`a`/anything that could take focus or navigate, matching the rule that footer actions stay host-rendered, never theme-controlled. |
| `image` | `{ type: "image", class?: string, src: FieldRef, alt: FieldRef }` | Its own node type rather than `element` with a generic attribute bag - `src`/`alt` are the only bindable attributes that exist in this format, so there's no way for a manifest to inject an arbitrary attribute (an `onerror` handler, a `style` containing `url(...)`). |
| `text` | `{ type: "text", content?: string, field?: FieldRef }` | Renders `field`'s resolved value if present, otherwise the literal `content` string. |

A `FieldRef` (used by `if.test`, `image.src`/`alt`, `text.field`) is
`{ field: "cover_art_url" | "title", transform?: "firstLetterUpper" }` - `field` is a closed
allowlist of `Game` properties (not "any property this game object has"), and `transform` is
one of a fixed set of host-implemented functions dispatched by name match, never an arbitrary
expression.

### Example: image with a placeholder fallback

```json
{
  "cardVisual": {
    "type": "if",
    "test": { "field": "cover_art_url" },
    "then": {
      "type": "image",
      "class": "cover",
      "src": { "field": "cover_art_url" },
      "alt": { "field": "title" }
    },
    "else": {
      "type": "element",
      "tag": "div",
      "class": "cover-placeholder",
      "children": [{ "type": "text", "field": { "field": "title", "transform": "firstLetterUpper" } }]
    }
  }
}
```

## `fontFaces`: field validation

Each entry is `{ family: string, url: string, weight?: string, style?: string }`, loaded as a
real `@font-face` rule. Since this is untrusted manifest content going straight into a real
`<style>` block, every field is checked against a strict allowlist before any CSS text is
constructed (`theme/fontFaceRegistry.ts`) - an entry failing any of these is dropped (logged),
not coerced, and doesn't block the rest of the theme from loading:

| Field | Required | Constraint |
|---|---|---|
| `family` | yes | Letters, digits, spaces, hyphens only, 1-100 characters - specifically excludes the characters (`"`, `'`, `;`, `{`, `}`) a CSS-injection attempt would need. |
| `url` | yes | Must parse as an `https:` URL, and additionally checked to not contain `"`, `'`, `;`, `{`, or `}`. |
| `weight` | no | Same safe-character pattern as `family`, 1-30 characters. |
| `style` | no | Must be exactly `"normal"`, `"italic"`, or `"oblique"`. |

```json
{
  "fontFaces": [
    {
      "family": "My Custom Font",
      "url": "https://raw.githubusercontent.com/you/your-theme-repo/<commit-sha>/my-font.woff2",
      "weight": "400"
    }
  ]
}
```

Reference a loaded font by name in `cssVariables`' `--font-family` (see below) to actually apply
it - declaring a `fontFaces` entry only makes the font available, it doesn't use it anywhere by
itself.

## `cssVariables`: available tokens

Every token below is a real CSS custom property `styles.css` either sets a default for, or reads
via a fallback (`var(--your-token, <default>)`) without declaring one at all. Setting anything
not on this list still works (it's a plain CSS custom property, nothing stops you), but nothing
in the app's own stylesheet will read it.

### Base tokens (always have a value)

These are set on `:root` with a real default - override any subset; unset ones keep the default
below. The defaults are [Catppuccin Latte](https://github.com/catppuccin/catppuccin)'s color
scheme, which is also the app's shipped default theme - if you're building a light theme, these
color values are a reasonable starting palette to compare your own against.

| Token | Default | Notes |
|---|---|---|
| `--color-base` | `#eff1f5` | Page background. |
| `--color-mantle` | `#e6e9ef` | Slightly recessed surface (e.g. sticky header backgrounds). |
| `--color-crust` | `#dce0e8` | Darkest/most-saturated of the base/mantle/crust trio - `--color-tint` defaults to this. |
| `--color-text` | `#4c4f69` | Normal body text. |
| `--color-text-reverse` | `#ffffff` | Opposite-brightness endpoint of `--color-text`, for placement over an unpredictably-bright background image (e.g. the game-detail backdrop) where the normal text color can't guarantee contrast. |
| `--color-subtext` | `#5c5f77` | De-emphasized text (hints, secondary labels). |
| `--color-surface0` | `#ccd0da` | Borders, subtle fills. |
| `--color-surface1` | `#bcc0cc` | Slightly stronger borders/fills than `--color-surface0`. |
| `--color-accent` | `#1e66f5` | Primary accent (submit buttons, active tabs/nav, focus rings). |
| `--color-accent-alt` | `#8839ef` | Secondary accent. |
| `--color-danger` | `#d20f39` | Destructive actions (remove/delete). |
| `--color-button-text` | `var(--color-text)` | Text/icon color for neutral buttons - separate from `--color-text` so a theme with saturated button backgrounds can override just this. |
| `--color-on-accent` | `var(--color-base)` | Text/icon color for anything rendered on top of `--color-accent` (submit buttons, active tabs, toasts). |
| `--color-tint` | `var(--color-crust)` | Background tint for a cover-art scrim (list rows, stat rows) - needs to be darker/more saturated than `--color-base` for real contrast once mixed with transparency. Override if your `--color-crust` doesn't pair well with your `--color-text` (see [Security Model](./security-model) for the contrast math behind this). |
| `--space-1` … `--space-6` | `0.25rem` … `2rem` | Spacing scale (`0.25rem`, `0.5rem`, `0.75rem`, `1rem`, `1.5rem`, `2rem`). |
| `--radius-sm` | `4px` | Small corner radius. |
| `--radius-md` | `6px` | Default corner radius (most controls). |
| `--radius-lg` | `8px` | Larger corner radius (rows, panels). |
| `--radius-xl` | `10px` | Largest corner radius. |
| `--button-border-width` | `1px` | Default button border width. |
| `--shadow-sm` / `--shadow-md` / `--shadow-lg` | increasing `rgba(0,0,0,...)` blurs | Elevation scale. |
| `--font-family` | `Inter, Avenir, Helvetica, Arial, sans-serif` | The whole UI's typeface - every element either inherits this directly or sets `font-family: inherit`. Pair with a `fontFaces` entry if the family you want isn't a system font. |

### Opt-in hooks (undeclared by default)

These have no default in `:root` - the app only uses them via `var(--token, <fallback>)`, so an
unset hook silently falls back to the value shown, with no effect unless you set it.

| Token | Fallback if unset | Affects |
|---|---|---|
| `--button-border-color` | `var(--color-surface0)` | Neutral button border color. |
| `--button-radius` | `var(--radius-md)` | Neutral button corner radius. |
| `--card-border-width` | `1px` | Game card / list-row / stat-row border width. |
| `--card-radius` | `var(--radius-lg)` | Game card / list-row / stat-row corner radius. |
| `--cover-placeholder-background` | `var(--color-surface0)` | No-cover-art placeholder background (accepts any valid `background` value, e.g. a `repeating-linear-gradient(...)` pattern, not just a flat color). |
| `--tile-background` | `none` | Big Picture tile background. |
| `--tile-border-width` | `3px` | Big Picture tile border width. |
| `--tile-border-color` | `transparent` | Big Picture tile border color. |
| `--tile-radius` | `var(--radius-xl, 10px)` | Big Picture tile corner radius. |
| `--tile-focus-shadow` | `var(--shadow-lg)` | Big Picture tile's focused-state shadow/ring. |
| `--accent-active-background` | `var(--color-accent)` | Active nav/tab/filter-tag background - separate from `--color-accent` so a theme's accent color doesn't force the active-state indicator to match it. |
| `--accent-active-color` | `var(--color-on-accent)` | Text/icon color for the active nav/tab/filter-tag state. |

A handful of further opt-in hooks exist at the individual-component level rather than in
`styles.css` (e.g. `GameCard.vue`'s `--balloon-background`/`--balloon-font-family`,
`BigPictureTile.vue`'s `--tile-title-font-family`) - not exhaustively cataloged here, but they
follow the exact same `var(--token, fallback)` pattern, so grepping a component's `<style>`
block for `var(--` will find them.

## Example: a fuller theme manifest

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "version": "1.0.0",
  "kind": "theme",
  "cssVariables": {
    "--color-base": "#1e1e2e",
    "--color-mantle": "#181825",
    "--color-crust": "#11111b",
    "--color-text": "#cdd6f4",
    "--color-text-reverse": "#000000",
    "--color-accent": "#89b4fa"
  }
}
```
