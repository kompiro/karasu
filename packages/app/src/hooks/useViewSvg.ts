import { useMemo } from "react";
import {
  buildDrillDownSvg,
  buildDrillDownSvgOrg,
  buildAllLayersSvg,
  buildAllLayersSvgOrg,
  buildAllViewsSvg,
  type DisplayMode,
  type Diagnostic,
} from "@karasu/core";

export function useViewSvg(
  fileContent: string | undefined,
  displayMode: DisplayMode | undefined,
  styleSource?: string,
) {
  const drillDownResult = useMemo(() => {
    if (!fileContent) return undefined;
    try {
      return buildDrillDownSvg(fileContent, styleSource, displayMode);
    } catch {
      return undefined;
    }
  }, [fileContent, displayMode, styleSource]);

  const allLayersResult = useMemo(() => {
    if (!fileContent) return undefined;
    try {
      return buildAllLayersSvg(fileContent, styleSource, displayMode);
    } catch {
      return undefined;
    }
  }, [fileContent, displayMode, styleSource]);

  const orgAllLayersResult = useMemo(() => {
    if (!fileContent) return undefined;
    try {
      return buildAllLayersSvgOrg(fileContent, styleSource, displayMode);
    } catch {
      return undefined;
    }
  }, [fileContent, displayMode, styleSource]);

  const orgDrillDownResult = useMemo(() => {
    if (!fileContent) return undefined;
    try {
      return buildDrillDownSvgOrg(fileContent, styleSource, displayMode);
    } catch {
      return undefined;
    }
  }, [fileContent, displayMode, styleSource]);

  const allViewsResult = useMemo(() => {
    if (!fileContent) return undefined;
    try {
      return buildAllViewsSvg(fileContent, styleSource, displayMode);
    } catch {
      return undefined;
    }
  }, [fileContent, displayMode, styleSource]);

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
