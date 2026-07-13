import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  compileProject,
  serializeKrsFile,
  type FileSystemProvider,
  type DirEntry,
  type KrsFile,
  type KrsNode,
  type SystemNode,
  type ServiceNode,
  type DomainNode,
} from "@karasu-tools/core";
import { formatDiagnostic } from "./i18n.js";

interface SubtreeCliOptions {
  output?: string;
  withAncestors?: boolean;
}

/** Kinds that can stand as a top-level `.krs` block on their own. */
const TOP_LEVEL_KINDS = new Set(["system", "service", "domain"]);

class NodeFileSystemProvider implements FileSystemProvider {
  async readFile(path: string): Promise<string> {
    return readFile(path, "utf-8");
  }
  async writeFile(path: string, content: string): Promise<void> {
    await writeFile(path, content, "utf-8");
  }
  async readDir(path: string): Promise<DirEntry[]> {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      kind: e.isDirectory() ? ("directory" as const) : ("file" as const),
    }));
  }
  async exists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }
  async delete(): Promise<void> {
    throw new Error("delete not supported");
  }
  async mkdir(): Promise<void> {
    throw new Error("mkdir not supported");
  }
}

interface Match {
  /** ancestor chain from a system root down to and including the target node */
  chain: KrsNode[];
}

/** Find every node with `id === nodeId`, recording its ancestor chain. */
function findMatches(systems: readonly SystemNode[], nodeId: string): Match[] {
  const matches: Match[] = [];
  function walk(node: KrsNode, ancestors: KrsNode[]): void {
    const chain = [...ancestors, node];
    if (node.id === nodeId) matches.push({ chain });
    for (const child of node.children) walk(child, chain);
  }
  for (const sys of systems) walk(sys, []);
  return matches;
}

/**
 * Rebuild a single root→target path, pruning sibling subtrees at every
 * ancestor level. The target keeps its full children and edges; wrapper
 * levels keep only the one child that leads to the target and drop their edges.
 */
function buildPath(chain: KrsNode[]): KrsNode {
  let node = chain[chain.length - 1];
  for (let i = chain.length - 2; i >= 0; i--) {
    node = { ...chain[i], children: [node], edges: [] };
  }
  return node;
}

function emptyKrsFile(): KrsFile {
  return {
    styleImports: [],
    nodeImports: [],
    systems: [],
    services: [],
    clients: [],
    domains: [],
    databases: [],
    queues: [],
    storages: [],
    deploys: [],
    organizations: [],
    legends: [],
    ownerIndex: new Map(),
    nodePathIndex: new Map(),
    nodeFileIndex: new Map(),
  };
}

/**
 * Choose the slice to serialize. Default (minimal) wraps the target up to its
 * nearest top-level-capable ancestor (domain > service > system). With
 * `--with-ancestors`, the full chain from the system root is kept.
 */
function sliceChain(chain: KrsNode[], withAncestors: boolean): KrsNode[] {
  if (withAncestors) return chain;
  const target = chain[chain.length - 1];
  if (TOP_LEVEL_KINDS.has(target.kind)) return [target];
  // nearest top-level-capable ancestor
  for (let i = chain.length - 2; i >= 0; i--) {
    if (TOP_LEVEL_KINDS.has(chain[i].kind)) return chain.slice(i);
  }
  return chain;
}

function wrapIntoFile(top: KrsNode): KrsFile | undefined {
  const file = emptyKrsFile();
  switch (top.kind) {
    case "system":
      file.systems.push(top as SystemNode);
      return file;
    case "service":
      file.services.push(top as ServiceNode);
      return file;
    case "domain":
      file.domains.push(top as DomainNode);
      return file;
    default:
      return undefined;
  }
}

export async function subtree(
  nodeId: string,
  filePath: string,
  options: SubtreeCliOptions,
): Promise<void> {
  const absolutePath = resolve(filePath);
  const fs = new NodeFileSystemProvider();

  if (!(await fs.exists(absolutePath))) {
    process.stderr.write(`Error: File not found: ${filePath}\n`);
    process.exit(1);
    return;
  }

  const result = await compileProject(absolutePath, fs, { diagramType: "system" });
  if (result.diagramType !== "system") {
    process.stderr.write("Error: subtree requires a system view\n");
    process.exit(1);
    return;
  }

  const errors = result.diagnostics.filter((d) => d.severity === "error");
  for (const d of errors) {
    const loc = d.loc ? `${filePath}:${d.loc.start.line + 1}:${d.loc.start.column + 1}` : filePath;
    process.stderr.write(`Error: ${loc}: ${formatDiagnostic(d)}\n`);
  }
  if (errors.length > 0) {
    process.exit(1);
    return;
  }

  const matches = findMatches(result.systems, nodeId);

  if (matches.length === 0) {
    process.stderr.write(`Error: no node with id "${nodeId}" found in ${filePath}\n`);
    process.exit(1);
    return;
  }
  if (matches.length > 1) {
    process.stderr.write(`Error: id "${nodeId}" is ambiguous (${matches.length} matches):\n`);
    for (const m of matches) {
      const path = m.chain.map((n) => n.id).join(" > ");
      process.stderr.write(`  - ${path}\n`);
    }
    process.exit(1);
    return;
  }

  const chain = sliceChain(matches[0].chain, options.withAncestors === true);
  const top = buildPath(chain);
  const file = wrapIntoFile(top);
  if (!file) {
    process.stderr.write(`Error: cannot serialize a "${top.kind}" node as a standalone subtree\n`);
    process.exit(1);
    return;
  }

  const output = serializeKrsFile(file);
  if (options.output) {
    await writeFile(resolve(options.output), output, "utf-8");
  } else {
    process.stdout.write(output);
  }
}
