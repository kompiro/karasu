import { beforeAll, describe, expect, it } from "vitest";
import { anchorId, Parser, sanitizeId } from "@karasu-tools/core";
import type { KrsFile } from "@karasu-tools/core";
// The static bundle as `karasu render` draws a resolved model, and every shipped
// example as one (the corpus core's guards walk).
import {
  buildAllViewsSvg,
  bundleSingleLevelViews,
} from "../../core/src/renderer/drill-down-svg.js";
import {
  loadExampleCorpus,
  type ExampleEntry,
} from "../../core/src/renderer/fixtures/example-corpus.js";
import type { HighlightAttribute } from "./state/app-reducer.js";

/**
 * Deep-link anchors over every shipped example (TPL-1827, docs/spec/permalink.md).
 *
 * The static all-views bundle is drawn for every example and for a fixture whose
 * ids need `sanitizeId` and whose labels differ from its ids. Two properties are
 * checked on what comes out, however the producer spelled it:
 *
 * - **one grammar.** Every `id="krs-…"` the bundle emits is `anchorId(view, id)`
 *   for an `id` the model declares (or the view's `root`), and every
 *   `href="#krs-…"` lands on one of them. A producer that writes `krs-<view>-<id>`
 *   without sanitizing, or keys a level by its label, goes red.
 * - **identity is the id.** Relabelling every element leaves every anchor, every
 *   link and every attribute the SPA matches a restored highlight or drill
 *   against unchanged.
 *
 * A new example joins the day it is added; the last test checks the corpus still
 * has the shapes these properties are about.
 */

/** Element-anchor view tokens (`docs/spec/permalink.md` "Anchor grammar"). */
const ANCHOR_VIEWS = ["system", "deploy", "org", "entity"] as const;

/**
 * Every attribute the SPA matches a hash's `:<highlight>` against. A `Record`
 * over the app's union, so a new one does not compile until it is listed and
 * checked here.
 */
const HIGHLIGHT_ATTRIBUTES = {
  "data-node-id": true,
  "data-realized-node-id": true,
} satisfies Record<HighlightAttribute, true>;

/** The attribute a drilled card carries for the SPA's drill (TPL-3113). */
const IDENTITY_ATTRIBUTES = [...Object.keys(HIGHLIGHT_ATTRIBUTES), "data-node-path"];

/**
 * Ids that need sanitizing, labels that differ from ids, and every anchor view
 * in one model, so the corpus has these shapes even if no example does.
 */
const FIXTURE = `
system "shop.v2" {
  label "Shop"
  service "order/svc" {
    label "Order Service"
    domain "ord.core" {
      label "Ordering"
      usecase Place {}
      entity Order {
        Order -> Line "has"
      }
      entity Line {}
    }
  }
  service Pay { label "Payment" }
  "order/svc" -> Pay "charges"
}
organization Acme {
  team "team.a" {
    label "Team A"
    owns "order/svc"
  }
}
deploy Prod {
  oci "web" { realizes "order/svc" }
}
`;

interface Drawn {
  name: string;
  krsFile: KrsFile;
  ids: Set<string>;
  svg: string;
  /** Draw a (relabelled) copy of the model the same way. */
  redraw: (krsFile: KrsFile) => string;
}

function bundle(krsFile: KrsFile, entry?: ExampleEntry): string {
  return buildAllViewsSvg(
    krsFile,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    entry?.styleSheets,
  ).svg;
}

/**
 * The diff output's bundle (#650): one pre-rendered level per view, the other
 * producer of whole-view anchors.
 */
function diffBundle(krsFile: KrsFile): string {
  const level = bundle(krsFile);
  return bundleSingleLevelViews({ system: level, deploy: level, org: level }) ?? "";
}

function draw(name: string, krsFile: KrsFile, redraw: (k: KrsFile) => string): Drawn {
  return { name, krsFile, ids: declaredIds(krsFile), svg: redraw(krsFile), redraw };
}

/** Every `id` string the model declares, at any depth. */
function declaredIds(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) declaredIds(item, out);
  } else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key === "id" && typeof child === "string") out.add(child);
      else declaredIds(child, out);
    }
  }
  return out;
}

