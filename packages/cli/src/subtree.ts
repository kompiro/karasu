import {
  serializeKrsFile,
  createEmptyKrsFile,
  type KrsFile,
  type KrsNode,
  type SystemNode,
  type ServiceNode,
  type DomainNode,
} from "@karasu-tools/core";
import { compileSystemViewOrExit, resolveKrsFileOrExit } from "./compile-system-view.js";
import { writeOutput } from "./output.js";

interface SubtreeCliOptions {
  output?: string;
  withAncestors?: boolean;
}

/** Kinds that can stand as a top-level `.krs` block on their own. */
const TOP_LEVEL_KINDS = new Set(["system", "service", "domain"]);

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
  const file = createEmptyKrsFile();
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
  const resolved = await resolveKrsFileOrExit(filePath);
  if (!resolved) return;
  const { absolutePath, fs } = resolved;

  const result = await compileSystemViewOrExit(fs, absolutePath, filePath, "subtree");
  if (!result) return;

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
  await writeOutput(output, options.output);
}
