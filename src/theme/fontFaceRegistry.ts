/** Milestone 17 addon - loads real fonts a theme declares via @font-face, since `cssVariables`
 *  can only ever *select* a font by name, never load one. This is declarative data (no code),
 *  but still untrusted third-party content going straight into a real <style> block's text -
 *  a family name or url containing `"`, `;`, `}`, or a newline could otherwise break out of the
 *  @font-face rule and inject arbitrary CSS elsewhere on the page. Every field is validated
 *  against a strict allowlist before any CSS text gets constructed; an invalid entry is
 *  dropped (logged), not silently coerced, and never blocks the rest of the theme from loading. */

interface FontFaceDecl {
  family: string;
  url: string;
  weight?: string;
  style?: string;
}

const STYLE_ID = "theme-font-faces";

// Letters, digits, spaces, hyphens only - a real font family name never needs anything else,
// and this specifically excludes the characters ("', ;, {, }) a CSS-injection attempt would need.
const SAFE_NAME_RE = /^[A-Za-z0-9 -]{1,100}$/;
const SAFE_WEIGHT_RE = /^[A-Za-z0-9 -]{1,30}$/;
const SAFE_STYLE_VALUES = new Set(["normal", "italic", "oblique"]);

function isValidFontFace(value: unknown): value is FontFaceDecl {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;

  if (typeof v.family !== "string" || !SAFE_NAME_RE.test(v.family)) return false;

  if (typeof v.url !== "string") return false;
  try {
    if (new URL(v.url).protocol !== "https:") return false;
  } catch {
    return false;
  }
  // Belt-and-suspenders beyond the URL parse above - a well-formed https URL can't contain
  // these characters per the URL spec, but this is untrusted input, not a guarantee.
  if (/["';{}]/.test(v.url)) return false;

  if (v.weight !== undefined && (typeof v.weight !== "string" || !SAFE_WEIGHT_RE.test(v.weight))) {
    return false;
  }
  if (v.style !== undefined && (typeof v.style !== "string" || !SAFE_STYLE_VALUES.has(v.style))) {
    return false;
  }

  return true;
}

function validateFontFaces(input: unknown): FontFaceDecl[] {
  if (!Array.isArray(input)) return [];
  const valid: FontFaceDecl[] = [];
  for (const entry of input) {
    if (isValidFontFace(entry)) {
      valid.push(entry);
    } else {
      console.error("Invalid fontFaces entry, skipping:", entry);
    }
  }
  return valid;
}

export function setActiveFontFaces(input: unknown | undefined) {
  clearActiveFontFaces();
  const faces = validateFontFaces(input);
  if (faces.length === 0) return;

  const css = faces
    .map(
      (f) =>
        `@font-face { font-family: "${f.family}"; src: url("${f.url}"); ` +
        `${f.weight ? `font-weight: ${f.weight}; ` : ""}` +
        `${f.style ? `font-style: ${f.style}; ` : ""}` +
        `font-display: swap; }`,
    )
    .join("\n");

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
}

export function clearActiveFontFaces() {
  document.getElementById(STYLE_ID)?.remove();
}
