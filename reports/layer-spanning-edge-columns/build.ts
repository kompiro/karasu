/* eslint-disable no-console -- report generator */
// Spike for #2611 (slice D of #2598): before = origin/main's core, after = this
// branch's core. Renders three dify views both ways and tabulates the routing
// metrics over the whole corpus. Run from the spike worktree root:
//   pnpm exec tsx reports/layer-spanning-edge-columns/build.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { escapeHtml, pair, reportFragment, reportPage } from "../../scripts/report/index.ts";

const MAIN = "/workspaces/karasu/packages/core/src";
const SPIKE = new URL("../../packages/core/src", import.meta.url).pathname.replace(/\/$/, "");
const DIFY = "/workspaces/dify/index.krs";
const OUT = "reports/layer-spanning-edge-columns";

async function load(root: string) {
  const { compile } = await import(`${root}/index.ts`);
  const { layout } = await import(`${root}/renderer/layout.ts`);
  await import(`${root}/renderer/shapes.ts`);
  const { resolveStyles } = await import(`${root}/resolver/style-resolver.ts`);
  const { getBuiltinStyleSheet } = await import(`${root}/builtins/default-style.ts`);
  const { extractView } = await import(`${root}/view/view-extract.ts`);
  const { Parser } = await import(`${root}/parser/parser.ts`);
  const { countPolylinePenetrations } = await import(`${root}/renderer/edge-geometry.ts`);
  const run = (src: string, path: string[]) => {
    const krsFile = Parser.parse(src).value;
    const styles = resolveStyles(krsFile.systems, [getBuiltinStyleSheet()]);
    return layout(extractView(krsFile.systems, path), {
      ownerIndex: krsFile.ownerIndex,
      boundaryMembership: krsFile.boundaryMembership,
      shapeForNode: (id: string) => {
        const s = styles.nodes.get(id) ?? styles.defaultNodeStyle;
        return typeof s.shape === "string" ? s.shape : s.shape.url;
      },
      chipZoneFor: (n: any) => ({ x: n.x + n.width - 72, y: n.y, width: 72, height: 24 }),
    });
  };
  const svg = (src: string, path: string[]) => {
    const r = compile(src, { diagramType: "system", viewPath: path });
    return r.svg as string;
  };
  const paths = (src: string): string[][] => {
    const krsFile = Parser.parse(src).value;
    const out: string[][] = [[]];
    const walk = (node: any, prefix: string[]) => {
      for (const c of node.children ?? []) {
        if ((c.kind === "service" || c.kind === "domain") && (c.children?.length ?? 0) > 0) {
          out.push([...prefix, c.id]);
          walk(c, [...prefix, c.id]);
        }
      }
    };
    for (const sys of krsFile.systems) walk(sys, [sys.id]);
    return out;
  };
  return { run, svg, paths, countPolylinePenetrations };
}

type P = { x: number; y: number };
const pointsOf = (e: any): P[] => [e.fromPoint, ...(e.waypoints ?? []), e.toPoint];
function overlaps(res: any, axis: "v" | "h"): number {
  const segs: any[] = [];
  res.edges.forEach((e: any, idx: number) => {
    if (e.ghost || e.cyclic) return;
    const pts = pointsOf(e);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const flat = axis === "v" ? Math.abs(a.x - b.x) : Math.abs(a.y - b.y);
      const long = axis === "v" ? Math.abs(a.y - b.y) : Math.abs(a.x - b.x);
      if (flat > 1e-6 || long <= 1e-6) continue;
      segs.push({ edge: idx, fixed: axis === "v" ? a.x : a.y, a0: axis === "v" ? Math.min(a.y, b.y) : Math.min(a.x, b.x), a1: axis === "v" ? Math.max(a.y, b.y) : Math.max(a.x, b.x) });
    }
  });
  let n = 0;
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const a = segs[i], b = segs[j];
    if (a.edge === b.edge || Math.abs(a.fixed - b.fixed) > 1e-6) continue;
    if (Math.min(a.a1, b.a1) - Math.max(a.a0, b.a0) > 1e-6) n++;
  }
  return n;
}
function penetrations(res: any, count: any): number {
  const nodes = [...res.nodes.values()];
  let t = 0;
  for (const e of res.edges) {
    if (e.ghost || e.cyclic) continue;
    if (!res.nodes.get(e.from) || !res.nodes.get(e.to)) continue;
    t += count(pointsOf(e), nodes.filter((n: any) => n.id !== e.from && n.id !== e.to));
  }
  return t;
}
function crossings(res: any): number {
  const segs: [P, P][] = [];
  for (const e of res.edges) { const pts = pointsOf(e); for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i], pts[i + 1]]); }
  const cross = (o: P, a: P, b: P) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const x = (p1: P, p2: P, p3: P, p4: P) => { const d1 = cross(p3, p4, p1), d2 = cross(p3, p4, p2), d3 = cross(p1, p2, p3), d4 = cross(p1, p2, p4); return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)); };
  let n = 0;
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) if (x(segs[i][0], segs[i][1], segs[j][0], segs[j][1])) n++;
  return n;
}
function classify(res: any) {
  const nodes = [...res.nodes.values()].filter((n: any) => !n.ghost);
  const minLeft = Math.min(...nodes.map((n: any) => n.x)), maxRight = Math.max(...nodes.map((n: any) => n.x + n.width));
  let straight = 0, interior = 0, gutter = 0, length = 0;
  for (const e of res.edges) {
    if (e.ghost || e.cyclic) continue;
    const pts = pointsOf(e);
    for (let i = 0; i < pts.length - 1; i++) length += Math.abs(pts[i + 1].x - pts[i].x) + Math.abs(pts[i + 1].y - pts[i].y);
    const wps = e.waypoints ?? [];
    const k = wps.findIndex((w: any, i: number) => i + 1 < wps.length && w.x === wps[i + 1].x);
    if (k === -1) straight++; else if (wps[k].x > maxRight || wps[k].x < minLeft) gutter++; else interior++;
  }
  return { straight, interior, gutter, length };
}

