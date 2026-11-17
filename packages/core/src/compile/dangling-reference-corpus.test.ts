// A reference that fails to resolve drops the reference, never a node
// (TPL-2170). Measured as a mutation over every shipped example, so a new
// example, a new edge or a new import joins the day it is added:
//
// - every edge, with one endpoint rewritten to an id that exists nowhere: the
//   warning names it, and every node the views drew before is still drawn
//   (the side that resolved stays);
// - every import line, dropped: every node declared in a file the entry still
//   reaches whole is still in the merged model and still drawn (one missing
//   import loses 0 nodes beyond the files it no longer brings in).
//
// The mutation is applied to the parser's output for one file, so the rest of
// the pipeline (import resolution, the merge, the warnings and every view) runs
// as it does for a user who made that typo or forgot that import.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryFileSystemProvider } from "../fs/in-memory-provider.js";
import { resolvePath } from "../fs/path-utils.js";
import { ImportResolver } from "../fs/import-resolver.js";
import { Parser } from "../parser/parser.js";
import { nodePathRefId, parseNodePathRefId } from "../parser/node-path.js";
import type { KrsEdge, KrsFile, KrsNode } from "../types/ast.js";
import { buildAllViewsSvgProject } from "./compile.js";

const EXAMPLES = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../examples");

/** An example's path under `examples/`, `/`-separated on every platform (the in-memory file system's form). */
const logical = (absolute: string): string => relative(EXAMPLES, absolute).split(sep).join("/");
const DANGLING = "__dangling_reference__";

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

function containers(file: KrsFile): KrsNode[] {
  return [
    ...file.systems,
    ...file.services,
    ...file.clients,
    ...file.domains,
    ...file.databases,
    ...file.queues,
    ...file.storages,
  ];
}

/** Every edge of a file, in one fixed order, so an index names the same edge on every parse. */
function edgesOf(file: KrsFile): KrsEdge[] {
  const visit = (node: KrsNode): KrsEdge[] => [
    ...(node.edges ?? []),
    ...node.children.flatMap(visit),
  ];
  return containers(file).flatMap(visit);
}

/** Every node path a file declares, in the `data-node-path` form (`nodePathRefId`). */
function declaredPaths(file: KrsFile): Set<string> {
  const out = new Set<string>();
  const visit = (node: KrsNode, prefix: string[]) => {
    const path = [...prefix, node.id];
    out.add(nodePathRefId(path));
    for (const child of node.children) visit(child, path);
  };
  for (const node of containers(file)) visit(node, []);
  return out;
}

const FACES = ["system", "deploy", "org"] as const;
type Face = (typeof FACES)[number];

/** The markup of one face's pane in the all-views bundle. */
function pane(svg: string, face: Face): string {
  const start = svg.indexOf(`class="krs-pane krs-pane--${face}"`);
  if (start < 0) return "";
  const end = svg.indexOf('class="krs-pane krs-pane--', start + 1);
  return svg.slice(start, end < 0 ? undefined : end);
}

/** A node as one face draws it: `<face> <data-node-path or data-node-id>`. */
const drawnKey = (face: Face, value: string) => `${face} ${value}`;

/**
 * Every node each face's pane carries, by `data-node-path` (or `data-node-id`
 * where a card has no path). Keyed by face, so a node lost from one pane is not
 * hidden by the same string in another. Compared by presence, not by count: a
 * node also appears as the context card of each edge that reaches into a drill
 * level, so a dangling edge rightly removes occurrences, not the node.
 */
function drawnNodes(svg: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const face of FACES)
    for (const m of pane(svg, face).matchAll(/data-node-(?:path|id)="([^"]*)"/g)) {
      const key = drawnKey(face, m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
      out.set(key, (out.get(key) ?? 0) + 1);
    }
  return out;
}

/**
 * Whether a node drawn at `path` before is still drawn after. The path must
 * match exactly, with one exception: a named-imported top-level service is
 * placed in the `system` whose edge names it (rule 2 of `resolveBareIdImport`),
 * so when that edge's endpoint is rewritten the service moves to the top level.
 * Only for a service `relocated` that way, a path that loses its root segment
 * still counts: the service itself at its own id, its subtree under
 * `__unassigned__`. A move is not a drop; losing the subtree is.
 */
