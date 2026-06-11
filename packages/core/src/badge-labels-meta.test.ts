/**
 * Meta-test enumerating every public SVG-producing entry point that
 * consumes the `annotationBadgeLabels` argument (#1508). For each entry
 * the test invokes the default and an injected-ja variant against a
 * fixture containing an `@deprecated` service and asserts:
 *
 * 1. The default invocation renders the reference-data en label
 *    ("Deprecated") — the no-injection path is unchanged.
 * 2. The injected invocation renders the injected label and not the
 *    en default — the call site forwards `annotationBadgeLabels` into
 *    `getBuiltinStyleSheet` (cf. Issue #183 / TPL-20260510-06 for the
 *    silently-dropped-parameter failure mode, and TPL-20260510-11 for
 *    the parallel-family drift this table fences).
 *
 * **When you add a new SVG-producing entry point that takes
 * `annotationBadgeLabels` (or make an existing one take it), register
 * it in the `BADGE_LABEL_CONSUMERS` table below.** Mirrors
 * `theme-meta.test.ts`.
 *
 * Org-only surfaces (renderOrgTreeView) are not listed: annotation
 * badges render on system/deploy nodes, not on team/member cards.
 */
import { describe, it, expect } from "vitest";
import {
  buildAllLayersSvg,
  buildAllViewsSvg,
  buildAllViewsSvgProject,
  buildAllViewsSvgDiffProject,
  buildDrillDownSvg,
  compile,
  compileProject,
  compileSystemDiff,
  InMemoryFileSystemProvider,
  type AnnotationBadgeLabels,
} from "./index.js";

const FIXTURE = `system EC {
  service Legacy @deprecated {
    label "Legacy"
  }
  service Backend {
    label "Backend"
  }
}`;

const FIXTURE_AFTER = `system EC {
  service Legacy @deprecated {
    label "Legacy"
  }
  service Backend {
    label "Backend"
  }
  service Reporting {
    label "Reporting"
  }
}`;

const ENTRY_PATH = "/project/index.krs";
const BEFORE_PATH = "/project/before.krs";
const AFTER_PATH = "/project/after.krs";

const JA_LABELS: AnnotationBadgeLabels = { deprecated: "非推奨" };
const EN_DEFAULT = "Deprecated";

interface BadgeLabelConsumer {
  name: string;
  invoke: (labels: AnnotationBadgeLabels | undefined) => Promise<string> | string;
}

const BADGE_LABEL_CONSUMERS: BadgeLabelConsumer[] = [
  {
    name: "compile (system)",
    invoke: (labels) =>
      compile(FIXTURE, { diagramType: "system", annotationBadgeLabels: labels }).svg,
  },
  {
    name: "compileProject (system)",
    invoke: async (labels) => {
      const fs = new InMemoryFileSystemProvider();
      await fs.writeFile(ENTRY_PATH, FIXTURE);
      const result = await compileProject(ENTRY_PATH, fs, {
        diagramType: "system",
        annotationBadgeLabels: labels,
      });
      return result.svg;
    },
  },
  {
    name: "buildDrillDownSvg",
    invoke: (labels) =>
      buildDrillDownSvg(FIXTURE, undefined, undefined, undefined, undefined, labels).svg,
  },
  {
    name: "buildAllLayersSvg",
    invoke: (labels) =>
      buildAllLayersSvg(FIXTURE, undefined, undefined, undefined, undefined, labels).svg,
  },
  {
    name: "buildAllViewsSvg",
    invoke: (labels) =>
      buildAllViewsSvg(FIXTURE, undefined, undefined, undefined, undefined, labels).svg,
  },
  {
    name: "buildAllViewsSvgProject",
    invoke: async (labels) => {
      const fs = new InMemoryFileSystemProvider();
      await fs.writeFile(ENTRY_PATH, FIXTURE);
      const result = await buildAllViewsSvgProject(
        ENTRY_PATH,
        fs,
        undefined,
        undefined,
        undefined,
        labels,
      );
      return result.svg;
    },
  },
  {
    name: "compileSystemDiff",
    invoke: async (labels) => {
      const fs = new InMemoryFileSystemProvider();
      await fs.writeFile(BEFORE_PATH, FIXTURE);
      await fs.writeFile(AFTER_PATH, FIXTURE_AFTER);
      const result = await compileSystemDiff({
        beforeEntryPath: BEFORE_PATH,
        afterEntryPath: AFTER_PATH,
        fs,
        annotationBadgeLabels: labels,
      });
      return result.svg;
    },
  },
  {
    name: "buildAllViewsSvgDiffProject",
    invoke: async (labels) => {
      const fs = new InMemoryFileSystemProvider();
      await fs.writeFile(BEFORE_PATH, FIXTURE);
      await fs.writeFile(AFTER_PATH, FIXTURE_AFTER);
      const result = await buildAllViewsSvgDiffProject({
        beforeEntryPath: BEFORE_PATH,
        afterEntryPath: AFTER_PATH,
        fs,
        annotationBadgeLabels: labels,
      });
      return result.svg;
    },
  },
];

describe("meta: every badge-label-consuming SVG entry point threads annotationBadgeLabels", () => {
  it.each(BADGE_LABEL_CONSUMERS)("$name renders the en default without injection", async (c) => {
    const svg = await c.invoke(undefined);
    expect(svg).toContain(EN_DEFAULT);
    expect(svg).not.toContain("非推奨");
  });

  it.each(BADGE_LABEL_CONSUMERS)("$name renders the injected label instead", async (c) => {
    const svg = await c.invoke(JA_LABELS);
    expect(svg).toContain("非推奨");
    expect(svg).not.toContain(EN_DEFAULT);
  });
});
