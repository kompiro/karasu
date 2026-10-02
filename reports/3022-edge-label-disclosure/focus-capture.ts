// Drives the focus canvas (packages/app/src/components/focus-canvas.ts) in a
// real browser for the #3022 spike report: opens it the way a reader would,
// takes the screenshots, lifts the drawn canvases out as SVG, and measures
// every node and every pair of the diagram.

import { chromium, type Browser, type Page } from "@playwright/test";

export interface FocusMeasure {
  width: number;
  height: number;
  lanes: number;
  cards: number;
  /** Longest label, in wrapped lines. */
  linesMax: number;
  labelCard: number;
  labelLabel: number;
  /** A line through a label, its own or another lane's. */
  lineLabel: number;
  /** A line through the inside of a card. */
  lineCard: number;
}

export interface NodeFocus {
  id: string;
  in: number;
  out: number;
  columns: FocusMeasure;
  spine: FocusMeasure;
}

export interface FocusCapture {
  shots: { pill: Buffer; edge: Buffer; columns: Buffer; spine: Buffer };
  canvases: { edge: string; mutual: string; columns: string; spine: string; busiest: string };
  nodes: NodeFocus[];
  pairs: FocusMeasure[];
  /** Edges whose line the pointer cannot reach on the main canvas, at the capture's preview size. */
  unclickable: string[];
  mutual: [string, string];
  busiest: string;
}

interface Harness {
  /** The diagram, as the app's preview shows it. */
  svg: string;
  /** Theme tokens and the app's own edge rules. */
  css: string;
  /** `attachEdgeDisclosure` and `attachFocusCanvas`, attached to `.preview-container`. */
  script: string;
}

type Size = { width: number; height: number };

async function openPage(browser: Browser, h: Harness, size: Size, layout?: string): Promise<Page> {
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1.5 });
  await page.setContent(
    `<!doctype html><html><head><script>var __name = (f) => f;</script>` +
      `<style>html,body{margin:0;height:100%;background:#0F172A}` +
      `.preview-container{width:100vw;height:100vh;overflow:hidden}` +
      `.preview-container>svg{display:block;width:100%;height:100%}${h.css}</style></head>` +
      `<body><div class="preview-container"${layout ? ` data-focus-layout="${layout}"` : ""}>${h.svg}</div>` +
      `<script>${h.script}</script></body></html>`,
  );
  return page;
}

/** Hover the card, then press the pill that appears on it. */
async function openNode(page: Page, id: string): Promise<void> {
  const at = await page.evaluate((nodeId) => {
    const r = document.querySelector(`[data-node-id="${nodeId}"]`)!.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, id);
  await page.mouse.move(at.x, at.y);
  await page.locator(".focus-canvas__pill").click();
}

/**
 * A point on the edge's line where the line is what the pointer hits, or null
 * when every sampled point is covered by a card or by another edge.
 */
const clickPoint = (page: Page, from: string, to: string): Promise<{ x: number; y: number } | null> =>
  page.evaluate(
    ([a, b]) => {
      const g = document.querySelector(`.krs-edge[data-edge-from="${a}"][data-edge-to="${b}"]`)!;
      const line = g.querySelector<SVGGeometryElement>(".krs-edge__hitline, path, line")!;
      const length = line.getTotalLength();
      const m = line.getScreenCTM()!;
      // From the middle outward, every 2% of the line.
      for (let i = 0; i <= 49; i++) {
        for (const t of [0.5 + i / 100, 0.5 - i / 100]) {
          const p = line.getPointAtLength(length * t);
          const x = p.x * m.a + p.y * m.c + m.e;
          const y = p.x * m.b + p.y * m.d + m.f;
          if (document.elementFromPoint(x, y)?.closest(".krs-edge") === g) return { x, y };
        }
      }
      return null;
    },
    [from, to],
  );

/** Click the edge's line, as a reader would. */
async function openEdge(page: Page, from: string, to: string): Promise<void> {
  const at = await clickPoint(page, from, to);
  if (!at) throw new Error(`no clickable point on ${from} -> ${to}`);
  await page.mouse.click(at.x, at.y);
}

/** Open the edge's focus canvas without going through the pointer, for measuring. */
const openEdgeDirect = (page: Page, from: string, to: string): Promise<void> =>
  page.evaluate(
    ([a, b]) => {
      const g = document.querySelector(`.krs-edge[data-edge-from="${a}"][data-edge-to="${b}"]`)!;
      const target = g.querySelector(":scope > :not(title)") ?? g;
      for (const type of ["mousedown", "click"]) {
        target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: 1, clientY: 1 }));
      }
    },
    [from, to],
  );

const close = (page: Page) => page.locator(".focus-canvas__close").click();

const drawnSvg = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const svg = document.querySelector(".focus-canvas__svg")!.cloneNode(true) as SVGSVGElement;
    svg.removeAttribute("style");
    return svg.outerHTML;
  });

