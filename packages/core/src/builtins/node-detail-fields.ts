/**
 * Shared data spec for the node detail panel's "operational property" rows
 * — the block that shows `runtime` / `type` / `image` / `schedule` /
 * `realizes` (plus the `role`, `tags`, and `team` rows) with a leading
 * emoji glyph — and for the panel header's kind→icon mapping
 * ({@link NODE_DETAIL_KIND_ICON_NAMES}).
 *
 * This content is hand-mirrored between two renderers that cannot share
 * *code*, only *data*: the app's React `NodeDetailPanel` (JSX) and the VS
 * Code extension's string-built webview panel (`webview-content.ts`, a
 * template evaluated in the extension host that produces literal
 * `<script>` text run later inside the webview's sandboxed browser
 * context — it cannot import and call arbitrary TypeScript at that point).
 * Issue #2018 point 7 found these already drifting elsewhere (KIND_ICONS
 * mapping, section coverage); Issue #2068 closed the icon-mapping gap.
 * This module extracts only the subset that renders byte-for-byte
 * identically in both today, so future edits to order/emoji/label/icon
 * happen in one place instead of two.
 *
 * Deliberately NOT covered here (left as independent, possibly-diverging
 * code — see Issue #2068): the Links section title, the exact
 * team/deploy nav-button markup, and the app-only `annotationDiff` section
 * (the VS Code webview has no diff-view surface to feed it).
 */

/** One `{ metaKey, emoji, label }` row in the "operational property" block. */
export interface NodeDetailPropertyField {
  /** Key on `NodeMetadata` this row reads its value from. */
  metaKey: "runtime" | "type" | "image" | "schedule" | "realizes";
  /** Emoji glyph rendered immediately before the label. */
  emoji: string;
  /** Lowercase label word rendered as `"<label>: "` before the value. */
  label: string;
}

/**
 * Ordered rows for the runtime/type/image/schedule/realizes block. Order,
 * emoji, and label match both renderers' source today — `realizes` is the
 * one row whose value is `string[]`, joined with `", "` by each renderer
 * (not part of this spec, since that's rendering logic, not data).
 */
export const NODE_DETAIL_PROPERTY_FIELDS: readonly NodeDetailPropertyField[] = [
  { metaKey: "runtime", emoji: "🖥", label: "runtime" },
  { metaKey: "type", emoji: "🏷", label: "type" },
  { metaKey: "image", emoji: "📦", label: "image" },
  { metaKey: "schedule", emoji: "⏱", label: "schedule" },
  { metaKey: "realizes", emoji: "🔗", label: "realizes" },
];

/** Emoji prefix for the `role` property row (value only, no label word). */
export const NODE_DETAIL_ROLE_EMOJI = "📌";

/** Emoji prefix for the `tags` property row; each tag is wrapped `[tag]`. */
export const NODE_DETAIL_TAGS_EMOJI = "🏷";

/** Emoji prefix for the `team` row (both the nav-button and plain-text form). */
export const NODE_DETAIL_TEAM_EMOJI = "👥";

/**
 * `kind → icon name` for the detail panel header pictogram. The icon name
 * is a registered-icon identity (the same vocabulary
 * {@link ICON_THEME_STYLE_SOURCE} draws from — see `builtins/icon-theme.ts`
 * `ICON_RULES`), not a rendered glyph: each renderer maps the name to its
 * own form. The app resolves it through `renderPictogram` (an SVG from the
 * icon registry); the VS Code webview — which string-builds its `<script>`
 * text and cannot call into the icon registry from that context — maps it
 * to an emoji glyph (`ICON_NAME_TO_EMOJI` in `webview-content.ts`).
 *
 * A kind absent from this map has no detail-panel pictogram: the app falls
 * back to its `KIND_FALLBACK_ICONS` (`system` → 🏗, else `■`) and the
 * webview falls back to `■` (■) the same way — see
 * `NodeDetailPanel.tsx` / `webview-content.ts`.
 *
 * Kept in sync with the icon-card renderer by
 * `packages/app/src/components/icon-consistency.test.ts` (TPL-20260510-05 /
 * -06 item 4) — a kind here that the renderer does not also paint (or vice
 * versa, absent an explicit `KNOWN_PANEL_GAPS` entry) fails that test.
 */
export const NODE_DETAIL_KIND_ICON_NAMES: Readonly<Record<string, string>> = {
  service: "service",
  user: "user-card",
  domain: "domain",
  usecase: "usecase",
  resource: "resource",
  team: "team",
  member: "member",
  oci: "oci",
  lambda: "lambda",
  jar: "jar",
  war: "war",
  function: "function",
  assets: "assets",
  job: "job",
  artifact: "artifact",
  store: "database",
};
