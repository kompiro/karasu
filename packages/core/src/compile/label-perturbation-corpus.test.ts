// Identity is the `id`, never the `label` (TPL-2167). Measured as a
// metamorphic property over every shipped example, so a new example joins the
// day it is added: compile each model, then compile it again with every label
// rewritten, and the verdicts and the drawn identities must not move.
//
// - **All labels equal.** Every pair of distinct nodes becomes "different id,
//   same label": a site that groups, dedups or resolves by label merges them.
// - **All labels distinct.** Every node reopened across files becomes "same id,
//   different label": a site that keys on label splits it.
//
// The labels are rewritten on the parser's output for every file, so import
// resolution, the merge, the resolver's checks, the warnings and every view
// all run on the rewritten model. A site inside the parser itself runs before
// the rewrite and is not measured here.
//
// Edge labels are left alone: the spec makes an edge's label part of its
// identity (`docs/spec/syntax.md` § multi-file import semantics, "same from,
// to, kind, label").

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryFileSystemProvider } from "../fs/in-memory-provider.js";
import { Parser } from "../parser/parser.js";
import type { Diagnostic, KrsFile } from "../types/ast.js";
import type { Warning } from "../types/warnings.js";
import { buildAllViewsSvgProject } from "./compile.js";

const EXAMPLES = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../examples");

/** An example's path under `examples/`, `/`-separated on every platform (the in-memory file system's form). */
const logical = (absolute: string): string => relative(EXAMPLES, absolute).split(sep).join("/");

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

type Rewrite = "equal" | "distinct";

/**
 * Rewrites the label of every declaration in a parsed file, and gives one to
 * every declaration that had none. A declaration is any object with a string
 * `id`; found by walking the whole AST rather than a list of node types, so a
 * new declaration type is rewritten the day it is added. Edges (`from` / `to`)
 * keep theirs. Returns how many labels it wrote.
 */
