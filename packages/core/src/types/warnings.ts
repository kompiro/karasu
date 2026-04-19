import type { SourceRange } from "./tokens.js";

export type WarningKind =
  | "domain-dispersal"
  | "style-conflict"
  | "missing-runtime"
  | "missing-realizes"
  | "invalid-owns"
  | "deprecated-team-property"
  | "unassigned-domain"
  | "unassigned-usecase"
  | "cross-system-ref-implicit-external"
  | "cross-system-ref-unresolved"
  | "cyclic-dependency";

/**
 * Per-kind params shape. Each entry carries only the structured data needed
 * to re-render the warning message in any language; producers never build
 * user-visible strings.
 *
 * Consumers that need a localized string should call `formatWarning(w)` (the
 * temporary compat bridge) or `t(\`warning.\${w.kind}\`, w.params)` once the
 * app's `useTranslation` infrastructure covers warning keys (Phase D).
 */
export interface WarningParamsByKind {
  "domain-dispersal": { domainId: string; services: string[] };
  "style-conflict": { selector: string; sheetIndices: number[] };
  "missing-runtime": { nodeId: string };
  "missing-realizes": { nodeId: string };
  "invalid-owns": { teamId: string; ownedId: string };
  "deprecated-team-property": { nodeId: string; ownerTeamId: string };
  "unassigned-domain": { domainId: string; label?: string };
  "unassigned-usecase": { usecaseId: string };
  "cross-system-ref-implicit-external": {
    ref: string;
    sourceSystemId: string;
    sourceNodeId: string;
    targetSystemId: string;
  };
  "cross-system-ref-unresolved": { ref: string };
  "cyclic-dependency": { cyclePath: string[] };
}

/**
 * A discriminated union over `kind`. Destructuring by `kind` narrows `params`
 * to the right shape automatically, so consumers get full type safety for
 * each warning variant.
 *
 * Prior shape carried `message: string` + `details: string[]` — both removed
 * as part of the Phase B refactor. See `docs/design/i18n-support.md`.
 */
export type Warning = {
  [K in WarningKind]: {
    kind: K;
    params: WarningParamsByKind[K];
    loc?: SourceRange;
  };
}[WarningKind];
