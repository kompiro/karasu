/**
 * Keyword completion items offered by `onCompletion` in `server.ts`.
 *
 * IMPORTANT: LSP completion here is CONTEXT-FREE — `server.ts` offers every
 * entry in this list regardless of cursor position. So this is a CURATED set
 * of keywords that make sense as global suggestions (top-level declarations
 * and broadly-usable node/deploy declaration keywords), NOT a blind copy of
 * the lexer's `KRS_KEYWORD_NAMES`. Dumping the whole lexer table in would
 * surface block-scoped keywords (`from`, `contains`, `swatch`, …) as global
 * suggestions where they are grammatically invalid — a UX regression. Making
 * these suggestions context-aware is a separate future effort.
 *
 * Parity with the lexer is guarded by `completion-keywords.test.ts`: every
 * lexer keyword must be either present here or listed in that test's
 * `EXCLUDED_FROM_COMPLETION` set (with a reason), so a NEW lexer keyword
 * fails CI until a human triages it into include-or-exclude.
 *
 * Curation rationale (relative to the lexer keyword table and the deploy
 * contextual keywords the parser matches by value):
 *
 *   INCLUDED, added in #2067 (were missing, but are top-level or broadly-usable
 *   declaration keywords comparable to already-included ones):
 *     - import     : top-level statement (parser.ts top-level dispatch)
 *     - database   : top-level infra block
 *     - queue      : top-level infra block
 *     - storage    : top-level infra block
 *     - boundary   : top-level block (like `system` / `organization`)
 *     - legend     : top-level construct (parity with system/boundary/deploy/organization)
 *     - entity     : domain-child declaration (like the included `usecase` / `resource`)
 *     - capability : client-child declaration (like the included `usecase` / `resource`)
 *
 *   RESTORED (#2067 review): `store` — a real deploy-block contextual keyword
 *   matched by value (`DEPLOY_KEYWORDS` / `RESERVED_KEYWORDS` in
 *   `packages/core/src/parser/parser.ts`), even though it is not in the lexer's
 *   `KEYWORDS` table. Removing it earlier was a regression; the old hand-curated
 *   list was right to include it.
 *
 *   EXCLUDED (block-scoped — only valid deep inside one specific construct;
 *   see `EXCLUDED_FROM_COMPLETION` in the test for the per-keyword reasons):
 *     handles, operations, delivers (node property blocks), contains (boundary
 *     body), from (import tail), table (database body), bucket (storage body),
 *     swatch / ref (legend presentation sub-grammar body).
 */
export const KRS_KEYWORDS = [
  // Top-level declarations
  "system",
  "service",
  "client",
  "domain",
  "import", // added #2067 — top-level statement
  "database", // added #2067 — top-level infra block
  "queue", // added #2067 — top-level infra block
  "storage", // added #2067 — top-level infra block
  "boundary", // added #2067 — top-level block
  "legend", // added #2067 — top-level construct (parity with system/boundary/deploy/organization)
  "deploy",
  "organization",
  // Node-child declarations
  "usecase",
  "entity", // added #2067 — domain-child declaration
  "capability", // added #2067 — client-child declaration
  "resource",
  "user",
  // Deploy-block contextual keywords (matched by value; `store` is NOT in the
  // lexer KEYWORDS table but is a real deploy keyword — restored in #2067)
  "war",
  "jar",
  "oci",
  "lambda",
  "function",
  "assets",
  "job",
  "artifact",
  "store",
  // Deploy-block property keywords
  "runtime",
  "realizes",
  "schedule",
  "image",
  "type",
  // Organization-block keywords
  "member",
  "team",
  "role",
  "owns",
  // Common node property keywords
  "label",
  "description",
  "link",
  // Integration keywords
  "slack",
  "github",
];
