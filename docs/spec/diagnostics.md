> English（this file） · [日本語](diagnostics.ja.md)

# Diagnostics & rules reference

karasu reports problems with two layers of vocabulary:

- A **rule** (規則) is a *concept* — what the language allows and forbids
  ("an edge originates within its enclosing block"). Rules are how authors and
  this spec talk about the constraint.
- A **diagnostic** (診断) is a *mechanism* — a specific, named check that fires
  when one concrete violation of a rule is detected (`edge-source-mismatch`).

One rule is often enforced by several diagnostics, and a single diagnostic
belongs to exactly one rule. This document is the catalog that maps the two.

## How to read this catalog

- **Diagnostic codes are stable API.** The `code` string (e.g.
  `edge-source-mismatch`) is consumed by the LSP, the app, and downstream
  tooling. Codes are *not* renamed to match a rule's wording; the rule name is
  conceptual, the code is the contract. When a rule reads more naturally under a
  different name than its diagnostic, that is expected — they sit at different
  altitudes.
- **Every diagnostic code lives under exactly one rule family below**, and every
  code defined in core (`DiagnosticParamsByCode`, `WarningKind`) appears here.
  This completeness is enforced by a meta-test (see *Catalog completeness*), so
  a new code cannot ship without a catalog entry.
- The `fires when` column states the concrete trigger. Severities are listed as
  emitted by core.

## Registers and severities

A diagnostic has a **severity**: `error`, `warning`, or `info`.

- `error` — the model is malformed; the offending construct is rejected.
- `warning` — a real defect the author should fix (a dangling reference, a
  conflicting style).
- `info` — a **fact**, not a defect. karasu surfaces something true about the
  model that an external school of thought may call a smell (a shared database,
  a dispersed domain), without asserting it is wrong. This is the *fact vs.
  style* register split — see [TPL-1386](../test-perspectives/TPL-1386-diagnostic-register-fact-vs-style.md).

karasu also follows **warn-don't-error** for unresolved references (spec §S6):
an unresolved relation is dropped while the node it points from is preserved,
and the drop is reported as a warning rather than failing the whole render.

## Rule families

### Declaration, edge placement & structure

Where a construct may be declared, and what an edge's origin may be. An edge
declared inside a `service` / `domain` block originates from that block's id;
infra blocks and `legend` have fixed placement; sync edges must not form a
cycle.

