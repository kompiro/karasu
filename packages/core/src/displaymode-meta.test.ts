/**
 * Meta-test over every public entry point of `index.ts` that consumes
 * `displayMode`, each invoked in every mode against one fixture.
 *
 * The set of entry points is computed from the module's type
 * (`DisplayModeEntryName`: an export with a `DisplayMode` parameter, or an
 * options parameter with a `displayMode` field), and `DISPLAY_MODE_CONSUMERS`
 * satisfies `Record<DisplayModeEntryName, …>`. A new public entry point that
 * takes the mode therefore fails typecheck until it is registered here, and
 * then runs every check below (TPL-1001: the surfaces a mode reaches are
 * listed, not remembered). Issue #183 was the missed-surface failure this
 * started from: the Full View called `buildExportSvg` without `displayMode`,
 * so icon mode was silently dropped from its output (Issue #1247).
 *
 * Checks per entry point:
 *
 * 1. Each mode's SVG differs from the others: the entry forwards the mode. An
 *    entry that dropped it would return identical bytes in every mode.
 * 2. For entries that draw system cards through `svg-renderer`, icon mode draws
 *    the fixed icon card and shape mode a card measured from its text. Org and
 *    deploy renderers give icon mode a footprint of their own and rely on (1).
 * 3. For entries that assemble sheets, an author sheet that redeclares every
 *    mode-sheet rule at the rule's own selector changes nothing in that mode:
 *    the mode's sheet sits after the author's (TPL-1001 items 3 and 6).
 * 4. For the same entries, the mode adds no warning or diagnostic to what
 *    shape mode reports with that author sheet: a mode's intentional override
 *    is not an author conflict (#279, TPL-1001 item 4).
 *
 * The `theme` argument (Issue #1479) has its own sibling meta-test,
 * `theme-meta.test.ts`, applying the same enumeration pattern.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import * as core from "./index.js";
import {
  buildAllLayersSvg,
  buildAllLayersSvgOrg,
  buildAllViewsSvg,
  buildAllViewsSvgDiffProject,
  buildAllViewsSvgProject,
  buildDrillDownSvg,
  buildDrillDownSvgOrg,
  compile,
  compileDeployDiff,
  compileOrgDiff,
  compileProject,
  compileSystemDiff,
  extractDeployView,
  extractOrgView,
  extractView,
  getBuiltinStyleSheet,
  InMemoryFileSystemProvider,
  Parser,
  render,
  renderDeploy,
  renderEntityView,
  renderFromLayout,
  renderOrgView,
  resolveStyles,
  StyleParser,
  type DisplayMode,
  type KrsNode,
  type StyleSelector,
} from "./index.js";
import { DISPLAY_MODE_SHEETS, withDisplayModeSheet } from "./builtins/display-mode-sheets.js";
import { layout } from "./renderer/layout.js";

/** Every display mode, checked against the `DisplayMode` union both ways. */
const DISPLAY_MODES = Object.keys(DISPLAY_MODE_SHEETS) as DisplayMode[];

/**
 * One node for every rule the mode sheets carry, so the author sheet in check 3
 * has something to fight over in each view. `every mode-sheet rule matches a
 * fixture node` keeps it that way when a rule is added.
 */
const FIXTURE = `system EC {
  user Shopper { label "Shopper" }
  service Frontend {
    label "Frontend"
  }
  client Plain { label "Plain" }
  client Phone [mobile] { label "Phone" }
  client Browser [web] { label "Browser" }
  client Desk [desktop] { label "Desk" }
  client Term [cli] { label "Term" }
  client Kiosk [device] { label "Kiosk" }
  client Addon [extension] { label "Addon" }
  client Widget [embed] { label "Widget" }
  service Orders {
    domain Ordering {
      entity Order {}
      usecase PlaceOrder {
        resource Cart { label "Cart" }
        resource OrderRows [table] { label "OrderRows" }
        resource OrderEvents [queue] { label "OrderEvents" }
        resource OrderApi [api] { label "OrderApi" }
        resource Receipts [storage] { label "Receipts" }
      }
    }
  }
  database OrderDb { label "OrderDb" }
  queue Jobs { queue Job { label "Job" } }
  storage Files { bucket Blob { label "Blob" } }
}
deploy "prod" {
  oci FrontendBox { realizes Frontend }
  lambda Fn { realizes Orders }
  jar Lib {}
  war Web {}
  function Func {}
  assets Bundle {}
  job Nightly {}
  artifact Pkg {}
  store Disk { realizes OrderDb }
}
organization Acme {
  team Backend {
    label "Backend"
    member Alice {}
  }
}`;

