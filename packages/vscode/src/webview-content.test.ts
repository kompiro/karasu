import { describe, expect, it } from "vitest";
import {
  DETAIL_PANEL_GAP,
  DETAIL_PANEL_MAX_WIDTH,
  type BuildPreviewHtmlParams,
  buildPreviewHtml,
} from "./webview-content.js";
import { buildPreviewPanelLabels } from "./webview-i18n.js";

// Fences the webview HTML/CSS/JS template extracted from
// PreviewPanel._buildHtml (Issue #2018 point 3). preview-panel.ts still
// owns computing metadataJson/breadcrumbHtml (needs `marked` and core's
// `isSafeLinkUrl`) and the CSP nonce; this module only assembles the final
// document from those already-computed strings, so it can be exercised here
// without mocking `vscode` (rule 3 of .claude/rules/vscode-webview-tests.md
// — the actual DOM/interaction contract stays fenced by the ExTester
// WebView harness).

function baseParams(overrides: Partial<BuildPreviewHtmlParams> = {}): BuildPreviewHtmlParams {
  return {
    svg: '<svg><g data-node-id="n1"></g></svg>',
    metadataJson: "{}",
    breadcrumbHtml: "",
    viewType: "system",
    displayMode: "shape",
    nonce: "test-nonce-123",
    labels: buildPreviewPanelLabels("en"),
    ...overrides,
  };
}