| Code | Severity | Fires when |
| --- | --- | --- |
| `edge-source-mismatch` | error | An explicit edge source inside a `service` / `domain` / `entity` block does not equal the enclosing block id (the **edge origin scope** rule; for an `entity` this enforces the relation direction — origin = the reference-holding entity). |
| `ambiguous-edge-base` | warning | Multiple edges share the same `from → to` base with no distinguishing author id. |
| `service-outside-system` | warning | A `service` is declared outside any `system`. |
| `infra-not-in-context` | error | An infra block (`database` / `queue` / `storage`) is not a direct child of `system`. |
| `boundary-not-in-context` | error | A `boundary` block is declared inside a node kind that draws no canvas of its own (`entity`, `resource`, `user`, `client`, or an infra leaf), so it would have no peers to frame. |
| `entity-not-in-domain` | error | An `entity` is declared somewhere other than as a child of a `domain`. |
| `node-not-in-context` | warning | A logical node is nested inside a kind whose **May contain** column does not list it (e.g. a `usecase` inside a `client`). The node is kept and still renders; it simply carries no defined meaning there. Scheduled to become an error in `.krs language v2.0` (see [roadmap §Syntax 2.0](../roadmap.md#syntax-20-プログラム)). |
| `legend-not-top-level` | error | A `legend` block is declared somewhere other than the top level. |
| `top-level-declaration` | error | A `user` or an edge is declared at the top level instead of inside a `system` block. |
| `system-property-conflict` | warning | A `system` `label` / `description` conflicts between merged imports. |
| `cyclic-dependency` | warning | Sync edges (`->`) form a dependency cycle. |

### Identifier uniqueness

Ids must be unique within their declaring scope; ownership assigns at most one
primary owner.

| Code | Severity | Fires when |
| --- | --- | --- |
| `duplicate-edge-id` | error | An author-supplied edge id collides with another edge's id. |
| `duplicate-node-id-parent` | error | A node id is duplicated within its immediate parent (covers a `usecase` and `entity` sharing an id under one `domain`). |
| `entity-anchor-collision` | warning | An id is claimed by more than one target in the `entity` deep-link namespace ({all domain ids} ∪ {all entity ids}) — an entity id duplicated across domains, or an entity id equal to a domain id. Deep-links resolve ambiguously; the model still renders. |
| `duplicate-node-in-system` | error | A node id is duplicated within a `system`. |
| `duplicate-node-in-deploy` | error | A node id is duplicated within a `deploy` block. |
| `duplicate-team-id` | error | A team id is duplicated. |
| `duplicate-team-in-organization` | error | A team id is duplicated within an `organization`. |
| `duplicate-resource-operation` | warning | A CRUD verb is listed more than once on one resource. |
| `duplicate-crud-decoration-target` | warning | A CRUD decoration targets the same operation more than once. |
| `duplicate-owner-assignment` | info | A node is assigned as owned by more than one team (a fact; see [ADR-1566](../adr/1566-ownership-during-migration.md)). |
| `duplicate-boundary-assignment` | info | A node is listed in more than one `boundary` (a fact; the first-declared boundary is kept). |
| `duplicate-boundary-id` | error | Two `boundary` blocks in the same enclosing node declare the same id, so the second cannot be addressed. Top-level blocks are unaffected. |
| `positional-label-removed` | error | A `boundary` id is followed by a positional label string. ADR-19 made `label` a property; `boundary` is experimental, so the undocumented positional form is removed outright instead of deprecated (#2133). |
| `positional-label-deprecated` | warning | An `organization` / `team` / `member` id is followed by a positional label string. The form was never in the spec (ADR-19); it still parses, and `karasu fmt` rewrites it to the `label` property (#2133). |
| `node-id-multiple-locations` | warning | The same node id appears in more than one location. |

### Cross-reference resolution (warn-don't-error, §S6)

A referenced id must resolve to a declared node. When it does not, the source
node is preserved and the unresolved relation is reported (it is not a fatal
error) — see syntax spec §S6.

| Code | Severity | Fires when |
| --- | --- | --- |
| `owns-target-not-found` | warning | A team `owns` a service / domain absent from the merged model (existence is checked after cross-file merge, not per file). |
| `invalid-owns` | warning | An `owns` target resolves to a kind that cannot be owned. |
| `contains-target-not-found` | warning | A `boundary` `contains` a node that does not exist — for a top-level block, anywhere in the merged system hierarchy (existence is checked after cross-file merge, not per file); for a scoped block, among the declaring node's direct children. |
| `import-id-not-found` | error | A named import id path fails to resolve. |
| `import-path-not-found` | error | An import path fails to resolve at some segment. |
| `unresolved-edge-endpoint` | warning | An edge endpoint id is not found anywhere in the merged model. |
| `unresolved-handles` | warning | A `handles` domain is not reachable through the one-hop expose rule. |
| `unresolved-realizes` | warning | A deploy node `realizes` a target absent from the logical layer. |
| `legend-ref-unresolved` | warning | A `legend` `ref` matches no style rule and no node. |
| `cross-system-ref-unresolved` | warning | A cross-system edge (`Sys.Svc`) target is not found. |
| `cross-system-ref-implicit-external` | warning | A cross-system edge crosses into a system not tagged `[external]`. |
| `delivers-target-not-client` | warning | A `delivers` target is not a `client` node. |

### Infra single-declaration & fan-in

Infra nodes are declared once; a store referenced by several services is a fact
worth surfacing.

| Code | Severity | Fires when |
| --- | --- | --- |
| `infra-redeclared-across-files` | info | The same `database` / `queue` / `storage` id is declared in more than one merged file. |
| `infra-leaf-redeclared-silently` | info | A `table` / `queue-item` / `bucket` leaf is redeclared within its parent infra. |
| `shared-infra-fan-in` | info | Two or more services depend on the same store within one system (a fact, not a defect). |
| `cross-domain-store-access` | info | A usecase reads/writes an infra leaf owned by another domain, in one system (a boundary-crossing fact, not a defect). Ownership is derived from `entity` mappings; keyed at leaf granularity; `[external]` / `[index]` stores excluded. Orthogonal to `shared-infra-fan-in`. |

### CRUD decoration grammar

The grammar of operation / CRUD decoration on resources.

| Code | Severity | Fires when |
| --- | --- | --- |
| `invalid-crud-decoration` | error | A CRUD decoration uses an unrecognised verb / letter. |
| `empty-crud-decoration` | warning | A `verb:` decoration has an empty right-hand side. |
| `unknown-resource-operation` | warning | A resource operation verb is not one of create / read / update / delete. |

### Assignment & cohesion

Whether structural nodes are assigned to an owner / parent, and cohesion facts
about how domains and deploy targets are wired.

| Code | Severity | Fires when |
| --- | --- | --- |
| `unassigned-service` | warning | A service sits at top level with no team assignment. |
| `unassigned-domain` | warning | A domain sits at top level with no team assignment. |
| `unassigned-usecase` | warning | A usecase is a direct child of a service with no domain parent. |
| `unassigned-client` | warning | A client sits at top level with no team assignment. |
| `unassigned-database` | warning | A database sits at top level with no team assignment. |
| `unassigned-queue` | warning | A queue sits at top level with no team assignment. |
| `unassigned-storage` | warning | A storage sits at top level with no team assignment. |
| `unassigned-resource` | warning | A bare `resource <id>` resolves to no store: not dot-notation, not `[external]`, and not a unique `entity`. Model-wide (resolver, not parser), so it is promoted away — with zero edits — once a matching `entity` is declared. An ambiguous bare id (>1 matching entity) stays unresolved; the collision is reported by `entity-anchor-collision`. |
| `domain-dispersal` | info | One domain id appears under multiple services in scope (a fact). |
| `missing-realizes` | info | A deploy node lacks a `realizes` property. |
| `missing-runtime` | info | A deploy node lacks a `runtime` property. |

### Annotation & lifecycle

Annotation parameters, removed / deprecated properties, and the v1.x
deprecation of non-builtin tag / annotation vocabulary (syntax v2.0 accepts
tool vocabulary only — see [tags-annotations.md](./tags-annotations.md)).

| Code | Severity | Fires when |
| --- | --- | --- |
| `annotation-param-unsupported` | warning | An annotation parameter key is not recognised for that annotation. |
| `annotation-possible-typo` | info | An annotation name is a near-match to a builtin (typo hint). |
| `tag-not-builtin` | warning | A tag name is outside the tool vocabulary (builtin + system-assigned tags). Deprecated in v1.x; no suppression condition. |
| `annotation-not-builtin` | warning | An annotation name is outside the builtin set. Deprecated in v1.x; no suppression condition. |
| `team-property-removed` | error | The removed `team` property is used (see [ADR-1564](../adr/1564-remove-team-property.md)). |

### Imports & files

Resolving `import` declarations and style imports against the filesystem.

| Code | Severity | Fires when |
| --- | --- | --- |
| `circular-import` | warning | A node `import` forms a cycle. |
| `circular-style-import` | warning | A style import forms a cycle. |
| `file-not-found` | error | An imported file does not exist. |
| `directory-not-found` | error | An imported directory does not exist. |
| `style-file-not-found` | warning | An imported style file does not exist. |

### Style validation

Validating `.krs.style` property names and values.

| Code | Severity | Fires when |
| --- | --- | --- |
| `style-unknown-property` | warning | A style property name is not recognised. |
| `style-invalid-enum-value` | error | A style value is not in the allowed enum. |
| `style-invalid-hex-color` | error | A style hex color is malformed. |
| `style-invalid-length-unit` | error | A style length uses a disallowed unit. |
| `style-missing-length-unit` | error | A style length is missing its required unit. |
| `style-out-of-range` | error | A style numeric value is outside its min / max bounds. |
| `style-token-type-mismatch` | error | A style token does not match the expected type. |
| `expected-style-property-name` | error | The style parser expected a property name. |
| `expected-semicolon-between-properties` | error | The style parser expected a `;` between properties. |
| `unknown-edge-selector-attribute` | error | An edge selector uses an attribute other than `from` / `to` (e.g. `edge[source=X]`). |
| `style-conflict` | warning | A selector is defined in more than one user style sheet. |
| `style-column-invalid-value` | warning | A style `column` value is not `left` / `center` / `right`. |
| `style-column-ignored-non-system-view` | warning | A `column` hint is applied to a deploy / org view (ignored). |
| `style-grid-columns-invalid-value` | warning | A style `grid-columns` value is not a positive integer (the hint is dropped; layout auto-balances). |

### Client & capability

The `client` sub-language: storage kinds and capabilities.

| Code | Severity | Fires when |
| --- | --- | --- |
| `client-resource-invalid-kind` | error | A client `resource` storage kind is not one of the reserved values. |
| `client-capability-duplicate` | warning | A client declares the same capability name twice. |

### Syntactic & parse-level errors

Low-level parser errors raised when tokens do not form a valid construct. These
are mechanism-level by nature; the "rule" is the grammar itself.

| Code | Severity | Fires when |
| --- | --- | --- |
| `token-type-mismatch` | error | A token does not match the type the parser expected. |
| `unexpected-token-root` | error | An unexpected token appears at the root level. |
| `unexpected-token-in-block` | error | An unexpected token appears inside a block. |
| `expected-brace-or-string` | error | The parser expected a `{` or a string literal. |
| `expected-identifier` | error | The parser expected an identifier. |
| `expected-string-after` | error | The parser expected a string after a property keyword. |
| `expected-id-or-string` | error | The parser expected an id or a string. |
| `expected-node-id` | error | The parser expected a node id. |
| `expected-property-value` | error | The parser expected a property value. |
| `expected-id-after` | error | The parser expected an id after a property keyword. |
| `invalid-node-kind` | error | A node kind keyword is not recognised. |
| `property-not-for-node-kind` | error | A property is not valid for the node kind it appears on. |
| `link-url-scheme-not-allowed` | warning | A `link` URL scheme is not in the allowed set (http / https / mailto). |

### Application-level fallbacks

Synthetic codes the app uses when wrapping a thrown compile / parse error.

| Code | Severity | Fires when |
| --- | --- | --- |
| `app-project-compile-error` | error | `compile()` threw and the app reports a generic compile failure. |
| `app-org-parse-error` | error | Org parsing threw and the app reports a generic parse failure. |
| `generic-text` | error | A pre-built fallback message string with no structured params. |

## Catalog completeness

Every member of `DiagnosticParamsByCode` and `WarningKind` (in
`packages/core/src/types`) must appear as a `code` in this document. A meta-test
(`packages/core/src/types/diagnostics-catalog.test.ts`) asserts this in both
directions, so the catalog cannot silently drift from the emitted codes. The
discipline behind it is recorded as
[TPL-1623](../test-perspectives/TPL-1623-diagnostics-catalog-completeness.md).

> Related TPLs: [TPL-1623](../test-perspectives/TPL-1623-diagnostics-catalog-completeness.md) (catalog ↔ code completeness), [TPL-1386](../test-perspectives/TPL-1386-diagnostic-register-fact-vs-style.md) (fact vs style register), [TPL-2171](../test-perspectives/TPL-2171-spec-promised-diagnostics-implemented.md) (spec-promised diagnostics are implemented), [TPL-1296](../test-perspectives/TPL-1296-spec-doc-reference-data-sync.md) (spec ↔ source-of-truth sync).
</content>
