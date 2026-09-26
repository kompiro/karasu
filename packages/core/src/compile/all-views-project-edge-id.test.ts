import { describe, it, expect } from "vitest";
import { buildAllViewsSvg, buildAllViewsSvgProject, compile } from "./compile.js";
import { InMemoryFileSystemProvider } from "../fs/in-memory-provider.js";

/**
 * `duplicate-edge-id` on the all-views paths (#2911).
 *
 * The per-view pipeline raises it project-wide. The CLI's project entry
 * (`buildAllViewsSvgProject`, behind the default `karasu render` and
 * `karasu check`) must raise it too, or `check` passes a file
 * `render --view system` rejects.
 *
 * The source-level `buildAllViewsSvg` deliberately does not: karasu-nest's
 * gallery and the app's share render call it, and treat the finding as the
 * author's quality call rather than a reason to refuse a document
 * (packages/nest/src/gallery/validate.ts). Both halves are pinned here so
 * neither moves without the other being decided.
 */

const DUPLICATE_EDGE_ID = `system S {
  service A {}
  service B {}
  service C {}
  A -> B "x" #e1
  A -> C "y" #e1
}
`;

const ENTRY_PATH = "/project/index.krs";

function duplicateEdgeIdErrors(diagnostics: readonly { code: string; severity: string }[]) {
  return diagnostics.filter((d) => d.code === "duplicate-edge-id" && d.severity === "error");
}

describe("duplicate-edge-id on the all-views paths (#2911)", () => {
  it("the per-view pipeline raises it", () => {
    const result = compile(DUPLICATE_EDGE_ID, { diagramType: "system" });
    expect(duplicateEdgeIdErrors(result.diagnostics)).toHaveLength(2);
  });

  it("buildAllViewsSvgProject raises it, agreeing with the per-view pipeline", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile(ENTRY_PATH, DUPLICATE_EDGE_ID);
    const result = await buildAllViewsSvgProject(ENTRY_PATH, fs);
    expect(duplicateEdgeIdErrors(result.diagnostics)).toHaveLength(2);
  });

  it("buildAllViewsSvg does not, keeping the gallery / share-render contract", () => {
    const result = buildAllViewsSvg(DUPLICATE_EDGE_ID);
    expect(duplicateEdgeIdErrors(result.diagnostics)).toHaveLength(0);
    expect(result.svg).toContain("<svg");
  });
});
