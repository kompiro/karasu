/**
 * Recognized CRUD operation verbs for `usecase` `resource` blocks.
 *
 * Authors declare which operations a usecase performs on a resource:
 *
 *   usecase PlaceOrder {
 *     resource OrderTable { operations create, read }
 *   }
 *
 * Verbs outside this list still parse and are preserved on the AST so
 * translate adapters can round-trip non-CRUD operations (`list`, `search`,
 * `execute`, …); the parser emits an `unknown-resource-operation` warning
 * pointing at the offending verb.
 *
 * See `docs/spec/syntax.md` §"Resource operations" and ADR derived from
 * `docs/design/resource-crud-operations.md`.
 */
const RECOGNIZED_RESOURCE_OPERATIONS = ["create", "read", "update", "delete"] as const;
type RecognizedResourceOperation = (typeof RECOGNIZED_RESOURCE_OPERATIONS)[number];

export function isRecognizedResourceOperation(value: string): value is RecognizedResourceOperation {
  return (RECOGNIZED_RESOURCE_OPERATIONS as readonly string[]).includes(value);
}

/**
 * Write-dominates classification used by the usecase view to differentiate
 * usecase→resource edges as read-only or write. Returns true when any of
 * `create` / `update` / `delete` appears in the operation list. Unknown
 * verbs are treated as read (conservative — only verbs we know mean
 * mutation count as write).
 *
 * Used by `view-extract.ts` to inject a `[write]` / `[read]` pseudo-tag
 * and an explicit `R` / `W` label on each synthesized usecase→resource
 * edge.
 */
export function isWriteOperation(operations: readonly string[] | undefined): boolean {
  if (!operations) return false;
  return operations.some((op) => op === "create" || op === "update" || op === "delete");
}
