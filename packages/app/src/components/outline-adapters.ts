import type {
  DeployBlock,
  KrsNode,
  OrganizationBlock,
  OrgNode,
  SystemNode,
} from "@karasu-tools/core";
import type { OutlineNode } from "./OutlineView.js";

/**
 * Maps each diagram AST (system / deploy / org) to the view-agnostic
 * `OutlineNode` tree the `OutlineView` renders. Pure functions — the
 * choice of which adapter to call lives in `AppShell`, keyed on
 * `activeView` (Issue #1410).
 */

/** system / matrix views — the resolved `SystemNode[]` AST. */
export function toSystemOutline(systems: SystemNode[]): OutlineNode[] {
  return systems.map(krsNodeToOutline);
}

function krsNodeToOutline(node: KrsNode): OutlineNode {
  return {
    id: node.id,
    label: node.label,
    kind: node.kind,
    children: node.children.map(krsNodeToOutline),
  };
}

/** org view — `OrganizationBlock[]` → organization → team → member. */
export function toOrgOutline(organizations: OrganizationBlock[]): OutlineNode[] {
  return organizations.map((org) => ({
    id: org.id,
    label: org.label,
    kind: "organization",
    children: org.teams.map(orgNodeToOutline),
  }));
}

function orgNodeToOutline(node: OrgNode): OutlineNode {
  return {
    id: node.id,
    label: node.label,
    kind: node.kind,
    children: node.kind === "team" ? node.children.map(orgNodeToOutline) : [],
  };
}

/**
 * deploy view — every `DeployBlock` becomes a top-level entry, with its
 * (flat) deploy nodes as children. The user sees all blocks at once even
 * though the rendered diagram shows one selected block (Issue #1410).
 */
export function toDeployOutline(deployTree: DeployBlock[]): OutlineNode[] {
  return deployTree.map((block) => ({
    id: block.id,
    label: block.label,
    kind: "deploy-block",
    children: block.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      kind: node.kind,
      children: [],
    })),
  }));
}
