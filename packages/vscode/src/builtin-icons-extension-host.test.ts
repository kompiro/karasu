import { describe, it, expect } from "vitest";
import { InMemoryFileSystemProvider, compileProject } from "@karasu-tools/core";

// The extension host renders the preview through `compileProject` (see
// `preview-panel.ts`) and registers no icons of its own. Before #2802 that
// meant every `shape: url()` and icon display mode drew a plain box in the
// VS Code preview, while the browser app drew the icon (TPL-1001, TPL-2802).
// This fences the extension host's own compile path: importing core is enough.

/** A path only `icons/database.svg` draws — the cylinder's side wall. */
const DATABASE_PICTOGRAM = "M2 4v12c0 1.7 3.6 3 8 3s8-1.3 8-3V4";
/** A path only `icons/service.svg` draws — the gear's ring. */
const SERVICE_PICTOGRAM = "M10 0a10 10 0 0 1 4.5 1.1";

const ENTRY = "/project/index.krs";
const SHEET = "/project/theme.krs.style";

async function projectWith(style: string | undefined): Promise<InMemoryFileSystemProvider> {
  const fs = new InMemoryFileSystemProvider();
  const importLine = style === undefined ? "" : `@import "./theme.krs.style"\n\n`;
  await fs.writeFile(ENTRY, `${importLine}system Shop {\n  service Api\n}\n`);
  if (style !== undefined) await fs.writeFile(SHEET, style);
  return fs;
}

describe("built-in icons in the extension host's compile path (#2802)", () => {
  it('draws `shape: url("database")` without the extension registering anything', async () => {
    const fs = await projectWith(`service { shape: url("database"); }`);
    const result = await compileProject(ENTRY, fs, { diagramType: "system" });
    expect(result.svg).toContain(DATABASE_PICTOGRAM);
    expect(result.warnings.filter((w) => w.kind === "style-unknown-icon")).toEqual([]);
  });

  it("draws icon display mode (the ADR-299 toggle) with the built-in icons", async () => {
    const fs = await projectWith(undefined);
    const result = await compileProject(ENTRY, fs, { diagramType: "system", displayMode: "icon" });
    expect(result.svg).toContain(SERVICE_PICTOGRAM);
  });

  it("surfaces a style-unknown-icon warning for a typo, anchored on the sheet", async () => {
    const fs = await projectWith(`service {\n  shape: url("databse");\n}`);
    const result = await compileProject(ENTRY, fs, { diagramType: "system" });
    const warning = result.warnings.find((w) => w.kind === "style-unknown-icon");
    expect(warning?.params).toEqual({ property: "shape", name: "databse" });
    expect(warning?.loc?.file).toBe(SHEET);
    expect(warning?.loc?.start.line).toBe(2);
  });
});