/** What is on the open focus canvas, and whether anything on it collides. */
const measure = (page: Page): Promise<FocusMeasure> =>
  page.evaluate(() => {
    const svg = document.querySelector(".focus-canvas__svg")!;
    const overlap = (a: DOMRect, b: DOMRect) =>
      a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    const cards = [...svg.querySelectorAll(".focus-canvas__card")].map((c) => c.getBoundingClientRect());
    const lanes = [...svg.querySelectorAll(".focus-canvas__lane")];
    const labels = lanes.map((l) => l.querySelector("text")!.getBoundingClientRect());
    const drawn = (r: DOMRect) => r.width > 0;
    let labelCard = 0;
    let labelLabel = 0;
    let lineLabel = 0;
    let lineCard = 0;
    labels.forEach((label, i) => {
      if (!drawn(label)) return;
      labelCard += cards.filter((c) => overlap(label, c)).length;
      labelLabel += labels.filter((other, j) => j > i && drawn(other) && overlap(label, other)).length;
    });
    for (const lane of lanes) {
      const path = lane.querySelector("path")!;
      const m = path.getScreenCTM()!;
      const length = path.getTotalLength();
      const points: { x: number; y: number }[] = [];
      for (let s = 0; s <= length; s += 3) {
        const p = path.getPointAtLength(s);
        points.push({ x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f });
      }
      // A line ends on a card's border, so "inside" starts 2px in.
      const inside = (r: DOMRect, pad: number) =>
        points.some((p) => p.x > r.left + pad && p.x < r.right - pad && p.y > r.top + pad && p.y < r.bottom - pad);
      lineLabel += labels.filter((l) => drawn(l) && inside(l, 0)).length;
      lineCard += cards.filter((c) => inside(c, 2)).length;
    }
    return {
      width: Number(svg.getAttribute("width")),
      height: Number(svg.getAttribute("height")),
      lanes: lanes.length,
      cards: cards.length,
      linesMax: Math.max(0, ...lanes.map((l) => l.querySelectorAll("tspan").length)),
      labelCard,
      labelLabel,
      lineLabel,
      lineCard,
    };
  });

export async function captureFocus(
  h: Harness,
  graph: { nodes: string[]; edges: { from: string; to: string }[] },
  pick: { edge: [string, string]; node: string },
): Promise<FocusCapture> {
  const degree = (id: string, side: "from" | "to") => graph.edges.filter((e) => e[side] === id).length;
  const directed = new Set(graph.edges.map((e) => `${e.from}->${e.to}`));
  const both = graph.edges.find((e) => directed.has(`${e.to}->${e.from}`));
  if (!both) throw new Error("the diagram has no pair with edges in both directions");
  const mutual: [string, string] = [both.from, both.to];
  const busiest = [...graph.nodes].sort(
    (a, b) => degree(b, "from") + degree(b, "to") - degree(a, "from") - degree(a, "to"),
  )[0];

  const browser = await chromium.launch();
  try {
    // ── As the reader meets it: a wide preview, then a split one ─────────────
    const wide = await openPage(browser, h, { width: 1720, height: 1000 });
    const at = await wide.evaluate((id) => {
      const r = document.querySelector(`[data-node-id="${id}"]`)!.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, pick.node);
    await wide.mouse.move(at.x, at.y);
    await wide.waitForTimeout(400); // the dim eases over 150ms
    const pill = await wide.screenshot();
    await wide.locator(".focus-canvas__pill").click();
    const columnsShot = await wide.screenshot();
    await close(wide);
    await openEdge(wide, ...pick.edge);
    const edgeShot = await wide.screenshot();
    await wide.close();

    const split = await openPage(browser, h, { width: 1100, height: 950 });
    await openNode(split, pick.node);
    const spineShot = await split.screenshot();
    await split.close();

    // ── Every node in both layouts, every pair ───────────────────────────────
    const byLayout = async (layout: "columns" | "spine") => {
      const page = await openPage(browser, h, { width: 1720, height: 1000 }, layout);
      const measured = new Map<string, FocusMeasure>();
      const drawn = new Map<string, string>();
      for (const id of graph.nodes) {
        await openNode(page, id);
        measured.set(id, await measure(page));
        if (id === pick.node || id === busiest) drawn.set(id, await drawnSvg(page));
        await close(page);
      }
      return { page, measured, drawn };
    };
    const columns = await byLayout("columns");
    const spine = await byLayout("spine");
    await spine.page.close();

    const pairs: FocusMeasure[] = [];
    const seen = new Set<string>();
    let edgeSvg = "";
    let mutualSvg = "";
    for (const e of graph.edges) {
      const key = [e.from, e.to].sort().join("↔");
      if (seen.has(key)) continue;
      seen.add(key);
      await openEdgeDirect(columns.page, e.from, e.to);
      pairs.push(await measure(columns.page));
      await close(columns.page);
    }
    const unclickable: string[] = [];
    for (const e of graph.edges) {
      if (!(await clickPoint(columns.page, e.from, e.to))) unclickable.push(`${e.from} \u2192 ${e.to}`);
    }
    await openEdgeDirect(columns.page, ...pick.edge);
    edgeSvg = await drawnSvg(columns.page);
    await close(columns.page);
    await openEdgeDirect(columns.page, ...mutual);
    mutualSvg = await drawnSvg(columns.page);
    await columns.page.close();

    return {
      shots: { pill, edge: edgeShot, columns: columnsShot, spine: spineShot },
      canvases: {
        edge: edgeSvg,
        mutual: mutualSvg,
        columns: columns.drawn.get(pick.node)!,
        spine: spine.drawn.get(pick.node)!,
        busiest: columns.drawn.get(busiest)!,
      },
      nodes: graph.nodes.map((id) => ({
        id,
        in: degree(id, "to"),
        out: degree(id, "from"),
        columns: columns.measured.get(id)!,
        spine: spine.measured.get(id)!,
      })),
      pairs,
      unclickable,
      mutual,
      busiest,
    };
  } finally {
    await browser.close();
  }
}
