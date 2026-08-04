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
} from "@karasu-tools/core";
import { useEmptyStateLabels } from "../i18n/use-empty-state-labels.js";
import { useAnnotationBadgeLabels } from "../i18n/use-annotation-badge-labels.js";

/**
 * Run an export builder, mapping any parse/render failure to `undefined` —
 * the shared "best effort" contract of every memo in this hook: a broken
 * source simply yields no exported SVG.
 */
function safeBuild<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

export function useViewSvg(
  fileContent: string | undefined,
  displayMode: DisplayMode | undefined,
  styleSource?: string,
  theme?: DiagramTheme,
  groupBy?: "team" | "boundary",
  // The current system-view drill path — drives the live entity view, which is
  // scoped to the drilled domain (unlike the whole-model export builders above).
  viewPath?: string[],
  /**
   * Facets selected for the overlay (#2174). An export must show what the
   * screen shows — a reader who highlights PII and hits Export expects the
   * export to carry it (TPL-219).
   *
   * Appended rather than slotted next to `groupBy`: every caller passes these
   * positionally, so inserting mid-list silently shifts `viewPath` — which is
   * exactly what happened on the first attempt, and the entity-view tests are
   * what caught it.
   */
  selectedFacets?: readonly string[],
) {
  const emptyStateLabels = useEmptyStateLabels();
  const badgeLabels = useAnnotationBadgeLabels();
  // Newline-joined so it can't collide across segment boundaries (node ids
  // never contain newlines): ["a","bc"] and ["ab","c"] map to distinct keys.
  const viewPathKey = (viewPath ?? []).join("\n");

  const drillDownResult = useMemo(() => {
    if (!fileContent) return undefined;
    return safeBuild(() =>
      buildDrillDownSvg(
        fileContent,
        styleSource,
        displayMode,
        emptyStateLabels,
        theme,
        badgeLabels,
        groupBy,
        selectedFacets,
      ),
    );
  }, [
    fileContent,
    displayMode,
    styleSource,
    emptyStateLabels,
    theme,
    badgeLabels,
    groupBy,
    selectedFacets,
  ]);

  const allLayersResult = useMemo(() => {
    if (!fileContent) return undefined;
    return safeBuild(() =>
      buildAllLayersSvg(
        fileContent,
        styleSource,
        displayMode,
        emptyStateLabels,
        theme,
        badgeLabels,
        groupBy,
        selectedFacets,
      ),
    );
  }, [
    fileContent,
    displayMode,
    styleSource,
    emptyStateLabels,
    theme,
    badgeLabels,
    groupBy,
    selectedFacets,
  ]);

  // Org builders take no `groupBy` — grouping is a system-view concept.
  const orgAllLayersResult = useMemo(() => {
    if (!fileContent) return undefined;
    return safeBuild(() =>
      buildAllLayersSvgOrg(
        fileContent,
        styleSource,
        displayMode,
        emptyStateLabels,
        theme,
        badgeLabels,
      ),
    );
  }, [fileContent, displayMode, styleSource, emptyStateLabels, theme, badgeLabels]);

  const orgDrillDownResult = useMemo(() => {
    if (!fileContent) return undefined;
    return safeBuild(() =>
      buildDrillDownSvgOrg(
        fileContent,
        styleSource,
        displayMode,
        emptyStateLabels,
        theme,
        badgeLabels,
      ),
    );
  }, [fileContent, displayMode, styleSource, emptyStateLabels, theme, badgeLabels]);

  const allViewsResult = useMemo(() => {
    if (!fileContent) return undefined;
    return safeBuild(() =>
      buildAllViewsSvg(
        fileContent,
        styleSource,
        displayMode,
        emptyStateLabels,
        theme,
        badgeLabels,
        groupBy,
        selectedFacets,
      ),
    );
  }, [
    fileContent,
    displayMode,
    styleSource,
    emptyStateLabels,
    theme,
    badgeLabels,
    groupBy,
    selectedFacets,
  ]);

  // The live, single-level entity view of the drilled domain. Scoped to the
  // current viewPath (unlike the whole-model export builders), so it recomputes
  // as the user drills. `renderEntityView` returns the empty-diagram
  // placeholder when the path is not a domain that owns entities; we surface a
  // `hasEntityView` flag (real entity nodes present) so the UI can gate the
  // usecase/entity toggle to domains that actually have an entity view.
  const entityViewResult = useMemo(() => {
    if (!fileContent || (viewPath ?? []).length === 0) return undefined;
    return safeBuild(() =>
      renderEntityView(
        fileContent,
        viewPath ?? [],
        styleSource,
        displayMode,
        emptyStateLabels,
        theme,
        badgeLabels,
        groupBy,
        selectedFacets,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- viewPathKey stands in for the viewPath array identity
  }, [
    fileContent,
    viewPathKey,
    displayMode,
    styleSource,
    emptyStateLabels,
    theme,
    badgeLabels,
    groupBy,
  ]);

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
  };
}
