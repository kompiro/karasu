/**
 * Pure webview HTML/CSS/JS template for the preview panel.
 *
 * `preview-panel.ts` owns everything that needs `vscode` (webview lifecycle,
 * message wiring, rendering the diagram) and everything that needs core /
 * `marked` (markdown rendering, link-scheme filtering). This module only
 * assembles the final HTML document from already-computed strings, mirroring
 * the `drilldown-state.ts` / `message-validation.ts` / `theme-mapping.ts`
 * split: kept free of any `vscode` import so the template itself is
 * unit-testable without mocking the extension host.
 *
 * **Caution:** the inline-`style` active-toolbar-button mechanism (see
 * `activeStyle` below) is asserted by
 * `packages/vscode-e2e/tests/webview/harness.ts` via
 * `getAttribute('style').includes('background')`. Converting it to CSS
 * classes is a behavior change from that harness's point of view — do not do
 * it here (see ADR-20260429-09 / `.claude/rules/vscode-webview-tests.md`).
 */

import {
  NODE_DETAIL_PROPERTY_FIELDS,
  NODE_DETAIL_ROLE_EMOJI,
  NODE_DETAIL_TAGS_EMOJI,
  NODE_DETAIL_TEAM_EMOJI,
  NODE_DETAIL_KIND_ICON_NAMES,
} from "@karasu-tools/core";
import type { ViewType } from "./message-validation.js";

/**
 * Width budget for the detail panel, shared by the CSS `max-width` and the
 * webview script's overflow-avoidance math (which flips the panel to the
 * left of the node, offset by `DETAIL_PANEL_GAP`, when it would overflow the
 * right edge). Keeping both in one constant prevents the positioning math
 * from silently desynchronizing from the rendered width.
 */
export const DETAIL_PANEL_MAX_WIDTH = 360;

/**
 * Gap between the anchor node and the detail panel, also used as the minimum
 * left margin when the panel is clamped to the viewport edge.
 */
export const DETAIL_PANEL_GAP = 8;

/**
 * Re-encode a string as `\uXXXX`-per-UTF-16-code-unit escapes — the style
 * this module's inline `<script>` already used (by hand) for every
 * non-ASCII glyph before this change. The detail-panel emoji now come from
 * the shared `@karasu-tools/core` NODE_DETAIL_PROPERTY_FIELDS spec (Issue
 * #2018 point 7), but that spec holds real emoji characters (so the app's
 * JSX can render them directly) — this function re-derives the same
 * hand-written escape form so the generated `<script>` text stays
 * byte-identical to what was previously typed out per glyph. Iterating by
 * `.length`/`.charCodeAt` (not code points) is deliberate: astral emoji are
 * two UTF-16 code units, and the escape form used throughout this file is
 * one `\uXXXX` per unit (i.e. a surrogate pair, not a single \u{...}).
 */
function jsUnicodeEscape(glyph: string): string {
  let out = "";
  for (let i = 0; i < glyph.length; i++) {
    out += "\\u" + glyph.charCodeAt(i).toString(16).padStart(4, "0");
  }
  return out;
}

const propertyField = (key: (typeof NODE_DETAIL_PROPERTY_FIELDS)[number]["metaKey"]) => {
  const field = NODE_DETAIL_PROPERTY_FIELDS.find((f) => f.metaKey === key);
  if (!field) {
    throw new Error(`webview-content: no NODE_DETAIL_PROPERTY_FIELDS entry for "${key}"`);
  }
  return { emoji: jsUnicodeEscape(field.emoji), label: field.label };
};

const RUNTIME_FIELD = propertyField("runtime");
const TYPE_FIELD = propertyField("type");
const IMAGE_FIELD = propertyField("image");
const SCHEDULE_FIELD = propertyField("schedule");
const REALIZES_FIELD = propertyField("realizes");
const ROLE_EMOJI = jsUnicodeEscape(NODE_DETAIL_ROLE_EMOJI);
const TAGS_EMOJI = jsUnicodeEscape(NODE_DETAIL_TAGS_EMOJI);
const TEAM_EMOJI = jsUnicodeEscape(NODE_DETAIL_TEAM_EMOJI);

