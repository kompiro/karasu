/**
 * Meta-test enumerating every public SVG-producing entry point that
 * consumes the `theme` argument (Issue #1479). For each entry the test
 * invokes both `"dark"` and `"light"` against a fixture covering
 * system + org + deploy content and asserts:
 *
 * 1. The dark invocation is byte-identical to the no-theme (default)
 *    invocation — the default theme is `"dark"`, so existing output
 *    and every SVG snapshot must stay unchanged.
 * 2. The SVG bytes differ between `"dark"` and `"light"` — the call
 *    site is forwarding `theme` to the renderer (chrome palette) and
 *    to the built-in `.krs.style` cascade. If the parameter were
 *    silently dropped (cf. Issue #183 for `displayMode`), both
 *    invocations would return identical bytes.
 *
 * The point of this test is **structural**: when a new SVG-producing
 * entry point is added (or an existing one starts consuming `theme`)
 * the author MUST register it in the `THEME_CONSUMERS` table below.
 * Adding such a function without threading `theme` will fail this test
 * as soon as it appears in the table; forgetting to add it to the
 * table is the failure mode this test cannot catch directly, so the
 * table sits in the test file with this loud comment so code review
 * surfaces the omission.
 *
 * This mirrors `displaymode-meta.test.ts` (per TPL-20260510-06): a
 * theme is a global switch that must reach EVERY rendering surface —
 * legend / breadcrumb / tab bar / org tree / diff / empty state, and
 * every alternate rendering path (drill-down, all-layers, bundled
 * all-views, diff bundles).
 *
 * See Issue #1479, docs/design/svg-diagram-theming.md and
 * TPL-20260510-06.
 */
import { describe, it, expect } from "vitest";
import {
  buildAllLayersSvg,
  buildAllLayersSvgOrg,
  buildAllViewsSvg,
  buildAllViewsSvgProject,
  buildAllViewsSvgDiffProject,
  buildDrillDownSvg,
  buildDrillDownSvgOrg,
  compile,
  compileProject,
  compileSystemDiff,
  compileDeployDiff,
  compileOrgDiff,
  renderOrgTreeView,
  InMemoryFileSystemProvider,
  type DiagramTheme,
  type OrgCompileResult,
  type SvgResult,
} from "./index.js";

// Fixture covers system + org + deploy content so every view family
// (and the bundled all-views path) produces non-empty SVG.
const FIXTURE = `system EC {
  service Frontend {
    label "Frontend"
  }
  service Backend {
    label "Backend"
  }
}
deploy prod {
  oci frontend-oci {
    realizes Frontend
  }
}
organization Acme {
  team Platform {
    label "Platform"
    member alice {
      label "Alice"
    }
  }
}`;

// A second fixture (one extra service) for the diff entry points.
const FIXTURE_AFTER = `system EC {
  service Frontend {
    label "Frontend"
  }
  service Backend {
    label "Backend"
  }
  service Reporting {
    label "Reporting"
  }
}
deploy prod {
  oci frontend-oci {
    realizes Frontend
  }
  oci reporting-oci {
    realizes Reporting
  }
}
organization Acme {
  team Platform {
    label "Platform"
    member alice {
      label "Alice"
    }
    member bob {
      label "Bob"
    }
  }
}`;

const ENTRY_PATH = "/project/index.krs";
const BEFORE_PATH = "/project/before.krs";
const AFTER_PATH = "/project/after.krs";

interface ThemeConsumer {
  name: string;
  /** Invoke the entry point with the given theme; pass `undefined` for the default path. */
  invoke: (theme: DiagramTheme | undefined) => Promise<string> | string;
}

/**
 * Curated table of every public SVG-producing entry point that takes a
 * `theme` argument.
 *
 * **When you add a new SVG-producing function to the public API (or
 * make an existing one theme-aware), add an entry here.** The test
 * below enumerates this table; a new entry point without registration
 * silently escapes the regression net.
 */