describe("buildPreviewHtml", () => {
  it("is a pure function: identical params produce byte-identical output", () => {
    const params = baseParams();
    expect(buildPreviewHtml(params)).toBe(buildPreviewHtml({ ...params }));
  });

  it("embeds the svg, metadataJson, breadcrumbHtml, and nonce inputs verbatim", () => {
    const html = buildPreviewHtml(
      baseParams({
        svg: '<svg><g data-node-id="svc-order"></g></svg>',
        metadataJson: '{"svc-order":{"kind":"service"}}',
        breadcrumbHtml: '<button data-nav-index="0">System</button>',
        nonce: "abc123",
      }),
    );
    expect(html).toContain('<div id="preview"><svg><g data-node-id="svc-order"></g></svg></div>');
    expect(html).toContain('var nodeMetadataMap = {"svc-order":{"kind":"service"}};');
    expect(html).toContain('<div id="breadcrumb"><button data-nav-index="0">System</button></div>');
    expect(html).toContain("script-src 'nonce-abc123'");
    expect(html).toContain('<script nonce="abc123">');
  });

  it("highlights the active view button via an inline style (not a CSS class)", () => {
    // packages/vscode-e2e/tests/webview/harness.ts asserts active toolbar
    // state via getAttribute('style').includes('background') — this must
    // stay an inline style, never a CSS class.
    const html = buildPreviewHtml(baseParams({ viewType: "deploy" }));
    expect(html).toMatch(/<button data-view="deploy" style="background:[^"]*">Deploy<\/button>/);
    expect(html).toContain('<button data-view="system" style="">System</button>');
    expect(html).toContain('<button data-view="org" style="">Org</button>');
  });

  it("highlights the icon-mode button only when displayMode is icon", () => {
    const iconHtml = buildPreviewHtml(baseParams({ displayMode: "icon" }));
    expect(iconHtml).toMatch(/<button id="icon-mode-btn" style="background:[^"]*">/);

    const shapeHtml = buildPreviewHtml(baseParams({ displayMode: "shape" }));
    expect(shapeHtml).toContain('<button id="icon-mode-btn" style="">');
  });

  it("interpolates DETAIL_PANEL_MAX_WIDTH/GAP consistently into the CSS and script", () => {
    const html = buildPreviewHtml(baseParams());
    expect(html).toContain(`max-width: ${DETAIL_PANEL_MAX_WIDTH}px;`);
    expect(html).toContain(`+ ${DETAIL_PANEL_GAP};`);
    expect(html).toContain(`anchorX + ${DETAIL_PANEL_MAX_WIDTH} > wrapper.scrollWidth`);
    expect(html).toContain(`- ${DETAIL_PANEL_MAX_WIDTH + DETAIL_PANEL_GAP};`);
  });

  // Golden byte-identity fence for Issue #2018 point 7: the detail-panel
  // property-row emoji/label text (runtime/type/image/schedule/realizes,
  // role, tags, team) now derives from the shared `@karasu-tools/core`
  // NODE_DETAIL_PROPERTY_FIELDS spec (also consumed by the app's
  // NodeDetailPanel) instead of being hand-typed twice. This snapshot pins
  // the full output so any drift in that codegen — a wrong `\uXXXX` escape,
  // a reordered field, a changed label — fails loudly instead of silently
  // changing the webview's rendered HTML.
  it("full document output is byte-stable (golden snapshot)", () => {
    expect(buildPreviewHtml(baseParams({ displayMode: "shape" }))).toMatchSnapshot();
  });

  // Companion golden snapshot for the OTHER display mode. The detail-panel
  // property rows (runtime/type/image/schedule/realizes, role, tags, team)
  // are emitted by the webview's client-side `showDetailPanel` JS, whose
  // source text is display-mode-agnostic — `displayMode` only flips the
  // toolbar `#icon-mode-btn` inline style (`iconModeStyle`). Pinning both
  // modes fences that the shared-spec-driven property rows never start
  // depending on display mode (the regression a code review flagged as a
  // risk for the `realizes` 🔗 row).
  it("icon-mode document output is byte-stable (golden snapshot)", () => {
    expect(buildPreviewHtml(baseParams({ displayMode: "icon" }))).toMatchSnapshot();
  });

  // Permanent regression guard: switching display mode must change the
  // output ONLY at the icon-mode toolbar button, never anywhere in the
  // detail-panel JS. If a future edit ever made a property row (e.g.
  // `realizes`) conditional on display mode, this diff would widen and the
  // assertion would fail. Reproduces origin/main's behavior, where the
  // property-row `if (meta.X)` guards do not reference `displayMode` at all.
  it("display mode affects only the icon-mode toolbar button, not the detail-panel JS", () => {
    const shape = buildPreviewHtml(baseParams({ displayMode: "shape" }));
    const icon = buildPreviewHtml(baseParams({ displayMode: "icon" }));

    // No unresolved template markers leaked into either output.
    expect(shape).not.toContain("${");
    expect(icon).not.toContain("${");

    // The realizes / property-row source lines are present and identical in
    // both modes (they live in the display-mode-agnostic script).
    for (const mode of [shape, icon]) {
      expect(mode).toContain(
        "if (meta.realizes?.length) html += '<div class=\"dp-prop\">\\ud83d\\udd17 realizes: '",
      );
      expect(mode).toContain(
        "if (meta.runtime) html += '<div class=\"dp-prop\">\\ud83d\\udda5 runtime: '",
      );
    }

    // The single divergence: the icon-mode button's inline style.
    let head = 0;
    while (head < shape.length && shape[head] === icon[head]) head++;
    let tail = 0;
    while (
      tail < shape.length - head &&
      shape[shape.length - 1 - tail] === icon[icon.length - 1 - tail]
    ) {
      tail++;
    }
    const shapeRegion = shape.slice(head, shape.length - tail);
    const iconRegion = icon.slice(head, icon.length - tail);
    // The only differing bytes are inside the icon-mode button's style="".
    expect(shape.slice(head - 30, head)).toContain('id="icon-mode-btn" style="');
    expect(shapeRegion).toBe("");
    expect(iconRegion).toBe(
      "background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-color:var(--vscode-button-background);",
    );
  });

  // Issue #2074: the detail-panel labels are resolved by the extension host
  // per active locale (webview-i18n.ts, mirroring the app NodeDetailPanel's
  // `t("nodeDetail.*")` keys) and injected as `PANEL_LABELS`. The en labels
  // must be the English section titles; the ja labels the Japanese ones — so
  // the webview matches the app under BOTH locales instead of the previous
  // hardcoded-English (with an accidental Japanese Deploy-nav) mix.
  it("injects PANEL_LABELS resolved for the active locale (en)", () => {
    const html = buildPreviewHtml(baseParams({ labels: buildPreviewPanelLabels("en") }));
    expect(html).toContain(`var PANEL_LABELS = ${JSON.stringify(buildPreviewPanelLabels("en"))};`);
    // English section titles / buttons.
    expect(html).toContain('"linksTitle":"🔗 Links"');
    expect(html).toContain('"resourcesTitle":"📦 Storage resources"');
    expect(html).toContain('"capabilitiesTitle":"🔐 Capabilities"');
    expect(html).toContain('"migrationTitle":"🕒 Migration intent"');
    expect(html).toContain('"jumpToEditor":"↗ Jump to editor"');
    expect(html).toContain('"openDeployView":"🚀 View in Deploy diagram →"');
  });

  it("injects PANEL_LABELS resolved for the active locale (ja)", () => {
    const html = buildPreviewHtml(baseParams({ labels: buildPreviewPanelLabels("ja") }));
    expect(html).toContain(`var PANEL_LABELS = ${JSON.stringify(buildPreviewPanelLabels("ja"))};`);
    // Japanese section titles / buttons — parity with the app under ja.
    expect(html).toContain('"linksTitle":"🔗 リンク"');
    expect(html).toContain('"resourcesTitle":"📦 ストレージリソース"');
    expect(html).toContain('"capabilitiesTitle":"🔐 ケイパビリティ"');
    expect(html).toContain('"migrationTitle":"🕒 移行 intent"');
    expect(html).toContain('"jumpToEditor":"↗ エディタへジャンプ"');
    expect(html).toContain('"openDeployView":"🚀 Deploy 図で確認 →"');
  });
});
