/**
 * Collapse-all over **every view of every example** (TPL-1738, TPL-1886).
 *
 * Folding members into a stub rewrites endpoint ids, and anything keyed by the
 * old ids (a parallel edge list, a decoration map) has to go through the same
 * remap or it silently misses. Each time this went wrong (#1874 ghost edges,
 * #1886 diff state) the fix was fenced on the one list or map that broke, and
 * the next list started out unfenced; the category axis never re-keyed diff
 * state at all until this file found it.
 *
 * So `render` is wrapped: every canvas the all-views bundle draws, for every
 * example and every Group-by mode, is drawn again with **every group and every
 * category collapsed** (the groups are read off the canvas's own frames; the
 * categories from a `Record` over `CategoryId`), under synthetic diff maps that
 * name every edge the view slice holds. A new view, mode, edge list or collapse
 * path is covered the day the corpus reaches it (ADR-3038 D4).
 *
 * - **Endpoints** (TPL-1738): every laid-out edge, ghost ones included, ends on
 *   a card or a container of the canvas. An edge whose endpoint was folded but
 *   not remapped still names the member, which is neither.
 * - **Decoration** (TPL-1886): the drawn `data-diff-state` is read back from
 *   the SVG, so the render path's own lookup is what is tested. With every edge
 *   `added`, every drawn edge says `added`, folded or not (the key of a stub
 *   edge matches the map's key, and a single state carries through a fold);
 *   with every edge `unchanged`, none is decorated; with nothing collapsed,
 *   every edge says `added`.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { LayoutResult } from "./layout-types.js";
import type { ViewSlice } from "../view/view-slice.js";
import { edgeKey } from "../view/edge-key.js";
import { CATEGORY_STUB_TAG, type CategoryId } from "./category-collapse.js";
import { GROUP_STUB_TAG } from "./group-collapse.js";
import {
  GROUP_BY_MODES,
  loadExampleCorpus,
  renderEveryView,
  type GroupByMode,
} from "./fixtures/example-corpus.js";

/** Every collapsible category. A `Record`, so a new category must be listed to typecheck. */
const CATEGORIES: Record<CategoryId, true> = { external: true, infra: true };

let lastLayout: LayoutResult | undefined;
vi.mock("./layout.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./layout.js")>();
  return {
    ...mod,
    layout: (...args: Parameters<typeof mod.layout>) => (lastLayout = mod.layout(...args)),
  };
});

interface Redraw {
  where: string;
  mode: GroupByMode;
  slice: ViewSlice;
  /** Every group collapsed, every edge `added`. */
  folded: { layout: LayoutResult; svg: string };
  /** Every group collapsed, every edge `unchanged`. */
  foldedUnchanged: string;
  /** Nothing collapsed, every edge `added`. */
  unfolded: { layout: LayoutResult; svg: string };
}

const redraws: Redraw[] = [];
let where = "";
let mode: GroupByMode = "none";

/**
 * Every edge reachable from the slice, whatever list holds it: the slice's
 * fields are walked rather than named, so an edge list added to `ViewSlice`
 * later is in the synthetic diff without anyone remembering to add it here.
 */
function edgesOf(slice: ViewSlice): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  const seen = new Set<unknown>();
  const visit = (value: unknown, depth: number): void => {
    if (depth > 3 || value === null || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (value instanceof Map) {
      for (const v of value.values()) visit(v, depth + 1);
      return;
    }
    const rec = value as Record<string, unknown>;
    if (typeof rec.from === "string" && typeof rec.to === "string") {
      out.push({ from: rec.from, to: rec.to });
      return;
    }
    for (const v of Object.values(rec)) visit(v, depth + 1);
  };
  visit(slice, 0);
  return out;
}

vi.mock("./svg-renderer.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./svg-renderer.js")>();
  const render: typeof mod.render = (slice, styles, deploy, owners, display, links, options) => {
    const svg = mod.render(slice, styles, deploy, owners, display, links, options);
    const groups = new Set(
      (lastLayout?.containers ?? []).flatMap((c) => (c.group && c.groupId ? [c.groupId] : [])),
    );
    const keys = edgesOf(slice).map(edgeKey);
    const all = (state: string) => new Map(keys.map((k) => [k, state]));
    const collapse = {
      collapsedGroups: groups,
      collapsedCategories: new Set(Object.keys(CATEGORIES) as CategoryId[]),
    };
    const draw = (extra: Record<string, unknown>) =>
      mod.render(slice, styles, deploy, owners, display, links, { ...options, ...extra });
    const foldedSvg = draw({ ...collapse, edgeDiffState: all("added") });
    const foldedLayout = lastLayout!;
    redraws.push({
      where: `${where} [${mode}] ${slice.containerNode?.id ?? "(root)"}`,
      mode,
      slice,
      folded: { layout: foldedLayout, svg: foldedSvg },
      foldedUnchanged: draw({ ...collapse, edgeDiffState: all("unchanged") }),
      unfolded: { svg: draw({ edgeDiffState: all("added") }), layout: lastLayout! },
    });
    return svg;
  };
  return { ...mod, render };
});