const ENTRY = "/project/index.krs";
const SHEET = "author.krs.style";

/** What an invocation drew, and every finding it reported (warnings and diagnostics). */
interface Rendered {
  svg: string;
  findings: string[];
}

interface Consumer {
  /**
   * Renders `krs` (the fixture unless given) in `mode`, with `authorSheet` as
   * the author's `.krs.style` when given.
   */
  invoke: (mode: DisplayMode, authorSheet?: string, krs?: string) => Promise<Rendered> | Rendered;
  /**
   * Whether icon mode is expected to draw the system card at the fixed
   * icon-card size. True for renderers that go through `svg-renderer`'s
   * system-card path. False for org / deploy renderers, which give icon mode
   * a footprint of their own, and for entries that draw no `Frontend` card.
   */
  expectsIconCard: boolean;
  /**
   * `"assembles"` for an entry that builds the cascade from sheets, and so has
   * to put the mode's sheet last (checks 3 and 4). An entry that takes styles
   * already resolved says who resolves them instead.
   */
  sheets: "assembles" | { resolvedBy: string };
}

type IsDisplayMode<P> = [Exclude<P, undefined>] extends [never]
  ? false
  : 0 extends 1 & P
    ? false
    : [Exclude<P, undefined>] extends [DisplayMode]
      ? [DisplayMode] extends [Exclude<P, undefined>]
        ? true
        : false
      : false;
type HasDisplayModeOption<P> = P extends object
  ? string extends keyof P
    ? false
    : "displayMode" extends keyof P
      ? true
      : false
  : false;
type TakesDisplayMode<F> = F extends (...args: infer A) => unknown
  ? true extends {
      [I in keyof A]: IsDisplayMode<A[I]> | HasDisplayModeOption<NonNullable<A[I]>>;
    }[number]
    ? true
    : false
  : false;

/** Every public export with a `DisplayMode` parameter or a `displayMode` option. */
type DisplayModeEntryName = {
  [K in keyof typeof core]: TakesDisplayMode<(typeof core)[K]> extends true ? K : never;
}[keyof typeof core];

function findings(result: {
  diagnostics: readonly { severity: string; code: string; params?: unknown }[];
  warnings?: readonly { kind: string; params?: unknown }[];
}): string[] {
  return [
    ...result.diagnostics.map((d) => `${d.severity} ${d.code} ${JSON.stringify(d.params ?? {})}`),
    ...(result.warnings ?? []).map((w) => `${w.kind} ${JSON.stringify(w.params ?? {})}`),
  ].sort();
}

/** The fixture as a project, with the author sheet imported when given. */
async function project(authorSheet: string | undefined, krs: string, paths = [ENTRY]) {
  const fs = new InMemoryFileSystemProvider();
  const source = authorSheet === undefined ? krs : `@import "${SHEET}"\n${krs}`;
  for (const path of paths) await fs.writeFile(path, source);
  if (authorSheet !== undefined) await fs.writeFile(`/project/${SHEET}`, authorSheet);
  return fs;
}

async function diffOptions(mode: DisplayMode, authorSheet: string | undefined, krs: string) {
  const [beforeEntryPath, afterEntryPath] = ["/project/before.krs", "/project/after.krs"];
  const fs = await project(authorSheet, krs, [beforeEntryPath, afterEntryPath]);
  return { beforeEntryPath, afterEntryPath, fs, displayMode: mode };
}

/**
 * The parsed fixture and its styles, resolved for `mode` the way every caller of
 * the low-level renderers resolves them (the mode's sheet last).
 */
function resolvedFixture(mode: DisplayMode, krs: string) {
  const file = Parser.parse(krs).value;
  const deployNodes = file.deploys.flatMap((d) => d.nodes);
  const sheets = withDisplayModeSheet([getBuiltinStyleSheet()], mode);
  const styles = resolveStyles(file.systems, sheets, deployNodes, file.organizations);
  return { file, styles };
}

