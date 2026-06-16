import type { StyleSheet } from "../types/style.js";
import { StyleParser } from "../parser/style-parser.js";

/**
 * Single source of truth for the Icon Mode vocabulary.
 *
 * Every entry maps a `(kind, tag?)` selector to an icon name. The two
 * representations the rest of karasu consumes are *derived* from this
 * list — there is no second place to edit:
 *
 * - {@link ICON_THEME_STYLE_SOURCE} — the CSS string the style resolver
 *   applies for Icon Mode — is generated from these entries at module load.
 * - {@link iconNameForNode} — the `(kind, tags) → icon` lookup the Outline
 *   view and other surfaces call — reads these entries directly.
 *
 * Adding a kind or variant is a single edit to {@link ICON_RULES}. This
 * removes the dual-maintenance burden TPL-20260519-02 was raised to fence;
 * the parity test in `icon-theme.test.ts` is driven from the same array.
 */

/**
 * Grouping of an {@link IconRule}. Also decides whether {@link iconNameForNode}
 * resolves the rule: only `logical`, `infra`, `resource-variant` and
 * `client-variant` rules are system-view concepts the preview's Icon Mode
 * draws. `org` and `deploy` rules exist in the CSS theme but resolve to
 * `undefined` from `iconNameForNode` (see ADR-20260519-06).
 */
type IconScope = "logical" | "infra" | "resource-variant" | "client-variant" | "org" | "deploy";

interface IconRule {
  /** Node kind the rule targets. */
  kind: string;
  /** Tag variant; absent for a base-kind rule. */
  tag?: string;
  /** Icon name — the `url(...)` argument and `iconNameForNode` return value. */
  icon: string;
  /** Grouping; also decides `iconNameForNode` visibility (see {@link IconScope}). */
  scope: IconScope;
}

/**
 * The canonical icon vocabulary. Order is significant for `client-variant`
 * entries: it defines {@link CLIENT_SUBTYPE_TAGS} and therefore the
 * first-match-wins order `applyClientSubtypeFirstMatch` in
 * `resolver/style-resolver.ts` relies on.
 *
 * Exported for the package-internal parity test only — not re-exported from
 * `index.ts`. Consumers use {@link iconNameForNode} / {@link ICON_THEME_STYLE_SOURCE}.
 */
export const ICON_RULES: readonly IconRule[] = [
  // Logical nodes
  { kind: "service", icon: "service", scope: "logical" },
  { kind: "client", icon: "client", scope: "logical" },
  { kind: "user", icon: "user-card", scope: "logical" },
  { kind: "domain", icon: "domain", scope: "logical" },
  { kind: "usecase", icon: "usecase", scope: "logical" },
  { kind: "resource", icon: "resource", scope: "logical" },
  // Infra nodes — distinct icons from the geometric queue / cloud shapes.
  { kind: "database", icon: "database", scope: "infra" },
  { kind: "queue", icon: "queue-node", scope: "infra" },
  { kind: "storage", icon: "cloud-node", scope: "infra" },
  // Resource tag variants
  { kind: "resource", tag: "table", icon: "table", scope: "resource-variant" },
  { kind: "resource", tag: "queue", icon: "queue-card", scope: "resource-variant" },
  { kind: "resource", tag: "api", icon: "api", scope: "resource-variant" },
  { kind: "resource", tag: "storage", icon: "cloud-card", scope: "resource-variant" },
  // Client subtype variants — order defines CLIENT_SUBTYPE_TAGS / first-match-wins.
  { kind: "client", tag: "mobile", icon: "client-mobile", scope: "client-variant" },
  { kind: "client", tag: "web", icon: "client-web", scope: "client-variant" },
  { kind: "client", tag: "desktop", icon: "client-desktop", scope: "client-variant" },
  { kind: "client", tag: "cli", icon: "client-cli", scope: "client-variant" },
  { kind: "client", tag: "device", icon: "client-device", scope: "client-variant" },
  { kind: "client", tag: "extension", icon: "client-extension", scope: "client-variant" },
  { kind: "client", tag: "embed", icon: "client-embed", scope: "client-variant" },
  // Org nodes
  { kind: "team", icon: "team", scope: "org" },
  { kind: "member", icon: "member", scope: "org" },
  // Deploy nodes
  { kind: "oci", icon: "oci", scope: "deploy" },
  { kind: "lambda", icon: "lambda", scope: "deploy" },
  { kind: "jar", icon: "jar", scope: "deploy" },
  { kind: "war", icon: "war", scope: "deploy" },
  { kind: "function", icon: "function", scope: "deploy" },
  { kind: "assets", icon: "assets", scope: "deploy" },
  { kind: "job", icon: "job", scope: "deploy" },
  { kind: "artifact", icon: "artifact", scope: "deploy" },
  { kind: "store", icon: "database", scope: "deploy" },
];

/** CSS selector for a rule: `kind` for a base rule, `kind[tag]` for a variant. */
function selectorFor(rule: IconRule): string {
  return rule.tag ? `${rule.kind}[${rule.tag}]` : rule.kind;
}