beforeAll(async () => {
  for (const entry of await loadExampleCorpus()) {
    for (const m of GROUP_BY_MODES) {
      where = entry.name;
      mode = m;
      renderEveryView(entry, m);
    }
  }
}, 120_000);

/** The `data-diff-state` of each drawn edge (`null` when it carries none). */
function edgeStates(svg: string): (string | null)[] {
  return [...svg.matchAll(/<g [^>]*data-edge-from="[^>]*>/g)].map(
    ([tag]) => /data-diff-state="([^"]*)"/.exec(tag)?.[1] ?? null,
  );
}

/** Ids an edge endpoint may name on a canvas: its cards and its containers. */
function endpointIds(res: LayoutResult, slice: ViewSlice): Set<string> {
  const ids = new Set<string>(res.containers.map((c) => c.id));
  if (slice.containerNode) ids.add(slice.containerNode.id);
  for (const [key, n] of res.nodes) {
    ids.add(key).add(n.id);
    // The multi-system root names a card in another system by its dotted path.
    if (n.path) ids.add(n.path.join("."));
  }
  return ids;
}

const stubsTagged = (res: LayoutResult, tag: string) =>
  [...res.nodes.values()].filter((n) => n.tags?.includes(tag));

describe("collapse-all over every view of every example", () => {
  it("folds groups in every Group-by mode and categories, with ghost edges on the folded canvases", () => {
    const folds = (pred: (r: Redraw) => boolean) => redraws.some(pred);
    // No example extracts a ghost edge whose endpoint is a group or category
    // member today (#1874 had to graft one), so the ghost remap itself is held
    // by `layout.test.ts`. What this corpus holds is that any list, ghost or
    // new, that does carry a member endpoint on a real view is remapped.
    expect({
      ...Object.fromEntries(
        GROUP_BY_MODES.filter((m) => m !== "none").map((m) => [
          m,
          folds((r) => r.mode === m && stubsTagged(r.folded.layout, GROUP_STUB_TAG).length > 0),
        ]),
      ),
      category: folds((r) => stubsTagged(r.folded.layout, CATEGORY_STUB_TAG).length > 0),
      ghost: folds((r) => r.folded.layout.edges.some((e) => e.ghost)),
    }).toEqual({ team: true, boundary: true, category: true, ghost: true });
  });

  it("every edge, ghost ones included, ends on a card or a container (TPL-1738)", () => {
    const dangling: string[] = [];
    for (const { where: at, slice, folded } of redraws) {
      const ids = endpointIds(folded.layout, slice);
      for (const e of folded.layout.edges) {
        for (const end of [e.from, e.to]) {
          if (!ids.has(end)) dangling.push(`${at}: ${e.ghost ? "ghost " : ""}${e.from}->${e.to}`);
        }
      }
    }
    expect(dangling).toEqual([]);
  });

  // A list that skips the remap can also lose the edge instead of mis-anchoring
  // it: the cross-system lists drop an endpoint they cannot find. So each edge
  // the unfolded canvas drew with one endpoint folded must reappear between the
  // surviving endpoint and a stub, on the same side and with the same ghost
  // flag. (Both endpoints folded may land in one stub and vanish by design.)
  it("an edge with one folded endpoint survives as an edge to a stub (TPL-1738)", () => {
    const lost: string[] = [];
    for (const { where: at, slice, folded, unfolded } of redraws) {
      const kept = endpointIds(folded.layout, slice);
      const stubs = new Set(
        [GROUP_STUB_TAG, CATEGORY_STUB_TAG].flatMap((t) =>
          stubsTagged(folded.layout, t).map((n) => n.id),
        ),
      );
      const reached = (e: { from: string; to: string; ghost?: boolean }, fromFolded: boolean) =>
        folded.layout.edges.some(
          (f) =>
            !!f.ghost === !!e.ghost &&
            (fromFolded
              ? stubs.has(f.from) && f.to === e.to
              : f.from === e.from && stubs.has(f.to)),
        );
      for (const e of unfolded.layout.edges) {
        const fromFolded = !kept.has(e.from);
        if (fromFolded === !kept.has(e.to)) continue;
        if (!reached(e, fromFolded))
          lost.push(`${at}: ${e.ghost ? "ghost " : ""}${e.from}->${e.to}`);
      }
    }
    expect(lost).toEqual([]);
  });

  it("every drawn edge keeps its diff state through the fold (TPL-1886)", () => {
    const wrong: string[] = [];
    for (const r of redraws) {
      const check = (svg: string, label: string, ok: (s: string | null) => boolean) =>
        edgeStates(svg).forEach((s, i) => {
          if (!ok(s)) wrong.push(`${r.where} ${label} edge #${i}: ${s}`);
        });
      check(r.folded.svg, "all added, folded", (s) => s === "added");
      check(r.foldedUnchanged, "all unchanged, folded", (s) => s === null || s === "unchanged");
      check(r.unfolded.svg, "all added, nothing folded", (s) => s === "added");
    }
    expect(wrong).toEqual([]);
  });
});
