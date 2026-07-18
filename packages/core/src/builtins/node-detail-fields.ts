/**
 * Shared data spec for the node detail panel's "operational property" rows
 * — the block that shows `runtime` / `type` / `image` / `schedule` /
 * `realizes` (plus the `role`, `tags`, and `team` rows) with a leading
 * emoji glyph.
 *
 * This content is hand-mirrored between two renderers that cannot share
 * *code*, only *data*: the app's React `NodeDetailPanel` (JSX) and the VS
 * Code extension's string-built webview panel (`webview-content.ts`, a
 * template evaluated in the extension host that produces literal
 * `<script>` text run later inside the webview's sandboxed browser
 * context — it cannot import and call arbitrary TypeScript at that point).
 * Issue #2018 point 7 found these already drifting elsewhere (KIND_ICONS
 * mapping, section coverage); this module extracts only the subset that
 * renders byte-for-byte identically in both today, so future edits to
 * order/emoji/label happen in one place instead of two.
 *
 * Deliberately NOT covered here (left as independent, possibly-diverging
 * code — see the issue): the per-kind icon/pictogram mapping, the Links
 * section title, the resources/capabilities/annotationDiff/migrationIntent
 * sections (app-only today), and the exact team/deploy nav-button markup.
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
