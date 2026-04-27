/**
 * Localized labels for renderer-embedded placeholder messages.
 * The app supplies these via its i18n layer so the core renderers stay
 * locale-agnostic. All fields are optional; English fallbacks are used
 * when a label is omitted.
 */
export interface EmptyStateLabels {
  /** Title text for the deploy view when no deploy block is defined. */
  deployTitle?: string;
  /** Secondary hint text below the deploy empty-state title. */
  deployHint?: string;
  /** Text for the org view when no teams have been defined yet. */
  orgNoTeams?: string;
  /** Text for the system view when the layout has no nodes or containers. */
  systemNoNodes?: string;
  /**
   * Text for the org all-layers / drill-down placeholder rendered when the
   * `.krs` file has no organization block (or compiled to no levels).
   */
  orgPlaceholder?: string;
  /**
   * Text for the system all-layers / drill-down placeholder rendered when
   * the `.krs` file produces no system-side root content.
   */
  systemNoDiagram?: string;
}

export const DEFAULT_EMPTY_STATE_LABELS = {
  deployTitle: "No deploy block defined",
  deployHint: "Add a deploy block to your .krs file",
  orgNoTeams: "No teams defined",
  systemNoNodes: "No nodes to render",
  orgPlaceholder: "No org diagram",
  systemNoDiagram: "No diagram",
} as const satisfies Required<EmptyStateLabels>;