const RESOLVED_BY_CALLER = {
  resolvedBy: "the caller: it takes ResolvedStyles, and every caller in core assembles them",
};

const DISPLAY_MODE_CONSUMERS = {
  compile: {
    expectsIconCard: true,
    sheets: "assembles",
    invoke: (mode, styleSource, krs = FIXTURE) => {
      const result = compile(krs, { displayMode: mode, diagramType: "system", styleSource });
      return { svg: result.svg, findings: findings(result) };
    },
  },
  compileProject: {
    expectsIconCard: true,
    sheets: "assembles",
    invoke: async (mode, authorSheet, krs = FIXTURE) => {
      const fs = await project(authorSheet, krs);
      const result = await compileProject(ENTRY, fs, { displayMode: mode, diagramType: "system" });
      return { svg: result.svg, findings: findings(result) };
    },
  },
  buildDrillDownSvg: {
    expectsIconCard: true,
    sheets: "assembles",
    invoke: (mode, sheet, krs = FIXTURE) => rendered(buildDrillDownSvg(krs, sheet, mode)),
  },
  buildAllLayersSvg: {
    expectsIconCard: true,
    sheets: "assembles",
    invoke: (mode, sheet, krs = FIXTURE) => rendered(buildAllLayersSvg(krs, sheet, mode)),
  },
  buildAllLayersSvgOrg: {
    expectsIconCard: false,
    sheets: "assembles",
    invoke: (mode, sheet, krs = FIXTURE) => rendered(buildAllLayersSvgOrg(krs, sheet, mode)),
  },
  buildDrillDownSvgOrg: {
    expectsIconCard: false,
    sheets: "assembles",
    invoke: (mode, sheet, krs = FIXTURE) => rendered(buildDrillDownSvgOrg(krs, sheet, mode)),
  },
  buildAllViewsSvg: {
    expectsIconCard: true,
    sheets: "assembles",
    invoke: (mode, sheet, krs = FIXTURE) => rendered(buildAllViewsSvg(krs, sheet, mode)),
  },
  buildAllViewsSvgProject: {
    expectsIconCard: true,
    sheets: "assembles",
    invoke: async (mode, authorSheet, krs = FIXTURE) => {
      const fs = await project(authorSheet, krs);
      return rendered(await buildAllViewsSvgProject(ENTRY, fs, undefined, mode));
    },
  },
  renderEntityView: {
    expectsIconCard: false,
    sheets: "assembles",
    invoke: (mode, sheet, krs = FIXTURE) =>
      rendered(renderEntityView(krs, ["EC", "Orders", "Ordering"], sheet, mode)),
  },
  compileSystemDiff: {
    expectsIconCard: true,
    sheets: "assembles",
    invoke: async (mode, sheet, krs = FIXTURE) =>
      rendered(await compileSystemDiff(await diffOptions(mode, sheet, krs))),
  },
  compileDeployDiff: {
    expectsIconCard: false,
    sheets: "assembles",
    invoke: async (mode, sheet, krs = FIXTURE) =>
      rendered(await compileDeployDiff(await diffOptions(mode, sheet, krs))),
  },
  compileOrgDiff: {
    expectsIconCard: false,
    sheets: "assembles",
    invoke: async (mode, sheet, krs = FIXTURE) =>
      rendered(await compileOrgDiff(await diffOptions(mode, sheet, krs))),
  },
  buildAllViewsSvgDiffProject: {
    expectsIconCard: true,
    sheets: "assembles",
    invoke: async (mode, sheet, krs = FIXTURE) =>
      rendered(await buildAllViewsSvgDiffProject(await diffOptions(mode, sheet, krs))),
  },
  render: {
    expectsIconCard: true,
    sheets: RESOLVED_BY_CALLER,
    invoke: (mode, _sheet, krs = FIXTURE) => {
      const { file, styles } = resolvedFixture(mode, krs);
      return {
        svg: render(extractView(file.systems, []), styles, undefined, undefined, mode),
        findings: [],
      };
    },
  },
  renderFromLayout: {
    expectsIconCard: true,
    sheets: RESOLVED_BY_CALLER,
    invoke: (mode, _sheet, krs = FIXTURE) => {
      const { file, styles } = resolvedFixture(mode, krs);
      const laid = layout(extractView(file.systems, []), { displayMode: mode });
      return { svg: renderFromLayout(laid, styles, undefined, undefined, mode), findings: [] };
    },
  },
  renderOrgView: {
    expectsIconCard: false,
    sheets: RESOLVED_BY_CALLER,
    invoke: (mode, _sheet, krs = FIXTURE) => {
      const { file, styles } = resolvedFixture(mode, krs);
      return {
        svg: renderOrgView(extractOrgView(file.organizations, []), styles, mode),
        findings: [],
      };
    },
  },
  renderDeploy: {
    expectsIconCard: false,
    sheets: RESOLVED_BY_CALLER,
    invoke: (mode, _sheet, krs = FIXTURE) => {
      const { file, styles } = resolvedFixture(mode, krs);
      const slice = extractDeployView(file.deploys, file.systems);
      return { svg: renderDeploy(slice, styles, mode), findings: [] };
    },
  },
} satisfies Record<DisplayModeEntryName, Consumer>;

