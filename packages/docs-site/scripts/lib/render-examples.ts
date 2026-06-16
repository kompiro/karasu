// Render examples/ to per-view SVGs at build time (no committed SVGs). Uses
// core's compileProject so multi-file examples resolve their imports, and
// auto-selects the views that actually have content (system / deploy / org) so
// empty views are never shown. core stays node-free; the read-only FS adapter
// lives here (mirrors packages/cli/src/matrix.ts's NodeFileSystemProvider).

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  compileProject,
  type DiagramType,
  type DirEntry,
  type FileSystemProvider,
} from "../../../core/src/index.ts";
import { REPO_ROOT } from "../sources.ts";

/** Read-only Node filesystem for the import resolver. Writes are not needed. */
class ReadOnlyNodeFs implements FileSystemProvider {
  async readFile(p: string): Promise<string> {
    return readFile(p, "utf-8");
  }
  async readDir(p: string): Promise<DirEntry[]> {
    const entries = await readdir(p, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      kind: e.isDirectory() ? ("directory" as const) : ("file" as const),
    }));
  }
  async exists(p: string): Promise<boolean> {
    try {
      await stat(p);
      return true;
    } catch {
      return false;
    }
  }
  async writeFile(): Promise<void> {
    throw new Error("read-only");
  }
  async delete(): Promise<void> {
    throw new Error("read-only");
  }
  async mkdir(): Promise<void> {
    throw new Error("read-only");
  }
}

export interface RenderedView {
  type: DiagramType;
  svg: string;
}

export interface RenderedDiagram {
  /** repo-relative entry path, e.g. "examples/payment-platform/system.krs" */
  entry: string;
  /** the entry file's source (shown in a `krs` fence) */
  source: string;
  /** the non-empty views, in system → deploy → org order */
  views: RenderedView[];
}

/**
 * Render one example entry to its non-empty views. `compileProject` reports
 * `systems` / `hasDeployDiagram` / `hasOrgDiagram`, so we only render and emit
 * the views that have content.
 */
export async function renderDiagram(entryRelToRepo: string): Promise<RenderedDiagram> {
  const abs = path.join(REPO_ROOT, entryRelToRepo);
  const source = await readFile(abs, "utf-8");
  const fs = new ReadOnlyNodeFs();

  const system = await compileProject(abs, fs, { diagramType: "system", theme: "light" });
  // diagramType: "system" always yields a SystemCompileResult; narrow the union
  // so the system-only fields (systems / hasDeployDiagram / hasOrgDiagram) type.
  if (system.diagramType !== "system") {
    throw new Error(`${entryRelToRepo}: expected a system compile result`);
  }
  const errors = system.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `${entryRelToRepo}: failed to compile — ${errors.map((d) => d.code).join(", ")}`,
    );
  }

  const views: RenderedView[] = [];
  if (system.systems.length > 0) views.push({ type: "system", svg: system.svg });
  if (system.hasDeployDiagram) {
    const deploy = await compileProject(abs, fs, { diagramType: "deploy", theme: "light" });
    views.push({ type: "deploy", svg: deploy.svg });
  }
  if (system.hasOrgDiagram) {
    const org = await compileProject(abs, fs, { diagramType: "org", theme: "light" });
    views.push({ type: "org", svg: org.svg });
  }

  return { entry: entryRelToRepo, source, views };
}
