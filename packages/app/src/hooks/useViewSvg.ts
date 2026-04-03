import { useMemo } from "react";
import {
  buildDrillDownSvg,
  buildDrillDownSvgOrg,
  buildFullViewSvg,
  buildFullViewSvgOrg,
  type DisplayMode,
} from "@karasu/core";

export function useViewSvg(
  fileContent: string | undefined,
  displayMode: DisplayMode | undefined,
  styleSource?: string,
) {
  const drillDownSvg = useMemo(() => {
    if (!fileContent) return undefined;
    try {
      return buildDrillDownSvg(fileContent, styleSource, displayMode);
    } catch {
      return undefined;
    }
  }, [fileContent, displayMode, styleSource]);

  const allLayersSvg = useMemo(() => {
    if (!fileContent) return undefined;
    try {
      return buildFullViewSvg(fileContent, styleSource, displayMode);
    } catch {
      return undefined;
    }
  }, [fileContent, displayMode, styleSource]);

  const orgAllLayersSvg = useMemo(() => {
    if (!fileContent) return undefined;
    try {
      return buildFullViewSvgOrg(fileContent, styleSource, displayMode);
    } catch {
      return undefined;
    }
  }, [fileContent, displayMode, styleSource]);

  const orgDrillDownSvg = useMemo(() => {
    if (!fileContent) return undefined;
    try {
      return buildDrillDownSvgOrg(fileContent, styleSource, displayMode);
    } catch {
      return undefined;
    }
  }, [fileContent, displayMode, styleSource]);

  return { drillDownSvg, allLayersSvg, orgAllLayersSvg, orgDrillDownSvg };
}
