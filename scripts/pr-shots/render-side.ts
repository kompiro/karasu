// One side of the before/after (Issue #3359): a checkout's own `packages/core`
// rendering the candidates. HEAD's side is this tree; the base's side is the
// same module loaded from the merge-base worktree, so the two differ only in
// what the branch changed.
//
// The base's core is called with the `compile` / `compileProject` signature
// this script knows. A PR that changes that signature makes the base fail to
// render, which is reported as a failure, never drawn as a wrong picture.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { NodeFileSystemProvider } from "../../packages/cli/src/node-fs.ts";
import type { Candidate, View } from "./candidates.ts";

export type Rendered =
  /** `empty`: the view has nothing to draw (no `deploy` / no `organization`). */
  { ok: true; svg: string; empty: boolean } | { ok: false; reason: string };

export interface Side {
  render(candidate: Candidate, view: View): Promise<Rendered>;
}

interface CompileOutput {
  svg: string;
  diagnostics: readonly { severity: string; code: string }[];
  deployBlocks?: readonly unknown[];
  organizations?: readonly unknown[];
}

interface CompileOptions {
  diagramType: View;
  theme: "light";
}

/** The slice of `packages/core/src/index.ts` a side calls. */
export interface CoreModule {
  compile(source: string, options: CompileOptions): CompileOutput;
  compileProject(
    entryPath: string,
    fs: NodeFileSystemProvider,
    options: CompileOptions,
  ): Promise<CompileOutput>;
}

/** Loads the core of the checkout at `root` from its sources. */
export async function loadCore(root: string): Promise<CoreModule> {
  const entry = join(root, "packages/core/src/index.ts");
  return (await import(pathToFileURL(entry).href)) as CoreModule;
}

function isEmpty(view: View, output: CompileOutput): boolean {
  if (view === "deploy") return (output.deployBlocks?.length ?? 0) === 0;
  if (view === "org") return (output.organizations?.length ?? 0) === 0;
  return false;
}

/**
 * A side backed by `core`. Fences and `--file` inputs are HEAD's text on both
 * sides; an example is read from `root`, so a PR that edits an example shows
 * that edit too. Light theme only (the design's open question settles on it).
 */
export function coreSide(core: CoreModule, root: string): Side {
  const fs = new NodeFileSystemProvider();
  return {
    async render(candidate, view) {
      const options: CompileOptions = { diagramType: view, theme: "light" };
      try {
        let output: CompileOutput;
        if (candidate.kind === "fence") {
          output = core.compile(candidate.source, options);
        } else {
          const path = candidate.kind === "file" ? candidate.path : join(root, candidate.relPath);
          if (!existsSync(path)) return { ok: false, reason: "the file does not exist there" };
          output = await core.compileProject(path, fs, options);
        }
        const errors = output.diagnostics.filter((d) => d.severity === "error");
        if (errors.length > 0) {
          const codes = [...new Set(errors.map((d) => d.code))].join(", ");
          return { ok: false, reason: `error diagnostics: ${codes}` };
        }
        return { ok: true, svg: output.svg, empty: isEmpty(view, output) };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, reason: `threw: ${message.split("\n")[0]}` };
      }
    },
  };
}
