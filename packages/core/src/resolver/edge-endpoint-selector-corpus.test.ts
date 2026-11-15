/**
 * Edge endpoint selectors over **every view of every example** (TPL-1755).
 *
 * `edge[from=<id>]` / `edge[to=<id>]` compare against the endpoint ids a view
 * stores on its edges: bare for an ordinary edge, dot-notation for a
 * synthesized usecase -> resource edge or a qualified cross-system reference.
 * If a view stores another form (a `/`-joined path, an internal key), a rule
 * the author writes in the spelling of their model stops matching, and the
 * edge silently keeps its default style.
 *
 * Each example is rendered through the all-views bundle, and every drawn edge
 * is read back off the SVG (`data-edge-from` / `data-edge-to`).
 *
 * - **Spelling:** every drawn endpoint is one the author can write: a node id,
 *   or a dot-joined tail of a node's path (`OrderDB.OrderTable`,
 *   `PaymentGateway.PaymentService`). The set is derived from the node tree,
 *   not from the edges, so a view that stores another form fails.
 * - **Round trip:** the example is rendered again with a sheet holding one
 *   `edge[from=<from>][to=<to>]` rule per drawn pair, each with its own
 *   colour, and every drawn edge must be stroked with its pair's colour. A
 *   renderer that looks a style up by a different id form than the resolver
 *   matched on fails.
 *
 * The probe rules carry two endpoint predicates, so they outrank every tag
 * rule; an example that colours one edge with a more specific rule of its own
 * (`edge#<id>`) would win over the probe and has to be excused here by name.
 *
 * A new example, view or derived edge list joins the day the corpus reaches it
 * (ADR-3038 D4), and the test checks that the corpus draws the dot-notation
 * form the item is about.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { StyleParser } from "../parser/style-parser.js";
import {
  GROUP_BY_MODES,
  loadExampleCorpus,
  renderEveryView,
  type ExampleEntry,
} from "../renderer/fixtures/example-corpus.js";
import type { KrsFile, KrsNode } from "../types/ast.js";

interface DrawnEdge {
  from: string;
  to: string;
  stroke: string | undefined;
}

const unescapeXml = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/**
 * Every drawn edge group: its endpoints and its visible stroke (the first
 * stroke in the group that is not the transparent hit area).
 */
function drawnEdges(svg: string): DrawnEdge[] {
  const opens = [...svg.matchAll(/<g\b([^>]*\bdata-edge-from="[^"]*"[^>]*)>/g)];
  return opens.map((m, i) => {
    const attrs = m[1];
    const from = /\bdata-edge-from="([^"]*)"/.exec(attrs)![1];
    const to = /\bdata-edge-to="([^"]*)"/.exec(attrs)?.[1] ?? "";
    const end = i + 1 < opens.length ? opens[i + 1].index : svg.length;
    const body = svg.slice(m.index + m[0].length, end);
    const stroke = /\bstroke="(?!transparent")([^"]+)"/.exec(body)?.[1];
    return { from: unescapeXml(from), to: unescapeXml(to), stroke };
  });
}

/** Every spelling an author can give a node: its id and each dot-joined tail of its path. */
function authorSpellings(file: KrsFile): Set<string> {
  const out = new Set<string>();
  const walk = (node: KrsNode, prefix: readonly string[]): void => {
    const path = [...prefix, node.id];
    for (let i = 0; i < path.length; i++) out.add(path.slice(i).join("."));
    for (const child of node.children) walk(child, path);
  };
  const roots: KrsNode[] = [
    ...file.systems,
    ...file.services,
    ...file.domains,
    ...file.clients,
    ...file.databases,
    ...file.queues,
    ...file.storages,
  ];
  for (const root of roots) walk(root, []);
  return out;
}

const pairKey = (from: string, to: string) => JSON.stringify([from, to]);

/** A distinct colour per pair index, so a rule for one pair cannot pass for another. */
const colorOf = (i: number) => `#${(0x100000 + i * 7919).toString(16).slice(-6).toUpperCase()}`;

let corpus: ExampleEntry[];
beforeAll(async () => {
  corpus = await loadExampleCorpus();
});

describe("edge[from=][to=] matches every drawn edge by the ids the view stores (TPL-1755)", () => {
  it("the corpus draws a dot-notation endpoint", () => {
    const dotted = corpus.some((entry) =>
      drawnEdges(renderEveryView(entry, "none")).some(
        (e) => e.from.includes(".") || e.to.includes("."),
      ),
    );
    expect(dotted).toBe(true);
  });

  it.each(GROUP_BY_MODES)(
    "every drawn endpoint is spelled as the author can write it, group by %s",
    (mode) => {
      const foreign: string[] = [];
      for (const entry of corpus) {
        const spellings = authorSpellings(entry.krsFile);
        for (const e of drawnEdges(renderEveryView(entry, mode))) {
          for (const id of [e.from, e.to]) {
            if (!spellings.has(id)) foreign.push(`${entry.name}: ${e.from} -> ${e.to} (${id})`);
          }
        }
      }
      expect(foreign).toEqual([]);
    },
  );

  it.each(GROUP_BY_MODES)(
    "a rule built from each drawn pair strokes that edge, group by %s",
    (mode) => {
      const misses: string[] = [];
      for (const entry of corpus) {
        const pairs = new Map<string, string>();
        const baseline = drawnEdges(renderEveryView(entry, mode));
        for (const e of baseline) {
          const key = pairKey(e.from, e.to);
          if (!pairs.has(key)) pairs.set(key, colorOf(pairs.size));
        }
        if (pairs.size === 0) continue;
        const source = [...pairs]
          .map(([key, color]) => {
            const [from, to] = JSON.parse(key) as [string, string];
            return `edge[from=${JSON.stringify(from)}][to=${JSON.stringify(to)}] { color: ${color}; }`;
          })
          .join("\n");
        const probe = StyleParser.parse(source, "<probe>");
        expect(probe.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
        const styled = {
          ...entry,
          styleSheets: [...entry.styleSheets, probe.value],
        };
        const restyled = drawnEdges(renderEveryView(styled, mode));
        // The probe sheet must only recolour: the same edges, parallel ones
        // included, are drawn, so no edge escapes the colour check below.
        const multiset = (edges: DrawnEdge[]) => edges.map((e) => pairKey(e.from, e.to)).sort();
        expect(multiset(restyled), `${entry.name} draws the same edges`).toEqual(
          multiset(baseline),
        );
        for (const e of restyled) {
          const want = pairs.get(pairKey(e.from, e.to));
          if (e.stroke?.toUpperCase() !== want) {
            misses.push(
              `${entry.name}: ${e.from} -> ${e.to} stroked ${e.stroke}, rule says ${want}`,
            );
          }
        }
      }
      expect(misses).toEqual([]);
    },
  );
});
