import { useMemo } from "react";
import {
  buildDrillDownSvg,
  buildDrillDownSvgOrg,
  buildAllLayersSvg,
  buildAllLayersSvgOrg,
  buildAllViewsSvg,
  type DisplayMode,
  type Diagnostic,
} from "@karasu-tools/core";
import { useEmptyStateLabels } from "../i18n/use-empty-state-labels.js";

export function useViewSvg(
  fileContent: string | undefined,
  displayMode: DisplayMode | undefined,
  styleSource?: string,
) {
  const emptyStateLabels = useEmptyStateLabels();
  const drillDownResult = useMemo(() => {
    if (!fileContent) return undefined;
    try {
      return buildDrillDownSvg(fileContent, styleSource, displayMode, emptyStateLabels);
    } catch {
      return undefined;
    }
  }, [fileContent, displayMode, styleSource, emptyStateLabels]);

  const allLayersResult = useMemo(() => {
    if (!fileContent) return undefined;
    try {
      return buildAllLayersSvg(fileContent, styleSource, displayMode, emptyStateLabels);
    } catch {
      return undefined;
    }
  }, [fileContent, displayMode, styleSource, emptyStateLabels]);

  const orgAllLayersResult = useMemo(() => {
    if (!fileContent) return undefined;
    try {
      return buildAllLayersSvgOrg(fileContent, styleSource, displayMode, emptyStateLabels);
    } catch {
      return undefined;
    }
  }, [fileContent, displayMode, styleSource, emptyStateLabels]);

  const orgDrillDownResult = useMemo(() => {
    if (!fileContent) return undefined;
    try {
      return buildDrillDownSvgOrg(fileContent, styleSource, displayMode, emptyStateLabels);
    } catch {
      return undefined;
    }
  }, [fileContent, displayMode, styleSource, emptyStateLabels]);

  const allViewsResult = useMemo(() => {
    if (!fileContent) return undefined;
    try {
      return buildAllViewsSvg(fileContent, styleSource, displayMode, emptyStateLabels);
    } catch {
      return undefined;
    }
  }, [fileContent, displayMode, styleSource, emptyStateLabels]);

  // All functions parse the same styleSource, so diagnostics are identical.
  // Take from the first available result to avoid duplication.
  const styleDiagnostics: Diagnostic[] = drillDownResult?.diagnostics ?? [];

  return {
    drillDownSvg: drillDownResult?.svg,
    allLayersSvg: allLayersResult?.svg,
    orgAllLayersSvg: orgAllLayersResult?.svg,
    orgDrillDownSvg: orgDrillDownResult?.svg,
    allViewsSvg: allViewsResult?.svg,
    styleDiagnostics,
  };
}
