import { useCallback, useRef, useState } from "react";
import type { FacetOverviewEntry } from "@karasu-tools/core";
import { FACET_OVERLAY_COLORS, isSafeLinkUrl } from "@karasu-tools/core";
import { useTranslation } from "../i18n/index.js";

/** Keeps at least this much of the panel on screen, so it can always be grabbed back. */
const DRAG_MARGIN = 40;

/**
 * "Which elements belong to facet X" — the audit surface for `facet` (#2177).
 *
 * The panel exists because membership is written **element-side**: `facets pii`
 * sits next to the thing that has it, so a rename never means editing a distant
 * list — and the price is that no single place in the source answers "what is in
 * PCI scope?". This is that answer, and it is **derived on every compile, never
 * authored**. There is no second copy to keep in sync (TPL-1032), and the
 * rejected by-reference form (`facet pci { contains … }`) would have bought the
 * same list at the cost of the locality it protects.
 *
 * The swatch colours are indexed the same way the renderer indexes them, and
 * `facetOverview` arrives in known-facet order, so a facet's colour here and its
 * ring in the diagram can never disagree.
 */
export function FacetOverviewPanel({
  facets,
  selectedFacets,
  onFacetToggle,
  onClose,
}: {
  facets: FacetOverviewEntry[];
  selectedFacets: readonly string[];
  onFacetToggle?: (facetId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement | null>(null);
  // `null` until the first drag: the panel sits where CSS puts it (top-right,
  // below the toolbar). Dragging switches it to explicit coordinates, which is
  // why the default cannot simply be a hardcoded pair here.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const grab = useRef<{ dx: number; dy: number } | null>(null);

  /**
   * The element the panel's `left` / `top` are measured against.
   *
   * `offsetParent` is the honest answer in a browser, but jsdom always reports
   * `null`, which would make the whole gesture untestable. The parent element is
   * the same node in practice (the panel is a direct child of the positioned
   * `.preview-column`), so it is a sound fallback rather than a test-only hack.
   */
  const containingBlock = (panel: HTMLElement): HTMLElement | null =>
    (panel.offsetParent as HTMLElement | null) ?? panel.parentElement;

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Let the close button (and any future header control) keep its click.
    if ((e.target as HTMLElement).closest("button")) return;
    const panel = panelRef.current;
    const parent = panel ? containingBlock(panel) : null;
    if (!panel || !parent) return;
    const panelRect = panel.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    // Offset within the panel, so it does not jump to the cursor on grab.
    grab.current = { dx: e.clientX - panelRect.left, dy: e.clientY - panelRect.top };
    setPos({ left: panelRect.left - parentRect.left, top: panelRect.top - parentRect.top });
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const offset = grab.current;
    const panel = panelRef.current;
    const parent = panel ? containingBlock(panel) : null;
    if (!offset || !panel || !parent) return;
    const parentRect = parent.getBoundingClientRect();
    const width = panel.offsetWidth;
    // Clamp so a sliver always stays grabbable — a panel dragged fully out of
    // the column could not be brought back without reopening it.
    const left = Math.min(
      Math.max(e.clientX - offset.dx - parentRect.left, DRAG_MARGIN - width),
      parentRect.width - DRAG_MARGIN,
    );
    const top = Math.min(
      Math.max(e.clientY - offset.dy - parentRect.top, 0),
      parentRect.height - DRAG_MARGIN,
    );
    setPos({ left, top });
  }, []);

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!grab.current) return;
    grab.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  return (
    <div
      ref={panelRef}
      className={`facet-overview-panel${dragging ? " facet-overview-panel--dragging" : ""}`}
      role="dialog"
      aria-label={t("facetOverview.title")}
      // Once dragged, explicit coordinates replace the CSS corner. `right` is
      // cleared so the panel is positioned by `left` alone.
      style={pos ? { left: pos.left, top: pos.top, right: "auto" } : undefined}
      // Opt out of the diagram's native wheel-zoom listener so this panel's own
      // overflow scrolls instead of zooming the diagram behind it (#1537).
      data-wheel-zoom-ignore
    >
      <div
        className="facet-overview-header"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="facet-overview-title">◎ {t("facetOverview.title")}</span>
        <button
          className="facet-overview-close"
          onClick={onClose}
          aria-label={t("facetOverview.close")}
        >
          ×
        </button>
      </div>

      <p className="facet-overview-derived-note">{t("facetOverview.derivedNote")}</p>

      <ul className="facet-overview-list">
        {facets.map((facet, i) => (
          <li key={facet.id} className="facet-overview-entry">
            <div className="facet-overview-entry-header">
              <span
                className="facet-swatch"
                style={{ background: FACET_OVERLAY_COLORS[i % FACET_OVERLAY_COLORS.length] }}
                aria-hidden="true"
              />
              <button
                className="facet-overview-name"
                aria-pressed={selectedFacets.includes(facet.id)}
                onClick={() => onFacetToggle?.(facet.id)}
                title={t("facetOverview.highlightHint")}
              >
                {facet.label ?? facet.id}
              </button>
              <code className="facet-overview-id">{facet.id}</code>
              <span className="facet-overview-count">
                {t("facetOverview.memberCount", { count: facet.members.length })}
              </span>
            </div>

            {/* A facet that is referenced but never declared has no metadata to
                show, and `facet-not-declared` already reports it at the site
                that wrote the reference. Saying so here too would repeat one
                mistake in two places, so the panel only marks it. */}
            {!facet.declared && (
              <p className="facet-overview-undeclared">{t("facetOverview.undeclared")}</p>
            )}

            {facet.description && <p className="facet-overview-description">{facet.description}</p>}

            {facet.links.length > 0 && (
              <ul className="facet-overview-links">
                {/* Same scheme filter as the node detail panel: the parser keeps
                    disallowed-scheme links in the AST so Format does not delete
                    the author's source, and the render surface is where they
                    must be excluded (#1525). */}
                {facet.links
                  .filter((link) => isSafeLinkUrl(link.url))
                  .map((link) => (
                    <li key={link.url}>
                      <a href={link.url} target="_blank" rel="noopener noreferrer">
                        {link.label || link.url} ↗
                      </a>
                    </li>
                  ))}
              </ul>
            )}

            {facet.members.length === 0 ? (
              <p className="facet-overview-empty">{t("facetOverview.noMembers")}</p>
            ) : (
              <ul className="facet-overview-members">
                {facet.members.map((member) => (
                  // Keyed on path + id: node ids are unique only among siblings
                  // (ADR-927), so two `Payment` nodes in different services are
                  // two rows, not one (TPL-1352).
                  <li
                    key={`${member.path.join("/")}/${member.id}`}
                    className="facet-overview-member"
                  >
                    <span className="facet-overview-member-kind">{member.kind}</span>
                    <span className="facet-overview-member-name">{member.label ?? member.id}</span>
                    {member.path.length > 0 && (
                      <span className="facet-overview-member-path">{member.path.join(" › ")}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