function stillDrawn(key: string, after: Map<string, number>, relocated: Set<string>): boolean {
  if (after.has(key)) return true;
  const [face, ...rest] = key.split(" ");
  if (face !== "system") return false;
  const segments = parseNodePathRefId(rest.join(" "));
  if (segments.length < 2 || !relocated.has(segments[1])) return false;
  const below = nodePathRefId(segments.slice(1));
  return after.has(drawnKey(face, below)) || after.has(drawnKey(face, `__unassigned__.${below}`));
}

/**
 * The top-level services `after` holds that `before` held inside a `system`:
 * the named-imported services the rewrite moved (see {@link stillDrawn}).
 */
function relocatedServices(before: KrsFile, after: KrsFile): Set<string> {
  const placed = new Set(
    before.systems.flatMap((system) =>
      system.children.filter((c) => c.kind === "service").map((c) => c.id),
    ),
  );
  return new Set(
    after.services.filter((service) => placed.has(service.id)).map((service) => service.id),
  );
}

/** Where an edge was written, so the same edge can be found in the merged model. */
const edgeKey = (edge: KrsEdge) =>
  `${edge.loc.file}:${edge.loc.start.line}:${edge.loc.start.column}`;

/** Every edge the merged model holds. */
function mergedEdges(file: KrsFile): Set<string> {
  return new Set(edgesOf(file).map(edgeKey));
}

/** Whether a node declared at `path` is drawn, at that path or, outside any `system`, under `__unassigned__`. */
/** Whether the system face draws the node at `path`. */
function isDrawn(path: string, drawn: Map<string, number>): boolean {
  return (
    drawn.has(drawnKey("system", path)) || drawn.has(drawnKey("system", `__unassigned__.${path}`))
  );
}

/** One mutation of one file's parse, or none. */
let mutation: { path: string; apply: (file: KrsFile) => void } | null = null;
/** The files the current resolution parsed. */
let parsedPaths: string[] = [];

