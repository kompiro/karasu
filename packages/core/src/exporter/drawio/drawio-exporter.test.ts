import { describe, it, expect } from "vitest";
import type { LayoutResult } from "../../renderer/layout.js";
import { exportDrawio } from "./drawio-exporter.js";

function makeLayout(partial: Partial<LayoutResult>): LayoutResult {
  return {
    nodes: new Map(),
    edges: [],
    containers: [],
    width: 800,
    height: 600,
    ...partial,
  };
}

describe("exportDrawio", () => {
  it("produces a well-formed mxfile header with one diagram per page", () => {
    const xml = exportDrawio({
      pages: [
        { id: "system", name: "System", layout: makeLayout({}) },
        { id: "deploy", name: "Deploy", layout: makeLayout({}) },
      ],
    });
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
    expect(xml).toContain(`<mxfile host="karasu" type="export">`);
    expect(xml.match(/<diagram /g)?.length).toBe(2);
    expect(xml).toContain(`id="system" name="System"`);
    expect(xml).toContain(`id="deploy" name="Deploy"`);
  });

  it("emits the two root mxCells required by mxGraph", () => {
    const xml = exportDrawio({
      pages: [{ id: "system", name: "System", layout: makeLayout({}) }],
    });
    expect(xml).toContain(`<mxCell id="system-0" />`);
    expect(xml).toContain(`<mxCell id="system-1" parent="system-0" />`);
  });

  it("renders a node as a vertex cell with absolute geometry when no container encloses it", () => {
    const layout = makeLayout({
      nodes: new Map([
        [
          "a",
          {
            kind: "domain",
            id: "a",
            label: "A",
            properties: { description: undefined, tags: [], links: [] },
            linkCount: 0,
            hasChildren: false,
            hasDescription: false,
            x: 10,
            y: 20,
            width: 120,
            height: 60,
          },
        ],
      ]),
    });
    const xml = exportDrawio({
      pages: [{ id: "p", name: "P", layout }],
    });
    expect(xml).toContain(`id="p-a"`);
    expect(xml).toContain(`vertex="1"`);
    expect(xml).toContain(`parent="p-1"`);
    expect(xml).toContain(`x="10" y="20" width="120" height="60"`);
    expect(xml).toContain(`data-karasu-id="a"`);
    expect(xml).toContain(`data-karasu-kind="domain"`);
  });

  it("nests a node inside the smallest enclosing container using relative geometry", () => {
    const layout = makeLayout({
      containers: [
        { id: "outer", label: "Outer", x: 0, y: 0, width: 400, height: 400, ghost: false },
        { id: "inner", label: "Inner", x: 20, y: 20, width: 200, height: 200, ghost: false },
      ],
      nodes: new Map([
        [
          "n",
          {
            kind: "domain",
            id: "n",
            label: "N",
            properties: { description: undefined, tags: [], links: [] },
            linkCount: 0,
            hasChildren: false,
            hasDescription: false,
            x: 60,
            y: 60,
            width: 80,
            height: 40,
          },
        ],
      ]),
    });
    const xml = exportDrawio({
      pages: [{ id: "p", name: "P", layout }],
    });
    // node's parent is the inner container; geometry is relative to it (60-20=40)
    expect(xml).toMatch(/id="p-n"[^>]*parent="p-inner"/);
    expect(xml).toContain(`x="40" y="40" width="80" height="40"`);
    // inner container's parent is the outer container
    expect(xml).toMatch(/id="p-inner"[^>]*parent="p-outer"/);
  });

  it("renders edges as edge cells with source/target and aggregated attribute when applicable", () => {
    const layout = makeLayout({
      nodes: new Map([
        [
          "a",
          {
            kind: "service",
            id: "a",
            label: "A",
            properties: { description: undefined, tags: [], links: [] },
            linkCount: 0,
            hasChildren: false,
            hasDescription: false,
            x: 0,
            y: 0,
            width: 100,
            height: 50,
          },
        ],
        [
          "b",
          {
            kind: "service",
            id: "b",
            label: "B",
            properties: { description: undefined, tags: [], links: [] },
            linkCount: 0,
            hasChildren: false,
            hasDescription: false,
            x: 200,
            y: 0,
            width: 100,
            height: 50,
          },
        ],
      ]),
      edges: [
        {
          from: "a",
          to: "b",
          label: "2 domain edges",
          fromPoint: { x: 100, y: 25 },
          toPoint: { x: 200, y: 25 },
          domainEdges: [
            { fromDomainId: "a.x", fromDomainLabel: "X", toDomainId: "b.y", toDomainLabel: "Y" },
            { fromDomainId: "a.p", fromDomainLabel: "P", toDomainId: "b.q", toDomainLabel: "Q" },
          ],
        },
      ],
    });
    const xml = exportDrawio({
      pages: [{ id: "p", name: "P", layout }],
    });
    expect(xml).toMatch(/edge="1"/);
    expect(xml).toContain(`source="p-a"`);
    expect(xml).toContain(`target="p-b"`);
    expect(xml).toContain(`value="2 domain edges"`);
    expect(xml).toContain(`data-karasu-aggregated="a.x-&gt;b.y,a.p-&gt;b.q"`);
  });

  it("escapes special characters in labels while prefixing the kind stereotype", () => {
    const layout = makeLayout({
      nodes: new Map([
        [
          "x",
          {
            kind: "domain",
            id: "x",
            label: "A & B <c>",
            properties: { description: undefined, tags: [], links: [] },
            linkCount: 0,
            hasChildren: false,
            hasDescription: false,
            x: 0,
            y: 0,
            width: 10,
            height: 10,
          },
        ],
      ]),
    });
    const xml = exportDrawio({
      pages: [{ id: "p", name: "P", layout }],
    });
    // stereotype prefix (html tags are xml-escaped for the attribute so draw.io
    // decodes and renders them as HTML when html=1 is set in the style)
    expect(xml).toContain("&lt;span");
    expect(xml).toContain("«domain»");
    // label content is escaped
    expect(xml).toContain("A &amp; B &lt;c&gt;");
  });

  it("includes tags and annotations from metadata in label and data attrs", () => {
    const layout = makeLayout({
      nodes: new Map([
        [
          "o",
          {
            kind: "service",
            id: "o",
            label: "Orders",
            annotations: ["deprecated"],
            properties: { description: undefined, tags: [], links: [] },
            linkCount: 0,
            hasChildren: false,
            hasDescription: false,
            x: 0,
            y: 0,
            width: 100,
            height: 50,
          },
        ],
      ]),
    });
    const metadata = new Map([["o", { tags: ["payment", "pii"], annotations: ["deprecated"] }]]);
    const xml = exportDrawio({
      pages: [{ id: "p", name: "P", layout, metadata }],
    });
    // Stereotype, annotation badge, and tag badge all appear in the label (xml-escaped).
    expect(xml).toContain("«service»");
    expect(xml).toContain("@deprecated");
    expect(xml).toContain("#payment");
    expect(xml).toContain("#pii");
    // And preserved on the cell for tooling round-trip.
    expect(xml).toContain(`data-karasu-tags="payment,pii"`);
    expect(xml).toContain(`data-karasu-annotations="deprecated"`);
  });

  it("surfaces container tags/annotations supplied via metadata", () => {
    const layout = makeLayout({
      containers: [
        { id: "svc", label: "Checkout", x: 0, y: 0, width: 200, height: 200, ghost: false },
      ],
    });
    const metadata = new Map([["svc", { tags: ["core"], annotations: ["migration_target"] }]]);
    const xml = exportDrawio({
      pages: [{ id: "p", name: "P", layout, metadata }],
    });
    expect(xml).toContain("#core");
    expect(xml).toContain("@migration_target");
    expect(xml).toContain(`data-karasu-tags="core"`);
  });

  it("applies kind-specific shape overrides (user → umlActor, database → cylinder3)", () => {
    const layout = makeLayout({
      nodes: new Map([
        [
          "u",
          {
            kind: "user",
            id: "u",
            label: "Customer",
            properties: { description: undefined, tags: [], links: [] },
            linkCount: 0,
            hasChildren: false,
            hasDescription: false,
            x: 0,
            y: 0,
            width: 80,
            height: 80,
          },
        ],
        [
          "db",
          {
            kind: "database",
            id: "db",
            label: "Orders",
            properties: { description: undefined, tags: [], links: [] },
            linkCount: 0,
            hasChildren: false,
            hasDescription: false,
            x: 100,
            y: 0,
            width: 80,
            height: 80,
          },
        ],
      ]),
    });
    const xml = exportDrawio({
      pages: [{ id: "p", name: "P", layout }],
    });
    expect(xml).toMatch(/id="p-u"[^>]*style="[^"]*shape=umlActor/);
    expect(xml).toMatch(/id="p-db"[^>]*style="[^"]*shape=cylinder3/);
  });

  it("skips edges whose endpoints are not rendered on the page", () => {
    const layout = makeLayout({
      edges: [
        {
          from: "a",
          to: "b",
          fromPoint: { x: 0, y: 0 },
          toPoint: { x: 0, y: 0 },
        },
      ],
    });
    const xml = exportDrawio({
      pages: [{ id: "p", name: "P", layout }],
    });
    expect(xml).not.toContain(`edge="1"`);
  });
});
