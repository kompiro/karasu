import { FACET_OVERLAY_COLORS } from "@karasu-tools/core";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { usePreview } from "../state/preview-context.js";
import { useActiveViewData } from "../state/active-view-data.js";
import { useTranslation } from "../i18n/index.js";
import { availableGroupByAxes, isGroupByMode } from "./preview-group-by.js";

/**
 * The controls that change the drawn diagram, floating over the diagram they
 * change (#2317).
 *
 * The split with `PreviewToolbar` follows one rule: **a control that changes
 * the diagram lives here, a control that takes the diagram elsewhere lives in
 * the toolbar.** That is what keeps the toolbar to one row — it used to carry
 * both families and wrapped to two rows at any ordinary width, in either
 * locale. Show All Layers is on this side despite reading like an export: it
 * swaps the diagram being drawn.
 *
 * Every control here is conditional on the model or the active view, so a bare
 * model shows a short bar and a rich one a full bar; the bar wraps to a second
 * row rather than spilling out of the column (see `.preview-canvas-controls`).
 */
export function PreviewCanvasControls({
  onOpenFacetOverview,
}: {
  /** Opens the facet audit panel — its state belongs to `PreviewColumn`. */
  onOpenFacetOverview: () => void;
}) {
  const {
    activeView,
    displayMode,
    onDisplayModeChange,
    isAllLayersOpen,
    onAllLayersToggle,
    isOrgTreeViewOpen,
    onOrgTreeViewToggle,
    isEntityViewOpen,
    onEntityViewToggle,
    hasEntityView,
  } = usePreview();
  const view = useActiveViewData();
  const { t } = useTranslation();
  const groupByAxes = availableGroupByAxes(view);
  const allLayersAvailable = activeView !== "deploy" && !!view.allLayersSvg;

  return (
    <div className="preview-canvas-controls">
      <Button
        variant="actionable"
        aria-pressed={displayMode === "icon"}
        onClick={() => onDisplayModeChange(displayMode === "icon" ? "shape" : "icon")}
        aria-label={t("preview.iconMode.ariaLabel")}
      >
        ◇ {t("preview.iconMode.label")}
      </Button>
      {activeView === "system" && groupByAxes.length > 0 && (
        <span className="group-by-selector-label">
          <label htmlFor="group-by-select">{t("preview.groupBy.label")}</label>
          <select
            id="group-by-select"
            className="group-by-selector"
            value={view.groupBy ?? "none"}
            onChange={(e) => {
              if (isGroupByMode(e.target.value)) view.onGroupByChange?.(e.target.value);
            }}
          >
            <option value="none">{t("preview.groupBy.none")}</option>
            {groupByAxes.map(([mode, axis]) => (
              <option key={mode} value={mode}>
                {axis.label(t)}
              </option>
            ))}
          </select>
        </span>
      )}
      {activeView === "system" && (view.facets?.length ?? 0) > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="actionable" aria-pressed={(view.selectedFacets?.length ?? 0) > 0}>
              {(view.selectedFacets?.length ?? 0) > 0
                ? t("preview.facets.active", { count: view.selectedFacets?.length ?? 0 })
                : `◎ ${t("preview.facets.label")}`}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {view.facets?.map((facet, i) => {
              const selected = view.selectedFacets?.includes(facet.id) ?? false;
              return (
                <DropdownMenuItem
                  key={facet.id}
                  // Radix closes on select; the selector is multi-select, so
                  // keep it open for the next tick of the same decision.
                  onSelect={(e) => {
                    e.preventDefault();
                    view.onFacetToggle?.(facet.id);
                  }}
                  aria-checked={selected}
                  role="menuitemcheckbox"
                >
                  <span
                    className="facet-swatch"
                    style={{
                      // Same palette the renderer uses, indexed the same way
                      // — `facets` arrives in known-facet order, so the dot
                      // and the ring can never disagree.
                      background: FACET_OVERLAY_COLORS[i % FACET_OVERLAY_COLORS.length],
                    }}
                    aria-hidden="true"
                  />
                  {selected ? "✓ " : "  "}
                  {facet.label ?? facet.id}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            {/* The audit surface. Membership is written element-side, so the
                centralized "who is in facet X" list is derived — and it is
                reached from the same control that selects facets, because
                that is where someone asking the question already is (#2177). */}
            <DropdownMenuItem onSelect={onOpenFacetOverview}>
              ▤ {t("facetOverview.open")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {activeView === "system" && view.anyCollapsible && (
        <Button
          variant="actionable"
          aria-pressed={view.allCollapsed}
          onClick={() => view.onCollapseAllToggle?.()}
          aria-label={
            view.allCollapsed ? t("preview.groupBy.expandAll") : t("preview.groupBy.collapseAll")
          }
        >
          {view.allCollapsed
            ? `⊕ ${t("preview.groupBy.expandAll")}`
            : `⊖ ${t("preview.groupBy.collapseAll")}`}
        </Button>
      )}
      {activeView === "org" && (
        <Button
          variant="actionable"
          aria-pressed={isOrgTreeViewOpen}
          onClick={onOrgTreeViewToggle}
          aria-label={t("preview.orgTree.ariaLabel")}
        >
          ⬡ {t("preview.orgTree.label")}
        </Button>
      )}
      {activeView === "system" && hasEntityView && (
        <Button
          variant="actionable"
          aria-pressed={isEntityViewOpen}
          onClick={onEntityViewToggle}
          aria-label={t("preview.entities.ariaLabel")}
        >
          ◇ {t("preview.entities.label")}
        </Button>
      )}
      <Button
        variant="actionable"
        aria-pressed={isAllLayersOpen}
        onClick={onAllLayersToggle}
        aria-label={t("preview.allLayers.ariaLabel")}
        disabled={!allLayersAvailable}
      >
        ⊞ {t("preview.allLayers.label")}
      </Button>
      {activeView === "system" && view.expansionOverload && (
        <span role="status" className="preview-expansion-hint text-[11px] text-amber-500/90">
          ⚠ {t("preview.expansion.overloadHint")}
        </span>
      )}
    </div>
  );
}
