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
 * 2. For renderers that use the `svg-renderer` card-frame path (system
 *    drill-down, all-layers, all-views, project bundles), icon-mode
 *    SVG carries strictly more `<rect ` occurrences than shape-mode —
 *    the card-frame `<rect>` prepended only in icon mode for icon
 *    shapes. Renderers without this path (`buildAllLayersSvgOrg`,
 *    `buildDrillDownSvgOrg`) are flagged `expectsCardFrame: false` and
 *    rely on the bytes-differ assertion alone, since they exercise the
 *    org renderer which uses a different icon-mode footprint.
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
 * mode was silently dropped from Full View output. TPL-20260510-06
 * codified the "enumerate every surface" principle; this test
 * operationalizes that enumeration.
 *
 * See Issue #1247 and TPL-20260510-06.
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
   * Whether icon mode is expected to prepend extra `<rect>` card-frame
   * elements. True for renderers that go through `svg-renderer`'s
   * icon-shape branch (the system family). False for org-tree
   * renderers, which adjust icon-mode geometry without adding a
   * card-frame rect.
   */
  expectsCardFrame: boolean;
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
    expectsCardFrame: true,
    invoke: (mode) => {
      const result = compile(FIXTURE, { displayMode: mode, diagramType: "system" });
      return result.svg;
    },
  },
  {
    name: "compileProject (system)",
    expectsCardFrame: true,
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
    expectsCardFrame: true,
    invoke: (mode) => svgOrThrow(buildDrillDownSvg(FIXTURE, undefined, mode)),
  },
  {
    name: "buildAllLayersSvg",
    expectsCardFrame: true,
    invoke: (mode) => svgOrThrow(buildAllLayersSvg(FIXTURE, undefined, mode)),
  },
  {
    name: "buildAllLayersSvgOrg",
    expectsCardFrame: false,
    invoke: (mode) => svgOrThrow(buildAllLayersSvgOrg(FIXTURE, undefined, mode)),
  },
  {
    name: "buildDrillDownSvgOrg",
    expectsCardFrame: false,
    invoke: (mode) => svgOrThrow(buildDrillDownSvgOrg(FIXTURE, undefined, mode)),
  },
  {
    name: "buildAllViewsSvg",
    expectsCardFrame: true,
    invoke: (mode) => svgOrThrow(buildAllViewsSvg(FIXTURE, undefined, mode)),
  },
  {
    name: "buildAllViewsSvgProject",
    expectsCardFrame: true,
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

function countRects(svg: string): number {
  return (svg.match(/<rect /g) ?? []).length;
}

const CARD_FRAME_CONSUMERS = DISPLAY_MODE_CONSUMERS.filter((c) => c.expectsCardFrame);

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

  // Stronger assertion for renderers that go through svg-renderer's
  // icon-card path. The card-frame `<rect>` is prepended only in icon
  // mode for icon shapes (see svg-renderer.test.ts › "renders a border
  // rect before icon body in icon mode"). The fixture contains an
  // icon-themed service, so icon mode emits strictly more `<rect>`
  // elements than shape mode.
  //
  // Org renderers (buildAllLayersSvgOrg / buildDrillDownSvgOrg) follow
  // a different icon-mode footprint and are intentionally excluded —
  // they're still covered by the bytes-differ test above.
  it.each(CARD_FRAME_CONSUMERS)(
    "$name icon-mode SVG carries the icon card-frame rect marker",
    async (consumer) => {
      const iconSvg = await consumer.invoke("icon");
      const shapeSvg = await consumer.invoke("shape");

      expect(countRects(iconSvg)).toBeGreaterThan(countRects(shapeSvg));
    },
  );
});
