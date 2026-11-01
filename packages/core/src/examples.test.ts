/// <reference types="node" />
import { describe, it, expect } from "vitest";
import { Parser } from "./parser/parser.js";
import { compile, FACET_STYLING_PROJECT, FACET_STYLING_PROJECT_EN } from "./index.js";
import { readFileSync, readdirSync } from "fs";
import { resolve, dirname, relative } from "path";
import { fileURLToPath } from "url";
import { InMemoryFileSystemProvider } from "./fs/in-memory-provider.js";
import { ImportResolver } from "./fs/import-resolver.js";
import { analyze } from "./resolver/warnings.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = resolve(__dirname, "../../../examples/en/feature-samples");

const featureSampleKrsFiles = readdirSync(dir).filter((f: string) => f.endsWith(".krs"));

describe("feature-samples: all files parse without errors", () => {
  it.each(featureSampleKrsFiles)("%s", (file) => {
    const src = readFileSync(resolve(dir, file), "utf8");
    const result = Parser.parse(src);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
  });
});

// The bundled content is generated from examples/ (`pnpm gen:examples`, #3345),
// so it cannot drift from the files. What generation does not check is that the
// facet-styling pair still works as a pair (#2175): the sheet is the subject of
// the example, and an `index.krs` that no longer imports it by its bundled name
// opens with an unresolved import.
describe.each([["ja", FACET_STYLING_PROJECT] as const, ["en", FACET_STYLING_PROJECT_EN] as const])(
  "facet-styling (%s): the bundled entry imports the bundled sheet",
  (_lang, project) => {
    it("keeps the sheet reachable from the entry — the @import must resolve", () => {
      expect(project.files.map((f) => f.path)).toContain("facets.krs.style");
      const index = project.files.find((f) => f.path === "index.krs");
      expect(index?.content).toContain('@import "facets.krs.style"');
    });
  },
);

describe("feature-samples: domain-drift.krs demonstrates domain-to-domain edges", () => {
  it("parses without errors and has a domain edge", () => {
    const src = readFileSync(resolve(dir, "domain-drift.krs"), "utf8");
    const result = Parser.parse(src);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
    // OrderDomain should have an outgoing edge to PaymentDomain
    const system = result.value.systems[0];
    const orderService = system.children.find((c) => c.id === "OrderService");
    const orderDomain = orderService?.children.find((c) => c.id === "OrderDomain");
    expect(orderDomain?.edges.some((e) => e.to === "PaymentDomain")).toBe(true);
  });
});

// The multi-membership sample is the manual-verification fixture for #2178
// (docs/acceptance/2161-boundary-multi-membership.md), and its header comment
// makes three claims a reader will check against the diagram. Fence them here
// so the sample cannot quietly stop demonstrating what it says it does — an
// example whose prose and behaviour disagree is worse than no example.
describe("feature-samples: boundary-multi-membership.krs demonstrates 1:N membership (#2178)", () => {
  const src = () => readFileSync(resolve(dir, "boundary-multi-membership.krs"), "utf8");

  it("keeps both declared memberships, in declaration order", () => {
    const result = Parser.parse(src());
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    expect(result.value.boundaryMembership.get("Payments.Ledger")).toEqual(["payments", "pci"]);
  });

  it("reports the shared node as info, stating the fact and naming the primary", () => {
    const result = Parser.parse(src());
    const info = result.diagnostics.filter((d) => d.code === "duplicate-boundary-assignment");
    expect(info).toHaveLength(1);
    expect(info[0].severity).toBe("info");
    expect(info[0].params).toEqual({ nodeId: "Ledger", existingBoundary: "payments" });
  });

  it("draws the shared node exactly once, inside the first-declared boundary's frame", () => {
    // The claim a reader verifies visually: both frames are drawn, and Ledger
    // sits in `payments` (declared first) rather than `pci`.
    const result = compile(src(), { diagramType: "system", groupBy: "boundary" });
    expect(result.svg).toContain('data-container-id="__group_payments__"');
    expect(result.svg).toContain('data-container-id="__group_pci__"');
    expect(result.svg.match(/data-node-id="Ledger"/g)).toHaveLength(1);

    const frameOf = (groupId: string): { x: number; y: number; w: number; h: number } => {
      const at = result.svg.indexOf(`data-container-id="__group_${groupId}__"`);
      expect(at).toBeGreaterThan(-1);
      const m = result.svg
        .slice(at)
        .match(
          /<rect\b[^>]*?\bx="([\d.]+)"[^>]*?\by="([\d.]+)"[^>]*?\bwidth="([\d.]+)"[^>]*?\bheight="([\d.]+)"/,
        );
      if (!m) throw new Error(`no frame rect for ${groupId}`);
      return { x: +m[1], y: +m[2], w: +m[3], h: +m[4] };
    };
    const nodeAt = (id: string): { x: number; y: number } => {
      const at = result.svg.indexOf(`data-node-id="${id}"`);
      const m = result.svg.slice(at).match(/<rect\b[^>]*?\bx="([\d.]+)"[^>]*?\by="([\d.]+)"/);
      if (!m) throw new Error(`no rect for ${id}`);
      return { x: +m[1], y: +m[2] };
    };
    const payments = frameOf("payments");
    const pci = frameOf("pci");
    const ledger = nodeAt("Ledger");
    const inside = (f: typeof payments, n: typeof ledger): boolean =>
      n.x >= f.x && n.x <= f.x + f.w && n.y >= f.y && n.y <= f.y + f.h;
    expect(inside(payments, ledger)).toBe(true);
    expect(inside(pci, ledger)).toBe(false);
  });
});