/** Give every labelled element a label that is not its old one. */
function relabel(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) relabel(item);
  } else if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const [key, child] of Object.entries(record)) {
      if (key === "label" && typeof child === "string") record[key] = `Relabelled ${child} x`;
      else relabel(child);
    }
  }
}

function matches(svg: string, pattern: RegExp): string[] {
  return [...svg.matchAll(pattern)].map((m) => m[1]);
}

const anchorsOf = (svg: string) => matches(svg, /\sid="(krs-[^"]*)"/g);
const linksOf = (svg: string) => matches(svg, /\shref="#(krs-[^"]*)"/g);
const attributeValues = (svg: string, attribute: string) =>
  matches(svg, new RegExp(`\\s${attribute}="([^"]*)"`, "g")).sort();

const drawn: Drawn[] = [];

beforeAll(async () => {
  for (const entry of await loadExampleCorpus()) {
    drawn.push(draw(entry.name, entry.krsFile, (k) => bundle(k, entry)));
  }
  const fixture = Parser.parse(FIXTURE).value;
  drawn.push(draw("fixture", fixture, (k) => bundle(k)));
  drawn.push(draw("fixture (diff bundle)", fixture, diffBundle));
}, 120_000);

describe("every static bundle", () => {
  it("emits only anchors in the anchorId grammar, for a declared id", () => {
    const strays = drawn.flatMap(({ name, ids, svg }) => {
      const allowed = new Set(
        ANCHOR_VIEWS.flatMap((view) => [...ids, "root"].map((id) => anchorId(view, id))),
      );
      return anchorsOf(svg)
        .filter((anchor) => !allowed.has(anchor))
        .map((anchor) => `${name}: ${anchor}`);
    });
    expect(strays).toEqual([]);
  });

  it("links only to anchors it emits", () => {
    const dangling = drawn.flatMap(({ name, svg }) => {
      const anchors = new Set(anchorsOf(svg));
      return linksOf(svg)
        .filter((link) => !anchors.has(link))
        .map((link) => `${name}: #${link}`);
    });
    expect(dangling).toEqual([]);
  });

  it("keeps every anchor, link and identity attribute when every label changes", () => {
    const changed = drawn.flatMap(({ name, krsFile, svg, redraw }) => {
      const relabelled = structuredClone(krsFile);
      relabel(relabelled);
      const after = redraw(relabelled);
      const facets: [string, (s: string) => string[]][] = [
        ["anchors", anchorsOf],
        ["links", linksOf],
        ...IDENTITY_ATTRIBUTES.map(
          (attribute) =>
            [attribute, (s: string) => attributeValues(s, attribute)] as [
              string,
              (s: string) => string[],
            ],
        ),
      ];
      return facets
        .filter(([, read]) => JSON.stringify(read(svg)) !== JSON.stringify(read(after)))
        .map(([facet]) => `${name}: ${facet}`);
    });
    expect(changed).toEqual([]);
  });
});

describe("the corpus", () => {
  it("has the shapes the properties above are about", () => {
    const anchors = drawn.flatMap(({ svg }) => anchorsOf(svg));
    // Every anchor view has a level somewhere.
    for (const view of ANCHOR_VIEWS) {
      expect(anchors.some((a) => a.startsWith(`krs-${view}-`))).toBe(true);
    }
    // A drilled level for an id sanitizeId rewrites, and one for an id whose
    // label differs from it.
    const sanitized = drawn.some(({ ids, svg }) =>
      [...ids].some(
        (id) => sanitizeId(id) !== id && anchorsOf(svg).includes(anchorId("system", id)),
      ),
    );
    expect(sanitized).toBe(true);
    // Every identity attribute is drawn, and relabelling changes what is drawn,
    // so the invariance above is measured on labels that are on the canvas.
    for (const attribute of IDENTITY_ATTRIBUTES) {
      expect(drawn.some(({ svg }) => attributeValues(svg, attribute).length > 0)).toBe(true);
    }
    const fixture = drawn.find((d) => d.name === "fixture")!;
    expect(fixture.svg).toContain("Order Service");
  });
});
