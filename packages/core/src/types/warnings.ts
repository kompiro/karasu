import type { SourceRange } from "./tokens.js";

export type WarningKind =
  | "domain-dispersal"
  | "style-conflict"
  | "missing-runtime"
  | "missing-realizes"
  | "invalid-owns"
  | "deprecated-team-property";

export interface Warning {
  kind: WarningKind;
  message: string;
  details: string[];
  loc?: SourceRange;
}
