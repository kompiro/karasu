import { useMemo } from "react";
import {
  buildDrillDownSvg,
  buildDrillDownSvgOrg,
  buildAllLayersSvg,
  buildAllLayersSvgOrg,
  buildAllViewsSvg,
  renderEntityView,
  type DisplayMode,
  type DiagramTheme,
  type Diagnostic,
} from "@karasu-tools/core";
import { useEmptyStateLabels } from "../i18n/use-empty-state-labels.js";
import { useAnnotationBadgeLabels } from "../i18n/use-annotation-badge-labels.js";

export function useViewSvg(
  fileContent: string | undefined,
  displayMode: DisplayMode | undefined,
  styleSource?: string,
  theme?: DiagramTheme,
  groupBy?: "team" | "boundary",
  // The current system-view drill path — drives the live entity view, which is
  // scoped to the drilled domain (unlike the whole-model export builders above).
  viewPath?: string[],
) {
  const emptyStateLabels = useEmptyStateLabels();
  const badgeLabels = useAnnotationBadgeLabels();
  // Newline-joined so it can't collide across segment boundaries (node ids
  // never contain newlines): ["a","bc"] and ["ab","c"] map to distinct keys.
  const viewPathKey = (viewPath ?? []).join("\n");
  const drillDownResult = useMemo(() => {
    if (!fileContent) return undefined;
    try {
      return buildDrillDownSvg(
        fileContent,
        styleSource,
        displayMode,
        emptyStateLabels,
        theme,
        badgeLabels,
        groupBy,
      );
    } catch {
      return undefined;
    }
  }, [fileContent, displayMode, styleSource, emptyStateLabels, theme, badgeLabels, groupBy]);

  const allLayersResult = useMemo(() => {
    if (!fileContent) return undefined;
    try {
      return buildAllLayersSvg(
        fileContent,
        styleSource,
        displayMode,
        emptyStateLabels,
        theme,
        badgeLabels,
        groupBy,
      );
    } catch {
      return undefined;
    }
  }, [fileContent, displayMode, styleSource, emptyStateLabels, theme, badgeLabels, groupBy]);

  const orgAllLayersResult = useMemo(() => {
    if (!fileContent) return undefined;
    try {
      return buildAllLayersSvgOrg(
        fileContent,
        styleSource,
        displayMode,
        emptyStateLabels,
        theme,
        badgeLabels,
      );
    } catch {
      return undefined;
    }
  }, [fileContent, displayMode, styleSource, emptyStateLabels, theme, badgeLabels]);

  const orgDrillDownResult = useMemo(() => {
    if (!fileContent) return undefined;
    try {
      return buildDrillDownSvgOrg(
        fileContent,
        styleSource,
        displayMode,
        emptyStateLabels,
        theme,
        badgeLabels,
      );
    } catch {
      return undefined;
    }
  }, [fileContent, displayMode, styleSource, emptyStateLabels, theme, badgeLabels]);

  const allViewsResult = useMemo(() => {
    if (!fileContent) return undefined;
    try {
      return buildAllViewsSvg(
        fileContent,
        styleSource,
        displayMode,
        emptyStateLabels,
        theme,
        badgeLabels,
        groupBy,
      );
    } catch {
      return undefined;
    }
  }, [fileContent, displayMode, styleSource, emptyStateLabels, theme, badgeLabels, groupBy]);

  // The live, single-level entity view of the drilled domain. Scoped to the
  // current viewPath (unlike the whole-model export builders), so it recomputes
  // as the user drills. `renderEntityView` returns the empty-diagram
  // placeholder when the path is not a domain that owns entities; we surface a
  // `hasEntityView` flag (real entity nodes present) so the UI can gate the
  // usecase/entity toggle to domains that actually have an entity view.
  const entityViewResult = useMemo(() => {
    if (!fileContent || (viewPath ?? []).length === 0) return undefined;
    try {
      return renderEntityView(
        fileContent,
        viewPath ?? [],
        styleSource,
        displayMode,
        emptyStateLabels,
        theme,
        badgeLabels,
      );
    } catch {
      return undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- viewPathKey stands in for the viewPath array identity
  }, [fileContent, viewPathKey, displayMode, styleSource, emptyStateLabels, theme, badgeLabels]);

  // All functions parse the same styleSource, so diagnostics are identical.
  // Take from the first available result to avoid duplication.
  const styleDiagnostics: Diagnostic[] = drillDownResult?.diagnostics ?? [];

  return {
    drillDownSvg: drillDownResult?.svg,
    allLayersSvg: allLayersResult?.svg,
    orgAllLayersSvg: orgAllLayersResult?.svg,
    orgDrillDownSvg: orgDrillDownResult?.svg,
    allViewsSvg: allViewsResult?.svg,
    entityViewSvg: entityViewResult?.svg,
    // Structured signal from core: the path resolved to a domain that owns
    // entities (not the empty-diagram placeholder). Gates the usecase/entity
    // toggle without scanning the rendered SVG text.
    hasEntityView: entityViewResult?.hasContent ?? false,
    styleDiagnostics,
  };
}
