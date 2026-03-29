import { describe, it, expect, beforeEach } from "vitest";
import { render } from "./svg-renderer.js";
import { resolveStyles } from "../resolver/style-resolver.js";
import { extractView } from "../view/view-extract.js";
import { Parser } from "../parser/parser.js";
import { StyleParser } from "../parser/style-parser.js";
import { getBuiltinStyleSheet } from "../builtins/default-style.js";
import { loadAndRegisterIcon } from "./svg-icon-loader.js";
import { clearRegistry } from "./shape-registry.js";
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
  return render(
    viewSlice,
    styles,
    serviceIdsWithDeploy,
    parseResult.value.ownerIndex,
    undefined,
    displayMode,
  );
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

  it("renders clickable team button when service has team property", () => {
    const svg = renderFromSource(`
system Test {
  service ECommerce {
    label "ECサイト"
    team "ec-team"
  }
}
    `);
    expect(svg).toContain('data-team-button="ec-team"');
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