const THEME_CONSUMERS: ThemeConsumer[] = [
  {
    name: "compile (system)",
    invoke: (theme) => compile(FIXTURE, { diagramType: "system", theme }).svg,
  },
  {
    name: "compile (deploy)",
    invoke: (theme) => compile(FIXTURE, { diagramType: "deploy", theme }).svg,
  },
  {
    name: "compile (org)",
    invoke: (theme) => compile(FIXTURE, { diagramType: "org", theme }).svg,
  },
  {
    name: "compileProject (system)",
    invoke: async (theme) => {
      const fs = new InMemoryFileSystemProvider();
      await fs.writeFile(ENTRY_PATH, FIXTURE);
      const result = await compileProject(ENTRY_PATH, fs, { diagramType: "system", theme });
      return result.svg;
    },
  },
  {
    name: "compileProject (org)",
    invoke: async (theme) => {
      const fs = new InMemoryFileSystemProvider();
      await fs.writeFile(ENTRY_PATH, FIXTURE);
      const result = await compileProject(ENTRY_PATH, fs, { diagramType: "org", theme });
      return result.svg;
    },
  },
  {
    name: "buildDrillDownSvg",
    invoke: (theme) =>
      svgOrThrow(buildDrillDownSvg(FIXTURE, undefined, undefined, undefined, theme)),
  },
  {
    name: "buildAllLayersSvg",
    invoke: (theme) =>
      svgOrThrow(buildAllLayersSvg(FIXTURE, undefined, undefined, undefined, theme)),
  },
  {
    name: "buildAllLayersSvgOrg",
    invoke: (theme) =>
      svgOrThrow(buildAllLayersSvgOrg(FIXTURE, undefined, undefined, undefined, theme)),
  },
  {
    name: "buildDrillDownSvgOrg",
    invoke: (theme) =>
      svgOrThrow(buildDrillDownSvgOrg(FIXTURE, undefined, undefined, undefined, theme)),
  },
  {
    name: "buildAllViewsSvg",
    invoke: (theme) =>
      svgOrThrow(buildAllViewsSvg(FIXTURE, undefined, undefined, undefined, theme)),
  },
  {
    name: "buildAllViewsSvgProject",
    invoke: async (theme) => {
      const fs = new InMemoryFileSystemProvider();
      await fs.writeFile(ENTRY_PATH, FIXTURE);
      const result = await buildAllViewsSvgProject(ENTRY_PATH, fs, undefined, undefined, theme);
      return result.svg;
    },
  },
  {
    name: "compileSystemDiff",
    invoke: async (theme) => {
      const fs = new InMemoryFileSystemProvider();
      await fs.writeFile(BEFORE_PATH, FIXTURE);
      await fs.writeFile(AFTER_PATH, FIXTURE_AFTER);
      const result = await compileSystemDiff({
        beforeEntryPath: BEFORE_PATH,
        afterEntryPath: AFTER_PATH,
        fs,
        theme,
      });
      return result.svg;
    },
  },
  {
    name: "compileDeployDiff",
    invoke: async (theme) => {
      const fs = new InMemoryFileSystemProvider();
      await fs.writeFile(BEFORE_PATH, FIXTURE);
      await fs.writeFile(AFTER_PATH, FIXTURE_AFTER);
      const result = await compileDeployDiff({
        beforeEntryPath: BEFORE_PATH,
        afterEntryPath: AFTER_PATH,
        fs,
        theme,
      });
      return result.svg;
    },
  },
  {
    name: "compileOrgDiff",
    invoke: async (theme) => {
      const fs = new InMemoryFileSystemProvider();
      await fs.writeFile(BEFORE_PATH, FIXTURE);
      await fs.writeFile(AFTER_PATH, FIXTURE_AFTER);
      const result = await compileOrgDiff({
        beforeEntryPath: BEFORE_PATH,
        afterEntryPath: AFTER_PATH,
        fs,
        theme,
      });
      return result.svg;
    },
  },
  {
    // The org-tree view is reachable only via this entry point — no
    // high-level builder routes into it — so it must be registered
    // here explicitly (Issue #1479, cf. useOrgView in the app).
    name: "renderOrgTreeView",
    invoke: async (theme) => {
      const fs = new InMemoryFileSystemProvider();
      await fs.writeFile(ENTRY_PATH, FIXTURE);
      const result = (await compileProject(ENTRY_PATH, fs, {
        diagramType: "org",
      })) as OrgCompileResult;
      return renderOrgTreeView(result.organizations, new Set(), { theme });
    },
  },
  {
    name: "buildAllViewsSvgDiffProject",
    invoke: async (theme) => {
      const fs = new InMemoryFileSystemProvider();
      await fs.writeFile(BEFORE_PATH, FIXTURE);
      await fs.writeFile(AFTER_PATH, FIXTURE_AFTER);
      const result = await buildAllViewsSvgDiffProject({
        beforeEntryPath: BEFORE_PATH,
        afterEntryPath: AFTER_PATH,
        fs,
        theme,
      });
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

describe("meta: every theme-consuming SVG entry point threads theme", () => {
  it.each(THEME_CONSUMERS)(
    "$name default invocation is byte-identical to theme:'dark'",
    async (consumer) => {
      const defaultSvg = await consumer.invoke(undefined);
      const darkSvg = await consumer.invoke("dark");
      // Default theme is dark — existing output / snapshots must not move.
      expect(defaultSvg).toBe(darkSvg);
    },
  );

  it.each(THEME_CONSUMERS)("$name produces different SVG for dark vs light", async (consumer) => {
    const darkSvg = await consumer.invoke("dark");
    const lightSvg = await consumer.invoke("light");

    expect(darkSvg).not.toBe("");
    expect(lightSvg).not.toBe("");
    expect(darkSvg).not.toBe(lightSvg);
  });
});
