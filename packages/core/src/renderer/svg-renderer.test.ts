import { describe, it, expect, beforeEach } from "vitest";
import { render } from "./svg-renderer.js";
import { resolveStyles } from "../resolver/style-resolver.js";
import { extractView } from "../view/view-extract.js";
import { assignEdgeCanonicalIds } from "../resolver/canonical-id.js";
import { Parser } from "../parser/parser.js";
import { StyleParser } from "../parser/style-parser.js";
import { getBuiltinStyleSheet } from "../builtins/default-style.js";
import { analyze } from "../resolver/warnings.js";
import { loadAndRegisterIcon } from "./svg-icon-loader.js";
import { clearRegistry } from "../shapes/shape-registry.js";
import { registerBuiltinShapes } from "./shapes.js";
import type { DisplayMode } from "./layout.js";

function renderFromSource(
  krs: string,
  style?: string,
  serviceIdsWithDeploy?: Set<string>,
  displayMode?: DisplayMode,
): string {
  const parseResult = Parser.parse(krs);
  const sheets = style
    ? [getBuiltinStyleSheet(), StyleParser.parse(style).value]
    : [getBuiltinStyleSheet()];
  const styles = resolveStyles(parseResult.value.systems, sheets);
  const viewSlice = extractView(parseResult.value.systems, []);
  return render(viewSlice, styles, serviceIdsWithDeploy, parseResult.value.ownerIndex, displayMode);
}

