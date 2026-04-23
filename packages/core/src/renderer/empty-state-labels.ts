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
}

export const DEFAULT_EMPTY_STATE_LABELS = {
  deployTitle: "No deploy block defined",
  deployHint: "Add a deploy block to your .krs file",
  orgNoTeams: "No teams defined",
} as const satisfies Required<EmptyStateLabels>;
