import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  compileDeployDiff,
  compileOrgDiff,
  compileSystemDiff,
  formatDiagnostic,
  formatWarning,
} from "@karasu-tools/core";
import type { DiagramType } from "@karasu-tools/core";
import { NodeFileSystemProvider } from "./render.js";

interface DiffOptions {
  output?: string;
  view?: DiagramType;
}

const STDIN_TOKEN = "-";

/**
 * Compile two `.krs` entry points and emit an SVG annotated with diff
 * state attributes. Either positional argument may be `-`, in which case
 * stdin is read and written to a tempfile co-located with the other
 * side's directory so relative `@import`s resolve consistently.
 *
 * Supports `--view system | deploy | org` (default: `system`). Unlike
 * `karasu render`, there is no bundled "all views" diff yet — that would
 * require composing three separate diff SVGs into a single document and
 * is tracked as follow-up work.
 */
export async function diff(
  beforeArg: string,
  afterArg: string,
  options: DiffOptions,
): Promise<void> {
  const view: DiagramType = options.view ?? "system";

  // Decide a stable directory for any temp files the stdin shim creates.
  // Co-locating the temp file with the *other* side's directory makes the
  // most common `git diff` use case (compare a working-tree file to a
  // committed revision) keep working: relative @imports in the stdin
  // content resolve against the same project root as the file argument.
  const sideADir = beforeArg === STDIN_TOKEN ? null : dirname(resolve(beforeArg));
  const sideBDir = afterArg === STDIN_TOKEN ? null : dirname(resolve(afterArg));
  const stdinAnchorDir = sideBDir ?? sideADir;

  let stdinTempDir: string | null = null;
  let beforeAbs: string;
  let afterAbs: string;
  try {
    if (beforeArg === STDIN_TOKEN && afterArg === STDIN_TOKEN) {
      process.stderr.write(`Error: cannot use - for both sides of the diff\n`);
      process.exit(1);
    }
    if (beforeArg === STDIN_TOKEN) {
      stdinTempDir = await mkdtemp(join(stdinAnchorDir ?? tmpdir(), ".karasu-diff-"));
      beforeAbs = await materializeStdin(stdinTempDir, "before.krs");
      afterAbs = resolve(afterArg);
    } else if (afterArg === STDIN_TOKEN) {
      stdinTempDir = await mkdtemp(join(stdinAnchorDir ?? tmpdir(), ".karasu-diff-"));
      beforeAbs = resolve(beforeArg);
      afterAbs = await materializeStdin(stdinTempDir, "after.krs");
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

    for (const d of errors) {
      const loc = d.loc ? `${d.loc.start.line + 1}:${d.loc.start.column + 1}` : "";
      process.stderr.write(`Error: ${loc} ${formatDiagnostic(d)}\n`);
    }
    for (const d of diagWarnings) {
      const loc = d.loc ? `${d.loc.start.line + 1}:${d.loc.start.column + 1}` : "";
      process.stderr.write(`Warning: ${loc} ${formatDiagnostic(d)}\n`);
    }
    for (const w of result.warnings ?? []) {
      process.stderr.write(`Warning: ${formatWarning(w).message}\n`);
    }

    if (errors.length > 0) {
      process.exit(1);
    }

    if (options.output) {
      await writeFile(resolve(options.output), result.svg, "utf-8");
    } else {
      process.stdout.write(result.svg);
    }
  } finally {
    if (stdinTempDir) {
      await rm(stdinTempDir, { recursive: true, force: true });
    }
  }
}

interface DiffCompileResult {
  svg: string;
  diagnostics: import("@karasu-tools/core").Diagnostic[];
  warnings?: import("@karasu-tools/core").Warning[];
}

async function compileFor(
  view: DiagramType,
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
  }
}

async function materializeStdin(dir: string, basename: string): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const target = join(dir, basename);
  await writeFile(target, Buffer.concat(chunks));
  return target;
}
