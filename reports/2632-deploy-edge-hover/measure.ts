/**
 * What a reader actually gets when hovering an edge, per render surface and
 * per shape tag, under the stylesheet on `main` versus the spike's.
 *
 * Three independent gates decide whether the hover affordance fires, and the
 * census cannot see any of them — they are CSS, not markup:
 *
 *   1. the group class    — `.krs-edge--interactive` (id-gated) vs `.krs-edge`
 *   2. the shape tag      — the stroke rules name `line` / `polyline` only, and
 *                           a hop-marked edge (#1859 P2c-C) is a `path`
 *   3. the ancestor group — a deploy edge sits in `g.ghost-edges` at 0.3, and
 *                           group opacity composites, so `opacity: 1` on the
 *                           child cannot lift it
 *
 * Run: DIFY=/workspaces/dify pnpm exec tsx reports/2632-deploy-edge-hover/measure.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { compile } from "../../packages/core/src/index.js";

const ROOT = resolve(import.meta.dirname, "../..");
const OUT = join(ROOT, "reports/2632-deploy-edge-hover");
const DIFY = process.env.DIFY ?? "/workspaces/dify";

/** The rules as they stand on `main`. */
const MAIN_CSS = `
.preview-container svg .krs-edge--interactive { cursor: context-menu; }
.preview-container svg .krs-edge--interactive:hover line:not(.krs-edge__hitline),
.preview-container svg .krs-edge--interactive:hover polyline:not(.krs-edge__hitline) {
  stroke-width: 3; filter: brightness(1.4);
}
.preview-container svg .krs-edge--interactive:hover text { filter: brightness(1.4); }
.preview-container svg .krs-edge { transition: opacity 0.15s ease; }
.preview-container svg .krs-edge--interactive:hover { opacity: 1 !important; }
.preview-container svg:has(.krs-edge--interactive:hover) .krs-edge:not(:hover) {
  opacity: 0.25 !important;
}
`;

/** The rules the spike proposes. */
const SPIKE_CSS = `
.preview-container svg .krs-edge--interactive { cursor: context-menu; }
.preview-container svg .krs-edge:hover line:not(.krs-edge__hitline),
.preview-container svg .krs-edge:hover polyline:not(.krs-edge__hitline),
.preview-container svg .krs-edge:hover path:not(.krs-edge__hitline) {
  stroke-width: 3; filter: brightness(1.4);
}
.preview-container svg .krs-edge:hover text { filter: brightness(1.4); }
.preview-container svg .krs-edge { transition: opacity 0.15s ease; }
.preview-container svg .krs-edge:hover { opacity: 1 !important; }
.preview-container svg:has(.krs-edge:hover) .krs-edge:not(:hover) { opacity: 0.25 !important; }
.preview-container svg .ghost-edges:has(.krs-edge:hover) { opacity: 1; }
`;

const src = readFileSync(join(DIFY, "index.krs"), "utf8");

interface Sample {
  surface: string;
  variant: string;
  shape: string;
  edges: number;
  thickened: number;
  litToFull: number;
  dimsPeers: number;
}

