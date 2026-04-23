import type { ParsedAdr } from "./validator.ts";

const STATUS_STYLE: Record<string, string> = {
  accepted: "fill:#d4edda,stroke:#28a745,color:#155724",
  proposed: "fill:#fff3cd,stroke:#ffc107,color:#856404",
  deprecated: "fill:#f8d7da,stroke:#dc3545,color:#721c24",
  superseded: "fill:#e2e3e5,stroke:#6c757d,color:#383d41",
  not_adopted: "fill:#e2e3e5,stroke:#6c757d,color:#383d41,stroke-dasharray:3 3",
};

const GHOST_STYLE = "fill:#f5f5f5,stroke:#adb5bd,color:#6c757d,stroke-dasharray:2 2";

function truncateTitle(title: string): string {
  return title.length > 50 ? title.slice(0, 47) + "..." : title;
}

function mermaidNodeLabel(p: ParsedAdr): string {
  const escaped = truncateTitle(p.fm.title).replace(/"/g, "&quot;");
  return `"${p.id}<br/>${escaped}"`;
}

function mermaidNodeId(id: string): string {
  return id.replace(/-/g, "_");
}

interface VisualizeOptions {
  /** Emit `subgraph <topic> ... end` clusters. */
  groupByTopic?: boolean;
}

function collectEdges(
  sortedNodes: ParsedAdr[],
  nodeIds: Set<string>,
): { depends: [string, string][]; supersedes: [string, string][] } {
  const depends: [string, string][] = [];
  const supersedes: [string, string][] = [];
  for (const p of sortedNodes) {
    for (const dep of p.fm.depends_on ?? []) {
      if (nodeIds.has(dep)) depends.push([p.id, dep]);
    }
    for (const old of p.fm.supersedes ?? []) {
      if (nodeIds.has(old)) supersedes.push([p.id, old]);
    }
  }
  return { depends, supersedes };
}

function writeStatusClasses(lines: string[], nodes: ParsedAdr[]): void {
  lines.push("");
  for (const [status, style] of Object.entries(STATUS_STYLE)) {
    lines.push(`  classDef ${status} ${style}`);
  }
  lines.push(`  classDef ghost ${GHOST_STYLE}`);
  for (const p of nodes) {
    lines.push(`  class ${mermaidNodeId(p.id)} ${p.fm.status}`);
  }
}

export function renderMermaid(adrs: ParsedAdr[], options: VisualizeOptions = {}): string {
  const sortedNodes = [...adrs].sort((a, b) => a.id.localeCompare(b.id));
  const nodeIds = new Set(sortedNodes.map((p) => p.id));
  const lines: string[] = ["flowchart TD"];

  if (options.groupByTopic) {
    // Cluster nodes inside `subgraph <topic>` blocks so Mermaid renders a
    // visible border per topic. Edges stay at the top level so cross-topic
    // edges are drawn across clusters.
    const byTopic = new Map<string, ParsedAdr[]>();
    for (const p of sortedNodes) {
      const t = p.fm.topic;
      if (!byTopic.has(t)) byTopic.set(t, []);
      byTopic.get(t)!.push(p);
    }
    const sortedTopics = [...byTopic.keys()].sort();
    for (const topic of sortedTopics) {
      lines.push(`  subgraph ${topic}["${topic}"]`);
      for (const p of byTopic.get(topic)!) {
        lines.push(`    ${mermaidNodeId(p.id)}[${mermaidNodeLabel(p)}]`);
      }
      lines.push(`  end`);
    }
  } else {
    for (const p of sortedNodes) {
      lines.push(`  ${mermaidNodeId(p.id)}[${mermaidNodeLabel(p)}]`);
    }
  }

  const { depends, supersedes } = collectEdges(sortedNodes, nodeIds);
  for (const [from, to] of depends) {
    lines.push(`  ${mermaidNodeId(from)} --> ${mermaidNodeId(to)}`);
  }
  for (const [from, to] of supersedes) {
    lines.push(`  ${mermaidNodeId(from)} -.supersedes.-> ${mermaidNodeId(to)}`);
  }

  writeStatusClasses(lines, sortedNodes);
  return lines.join("\n") + "\n";
}

/**
 * Render a per-topic graph. Nodes inside the topic are rendered in full;
 * ADRs that are referenced by (or reference) the topic but belong elsewhere
 * become "ghost" nodes so readers can see cross-topic connections without
 * drowning in unrelated ADRs.
 */
export function renderMermaidForTopic(allAdrs: ParsedAdr[], topic: string): string {
  const inside = allAdrs.filter((p) => p.fm.topic === topic);
  if (inside.length === 0) {
    return `flowchart TD\n  empty["(no ADRs in topic: ${topic})"]\n`;
  }
  const byId = new Map(allAdrs.map((p) => [p.id, p]));
  const insideIds = new Set(inside.map((p) => p.id));
  const ghostIds = new Set<string>();

  for (const p of inside) {
    for (const dep of p.fm.depends_on ?? []) {
      if (!insideIds.has(dep) && byId.has(dep)) ghostIds.add(dep);
    }
    for (const old of p.fm.supersedes ?? []) {
      if (!insideIds.has(old) && byId.has(old)) ghostIds.add(old);
    }
  }
  // Also pull in ghost nodes for *incoming* cross-topic edges so that
  // "who depends on me" is visible.
  for (const p of allAdrs) {
    if (insideIds.has(p.id)) continue;
    const referencesInside =
      (p.fm.depends_on ?? []).some((d) => insideIds.has(d)) ||
      (p.fm.supersedes ?? []).some((d) => insideIds.has(d));
    if (referencesInside) ghostIds.add(p.id);
  }

  const lines: string[] = ["flowchart TD"];
  const sortedInside = [...inside].sort((a, b) => a.id.localeCompare(b.id));
  lines.push(`  subgraph ${topic}["${topic}"]`);
  for (const p of sortedInside) {
    lines.push(`    ${mermaidNodeId(p.id)}[${mermaidNodeLabel(p)}]`);
  }
  lines.push(`  end`);

  const sortedGhosts = [...ghostIds].sort().map((id) => byId.get(id)!);
  for (const p of sortedGhosts) {
    // Ghost label includes the external topic so readers know where to click.
    const label = `"${p.id}<br/>[${p.fm.topic}] ${truncateTitle(p.fm.title).replace(/"/g, "&quot;")}"`;
    lines.push(`  ${mermaidNodeId(p.id)}[${label}]`);
  }

  // Edges: inside-inside, inside→ghost, ghost→inside.
  const nodeIds = new Set<string>([...insideIds, ...ghostIds]);
  const { depends, supersedes } = collectEdges([...sortedInside, ...sortedGhosts], nodeIds);
  for (const [from, to] of depends) {
    lines.push(`  ${mermaidNodeId(from)} --> ${mermaidNodeId(to)}`);
  }
  for (const [from, to] of supersedes) {
    lines.push(`  ${mermaidNodeId(from)} -.supersedes.-> ${mermaidNodeId(to)}`);
  }

  // Status classes first, then override ghosts.
  writeStatusClasses(lines, sortedInside);
  for (const p of sortedGhosts) {
    lines.push(`  class ${mermaidNodeId(p.id)} ghost`);
  }
  return lines.join("\n") + "\n";
}

export function findDependsOnCycles(adrs: ParsedAdr[]): string[][] {
  const byId = new Map(adrs.map((p) => [p.id, p]));
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const cycles: string[][] = [];
  const stack: string[] = [];

  const visit = (id: string): void => {
    color.set(id, GRAY);
    stack.push(id);
    const node = byId.get(id);
    if (node) {
      for (const next of node.fm.depends_on ?? []) {
        if (!byId.has(next)) continue;
        const c = color.get(next) ?? WHITE;
        if (c === GRAY) {
          const start = stack.indexOf(next);
          cycles.push([...stack.slice(start), next]);
        } else if (c === WHITE) {
          visit(next);
        }
      }
    }
    stack.pop();
    color.set(id, BLACK);
  };

  for (const p of adrs) {
    if ((color.get(p.id) ?? WHITE) === WHITE) visit(p.id);
  }
  return cycles;
}

function cycleHeader(cycles: string[][]): string[] {
  if (cycles.length === 0) return [];
  const lines = ["> **Warning:** `depends_on` cycles detected:"];
  for (const c of cycles) lines.push(`> - ${c.join(" → ")}`);
  lines.push("");
  return lines;
}

/** Markdown wrapper around a single flat Mermaid graph (legacy / query subsets). */
export function renderMarkdown(adrs: ParsedAdr[]): string {
  const cycles = findDependsOnCycles(adrs);
  const header = [
    "# ADR Dependency Graph",
    "",
    `Generated from \`docs/adr/\` (${adrs.length} ADRs). Status colors: accepted (green), superseded / not_adopted (gray), deprecated (red), proposed (yellow). Arrows show \`depends_on\`; dashed arrows show \`supersedes\`.`,
    "",
    ...cycleHeader(cycles),
  ];
  return `${header.join("\n")}\`\`\`mermaid\n${renderMermaid(adrs)}\`\`\`\n`;
}

/** Overview: topic-grouped graph + links to per-topic detail files. */
export function renderOverview(adrs: ParsedAdr[], topicLinkBase = "graph"): string {
  const cycles = findDependsOnCycles(adrs);
  const byTopic = new Map<string, number>();
  for (const p of adrs) {
    byTopic.set(p.fm.topic, (byTopic.get(p.fm.topic) ?? 0) + 1);
  }
  const sortedTopics = [...byTopic.keys()].sort();

  const legend = [
    "## Per-topic detail",
    "",
    ...sortedTopics.map((t) => `- [\`${t}\`](${topicLinkBase}/${t}.md) — ${byTopic.get(t)} ADRs`),
    "",
  ];

  const header = [
    "# ADR Dependency Graph — Overview",
    "",
    `${adrs.length} ADRs across ${sortedTopics.length} topics. Clusters group by \`topic\` frontmatter field. Edges crossing cluster borders are cross-topic dependencies.`,
    "",
    ...cycleHeader(cycles),
  ];
  const mermaid = renderMermaid(adrs, { groupByTopic: true });
  return `${header.join("\n")}\`\`\`mermaid\n${mermaid}\`\`\`\n\n${legend.join("\n")}`;
}

/** Markdown wrapper around a single topic's detail graph with ghost nodes. */
export function renderTopicMarkdown(allAdrs: ParsedAdr[], topic: string): string {
  const mermaid = renderMermaidForTopic(allAdrs, topic);
  const count = allAdrs.filter((p) => p.fm.topic === topic).length;
  const header = [
    `# ADR Topic: ${topic}`,
    "",
    `${count} ADRs in this topic. Solid nodes belong to \`${topic}\`; gray dashed nodes are ghosts showing cross-topic references to help navigation.`,
    "",
    "Other topics: [overview](../graph.md).",
    "",
  ];
  return `${header.join("\n")}\`\`\`mermaid\n${mermaid}\`\`\`\n`;
}

/** Returns the sorted list of topics present in the corpus. */
export function listTopics(adrs: ParsedAdr[]): string[] {
  return [...new Set(adrs.map((p) => p.fm.topic))].sort();
}
