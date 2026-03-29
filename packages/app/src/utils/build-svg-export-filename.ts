import { sanitizeFilename } from "./sanitize-filename.js";
import type { ActiveView } from "../state/app-reducer.js";

interface DeployBlockItem {
  id: string;
  label?: string;
}

/**
 * Build the export filename for an SVG download based on the current view state.
 * Format: `{view}-{currentNodeName}.svg` or `{view}-{currentNodeName}-full.svg`
 *
 * - system: uses the last breadcrumb item as the node name
 * - deploy: uses the selected deploy block label (falls back to id, then view name)
 * - org: uses the last breadcrumb item, ignoring the "__org__" root sentinel
 */
export function buildSvgExportFilename(
  view: ActiveView,
  options: {
    breadcrumbItems?: { id: string; label: string }[];
    deployBlocks?: DeployBlockItem[];
    selectedDeployBlockId?: string | null;
    isFullView?: boolean;
  } = {},
): string {
  const { breadcrumbItems = [], deployBlocks = [], selectedDeployBlockId, isFullView } = options;

  let nodeName: string;

  if (view === "deploy") {
    const block = deployBlocks.find((b) => b.id === selectedDeployBlockId);
    nodeName = block ? sanitizeFilename(block.label ?? block.id, block.id) : view;
  } else {
    // For org view, "__org__" is a root sentinel — treat it as no selection
    const last = breadcrumbItems.at(-1);
    const isOrgSentinel = last?.id === "__org__";
    nodeName = last && !isOrgSentinel ? sanitizeFilename(last.label, last.id) : view;
  }

  const suffix = isFullView ? "-full" : "";
  return `${view}-${nodeName}${suffix}.svg`;
}