function rewriteLabels(file: KrsFile, mode: Rewrite, next: () => number): number {
  let written = 0;
  const seen = new Set<object>();
  const visit = (value: unknown): void => {
    if (value === null || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (value instanceof Map) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const record = value as Record<string, unknown>;
    const isEdge = typeof record.from === "string" && typeof record.to === "string";
    if (!isEdge && typeof record.id === "string") {
      record.label = mode === "equal" ? "Same label" : `Label ${next()}`;
      written++;
    }
    for (const [key, child] of Object.entries(record)) if (key !== "loc") visit(child);
  };
  visit(file);
  return written;
}

/**
 * The diagnostics whose subject is the label itself, so a rewrite may
 * legitimately change them. Each is listed with why.
 */
const LABEL_IS_THE_SUBJECT: ((d: Diagnostic) => boolean)[] = [
  // S3: a reopened block's label is reconciled across files and a disagreement
  // is reported. Making the labels agree or disagree is exactly what it reports.
  (d) => d.code === "system-property-conflict" && d.params.property === "label",
];

/**
 * A verdict's params without the ones that only display the label next to the
 * id (`unassigned-service` names both, so the message reads well). Which node
 * a verdict is about is still in the id params.
 */
const shown = (params: object | undefined) =>
  JSON.stringify(
    Object.fromEntries(Object.entries(params ?? {}).filter(([key]) => key !== "label")),
  );

const at = (loc: { file?: string; start: { line: number; column: number } } | undefined) =>
  loc ? `${loc.file ?? ""}:${loc.start.line}:${loc.start.column}` : "";

const FACES = ["system", "deploy", "org"] as const;

/** The markup of one face's pane in the all-views bundle. */
function pane(svg: string, face: (typeof FACES)[number]): string {
  const start = svg.indexOf(`class="krs-pane krs-pane--${face}"`);
  if (start < 0) return "";
  const end = svg.indexOf('class="krs-pane krs-pane--', start + 1);
  return svg.slice(start, end < 0 ? undefined : end);
}

/**
 * What a compile decided, with every label left out: verdicts, and the drawn
 * node and edge identities (teams and members are org-pane
 * `data-node-id`s). Identities are kept per face and with every
 * occurrence, so a node moved between faces, or one drawn twice where it was
 * drawn once, shows up.
 */
function verdicts(result: { svg: string; diagnostics: Diagnostic[]; warnings: Warning[] }) {
  const attrs = (name: string) =>
    FACES.flatMap((face) =>
      [...pane(result.svg, face).matchAll(new RegExp(`${name}="([^"]*)"`, "g"))].map(
        (m) => `${face}:${m[1]}`,
      ),
    ).sort();
  return {
    diagnostics: result.diagnostics
      .filter((d) => !LABEL_IS_THE_SUBJECT.some((exempt) => exempt(d)))
      .map((d) => `${d.code} ${at(d.loc)} ${shown(d.params)}`)
      .sort(),
    warnings: result.warnings.map((w) => `${w.kind} ${at(w.loc)} ${shown(w.params)}`).sort(),
    nodes: [...attrs("data-node-path"), ...attrs("data-node-id"), ...attrs("data-container-id")],
    edges: [
      ...attrs("data-edge-from"),
      ...attrs("data-edge-to"),
      ...attrs("data-edge-canonical-id"),
    ],
  };
}

/** The occurrences in `a` that `b` does not match one for one (multiset difference). */
function without(a: string[], b: string[]): string[] {
  const left = new Map<string, number>();
  for (const v of b) left.set(v, (left.get(v) ?? 0) + 1);
  return a.filter((v) => {
    const n = left.get(v) ?? 0;
    if (n === 0) return true;
    left.set(v, n - 1);
    return false;
  });
}

let rewrite: Rewrite | null = null;
let written = 0;

describe("a label rewrite moves no verdict and no drawn identity (TPL-2167)", () => {
  const files = walk(EXAMPLES, []).sort();
  const entries = files.filter((f) => f.endsWith(".krs")).map((f) => `/${logical(f)}`);
  const fs = new InMemoryFileSystemProvider();
  const parse = Parser.parse.bind(Parser);

  beforeAll(async () => {
    for (const file of files) await fs.writeFile(`/${logical(file)}`, readFileSync(file, "utf8"));
    let counter = 0;
    vi.spyOn(Parser, "parse").mockImplementation((source, filePath) => {
      const result = parse(source, filePath);
      if (rewrite) written += rewriteLabels(result.value, rewrite, () => counter++);
      return result;
    });
  });
  afterAll(() => vi.restoreAllMocks());

  // The rewrite only measures what the corpus exercises. "Same id, different
  // label" needs a declaration reopened across files with its own label in
  // each; "different id, same label" needs an id-keyed verdict to disturb.
  it("holds a block reopened across files with two labels, and id-keyed verdicts", async () => {
    rewrite = null;
    const conflicts = await buildAllViewsSvgProject("/en/multi-file-system/index.krs", fs);
    expect(
      conflicts.diagnostics.some(
        (d) => d.code === "system-property-conflict" && d.params.property === "label",
      ),
    ).toBe(true);
    const keyed = await buildAllViewsSvgProject("/en/migration/system.krs", fs);
    expect(keyed.warnings.some((w) => w.kind === "domain-dispersal")).toBe(true);
  });

  for (const mode of ["equal", "distinct"] as const) {
    it(`all labels ${mode}: every example decides and draws the same`, async () => {
      const failures: string[] = [];
      let total = 0;
      let drawn = 0;
      for (const entry of entries) {
        rewrite = null;
        const before = verdicts(await buildAllViewsSvgProject(entry, fs));
        rewrite = mode;
        written = 0;
        const after = verdicts(await buildAllViewsSvgProject(entry, fs));
        rewrite = null;
        total += written;
        drawn += before.nodes.length;
        for (const key of Object.keys(before) as (keyof typeof before)[]) {
          const lost = without(before[key], after[key]);
          const gained = without(after[key], before[key]);
          if (lost.length > 0 || gained.length > 0) {
            failures.push(`${entry} ${key}: -[${lost.join(" | ")}] +[${gained.join(" | ")}]`);
          }
        }
      }
      expect(failures).toEqual([]);
      // The rewrite reached the pipeline (a parser the resolver stopped
      // calling through `Parser.parse` would leave every label as written).
      expect(total).toBeGreaterThan(1000);
      // The panes were found, so the identities compared are not empty.
      expect(drawn).toBeGreaterThan(1000);
    }, 120_000);
  }
});
