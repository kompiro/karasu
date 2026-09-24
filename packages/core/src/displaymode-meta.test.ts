/**
 * Meta-test enumerating every public SVG-producing entry point that
 * consumes `displayMode`. For each entry the test invokes both `"icon"`
 * and `"shape"` against a fixture covering system + org content and
 * asserts:
 *
 * 1. The SVG bytes differ between the two modes — the call site is
 *    forwarding `displayMode` to the renderer. If the parameter were
 *    silently dropped (Issue #183), both invocations would return
 *    identical bytes.
 * 2. For renderers that draw system cards through `svg-renderer`
 *    (system drill-down, all-layers, all-views, project bundles),
 *    icon-mode SVG draws the node at the *fixed* icon-card size, which
 *    is what `measureNode` does only in icon mode — shape mode measures
 *    the card from its text. Renderers without this path
 *    (`buildAllLayersSvgOrg`, `buildDrillDownSvgOrg`) are flagged
 *    `expectsIconCard: false` and rely on the bytes-differ assertion
 *    alone, since they exercise the org renderer which uses a different
 *    icon-mode footprint.
 *
 *    This marker used to be "icon mode emits more `<rect>`s", i.e. the
 *    card frame. #2696 made the frame mode-independent (a `url()` icon
 *    paints its declared frame in shape mode too), so the frame no
 *    longer tells the modes apart — the card *size* does.
 *
 * The point of this test is **structural**: when a new SVG-producing
 * entry point is added (PNG export, draw.io export per #649, future
 * preview-only renderer, etc.) the author MUST register it in the
 * `DISPLAY_MODE_CONSUMERS` table below. Adding such a function without
 * threading `displayMode` will fail this test as soon as it appears in
 * the table; forgetting to add it to the table is the failure mode this
 * test cannot catch directly, so the table sits in the test file with a
 * loud comment so code review surfaces the omission.
 *
 * Background: Issue #183 was the canonical missed-surface failure — the
 * Full View hook called `buildExportSvg` without `displayMode` so icon
 * mode was silently dropped from Full View output. TPL-1001
 * codified the "enumerate every surface" principle; this test
 * operationalizes that enumeration.
 *
 * See Issue #1247 and TPL-1001.
 *
 * The `theme` argument (Issue #1479) has its own sibling meta-test —
 * `theme-meta.test.ts` — applying the same enumeration pattern.
 */
import { describe, it, expect } from "vitest";
import {
  buildAllLayersSvg,
  buildAllLayersSvgOrg,
  buildAllViewsSvg,
  buildAllViewsSvgProject,
  buildDrillDownSvg,
  buildDrillDownSvgOrg,
  compile,
  compileProject,
  InMemoryFileSystemProvider,
  type DisplayMode,
  type SvgResult,
} from "./index.js";

// Fixture covers both system and org content so the org/all-views
// entries produce non-empty SVG in both modes.
const FIXTURE = `system EC {
  service Frontend {
    label "Frontend"
  }
}
organization Acme {
  team Backend {
    label "Backend"
  }
}`;

const ENTRY_PATH = "/project/index.krs";

interface Consumer {
  name: string;
  invoke: (mode: DisplayMode) => Promise<string> | string;
  /**
   * Whether icon mode is expected to draw the system card at the fixed
   * icon-card size. True for renderers that go through `svg-renderer`'s
   * system-card path. False for org-tree renderers, which give icon
   * mode a different footprint of their own.
   */
  expectsIconCard: boolean;
}

/**
 * Curated table of every public SVG-producing entry point that takes a
 * `displayMode` parameter.
 *
 * **When you add a new SVG-producing function to the public API, add an
 * entry here.** The test below enumerates this table; a new entry point
 * without registration silently escapes the regression net and will
 * eventually re-create #183-style "icon mode ignored" bugs.
 */
