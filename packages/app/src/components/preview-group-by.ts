// Moved out of PreviewColumn.tsx when the toolbar split in two (#2317): the
// Group-by selector now lives on the canvas control bar, and this table is what
// tells it which axes the model can offer. The comments below are the
// originals — the guarantees they describe are unaffected by the move.

import type { GroupByMode } from "../state/preview-context.js";
import type { ActiveViewData } from "../state/active-view-data.js";
import type { TranslateFn } from "@karasu-tools/i18n";

/** What the Group-by selector needs to know about one axis to offer it. */
interface GroupByAxisOption {
  /** Option label. Takes `t` so the key stays a checked literal at the call site. */
  label: (t: TranslateFn) => string;
  /** Data gate — the axis is offered only when the model carries it (#1822 P2b). */
  available: (view: ActiveViewData) => boolean;
}

/**
 * The axes the Group-by selector offers, keyed by `GroupByMode` minus the
 * always-present `"none"`. Insertion order is the option order.
 *
 * The `satisfies Record<…>` is the point of this table: adding a member to
 * `GroupByMode` without adding it here fails to typecheck, so a new axis cannot
 * ship while the selector silently keeps offering only the old ones — the
 * failure mode in TPL-20260510-03. This is the B3 defence ADR-2120 carried
 * forward (#2119); the axes are mutually exclusive by ADR-1974, so the selector
 * is the one permanent home for the choice.
 */
export const GROUP_BY_AXES = {
  team: {
    label: (t) => t("preview.groupBy.team"),
    available: (view) => view.hasTeamAxis === true,
  },
  boundary: {
    label: (t) => t("preview.groupBy.boundary"),
    available: (view) => view.hasBoundaryAxis === true,
  },
} satisfies Record<Exclude<GroupByMode, "none">, GroupByAxisOption>;

/**
 * `<select>` hands back a bare string. `"none"` plus {@link GROUP_BY_AXES}'
 * keys are exactly `GroupByMode`, so narrowing here replaces the unchecked
 * `as GroupByMode` cast the `onChange` handler used to carry.
 */
export function isGroupByMode(value: string): value is GroupByMode {
  return value === "none" || value in GROUP_BY_AXES;
}

/**
 * The axes offered for this view — the table filtered by each axis' data gate.
 *
 * Both the option list and the selector's own visibility read this one result:
 * an empty list means no axis has data, so the control would be a no-op and is
 * not rendered (#1858). Deriving the visibility here is what makes the table
 * the *only* site a new axis has to touch — `useAppViews` previously carried a
 * hand-written `groupByAvailable: hasOrgDiagram || hasBoundaries`, which the
 * `satisfies` guard could not see and a fourth axis would have missed silently.
 */
export function availableGroupByAxes(view: ActiveViewData) {
  return Object.entries(GROUP_BY_AXES).filter(([, axis]) => axis.available(view));
}