describe("SVG Renderer", () => {
  it("renders empty system", () => {
    const svg = renderFromSource("system Empty {}");
    expect(svg).toContain("<svg");
    expect(svg).toContain("No nodes to render");
  });

  it("renders a single node", () => {
    const svg = renderFromSource(`
system Test {
  service ECommerce {
    label "ECサイト"
  }
}
    `);
    expect(svg).toContain("<svg");
    expect(svg).toContain("ECサイト");
    expect(svg).toContain("<rect");
  });

  it("renders client with distinct color from service", () => {
    const svg = renderFromSource(`
system Test {
  client MobileApp [mobile] { label "Mobile" }
  service ECommerce { label "EC" }
}
    `);
    expect(svg).toContain("Mobile");
    expect(svg).toContain("EC");
    // client uses purple #6D28D9 (default-style.ts), service uses #0369A1
    expect(svg).toContain("#6D28D9");
    expect(svg).toContain("#0369A1");
  });

  it("renders a single resource count badge on the client card (Issue #914)", () => {
    const svg = renderFromSource(`
system Test {
  client WebApp [web] {
    label "Web"
    resource localStorage "preferences"
    resource indexedDB "outbox"
  }
}
    `);
    expect(svg).toContain("📦 ×2");
    expect(svg).toContain('data-client-resource-count="2"');
    // Per-resource text rows are no longer emitted; the full list moved to
    // the NodeDetailPanel. A <title> tooltip preserves quick discoverability.
    expect(svg).not.toContain('data-client-resource="');
    expect(svg).toContain("localStorage &quot;preferences&quot;");
    expect(svg).toContain("indexedDB &quot;outbox&quot;");
  });

  it("emits no resource badge when the client has zero resources", () => {
    const svg = renderFromSource(`
system Test {
  client Bare [web] { label "Bare" }
}
    `);
    expect(svg).not.toContain("📦");
    expect(svg).not.toContain("data-client-resource-count");
  });

  it("renders a capability count badge on the client card", () => {
    const svg = renderFromSource(`
system Test {
  client App [mobile] {
    label "App"
    capability camera
    capability geolocation
  }
}
    `);
    expect(svg).toContain("🔐 ×2");
    expect(svg).toContain('data-client-capability-count="2"');
    expect(svg).toContain("camera, geolocation");
  });

  it("emits no capability badge when the client has zero capabilities", () => {
    const svg = renderFromSource(`
system Test {
  client Bare [web] { label "Bare" }
}
    `);
    expect(svg).not.toContain("🔐");
    expect(svg).not.toContain("data-client-capability-count");
  });

  it("renders multiple nodes with edges", () => {
    const svg = renderFromSource(`
system Test {
  user Customer {
    label "顧客"
  }
  service Shop {
    label "ショップ"
  }
  Customer -> Shop "購入"
}
    `);
    expect(svg).toContain("顧客");
    expect(svg).toContain("ショップ");
    expect(svg).toContain("購入");
    expect(svg).toContain("<line");
    expect(svg).toContain("marker-end");
  });

  it("applies styles from stylesheet", () => {
    const svg = renderFromSource(
      `
system Test {
  service ECommerce [external] {
    label "ECサイト"
  }
}
      `,
      `
[external] {
  border-style: dashed;
  background-color: #1F2937;
}
      `,
    );
    expect(svg).toContain("stroke-dasharray");
    expect(svg).toContain("#1F2937");
  });

  it("renders user shape", () => {
    const svg = renderFromSource(
      `
system Test {
  user Customer
}
      `,
      `
user {
  shape: user;
}
      `,
    );
    expect(svg).toContain("<circle");
    expect(svg).toContain("<path");
  });

  it("renders badge for annotated nodes", () => {
    const svg = renderFromSource(
      `
system Test {
  service Legacy @deprecated {
    label "旧"
  }
}
      `,
      `
@deprecated {
  badge-color: #EF4444;
  badge-icon: "⚠";
  badge-label: "非推奨";
  opacity: 0.6;
}
      `,
    );
    expect(svg).toContain("#EF4444");
    expect(svg).toContain("非推奨");
    expect(svg).toContain('opacity="0.6"');
  });

  it("default @deprecated badge label is the reference-data en label", () => {
    const svg = renderFromSource(`
system Test {
  service Legacy @deprecated {
    label "旧"
  }
}
    `);
    expect(svg).toContain("Deprecated");
    expect(svg).not.toContain("非推奨");
  });

  it("migration coexistence: @deprecated and @migration_target domains have independent badges", () => {
    // Reproduces the bug from issue #505: when two domains share the same ID but carry
    // different annotations (migration coexistence), each must render its own badge label.
    const krs = `
system OrderSystem {
  service LegacyService {
    label "Legacy Service"
    domain Contract @deprecated {
      label "Contract (deprecated)"
    }
  }
  service NewService {
    label "New Service"
    domain Contract @migration_target {
      label "Contract"
    }
  }
}
    `;

    // Render LegacyService view: should show @deprecated badge
    const parseResult = Parser.parse(krs);
    const sheets = [getBuiltinStyleSheet()];
    const legacyStyles = resolveStyles(parseResult.value.systems, sheets);
    const legacySlice = extractView(parseResult.value.systems, ["OrderSystem", "LegacyService"]);
    const legacySvg = render(legacySlice, legacyStyles);
    expect(legacySvg).toContain("Deprecated");
    expect(legacySvg).not.toContain("Migration target");

    // Render NewService view: should show @migration_target badge
    const newStyles = resolveStyles(parseResult.value.systems, sheets);
    const newSlice = extractView(parseResult.value.systems, ["OrderSystem", "NewService"]);
    const newSvg = render(newSlice, newStyles);
    expect(newSvg).toContain("Migration target");
    expect(newSvg).not.toContain("Deprecated");
  });

  it("renders async edges as dashed", () => {
    const svg = renderFromSource(`
system Test {
  service A
  service B
  A --> B "非同期"
}
    `);
    expect(svg).toContain("stroke-dasharray");
    expect(svg).toContain("非同期");
  });

  it("keeps the sync edge solid when a parallel async edge exists between the same pair", () => {
    // Regression: the edge style map was keyed by `from->to` only, so the
    // async edge clobbered the sync edge's style and both rendered dashed.
    const svg = renderFromSource(`
system Test {
  service A
  service B
  A -> B "sync call"
  A --> B "async call"
}
    `);
    const groupFor = (kind: string) => {
      const m = svg.match(new RegExp(`<g[^>]*data-edge-kind="${kind}"[\\s\\S]*?</g>`));
      return m?.[0] ?? "";
    };
    const syncGroup = groupFor("sync");
    const asyncGroup = groupFor("async");
    expect(syncGroup).not.toBe("");
    expect(asyncGroup).not.toBe("");
    expect(syncGroup).not.toContain("stroke-dasharray");
    expect(asyncGroup).toContain('stroke-dasharray="8 4"');
  });

  it("renders dotted edges with a distinct stroke-dasharray from dashed", () => {
    const dashedSvg = renderFromSource(
      `
system Test {
  service A
  service B
  A -> B [link]
}
      `,
      `
edge[link] { border-style: dashed; }
      `,
    );
    const dottedSvg = renderFromSource(
      `
system Test {
  service A
  service B
  A -> B [link]
}
      `,
      `
edge[link] { border-style: dotted; }
      `,
    );
    expect(dashedSvg).toContain('stroke-dasharray="8 4"');
    expect(dottedSvg).toContain('stroke-dasharray="2 2"');
    expect(dottedSvg).not.toContain('stroke-dasharray="8 4"');
  });

  it("renders description text", () => {
    const svg = renderFromSource(`
system Test {
  service ECommerce {
    description "商品管理と注文処理"
  }
}
    `);
    expect(svg).toContain("商品管理と注文処理");
  });

  it("renders system label", () => {
    const svg = renderFromSource(`
system ECPlatform {
  label "ECプラットフォーム"
  service ECommerce
}
    `);
    expect(svg).toContain("ECプラットフォーム");
  });

  it("renders deploy button on service node when serviceIdsWithDeploy contains its id", () => {
    const svg = renderFromSource(
      `
system Test {
  service ECommerce {
    label "ECサイト"
  }
  service Payment {
    label "決済"
  }
}
      `,
      undefined,
      new Set(["ECommerce"]),
    );
    expect(svg).toContain('data-deploy-button="ECommerce"');
    expect(svg).not.toContain('data-deploy-button="Payment"');
  });

  it("renders clickable team button when service is owned by a team", () => {
    const svg = renderFromSource(`
system Test {
  service ECommerce {
    label "ECサイト"
  }
}
organization Corp {
  team ecTeam {
    owns ECommerce
  }
}
    `);
    expect(svg).toContain('data-team-button="ecTeam"');
    expect(svg).toContain("👥");
  });

  it("renders info button on leaf service node with description", () => {
    const svg = renderFromSource(`
system Test {
  service ECommerce {
    label "ECサイト"
    description "商品管理と注文処理"
  }
}
    `);
    expect(svg).toContain('data-info-button="ECommerce"');
  });

  it("renders info button on leaf service node with team (from ownerIndex)", () => {
    const svg = renderFromSource(
      `
system Test {
  service ECommerce {
    label "ECサイト"
  }
}
organization Corp {
  team ecTeam {
    owns ECommerce
  }
}
      `,
    );
    expect(svg).toContain('data-info-button="ECommerce"');
  });

  it("does not render info button on node with no metadata", () => {
    const svg = renderFromSource(`
system Test {
  service ECommerce {
    label "ECサイト"
  }
}
    `);
    expect(svg).not.toContain('data-info-button="ECommerce"');
  });

  it("does not render deploy button when serviceIdsWithDeploy is not provided", () => {
    const svg = renderFromSource(`
system Test {
  service ECommerce {
    label "ECサイト"
  }
}
    `);
    expect(svg).not.toContain("data-deploy-button");
  });

  it("renders role text on user node", () => {
    const svg = renderFromSource(`
system Test {
  user Admin [human] {
    label "管理者"
    description "システムを運用する"
    role "システム管理者"
  }
}
    `);
    expect(svg).toContain("管理者");
    expect(svg).toContain("システムを運用する");
    expect(svg).toContain("システム管理者");
    expect(svg).toContain('font-style="italic"');
  });

  it("renders link button only when linkCount > 0 but no team (lines 482-489)", () => {
    const svg = renderFromSource(`
system Test {
  service ECommerce {
    label "ECサイト"
    link "https://example.com" "Wiki"
  }
}
    `);
    expect(svg).toContain("data-link-button");
    expect(svg).toContain("🔗");
    expect(svg).not.toContain("data-team-button");
  });

  it("renders both link and team buttons when service has both", () => {
    const svg = renderFromSource(`
system Test {
  service ECommerce {
    label "ECサイト"
    link "https://example.com" "Wiki"
  }
}
organization Corp {
  team ecTeam {
    owns ECommerce
  }
}
    `);
    expect(svg).toContain("data-link-button");
    expect(svg).toContain("data-team-button");
    expect(svg).toContain("🔗");
    expect(svg).toContain("👥");
  });
});