// Regression guard for #969: getting-started ships with `service[external]
// { column: right; }`. The column hint must take effect end-to-end through
// compile() so that Payment / Inventory render to the right of Notification
// and the infra row. Without this, an accidental break in the resolver →
// renderer wiring (e.g. forgetting to pass `styles.layoutHints` into
// `layout()`) would silently fall back to declaration order, which is what
// the screenshot in #969 originally showed.
describe("getting-started: column hint affects rendered x positions (#969)", () => {
  function extractRectX(svg: string, nodeId: string): number {
    // Find the node's opening `<g>` and read the `x` attribute on the first
    // following `<rect ... x="..."`. Path-based shapes (cylinder, queue,
    // storage) anchor differently; this helper is used only on rect-shaped
    // services where x reflects the layer ordering.
    const tagIdx = svg.indexOf(`data-node-id="${nodeId}"`);
    if (tagIdx === -1) throw new Error(`No node tag for ${nodeId}`);
    const after = svg.slice(tagIdx);
    const m = after.match(/<rect\b[^>]*?\bx="(\d+(?:\.\d+)?)"/);
    if (!m) throw new Error(`No rect x found after ${nodeId}`);
    return parseFloat(m[1]);
  }

  it("places Payment / Inventory to the right of Notification", () => {
    const exampleDir = resolve(__dirname, "../../../examples/en/getting-started");
    let krs = readFileSync(resolve(exampleDir, "index.krs"), "utf8");
    const styleSrc = readFileSync(resolve(exampleDir, "default.krs.style"), "utf8");
    // Strip `@import` since compile() takes the style source directly.
    krs = krs.replace(/@import [^\n]*\n/, "");
    const result = compile(krs, { diagramType: "system", styleSource: styleSrc });

    const notificationX = extractRectX(result.svg, "Notification");
    const paymentX = extractRectX(result.svg, "Payment");
    const inventoryX = extractRectX(result.svg, "Inventory");
    expect(notificationX).toBeLessThan(paymentX);
    expect(notificationX).toBeLessThan(inventoryX);
  });
});

