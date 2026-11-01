// Generate `packages/core/src/builtins/examples.generated.ts` from the
// registered directories under `examples/` (Issue #3345).
//
// `examples/` stays the source of truth (ADR-1642): the docs-site gallery
// renders it and people open it as files. The built-in projects that seed
// ProjectMode and the reference Samples tab (ADR-9018, ADR-1344, ADR-1296)
// are a copy of some of those directories, shipped as TypeScript constants so
// every host gets them without a bundler-specific loader. This script writes
// that copy, so it can no longer be edited out of step with `examples/`.
//
// Run `pnpm gen:examples` to (re)write the module; `pnpm gen:examples --check`
// exits non-zero when the committed module is stale.
// `gen-builtin-examples.test.ts` mirrors that check in CI, and lefthook runs it
// on push.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const EXAMPLES_DIR = "examples";
export const OUTPUT_FILE = "packages/core/src/builtins/examples.generated.ts";

/**
 * How a registered directory becomes built-in projects.
 *
 * - `flat`: one project named after the directory, holding every `.krs` and
 *   `.krs.style` file directly inside it. A subdirectory is an error.
 * - `staged`: one project per stage. A top-level `.krs` file is a stage of its
 *   own, bundled as `index.krs`; a subdirectory is a multi-file stage whose
 *   entry (`system.krs` or `main.krs`, exactly one) is renamed to `index.krs`.
 */
export type Layout = "flat" | "staged";

export interface RegisteredExample {
  /** The exported constant name. Part of the `@karasu-tools/core` API. */
  readonly constant: string;
  /** Directory under `examples/`. */
  readonly dir: string;
  readonly layout: Layout;
  /** JSDoc for the constant: who seeds it and why. */
  readonly doc: string;
}

/**
 * The only list of registered directories. A directory not listed here is
 * not bundled, and editing it never touches the generated module.
 */
export const REGISTERED_EXAMPLES: readonly RegisteredExample[] = [
  {
    constant: "GETTING_STARTED_PROJECT",
    dir: "ja/getting-started",
    layout: "flat",
    doc: "The first project ProjectMode creates for `ja` users.",
  },
  {
    constant: "GETTING_STARTED_PROJECT_EN",
    dir: "en/getting-started",
    layout: "flat",
    doc: "English variant of GETTING_STARTED_PROJECT, seeded for non-`ja` locales.",
  },
  {
    constant: "DEPLOY_ONLY_PROJECT",
    dir: "ja/deploy-only",
    layout: "flat",
    doc: "Starter for the deploy view in the reference window's Samples tab (#1548, ADR-1296).",
  },
  {
    constant: "DEPLOY_ONLY_PROJECT_EN",
    dir: "en/deploy-only",
    layout: "flat",
    doc: "English variant of DEPLOY_ONLY_PROJECT, served for non-`ja` locales (#1642).",
  },
  {
    constant: "ORG_ONLY_PROJECT",
    dir: "ja/org-only",
    layout: "flat",
    doc: "Starter for the org view in the reference window's Samples tab (#1548, ADR-1296).",
  },
  {
    constant: "ORG_ONLY_PROJECT_EN",
    dir: "en/org-only",
    layout: "flat",
    doc: "English variant of ORG_ONLY_PROJECT, served for non-`ja` locales (#1642).",
  },
  {
    constant: "CLIENT_MCP_PROJECT",
    dir: "en/client-mcp",
    layout: "flat",
    doc: "A system with client nodes, including an MCP client.",
  },
  {
    constant: "EC_PLATFORM_PROJECTS",
    dir: "ja/ec-platform",
    layout: "staged",
    doc: "The step-by-step tutorial, one project per stage. The first stage is opened first.",
  },
  {
    constant: "EC_PLATFORM_PROJECTS_EN",
    dir: "en/ec-platform",
    layout: "staged",
    doc: "English variant of EC_PLATFORM_PROJECTS, seeded for non-`ja` locales (#1777).",
  },
  {
    constant: "FEATURE_SAMPLES_PROJECT",
    dir: "en/feature-samples",
    layout: "flat",
    doc: "One file per syntax feature, catalogued by its `index.krs` (ADR-1344).",
  },
  {
    constant: "FACET_STYLING_PROJECT",
    dir: "ja/facet-styling",
    layout: "flat",
    doc: "Styling by facet. The `.krs.style` sheet is the subject of the sample.",
  },
  {
    constant: "FACET_STYLING_PROJECT_EN",
    dir: "en/facet-styling",
    layout: "flat",
    doc: "English variant of FACET_STYLING_PROJECT.",
  },
  {
    constant: "MULTI_FILE_SYSTEM_PROJECT",
    dir: "ja/multi-file-system",
    layout: "flat",
    doc: "One system split across several files with `@import`.",
  },
  {
    constant: "MULTI_FILE_SYSTEM_PROJECT_EN",
    dir: "en/multi-file-system",
    layout: "flat",
    doc: "English variant of MULTI_FILE_SYSTEM_PROJECT, seeded for non-`ja` locales (#1642).",
  },
];

