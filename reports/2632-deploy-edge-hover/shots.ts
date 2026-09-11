/**
 * Visual evidence for #2632 — the deploy view of the reverse-engineered dify
 * model, before and during an edge hover.
 *
 * The SVG is compiled directly and dropped into a page carrying the preview
 * hover rules, rather than driven through the app: the model is 363 KB, and
 * pasting it through Monaco is slow enough to be its own source of noise. The
 * rules under test are pure CSS on the rendered SVG, so the wrapper is a
 * faithful stand-in.
 *
 * Run: DIFY=/workspaces/dify pnpm exec tsx reports/2632-deploy-edge-hover/shots.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { compile } from "../../packages/core/src/index.js";

const ROOT = resolve(import.meta.dirname, "../..");
const OUT = join(ROOT, "reports/2632-deploy-edge-hover");
const DIFY = process.env.DIFY ?? "/workspaces/dify";

const src = readFileSync(join(DIFY, "index.krs"), "utf8");

/** The hover rules under test, lifted verbatim from the app stylesheet. */
const HOVER_CSS = readFileSync(join(ROOT, "packages/app/src/styles/components/preview.css"), "utf8")
  .split("/* ── Edge hover affordance")[1]
  .split("/* ── Preview Toolbar")[0];

function page(svg: string): string {
  return `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; background: #0d1117; }
    .preview-container { display: block; }
    /* Fit the canvas to the page so every edge is reachable by the pointer:
       the dify deploy view is several thousand px wide at natural size. */
    .preview-container svg { display: block; width: 100%; height: auto; }
    /* ── Edge hover affordance${HOVER_CSS}
  </style><div class="preview-container">${svg}</div>`;
}

async function main(): Promise<void> {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1200 }, colorScheme: "dark" });

  for (const diagramType of ["deploy", "system"] as const) {
    const r = compile(src, { diagramType, interactive: true, nodeControls: true });
    if (!r.svg) {
      console.error(`no svg for ${diagramType}`);
      continue;
    }
    const html = join(OUT, `${diagramType}.html`);
    writeFileSync(html, page(r.svg));

    const p = await ctx.newPage();
    await p.goto(`file://${html}`);

    // Grow the viewport to the scaled canvas, so `mouse.move` can reach any
    // edge. Without this the pointer silently lands on whatever happens to sit
    // at the clamped coordinate, and the measurement reports a *peer*.
    const height = await p
      .locator(".preview-container svg")
      .evaluate((el) => Math.ceil(el.getBoundingClientRect().height));
    await p.setViewportSize({ width: 1600, height: Math.min(Math.max(height, 400), 4000) });

    const edges = p.locator(".krs-edge");
    const n = await edges.count();

    await p.screenshot({ path: join(OUT, `${diagramType}-rest.png`), fullPage: true });

    // Hover an edge, aiming at a point *on its stroke* rather than at the
    // group's bounding-box centre: a routed edge is an L, and its bbox centre
    // is empty canvas. Candidates are tried longest-first — the long edges are
    // the ones a reader most needs to trace — and a candidate is rejected when
    // another edge is painted over the point we aimed at, so the screenshot
    // always shows the edge the measurement reports.
    const byLength: { i: number; len: number }[] = [];
    for (let i = 0; i < n; i++) {
      const box = await edges.nth(i).boundingBox();
      byLength.push({ i, len: box ? box.width + box.height : 0 });
    }
    byLength.sort((a, b) => b.len - a.len);

    let best = -1;
    for (const { i } of byLength) {
      const point = await edges.nth(i).evaluate((el) => {
        const shape = el.querySelector(".krs-edge__hitline");
        if (shape === null) return null;
        const geom = shape as unknown as SVGPathElement;
        const at = geom.getPointAtLength(geom.getTotalLength() / 2);
        const m = (shape as unknown as SVGGraphicsElement).getScreenCTM();
        if (m === null) return null;
        return { x: at.x * m.a + at.y * m.c + m.e, y: at.x * m.b + at.y * m.d + m.f };
      });
      if (point === null) continue;
      await p.mouse.move(point.x, point.y);
      if (await edges.nth(i).evaluate((el) => el.matches(":hover"))) {
        best = i;
        break;
      }
    }
    if (best === -1) throw new Error("no edge could be hovered");

    await p.waitForTimeout(300); // the 0.15s opacity transition
    await p.screenshot({ path: join(OUT, `${diagramType}-hover.png`), fullPage: true });

    const measured = await edges.nth(best).evaluate((el) => {
      let o = 1;
      let node: Element | null = el;
      while (node !== null) {
        const v = Number.parseFloat(getComputedStyle(node).opacity);
        if (!Number.isNaN(v)) o *= v;
        node = node.parentElement;
      }
      const sel = "line, polyline, path";
      const line = [...el.querySelectorAll(sel)].find(
        (x) => !x.classList.contains("krs-edge__hitline"),
      );
      return {
        effectiveOpacity: o,
        shape: line ? line.tagName : null,
        strokeWidth: line ? getComputedStyle(line).strokeWidth : null,
      };
    });
    console.log(`${diagramType}: ${n} edges, hovered #${best} →`, JSON.stringify(measured));
    await p.close();
  }

  await browser.close();
}

void main();
