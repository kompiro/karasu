/**
 * Recognized CRUD operation verbs for `usecase` `resource` blocks.
 *
 * Authors declare which operations a usecase performs on a resource:
 *
 *   usecase PlaceOrder {
 *     resource OrderTable { operations create, read }
 *   }
 *
 * Verbs outside this set still parse and are preserved on the AST so
 * translate adapters can round-trip non-CRUD operations (`list`, `search`,
 * `execute`, …). Authors can annotate such verbs with their CRUD intent
 * via the verb-decoration syntax — `operations list:read, replace:create,delete` —
 * to feed the matrix view and write-dominates classifier without rewriting
 * domain language. See `docs/design/verb-crud-decoration.md`.
 *
 * See `docs/spec/syntax.md` §"Resource operations".
 */
export const RECOGNIZED_RESOURCE_OPERATIONS = ["create", "read", "update", "delete"] as const;
export type CrudVerb = (typeof RECOGNIZED_RESOURCE_OPERATIONS)[number];

export function isRecognizedResourceOperation(value: string): value is CrudVerb {
  return (RECOGNIZED_RESOURCE_OPERATIONS as readonly string[]).includes(value);
}

/**
 * One entry on a resource's `operations` property. `verb` is the raw verb
 * the author wrote; `decoratedAs` is the CRUD set they explicitly mapped it
 * to via `verb:c[,c]` syntax (undefined when no decoration was provided).
 */
export interface ResourceOperation {
  /** The raw verb token (e.g. `"create"`, `"list"`, `"replace"`). */
  verb: string;
  /**
   * CRUD verbs the author explicitly mapped this verb to. Undefined when the
   * author wrote a bare verb (no `:` decoration). An empty array means the
   * decoration was malformed and emitted a diagnostic — consumers should
   * treat it like undefined.
   */
  decoratedAs?: readonly CrudVerb[];
}

/**
 * Write-dominates classification: returns true when any CRUD effect on this
 * resource is a write (`create` / `update` / `delete`). Decoration takes
 * precedence — `list:read` is not a write even though `list` is unrecognized,
 * and `replace:create,delete` is a write even though `replace` is unrecognized.
 *
 * Bare unrecognized verbs are conservatively treated as non-write (we only
 * count verbs we know mean mutation).
 */
export function isWriteOperation(operations: readonly ResourceOperation[] | undefined): boolean {
  if (!operations) return false;
  for (const op of operations) {
    if (op.decoratedAs && op.decoratedAs.length > 0) {
      if (op.decoratedAs.some((v) => v === "create" || v === "update" || v === "delete")) {
        return true;
      }
      continue;
    }
    if (op.verb === "create" || op.verb === "update" || op.verb === "delete") return true;
  }
  return false;
}
