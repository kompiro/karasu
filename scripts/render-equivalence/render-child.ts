/* eslint-disable no-console -- child-process entry point; errors go to the parent through stderr */
// One side of `Render equivalence` (Issue #3509, #3505 slice B), run in its
// own process: loads the core and i18n of the checkout at `--root` and writes
// every outcome for the manifest's inputs to `--out`.
//
// Each side gets its own process so the HEAD side's code cannot reach the
// comparison: a PR's core that patched a global, `fs` or `process.exit` would
// only change its own side's output, which the parent then compares. The
// parent reads this side's file before it starts the other side.
//
// The views are the ones #3502 compared by hand: the root of each view, each
// system and each one-level drill-down, ungrouped and grouped by team and
// boundary. The light theme throughout, plus the dark root, since the dark
// builtin sheet is part of what `style/` and `default-style.ts` produce.
//
// This file calls the core through the signatures it knows. A PR that changes
// one makes its side fail, which is reported as a difference, never compared
// as a wrong picture.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { NodeFileSystemProvider } from "../../packages/cli/src/node-fs.ts";
import { firstLine, type Outcome, type SideOutput } from "./compare.ts";
import type { Entry, Manifest } from "./inputs.ts";

type Grouping = undefined | "team" | "boundary";
const GROUPINGS: readonly Grouping[] = [undefined, "team", "boundary"];

interface TreeNode {
  id: string;
  children: readonly TreeNode[];
}

interface CompileOutput {
  svg: string;
  diagnostics: readonly unknown[];
  warnings: readonly unknown[];
  systems?: readonly TreeNode[];
}

interface CompileOptions {
  diagramType: "system" | "deploy" | "org";
  theme: "light" | "dark";
  viewPath?: string[];
  groupBy?: "team" | "boundary";
}

/** The slice of `packages/core/src/index.ts` this side calls. */
interface CoreModule {
  compile(source: string, options: CompileOptions): CompileOutput;
  compileProject(
    path: string,
    fs: NodeFileSystemProvider,
    options: CompileOptions,
  ): Promise<CompileOutput>;
  format(source: string): string;
  tidyStyleSheet(source: string): { output: string; diagnostics: readonly unknown[] };
  extractCrudMatrix(systems: readonly TreeNode[]): unknown;
  renderMatrixAsSvg(matrix: unknown): string;
}

/** The slice of `packages/i18n/src/index.ts` that turns a diagnostic into its message. */
interface I18nModule {
  bindTranslate(locale: "en"): unknown;
  renderDiagnostic(diagnostic: unknown, t: unknown): string;
  renderWarning(warning: unknown, t: unknown): unknown;
}

function digest(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** JSON with object keys sorted, so a refactor that builds an object in another order is equal. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v === null || typeof v !== "object" || Array.isArray(v)) return v;
    return Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  });
}

function errorOutcome(error: unknown): Outcome {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return { ok: false, error: firstLine(message) };
}

function describeView(type: string, path: readonly string[], grouping: Grouping, dark = false) {
  const scope = [type, ...path].join(" / ");
  return `${scope}${grouping === undefined ? "" : ` [${grouping}]`}${dark ? " (dark)" : ""}`;
}

export async function renderSide(root: string, manifest: Manifest): Promise<SideOutput> {
  const core = (await import(
    pathToFileURL(join(root, "packages/core/src/index.ts")).href
  )) as CoreModule;
  const i18n = (await import(
    pathToFileURL(join(root, "packages/i18n/src/index.ts")).href
  )) as I18nModule;
  const t = i18n.bindTranslate("en");
  const fs = new NodeFileSystemProvider();
  const out: SideOutput = {};

  // Message and structure: the message is what a user reads, the structure
  // (code, location, params) what tools read.
  const lines = (diagnostics: readonly unknown[], warnings: readonly unknown[]): string[] => [
    ...diagnostics.map((d) => `${i18n.renderDiagnostic(d, t)} ${canonicalJson(d)}`),
    ...warnings.map((w) => `${canonicalJson(i18n.renderWarning(w, t))} ${canonicalJson(w)}`),
  ];

  const compileEntry = (entry: Entry, options: CompileOptions) =>
    entry.kind === "fence"
      ? Promise.resolve(core.compile(entry.source, options))
      : core.compileProject(entry.path, fs, options);

  for (const entry of manifest.entries) {
    let systems: readonly TreeNode[] = [];
    const render = async (key: string, options: CompileOptions) => {
      try {
        const result = await compileEntry(entry, options);
        out[`render ${entry.name} :: ${key}`] = {
          ok: true,
          output: digest(result.svg),
          diagnostics: lines(result.diagnostics, result.warnings),
        };
        return result;
      } catch (error) {
        out[`render ${entry.name} :: ${key}`] = errorOutcome(error);
        return undefined;
      }
    };

    for (const groupBy of GROUPINGS) {
      const result = await render(describeView("system", [], groupBy), {
        diagramType: "system",
        theme: "light",
        groupBy,
      });
      if (groupBy === undefined) systems = result?.systems ?? [];
    }
    await render(describeView("system", [], undefined, true), {
      diagramType: "system",
      theme: "dark",
    });
    await render("deploy", { diagramType: "deploy", theme: "light" });
    await render("org", { diagramType: "org", theme: "light" });

    const paths = systems.flatMap((system) => [
      [system.id],
      ...system.children
        .filter((child) => child.children.length > 0)
        .map((child) => [system.id, child.id]),
    ]);
    for (const viewPath of paths) {
      for (const groupBy of GROUPINGS) {
        await render(describeView("system", viewPath, groupBy), {
          diagramType: "system",
          theme: "light",
          viewPath,
          groupBy,
        });
      }
    }

    try {
      const svg = core.renderMatrixAsSvg(core.extractCrudMatrix(systems));
      out[`render ${entry.name} :: matrix`] = { ok: true, output: digest(svg), diagnostics: [] };
    } catch (error) {
      out[`render ${entry.name} :: matrix`] = errorOutcome(error);
    }
  }

  for (const file of manifest.krs) {
    try {
      out[`format ${file.name}`] = {
        ok: true,
        output: digest(core.format(file.source)),
        diagnostics: [],
      };
    } catch (error) {
      out[`format ${file.name}`] = errorOutcome(error);
    }
  }
  for (const sheet of manifest.styles) {
    try {
      const result = core.tidyStyleSheet(sheet.source);
      out[`tidy ${sheet.name}`] = {
        ok: true,
        output: digest(result.output),
        diagnostics: lines(result.diagnostics, []),
      };
    } catch (error) {
      out[`tidy ${sheet.name}`] = errorOutcome(error);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      root: { type: "string" },
      manifest: { type: "string" },
      out: { type: "string" },
    },
  });
  if (!values.root || !values.manifest || !values.out) {
    throw new Error("render-child: --root, --manifest and --out are required");
  }
  const manifest = JSON.parse(readFileSync(values.manifest, "utf8")) as Manifest;
  writeFileSync(values.out, JSON.stringify(await renderSide(values.root, manifest)));
}

// Imported by the tests for `renderSide`; run as a script by `run.ts`.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exit(1);
  });
}
