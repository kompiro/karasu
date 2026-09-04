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
 * The controls that change the drawn diagram, sharing the drill path's row
 * directly above the diagram (#2317).
 *
 * The split with `PreviewToolbar` follows one rule: **a control that changes
 * the diagram lives here, a control that takes the diagram elsewhere lives in
 * the toolbar.** That is what keeps the toolbar to one row — it used to carry
 * both families and wrapped to two rows at any ordinary width, in either
 * locale. Show All Layers is on this side despite reading like an export: it
 * swaps the diagram being drawn.
 *
 * Icon mode is the one deliberate exception. It changes the diagram, so by the
 * rule above it belongs here, but it moved to the Settings tab's Display
 * section (#2376) — the node redesign (#2366) removed the reasons it was
 * introduced for, so it no longer earns a place in the main flow. Taking it
 * out of the way, not the placement rule, is why it left; nothing else
 * follows it.
 *
 * These sit in the breadcrumb's row rather than floating over the diagram:
 * a floating bar covered the top-left of the drawing and intercepted clicks
 * meant for the node under it (TPL-948). The row already existed and its right
 * half was empty, so this placement costs no extra height.
 */
export function PreviewViewControls({
  onOpenFacetOverview,
}: {
  /** Opens the facet audit panel — its state belongs to `PreviewColumn`. */
  onOpenFacetOverview: () => void;
}) {
  const {
    activeView,
    isAllLayersOpen,
    onAllLayersToggle,
    isOrgTreeViewOpen,
    onOrgTreeViewToggle,
    isTeamDependenciesOpen,
    onTeamDependenciesToggle,
    hasTeamDependencyView,
    isEntityViewOpen,
    onEntityViewToggle,
    hasEntityView,
  } = usePreview();
  const view = useActiveViewData();
  const { t } = useTranslation();
  const groupByAxes = availableGroupByAxes(view);
  const allLayersAvailable = activeView !== "deploy" && !!view.allLayersSvg;

  return (
    <div className="preview-view-controls">
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
      {/* The org tab's third mode (ADR-309 put modes here rather than on a new
          tab). Offered only when the model declares an organization — with no
          team there is nothing to derive, and an enabled control that draws an
          empty canvas reads as a broken feature (ADR-766's stance on empty
          views). */}
      {activeView === "org" && hasTeamDependencyView && (
        <Button
          variant="actionable"
          aria-pressed={isTeamDependenciesOpen}
          onClick={onTeamDependenciesToggle}
          aria-label={t("preview.teamDependencies.ariaLabel")}
        >
          ⇄ {t("preview.teamDependencies.label")}
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
