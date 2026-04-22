import { describe, it, expect, beforeAll } from "vitest";
import { renderDeploy } from "./deploy-renderer.js";
import { getBuiltinStyleSheet } from "../builtins/default-style.js";
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
    expect(svg).toContain("No nodes to render");
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
  });
});
