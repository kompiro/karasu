/**
 * Keyword completion items offered by `onCompletion` in `server.ts`.
 *
 * Derived directly from the lexer's `KRS_KEYWORD_NAMES` (the source of
 * truth for the grammar's keyword set, `@karasu-tools/core`) so this list
 * can never drift from the lexer again — see `completion-keywords.test.ts`,
 * which asserts exact parity. Extracted to its own leaf module so the drift
 * test can import it without pulling in `server.ts`'s side-effecting
 * `connection.listen()` call.
 *
 * No lexer keywords are excluded: every entry in `KRS_KEYWORD_NAMES` is a
 * grammar keyword a user may type, so all of them are valid completion
 * candidates.
 */
import { KRS_KEYWORD_NAMES } from "@karasu-tools/core";

export const KRS_KEYWORDS = [...KRS_KEYWORD_NAMES];
