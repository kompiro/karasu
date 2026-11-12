import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import * as core from "../index.js";
import {
  buildAllLayersSvg,
  buildAllViewsSvg,
  buildDrillDownSvg,
  compile,
  compileProject,
  compileSystemDiff,
  InMemoryFileSystemProvider,
  Parser,
  renderEntityView,
} from "../index.js";
import { resolvePalette, type DiagramTheme } from "./palette.js";

/**
 * A boundary's colour is answered in one place, `resolveBoundaryPaint`
 * (container-frame.ts): the author's `boundary` rule where there is one, the
 * cycled palette hue otherwise (#2234). A surface that reads
 * `palette.boundaryHues` itself paints the boundary in the cycled hue even
 * after an author repainted it, which is how a frame and its `◇` tab came to
 * disagree (TPL-2234).
 *
 * So: repaint every boundary with a base `boundary` rule, and no palette hue
 * may be left anywhere in the SVG. `border-color` alone repaints the stroke,
 * the tint and the title, so a hue that survives belongs to a surface that did
 * not ask the resolver. That holds for a surface added later too, in whatever
 * function it is drawn, as long as one of the entry points below draws it for
 * one of the models.
 */

/** A frame and a `◇` tab of one boundary on screen (see boundary-style-selector.test.ts). */
const TAB_MODEL = `
system Payments {
  service Checkout { label "Checkout" }
  service Ledger { label "Ledger" }
  service Wallet { label "Wallet" }
  service CardVault { label "Card vault" }

  Checkout -> Ledger "record"
  Ledger -> Wallet "debit"
  Ledger -> CardVault "tokenize"
}

boundary payments {
  label "Payments"
  contains Checkout
  contains Ledger
  contains Wallet
}

boundary pci {
  label "PCI scope"
  contains Ledger
  contains CardVault
}
`;

const REPAINT = "boundary { border-color: #123456; }";

const EXAMPLES_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../examples");

/** Every palette hue of `theme` that appears in `svg`, case-insensitively. */
function huesIn(svg: string, theme: DiagramTheme): string[] {
  const text = svg.toLowerCase();
  return resolvePalette(theme).boundaryHues.filter((hue) => text.includes(hue.toLowerCase()));
}

/**
 * The tab model and every shipped example that shows a boundary hue when drawn
 * grouped by boundary, read from the output so scoped boundaries count and a
 * new example joins on its own.
 */
const MODELS: [string, string][] = [
  ["tab model", TAB_MODEL],
  ...readdirSync(EXAMPLES_ROOT, { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".krs"))
    .sort()
    .map((path): [string, string] => [path, readFileSync(resolve(EXAMPLES_ROOT, path), "utf8")])
    .filter(([, krs]) => {
      const svg = compile(krs, { diagramType: "system", groupBy: "boundary" }).svg;
      return huesIn(svg, "dark").length > 0;
    }),
];

type GroupBy = "team" | "boundary";
type IsGroupBy<P> = [Exclude<P, undefined>] extends [never]
  ? false
  : 0 extends 1 & P
    ? false
    : [Exclude<P, undefined>] extends [GroupBy]
      ? true
      : false;
type HasGroupByOption<P> = P extends object
  ? string extends keyof P
    ? false
    : "groupBy" extends keyof P
      ? true
      : false
  : false;
type TakesGroupBy<F> = F extends (...args: infer A) => unknown
  ? true extends { [I in keyof A]: IsGroupBy<A[I]> | HasGroupByOption<NonNullable<A[I]>> }[number]
    ? true
    : false
  : false;

/** Every public export with a `groupBy` parameter or option: the ones that can draw boundary frames. */
type GroupByEntryName = {
  [K in keyof typeof core]: TakesGroupBy<(typeof core)[K]> extends true ? K : never;
}[keyof typeof core];

type Draw = (krs: string, theme: DiagramTheme, sheet?: string) => Promise<string> | string;

const ENTRY = "/project/index.krs";