/** A builder's result; a builder that drew nothing gives `""`, which check 1 rejects for the fixture. */
function rendered(result: Parameters<typeof findings>[0] & { svg: string | null }): Rendered {
  return { svg: result.svg ?? "", findings: findings(result) };
}

const CONSUMERS = Object.entries(DISPLAY_MODE_CONSUMERS).map(([name, consumer]) => ({
  name,
  ...(consumer as Consumer),
}));

/** The fixed icon card `measureNode` gives a description-less node in icon mode. */
const ICON_CARD = { width: 160, height: 56 };

/**
 * Geometry of the card drawn for the fixture's `Frontend` service, read back
 * from the emitted SVG — the first `<rect>` inside that node's own group.
 * Scoped to the group so the marker cannot silently drift onto a badge or the
 * next node's card if `service` ever stops being drawn as a rect.
 */
function frontendCard(svg: string): { width: number; height: number } {
  const start = svg.indexOf('data-node-id="Frontend"');
  expect(start).toBeGreaterThan(-1);
  const rest = svg.slice(start);
  const next = rest.indexOf("data-node-id=", 1);
  const group = next === -1 ? rest : rest.slice(0, next);
  const rect = /<rect\s[^>]*\bwidth="([\d.]+)"[^>]*\bheight="([\d.]+)"/.exec(group);
  expect(rect).not.toBeNull();
  return { width: Number(rect![1]), height: Number(rect![2]) };
}

/** `kind[tag]…` for a mode-sheet selector; any other part fails, so a new form is not skipped. */
function selectorText(selector: StyleSelector): string {
  const { nodeType, tags, annotations, facets, id, edgeId, boundaryId, edgeFrom, edgeTo } =
    selector;
  const unsupported = [annotations.length, facets.length, id, edgeId, boundaryId, edgeFrom, edgeTo];
  if (!nodeType || unsupported.some((part) => part !== undefined && part !== 0)) {
    throw new Error(`teach selectorText this mode-sheet selector: ${JSON.stringify(selector)}`);
  }
  return `${nodeType}${tags.map((tag) => `[${tag}]`).join("")}`;
}

/**
 * A value an author would write to take each mode-owned property back. A mode
 * sheet declaring a property missing here fails until a value is chosen.
 */
const AUTHOR_VALUE: Record<string, string> = { shape: "box" };

/** Every rule of `mode`'s sheet, redeclared by an author at the same selector. */
function fightingSheet(mode: DisplayMode): string | undefined {
  const sheet = DISPLAY_MODE_SHEETS[mode]?.();
  if (!sheet) return undefined;
  return sheet.rules
    .map((rule) => {
      const declarations = Object.keys(rule.properties).map((property) => {
        const value = AUTHOR_VALUE[property];
        if (value === undefined) throw new Error(`add an AUTHOR_VALUE for "${property}"`);
        return `${property}: ${value};`;
      });
      return `${selectorText(rule.selector)} { ${declarations.join(" ")} }`;
    })
    .join("\n");
}