/**
 * Recognised `client` form-factor subtype tags, derived from the
 * `client-variant` entries of {@link ICON_RULES} in declaration order. The
 * style resolver imports this list to implement first-match-wins on
 * `node.tags` order for multi-tag clients (see `applyClientSubtypeFirstMatch`
 * in `resolver/style-resolver.ts`).
 */
export const CLIENT_SUBTYPE_TAGS: readonly string[] = ICON_RULES.filter(
  (r) => r.scope === "client-variant",
).map((r) => r.tag as string);

/** A recognised `client` form-factor subtype tag. */
export type ClientSubtypeTag = string;

const SCOPE_ORDER: readonly IconScope[] = [
  "logical",
  "infra",
  "resource-variant",
  "client-variant",
  "org",
  "deploy",
];

const SCOPE_HEADERS: Record<IconScope, string> = {
  logical: "Logical nodes",
  infra: "Infra nodes",
  "resource-variant": "Resource tag variants",
  "client-variant": "Client subtype variants",
  org: "Org nodes",
  deploy: "Deploy nodes",
};

/** Builds the Icon Mode CSS string from {@link ICON_RULES}. */
function buildIconThemeStyleSource(): string {
  const selectorWidth = Math.max(...ICON_RULES.map((r) => selectorFor(r).length));
  const blocks = SCOPE_ORDER.map((scope) => {
    const lines = ICON_RULES.filter((r) => r.scope === scope).map((r) => {
      const selector = selectorFor(r).padEnd(selectorWidth);
      return `${selector} { shape: url("${r.icon}"); }`;
    });
    return `/* ── ${SCOPE_HEADERS[scope]} ── */\n${lines.join("\n")}`;
  });
  return `/* karasu icon theme — generated from ICON_RULES, do not edit by hand */\n\n${blocks.join("\n\n")}\n`;
}

/**
 * Icon theme style source for icon display mode.
 * When active, all node types render as SVG icon cards (160x100 / 160x56)
 * instead of geometric shapes.
 *
 * Injected by the app layer when displayMode === "icon".
 * Applied before user stylesheets so users can still override individual entries.
 *
 * Generated from {@link ICON_RULES} — do not hand-edit; edit the array instead.
 */
export const ICON_THEME_STYLE_SOURCE: string = buildIconThemeStyleSource();

/** `kind → icon name` for the system-view base kinds (logical + infra). */
const BASE_KIND_ICON = new Map<string, string>(
  ICON_RULES.filter((r) => !r.tag && (r.scope === "logical" || r.scope === "infra")).map((r) => [
    r.kind,
    r.icon,
  ]),
);

/** `resource` tag variant → icon name. */
const RESOURCE_TAG_ICON = new Map<string, string>(
  ICON_RULES.filter((r) => r.scope === "resource-variant").map((r) => [r.tag as string, r.icon]),
);

/** `client` subtype tag → icon name. */
const CLIENT_SUBTYPE_ICON = new Map<string, string>(
  ICON_RULES.filter((r) => r.scope === "client-variant").map((r) => [r.tag as string, r.icon]),
);

/**
 * Resolves a node's `(kind, tags)` to the Icon Mode icon name the preview
 * draws for it — the same vocabulary {@link ICON_THEME_STYLE_SOURCE}
 * encodes as CSS. Surfaces other than the renderer (e.g. the app's Outline
 * view) call this so they show the same pictogram for a given node.
 *
 * Tag-driven variants take precedence over the base kind:
 * - a `client` with a recognised subtype tag → `client-<tag>`, using
 *   first-match-wins on `tags` order (matching `applyClientSubtypeFirstMatch`
 *   in `resolver/style-resolver.ts`);
 * - a `resource` with a recognised variant tag → the variant icon,
 *   first-match-wins on `tags` order. (Icon Mode resolves `resource[...]`
 *   through the CSS cascade; the two agree for the common single-variant
 *   case, which is the only one karasu's vocabulary expects.)
 *
 * Returns `undefined` for kinds with no Icon Mode pictogram (`system`,
 * deploy / org kinds, infra item kinds) — see {@link IconScope}.
 */
export function iconNameForNode(kind: string, tags: readonly string[]): string | undefined {
  if (kind === "client") {
    for (const tag of tags) {
      const icon = CLIENT_SUBTYPE_ICON.get(tag);
      if (icon) return icon;
    }
  } else if (kind === "resource") {
    for (const tag of tags) {
      const icon = RESOURCE_TAG_ICON.get(tag);
      if (icon) return icon;
    }
  }
  return BASE_KIND_ICON.get(kind);
}

let _cachedSheet: StyleSheet | null = null;

export function getIconThemeStyleSheet(): StyleSheet {
  if (!_cachedSheet) {
    const result = StyleParser.parse(ICON_THEME_STYLE_SOURCE, "<icon-theme>");
    /* c8 ignore next 4 */
    if (result.diagnostics.length > 0) {
      throw new Error(
        `Icon theme stylesheet has parse errors: ${result.diagnostics.map((d) => d.code).join(", ")}`,
      );
    }
    _cachedSheet = result.value;
  }
  return _cachedSheet;
}
