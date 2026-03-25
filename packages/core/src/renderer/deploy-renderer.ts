import type { ResolvedNodeStyle, ResolvedStyles } from "../types/style.js";
import type { DeployNodeKind } from "../types/ast.js";
import type { DeployViewSlice } from "../view/deploy-view-extract.js";
import { layoutDeploy } from "./deploy-layout.js";
import { renderFromLayout } from "./svg-renderer.js";

const KIND_COLORS: Record<DeployNodeKind, { bg: string; border: string }> = {
  oci: { bg: "#1E3A5F", border: "#3B82F6" },
  lambda: { bg: "#3B1F5F", border: "#A855F7" },
  jar: { bg: "#1F3B2A", border: "#22C55E" },
  war: { bg: "#3B2A1F", border: "#F97316" },
  function: { bg: "#2D3B1F", border: "#EAB308" },
  assets: { bg: "#1F3B3B", border: "#06B6D4" },
  job: { bg: "#3B2222", border: "#EF4444" },
  artifact: { bg: "#2D2D2D", border: "#9CA3AF" },
};

function getDeployNodeStyle(kind: DeployNodeKind, base: ResolvedNodeStyle): ResolvedNodeStyle {
  const colors = KIND_COLORS[kind] ?? { bg: base.backgroundColor, border: base.borderColor };
  return {
    ...base,
    backgroundColor: colors.bg,
    borderColor: colors.border,
    badgeLabel: kind,
    badgeColor: colors.border,
  };
}

/**
 * Renders a deploy diagram SVG from a DeployViewSlice.
 * Deploy units are grouped by `realizes` service into labeled containers.
 * System-level edges are shown as ghost edges between containers.
 */
export function renderDeploy(slice: DeployViewSlice, styles: ResolvedStyles): string {
  const layoutResult = layoutDeploy(slice);

  // Build per-unit style overrides keyed by unit id
  const allUnits = [...slice.containers.flatMap((c) => c.units), ...slice.unclassifiedUnits];
  const nodeStyleOverrides = new Map<string, ResolvedNodeStyle>();
  for (const unit of allUnits) {
    nodeStyleOverrides.set(unit.id, getDeployNodeStyle(unit.kind, styles.defaultNodeStyle));
  }

  const deployStyles: ResolvedStyles = {
    ...styles,
    nodes: nodeStyleOverrides,
  };

  return renderFromLayout(layoutResult, deployStyles, slice.deployLabel || undefined);
}