async function projectFs(krs: string, sheet: string | undefined, paths: string[]) {
  const fs = new InMemoryFileSystemProvider();
  const source = sheet === undefined ? krs : `@import "repaint.krs.style"\n${krs}`;
  for (const path of paths) await fs.writeFile(path, source);
  if (sheet !== undefined) await fs.writeFile("/project/repaint.krs.style", sheet);
  return fs;
}

/**
 * How each entry point draws a model grouped by boundary, or, for one that
 * takes a laid-out view or resolved styles, the entry point that draws through
 * it. Satisfying `Record<GroupByEntryName, …>` makes a new entry point that can
 * group fail typecheck until it is placed here.
 */
const BOUNDARY_SURFACES = {
  compile: (krs, theme, styleSource) =>
    compile(krs, { diagramType: "system", groupBy: "boundary", theme, styleSource }).svg,
  compileProject: async (krs, theme, sheet) => {
    const fs = await projectFs(krs, sheet, [ENTRY]);
    return (await compileProject(ENTRY, fs, { diagramType: "system", groupBy: "boundary", theme }))
      .svg;
  },
  compileSystemDiff: async (krs, theme, sheet) => {
    const [beforeEntryPath, afterEntryPath] = ["/project/before.krs", "/project/after.krs"];
    const fs = await projectFs(krs, sheet, [beforeEntryPath, afterEntryPath]);
    const options = { beforeEntryPath, afterEntryPath, fs, groupBy: "boundary" as const, theme };
    return (await compileSystemDiff(options)).svg;
  },
  buildDrillDownSvg: (krs, theme, sheet) =>
    buildDrillDownSvg(krs, sheet, undefined, undefined, theme, undefined, "boundary").svg ?? "",
  buildAllLayersSvg: (krs, theme, sheet) =>
    buildAllLayersSvg(krs, sheet, undefined, undefined, theme, undefined, "boundary").svg ?? "",
  buildAllViewsSvg: (krs, theme, sheet) =>
    buildAllViewsSvg(krs, sheet, undefined, undefined, theme, undefined, "boundary").svg ?? "",
  renderEntityView: (krs, theme, sheet) => {
    // Every domain's entity view; a model without one draws nothing here.
    const paths: string[][] = [];
    const walk = (node: core.KrsNode, path: string[]): void => {
      const here = [...path, node.id];
      if (node.kind === "domain") paths.push(here);
      for (const child of node.children) walk(child, here);
    };
    for (const system of Parser.parse(krs).value.systems) walk(system, []);
    return paths
      .map(
        (path) =>
          renderEntityView(krs, path, sheet, undefined, undefined, theme, undefined, "boundary")
            .svg ?? "",
      )
      .join("\n");
  },
  render: { drawnThrough: "compile" },
  renderFromLayout: { drawnThrough: "compile" },
  renderDeploy: { drawnThrough: "compile (diagramType deploy draws no boundary frame)" },
} satisfies Record<GroupByEntryName, Draw | { drawnThrough: string }>;

const DRAWING: [string, Draw][] = Object.entries(
  BOUNDARY_SURFACES as Record<string, Draw | { drawnThrough: string }>,
).flatMap(([name, draw]) => (typeof draw === "function" ? [[name, draw]] : []));

const THEMES: DiagramTheme[] = ["dark", "light"];

describe("every boundary surface takes its colour from resolveBoundaryPaint (TPL-2234)", () => {
  it("has boundary models from the examples, and the tab model shows its hues unrepainted", async () => {
    expect(MODELS.length).toBeGreaterThan(1);
    // Without the rule the hues are on screen, so their absence below means the
    // rule reached every surface, not that nothing was drawn.
    for (const theme of THEMES) {
      expect(
        huesIn(await BOUNDARY_SURFACES.compile(TAB_MODEL, theme, undefined), theme),
      ).not.toEqual([]);
    }
  });

  describe.each(DRAWING)("%s", (_name, draw) => {
    describe.each(THEMES)("%s theme", (theme) => {
      it.each(MODELS)(
        "%s leaves no palette hue once every boundary is repainted",
        async (_m, krs) => {
          expect(huesIn(await draw(krs, theme, REPAINT), theme)).toEqual([]);
        },
      );
    });
  });
});