describe("a dangling reference drops the reference, not a node (TPL-2170)", () => {
  const files = walk(EXAMPLES, []).sort();
  const entries = files.filter((f) => f.endsWith(".krs")).map((f) => `/${logical(f)}`);
  const fs = new InMemoryFileSystemProvider();
  const parse = Parser.parse.bind(Parser);

  beforeAll(async () => {
    for (const file of files) await fs.writeFile(`/${logical(file)}`, readFileSync(file, "utf8"));
    vi.spyOn(Parser, "parse").mockImplementation((source, filePath) => {
      const result = parse(source, filePath);
      if (filePath !== undefined) parsedPaths.push(filePath);
      if (mutation && filePath === mutation.path) mutation.apply(result.value);
      return result;
    });
  });
  afterAll(() => vi.restoreAllMocks());

  async function render(entry: string) {
    parsedPaths = [];
    const result = await buildAllViewsSvgProject(entry, fs);
    const { krsFile } = await new ImportResolver(fs).resolve(entry);
    return { ...result, krsFile, parsed: [...new Set(parsedPaths)] };
  }

  /**
   * The files `entry` brings in whole (itself, whole-file and directory
   * imports, transitively) and every node path they declare. A file reached
   * only by a named import is left out: only the named node travels from it.
   */
  async function wholeReach(entry: string) {
    const reached = new Set<string>();
    const paths = new Set<string>();
    const reach = async (file: string): Promise<void> => {
      if (reached.has(file)) return;
      reached.add(file);
      const parsed = Parser.parse(await fs.readFile(file), file).value;
      for (const p of declaredPaths(parsed)) paths.add(p);
      for (const decl of parsed.nodeImports) {
        if (decl.ids.length > 0 || decl.path === "") continue;
        const target = resolvePath(file, decl.path);
        const targets = decl.path.endsWith("/")
          ? entries.filter((p) => posix.dirname(p) === target && p !== file)
          : [target];
        for (const t of targets) if (entries.includes(t)) await reach(t);
      }
    };
    await reach(entry);
    return { files: reached, paths };
  }

  it("keeps every drawn node when one edge endpoint resolves nowhere (item 2)", async () => {
    let mutated = 0;
    const failures: string[] = [];
    for (const entry of entries) {
      mutation = null;
      const before = await render(entry);
      const drawnBefore = drawnNodes(before.svg);
      // The panes were found: an empty map would make every comparison pass.
      if (drawnBefore.size === 0) failures.push(`${entry}: no pane found in the bundle`);
      const inModel = mergedEdges(before.krsFile);
      const whole = (await wholeReach(entry)).files;
      for (const path of before.parsed) {
        mutation = null;
        const edges = edgesOf(Parser.parse(await fs.readFile(path), path).value);
        for (let index = 0; index < edges.length; index++) {
          // An edge of a file the entry only named-imports from is not in the
          // model, so rewriting it changes nothing to check.
          if (!inModel.has(edgeKey(edges[index]))) continue;
          for (const side of ["from", "to"] as const) {
            let original = "";
            mutation = {
              path,
              apply: (file) => {
                const edge = edgesOf(file)[index];
                original = edge[side];
                edge[side] = DANGLING;
                if (side === "to") delete edge.toPath;
              },
            };
            const after = await render(entry);
            mutated++;
            const label = `${entry} ${path}#${index}.${side} (${original})`;
            // A named import carries the edges that name the imported node
            // (`mergeNodeIntoSystems`), so an edge whose endpoint no longer
            // names it is not carried and has nothing to warn about. An edge of
            // a file reached whole always stays in the model.
            const carried = mergedEdges(after.krsFile).has(edgeKey(edges[index]));
            if (!carried && whole.has(path)) {
              failures.push(`${label}: the edge left the model`);
            }
            if (
              carried &&
              !after.warnings.some(
                (w) => w.kind === "unresolved-edge-endpoint" && w.params.unresolvedId === DANGLING,
              )
            ) {
              failures.push(`${label}: no unresolved-edge-endpoint names the dangling id`);
            }
            const drawnAfter = drawnNodes(after.svg);
            const relocated = relocatedServices(before.krsFile, after.krsFile);
            const lost = [...drawnBefore]
              .filter(([key]) => !stillDrawn(key, drawnAfter, relocated))
              .map(([key]) => key);
            if (lost.length > 0) failures.push(`${label}: lost ${lost.join(", ")}`);
          }
        }
      }
    }
    mutation = null;
    expect(failures).toEqual([]);
    // The corpus holds edges to mutate (an empty corpus would pass vacuously).
    expect(mutated).toBeGreaterThan(500);
  }, 120_000);

  it("keeps every node of the files still reached when one import line is dropped (item 3)", async () => {
    let dropped = 0;
    let dangledByDrop = 0;
    const failures: string[] = [];
    for (const entry of entries) {
      mutation = null;
      const before = await render(entry);
      const unresolvedBefore = before.warnings.filter((w) =>
        w.kind.startsWith("unresolved-"),
      ).length;
      for (const path of before.parsed) {
        mutation = null;
        const count = Parser.parse(await fs.readFile(path), path).value.nodeImports.length;
        for (let index = 0; index < count; index++) {
          mutation = { path, apply: (file) => void file.nodeImports.splice(index, 1) };
          const after = await render(entry);
          dropped++;
          const label = `${entry}: drop import #${index} of ${path}`;

          // The files the entry still brings in whole, each with its own
          // nodes. Parsed under the same mutation, so the dropped line is gone
          // here too.
          const { paths: expected } = await wholeReach(entry);

          const merged = declaredPaths(after.krsFile);
          const missing = [...expected].filter((p) => !merged.has(p));
          if (missing.length > 0) failures.push(`${label}: model lost ${missing.join(", ")}`);

          const drawnBefore = drawnNodes(before.svg);
          const drawnAfter = drawnNodes(after.svg);
          const undrawn = [...expected].filter(
            (p) => isDrawn(p, drawnBefore) && !isDrawn(p, drawnAfter),
          );
          if (undrawn.length > 0) failures.push(`${label}: views lost ${undrawn.join(", ")}`);

          const unresolvedAfter = after.warnings.filter((w) =>
            w.kind.startsWith("unresolved-"),
          ).length;
          if (unresolvedAfter > unresolvedBefore) dangledByDrop++;
        }
      }
    }
    mutation = null;
    expect(failures).toEqual([]);
    // The corpus holds imports to drop, and at least one drop leaves a
    // reference dangling: the case the item is about, not only imports whose
    // content nothing else names.
    expect(dropped).toBeGreaterThan(20);
    expect(dangledByDrop).toBeGreaterThan(0);
  }, 120_000);
});
