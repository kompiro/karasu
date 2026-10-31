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
export function findCyclicDependencies(
  file: KrsFile,
  /**
   * `false` skips building the warnings (and the cycle path each one carries),
   * which is all `markCyclicEdges` needs. Their total size can grow with the
   * square of the chain length, and marking runs on every parse.
   */
  { withWarnings = true }: { withWarnings?: boolean } = {},
): {
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

    // Explicit-stack depth-first walk. A recursive one ran out of call stack on
    // a long sync chain, and the walk now runs inside `Parser.parse`, where a
    // throw would refuse a well-formed document (#2791). The visit order is the
    // recursive one's: a node's edges are taken in declaration order, and a
    // WHITE neighbour is finished before the next edge is looked at. `path`
    // is the GRAY chain from the walk's root to the current node.
    //
    // Hop `h` is the step from `path[h]` to `path[h + 1]`. Marking a cycle marks
    // every parallel sync edge on each of its hops, and a hop marked once has
    // nothing left to add, so `hopSkip` lets later cycles jump over the hops
    // already marked (a union-find over path depths, pointing only downward).
    // Without it, a chain whose every node also calls the root re-walked the
    // whole chain per back edge, which is quadratic on every parse.
    function dfs(root: string): void {
      const path: string[] = [];
      const depthOf = new Map<string, number>();
      const hopSkip: number[] = [];
      const stack: { node: string; next: number }[] = [];
      const enter = (node: string): void => {
        color.set(node, GRAY);
        depthOf.set(node, path.length);
        // The hop into this node is new, whatever stood at this depth before.
        if (path.length > 0) hopSkip[path.length - 1] = path.length - 1;
        path.push(node);
        stack.push({ node, next: 0 });
      };
      // The highest unmarked hop at or below `h`, or -1.
      const unmarkedAtOrBelow = (h: number): number => {
        let top = h;
        while (top >= 0 && hopSkip[top] !== top) top = hopSkip[top];
        while (h > top) {
          const below = hopSkip[h];
          hopSkip[h] = top;
          h = below;
        }
        return top;
      };
      enter(root);
      while (stack.length > 0) {
        const frame = stack[stack.length - 1];
        const out = adj.get(frame.node) ?? [];
        if (frame.next >= out.length) {
          color.set(frame.node, BLACK);
          depthOf.delete(frame.node);
          path.pop();
          stack.pop();
          continue;
        }
        const edge = out[frame.next++];
        const node = frame.node;
        const neighbor = edge.to;

        // Self-reference
        if (neighbor === node) {
          cyclicEdges.add(edge);
          if (withWarnings)
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
          const cycleStartIdx = depthOf.get(neighbor)!;

          // Every parallel sync edge on each hop still unmarked, read off the
          // hop's own outgoing edges rather than a scan of the whole scope.
          for (
            let h = unmarkedAtOrBelow(path.length - 2);
            h >= cycleStartIdx;
            h = unmarkedAtOrBelow(h - 1)
          ) {
            const to = path[h + 1];
            for (const cycleEdge of adj.get(path[h]) ?? []) {
              if (cycleEdge.to === to) cyclicEdges.add(cycleEdge);
            }
            hopSkip[h] = h - 1;
          }

          if (withWarnings) {
            warnings.push({
              kind: "cyclic-dependency",
              params: { cyclePath: [...path.slice(cycleStartIdx), neighbor] },
              loc: edge.loc,
            });
          }
        } else if (neighborColor === WHITE) {
          enter(neighbor);
        }
      }
    }

    // Collect all nodes that appear in sync edges
    const nodes = new Set<string>();
    for (const edge of syncEdges) {
      nodes.add(edge.from);
      nodes.add(edge.to);
    }

    for (const node of nodes) {
      if ((color.get(node) ?? WHITE) === WHITE) {
        dfs(node);
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
  const { cyclicEdges } = findCyclicDependencies(file, { withWarnings: false });
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
