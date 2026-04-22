import type { ParsedAdr } from "./validator.ts";

// Mermaid styling: color nodes by status so the graph communicates "which of
// these decisions still stands" at a glance.
const STATUS_STYLE: Record<string, string> = {
  accepted: "fill:#d4edda,stroke:#28a745,color:#155724",
  proposed: "fill:#fff3cd,stroke:#ffc107,color:#856404",
  deprecated: "fill:#f8d7da,stroke:#dc3545,color:#721c24",
  superseded: "fill:#e2e3e5,stroke:#6c757d,color:#383d41",
  not_adopted: "fill:#e2e3e5,stroke:#6c757d,color:#383d41,stroke-dasharray:3 3",
};

function mermaidNodeLabel(p: ParsedAdr): string {
  // Escape quotes and truncate long titles for readability.
  const title = p.fm.title.length > 50 ? p.fm.title.slice(0, 47) + "..." : p.fm.title;
  const escaped = title.replace(/"/g, "&quot;");
  return `"${p.id}<br/>${escaped}"`;
}

function mermaidNodeId(id: string): string {
  // Mermaid node ids cannot contain hyphens at some positions; use underscores.
  return id.replace(/-/g, "_");
}

interface VisualizeOptions {
  /** If set, filter edges to only those both endpoints are in this ID set. */
  includeIds?: Set<string>;
}

export function renderMermaid(adrs: ParsedAdr[], options: VisualizeOptions = {}): string {
  const nodeIds = new Set(adrs.map((p) => p.id));
  const includeIds = options.includeIds ?? nodeIds;

  const lines: string[] = ["flowchart TD"];

  // Nodes. Sort by id for deterministic output.
  const sortedNodes = [...adrs].sort((a, b) => a.id.localeCompare(b.id));
  for (const p of sortedNodes) {
    lines.push(`  ${mermaidNodeId(p.id)}[${mermaidNodeLabel(p)}]`);
  }

  // Edges. depends_on is a solid arrow; supersedes is a dashed arrow to signal
  // the replacement direction.
  const dependsEdges: [string, string][] = [];
  const supersedesEdges: [string, string][] = [];
  for (const p of sortedNodes) {
    for (const dep of p.fm.depends_on ?? []) {
      if (nodeIds.has(dep) && includeIds.has(p.id) && includeIds.has(dep)) {
        dependsEdges.push([p.id, dep]);
      }
    }
    for (const old of p.fm.supersedes ?? []) {
      if (nodeIds.has(old) && includeIds.has(p.id) && includeIds.has(old)) {
        supersedesEdges.push([p.id, old]);
      }
    }
  }

  for (const [from, to] of dependsEdges) {
    lines.push(`  ${mermaidNodeId(from)} --> ${mermaidNodeId(to)}`);
  }
  for (const [from, to] of supersedesEdges) {
    lines.push(`  ${mermaidNodeId(from)} -.supersedes.-> ${mermaidNodeId(to)}`);
  }

  // Status classes.
  lines.push("");
  for (const [status, style] of Object.entries(STATUS_STYLE)) {
    lines.push(`  classDef ${status} ${style}`);
  }

  for (const p of sortedNodes) {
    lines.push(`  class ${mermaidNodeId(p.id)} ${p.fm.status}`);
  }

  return lines.join("\n") + "\n";
}

/**
 * Detect back-edges in `depends_on`; returns cycles as lists of node ids.
 * Used so the visualizer header can call out cycles even though the validator
 * would already have errored on them.
 */
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

export function renderMarkdown(adrs: ParsedAdr[], options: VisualizeOptions = {}): string {
  const cycles = findDependsOnCycles(adrs);
  const header = [
    "# ADR Dependency Graph",
    "",
    `Generated from \`docs/adr/\` (${adrs.length} ADRs). Status colors: accepted (green), superseded / not_adopted (gray), deprecated (red), proposed (yellow). Arrows show \`depends_on\`; dashed arrows show \`supersedes\`.`,
    "",
  ];
  if (cycles.length > 0) {
    header.push("> **Warning:** `depends_on` cycles detected:");
    for (const c of cycles) header.push(`> - ${c.join(" → ")}`);
    header.push("");
  }
  const mermaid = renderMermaid(adrs, options);
  return `${header.join("\n")}\`\`\`mermaid\n${mermaid}\`\`\`\n`;
}