/** Entry files of a multi-file stage, renamed to `index.krs` when bundled (#1777). */
const STAGE_ENTRIES = ["system.krs", "main.krs"];

export interface ExampleFile {
  path: string;
  content: string;
}

export interface ExampleProject {
  name: string;
  files: ExampleFile[];
}

export interface GeneratedExample {
  readonly entry: RegisteredExample;
  /** One project for `flat`, one per stage for `staged`. */
  readonly projects: ExampleProject[];
}

export interface RegenerateResult {
  /** `[OUTPUT_FILE]` when the committed module does not match a fresh render. */
  stale: string[];
  /** `[OUTPUT_FILE]` when this run rewrote it. Empty under `check`. */
  updated: string[];
}

/** Code point order, so the output does not depend on the machine's locale. */
function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isBundled(name: string): boolean {
  return name.endsWith(".krs") || name.endsWith(".krs.style");
}

/** `index.krs` first, then the rest in code point order. */
function sortFiles(files: ExampleFile[]): ExampleFile[] {
  return files.sort((a, b) =>
    a.path === "index.krs" ? -1 : b.path === "index.krs" ? 1 : byCodePoint(a.path, b.path),
  );
}

function readFlat(absDir: string, dir: string): ExampleProject {
  const entries = readdirSync(absDir, { withFileTypes: true });
  const nested = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  if (nested.length > 0) {
    throw new Error(
      `examples/${dir} is registered as flat but has subdirectories (${nested.join(", ")}). ` +
        "Move the files up, or register the directory as staged.",
    );
  }
  const files = entries
    .filter((e) => e.isFile() && isBundled(e.name))
    .map((e) => ({ path: e.name, content: readFileSync(resolve(absDir, e.name), "utf8") }));
  if (files.length === 0) throw new Error(`examples/${dir} has no .krs files to bundle.`);
  return { name: dir.split("/").at(-1)!, files: sortFiles(files) };
}

function readStage(absDir: string, dir: string, stage: string): ExampleProject {
  const entries = readdirSync(resolve(absDir, stage), { withFileTypes: true });
  const nested = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  if (nested.length > 0) {
    throw new Error(`examples/${dir}/${stage} is a stage and cannot nest (${nested.join(", ")}).`);
  }
  const names = entries.filter((e) => e.isFile() && isBundled(e.name)).map((e) => e.name);
  const found = STAGE_ENTRIES.filter((n) => names.includes(n));
  if (found.length !== 1) {
    throw new Error(
      `examples/${dir}/${stage} needs exactly one entry file (${STAGE_ENTRIES.join(" or ")}), ` +
        `found ${found.length === 0 ? "none" : found.join(" and ")}.`,
    );
  }
  const files = names.map((n) => ({
    path: n === found[0] ? "index.krs" : n,
    content: readFileSync(resolve(absDir, stage, n), "utf8"),
  }));
  return { name: stage, files: sortFiles(files) };
}

function readStaged(absDir: string, dir: string): ExampleProject[] {
  const entries = readdirSync(absDir, { withFileTypes: true });
  const projects: ExampleProject[] = [];
  for (const e of entries) {
    if (e.isDirectory()) {
      projects.push(readStage(absDir, dir, e.name));
    } else if (e.isFile() && e.name.endsWith(".krs")) {
      const content = readFileSync(resolve(absDir, e.name), "utf8");
      projects.push({
        name: e.name.slice(0, -".krs".length),
        files: [{ path: "index.krs", content }],
      });
    }
  }
  if (projects.length === 0) throw new Error(`examples/${dir} has no stages to bundle.`);
  return projects.sort((a, b) => byCodePoint(a.name, b.name));
}

