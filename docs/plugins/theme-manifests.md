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
| `cardVisual` | closed-vocabulary JSON AST | Overrides the game-card's cover-visual region (image-or-placeholder) without needing real code. Validated strictly before use - see `theme/cardVisualAst.ts` in the main repo for the exact node types. |
| `fontFaces` | array of `{ family, url, weight?, style? }` | Real font files to load via `@font-face`. Every field is validated against a strict allowlist (`family`/`weight` against a safe-character pattern, `url` must be `https:`) before any CSS text is constructed, since this is untrusted content going into a real `<style>` block. |

## Example

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "version": "1.0.0",
  "kind": "theme",
  "cssVariables": {
    "--color-base": "#1e1e2e",
    "--color-text": "#cdd6f4",
    "--color-accent": "#89b4fa"
  }
}
```

`cssVariables` alone is a complete, valid theme - `cardVisual`/`fontFaces` are both optional,
opt-in extras.
