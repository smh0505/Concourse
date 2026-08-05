import { defineComponent, h, type PropType, type VNode, type VNodeChild } from "vue";

import type { Game } from "@/db";

/** Closed allowlist - not "any Game property." A manifest referencing anything outside this
 *  set is rejected outright by validateCardVisualAst, not silently rendered empty. */
const GAME_FIELDS = ["cover_art_url", "title"] as const;
export type GameField = (typeof GAME_FIELDS)[number];

/** Fixed, host-implemented transforms - dispatched by name match, never a call expression. */
const FIELD_TRANSFORMS = {
  firstLetterUpper: (value: string) => value.charAt(0).toUpperCase(),
} as const;
export type FieldTransform = keyof typeof FIELD_TRANSFORMS;

export interface FieldRef {
  field: GameField;
  transform?: FieldTransform;
}

/** `image` is its own node type rather than `element` with a generic attrs bag - hardcodes
 *  exactly `src`/`alt` as bindable. No generic attribute dict exists anywhere in this format,
 *  so there's no path for an arbitrary attribute name (`onerror`, a `style` containing a
 *  `url(...)`) to ever reach the renderer. `tag` is closed to non-interactive elements only -
 *  matches the decided action-dispatch boundary (footer stays host-rendered) by construction. */
export type AstNode =
  | { type: "if"; test: FieldRef; then: AstNode; else?: AstNode }
  | { type: "element"; tag: "div" | "span"; class?: string; children?: AstNode[] }
  | { type: "image"; class?: string; src: FieldRef; alt: FieldRef }
  | { type: "text"; content?: string; field?: FieldRef };

const MAX_DEPTH = 5;
const MAX_NODES = 50;

class AstValidationError extends Error {}

function isFieldRef(value: unknown): value is FieldRef {
  if (typeof value !== "object" || value === null) return false;
  const ref = value as Record<string, unknown>;
  if (!GAME_FIELDS.includes(ref.field as GameField)) return false;
  if (
    ref.transform !== undefined &&
    !Object.prototype.hasOwnProperty.call(FIELD_TRANSFORMS, ref.transform as string)
  ) {
    return false;
  }
  return true;
}

/** Single validation gate for untrusted manifest data - `renderCardVisualAst` only ever runs
 *  against output that already passed through here (see cardVisualRegistry.ts), so the render
 *  path itself doesn't need to be defensive against malformed input on every call. Throws
 *  `AstValidationError` (fail closed) rather than skipping/coercing an invalid node - a
 *  manifest with one bad node rejects the whole tree, not just that node. */
export function validateCardVisualAst(node: unknown, depth = 0, counter = { count: 0 }): AstNode {
  counter.count += 1;
  if (counter.count > MAX_NODES) {
    throw new AstValidationError(`AST exceeds max node count (${MAX_NODES})`);
  }
  if (depth > MAX_DEPTH) {
    throw new AstValidationError(`AST exceeds max depth (${MAX_DEPTH})`);
  }
  if (typeof node !== "object" || node === null) {
    throw new AstValidationError("AST node must be an object");
  }
  const n = node as Record<string, unknown>;

  switch (n.type) {
    case "if": {
      if (!isFieldRef(n.test)) throw new AstValidationError("if.test must be a valid field ref");
      const thenNode = validateCardVisualAst(n.then, depth + 1, counter);
      const elseNode =
        n.else !== undefined ? validateCardVisualAst(n.else, depth + 1, counter) : undefined;
      return { type: "if", test: n.test as FieldRef, then: thenNode, else: elseNode };
    }
    case "element": {
      if (n.tag !== "div" && n.tag !== "span") {
        throw new AstValidationError(`element.tag must be "div" or "span"`);
      }
      if (n.class !== undefined && typeof n.class !== "string") {
        throw new AstValidationError("element.class must be a string");
      }
      const children = Array.isArray(n.children)
        ? n.children.map((child) => validateCardVisualAst(child, depth + 1, counter))
        : undefined;
      return { type: "element", tag: n.tag, class: n.class as string | undefined, children };
    }
    case "image": {
      if (!isFieldRef(n.src)) throw new AstValidationError("image.src must be a valid field ref");
      if (!isFieldRef(n.alt)) throw new AstValidationError("image.alt must be a valid field ref");
      if (n.class !== undefined && typeof n.class !== "string") {
        throw new AstValidationError("image.class must be a string");
      }
      return {
        type: "image",
        class: n.class as string | undefined,
        src: n.src as FieldRef,
        alt: n.alt as FieldRef,
      };
    }
    case "text": {
      if (n.content !== undefined && typeof n.content !== "string") {
        throw new AstValidationError("text.content must be a string");
      }
      if (n.field !== undefined && !isFieldRef(n.field)) {
        throw new AstValidationError("text.field must be a valid field ref");
      }
      return {
        type: "text",
        content: n.content as string | undefined,
        field: n.field as FieldRef | undefined,
      };
    }
    default:
      throw new AstValidationError(`Unknown node type: ${String(n.type)}`);
  }
}

function resolveField(ref: FieldRef, game: Game): string {
  const raw = game[ref.field];
  const value = raw === null || raw === undefined ? "" : String(raw);
  return ref.transform ? FIELD_TRANSFORMS[ref.transform](value) : value;
}

/** Only ever called on output from validateCardVisualAst - see cardVisualRegistry.ts. Returns
 *  a bare string for `text` nodes rather than wrapping it in a spurious element, so a themed
 *  placeholder's font-size/color styling (set on its `element` parent) applies directly. */
export function renderCardVisualAst(node: AstNode, game: Game): VNode | string {
  switch (node.type) {
    case "if": {
      const truthy = Boolean(game[node.test.field]);
      const branch = truthy ? node.then : node.else;
      return branch
        ? renderCardVisualAst(branch, game)
        : h("span"); // no `else` and test failed - render an empty, harmless node
    }
    case "element": {
      const children: VNodeChild[] = (node.children ?? []).map((child) =>
        renderCardVisualAst(child, game),
      );
      return h(node.tag, node.class ? { class: node.class } : {}, children);
    }
    case "image": {
      return h("img", {
        class: node.class,
        src: resolveField(node.src, game),
        alt: resolveField(node.alt, game),
      });
    }
    case "text": {
      return node.field ? resolveField(node.field, game) : (node.content ?? "");
    }
  }
}

/** Thin wrapper so GameCard.vue can drop this into its template like any other component,
 *  rather than reaching for a manual render function itself. */
export const CardVisualRenderer = defineComponent({
  name: "CardVisualRenderer",
  props: {
    node: { type: Object as PropType<AstNode>, required: true },
    game: { type: Object as PropType<Game>, required: true },
  },
  setup(props) {
    return () => renderCardVisualAst(props.node, props.game);
  },
});
