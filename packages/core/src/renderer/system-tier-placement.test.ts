/**
 * Placement invariants of the system view's kind tiers (`systemTier`,
 * #823 / ADR-1724), enumerated from the kind registry rather than sampled:
 *
 * - a model that leaves some tiers empty gets no phantom row and no extra
 *   height for them (TPL-1736 item 3), over every non-empty subset of tiers
 * - an infra kind stays inside the system, under the services, whatever its
 *   tags or `column` hint say (TPL-1761 item 7, ADR-1724's boundary rule)
 *
 * The tiers and the infra kinds are read from `REFERENCE_DATA.nodeKinds`, so a
 * new tier or a new infra kind is measured without editing this file. Both
 * pipelines are measured: one system's own canvas (`layout.ts`) and the
 * multi-system root (`layout-multi-system.ts`).
 */
import { describe, expect, it } from "vitest";
import { REFERENCE_DATA } from "../builtins/reference-data.js";
import { SYSTEM_TIER_COUNT, systemTier } from "./layer-assignment.js";
import { layoutView } from "./fixtures/layout-corpus.js";
import type { KrsNode } from "../types/ast.js";
import type { ResolvedLayoutHints } from "../types/style.js";
import type { LayoutNode, LayoutResult } from "./layout-types.js";

const TOLERANCE = 0.5;
const SYSTEM_KINDS: readonly string[] = REFERENCE_DATA.nodeKinds.find(
  (k) => k.kind === "system",
)!.canContain;
const TAG_VARIANTS: string[][] = [[], ["external"]];

interface Representative {
  kind: string;
  tags: string[];
}

/** One `kind [tags]` per tier, in tier order, from every kind a system may hold. */
function tierRepresentatives(): Representative[] {
  const byTier = new Map<number, Representative>();
  for (const kind of SYSTEM_KINDS) {
    for (const tags of TAG_VARIANTS) {
      const tier = systemTier({ kind, tags } as unknown as KrsNode);
      if (!byTier.has(tier)) byTier.set(tier, { kind, tags });
    }
  }
  return [...byTier.entries()].sort((a, b) => a[0] - b[0]).map(([, rep]) => rep);
}

const declare = (rep: Representative, id: string) =>
  `  ${rep.kind} ${id}${rep.tags.map((t) => ` [${t}]`).join("")} { label "Card" }`;

/** The cards of system `S`, wherever the pipeline keyed them. */
const cardsOfS = (res: LayoutResult): LayoutNode[] =>
  [...res.nodes.values()].filter((n) => !n.ghost && n.path?.[0] === "S");

/** The vertical room system `S` takes: its frame, or the canvas when it is drawn frameless. */
function heightOfS(res: LayoutResult): number {
  const frame = res.containers.find((c) => c.id === "S" && !c.group && !c.ghost);
  return frame ? frame.height : res.height;
}

const PIPELINES = [
  { name: "single system", multi: false },
  { name: "multi-system root", multi: true },
];

