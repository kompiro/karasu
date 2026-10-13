import { randomBytes } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  buildAllViewsSvgDiffProject,
  compileDeployDiff,
  compileOrgDiff,
  compileSystemDiff,
} from "@karasu-tools/core";
import type { DiagramType } from "@karasu-tools/core";
import { formatDiagnostic } from "./i18n.js";
import { NodeFileSystemProvider } from "./node-fs.js";
import { writeOutput } from "./output.js";
import { reportWarnings } from "./report-diagnostics.js";

interface DiffOptions {
  output?: string;
  /** When omitted, emits a bundled all-views SVG. */
  view?: DiagramType;
}

const STDIN_TOKEN = "-";

/**
 * Compile two `.krs` entry points and emit an SVG annotated with diff
 * state attributes. Either positional argument may be `-`, in which case
 * stdin is read and written to a tempfile directly in the other side's
 * directory so relative imports resolve consistently.
 *
 * Supports `--view system | deploy | org` for single-view output. When
 * `--view` is omitted, emits a bundled SVG that contains all applicable
 * views with CSS-only tab navigation (mirrors `karasu render` behavior).
 */
export async function diff(
  beforeArg: string,
  afterArg: string,
  options: DiffOptions,
): Promise<void> {
  const view: DiagramType | undefined = options.view;

  let stdinTempFile: string | null = null;
  let beforeAbs: string;
  let afterAbs: string;
  try {
    if (beforeArg === STDIN_TOKEN && afterArg === STDIN_TOKEN) {
      process.stderr.write(`Error: cannot use - for both sides of the diff\n`);
      process.exit(1);
    }
    // The stdin side is written next to the *other* side's file, so the most
    // common `git diff` use case (compare a working-tree file to a committed
    // revision) keeps working: a relative import in the stdin content resolves
    // against the same directory as the file argument. A subdirectory would
    // shift every `./` import one level down (#3122).
    if (beforeArg === STDIN_TOKEN) {
      afterAbs = resolve(afterArg);
      stdinTempFile = await materializeStdin(dirname(afterAbs), "before");
      beforeAbs = stdinTempFile;
    } else if (afterArg === STDIN_TOKEN) {
      beforeAbs = resolve(beforeArg);
      stdinTempFile = await materializeStdin(dirname(beforeAbs), "after");
      afterAbs = stdinTempFile;
    } else {
      beforeAbs = resolve(beforeArg);
      afterAbs = resolve(afterArg);
    }

    const fs = new NodeFileSystemProvider();
    for (const [label, p] of [
      ["before", beforeAbs],
      ["after", afterAbs],
    ] as const) {
      if (!(await fs.exists(p))) {
        process.stderr.write(`Error: ${label} file not found: ${p}\n`);
        process.exit(1);
      }
    }

    const result = await compileFor(view, beforeAbs, afterAbs, fs);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    const diagWarnings = result.diagnostics.filter((d) => d.severity === "warning");

    // Core positions are 1-based already; print them as they are (#2715).
    for (const d of errors) {
      const loc = d.loc ? `${d.loc.start.line}:${d.loc.start.column}` : "";
      process.stderr.write(`Error: ${loc} ${formatDiagnostic(d)}\n`);
    }
    for (const d of diagWarnings) {
      const loc = d.loc ? `${d.loc.start.line}:${d.loc.start.column}` : "";
      process.stderr.write(`Warning: ${loc} ${formatDiagnostic(d)}\n`);
    }
    // Warnings are the after model's, once per diff (#2879), so they can name
    // their file the way `render` does: the after entry as the user typed it
    // (`-` for stdin), any file it imports by its own path.
    reportWarnings(afterAbs, result.warnings, afterArg);

    if (errors.length > 0) {
      process.exit(1);
    }

    await writeOutput(result.svg, options.output);
  } finally {
    if (stdinTempFile) {
      await rm(stdinTempFile, { force: true });
    }
  }
}

interface DiffCompileResult {
  svg: string;
  diagnostics: import("@karasu-tools/core").Diagnostic[];
  warnings: import("@karasu-tools/core").Warning[];
}

async function compileFor(
  view: DiagramType | undefined,
  beforeEntryPath: string,
  afterEntryPath: string,
  fs: import("@karasu-tools/core").FileSystemProvider,
): Promise<DiffCompileResult> {
  const opts = { beforeEntryPath, afterEntryPath, fs } as const;
  switch (view) {
    case "system":
      return compileSystemDiff(opts);
    case "deploy":
      return compileDeployDiff(opts);
    case "org":
      return compileOrgDiff(opts);
    case undefined: {
      const result = await buildAllViewsSvgDiffProject(opts);
      return { svg: result.svg, diagnostics: result.diagnostics, warnings: result.warnings };
    }
  }
}

/**
 * Write stdin to a hidden file in `dir`. The random part keeps parallel runs
 * apart, and the exclusive flag refuses to overwrite a file already there.
 */
async function materializeStdin(dir: string, side: "before" | "after"): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const target = join(dir, `.karasu-diff-${randomBytes(6).toString("hex")}-${side}.krs`);
  await writeFile(target, Buffer.concat(chunks), { flag: "wx" });
  return target;
}