const DISPLAY_MODE_CONSUMERS: Consumer[] = [
  {
    name: "compile (system)",
    expectsIconCard: true,
    invoke: (mode) => {
      const result = compile(FIXTURE, { displayMode: mode, diagramType: "system" });
      return result.svg;
    },
  },
  {
    name: "compileProject (system)",
    expectsIconCard: true,
    invoke: async (mode) => {
      const fs = new InMemoryFileSystemProvider();
      await fs.writeFile(ENTRY_PATH, FIXTURE);
      const result = await compileProject(ENTRY_PATH, fs, {
        displayMode: mode,
        diagramType: "system",
      });
      return result.svg;
    },
  },
  {
    name: "buildDrillDownSvg",
    expectsIconCard: true,
    invoke: (mode) => svgOrThrow(buildDrillDownSvg(FIXTURE, undefined, mode)),
  },
  {
    name: "buildAllLayersSvg",
    expectsIconCard: true,
    invoke: (mode) => svgOrThrow(buildAllLayersSvg(FIXTURE, undefined, mode)),
  },
  {
    name: "buildAllLayersSvgOrg",
    expectsIconCard: false,
    invoke: (mode) => svgOrThrow(buildAllLayersSvgOrg(FIXTURE, undefined, mode)),
  },
  {
    name: "buildDrillDownSvgOrg",
    expectsIconCard: false,
    invoke: (mode) => svgOrThrow(buildDrillDownSvgOrg(FIXTURE, undefined, mode)),
  },
  {
    name: "buildAllViewsSvg",
    expectsIconCard: true,
    invoke: (mode) => svgOrThrow(buildAllViewsSvg(FIXTURE, undefined, mode)),
  },
  {
    name: "buildAllViewsSvgProject",
    expectsIconCard: true,
    invoke: async (mode) => {
      const fs = new InMemoryFileSystemProvider();
      await fs.writeFile(ENTRY_PATH, FIXTURE);
      const result = await buildAllViewsSvgProject(ENTRY_PATH, fs, undefined, mode);
      return result.svg;
    },
  },
];

function svgOrThrow(result: SvgResult): string {
  if (!result.svg) {
    throw new Error(
      `expected non-empty svg, got diagnostics: ${JSON.stringify(result.diagnostics)}`,
    );
  }
  return result.svg;
}

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

const ICON_CARD_CONSUMERS = DISPLAY_MODE_CONSUMERS.filter((c) => c.expectsIconCard);

describe("meta: every displayMode-consuming SVG entry point threads displayMode", () => {
  // Bytes-differ is the structural assertion that applies to every
  // entry point: if displayMode were silently dropped (Issue #183),
  // icon and shape invocations would produce identical SVG.
  it.each(DISPLAY_MODE_CONSUMERS)(
    "$name produces different SVG for icon vs shape mode",
    async (consumer) => {
      const iconSvg = await consumer.invoke("icon");
      const shapeSvg = await consumer.invoke("shape");

      expect(iconSvg).not.toBe("");
      expect(shapeSvg).not.toBe("");
      expect(iconSvg).not.toBe(shapeSvg);
    },
  );

  // Stronger assertion for renderers that draw system cards through
  // svg-renderer: icon mode sizes every card to the fixed icon card,
  // shape mode measures it from its text. Reading the card back from
  // the emitted SVG keeps the marker on what is drawn (TPL-2385).
  //
  // Org renderers (buildAllLayersSvgOrg / buildDrillDownSvgOrg) follow
  // a different icon-mode footprint and are intentionally excluded —
  // they're still covered by the bytes-differ test above.
  it.each(ICON_CARD_CONSUMERS)(
    "$name draws the fixed icon card in icon mode and a measured card in shape mode",
    async (consumer) => {
      const iconCard = frontendCard(await consumer.invoke("icon"));
      const shapeCard = frontendCard(await consumer.invoke("shape"));

      expect(iconCard).toEqual(ICON_CARD);
      expect(shapeCard).not.toEqual(ICON_CARD);
    },
  );
});
