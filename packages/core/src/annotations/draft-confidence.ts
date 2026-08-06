/**
 * Consumer-side interpretation of `@draft(confidence: …)`.
 *
 * `@draft` marks a statement the model makes but nobody has confirmed. It
 * exists because karasu-nest generates `.krs` from source with an LLM
 * ([ADR-1990](../../../../docs/adr/1990-karasu-nest-pivot-server-reverse.md)
 * decision 4), and a generated model that cannot say which parts it guessed
 * at is not honest about itself. The spike behind that decision found the
 * harness's errors concentrate at genuine judgment-call seams rather than
 * scattering, so the useful signal is *where it was unsure*, not an overall
 * score — which is why the level lives on the node and not on the document.
 *
 * Following `until` (ADR-1568), the parameter degrades by precision instead of
 * erroring: one of the three known levels is machine-usable (comparable,
 * filterable), anything else is kept verbatim as display-only. A hand-written
 * `confidence: "we argued about this one"` is a legitimate note from a human
 * reviewer, and rejecting it would push people back to comments.
 *
 * Nothing here reads a clock or a threshold. A level is recorded judgement,
 * not a gate: karasu never refuses to render a low-confidence node.
 */

/** The three levels a consumer can compare and filter on. */
export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;

export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

/**
 * A level a consumer can act on. `rank` orders the levels so surfaces can sort
 * or threshold without re-deriving the scale (`low` = 0, so ascending order
 * puts the least trustworthy first — the order a reviewer wants).
 */
export interface MachineConfidence {
  kind: "machine";
  level: ConfidenceLevel;
  rank: number;
  /** The value exactly as written in the source. */
  raw: string;
}

/** Anything else: kept verbatim for display, never an error. */
export interface OpaqueConfidence {
  kind: "opaque";
  /** The value exactly as written in the source. */
  raw: string;
}

export type InterpretedConfidence = MachineConfidence | OpaqueConfidence;

/**
 * A node's draft state.
 *
 * `@draft` with no parameter is still a draft — the mark is the point, the
 * level is an optional refinement — so `confidence` is `undefined` rather
 * than defaulting to a level nobody wrote.
 */
export interface DraftState {
  confidence?: InterpretedConfidence;
}

/**
 * Interpret one written `confidence` value.
 *
 * Case and surrounding whitespace are normalised, because `"Low"` from a
 * generator and `"low"` from a human mean the same thing and a scale that
 * silently splits on capitalisation is not a scale.
 */
export function interpretConfidence(raw: string): InterpretedConfidence {
  const normalized = raw.trim().toLowerCase();
  const level = (CONFIDENCE_LEVELS as readonly string[]).includes(normalized)
    ? (normalized as ConfidenceLevel)
    : undefined;
  if (level === undefined) return { kind: "opaque", raw };
  return { kind: "machine", level, rank: CONFIDENCE_LEVELS.indexOf(level), raw };
}

/**
 * The draft state carried by a node's `annotationParams`, or `undefined` when
 * the node is not marked `@draft`.
 *
 * `annotations` is passed separately because a bare `@draft` leaves no
 * parameter behind, and reading only the parameter map would lose it.
 */
export function getDraftState(
  annotations: readonly string[] | undefined,
  annotationParams: Record<string, Record<string, string>> | undefined,
): DraftState | undefined {
  if (!annotations?.includes("draft")) return undefined;
  const raw = annotationParams?.draft?.confidence;
  if (raw === undefined) return {};
  return { confidence: interpretConfidence(raw) };
}
