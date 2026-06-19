import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { renderDeploy } from "./deploy-renderer.js";
import { getBuiltinStyleSheet } from "../builtins/default-style.js";
import { getIconThemeStyleSheet } from "../builtins/icon-theme.js";
import { loadAndRegisterIcon } from "./svg-icon-loader.js";
import { resolveStyles } from "../resolver/style-resolver.js";
import "../renderer/shapes.js";
import type { DeployViewSlice } from "../view/deploy-view-extract.js";

const LOC = { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 0, offset: 0 } };

function makeStyles() {
  return resolveStyles([], [getBuiltinStyleSheet()]);
}

function makeSlice(): DeployViewSlice {
  return {
    deployLabel: "本番環境",
    containers: [
      {
        serviceId: "ECommerce",
        serviceLabel: "ECサイト",
        units: [
          { kind: "oci", id: "order-api", properties: { runtime: "Node.js 20" }, loc: LOC },
          { kind: "oci", id: "order-worker", properties: { runtime: "Node.js 20" }, loc: LOC },
        ],
      },
      {
        serviceId: "Payment",
        serviceLabel: "決済サービス",
        units: [{ kind: "lambda", id: "payment-fn", properties: { runtime: "Go 1.22" }, loc: LOC }],
      },
    ],
    unclassifiedUnits: [{ kind: "job", id: "migration", properties: {}, loc: LOC }],
    ghostEdges: [{ from: "ECommerce", to: "Payment", kind: "sync" }],
  };
}