// Section titles for the resources/capabilities/migration sections (Issue
// #2068). Not sourced from `@karasu-tools/core` — like the "Links" section
// title above them in the generated script, these are hand-kept in sync
// with the app's `nodeDetail.*.title` en strings in `@karasu-tools/i18n`
// (the webview has no i18n runtime; see node-detail-fields.ts's doc comment
// for what is and is not shared).
const RESOURCES_TITLE_EMOJI = jsUnicodeEscape("📦");
const CAPABILITIES_TITLE_EMOJI = jsUnicodeEscape("🔐");
const MIGRATION_TITLE_EMOJI = jsUnicodeEscape("🕒");

/**
 * Emoji glyph for each icon name in {@link NODE_DETAIL_KIND_ICON_NAMES}
 * (Issue #2068). The webview's `<script>` text is string-built in the
 * extension host and evaluated later inside the webview's sandboxed
 * browser context, so it cannot call into `@karasu-tools/core`'s SVG icon
 * registry the way the app's `renderPictogram` does — it renders an emoji
 * per icon-name identity instead. Every icon name
 * `NODE_DETAIL_KIND_ICON_NAMES` uses must have an entry here; `kindIcon`
 * below throws at module load otherwise, so a kind added to the shared map
 * without a webview glyph fails immediately instead of silently rendering
 * "■" in the panel.
 */
const ICON_NAME_TO_EMOJI: Record<string, string> = {
  service: "⚙",
  "user-card": "👤",
  domain: "📦",
  usecase: "🎯",
  resource: "💾",
  team: "👥",
  member: "👤",
  oci: "🐳",
  lambda: "λ",
  jar: "☕",
  war: "☕",
  function: "fₙ",
  assets: "📁",
  job: "⏰",
  artifact: "📦",
  database: "🗄",
};

/** `\uXXXX`-escaped emoji for a detail-panel kind, resolved through the
 * shared {@link NODE_DETAIL_KIND_ICON_NAMES} identity map. */
function kindIcon(kind: string): string {
  const iconName = NODE_DETAIL_KIND_ICON_NAMES[kind];
  if (!iconName) {
    throw new Error(`webview-content: no NODE_DETAIL_KIND_ICON_NAMES entry for kind "${kind}"`);
  }
  const emoji = ICON_NAME_TO_EMOJI[iconName];
  if (!emoji) {
    throw new Error(
      `webview-content: no ICON_NAME_TO_EMOJI entry for icon name "${iconName}" (kind "${kind}")`,
    );
  }
  return jsUnicodeEscape(emoji);
}

/**
 * Source text for the client-side `KIND_ICONS` lookup object, generated
 * from {@link NODE_DETAIL_KIND_ICON_NAMES} so the webview cannot drift from
 * the app's kind→icon mapping (the original #2068 bug: `usecase` collided
 * with `domain`'s 📦, and `store` had no entry at all). `system` has no
 * registered pictogram in either renderer (mirrors the app's
 * `KIND_FALLBACK_ICONS`), so it is appended by hand, same as before.
 */
const KIND_ICON_ENTRIES = Object.keys(NODE_DETAIL_KIND_ICON_NAMES)
  .map((kind) => `${kind}: '${kindIcon(kind)}'`)
  .join(", ");
const SYSTEM_KIND_ICON = jsUnicodeEscape("🏗");

/**
 * Visibility guard for the property-row section, derived from the shared
 * spec so adding a field to NODE_DETAIL_PROPERTY_FIELDS automatically both
 * renders its row (below) *and* keeps the section visible for a node whose
 * only populated property is that new field. Generates the exact
 * left-to-right `meta.runtime || meta.type || … || meta.realizes?.length`
 * expression the client-side `if (...)` used before this change — the
 * `realizes` array field tests `?.length`, the rest test truthiness — so
 * the emitted script text stays byte-identical (fenced by the golden
 * snapshot). Since it feeds an `if (...)`, boolean coercion makes it
 * byte-identical for every input.
 */
