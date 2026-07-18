import { describe, expect, it } from "vitest";
import {
  DETAIL_PANEL_GAP,
  DETAIL_PANEL_MAX_WIDTH,
  type BuildPreviewHtmlParams,
  buildPreviewHtml,
} from "./webview-content.js";

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
    expect(buildPreviewHtml(baseParams())).toMatchSnapshot();
  });
});