describe("Icon mode rendering", () => {
  const CARD_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">
    <g class="krs-pictogram" transform="translate(6, 4)">
      <rect width="20" height="20" fill="{{color}}"/>
    </g>
    <text class="krs-label" x="30" y="19" text-anchor="start"/>
    <text class="krs-description" x="8" y="44" text-anchor="start"/>
  </svg>`;

  beforeEach(() => {
    clearRegistry();
    registerBuiltinShapes();
    loadAndRegisterIcon("service-icon", CARD_ICON_SVG, true);
  });

  it("uses fixed 160×100 node size for icon mode with description", () => {
    const svg = renderFromSource(
      `
system Test {
  service ECommerce {
    label "ECサイト"
    description "商品管理"
  }
}
      `,
      `service { shape: url("service-icon"); }`,
      undefined,
      "icon",
    );
    expect(svg).toContain("<svg");
    // viewBox 160×100 into 160×100 node → scale(1, 1)
    expect(svg).toContain("scale(1, 1)");
  });

  it("uses fixed 160×56 node size for icon mode without description", () => {
    const svg = renderFromSource(
      `
system Test {
  service ECommerce {
    label "ECサイト"
  }
}
      `,
      `service { shape: url("service-icon"); }`,
      undefined,
      "icon",
    );
    // viewBox 160×100 into 160×56 node → scale(1, 0.56)
    expect(svg).toContain("scale(1, 0.56)");
  });

  it("truncates long label in icon mode", () => {
    const svg = renderFromSource(
      `
system Test {
  service ECommerce {
    label "This is a very long service name that exceeds the width"
  }
}
      `,
      `service { shape: url("service-icon"); }`,
      undefined,
      "icon",
    );
    expect(svg).toContain("…");
    expect(svg).not.toContain("that exceeds the width");
  });

  it("wraps description to multiple lines in icon mode", () => {
    const svg = renderFromSource(
      `
system Test {
  service ECommerce {
    description "This is a long description that should be wrapped into multiple lines inside the card"
  }
}
      `,
      `service { shape: url("service-icon"); }`,
      undefined,
      "icon",
    );
    expect(svg).toContain("<tspan");
  });

  it("limits description to 3 lines with ellipsis in icon mode", () => {
    const svg = renderFromSource(
      `
system Test {
  service ECommerce {
    description "AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH IIII JJJJ KKKK LLLL MMMM NNNN OOOO PPPP QQQQ RRRR SSSS"
  }
}
      `,
      `service { shape: url("service-icon"); }`,
      undefined,
      "icon",
    );
    // Should have at most 3 tspan elements
    const tspanCount = (svg.match(/<tspan/g) ?? []).length;
    expect(tspanCount).toBeLessThanOrEqual(3);
    expect(tspanCount).toBeGreaterThan(0);
    expect(svg).toContain("…");
  });

  it("injects color placeholder in builtIn icon", () => {
    const svg = renderFromSource(
      `
system Test {
  service ECommerce {
    label "EC"
  }
}
      `,
      `service { shape: url("service-icon"); }`,
      undefined,
      "icon",
    );
    // The {{color}} placeholder should be replaced with actual color value
    expect(svg).not.toContain("{{color}}");
  });

  it("renders a border rect before icon body in icon mode", () => {
    const svg = renderFromSource(
      `
system Test {
  service ECommerce {
    label "ECサイト"
  }
}
      `,
      `service { shape: url("service-icon"); }`,
      undefined,
      "icon",
    );
    // A card frame rect must appear before the icon <g> element
    const rectIdx = svg.indexOf("<rect");
    const iconGIdx = svg.indexOf("<g transform=");
    expect(rectIdx).toBeGreaterThan(-1);
    expect(iconGIdx).toBeGreaterThan(-1);
    expect(rectIdx).toBeLessThan(iconGIdx);
  });

  it("border rect uses node's border-color and background-color", () => {
    const svg = renderFromSource(
      `
system Test {
  service ECommerce {
    label "ECサイト"
  }
}
      `,
      `service { shape: url("service-icon"); background-color: #123456; border-color: #ABCDEF; border-width: 3; }`,
      undefined,
      "icon",
    );
    expect(svg).toContain('fill="#123456"');
    expect(svg).toContain('stroke="#ABCDEF"');
    expect(svg).toContain('stroke-width="3"');
  });

  it("border rect uses border-radius from resolved style", () => {
    const svg = renderFromSource(
      `
system Test {
  service ECommerce {
    label "ECサイト"
  }
}
      `,
      `service { shape: url("service-icon"); border-radius: 12; }`,
      undefined,
      "icon",
    );
    expect(svg).toContain('rx="12"');
    expect(svg).toContain('ry="12"');
  });

  it("does not add extra border rect in shape mode", () => {
    // In shape mode (no displayMode), the box shape renders its own rect.
    // No additional card frame rect should be prepended.
    // We verify by comparing rect count: icon mode should have more rects than shape mode
    // for the same node (icon mode adds a card frame on top of the icon body).
    const svgShape = renderFromSource(
      `
system Test {
  service ECommerce {
    label "ECサイト"
  }
}
      `,
    );
    const svgIcon = renderFromSource(
      `
system Test {
  service ECommerce {
    label "ECサイト"
  }
}
      `,
      `service { shape: url("service-icon"); }`,
      undefined,
      "icon",
    );
    const shapeRectCount = (svgShape.match(/<rect\s/g) ?? []).length;
    const iconRectCount = (svgIcon.match(/<rect\s/g) ?? []).length;
    // Icon mode adds one extra card frame rect per icon node
    expect(iconRectCount).toBeGreaterThan(shapeRectCount);
  });

  it("renders description as single-line text when icon template is used in shape mode (lines 343-359)", () => {
    // Shape mode (no displayMode) with an icon template that has a description slot.
    // → Falls into the else branch of `if (iconMode)` inside the description slot block.
    const svg = renderFromSource(
      `
system Test {
  service ECommerce {
    label "ECサイト"
    description "商品管理と注文処理"
  }
}
      `,
      `service { shape: url("service-icon"); }`,
      // No displayMode → iconMode = false → single-line description via lines 343-359
    );
    expect(svg).toContain("商品管理");
    // Should NOT have tspan elements (wrapText is not called in shape mode)
    expect(svg).not.toContain("<tspan");
  });

  it("truncates description with wrapText when exactly 3 lines are exceeded using CJK text (lines 681-683)", () => {
    // CJK chars are 1.5× wide. 144px / (6.5*1.5=9.75) ≈ 14 chars per line.
    // A 60-char CJK description (summarized to 50+…=51 chars) fills 3 full lines,
    // triggering the maxLines truncation path in wrapText at line 681.
    const longCjkDesc = "ア".repeat(60);
    const svg = renderFromSource(
      `
system Test {
  service ECommerce {
    description "${longCjkDesc}"
  }
}
      `,
      `service { shape: url("service-icon"); }`,
      undefined,
      "icon",
    );
    const tspanCount = (svg.match(/<tspan/g) ?? []).length;
    expect(tspanCount).toBe(3);
    expect(svg).toContain("…");
  });

  it("shape mode rendering is unchanged when displayMode is undefined", () => {
    const svgDefault = renderFromSource(`
system Test {
  service ECommerce {
    label "ECサイト"
    description "商品管理"
  }
}
    `);
    const svgShape = renderFromSource(
      `
system Test {
  service ECommerce {
    label "ECサイト"
    description "商品管理"
  }
}
      `,
      undefined,
      undefined,
      "shape",
    );
    // Both should produce identical output (no icon mode behavior)
    expect(svgDefault).toBe(svgShape);
  });
});