/** Read every registered directory into the projects it bundles. */
export function readRegisteredExamples(
  repoRoot: string,
  registry: readonly RegisteredExample[] = REGISTERED_EXAMPLES,
): GeneratedExample[] {
  return registry.map((entry) => {
    const absDir = resolve(repoRoot, EXAMPLES_DIR, entry.dir);
    const projects =
      entry.layout === "flat" ? [readFlat(absDir, entry.dir)] : readStaged(absDir, entry.dir);
    return { entry, projects };
  });
}

/** A template literal holding `text` verbatim. */
function templateLiteral(text: string): string {
  return "`" + text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${") + "`";
}

function indent(depth: number): string {
  return "  ".repeat(depth);
}

/** A project object literal whose opening brace sits at `depth`. */
function renderProject(project: ExampleProject, depth: number): string {
  const files = project.files
    .map(
      (f) =>
        `${indent(depth + 2)}{\n` +
        `${indent(depth + 3)}path: ${JSON.stringify(f.path)},\n` +
        `${indent(depth + 3)}content: ${templateLiteral(f.content)},\n` +
        `${indent(depth + 2)}},\n`,
    )
    .join("");
  return (
    `{\n` +
    `${indent(depth + 1)}name: ${JSON.stringify(project.name)},\n` +
    `${indent(depth + 1)}files: [\n` +
    files +
    `${indent(depth + 1)}],\n` +
    `${indent(depth)}}`
  );
}

function renderConstant({ entry, projects }: GeneratedExample): string {
  const doc = `/** ${entry.doc} Source: \`examples/${entry.dir}/\`. */\n`;
  if (entry.layout === "flat") {
    return `${doc}export const ${entry.constant}: ExampleProject = ${renderProject(projects[0]!, 0)};\n`;
  }
  const items = projects.map((p) => `${indent(1)}${renderProject(p, 1)},\n`).join("");
  return `${doc}export const ${entry.constant}: ExampleProject[] = [\n${items}];\n`;
}

/**
 * The module text for a given set of examples. Pure, so the drift test can
 * render a fresh copy and compare bytes.
 */
export function renderModule(examples: readonly GeneratedExample[]): string {
  return `// GENERATED FILE — do not edit by hand.
//
// Source of truth: the directories under \`examples/\` registered in
// \`scripts/examples/gen-builtin-examples.ts\`. Edit the example, then run
// \`pnpm gen:examples\` and commit both. \`pnpm gen:examples --check\` and
// \`scripts/examples/gen-builtin-examples.test.ts\` fail when this file is stale.

export type ExampleProject = {
  /** Project name shown in the project selector */
  name: string;
  /** Files to write into the project root. Paths are relative to rootPath. */
  files: { path: string; content: string }[];
};

${examples.map(renderConstant).join("\n")}`;
}

export function regenerate(opts: { root: string; check: boolean }): RegenerateResult {
  const expected = renderModule(readRegisteredExamples(opts.root));
  const outPath = resolve(opts.root, OUTPUT_FILE);
  const before = existingText(outPath);
  if (before === expected) return { stale: [], updated: [] };
  if (opts.check) return { stale: [OUTPUT_FILE], updated: [] };
  writeFileSync(outPath, expected);
  return { stale: [OUTPUT_FILE], updated: [OUTPUT_FILE] };
}

/** The committed module, or `null` when it has never been generated. */
function existingText(outPath: string): string | null {
  try {
    return readFileSync(outPath, "utf8");
  } catch {
    return null;
  }
}

function main(): void {
  const check = process.argv.includes("--check");
  const { stale, updated } = regenerate({ root: process.cwd(), check });
  if (check) {
    if (stale.length > 0) {
      process.stderr.write(`Stale generated module: ${OUTPUT_FILE}\n`);
      process.stderr.write("Run `pnpm gen:examples` and commit the result.\n");
      process.exitCode = 1;
    }
    return;
  }
  process.stdout.write(
    updated.length > 0 ? `Updated: ${OUTPUT_FILE}\n` : "Built-in examples already up to date.\n",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
