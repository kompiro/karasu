import { sanitizeFilename } from "./sanitize-filename.js";
import type { ActiveView } from "../state/app-reducer.js";

interface DeployBlockItem {
  id: string;
  label?: string;
}

/**
 * Build the export filename for an SVG download based on the current view state.
 * Format: `{view}-{currentNodeName}.svg`
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
  } = {},
): string {
  const { breadcrumbItems = [], deployBlocks = [], selectedDeployBlockId } = options;

  let nodeName: string;

  if (view === "deploy") {
    // Fall back to first block when none is explicitly selected
    const block = deployBlocks.find((b) => b.id === selectedDeployBlockId) ?? deployBlocks[0];
    nodeName = block ? sanitizeFilename(block.label ?? block.id, block.id) : view;
  } else {
    const last = breadcrumbItems.at(-1);
    nodeName = last ? sanitizeFilename(last.label, last.id) : view;
  }

  return `${view}-${nodeName}.svg`;
}
