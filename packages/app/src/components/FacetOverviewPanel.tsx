import type { FacetOverviewEntry } from "@karasu-tools/core";
import { FACET_OVERLAY_COLORS, isSafeLinkUrl } from "@karasu-tools/core";
import { useTranslation } from "../i18n/index.js";

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

  return (
    <div
      className="facet-overview-panel"
      role="dialog"
      aria-label={t("facetOverview.title")}
      // Opt out of the diagram's native wheel-zoom listener so this panel's own
      // overflow scrolls instead of zooming the diagram behind it (#1537).
      data-wheel-zoom-ignore
    >
      <div className="facet-overview-header">
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