async function main(): Promise<void> {
  const browser = await chromium.launch();
  const rows: Sample[] = [];

  for (const diagramType of ["system", "deploy"] as const) {
    const svg = compile(src, { diagramType, interactive: true, nodeControls: true }).svg;
    if (svg === undefined) continue;

    for (const [variant, css] of [
      ["main", MAIN_CSS],
      ["spike", SPIKE_CSS],
    ] as const) {
      const file = join(OUT, `measure-${diagramType}-${variant}.html`);
      writeFileSync(
        file,
        `<!doctype html><meta charset="utf-8"><style>
           body { margin: 0; background: #0d1117; }
           .preview-container svg { display: block; width: 100%; height: auto; }
           ${css}</style><div class="preview-container">${svg}</div>`,
      );

      const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
      await page.goto(`file://${file}`);
      const h = await page
        .locator(".preview-container svg")
        .evaluate((el) => Math.ceil(el.getBoundingClientRect().height));
      await page.setViewportSize({ width: 1600, height: Math.min(Math.max(h, 400), 8000) });

      const edges = page.locator(".krs-edge");
      const n = await edges.count();
      const per = new Map<string, { edges: number; thick: number; full: number; dims: number }>();

      for (let i = 0; i < n; i++) {
        const aim = await edges.nth(i).evaluate((el) => {
          const hit = el.querySelector(".krs-edge__hitline");
          if (hit === null) return null;
          const geom = hit as unknown as SVGPathElement;
          const at = geom.getPointAtLength(geom.getTotalLength() / 2);
          const m = (hit as unknown as SVGGraphicsElement).getScreenCTM();
          if (m === null) return null;
          return { x: at.x * m.a + at.y * m.c + m.e, y: at.x * m.b + at.y * m.d + m.f };
        });
        // No hit-line at all (the `main` variant on a non-addressable edge) or
        // an overlapping edge on top: aim at the visible stroke instead, so
        // every edge is measured under both variants.
        const point =
          aim ??
          (await edges.nth(i).evaluate((el) => {
            const shape = [...el.querySelectorAll("line, polyline, path")].find(
              (x) => !x.classList.contains("krs-edge__hitline"),
            );
            if (shape === undefined) return null;
            const geom = shape as unknown as SVGPathElement;
            const at = geom.getPointAtLength(geom.getTotalLength() / 2);
            const m = (shape as unknown as SVGGraphicsElement).getScreenCTM();
            if (m === null) return null;
            return { x: at.x * m.a + at.y * m.c + m.e, y: at.x * m.b + at.y * m.d + m.f };
          }));
        if (point === null) continue;

        await page.mouse.move(point.x, point.y);
        // `.krs-edge` carries `transition: opacity 0.15s ease`, so sampling
        // straight after the move reads a mid-flight value and every edge looks
        // as though it never reaches full strength.
        await page.waitForTimeout(250);
        const r = await edges.nth(i).evaluate((el) => {
          if (!el.matches(":hover")) return null;
          const shape = [...el.querySelectorAll("line, polyline, path")].find(
            (x) => !x.classList.contains("krs-edge__hitline"),
          );
          if (shape === undefined) return null;
          let o = 1;
          let node: Element | null = el;
          while (node !== null) {
            const v = Number.parseFloat(getComputedStyle(node).opacity);
            if (!Number.isNaN(v)) o *= v;
            node = node.parentElement;
          }
          const peer = [...document.querySelectorAll(".krs-edge")].find((x) => x !== el);
          return {
            tag: shape.tagName,
            strokeWidth: Number.parseFloat(getComputedStyle(shape).strokeWidth),
            effectiveOpacity: o,
            peerOpacity:
              peer === undefined ? 1 : Number.parseFloat(getComputedStyle(peer).opacity),
          };
        });
        if (r === null) continue;

        const b = per.get(r.tag) ?? { edges: 0, thick: 0, full: 0, dims: 0 };
        b.edges++;
        if (r.strokeWidth >= 3) b.thick++;
        if (r.effectiveOpacity > 0.99) b.full++;
        if (r.peerOpacity < 0.3) b.dims++;
        per.set(r.tag, b);
      }

      for (const [shape, b] of per) {
        rows.push({
          surface: diagramType,
          variant,
          shape,
          edges: b.edges,
          thickened: b.thick,
          litToFull: b.full,
          dimsPeers: b.dims,
        });
      }
      await page.close();
    }
  }

  await browser.close();

  const head = ["surface", "variant", "shape", "edges", "thickened", "lit to full", "dims peers"];
  const cells = rows.map((r) => [
    r.surface,
    r.variant,
    r.shape,
    String(r.edges),
    `${r.thickened}/${r.edges}`,
    `${r.litToFull}/${r.edges}`,
    `${r.dimsPeers}/${r.edges}`,
  ]);
  const w = head.map((h) => h.length);
  for (const row of cells) row.forEach((c, i) => (w[i] = Math.max(w[i], c.length)));
  const line = (cs: string[]) => cs.map((c, i) => c.padEnd(w[i])).join("  ");
  console.log(line(head));
  console.log(w.map((x) => "-".repeat(x)).join("  "));
  for (const row of cells) console.log(line(row));
}

void main();