const PROPERTY_SECTION_GUARD = NODE_DETAIL_PROPERTY_FIELDS.map((f) =>
  f.metaKey === "realizes" ? "meta.realizes?.length" : `meta.${f.metaKey}`,
).join(" || ");

/** Inputs for {@link buildPreviewHtml}, all pre-computed by the caller. */
export interface BuildPreviewHtmlParams {
  /** Rendered diagram SVG markup, already sized to embed as-is. */
  svg: string;
  /** JSON-stringified `Record<string, SerializedNodeMeta>` for the webview script. */
  metadataJson: string;
  /** Pre-rendered breadcrumb `<button>`/`<span>` markup (see `buildBreadcrumbHtml`). */
  breadcrumbHtml: string;
  /** Currently active toolbar view, used to highlight its button. */
  viewType: ViewType;
  /** Currently active display mode, used to highlight the icon-mode button. */
  displayMode: "icon" | "shape";
  /** CSP script nonce (see {@link nonce}). */
  nonce: string;
}

/**
 * Assemble the full webview HTML document. Pure function of its inputs —
 * the same params always produce byte-identical output.
 */
export function buildPreviewHtml(params: BuildPreviewHtmlParams): string {
  const { svg, metadataJson, breadcrumbHtml, viewType, displayMode, nonce } = params;
  const activeStyle =
    "background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-color:var(--vscode-button-background);";
  const btnStyle = (view: ViewType) => (view === viewType ? activeStyle : "");
  const iconModeStyle = displayMode === "icon" ? activeStyle : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    #toolbar {
      display: flex;
      gap: 6px;
      padding: 6px 10px;
      border-bottom: 1px solid var(--vscode-panel-border);
      flex-shrink: 0;
      align-items: center;
    }
    .toolbar-sep {
      width: 1px;
      height: 16px;
      background: var(--vscode-panel-border);
      flex-shrink: 0;
    }
    #breadcrumb {
      display: flex;
      align-items: center;
      gap: 2px;
      font-size: 12px;
      overflow: hidden;
    }
    #breadcrumb button {
      padding: 2px 6px;
      border: none;
      background: none;
      color: var(--vscode-textLink-foreground, #4daafc);
      cursor: pointer;
      font-size: 12px;
      white-space: nowrap;
    }
    #breadcrumb button:last-child {
      color: var(--vscode-editor-foreground);
      cursor: default;
      font-weight: bold;
    }
    #breadcrumb .sep { color: var(--vscode-descriptionForeground); padding: 0 2px; }
    #jump-hint {
      margin-left: auto;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      white-space: nowrap;
      flex-shrink: 0;
    }
    button {
      padding: 3px 10px;
      border: 1px solid var(--vscode-button-secondaryBackground, #555);
      border-radius: 3px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      cursor: pointer;
      font-size: 12px;
    }
    button:hover { opacity: 0.85; }
    #preview-wrapper {
      flex: 1;
      overflow: auto;
      position: relative;
    }
    #preview {
      padding: 12px;
    }
    #preview svg { max-width: 100%; height: auto; display: block; }
    [data-node-id].karasu-highlighted > rect,
    [data-node-id].karasu-highlighted > path,
    [data-node-id].karasu-highlighted > circle,
    [data-node-id].karasu-highlighted > ellipse {
      stroke: var(--vscode-focusBorder, #007fd4);
      stroke-width: 3;
    }
    [data-node-id] { cursor: pointer; }
    [data-has-children="true"] { cursor: zoom-in; }
    #karasu-tooltip {
      position: fixed;
      display: none;
      max-width: 320px;
      padding: 6px 10px;
      background: var(--vscode-editorHoverWidget-background, #252526);
      color: var(--vscode-editorHoverWidget-foreground, #cccccc);
      border: 1px solid var(--vscode-editorHoverWidget-border, #454545);
      border-radius: 3px;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      pointer-events: none;
      z-index: 1000;
    }

    /* ── Detail Panel ──────────────────────────────────────── */
    #detail-panel {
      display: none;
      position: absolute;
      max-width: ${DETAIL_PANEL_MAX_WIDTH}px;
      max-height: 400px;
      z-index: 100;
      background: var(--vscode-editorHoverWidget-background, #252526);
      border: 1px solid var(--vscode-editorHoverWidget-border, #454545);
      border-radius: 6px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3);
      overflow: hidden;
      flex-direction: column;
    }
    #detail-panel.visible {
      display: flex;
    }
    .dp-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .dp-icon { font-size: 15px; flex-shrink: 0; }
    .dp-label {
      font-weight: 600;
      font-size: 13.5px;
      color: var(--vscode-editor-foreground);
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dp-close {
      background: none !important;
      border: none !important;
      color: var(--vscode-descriptionForeground);
      font-size: 16px;
      cursor: pointer;
      padding: 1px 5px !important;
      line-height: 1;
      border-radius: 3px;
      flex-shrink: 0;
    }
    .dp-close:hover {
      color: var(--vscode-editor-foreground);
      background: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.1)) !important;
    }
    .dp-body {
      overflow-y: auto;
      flex: 1;
    }
    .dp-description {
      padding: 10px 12px;
      font-size: 13px;
      color: var(--vscode-editorHoverWidget-foreground, #ccc);
      line-height: 1.65;
    }
    .dp-description p { margin-bottom: 8px; }
    .dp-description h1,
    .dp-description h2,
    .dp-description h3 {
      font-size: 13px;
      color: var(--vscode-editor-foreground);
      margin: 8px 0 4px;
    }
    .dp-description code {
      background: var(--vscode-textCodeBlock-background, #1e1e1e);
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 11.5px;
      font-family: var(--vscode-editor-fontFamily, monospace);
    }
    .dp-description ul,
    .dp-description ol {
      padding-left: 20px;
      margin-bottom: 8px;
    }
    .dp-section {
      padding: 8px 12px;
      border-top: 1px solid var(--vscode-panel-border);
    }
    .dp-section-title {
      font-size: 10.5px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 5px;
      text-transform: uppercase;
      letter-spacing: 0.09em;
      font-weight: 700;
    }
    .dp-links { list-style: none; padding: 0; }
    .dp-links li { margin: 2px 0; }
    .dp-links a {
      color: var(--vscode-textLink-foreground, #4daafc);
      text-decoration: none;
      font-size: 13px;
      cursor: pointer;
    }
    .dp-links a:hover { text-decoration: underline; }
    .dp-prop {
      font-size: 11.5px;
      color: var(--vscode-descriptionForeground);
      margin: 2px 0;
      font-family: var(--vscode-editor-fontFamily, monospace);
    }
    .dp-resource-list { list-style: none; padding: 0; font-family: var(--vscode-editor-fontFamily, monospace); font-size: 11.5px; }
    .dp-resource-item { display: flex; gap: 8px; padding: 2px 0; }
    .dp-resource-kind { color: var(--vscode-descriptionForeground); min-width: 96px; }
    .dp-resource-name { color: var(--vscode-editor-foreground); }
    .dp-capability-list { list-style: none; padding: 0; }
    .dp-capability-item { display: flex; flex-direction: column; gap: 2px; padding: 6px 0; }
    .dp-capability-item + .dp-capability-item { border-top: 1px solid var(--vscode-panel-border); }
    .dp-capability-title { color: var(--vscode-editor-foreground); font-size: 12px; font-weight: 600; }
    .dp-capability-description {
      margin: 0;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      line-height: 1.4;
      white-space: pre-wrap;
    }
    .dp-jump {
      display: block;
      width: 100%;
      padding: 6px 8px !important;
      background: var(--vscode-button-background) !important;
      border: none !important;
      border-radius: 3px;
      color: var(--vscode-button-foreground) !important;
      font-size: 12px;
      text-align: center;
      cursor: pointer;
    }
    .dp-jump:hover {
      background: var(--vscode-button-hoverBackground, #1177bb) !important;
      opacity: 1 !important;
    }
    .dp-nav-btn {
      display: block;
      width: 100%;
      padding: 5px 8px !important;
      background: var(--vscode-button-secondaryBackground, #3a3d41) !important;
      border: none !important;
      border-radius: 3px;
      color: var(--vscode-button-secondaryForeground, #cccccc) !important;
      font-size: 12px;
      text-align: left;
      cursor: pointer;
    }
    .dp-nav-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground, #45494e) !important;
      opacity: 1 !important;
    }
  </style>
</head>
<body>
  <div id="toolbar">
    <button data-view="system" style="${btnStyle("system")}">System</button>
    <button data-view="deploy" style="${btnStyle("deploy")}">Deploy</button>
    <button data-view="org" style="${btnStyle("org")}">Org</button>
    <div class="toolbar-sep"></div>
    <button id="icon-mode-btn" style="${iconModeStyle}">◇ Icon Mode</button>
    <div class="toolbar-sep"></div>
    <div id="breadcrumb">${breadcrumbHtml}</div>
    <span id="jump-hint">ⓘ for details · Cmd/Ctrl+Click to jump</span>
  </div>
  <div id="preview-wrapper">
    <div id="preview">${svg}</div>
    <div id="detail-panel"></div>
  </div>
  <div id="karasu-tooltip"></div>
  <script nonce="${nonce}">
    var vscode = acquireVsCodeApi();
    var nodeMetadataMap = ${metadataJson};
    var tooltip = document.getElementById('karasu-tooltip');
    var detailPanel = document.getElementById('detail-panel');
    var currentDetailNodeId = null;

    var KIND_ICONS = { ${KIND_ICON_ENTRIES}, system: '${SYSTEM_KIND_ICON}' };

    // ── View switcher ──
    document.querySelectorAll('[data-view]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        vscode.postMessage({ type: 'switchView', viewType: btn.dataset.view });
      });
    });

    // ── Icon Mode toggle ──
    document.getElementById('icon-mode-btn').addEventListener('click', function() {
      vscode.postMessage({ type: 'toggleIconMode' });
    });

    // ── Breadcrumb navigation ──
    document.querySelectorAll('[data-nav-index]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        vscode.postMessage({ type: 'navigateTo', index: Number(btn.dataset.navIndex) });
      });
    });

    // ── Detail panel functions ──
    function showDetailPanel(nodeId, targetEl) {
      var meta = nodeMetadataMap[nodeId];
      if (!meta) return;

      currentDetailNodeId = nodeId;
      var icon = KIND_ICONS[meta.kind] || '\\u25a0';

      // Build panel HTML
      var html = '<div class="dp-header">';
      html += '<span class="dp-icon">' + icon + '</span>';
      html += '<span class="dp-label">' + escapeHtml(meta.label) + '</span>';
      html += '<button class="dp-close" id="dp-close-btn" aria-label="Close">\\u00d7</button>';
      html += '</div>';
      html += '<div class="dp-body">';

      // Description (pre-rendered HTML from extension host)
      if (meta.descriptionHtml) {
        html += '<div class="dp-description">' + meta.descriptionHtml + '</div>';
      }

      // Links
      if (meta.links && meta.links.length > 0) {
        html += '<div class="dp-section">';
        html += '<div class="dp-section-title">\\ud83d\\udd17 Links</div>';
        html += '<ul class="dp-links">';
        for (var i = 0; i < meta.links.length; i++) {
          var link = meta.links[i];
          // Links are already scheme-filtered host-side (#1525, see _buildHtml),
          // so meta.links contains only http/https/mailto URLs here.
          html += '<li><a href="' + escapeAttr(link.url) + '">'
            + escapeHtml(link.label || link.url) + ' \\u2197</a></li>';
        }
        html += '</ul></div>';
      }

      // Storage resources (client kind only) — matching app layout
      if (meta.resources && meta.resources.length > 0) {
        html += '<div class="dp-section">';
        html += '<div class="dp-section-title">${RESOURCES_TITLE_EMOJI} Storage resources</div>';
        html += '<ul class="dp-resource-list">';
        for (var ri = 0; ri < meta.resources.length; ri++) {
          var res = meta.resources[ri];
          html += '<li class="dp-resource-item"><span class="dp-resource-kind">'
            + escapeHtml(res.storageKind) + '</span><span class="dp-resource-name">'
            + escapeHtml(res.name) + '</span></li>';
        }
        html += '</ul></div>';
      }

      // Capabilities (client kind only) — matching app layout
      if (meta.capabilities && meta.capabilities.length > 0) {
        html += '<div class="dp-section">';
        html += '<div class="dp-section-title">${CAPABILITIES_TITLE_EMOJI} Capabilities</div>';
        html += '<ul class="dp-capability-list">';
        for (var ci = 0; ci < meta.capabilities.length; ci++) {
          var cap = meta.capabilities[ci];
          html += '<li class="dp-capability-item"><span class="dp-capability-title">'
            + escapeHtml(cap.label || cap.name) + '</span>';
          if (cap.description) {
            html += '<p class="dp-capability-description">' + escapeHtml(cap.description) + '</p>';
          }
          html += '</li>';
        }
        html += '</ul></div>';
      }

      // Runtime / type / image / schedule / realizes (own section, matching app layout)
      if (${PROPERTY_SECTION_GUARD}) {
        html += '<div class="dp-section">';
        if (meta.runtime) html += '<div class="dp-prop">${RUNTIME_FIELD.emoji} ${RUNTIME_FIELD.label}: ' + escapeHtml(meta.runtime) + '</div>';
        if (meta.type) html += '<div class="dp-prop">${TYPE_FIELD.emoji} ${TYPE_FIELD.label}: ' + escapeHtml(meta.type) + '</div>';
        if (meta.image) html += '<div class="dp-prop">${IMAGE_FIELD.emoji} ${IMAGE_FIELD.label}: ' + escapeHtml(meta.image) + '</div>';
        if (meta.schedule) html += '<div class="dp-prop">${SCHEDULE_FIELD.emoji} ${SCHEDULE_FIELD.label}: ' + escapeHtml(meta.schedule) + '</div>';
        if (meta.realizes?.length) html += '<div class="dp-prop">${REALIZES_FIELD.emoji} ${REALIZES_FIELD.label}: ' + escapeHtml(meta.realizes.join(', ')) + '</div>';
        html += '</div>';
      }

      // Migration intent (@deprecated/@experimental until, @migration_target from)
      if (meta.migrationIntent && (meta.migrationIntent.until || meta.migrationIntent.from)) {
        html += '<div class="dp-section dp-migration">';
        html += '<div class="dp-section-title">${MIGRATION_TITLE_EMOJI} Migration intent</div>';
        if (meta.migrationIntent.until) {
          html += '<div class="dp-prop dp-migration-until" data-until-kind="'
            + escapeAttr(meta.migrationIntent.until.kind) + '">until: <code>'
            + escapeHtml(meta.migrationIntent.until.raw) + '</code></div>';
        }
        if (meta.migrationIntent.from) {
          html += '<div class="dp-prop dp-migration-from">from: <code>'
            + escapeHtml(meta.migrationIntent.from) + '</code></div>';
        }
        html += '</div>';
      }

      // Team / role / tags
      var teamRoleTagsProps = [];
      if (meta.role) teamRoleTagsProps.push('${ROLE_EMOJI} ' + escapeHtml(meta.role));
      if (meta.tags && meta.tags.length > 0) {
        teamRoleTagsProps.push('${TAGS_EMOJI} ' + meta.tags.map(function(t) { return '[' + escapeHtml(t) + ']'; }).join(' '));
      }
      if (meta.team || teamRoleTagsProps.length > 0) {
        html += '<div class="dp-section">';
        if (meta.team) {
          html += '<button class="dp-nav-btn" data-nav-view="org" data-nav-node="' + escapeAttr(meta.team) + '">'
            + '${TEAM_EMOJI} ' + escapeHtml(meta.team) + ' \\u2192</button>';
        }
        for (var j = 0; j < teamRoleTagsProps.length; j++) {
          html += '<div class="dp-prop">' + teamRoleTagsProps[j] + '</div>';
        }
        html += '</div>';
      }

      // Deploy navigation button
      if (meta.hasDeployContainer) {
        html += '<div class="dp-section">';
        html += '<button class="dp-nav-btn" data-nav-view="deploy" data-nav-node="' + escapeAttr(nodeId) + '">'
          + '\\ud83d\\ude80 Deploy \\u56f3\\u3067\\u78ba\\u8a8d \\u2192</button>';
        html += '</div>';
      }

      // Jump to editor button
      html += '<div class="dp-section">';
      html += '<button class="dp-jump" id="dp-jump-btn">Jump to editor</button>';
      html += '</div>';

      html += '</div>'; // .dp-body

      detailPanel.innerHTML = html;

      // Position near the clicked node
      var wrapper = document.getElementById('preview-wrapper');
      var wrapperRect = wrapper.getBoundingClientRect();
      var targetRect = targetEl.getBoundingClientRect();

      var anchorX = targetRect.right - wrapperRect.left + wrapper.scrollLeft + ${DETAIL_PANEL_GAP};
      var anchorY = targetRect.top - wrapperRect.top + wrapper.scrollTop;

      // If panel would overflow right edge, position to the left
      if (anchorX + ${DETAIL_PANEL_MAX_WIDTH} > wrapper.scrollWidth && anchorX + ${DETAIL_PANEL_MAX_WIDTH} > wrapperRect.width) {
        anchorX = targetRect.left - wrapperRect.left + wrapper.scrollLeft - ${DETAIL_PANEL_MAX_WIDTH + DETAIL_PANEL_GAP};
        if (anchorX < 0) anchorX = ${DETAIL_PANEL_GAP};
      }

      detailPanel.style.left = anchorX + 'px';
      detailPanel.style.top = anchorY + 'px';
      detailPanel.classList.add('visible');

      // Close button
      document.getElementById('dp-close-btn').addEventListener('click', function(e) {
        e.stopPropagation();
        hideDetailPanel();
      });

      // Jump button
      document.getElementById('dp-jump-btn').addEventListener('click', function(e) {
        e.stopPropagation();
        vscode.postMessage({ type: 'navigate', nodeId: currentDetailNodeId });
      });

      // Cross-diagram navigation buttons (team → org, service → deploy)
      detailPanel.querySelectorAll('[data-nav-view]').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var viewType = btn.getAttribute('data-nav-view');
          var navNodeId = btn.getAttribute('data-nav-node');
          hideDetailPanel();
          vscode.postMessage({ type: 'switchViewAndHighlight', viewType: viewType, nodeId: navNodeId });
        });
      });
    }

    function hideDetailPanel() {
      detailPanel.classList.remove('visible');
      detailPanel.innerHTML = '';
      currentDetailNodeId = null;
    }

    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function escapeAttr(str) {
      return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ── Intercept link clicks inside detail panel ──
    detailPanel.addEventListener('click', function(e) {
      var link = e.target.closest('a[href]');
      if (link) {
        e.preventDefault();
        e.stopPropagation();
        vscode.postMessage({ type: 'openExternal', url: link.getAttribute('href') });
      }
    });

    // Stop events on detail panel from propagating to preview
    detailPanel.addEventListener('mousedown', function(e) { e.stopPropagation(); });
    detailPanel.addEventListener('mouseup', function(e) { e.stopPropagation(); });
    detailPanel.addEventListener('wheel', function(e) { e.stopPropagation(); });

    // ── Node click ──
    document.querySelector('#preview').addEventListener('click', function(e) {
      // 1. Info button → detail panel
      var infoBtn = e.target.closest('[data-info-button]');
      if (infoBtn) {
        var infoNodeId = infoBtn.getAttribute('data-info-button');
        var infoGroup = infoBtn.closest('[data-node-id]');
        if (infoNodeId && infoGroup) {
          showDetailPanel(infoNodeId, infoGroup);
        }
        return;
      }

      // 2. Link button → detail panel
      var linkBtn = e.target.closest('[data-link-button]');
      if (linkBtn) {
        var linkNodeId = linkBtn.getAttribute('data-link-button');
        var linkGroup = linkBtn.closest('[data-node-id]');
        if (linkNodeId && linkGroup) {
          showDetailPanel(linkNodeId, linkGroup);
        }
        return;
      }

      // 3. Find the node group
      var group = e.target.closest('[data-node-id]');
      if (!group) {
        // Click outside any node → close detail panel
        hideDetailPanel();
        return;
      }

      var nodeId = group.getAttribute('data-node-id');
      if (!nodeId) return;

      // 4. Cmd/Ctrl+Click → editor jump (any node)
      if (e.metaKey || e.ctrlKey) {
        vscode.postMessage({ type: 'navigate', nodeId: nodeId });
        return;
      }

      // 5. Parent node → drill-down
      if (group.getAttribute('data-has-children') === 'true') {
        hideDetailPanel();
        vscode.postMessage({ type: 'drillDown', nodeId: nodeId });
        return;
      }

      // 6. Leaf node → detail panel
      showDetailPanel(nodeId, group);
    });

    // ── Node hover: show description tooltip ──
    document.querySelector('#preview').addEventListener('mousemove', function(e) {
      // Don't show tooltip when detail panel is open
      if (currentDetailNodeId) { tooltip.style.display = 'none'; return; }
      var group = e.target.closest('[data-node-id]');
      if (!group) { tooltip.style.display = 'none'; return; }
      var nodeId = group.getAttribute('data-node-id');
      var meta = nodeId && nodeMetadataMap[nodeId];
      if (!meta || !meta.descriptionHtml) { tooltip.style.display = 'none'; return; }
      // Show plain description summary in tooltip (strip HTML)
      var tmp = document.createElement('div');
      tmp.innerHTML = meta.descriptionHtml;
      var plain = (tmp.textContent || '').trim();
      if (!plain) { tooltip.style.display = 'none'; return; }
      // Truncate for tooltip
      if (plain.length > 200) plain = plain.substring(0, 200) + '\\u2026';
      tooltip.textContent = plain;
      tooltip.style.display = 'block';
      var x = e.clientX + 14;
      var y = e.clientY + 14;
      if (x + tooltip.offsetWidth > window.innerWidth) x = e.clientX - tooltip.offsetWidth - 8;
      if (y + tooltip.offsetHeight > window.innerHeight) y = e.clientY - tooltip.offsetHeight - 8;
      tooltip.style.left = x + 'px';
      tooltip.style.top = y + 'px';
    });

    document.querySelector('#preview').addEventListener('mouseleave', function() {
      tooltip.style.display = 'none';
    });

    // ── Highlight message from extension ──
    window.addEventListener('message', function(event) {
      var msg = event.data;
      if (msg.type === 'highlight') {
        document.querySelectorAll('[data-node-id].karasu-highlighted').forEach(function(el) {
          el.classList.remove('karasu-highlighted');
        });
        if (msg.nodeId) {
          var target = document.querySelector('[data-node-id="' + msg.nodeId + '"]');
          if (target) {
            target.classList.add('karasu-highlighted');
            target.scrollIntoView({ block: 'nearest' });
          }
        }
      }
    });
  </script>
</body>
</html>`;
}

/** Generate a CSP script nonce for {@link BuildPreviewHtmlParams.nonce}. */
export function generateNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