// Containment regression fence (#2165): the `node-not-in-context` warning is
// derived from `canContain`, so tightening that column silently turns shipped
// examples into warning sources. Every `.krs` we ship must stay clean under our
// own rule — see TPL-2165.
describe("examples: every shipped .krs is free of node-not-in-context warnings", () => {
  const examplesRoot = resolve(__dirname, "../../../examples");
  const krsFiles: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = resolve(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith(".krs")) krsFiles.push(p);
    }
  };
  walk(examplesRoot);

  it("scans a non-trivial number of example files", () => {
    expect(krsFiles.length).toBeGreaterThan(50);
  });

  it.each(krsFiles.map((f) => [f.replace(`${examplesRoot}/`, ""), f] as const))(
    "%s",
    (_name, path) => {
      const misplaced = Parser.parse(readFileSync(path, "utf8")).diagnostics.filter(
        (d) => d.code === "node-not-in-context",
      );
      expect(misplaced).toEqual([]);
    },
  );

  // Physical-reference fence (#2078): `resource Db.T` / `table Db.T` now have to
  // name something the model declares. Asserted per file, which is the strict
  // reading — an example whose infra block sits in a sibling file suppresses the
  // check via the import guard rather than passing it.
  it.each(krsFiles.map((f) => [f.replace(`${examplesRoot}/`, ""), f] as const))(
    "%s leaves no physical reference dangling",
    (_name, path) => {
      const dangling = Parser.parse(readFileSync(path, "utf8")).diagnostics.filter(
        (d) => d.code === "unresolved-resource-ref" || d.code === "unresolved-table-ref",
      );
      expect(dangling).toEqual([]);
    },
  );

  // Placement fence (#2184): a `domain` written directly inside a `system` now
  // raises `unassigned-domain`, the same warning the top-level spelling raises.
  // Shipping an example in that placement would put a warning in front of a
  // reader following our own tutorial — see TPL-2184.
  it.each(krsFiles.map((f) => [f.replace(`${examplesRoot}/`, ""), f] as const))(
    "%s declares no domain directly inside a system",
    (_name, path) => {
      const file = Parser.parse(readFileSync(path, "utf8")).value;
      const systemNested = file.systems.flatMap((system) =>
        system.children.filter((child) => child.kind === "domain").map((child) => child.id),
      );
      expect(systemNested).toEqual([]);
    },
  );

  // Applicability fence (#2225): `tag-not-applicable` fires when a builtin tag
  // sits on a kind outside its `appliesTo`. Every example we ship is also a
  // teaching artifact — a tutorial that warns while the reader follows it
  // teaches the wrong tag placement. Narrowing an `appliesTo` column would
  // silently turn examples into warning sources, the same way #2165 did for
  // containment.
  it.each(krsFiles.map((f) => [f.replace(`${examplesRoot}/`, ""), f] as const))(
    "%s puts every builtin tag on an applicable kind",
    (_name, path) => {
      const file = Parser.parse(readFileSync(path, "utf8")).value;
      const offenders = analyze(file, [])
        .filter((w) => w.kind === "tag-not-applicable")
        .map((w) => (w.kind === "tag-not-applicable" ? `${w.params.nodeId}[${w.params.tag}]` : ""));
      expect(offenders).toEqual([]);
    },
  );
});

// Scope fence (#2075): `edge-endpoint-not-at-scope` reports an edge whose
// endpoint is not a peer where the edge is declared. Resolved through the real
// `ImportResolver` — a per-file parse would miss the cross-file system reopen
// that `examples/*/multi-file-system` relies on, and a concatenation of the
// files would wrongly report it (the two `system Blog` blocks only merge via
// the import path). See TPL-2075.
//
// Slice E (#2577) widened what an endpoint may name — the two-segment cap is
// gone and qualified references resolve by the suffix rule — on the promise
// that no existing model changes verdict. `edge-target-ambiguous` joins the
// scan because that promise is about the corpus drawing **no new diagnostic**,
// not about one code staying quiet (TPL-2577).
describe("examples: every shipped .krs is free of edge endpoint diagnostics", () => {
  const examplesRoot = resolve(__dirname, "../../../examples");
  const scanned: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = resolve(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith(".krs")) scanned.push(p);
    }
  };
  walk(examplesRoot);

  it("reports no out-of-scope or ambiguous endpoint in any example", async () => {
    const provider = new InMemoryFileSystemProvider();
    for (const f of scanned) {
      await provider.writeFile(`/${relative(examplesRoot, f)}`, readFileSync(f, "utf8"));
    }
    const hits: string[] = [];
    for (const f of scanned) {
      const entry = `/${relative(examplesRoot, f)}`;
      const result = await new ImportResolver(provider).resolve(entry);
      for (const w of analyze(result.krsFile, [])) {
        if (w.kind === "edge-endpoint-not-at-scope") {
          hits.push(`${entry}: ${w.params.from}->${w.params.to} (${w.params.endpointId})`);
        } else if (w.kind === "edge-target-ambiguous") {
          hits.push(`${entry}: ambiguous ${w.params.path}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