/** Every logical, org and deploy node of the fixture, as the style resolver matches them. */
function fixtureNodes(): { kind: string; tags: readonly string[] }[] {
  const file = Parser.parse(FIXTURE).value;
  const nodes: { kind: string; tags: readonly string[] }[] = [];
  const walk = (node: { kind: string; tags?: string[]; children: unknown[] }): void => {
    nodes.push({ kind: node.kind, tags: node.tags ?? [] });
    for (const child of node.children) walk(child as KrsNode);
  };
  file.systems.forEach(walk);
  file.organizations.forEach((org) => org.teams.forEach(walk));
  for (const unit of file.deploys.flatMap((d) => d.nodes))
    nodes.push({ kind: unit.kind, tags: [] });
  return nodes;
}

const MODES_WITH_SHEETS = DISPLAY_MODES.filter((mode) => DISPLAY_MODE_SHEETS[mode] !== undefined);
const ASSEMBLING = CONSUMERS.filter((c) => c.sheets === "assembles");

describe("meta: every displayMode-consuming entry point threads displayMode", () => {
  it("knows every display mode and gives the fixture a node for every mode-sheet rule", () => {
    expect(DISPLAY_MODES.length).toBeGreaterThanOrEqual(2);
    expect(MODES_WITH_SHEETS.length).toBeGreaterThan(0);
    const nodes = fixtureNodes();
    for (const mode of MODES_WITH_SHEETS) {
      for (const rule of DISPLAY_MODE_SHEETS[mode]!().rules) {
        const { nodeType, tags } = rule.selector;
        const match = nodes.some(
          (n) => n.kind === nodeType && tags.every((t) => n.tags.includes(t)),
        );
        expect(match, `no fixture node for ${selectorText(rule.selector)}`).toBe(true);
      }
    }
  });

  // Bytes-differ is the structural assertion that applies to every entry
  // point: if displayMode were silently dropped (Issue #183), every mode
  // would produce identical SVG.
  it.each(CONSUMERS)("$name produces different SVG in every mode", async (consumer) => {
    const svgs = await Promise.all(
      DISPLAY_MODES.map(async (mode) => (await consumer.invoke(mode)).svg),
    );
    for (const svg of svgs) expect(svg).not.toBe("");
    expect(new Set(svgs).size).toBe(DISPLAY_MODES.length);
  });

  // Stronger assertion for renderers that draw system cards through
  // svg-renderer: icon mode sizes every card to the fixed icon card,
  // shape mode measures it from its text. Reading the card back from
  // the emitted SVG keeps the marker on what is drawn (TPL-2385).
  it.each(CONSUMERS.filter((c) => c.expectsIconCard))(
    "$name draws the fixed icon card in icon mode and a measured card in shape mode",
    async (consumer) => {
      const iconCard = frontendCard((await consumer.invoke("icon")).svg);
      const shapeCard = frontendCard((await consumer.invoke("shape")).svg);

      expect(iconCard).toEqual(ICON_CARD);
      expect(shapeCard).not.toEqual(ICON_CARD);
    },
  );
});

describe("meta: a mode's sheet beats the author's on every entry point that assembles sheets", () => {
  // The author sheet takes back every property each mode sheet sets, at the
  // mode rule's own specificity, so only the cascade order decides. The mode
  // sheet has to come last (#279): an entry point that put it before the
  // author's would draw the author's box instead of the mode's icon.
  describe.each(MODES_WITH_SHEETS)("%s mode", (mode) => {
    const sheet = fightingSheet(mode)!;

    it.each(ASSEMBLING)("$name draws the same SVG with or without the author sheet", async (c) => {
      expect((await c.invoke(mode, sheet)).svg).toBe((await c.invoke(mode)).svg);
    });

    it.each(ASSEMBLING)("$name reports nothing shape mode does not report", async (c) => {
      expect((await c.invoke(mode, sheet)).findings).toEqual(
        (await c.invoke("shape", sheet)).findings,
      );
    });

    // The entry points above only fight the rules on the fixture's nodes in
    // the views they draw; this fights each rule on its own node through the
    // shared assembly, so a rule added to the mode sheet is fought at once.
    it.each(DISPLAY_MODE_SHEETS[mode]!().rules.map((rule) => [selectorText(rule.selector), rule]))(
      "%s keeps the mode's value against an author rule at the same selector",
      (_selector, rule) => {
        const node = {
          id: "N",
          kind: rule.selector.nodeType,
          label: "N",
          tags: rule.selector.tags,
          annotations: [],
          edges: [],
          children: [],
          properties: { links: [] },
        } as unknown as KrsNode;
        const author = StyleParser.parse(fightingSheet(mode)!).value;
        const builtin = getBuiltinStyleSheet();
        const modeSheet = DISPLAY_MODE_SHEETS[mode]!();
        const styleOf = (sheets: Parameters<typeof resolveStyles>[1]) =>
          resolveStyles([node], sheets).nodes.get("N");
        // The fight is real: without the mode, the author's rule changes the node.
        expect(styleOf([builtin, author])).not.toEqual(styleOf([builtin, modeSheet]));
        // And the assembly every entry point uses resolves it as the mode sheet
        // last would, whatever the builtin sheet says about the same property.
        expect(styleOf(withDisplayModeSheet([builtin, author], mode))).toEqual(
          styleOf([builtin, author, modeSheet]),
        );
        expect(styleOf(withDisplayModeSheet([builtin, author], mode))).toEqual(
          styleOf([builtin, modeSheet]),
        );
      },
    );
  });
});

