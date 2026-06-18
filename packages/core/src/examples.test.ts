/// <reference types="node" />
import { describe, it, expect } from "vitest";
import { Parser } from "./parser/parser.js";
import {
  compile,
  FEATURE_SAMPLES_PROJECT,
  MULTI_FILE_SYSTEM_PROJECT,
  MULTI_FILE_SYSTEM_PROJECT_EN,
  DEPLOY_ONLY_PROJECT,
  DEPLOY_ONLY_PROJECT_EN,
  ORG_ONLY_PROJECT,
  ORG_ONLY_PROJECT_EN,
} from "./index.js";
import { readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = resolve(__dirname, "../../../examples/en/feature-samples");

const files = readdirSync(dir).filter((f: string) => f.endsWith(".krs"));

describe("feature-samples: all files parse without errors", () => {
  it.each(files)("%s", (file) => {
    const src = readFileSync(resolve(dir, file), "utf8");
    const result = Parser.parse(src);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
  });
});

// Drift guard (Issue #1344): FEATURE_SAMPLES_PROJECT bundles examples/en/feature-samples/
// for ProjectMode. The bundled `content` strings must stay byte-identical to the
// on-disk files. The `.claude/rules/examples-sync.md` mapping and `/update-examples`
// skill keep them in sync; this test fails if a hand edit lands on only one side.
describe("feature-samples: bundled examples.ts content matches examples/en/feature-samples/", () => {
  it("registers index.krs plus every .krs file in the directory, and nothing else", () => {
    const bundledPaths = FEATURE_SAMPLES_PROJECT.files.map((f) => f.path).sort();
    const expectedPaths = ["index.krs", ...files.filter((f) => f !== "index.krs")].sort();
    expect(bundledPaths).toEqual(expectedPaths);
  });

  it.each(files)("%s content is byte-identical to the bundled entry", (file) => {
    const onDisk = readFileSync(resolve(dir, file), "utf8");
    const entry = FEATURE_SAMPLES_PROJECT.files.find((f) => f.path === file);
    expect(entry).toBeDefined();
    expect(entry?.content).toBe(onDisk);
  });
});

// Drift guard for MULTI_FILE_SYSTEM_PROJECT — same byte-equal contract as
// FEATURE_SAMPLES_PROJECT above. ProjectMode seeds this on first launch
// (`useProjectInitialization`) so the App's preview matches what users see
// when they open the directory on disk. The seed is locale-matched: ja gets
// MULTI_FILE_SYSTEM_PROJECT, en gets MULTI_FILE_SYSTEM_PROJECT_EN (#1642), and
// both must stay byte-equal to their examples/<lang>/ source.
describe.each([
  ["ja", MULTI_FILE_SYSTEM_PROJECT] as const,
  ["en", MULTI_FILE_SYSTEM_PROJECT_EN] as const,
])(
  "multi-file-system (%s): bundled content matches its on-disk examples/ source",
  (lang, project) => {
    const mfsDir = resolve(__dirname, `../../../examples/${lang}/multi-file-system`);
    const mfsFiles = readdirSync(mfsDir).filter((f: string) => f.endsWith(".krs"));

    it("registers every .krs file in the directory, and nothing else", () => {
      const bundledPaths = project.files.map((f) => f.path).sort();
      const expectedPaths = [...mfsFiles].sort();
      expect(bundledPaths).toEqual(expectedPaths);
    });

    it.each(mfsFiles)("%s content is byte-identical to the bundled entry", (file) => {
      const onDisk = readFileSync(resolve(mfsDir, file), "utf8");
      const entry = project.files.find((f) => f.path === file);
      expect(entry).toBeDefined();
      expect(entry?.content).toBe(onDisk);
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

// Drift guard (#1548): the reference window's per-view Samples tab bundles
// deploy-only / org-only via the reference payload, so the bundled content must
// stay byte-equal to the files on disk. The tab serves the ja projects for `ja`
// and the _EN variants otherwise (#1642); both sides are guarded here.
describe("deploy-only / org-only: bundled content matches examples/", () => {
  it.each([
    ["ja", "deploy-only", DEPLOY_ONLY_PROJECT],
    ["ja", "org-only", ORG_ONLY_PROJECT],
    ["en", "deploy-only", DEPLOY_ONLY_PROJECT_EN],
    ["en", "org-only", ORG_ONLY_PROJECT_EN],
  ])("%s/%s index.krs is byte-identical to the bundled entry", (lang, name, project) => {
    const onDisk = readFileSync(
      resolve(__dirname, `../../../examples/${lang}/${name}/index.krs`),
      "utf8",
    );
    const entry = (project as typeof DEPLOY_ONLY_PROJECT).files.find((f) => f.path === "index.krs");
    expect(entry).toBeDefined();
    expect(entry?.content).toBe(onDisk);
  });
});
