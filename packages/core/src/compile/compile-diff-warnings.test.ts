import { describe, it, expect } from "vitest";
import { InMemoryFileSystemProvider } from "../fs/in-memory-provider.js";
import type { Warning } from "../types/warnings.js";
import { compileProject } from "./compile.js";
import {
  buildAllViewsSvgDiffProject,
  compileDeployDiff,
  compileOrgDiff,
  compileSystemDiff,
} from "./compile-diff.js";

// #2879: `karasu diff` reported no resolver warnings because no diff result
// carried them. The diff now reports the after model's warnings, once per diff,
// collected by the same builder the per-view compile uses (TPL-219).

// Before carries a warning of its own (`Legacy` unassigned) that after removed,
// so a test can tell "after only" from "both sides".
const BEFORE = `system Shop {
  service Api {}
}
domain Legacy {}
`;

const AFTER = `@import "./after.krs.style"
system Shop {
  service Api {}
  service Web {}
}
domain Orphan {}
deploy Prod {
  container Main {
    unit ApiUnit realizes Api
  }
}
organization Acme {
  team Core {
    owns Api
  }
}
`;

const AFTER_STYLE = `#Api { shape: url("nope"); }
`;

async function project(): Promise<InMemoryFileSystemProvider> {
  const fs = new InMemoryFileSystemProvider();
  await fs.writeFile("/before.krs", BEFORE);
  await fs.writeFile("/after.krs", AFTER);
  await fs.writeFile("/after.krs.style", AFTER_STYLE);
  return fs;
}

const opts = (fs: InMemoryFileSystemProvider) =>
  ({ beforeEntryPath: "/before.krs", afterEntryPath: "/after.krs", fs }) as const;

const unassignedDomains = (warnings: Warning[]): string[] =>
  warnings.flatMap((w) => (w.kind === "unassigned-domain" ? [w.params.domainId] : []));

/**
 * The per-view compile also restates validator findings from `resolveStyles()`
 * without a position. The diff leaves those out by design (the validator
 * already reports them with one), so parity is checked without them.
 */
const RESOLVED_STYLE_RESTATEMENTS = new Set<Warning["kind"]>([
  "style-column-ignored-non-system-view",
]);

describe("diff warnings come from the after model only (#2879)", () => {
  it.each([
    ["system", compileSystemDiff],
    ["deploy", compileDeployDiff],
    ["org", compileOrgDiff],
  ] as const)("compile%sDiff reports after's warning and not before's", async (_view, fn) => {
    const result = await fn(opts(await project()));
    expect(unassignedDomains(result.warnings)).toEqual(["Orphan"]);
  });

  it("the bundled diff reports each warning once, not once per view", async () => {
    const result = await buildAllViewsSvgDiffProject(opts(await project()));
    // All three views apply to this model, so a per-view concatenation would
    // repeat the warning three times.
    expect(Object.keys(result.views).sort()).toEqual(["deploy", "org", "system"]);
    expect(unassignedDomains(result.warnings)).toEqual(["Orphan"]);
  });

  it.each(["system", "deploy", "org"] as const)(
    "the %s diff reports what the per-view compile of after reports",
    async (view) => {
      const fs = await project();
      const fns = { system: compileSystemDiff, deploy: compileDeployDiff, org: compileOrgDiff };
      const diff = await fns[view](opts(fs));
      const render = await compileProject("/after.krs", fs, { diagramType: view });
      expect(diff.warnings).toEqual(
        render.warnings.filter((w) => !RESOLVED_STYLE_RESTATEMENTS.has(w.kind)),
      );
    },
  );

  it("a warning from a sheet after imports keeps that sheet's file", async () => {
    const result = await compileSystemDiff(opts(await project()));
    const icon = result.warnings.find((w) => w.kind === "style-unknown-icon");
    expect(icon?.loc?.file).toBe("/after.krs.style");
  });

  it("does not validate before's style sheet", async () => {
    const fs = await project();
    await fs.writeFile("/before.krs", `@import "./before.krs.style"\n${BEFORE}`);
    await fs.writeFile("/before.krs.style", `#Api { shape: url("gone"); }\n`);
    const result = await compileSystemDiff(opts(fs));
    const icons = result.warnings.filter((w) => w.kind === "style-unknown-icon");
    expect(icons.map((w) => w.loc?.file)).toEqual(["/after.krs.style"]);
  });
});

describe("before and after resolve independently (#2879)", () => {
  it("reports each side's diagnostics once", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/before.krs", `system Shop {\n  service Api {}\n  service Api {}\n}\n`);
    await fs.writeFile("/after.krs", `system Shop {\n  service Web {}\n  service Web {}\n}\n`);
    const result = await compileSystemDiff(opts(fs));
    const duplicates = result.diagnostics.filter((d) => d.code === "duplicate-node-id-parent");
    expect(duplicates.map((d) => d.params)).toEqual([{ nodeId: "Api" }, { nodeId: "Web" }]);
  });

  it("lets both sides import the same style sheet without a circular-import report", async () => {
    // The typical git external-diff shape: two revisions of one file, both
    // importing the same sheet. A shared resolver dropped the sheet from the
    // side that reached it second and reported a cycle that does not exist.
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/shared.krs.style", `#Api { shape: url("nope"); }\n`);
    await fs.writeFile("/before.krs", `@import "./shared.krs.style"\n${BEFORE}`);
    await fs.writeFile(
      "/after.krs",
      `@import "./shared.krs.style"\nsystem Shop { service Api {} }\n`,
    );
    const result = await compileSystemDiff(opts(fs));
    expect(result.diagnostics.map((d) => d.code)).not.toContain("circular-style-import");
    // After kept its sheet, so the sheet's warning is reported.
    expect(result.warnings.some((w) => w.kind === "style-unknown-icon")).toBe(true);
  });
});
