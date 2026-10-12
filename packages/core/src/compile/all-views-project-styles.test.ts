import { describe, it, expect } from "vitest";
import { buildAllViewsSvgProject, compileProject } from "./compile.js";
import { InMemoryFileSystemProvider } from "../fs/in-memory-provider.js";
import { buildDrawioProject } from "../exporter/drawio/build-drawio-project.js";
import type { Warning } from "../types/warnings.js";

/**
 * A project's `@import`ed `.krs.style` sheets on the bundled all-views path
 * (#3097).
 *
 * The CLI's default `karasu render` / `karasu check` go through
 * `buildAllViewsSvgProject`. It resolved the imports and then handed only the
 * model to the bundle builder, so the bundle was drawn in builtin styles and
 * the sheets were never validated, while `karasu render --view <x>`
 * (`compileProject`) applied and validated the same sheets. These tests hold
 * the two entry points to the same answer (TPL-219).
 */

const ENTRY_PATH = "/project/index.krs";
const STYLE_PATH = "/project/index.krs.style";

const MODEL = `@import "./index.krs.style"
system Shop {
  service Api {}
}
deploy Prod {
  oci web {
    realizes Api
  }
}
organization Acme {
  team Platform {}
}
`;

async function project(style: string, model = MODEL): Promise<InMemoryFileSystemProvider> {
  const fs = new InMemoryFileSystemProvider();
  await fs.writeFile(ENTRY_PATH, model);
  await fs.writeFile(STYLE_PATH, style);
  return fs;
}

/** Warnings the per-view compile and the bundle should agree on. */
function styleWarnings(warnings: readonly Warning[]): Warning[] {
  return warnings.filter((w) => w.kind.startsWith("style-"));
}

describe("buildAllViewsSvgProject applies the project's imported style sheets (#3097)", () => {
  it("draws with the imported sheet", async () => {
    const fs = await project("#Api { background-color: #ff00aa; }\n");
    const result = await buildAllViewsSvgProject(ENTRY_PATH, fs);
    expect(result.svg.toLowerCase()).toContain("#ff00aa");
  });

  it("applies a styleSource string after the imported sheets", async () => {
    const fs = await project("#Api { background-color: #ff00aa; }\n");
    const result = await buildAllViewsSvgProject(
      ENTRY_PATH,
      fs,
      "#Api { background-color: #00aaff; }\n",
    );
    const svg = result.svg.toLowerCase();
    expect(svg).toContain("#00aaff");
    expect(svg).not.toContain("#ff00aa");
  });

  it("validates the imported sheet, placing each finding in the style file", async () => {
    const fs = await project('#Api { colour: red; shape: url("no-such-icon"); }\n');
    const result = await buildAllViewsSvgProject(ENTRY_PATH, fs);
    const kinds = styleWarnings(result.warnings).map((w) => w.kind);
    expect(kinds).toContain("style-unknown-property");
    expect(kinds).toContain("style-unknown-icon");
    for (const w of styleWarnings(result.warnings)) {
      expect(w.loc?.file).toBe(STYLE_PATH);
    }
  });

  it("reports the style warnings `compileProject` reports for the system view", async () => {
    const fs = await project(
      "#Api { colour: red; column: middle; grid-columns: zero; background-color: #ff00aa; }\n",
    );
    const bundle = await buildAllViewsSvgProject(ENTRY_PATH, fs);
    const perView = await compileProject(ENTRY_PATH, fs, { diagramType: "system" });
    expect(styleWarnings(perView.warnings).length).toBeGreaterThan(0);
    expect(styleWarnings(bundle.warnings)).toEqual(styleWarnings(perView.warnings));
  });

  it("reports a style-resolution finding once, although every view resolves the node", async () => {
    const fs = await project("#Api { column: middle; }\n");
    const result = await buildAllViewsSvgProject(ENTRY_PATH, fs);
    const columnInvalid = result.warnings.filter((w) => w.kind === "style-column-invalid-value");
    expect(columnInvalid).toEqual([
      { kind: "style-column-invalid-value", params: { nodeId: "Api", value: "middle" } },
    ]);
  });

  it("reports what the deploy and org views ignore, as their own compiles do", async () => {
    const fs = await project("#web { column: left; }\n#Platform { column: left; }\n");
    const bundle = await buildAllViewsSvgProject(ENTRY_PATH, fs);
    const deploy = await compileProject(ENTRY_PATH, fs, { diagramType: "deploy" });
    const org = await compileProject(ENTRY_PATH, fs, { diagramType: "org" });
    const ignored = (ws: readonly Warning[]) =>
      ws.filter((w) => w.kind === "style-column-ignored-non-system-view");
    expect(ignored(bundle.warnings)).toEqual([
      ...ignored(deploy.warnings),
      ...ignored(org.warnings),
    ]);
    expect(ignored(bundle.warnings)).toHaveLength(2);
  });

  it("leaves the icon theme out of the checks, so icon mode warns as shape mode does", async () => {
    // The icon theme carries a `service { … }` rule. Analysed as a user sheet,
    // it would conflict with this one.
    const fs = await project("service { border-color: #ff00aa; }\n");
    const icon = await buildAllViewsSvgProject(ENTRY_PATH, fs, undefined, "icon");
    const shape = await buildAllViewsSvgProject(ENTRY_PATH, fs, undefined, "shape");
    expect(icon.warnings.filter((w) => w.kind === "style-conflict")).toEqual([]);
    expect(styleWarnings(icon.warnings)).toEqual(styleWarnings(shape.warnings));
  });

  it("keeps a finding per node when two nodes share an id, as the per-view compile does", async () => {
    const model = `@import "./index.krs.style"
system Shop {
  service Api {}
}
system Ops {
  service Api {}
}
`;
    const fs = await project("service { column: middle; }\n", model);
    const bundle = await buildAllViewsSvgProject(ENTRY_PATH, fs);
    const perView = await compileProject(ENTRY_PATH, fs, { diagramType: "system" });
    const columnInvalid = (ws: readonly Warning[]) =>
      ws.filter((w) => w.kind === "style-column-invalid-value");
    expect(columnInvalid(perView.warnings)).toHaveLength(2);
    expect(columnInvalid(bundle.warnings)).toEqual(columnInvalid(perView.warnings));
  });

  it("reports only the deploy block the bundle draws", async () => {
    const model = `${MODEL}deploy Staging {
  oci stgweb {
    realizes Api
  }
}
`;
    const fs = await project("#stgweb { column: left; }\n", model);
    const bundle = await buildAllViewsSvgProject(ENTRY_PATH, fs);
    const deploy = await compileProject(ENTRY_PATH, fs, { diagramType: "deploy" });
    expect(styleWarnings(deploy.warnings)).toEqual([]);
    expect(styleWarnings(bundle.warnings)).toEqual([]);
  });
});

describe("buildDrawioProject checks the project's imported style sheets (#3097)", () => {
  it("reports the sheet's value warnings, as the SVG render does", async () => {
    const fs = await project("#Api { colour: red; }\n");
    const drawio = await buildDrawioProject(ENTRY_PATH, fs);
    const unknown = drawio.warnings.filter((w) => w.kind === "style-unknown-property");
    expect(unknown).toHaveLength(1);
    expect(unknown[0].loc?.file).toBe(STYLE_PATH);
  });
});
