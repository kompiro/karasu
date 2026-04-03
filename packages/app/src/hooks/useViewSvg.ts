import { useMemo } from "react";
import {
  buildDrillDownSvg,
  buildDrillDownSvgOrg,
  buildFullViewSvg,
  buildFullViewSvgOrg,
  type DisplayMode,
} from "@karasu/core";

export function useViewSvg(fileContent: string | undefined, displayMode: DisplayMode | undefined) {
  const drillDownSvg = useMemo(() => {
    if (!fileContent) return undefined;
    try {
      return buildDrillDownSvg(fileContent, undefined, displayMode);
    } catch {
      return undefined;
    }
  }, [fileContent, displayMode]);

  const allLayersSvg = useMemo(() => {
    if (!fileContent) return undefined;
    try {
      return buildFullViewSvg(fileContent, undefined, displayMode);
    } catch {
      return undefined;
    }
  }, [fileContent, displayMode]);

  const orgAllLayersSvg = useMemo(() => {
    if (!fileContent) return undefined;
    try {
      return buildFullViewSvgOrg(fileContent, undefined, displayMode);
    } catch {
      return undefined;
    }
  }, [fileContent, displayMode]);

  const orgDrillDownSvg = useMemo(() => {
    if (!fileContent) return undefined;
    try {
      return buildDrillDownSvgOrg(fileContent, undefined, displayMode);
    } catch {
      return undefined;
    }
  }, [fileContent, displayMode]);

  return { drillDownSvg, allLayersSvg, orgAllLayersSvg, orgDrillDownSvg };
}
