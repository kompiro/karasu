import { useMemo } from "react";
import {
  buildDrillDownSvg,
  buildDrillDownSvgOrg,
  buildFullViewSvg,
  buildFullViewSvgOrg,
  type DisplayMode,
} from "@karasu/core";

export function useFullViewSvg(
  fileContent: string | undefined,
  displayMode: DisplayMode | undefined,
) {
  const drillDownSvg = useMemo(() => {
    if (!fileContent) return undefined;
    try {
      return buildDrillDownSvg(fileContent, undefined, displayMode);
    } catch {
      return undefined;
    }
  }, [fileContent, displayMode]);

  const fullViewSvg = useMemo(() => {
    if (!fileContent) return undefined;
    try {
      return buildFullViewSvg(fileContent, undefined, displayMode);
    } catch {
      return undefined;
    }
  }, [fileContent, displayMode]);

  const orgFullViewSvg = useMemo(() => {
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

  return { drillDownSvg, fullViewSvg, orgFullViewSvg, orgDrillDownSvg };
}