describe("cyclic edge rendering", () => {
  function renderWithAnalysis(krs: string): string {
    const parseResult = Parser.parse(krs);
    const sheets = [getBuiltinStyleSheet()];
    analyze(parseResult.value, sheets);
    const styles = resolveStyles(parseResult.value.systems, sheets);
    const viewSlice = extractView(parseResult.value.systems, []);
    return render(viewSlice, styles);
  }

  it("renders cyclic edge with krs-edge--cyclic class", () => {
    const krs = `
system S {
  service A {}
  service B {}
  A -> B
  B -> A
}
`;
    const svg = renderWithAnalysis(krs);
    expect(svg).toContain('class="krs-edge--cyclic"');
  });

  it("does not add krs-edge--cyclic class to non-cyclic edges", () => {
    const krs = `
system S {
  service A {}
  service B {}
  A -> B
}
`;
    const svg = renderWithAnalysis(krs);
    expect(svg).not.toContain('class="krs-edge--cyclic"');
  });

  it("renders cyclic edges with red color from builtin style", () => {
    const krs = `
system S {
  service A {}
  service B {}
  A -> B
  B -> A
}
`;
    const svg = renderWithAnalysis(krs);
    expect(svg).toContain("#EF4444");
  });

  describe("diff state attributes", () => {
    function renderWithDiff(
      krs: string,
      nodeDiff: Map<string, string>,
      edgeDiff: Map<string, string>,
    ): string {
      const parseResult = Parser.parse(krs);
      const styles = resolveStyles(parseResult.value.systems, [getBuiltinStyleSheet()]);
      const viewSlice = extractView(parseResult.value.systems, ["S"]);
      assignEdgeCanonicalIds(viewSlice.childEdges);
      return render(
        viewSlice,
        styles,
        undefined,
        parseResult.value.ownerIndex,
        undefined,
        undefined,
        {
          nodeDiffState: nodeDiff,
          edgeDiffState: edgeDiff,
        },
      );
    }

    it("emits data-diff-state on nodes that have a diff entry", () => {
      const krs = `
system S {
  service A {}
  service B {}
}
`;
      const svg = renderWithDiff(
        krs,
        new Map([
          ["A", "added"],
          ["B", "removed"],
        ]),
        new Map(),
      );
      expect(svg).toContain('data-node-id="A"');
      expect(svg).toContain('data-diff-state="added"');
      expect(svg).toContain('data-diff-state="removed"');
    });

    it("emits data-diff-state on edges that have a diff entry", () => {
      const krs = `
system S {
  service A {}
  service B {}
  A -> B
}
`;
      const svg = renderWithDiff(krs, new Map(), new Map([["A->B", "added"]]));
      expect(svg).toContain('data-edge-from="A"');
      expect(svg).toContain('data-edge-to="B"');
      expect(svg).toContain('data-diff-state="added"');
    });

    it("emits data-edge-canonical-id and data-edge-kind for unauthored edges", () => {
      const krs = `
system S {
  service A {}
  service B {}
  A -> B
  A --> B "async"
}
`;
      const svg = renderWithDiff(krs, new Map(), new Map());
      // `>` is XML-escaped inside attribute values; the browser unescapes it
      // when reading the attribute via the DOM (verified separately in the
      // PreviewPane menu test).
      expect(svg).toContain('data-edge-canonical-id="A-&gt;B"');
      expect(svg).toContain('data-edge-canonical-id="A--&gt;B"');
      expect(svg).toContain('data-edge-kind="sync"');
      expect(svg).toContain('data-edge-kind="async"');
    });

    it("emits data-edge-canonical-id from the author id when present", () => {
      const krs = `
system S {
  service A {}
  service B {}
  A -> B "primary" #criticalWrite
}
`;
      const svg = renderWithDiff(krs, new Map(), new Map());
      expect(svg).toContain('data-edge-canonical-id="criticalWrite"');
    });

    it("emits data-edge-label only for labelled edges", () => {
      const krs = `
system S {
  service A {}
  service B {}
  service C {}
  A -> B "Process payment"
  A -> C
}
`;
      const svg = renderWithDiff(krs, new Map(), new Map());
      expect(svg).toContain('data-edge-label="Process payment"');
      // The unlabelled A -> C edge must not carry an empty data-edge-label.
      expect(svg.match(/data-edge-label=/g)).toHaveLength(1);
    });

    it("marks edges with a canonical id as interactive and emits a wide transparent hitline", () => {
      const krs = `
system S {
  service A {}
  service B {}
  A -> B
}
`;
      const svg = renderWithDiff(krs, new Map(), new Map());
      // Interactive class signals hover/cursor styling in the app layer.
      expect(svg).toContain('class="krs-edge krs-edge--interactive"');
      // Wide transparent hitline behind the visible stroke for easier targeting.
      expect(svg).toContain('class="krs-edge__hitline"');
      expect(svg).toMatch(/stroke="transparent"\s+stroke-width="14"/);
    });

    it("omits data-diff-state when no diff entry is provided", () => {
      const krs = `
system S {
  service A {}
}
`;
      const svg = renderWithDiff(krs, new Map(), new Map());
      // The node group still renders, but without the diff attribute
      expect(svg).toContain('data-node-id="A"');
      expect(svg).not.toContain("data-diff-state");
    });
  });

  describe("annotation badge diff (Issue #738 / design doc D-2)", () => {
    function renderWithDiffMeta(
      krs: string,
      nodeDiffMeta: Map<string, import("../diff/view-diff.js").NodeDiffMeta>,
    ): string {
      const parseResult = Parser.parse(krs);
      const styles = resolveStyles(parseResult.value.systems, [getBuiltinStyleSheet()]);
      const viewSlice = extractView(parseResult.value.systems, ["S"]);
      assignEdgeCanonicalIds(viewSlice.childEdges);
      return render(
        viewSlice,
        styles,
        undefined,
        parseResult.value.ownerIndex,
        undefined,
        undefined,
        { nodeDiffMeta },
      );
    }

    it("marks the merged badge as added when an annotation was added", () => {
      const krs = `
system S {
  service A @deprecated {}
}
`;
      const svg = renderWithDiffMeta(
        krs,
        new Map([
          [
            "A",
            {
              state: "unchanged",
              changes: { annotations: { added: ["deprecated"], removed: [] } },
            },
          ],
        ]),
      );
      expect(svg).toContain('data-node-badge="A"');
      expect(svg).toMatch(/data-node-badge="A"[^>]*data-diff-state="added"/);
      expect(svg).toContain('data-annotation-added="deprecated"');
    });

    it("renders a ghost removed badge when the node has no current badge", () => {
      const krs = `
system S {
  service A {}
}
`;
      const svg = renderWithDiffMeta(
        krs,
        new Map([
          [
            "A",
            {
              state: "unchanged",
              changes: { annotations: { added: [], removed: ["deprecated"] } },
            },
          ],
        ]),
      );
      expect(svg).toMatch(/data-node-badge="A"[^>]*data-diff-state="removed"/);
      expect(svg).toContain('data-annotation-removed="deprecated"');
    });

    it("keeps annotation-only nodes at state=unchanged on the main group", () => {
      const krs = `
system S {
  service A @deprecated {}
}
`;
      const svg = renderWithDiffMeta(
        krs,
        new Map([
          [
            "A",
            {
              state: "unchanged",
              changes: { annotations: { added: ["deprecated"], removed: [] } },
            },
          ],
        ]),
      );
      // The node <g> itself must stay "unchanged" (no amber border) even
      // though the badge carries its own added state.
      expect(svg).toMatch(/data-node-id="A"[^>]*data-diff-state="unchanged"/);
    });
  });
});