/** Each drill level (`<g id="krs-…" class="krs-view…">`) of `svg`: its id, and its text up to the next level. */
function drillLevels(svg: string): { id: string; text: string }[] {
  const starts = [...svg.matchAll(/<g id="(krs-[^"]+)" class="krs-view[^"]*">/g)];
  return starts.map((start, i) => ({
    id: start[1],
    text: svg.slice(start.index, starts[i + 1]?.index ?? svg.length),
  }));
}

/**
 * Levels of `svg` where an interactive control (`<a>`: a back button, a card
 * link) comes before the level's canvas, the first `<rect>` in the level. SVG
 * paints in document order and the canvas is opaque, so such a control is
 * buried, invisible and unclickable (#2044). A control drawn with its own
 * `<rect>` and emitted first still counts: its `<a` opens before that rect.
 */
function controlsUnderCanvas(svg: string): string[] {
  return drillLevels(svg)
    .filter(({ text }) => {
      const canvas = text.indexOf("<rect");
      const firstControl = text.indexOf("<a ");
      return firstControl !== -1 && (canvas === -1 || firstControl < canvas);
    })
    .map(({ id }) => id);
}

// Every public SVG entry point takes `displayMode` (an SVG surface that ignored
// the mode would itself break TPL-1001), so the registry above is also the set
// of surfaces that can bundle drill levels. Which of them do is read from their
// output, so a new builder that bundles levels is checked without being named
// here (TPL-2044: every parallel builder keeps controls on top).
const BUNDLES_LEVELS = (
  await Promise.all(
    CONSUMERS.map(async (c) => ({ c, levels: drillLevels((await c.invoke("shape")).svg) })),
  )
)
  .filter(({ levels }) => levels.length > 0)
  .map(({ c }) => c);

const EXAMPLES_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../examples");
const EXAMPLE_FILES = readdirSync(EXAMPLES_ROOT, { recursive: true, encoding: "utf8" })
  .filter((path) => path.endsWith(".krs"))
  .sort();

describe("meta: drill levels paint their controls over the level canvas (#2044)", () => {
  it("has entry points that bundle drill levels, with a back button among them", async () => {
    expect(BUNDLES_LEVELS.length).toBeGreaterThan(0);
    const svgs = await Promise.all(BUNDLES_LEVELS.map(async (c) => (await c.invoke("shape")).svg));
    expect(svgs.some((svg) => svg.includes('class="krs-back-button"'))).toBe(true);
  });

  it.each(BUNDLES_LEVELS)("$name, on the fixture", async (consumer) => {
    expect(controlsUnderCanvas((await consumer.invoke("shape")).svg)).toEqual([]);
  });

  // The fixture has the level kinds known today; the shipped examples bring the
  // shapes nobody wrote a fixture for, and a new example joins on its own.
  describe.each(BUNDLES_LEVELS)("$name, on every shipped example", (consumer) => {
    it.each(EXAMPLE_FILES)("%s", async (path) => {
      const krs = readFileSync(resolve(EXAMPLES_ROOT, path), "utf8");
      expect(controlsUnderCanvas((await consumer.invoke("shape", undefined, krs)).svg)).toEqual([]);
    });
  });
});