describe("renderDeploy", () => {
  let styles: ReturnType<typeof makeStyles>;

  beforeAll(() => {
    styles = makeStyles();
  });

  it("returns a valid SVG string", () => {
    const svg = renderDeploy(makeSlice(), styles);
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });

  it("includes container labels", () => {
    const svg = renderDeploy(makeSlice(), styles);
    expect(svg).toContain("ECサイト");
    expect(svg).toContain("決済サービス");
  });

  it("includes unit labels", () => {
    const svg = renderDeploy(makeSlice(), styles);
    expect(svg).toContain("order-api");
    expect(svg).toContain("payment-fn");
  });

  it("includes runtime as description text", () => {
    const svg = renderDeploy(makeSlice(), styles);
    expect(svg).toContain("Node.js 20");
    expect(svg).toContain("Go 1.22");
  });

  it("includes unclassified unit", () => {
    const svg = renderDeploy(makeSlice(), styles);
    expect(svg).toContain("migration");
    expect(svg).toContain("Unclassified");
  });

  it("includes data-container-id attributes", () => {
    const svg = renderDeploy(makeSlice(), styles);
    expect(svg).toContain('data-container-id="ECommerce"');
    expect(svg).toContain('data-container-id="Payment"');
  });

  it("includes data-node-id attributes for units", () => {
    const svg = renderDeploy(makeSlice(), styles);
    expect(svg).toContain('data-node-id="ECommerce::order-api"');
  });

  it("renders empty state SVG for empty slice", () => {
    const empty: DeployViewSlice = {
      deployLabel: "",
      containers: [],
      unclassifiedUnits: [],
      ghostEdges: [],
    };
    const svg = renderDeploy(empty, styles);
    expect(svg).toContain("<svg");
    expect(svg).toContain("No deploy block defined");
  });

  it("uses provided empty-state labels in the empty SVG", () => {
    const empty: DeployViewSlice = {
      deployLabel: "",
      containers: [],
      unclassifiedUnits: [],
      ghostEdges: [],
    };
    const svg = renderDeploy(empty, styles, undefined, {
      emptyLabels: { deployTitle: "デプロイ未定義", deployHint: "追加してね" },
    });
    expect(svg).toContain("デプロイ未定義");
    expect(svg).toContain("追加してね");
    expect(svg).not.toContain("No deploy block defined");
  });

  it("includes ghost edge group", () => {
    const svg = renderDeploy(makeSlice(), styles);
    expect(svg).toContain("ghost-edges");
  });

  it("includes kind badge labels", () => {
    const svg = renderDeploy(makeSlice(), styles);
    expect(svg).toContain("oci");
    expect(svg).toContain("lambda");
  });

  describe("containerDiffState", () => {
    it("emits data-diff-state on the container group when provided", () => {
      const containerDiffState = new Map<string, string>([
        ["ECommerce", "added"],
        ["Payment", "unchanged"],
      ]);
      const svg = renderDeploy(makeSlice(), styles, undefined, { containerDiffState });
      expect(svg).toContain('data-container-id="ECommerce" data-diff-state="added"');
      expect(svg).toContain('data-container-id="Payment" data-diff-state="unchanged"');
    });

    it("omits data-diff-state when no state is supplied", () => {
      const svg = renderDeploy(makeSlice(), styles);
      expect(svg).not.toContain("data-diff-state");
    });
  });

  describe("icon mode", () => {
    it("renders frame rect with stroke when displayMode is icon", () => {
      const svg = renderDeploy(makeSlice(), styles, "icon");
      // renderFromLayout adds a frame rect with stroke in icon mode
      expect(svg).toContain("stroke");
    });

    it("accepts displayMode without error", () => {
      expect(() => renderDeploy(makeSlice(), styles, "icon")).not.toThrow();
      expect(() => renderDeploy(makeSlice(), styles, "shape")).not.toThrow();
    });

    // Regression for #1666: deploy units are stored in resolved styles under the
    // bare unit id (`order-api`), but the deploy layout keys nodes as
    // `containerId::unitId`. The render lookup used to miss and fall back to the
    // default (box) style, so Icon Mode drew no icon. With the fallback to
    // `layoutNode.id`, the unit picks up its `shape: url("oci")` and the
    // registered icon glyph is drawn.
    it("draws the registered icon glyph for a unit in Icon Mode (#1666)", () => {
      const iconsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../icons");
      loadAndRegisterIcon("oci", readFileSync(resolve(iconsDir, "oci.svg"), "utf8"));
      const slice = makeSlice();
      const units = [...slice.containers.flatMap((c) => c.units), ...slice.unclassifiedUnits];
      // Icon Mode injects the icon theme (shape: url(...)); shape mode does not.
      const iconStyles = resolveStyles(
        [],
        [getBuiltinStyleSheet(), getIconThemeStyleSheet()],
        units,
      );
      const shapeStyles = resolveStyles([], [getBuiltinStyleSheet()], units);

      // The icon glyph is emitted by registerIcon as `<g transform="translate(...) scale(...)">`.
      const ICON_GLYPH = /transform="translate\([^)]*\) scale\(/;
      expect(renderDeploy(slice, iconStyles, "icon")).toMatch(ICON_GLYPH);
      expect(renderDeploy(slice, shapeStyles, "shape")).not.toMatch(ICON_GLYPH);
    });
  });

  describe("light theme", () => {
    // Regression for #1697: the deploy-kind rules in the light template set
    // background / border / badge but used to omit `color`, so node labels fell
    // back to the default white (#F9FAFB) and were unreadable on the light cards.
    it("renders dark, readable node text (not the white default)", () => {
      const slice = makeSlice();
      const units = [...slice.containers.flatMap((c) => c.units), ...slice.unclassifiedUnits];
      const lightStyles = resolveStyles([], [getBuiltinStyleSheet("light")], units);
      const svg = renderDeploy(slice, lightStyles, "shape");
      // `order-api` is an `oci` unit → dark blue text in the light theme, not the
      // white default (#F9FAFB) that was unreadable on the light card.
      const ociNode = svg.slice(svg.indexOf('data-node-id="ECommerce::order-api"'));
      expect(ociNode).toMatch(/<text[^>]*fill="#1E3A8A"/);
      expect(ociNode).not.toMatch(/<text[^>]*fill="#F9FAFB"/);
    });
  });
});
