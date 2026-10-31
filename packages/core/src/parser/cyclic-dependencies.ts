import type { KrsEdge, KrsFile, KrsNode } from "../types/ast.js";
import type { Warning } from "../types/warnings.js";

/**
 * Sync dependency cycles, found per scope (ADR-287): a system's edges and the
 * edges of every node below it are each searched on their own, and a cycle
 * that crosses scopes is not looked for. Async edges are left out, since an
 * async cycle is usually an intended eventual-consistency pattern, and so are
 * entity relation edges, whose self-loops and mutual references are ordinary
 * ER shapes.
 *
 * Pure: it reads the model and returns what it found (#2791). The flag the
 * renderers read is written by `markCyclicEdges`, which only the two places
 * that build a model call; `analyze()` takes just the warnings.
 */
export function findCyclicDependencies(file: KrsFile): {
  cyclicEdges: Set<KrsEdge>;
  warnings: Warning[];
} {
  const cyclicEdges = new Set<KrsEdge>();
  const warnings: Warning[] = [];

  function detectInEdges(edges: KrsEdge[]): void {
    const syncEdges = edges.filter((e) => e.kind === "sync");
    if (syncEdges.length === 0) return;

    // Build adjacency map: node -> outgoing sync edges
    const adj = new Map<string, KrsEdge[]>();
    for (const edge of syncEdges) {
      if (!adj.has(edge.from)) adj.set(edge.from, []);
      adj.get(edge.from)!.push(edge);
    }

    const WHITE = 0,
      GRAY = 1,
      BLACK = 2;
    const color = new Map<string, number>();

    function dfs(node: string, path: string[]): void {
      color.set(node, GRAY);
      const currentPath = [...path, node];

      for (const edge of adj.get(node) ?? []) {
        const neighbor = edge.to;

        // Self-reference
        if (neighbor === node) {
          cyclicEdges.add(edge);
          warnings.push({
            kind: "cyclic-dependency",
            params: { cyclePath: [node, node] },
            loc: edge.loc,
          });
          continue;
        }

        const neighborColor = color.get(neighbor) ?? WHITE;
        if (neighborColor === GRAY) {
          // Back edge found — this edge and every edge along the cycle
          cyclicEdges.add(edge);
          const cycleStartIdx = currentPath.indexOf(neighbor);
          const cyclePath = [...currentPath.slice(cycleStartIdx), neighbor];

          // Every parallel sync edge on each hop, read off the hop's own
          // outgoing edges rather than a scan of the whole scope: this runs on
          // every parse now, not just in `analyze()` (#2791).
          for (let i = 0; i < cyclePath.length - 1; i++) {
            const to = cyclePath[i + 1];
            for (const cycleEdge of adj.get(cyclePath[i]) ?? []) {
              if (cycleEdge.to === to) cyclicEdges.add(cycleEdge);
            }
          }

          warnings.push({
            kind: "cyclic-dependency",
            params: { cyclePath },
            loc: edge.loc,
          });
        } else if (neighborColor === WHITE) {
          dfs(neighbor, currentPath);
        }
      }

      color.set(node, BLACK);
    }

    // Collect all nodes that appear in sync edges
    const nodes = new Set<string>();
    for (const edge of syncEdges) {
      nodes.add(edge.from);
      nodes.add(edge.to);
    }

    for (const node of nodes) {
      if ((color.get(node) ?? WHITE) === WHITE) {
        dfs(node, []);
      }
    }
  }

  function walkNodes(nodes: KrsNode[]): void {
    for (const node of nodes) {
      if (node.kind !== "entity") detectInEdges(node.edges);
      walkNodes(node.children);
    }
  }

  for (const system of file.systems) {
    detectInEdges(system.edges);
    walkNodes(system.children);
  }

  return { cyclicEdges, warnings };
}

/**
 * Sets `KrsEdge.cyclic` on exactly the edges `findCyclicDependencies` reports,
 * clearing it everywhere else first so a re-derivation never leaves a stale
 * flag. Called while a model is being built: by the Parser on the file it is
 * constructing, and by the ImportResolver on the merged model, where a cycle
 * split across files first becomes visible (TPL-2221). No pass that is handed
 * a finished model calls it (TPL-2791).
 */
export function markCyclicEdges(file: KrsFile): void {
  const { cyclicEdges } = findCyclicDependencies(file);
  const visit = (edges: KrsEdge[]): void => {
    for (const edge of edges) {
      if (cyclicEdges.has(edge)) edge.cyclic = true;
      else delete edge.cyclic;
    }
  };
  const walk = (nodes: KrsNode[]): void => {
    for (const node of nodes) {
      visit(node.edges);
      walk(node.children);
    }
  };
  for (const system of file.systems) {
    visit(system.edges);
    walk(system.children);
  }
}