async function main() {
  const main = await load(MAIN);
  const spike = await load(SPIKE);
  const src = readFileSync(DIFY, "utf8");
  const keys = ["edges", "gutter", "interior", "straight", "h", "v", "pen", "cross", "length", "area"] as const;
  type Row = Record<(typeof keys)[number], number>;
  const zero = (): Row => Object.fromEntries(keys.map((k) => [k, 0])) as Row;
  const tot = { before: zero(), after: zero() };
  const perView: string[] = [];
  const measure = (res: any, count: any): Row => {
    const c = classify(res);
    return { edges: res.edges.filter((e: any) => !e.ghost && !e.cyclic).length, gutter: c.gutter, interior: c.interior, straight: c.straight, h: overlaps(res, "h"), v: overlaps(res, "v"), pen: penetrations(res, count), cross: crossings(res), length: c.length, area: res.width * res.height };
  };
  for (const path of main.paths(src)) {
    let a: any, b: any;
    try { a = main.run(src, path); b = spike.run(src, path); } catch { continue; }
    const ma = measure(a, main.countPolylinePenetrations), mb = measure(b, spike.countPolylinePenetrations);
    if (ma.edges === 0) continue;
    for (const k of keys) { tot.before[k] += ma[k]; tot.after[k] += mb[k]; }
    perView.push(`<tr><td>${escapeHtml(path.join("/") || "root")}</td><td>${ma.edges}</td><td>${ma.gutter} → <b>${mb.gutter}</b></td><td>${ma.interior} → <b>${mb.interior}</b></td><td>${ma.cross} → ${mb.cross}</td><td>${ma.h}/${ma.v} → ${mb.h}/${mb.v}</td><td>${ma.pen} → ${mb.pen}</td><td>${(ma.area / 1e6).toFixed(2)} → ${(mb.area / 1e6).toFixed(2)}</td><td>${a.placementPasses} → ${b.placementPasses}</td></tr>`);
  }
  const pct = (a: number, b: number) => `${(((b - a) / a) * 100).toFixed(1)}%`;
  const t = tot;
  const totals = `<table><thead><tr><th>metric (dify, ${perView.length} views, ${t.before.edges} edges)</th><th>main</th><th>spike</th><th>Δ</th></tr></thead><tbody>
<tr><td>edges routed through an outer gutter</td><td>${t.before.gutter}</td><td><b>${t.after.gutter}</b></td><td>${pct(t.before.gutter, t.after.gutter)}</td></tr>
<tr><td>edges routed through an interior corridor</td><td>${t.before.interior}</td><td><b>${t.after.interior}</b></td><td>${pct(t.before.interior, t.after.interior)}</td></tr>
<tr><td>edges left straight</td><td>${t.before.straight}</td><td>${t.after.straight}</td><td></td></tr>
<tr><td>segment crossings</td><td>${t.before.cross}</td><td><b>${t.after.cross}</b></td><td>${pct(t.before.cross, t.after.cross)}</td></tr>
<tr><td>collinear pairs h / v</td><td>${t.before.h} / ${t.before.v}</td><td>${t.after.h} / ${t.after.v}</td><td></td></tr>
<tr><td>card penetrations</td><td>${t.before.pen}</td><td>${t.after.pen}</td><td></td></tr>
<tr><td>total route length</td><td>${(t.before.length / 1e3).toFixed(0)}k px</td><td><b>${(t.after.length / 1e3).toFixed(0)}k px</b></td><td>${pct(t.before.length, t.after.length)}</td></tr>
<tr><td>total canvas area</td><td>${(t.before.area / 1e6).toFixed(1)} Mpx</td><td><b>${(t.after.area / 1e6).toFixed(1)} Mpx</b></td><td>${pct(t.before.area, t.after.area)}</td></tr>
</tbody></table>`;
  const table = `<table><thead><tr><th>view</th><th>edges</th><th>gutter</th><th>interior</th><th>crossings</th><th>collinear h/v</th><th>penetrations</th><th>area (Mpx)</th><th>passes</th></tr></thead><tbody>${perView.join("")}</tbody></table>`;

  const views: [string, string[]][] = [
    ["Dify/ApiBackend/Workflow", ["Dify", "ApiBackend", "Workflow"]],
    ["Dify/ApiBackend/Snippet", ["Dify", "ApiBackend", "Snippet"]],
    ["Dify/ApiBackend/Knowledge", ["Dify", "ApiBackend", "Knowledge"]],
    ["root", []],
  ];
  const sections: { title: string; body: string }[] = [
    { title: "Whole corpus", body: totals },
    { title: "Per view", body: `<div style="overflow-x:auto">${table}</div>` },
  ];
  for (const [title, path] of views) {
    sections.push({
      title,
      body: pair(
        { label: "main (before)", svg: main.svg(src, path), background: "light" },
        { label: "spike (after)", svg: spike.svg(src, path), background: "light" },
        "Same model and view; the spike routes long edges through the gaps of the rows between their endpoints (a staircase) and reserves a column where none is free.",
      ),
    });
  }
  const options = {
    title: "Layer-spanning edge columns — spike",
    meta: ["spike/layer-spanning-edge-columns", "Issue #2611 (slice D of #2598)", "design PR #2739"],
    sections,
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/index.html`, reportPage(options));
  writeFileSync(`${OUT}/artifact.html`, reportFragment(options));
  console.log(`wrote ${OUT}/index.html and artifact.html`);
}
main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
