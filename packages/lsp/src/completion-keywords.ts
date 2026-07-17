/**
 * Keyword completion items offered by `onCompletion` in `server.ts`.
 *
 * This list is a hand-maintained copy of the language's keyword set and is
 * known to have drifted from the lexer's `KEYWORDS` table in
 * `@karasu-tools/core` (see `completion-keywords.test.ts`, which pins the
 * known deltas). Extracted to its own leaf module so the drift test can
 * import it without pulling in `server.ts`'s side-effecting
 * `connection.listen()` call.
 */
export const KRS_KEYWORDS = [
  "system",
  "service",
  "client",
  "domain",
  "usecase",
  "resource",
  "user",
  "deploy",
  "war",
  "jar",
  "oci",
  "lambda",
  "function",
  "assets",
  "job",
  "artifact",
  "store",
  "organization",
  "member",
  "label",
  "description",
  "team",
  "role",
  "link",
  "runtime",
  "realizes",
  "schedule",
  "image",
  "type",
  "owns",
  "slack",
  "github",
];
