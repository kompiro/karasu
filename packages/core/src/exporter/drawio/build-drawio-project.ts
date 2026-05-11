import type { FileSystemProvider } from "../../fs/types.js";
import { ImportResolver } from "../../fs/import-resolver.js";
import type { Diagnostic } from "../../types/ast.js";
import type { Warning } from "../../types/warnings.js";
import type { KrsFile, KrsNode, OrganizationBlock, TeamNode } from "../../types/ast.js";
import { extractView } from "../../view/view-extract.js";
import { extractDeployView } from "../../view/deploy-view-extract.js";
import { withUnassignedSystem } from "../../view/unassigned-system.js";
import { layout } from "../../renderer/layout.js";
import { layoutDeploy } from "../../renderer/deploy-layout.js";
import { analyze } from "../../resolver/warnings.js";
import { getBuiltinStyleSheet } from "../../builtins/default-style.js";
import { exportDrawio, type DrawioNodeMeta, type DrawioPage } from "./drawio-exporter.js";
import { layoutOrganization } from "./org-layout.js";

/**
 * Walk the logical node tree and collect tags/annotations for every node id.
 * Used so the draw.io exporter can show badges on both leaf nodes (LayoutNode)
 * and containers (ContainerRect) that do not carry these fields directly.
 */
function collectLogicalMeta(nodes: KrsNode[], into: Map<string, DrawioNodeMeta>): void {
  for (const node of nodes) {
    into.set(node.id, {
      tags: node.tags.length > 0 ? [...node.tags] : undefined,
      annotations: node.annotations.length > 0 ? [...node.annotations] : undefined,
    });
    if (node.children.length > 0) {
      collectLogicalMeta(node.children, into);
    }
  }
}

/** Which karasu views to emit as draw.io pages. Defaults to all supported views. */
export type DrawioViewSelection = "all" | "system" | "deploy" | "org";

export interface BuildDrawioOptions {
  /** Which view(s) to include. Defaults to "all". */
  view?: DrawioViewSelection;
}

export interface DrawioBuildResult {
  xml: string;
  diagnostics: Diagnostic[];
  warnings: Warning[];
}

/**
 * Build a draw.io (mxGraph XML) export from a parsed/resolved `KrsFile`.
 * Emits a page per karasu view, including drill-down levels under the
 * system view so each layer becomes its own tab in draw.io.
 */
export function buildDrawio(krsFile: KrsFile, options: BuildDrawioOptions = {}): string {
  const view = options.view ?? "all";
  const pages: DrawioPage[] = [];

  if (view === "all" || view === "system") {
    pages.push(...buildSystemPages(krsFile));
  }

  if (view === "all" || view === "deploy") {
    const deployPage = buildDeployPage(krsFile);
    if (deployPage) pages.push(deployPage);
  }

  if (view === "all" || view === "org") {
    pages.push(...buildOrgPages(krsFile));
  }

  return exportDrawio({ pages });
}

export async function buildDrawioProject(
  entryPath: string,
  fs: FileSystemProvider,
  options: BuildDrawioOptions = {},
): Promise<DrawioBuildResult> {
  const resolver = new ImportResolver(fs);
  const resolved = await resolver.resolve(entryPath);
  const diagnostics = [...resolved.diagnostics];
  const warnings = analyze(resolved.krsFile, [getBuiltinStyleSheet()], 1);
  const xml = buildDrawio(resolved.krsFile, options);
  return { xml, diagnostics, warnings };
}

/**
 * Emit a page per drill-down level. The top-level page shows all systems;
 * for every system / service / domain / usecase that has children, a further
 * page is emitted showing that container's inner view.
 */
function buildSystemPages(krsFile: KrsFile): DrawioPage[] {
  if (krsFile.systems.length === 0) return [];
  const pages: DrawioPage[] = [];
  const metadata = new Map<string, DrawioNodeMeta>();
  collectLogicalMeta(krsFile.systems, metadata);
  const labelById = new Map<string, string>();
  collectLogicalLabels(krsFile.systems, labelById);

  const emit = (viewPath: string[]): void => {
    const slice = extractView(krsFile.systems, viewPath, krsFile.domains);
    const layoutResult = layout(slice, krsFile.ownerIndex);
    if (layoutResult.nodes.size === 0 && layoutResult.containers.length === 0) return;
    const id = viewPath.length === 0 ? "system" : `system:${viewPath.join(".")}`;
    const name =
      viewPath.length === 0
        ? "System"
        : `System ▸ ${viewPath.map((segId) => labelById.get(segId) ?? segId).join(" ▸ ")}`;
    pages.push({ id, name, layout: layoutResult, metadata });
  };

  // Top-level view
  emit([]);

  // Recursively emit drill-down pages for drillable kinds that have children.
  const walk = (nodes: KrsNode[], viewPath: string[]): void => {
    for (const node of nodes) {
      if (!isDrillable(node.kind) || node.children.length === 0) continue;
      const nextPath = [...viewPath, node.id];
      emit(nextPath);
      walk(node.children, nextPath);
    }
  };
  walk(krsFile.systems, []);

  return pages;
}

function isDrillable(kind: string): boolean {
  return kind === "system" || kind === "service" || kind === "domain" || kind === "usecase";
}

function collectLogicalLabels(nodes: KrsNode[], into: Map<string, string>): void {
  for (const node of nodes) {
    into.set(node.id, node.label ?? node.id);
    if (node.children.length > 0) collectLogicalLabels(node.children, into);
  }
}

function buildDeployPage(krsFile: KrsFile): DrawioPage | null {
  if (krsFile.deploys.length === 0) return null;
  // Orphan-wrap so `realizes` targets pointing at top-level (unassigned)
  // services/domains resolve to their declared labels, and so the metadata
  // map below picks up the orphans' tags/annotations.
  const effectiveSystems = withUnassignedSystem(krsFile);
  const slice = extractDeployView(krsFile.deploys, effectiveSystems);
  const layoutResult = layoutDeploy(slice);
  const metadata = new Map<string, DrawioNodeMeta>();
  // Deploy containers are keyed by the realized service id, so the logical
  // tree provides their tags/annotations.
  collectLogicalMeta(effectiveSystems, metadata);
  return { id: "deploy", name: "Deploy", layout: layoutResult, metadata };
}

function buildOrgPages(krsFile: KrsFile): DrawioPage[] {
  if (krsFile.organizations.length === 0) return [];
  return krsFile.organizations.map((org) => {
    const layoutResult = layoutOrganization(org);
    const id = krsFile.organizations.length === 1 ? "org" : `org:${org.id}`;
    const name =
      krsFile.organizations.length === 1 ? "Organization" : `Organization ▸ ${org.label ?? org.id}`;
    return { id, name, layout: layoutResult, metadata: collectOrgMeta(org) };
  });
}

function collectOrgMeta(org: OrganizationBlock): Map<string, DrawioNodeMeta> {
  const meta = new Map<string, DrawioNodeMeta>();
  const walk = (team: TeamNode): void => {
    // Team nodes in the AST don't carry tags/annotations today, so we just
    // register presence (empty meta) to avoid undefined lookups.
    meta.set(team.id, {});
    for (const child of team.children) {
      if (child.kind === "team") walk(child);
      else meta.set(child.id, {});
    }
  };
  for (const team of org.teams) walk(team);
  return meta;
}
