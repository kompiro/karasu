// The three parallel views of one model each draw everything the merged model
// declares for them (TPL-2169): the system face every logical node, the deploy
// face every deploy node, the org face every team. Measured over every shipped
// example through `buildAllViewsSvgProject`, the bundle `karasu render` writes,
// so imports are resolved as they are for a user and a new example joins the
// day it is added. The expectation is derived from the merged model, so a new
// declaration joins without touching this file.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryFileSystemProvider } from "../fs/in-memory-provider.js";
import { ImportResolver } from "../fs/import-resolver.js";
import { Parser } from "../parser/parser.js";
import { nodePathRefId } from "../parser/node-path.js";
import type { KrsFile, KrsNode } from "../types/ast.js";
import { buildAllViewsSvgProject } from "./compile.js";

const EXAMPLES = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../examples");

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

type Face = "system" | "deploy" | "org";
const FACES: Record<Face, true> = { system: true, deploy: true, org: true };

/** The markup of one face's pane in the all-views bundle. */
function pane(svg: string, face: Face): string {
  const start = svg.indexOf(`class="krs-pane krs-pane--${face}"`);
  if (start < 0) return "";
  const end = svg.indexOf('class="krs-pane krs-pane--', start + 1);
  return svg.slice(start, end < 0 ? undefined : end);
}

const attrs = (svg: string, name: string) =>
  new Set([...svg.matchAll(new RegExp(`${name}="([^"]*)"`, "g"))].map((m) => m[1]));

function logicalRoots(file: KrsFile): KrsNode[] {
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

/** One declaration a face has to draw. */
interface Expected {
  /** Path for the system face (`nodePathRefId`), id for the others. */
  key: string;
  /** Set for a top-level `system`, which a multi-system root draws as a frame. */
  systemId?: string;
}

/** What each face has to draw, from the merged model. */
function declared(file: KrsFile): Record<Face, Expected[]> {
  // How many paths each bare id is declared at, for the #2933 exemption below.
  const pathsPerId = new Map<string, number>();
  const count = (node: KrsNode) => {
    pathsPerId.set(node.id, (pathsPerId.get(node.id) ?? 0) + 1);
    node.children.forEach(count);
  };
  logicalRoots(file).forEach(count);

  const system: Expected[] = [];
  const visit = (node: KrsNode, prefix: KrsNode[]) => {
    const chain = [...prefix, node];
    // A model with one `system` draws it as the root canvas: its children are
    // the root level, and no card or frame stands for the system itself.
    const isRootCanvas = prefix.length === 0 && node.kind === "system" && file.systems.length === 1;
    // The static bundle has one drill level per anchor id, `#krs-system-<id>`,
    // and the anchor carries no path (#2933, docs/spec/permalink.md). When a
    // container's id is declared at two paths, the bundle draws the level of
    // the one the app resolves the anchor to, and the other's contents have
    // no level. Decided there; not a loss this guard should report.
    const behindSharedAnchor = prefix.some(
      (ancestor, i) => i > 0 && (pathsPerId.get(ancestor.id) ?? 0) > 1,
    );
    if (!isRootCanvas && !behindSharedAnchor) {
      system.push({
        key: nodePathRefId(chain.map((n) => n.id)),
        systemId: prefix.length === 0 && node.kind === "system" ? node.id : undefined,
      });
    }
    for (const child of node.children) visit(child, chain);
  };
  for (const node of logicalRoots(file)) visit(node, []);
  return {
    system,
    deploy: file.deploys.flatMap((block) => block.nodes.map((node) => ({ key: node.id }))),
    org: file.organizations.flatMap((org) => org.teams.map((team) => ({ key: team.id }))),
  };
}

const unescape = (value: string) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** Whether a face's pane draws the declaration. */
function draws(face: Face, markup: string, expected: Expected): boolean {
  const values = (name: string) => new Set([...attrs(markup, name)].map(unescape));
  if (face === "system") {
    const paths = values("data-node-path");
    // A top-level node outside any `system` is drawn under `__unassigned__`.
    if (paths.has(expected.key) || paths.has(`__unassigned__.${expected.key}`)) return true;
    // A multi-system root draws each system as a frame.
    return expected.systemId !== undefined && values("data-container-id").has(expected.systemId);
  }
  if (face === "deploy") {
    // A deploy card is filed under the node it realizes: `<realized>::<id>`.
    return [...values("data-node-id")].some(
      (id) => id === expected.key || id.endsWith(`::${expected.key}`),
    );
  }
  return values("data-team-id").has(expected.key) || values("data-node-id").has(expected.key);
}

describe("every shipped example draws all of its model on each of the three faces (TPL-2169)", () => {
  const files = walk(EXAMPLES, []).sort();
  const entries = files.filter((f) => f.endsWith(".krs")).map((f) => `/${relative(EXAMPLES, f)}`);
  const fs = new InMemoryFileSystemProvider();

  beforeAll(async () => {
    for (const file of files)
      await fs.writeFile(`/${relative(EXAMPLES, file)}`, readFileSync(file, "utf8"));
  });

  // The guard measures the cross-face case only if the corpus has it: one
  // entry whose model fills all three faces, with what it shows on each face
  // partly declared in files it imports.
  it("holds an entry that fills all three faces from imported files", async () => {
    let found = false;
    for (const entry of entries) {
      const { krsFile } = await new ImportResolver(fs).resolve(entry);
      const own = Parser.parse(await fs.readFile(entry), entry).value;
      const merged = declared(krsFile);
      const local = declared(own);
      if (
        (Object.keys(FACES) as Face[]).every(
          (face) => merged[face].length > 0 && merged[face].length > local[face].length,
        )
      ) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it.each(entries)("%s", async (entry) => {
    const { svg } = await buildAllViewsSvgProject(entry, fs);
    const { krsFile } = await new ImportResolver(fs).resolve(entry);
    const expected = declared(krsFile);
    const undrawn: string[] = [];
    for (const face of Object.keys(FACES) as Face[]) {
      const markup = pane(svg, face);
      for (const key of expected[face])
        if (!draws(face, markup, key)) undrawn.push(`${face}:${key}`);
    }
    expect(undrawn).toEqual([]);
  });
});