describe("empty tiers leave no phantom row (TPL-1736 item 3)", () => {
  const reps = tierRepresentatives();
  // Every non-empty subset of tiers, with and without a call chain through them:
  // the chain is what engages the pull-up / pull-down passes (#974, #967) that
  // a floor or clamp for an empty tier could disturb.
  const subsets = Array.from({ length: (1 << reps.length) - 1 }, (_s, i) =>
    reps.filter((_r, t) => (i + 1) & (1 << t)),
  );

  function model(present: Representative[], chained: boolean, multi: boolean): string {
    const ids = present.map((_r, i) => `T${i}`);
    const lines = present.map((rep, i) => declare(rep, ids[i]));
    if (chained) for (let i = 1; i < ids.length; i++) lines.push(`  ${ids[i - 1]} -> ${ids[i]}`);
    const own = `system S {\n${lines.join("\n")}\n}\n`;
    return multi ? `${own}system Other {\n  service O {}\n}\n` : own;
  }

  /** Rows (distinct tops), the gaps between them, and the height beyond the content. */
  function measure(res: LayoutResult) {
    const cards = cardsOfS(res);
    const rows = [...new Set(cards.map((n) => Math.round(n.y)))].sort((a, b) => a - b);
    const bottomOf = (y: number) =>
      Math.max(...cards.filter((n) => Math.round(n.y) === y).map((n) => n.y + n.height));
    const gaps = rows.slice(1).map((y, i) => y - bottomOf(rows[i]));
    const span = bottomOf(rows[rows.length - 1]) - rows[0];
    return { rows: rows.length, gaps, slack: heightOfS(res) - span };
  }

  it("enumerates every tier systemTier can return", () => {
    // The kinds a system may hold, with and without `[external]`, have to reach
    // every tier the layering allocates; a tier no kind reaches would never be
    // in a subset below.
    expect(reps.length).toBe(SYSTEM_TIER_COUNT);
  });

  describe.each(PIPELINES)("$name", ({ multi }) => {
    // The full model fixes the reference: its gap between rows and its room
    // beyond the content are what every subset must reproduce.
    const full = measure(layoutView(model(reps, false, multi)));

    it.each(
      subsets.flatMap((present) =>
        [false, true].map((chained) => ({
          name: `${present.map((r) => `${r.kind}${r.tags.map((t) => `[${t}]`).join("")}`).join(" + ")}${chained ? ", chained" : ""}`,
          present,
          chained,
        })),
      ),
    )("$name", ({ present, chained }) => {
      const m = measure(layoutView(model(present, chained, multi)));
      expect(m.rows).toBe(present.length);
      for (const gap of m.gaps) expect(gap).toBeCloseTo(full.gaps[0], 3);
      expect(m.slack).toBeCloseTo(full.slack, 3);
    });
  });
});

describe("infra stays inside the system, under the services (TPL-1761 item 7)", () => {
  // The infra kinds by the registry's own classification, not by the
  // `INFRA_KIND_SET` the placement reads: a new infra kind that the tier
  // assignment does not know about is exactly the case to catch.
  const infraKinds = REFERENCE_DATA.nodeKinds
    .filter((k) => k.layer === "infra-block" && SYSTEM_KINDS.includes(k.kind))
    .map((k) => k.kind);

  it("finds the infra kinds in the registry", () => {
    expect(infraKinds.length).toBeGreaterThan(0);
  });

  const cases = infraKinds.flatMap((kind) =>
    TAG_VARIANTS.flatMap((tags) =>
      [undefined, "left", "right"].flatMap((column) =>
        PIPELINES.map(({ name, multi }) => ({
          name: `${kind}${tags.map((t) => ` [${t}]`).join("")}${column ? `, column: ${column}` : ""}, ${name}`,
          kind,
          tags,
          column: column as "left" | "right" | undefined,
          multi,
        })),
      ),
    ),
  );

  it.each(cases)("$name", ({ kind, tags, column, multi }) => {
    // Two hubs consuming a genuine external engage the side columns (#1728),
    // so the infra card is measured on a canvas where siding does happen.
    const own = `system S {
  service HubLeft {}
  service HubRight {}
  service Vendor [external] {}
${declare({ kind, tags }, "Store")}
  HubLeft -> Vendor
  HubRight -> Vendor
  HubLeft -> Store
  HubRight -> Store
}
`;
    const src = multi ? `${own}system Other {\n  service O {}\n}\n` : own;
    const hints = new Map<string, ResolvedLayoutHints>(column ? [["Store", { column }]] : []);
    const cards = new Map(
      cardsOfS(layoutView(src, [], { layoutHints: hints })).map((n) => [n.id, n]),
    );
    const hubs = [cards.get("HubLeft")!, cards.get("HubRight")!];
    const left = Math.min(...hubs.map((h) => h.x));
    const right = Math.max(...hubs.map((h) => h.x + h.width));
    const below = Math.max(...hubs.map((h) => h.y + h.height));
    const sidedOut = (n: LayoutNode) =>
      n.x + n.width <= left + TOLERANCE || n.x >= right - TOLERANCE;

    // Non-vacuity: the genuine external did go to a side column.
    expect(sidedOut(cards.get("Vendor")!)).toBe(true);
    const store = cards.get("Store")!;
    expect(sidedOut(store)).toBe(false);
    expect(store.y).toBeGreaterThanOrEqual(below - TOLERANCE);
  });
});
