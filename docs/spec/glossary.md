# Glossary

> **English**（this file） · [日本語](glossary.ja.md)

A quick reference to karasu's core vocabulary. karasu is inspired by the
[C4 Model](../concepts.md#how-karasu-differs-from-c4-model) but has its own
terms, separating a system's **logical**, **physical**, and **organizational**
structure.

This page is an **index, not the source of truth**: each entry gives a one-line
definition and links to the authoritative document
([Core Concepts](../concepts.md), [Syntax](syntax.md), [Style](style.md),
[Tags & annotations](tags-annotations.md),
[Diagnostics](diagnostics.md)). When a definition here and its source disagree,
the source wins — follow the link.

> Related TPLs: [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md) — this glossary re-presents definitions that live canonically elsewhere; entries must not contradict their linked source.

## Core concepts

- **Three-dimensional structure** — karasu describes architecture across three
  independent dimensions — logical (what / why), physical (how), and
  organizational (who) — written in separate files but navigated together.
  [Concepts](../concepts.md#three-dimensional-structure-logical-physical-organizational)
- **Logical structure** — the *what / why* view: the access path (who reaches
  which services through what) and the service hierarchy (the business
  functionality each service contains).
  [Concepts](../concepts.md#logical-structure-what--why)
- **Physical structure** — the *how* view: the deployment units that actually
  run the logical services, written in `.krs` files separate from the logical
  model. [Concepts](../concepts.md#physical-structure-how)
- **Organizational structure** — the *who* view: which team owns which service
  or domain, making ownership explicit alongside the architecture.
  [Concepts](../concepts.md#organizational-structure-who)
- **Drill-down** — the way to understand a model: start from a bounded overview
  and descend into any node that has children for more detail.
  [Concepts](../concepts.md#drill-down-as-the-way-to-understand-architecture)
- **Scoped glance** — the cognitive principle behind drill-down: show a bounded
  field of view at a time rather than one diagram of everything.
  [Concepts](../concepts.md#limit-what-is-shown-at-once-drill-down-for-detail-scoped-glance)
- **Ghost** — a semi-transparent placeholder for a node outside the current
  viewpoint that still participates in a dependency, so boundaries stay visible
  as the field narrows.
  [Concepts](../concepts.md#ghost--keep-boundaries-visible-even-as-the-field-narrows-under-drill-down)
- **Text as the source of truth** — the `.krs` text (not a diagram or binary
  file) is the authoritative model; every input path converges on it.
  [Concepts](../concepts.md#karasu-describes-architecture-as-text)

## Logical element kinds

- **System** — a boundary containing owned services, external services,
  clients, and the users that reach them.
  [Concepts](../concepts.md#logical-structure-what--why)
- **Service** — an independent unit of business capability; the middle tier of
  both the access path and the service hierarchy.
  [Concepts](../concepts.md#logical-structure-what--why)
- **Domain** — a business-concern boundary inside a service, close to DDD's
  Bounded Context; the level at which cross-service dependencies are reasoned
  about. [Concepts](../concepts.md#logical-structure-what--why)
- **Usecase** — a business operation or task within a domain; the level at which
  CRUD operations on resources are declared.
  [Concepts](../concepts.md#logical-structure-what--why)
- **Resource** — what a usecase operates on: a table, an external API, a file,
  and so on. [Concepts](../concepts.md#logical-structure-what--why)
- **User** — an actor that drives the system, tagged `[human]` or `[ai]`.
  [Syntax](syntax.md#user-node-example)
- **Client** — software the project itself ships to act on a user's behalf
  (mobile / web / desktop / CLI / device / extension / embed), distinct from
  third-party browsers or agents.
  [Concepts](../concepts.md#structure-not-implementation--the-client-sub-language-as-the-test-case)
- **Form-factor tag** — one of seven recognized tags on a `client`
  (`[mobile]`, `[web]`, `[desktop]`, `[cli]`, `[device]`, `[extension]`,
  `[embed]`) classifying the surface a user reaches the system through.
  [Syntax](syntax.md#client-form-factor-tags-recognized)
- **Infra** — a data store shared by services, declared at system level:
  `database` (of `table`s), `queue` (of messages), or `storage` (of
  buckets). Services depend on infra, never the reverse.
  [Syntax](syntax.md#infra-layer-shared-data-stores--rendered-on-the-system-view)

## Relationships

- **Edge** — a directed relationship between logical nodes: `->` for
  synchronous, `-->` for asynchronous communication / dependency.
  [Concepts](../concepts.md#edges--expressing-relationships-and-aggregating-them)
- **Explicit / implicit edge** — explicit edges are written by hand; implicit
  edges are synthesized at service level when domain-level edges cross a service
  boundary (tagged `[implicit]`).
  [Concepts](../concepts.md#explicit-and-implicit--the-asymmetry-between-writer-and-reader)
- **Aggregation** — collapsing multiple domain-level edges between the same
  service pair into one implicit edge per sync / async kind on the system view.
  [Concepts](../concepts.md#aggregation--reducing-information-when-seen-from-above)
- **realizes** — a relationship pointing from a physical deployment unit
  (concrete) to the logical service / domain / client / infra node (abstract)
  it implements.
  [Concepts](../concepts.md#binding-logical-to-physical-with-realizes)
- **owns** — a relationship, declared inside a `team`, stating that the team
  owns a service, domain, or other logical node.
  [Concepts](../concepts.md#binding-organization-to-logicalphysical-with-owns)
- **handles** — a property on a `client` or `service` declaring which domain ids
  it exposes to its callers; validated against the one-hop expose rule.
  [Syntax](syntax.md#handles-property--what-a-clientservice-exposes-to-its-callers)
- **delivers** — a relationship from a `service` to the `client`(s) it ships
  (the BFF / SSR pattern); ownership-and-shipping, not a build pipeline.
  [Syntax](syntax.md#delivers-service--client)

## Physical / deploy vocabulary

- **Deployment unit** — a physical form that realizes a logical node. Kinds:
  `war`, `jar`, `oci`, `lambda`, `function`, `assets`, `job` (one-shot, or
  recurring with a `schedule`), and `artifact` (catch-all).
  [Syntax](syntax.md#writing-physical-diagrams)
- **store** — a dedicated deployment kind for a managed data store (Aurora,
  SQS, S3, …) that realizes a logical infra node; carries `type` and
  `realizes`, but no `runtime` or `schedule`.
  [Syntax](syntax.md#realizing-shared-infra-the-store-kind)

## Organizational vocabulary

- **Organization** — the root of an organizational hierarchy; contains nested
  teams. [Syntax](syntax.md#writing-organization-diagrams)
- **Team** — a group with responsibility that may own services / domains and
  contain members; may be nested under a parent team.
  [Syntax](syntax.md#team-node)
- **Member** — an individual belonging to a team, with optional contact
  properties (`slack`, `github`, …). [Syntax](syntax.md#member-node)
- **Role** — a short description of what a user does in the system; an actor
  archetype, **not** an authorization primitive (no RBAC).
  [Syntax](syntax.md#user-node-example)

## Tags & annotations

- **Tag** — a `[name]` declaration expressing architectural position or role
  (e.g. `[external]`), to which styles respond.
  [Tags & annotations](tags-annotations.md#tags-)
- **Annotation** — an `@name` declaration expressing lifecycle / development
  state, inherited by child nodes unless overridden.
  [Tags & annotations](tags-annotations.md#annotations-)
- **Tags vs. annotations** — tags describe *what a node is* (position / role);
  annotations describe *where it is in its lifecycle*.
  [Tags & annotations](tags-annotations.md#difference-between-tags-and-annotations)
- **`[external]`** — a tag for nodes outside the system boundary; rendered with
  a dashed border and gray tone. [Tags & annotations](tags-annotations.md#tags-)
- **System-assigned tags** — tags karasu adds automatically to edges:
  `[implicit]`, `[cyclic]`, and `[read]` / `[write]` (from a usecase's CRUD
  operations). [Tags & annotations](tags-annotations.md#automatic-tags-on-edges)
- **Lifecycle annotations** — `@deprecated`, `@new`, `@experimental`, and
  `@migration_target`; some accept parameters (`until`, `from`).
  [Tags & annotations](tags-annotations.md#annotations-)
- **Annotation inheritance** — a parent's annotation flows to its children until
  a child carries its own, keeping lifecycle context across drill-down.
  [Concepts](../concepts.md#annotation-inheritance--keeping-context-across-drill-down)
- **Capability** — a device or browser permission a `client` requests
  (open-set identifiers); distinct from a resource, which is storage.
  [Tags & annotations](tags-annotations.md#client-capabilities)

## CRUD

- **Operations** — the CRUD verbs (`create` / `read` / `update` / `delete`) a
  usecase performs on a resource.
  [Syntax](syntax.md#operations-property--crud-verbs-a-usecase-performs-on-a-resource)
- **Verb decoration** — `verb:crud` syntax mapping a domain verb to CRUD intent
  (e.g. `list:read`, `enqueue:create`), so authors keep their own vocabulary
  while still feeding the CRUD matrix.
  [Syntax](syntax.md#verb-decoration-syntax-1n-crud-mapping)
- **CRUD matrix** — a usecase × resource read/write matrix derived from
  declared operations (rendered as a view, or via `karasu matrix`).
  [Syntax](syntax.md#operations-property--crud-verbs-a-usecase-performs-on-a-resource)

## Style

- **`.krs.style`** — a stylesheet that maps selectors to visual properties,
  cascading like CSS over the model. [Style](style.md#selector-types)
- **Selector** — a CSS-like pattern targeting nodes or edges by kind, tag,
  annotation, id, or a compound of these. [Style](style.md#selector-types)
- **Specificity** — the score deciding which rule wins when several selectors
  match the same node (kind = 1 … id = 100).
  [Style](style.md#specificity-rules-cascade)
- **Layout hints** — escape-hatch properties (`column`, `direction`,
  `label-position`, `label-offset`) nudging layout without the engine enforcing
  them. [Style](style.md#layout-hints-escape-hatch)
- **Legend** — a top-level block mapping colors to meanings, rendered as a
  footer band; entries are a `swatch` (literal hex) or a `ref` (resolved through
  the style cascade). [Syntax](syntax.md#diagram-legend)

## Diagnostics

- **Rule** — a statement of what the language allows or forbids (e.g. "an edge
  originates within its enclosing block").
  [Diagnostics](diagnostics.md)
- **Diagnostic** — a named report that a rule was violated, identified by a
  **diagnostic code** (e.g. `edge-source-mismatch`).
  [Diagnostics](diagnostics.md)
- **Diagnostic code** — the stable, never-renamed string id of a diagnostic,
  consumed by the LSP, app, and tooling. [Diagnostics](diagnostics.md)
- **Severity** — a diagnostic's level: `error` (model malformed, construct
  rejected), `warning` (a real defect to fix), or `info` (a fact, not a
  defect). [Diagnostics](diagnostics.md)
- **Warn-don't-error** — an unresolved reference is reported as a warning and
  the source node is kept, so structural facts survive a dangling link.
  [Diagnostics](diagnostics.md)
- **Domain dispersal** — the same domain id appearing under multiple services in
  one system; surfaced as `info`, not an error.
  [Concepts](../concepts.md#domain-dispersal-detection)
- **Cyclic dependency** — a cycle of sync (`->`) edges; detected statically,
  tagged `[cyclic]`, and rendered in red. Async edges are excluded as
  intentional loose coupling.
  [Concepts](../concepts.md#automatic-checks--cyclic-dependencies)

## Multi-file

- **Import** — bringing another `.krs` file's content into the current one:
  named (`import { Foo } from "p.krs"`), whole-file (`import "p.krs"`), or
  directory (`import "dir/"`). [Syntax](syntax.md#multi-file-import-semantics)
- **System reopen** — the same `system` id appearing in more than one file is
  merged into a single block (closer-to-root properties win on conflict) rather
  than treated as a duplicate.
  [Syntax](syntax.md#s3-same-id-system-blocks-merge-system-reopen)

## See also

- [Core Concepts](../concepts.md) — the dimensions and principles behind the
  vocabulary.
- [Syntax reference](syntax.md) · [Style reference](style.md) ·
  [Tags & annotations](tags-annotations.md) ·
  [Diagnostics](diagnostics.md) — the authoritative specifications.
