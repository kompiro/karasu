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
import { DEBOUNCE_MS } from "./useDebouncedCompile.js";
import { useDebouncedValue } from "./useDebouncedValue.js";

/**
 * Run an export builder, mapping any parse/render failure to `undefined` —
 * the shared "best effort" contract of every builder in this hook: a broken
 * source simply yields no exported SVG.
 */
function safeBuild<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

/** A builder's result, computed on the first call and remembered for the rest. */
function lazy<T>(build: () => T): () => T | undefined {
  let cached: { value: T | undefined } | null = null;
  return () => (cached ??= { value: safeBuild(build) }).value;
}

/** A getter that never has anything to build (no content yet). */
const NOTHING = (): undefined => undefined;

/** Stable identity for "no diagnostics", so consumers can memoize on it. */
const EMPTY_DIAGNOSTICS: Diagnostic[] = [];

export interface ViewSvgOptions {
  /**
   * The All-layers panel is open, so its SVG is on screen and has to exist:
   * it is rebuilt whenever the settled content changes while the panel is
   * open, and never while the panel is closed.
   */
  allLayersOpen?: boolean;
}

/**
 * The export bundles and the live entity view of the current file.
 *
 * #2758: every whole-model bundle (drill-down, all-layers, all-views) walks
 * every level of the model — on a 10k-line model each takes seconds in the
 * browser — and nothing on screen needs one until the reader asks for it.
 * So the bundles are **built on demand**: the hook returns getters that build
 * on their first call and remember the result until an input changes. An
 * export click pays for its own bundle once; typing pays nothing. The
 * exception is the All-layers panel, whose SVG is on screen while it is open,
 * so that one is built eagerly, and only, while `allLayersOpen` is true.
 *
 * Content-derived inputs are additionally *settled* first (unchanged for
 * `DEBOUNCE_MS`, the window `useDebouncedCompile` gives the visible view), so
 * an open All-layers panel and the live entity view follow the same edit the
 * diagram compiled, not every keystroke, and a pending build is dropped when
 * a newer edit arrives (#1534). Everything else — displayMode, theme, groupBy,
 * selectedFacets, viewPath, labels — stays live: those are cheap toggles, and
 * the export must show what the screen shows (TPL-219).
 */
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
  options: ViewSvgOptions = {},
) {
  const { allLayersOpen = false } = options;
  const emptyStateLabels = useEmptyStateLabels();
  const badgeLabels = useAnnotationBadgeLabels();
  // Newline-joined so it can't collide across segment boundaries (node ids
  // never contain newlines): ["a","bc"] and ["ab","c"] map to distinct keys.
  const viewPathKey = (viewPath ?? []).join("\n");

  // The two content-derived inputs travel as one memoized pair so they never
  // disagree (a `.krs.style` from the next edit paired with the previous
  // `.krs`).
  const liveContent = useMemo(() => ({ fileContent, styleSource }), [fileContent, styleSource]);
  const { fileContent: settledContent, styleSource: settledStyleSource } = useDebouncedValue(
    liveContent,
    DEBOUNCE_MS,
  );

  // On-demand bundles. Each getter is re-created when an input changes, which
  // forgets the previous result; nothing runs until a caller asks.
  const getDrillDownSvg = useMemo(() => {
    if (!settledContent) return NOTHING;
    return lazy(
      () =>
        buildDrillDownSvg(
          settledContent,
          settledStyleSource,
          displayMode,
          emptyStateLabels,
          theme,
          badgeLabels,
          groupBy,
          selectedFacets,
        ).svg,
    );
  }, [
    settledContent,
    displayMode,
    settledStyleSource,
    emptyStateLabels,
    theme,
    badgeLabels,
    groupBy,
    selectedFacets,
  ]);

  const getAllViewsSvg = useMemo(() => {
    if (!settledContent) return NOTHING;
    return lazy(
      () =>
        buildAllViewsSvg(
          settledContent,
          settledStyleSource,
          displayMode,
          emptyStateLabels,
          theme,
          badgeLabels,
          groupBy,
          selectedFacets,
        ).svg,
    );
  }, [
    settledContent,
    displayMode,
    settledStyleSource,
    emptyStateLabels,
    theme,
    badgeLabels,
    groupBy,
    selectedFacets,
  ]);

  // Org builders take no `groupBy` — grouping is a system-view concept.
  const getOrgDrillDownSvg = useMemo(() => {
    if (!settledContent) return NOTHING;
    return lazy(
      () =>
        buildDrillDownSvgOrg(
          settledContent,
          settledStyleSource,
          displayMode,
          emptyStateLabels,
          theme,
          badgeLabels,
        ).svg,
    );
  }, [settledContent, displayMode, settledStyleSource, emptyStateLabels, theme, badgeLabels]);

  // The All-layers panel's content: built while the panel is open, on the
  // settled content, and not at all while it is closed.
  const allLayersResult = useMemo(() => {
    if (!settledContent || !allLayersOpen) return undefined;
    return safeBuild(() =>
      buildAllLayersSvg(
        settledContent,
        settledStyleSource,
        displayMode,
        emptyStateLabels,
        theme,
        badgeLabels,
        groupBy,
        selectedFacets,
      ),
    );
  }, [
    allLayersOpen,
    settledContent,
    displayMode,
    settledStyleSource,
    emptyStateLabels,
    theme,
    badgeLabels,
    groupBy,
    selectedFacets,
  ]);

  const orgAllLayersResult = useMemo(() => {
    if (!settledContent || !allLayersOpen) return undefined;
    return safeBuild(() =>
      buildAllLayersSvgOrg(
        settledContent,
        settledStyleSource,
        displayMode,
        emptyStateLabels,
        theme,
        badgeLabels,
      ),
    );
  }, [
    allLayersOpen,
    settledContent,
    displayMode,
    settledStyleSource,
    emptyStateLabels,
    theme,
    badgeLabels,
  ]);

  // The live, single-level entity view of the drilled domain. Scoped to the
  // current viewPath (unlike the whole-model export builders), so it recomputes
  // as the user drills. `renderEntityView` returns the empty-diagram
  // placeholder when the path is not a domain that owns entities; we surface a
  // `hasEntityView` flag (real entity nodes present) so the UI can gate the
  // usecase/entity toggle to domains that actually have an entity view.
  // Fed the settled content too, so it lands on the same edit as the compiled
  // system view: the screen and the export stay in step.
  const entityViewResult = useMemo(() => {
    if (!settledContent || (viewPath ?? []).length === 0) return undefined;
    return safeBuild(() =>
      renderEntityView(
        settledContent,
        viewPath ?? [],
        settledStyleSource,
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
    settledContent,
    viewPathKey,
    displayMode,
    settledStyleSource,
    emptyStateLabels,
    theme,
    badgeLabels,
    groupBy,
  ]);

  return {
    /** Build (once per settled input set) and return the system drill-down bundle. */
    getDrillDownSvg,
    /** Build (once per settled input set) and return the org drill-down bundle. */
    getOrgDrillDownSvg,
    /** Build (once per settled input set) and return the all-views bundle. */
    getAllViewsSvg,
    /** Present while the All-layers panel is open; `undefined` while it is closed. */
    allLayersSvg: allLayersResult?.svg,
    orgAllLayersSvg: orgAllLayersResult?.svg,
    /**
     * There is settled content to build a bundle from. What the export
     * controls enable on; the host may narrow it further (parse errors).
     */
    exportAvailable: !!settledContent,
    entityViewSvg: entityViewResult?.svg,
    /**
     * The entity view's own diagnostics — parse errors plus the boundary
     * memberships this view could not draw (#2179). They used to be dropped
     * here, which left the entity pane the one diagram surface that showed a
     * stale SVG with no banner explaining why (#2800).
     */
    entityViewDiagnostics: entityViewResult?.diagnostics ?? EMPTY_DIAGNOSTICS,
    // Structured signal from core: the path resolved to a domain that owns
    // entities (not the empty-diagram placeholder). Gates the usecase/entity
    // toggle without scanning the rendered SVG text.
    hasEntityView: entityViewResult?.hasContent ?? false,
  };
}
