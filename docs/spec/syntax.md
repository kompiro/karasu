# .krs Syntax Reference

> **English** (this file) · [日本語](syntax.ja.md)

## File structure

```
@import "default.krs.style"
@import "theme/dark.krs.style"   // multiple allowed; later ones take precedence

// Domains not yet assigned to a service (top-level)
domain Payment { label "Payment" }

system ECPlatform {
  label "EC Platform"
  // service, user, and edge declarations
}
```

---

## Overview of concepts

karasu explicitly separates **logical structure** and **physical structure**.

### Logical structure (what / why)

<!-- gen:reference:node-kinds-logical — DO NOT EDIT. Generated from packages/core/src/builtins/reference-data.ts; run `pnpm gen:reference`. -->
| Keyword | Meaning | May contain |
|---------|---------|-------------|
| `system` | Container showing the relationships between owned/external services and clients | `service`, `user`, `client`, `database`, `queue`, `storage` |
| `user` | A user of the system (human or AI agent) | — |
| `client` | User-delegated software the project itself ships (mobile / web / desktop / cli / device / extension / embed) | — |
| `service` | An independent unit of business capability | `domain` |
| `domain` | A business-concern boundary (top-level or inside a service) | `usecase` |
| `usecase` | A business task or operation within a domain | `resource` |
| `resource` | A target that a usecase reads or writes (table, external API, file, etc.) | — |
<!-- /gen:reference:node-kinds-logical -->

The recognized `client` form-factor tags are listed below.

#### `client` form-factor tags (recognized)

karasu's tag system is intentionally open — any tag is accepted and styles react via selectors. For `client` specifically, **seven names are recognized** as form-factor classifications. Future versions will respond to them with kind-specific icons (Phase 2) and layout hints. Tags outside this list still parse and behave as ordinary user-defined tags; they simply do not trigger karasu's built-in form-factor treatment.

<!-- gen:reference:client-form-factor-tags — DO NOT EDIT. Generated from packages/core/src/builtins/reference-data.ts; run `pnpm gen:reference`. -->
| Tag | Form factor |
|-----|-------------|
| `[mobile]` | iOS / Android native app |
| `[web]` | SPA running on the vendor's own origin |
| `[desktop]` | Desktop app (Electron, native) |
| `[cli]` | Command-line tool / SDK shipped to users |
| `[device]` | IoT / dedicated terminal / KIOSK |
| `[extension]` | Plugin / extension hosted by another application (browser extension, IDE extension, design-tool plugin) |
| `[embed]` | Widget / SDK embedded into third-party web content (Stripe Checkout, Intercom, etc.) |
<!-- /gen:reference:client-form-factor-tags -->

Recommended: pick at most one form-factor tag per client. Combining unrelated form factors (e.g. `[mobile] [desktop]`) is parseable but conveys no additional architectural meaning.

`client` is reserved for software the project itself ships. Third-party browsers / IDEs / AI agents that consume the system are modeled as `user` (typically `[human]` or `[ai]`), not `client`.

#### `handles` property — what a client/service exposes to its callers

Both `client` and `service` may declare a `handles` property listing **domain ids exposed to callers**. It is a *validated cross-reference*: the domain id must be reachable through a one-hop expose rule, otherwise an `unresolved-handles` warning is emitted.

```krs
service Backend {
  domain Order {}      // self-owned — handles entry not required
}
service Bff {
  handles Order        // re-export: Order is owned by Backend, reached via the edge below
}
client WebApp [web] {
  handles Order        // surfaces Order to the end user via the BFF
}

WebApp -> Bff
Bff -> Backend
```

Forms accepted:

```krs
client A [web] { handles Order }
client B [web] { handles Order, Catalog, Inventory }
client C [web] {
  handles Order
  handles Catalog
}
```

**Expose rule** (used by the validator):

> A node `N` *exposes* domain `D` iff:
> 1. `N` has a child `domain D` (self-owned), **or**
> 2. `N` declares `handles D` and at least one outgoing communication edge target also exposes `D`.

`delivers` and other declarative properties do not count as edges. The rule expands one hop at a time, so each link in a `client → BFF → backend` chain must be declared explicitly — there is no implicit auto-passthrough.

### Infra layer (shared data stores) — rendered on the system view

Some data stores are shared by several services rather than owned by a single `usecase`. Declare them at the **top level of a `.krs` file** (or directly inside a `system` block) using one of the three infra-block keywords below; each may nest leaf sub-resources. These nodes render on the **system view**, in the dependency tier next to `[external]` services — services *depend on* shared infra, never the other way round. They were promoted to first-class nodes in [ADR-20260405-05](../adr/20260405-05-database-as-first-class-node.md).

<!-- gen:reference:node-kinds-infra — DO NOT EDIT. Generated from packages/core/src/builtins/reference-data.ts; run `pnpm gen:reference`. -->
| Keyword | Layer | Intended use | May contain |
|---------|-------|--------------|-------------|
| `database` | system-level infra block | A database shared by services (RDBMS, document store, …) | `table` |
| `queue` | system-level infra block | A message queue / topic shared by services | `queue-item` |
| `storage` | system-level infra block | An object store / blob storage shared by services (S3, GCS, …) | `bucket` |
| `table` | leaf, inside a `database` block | A table / collection in the database | — |
| `queue-item` | leaf, inside a `queue` block | A message / event type carried by the queue. Written with the `queue` keyword inside a `queue` block (parsed internally as `queue-item`) | — |
| `bucket` | leaf, inside a `storage` block | A bucket / container in the object store | — |
<!-- /gen:reference:node-kinds-infra -->

- Only `label`, `description`, and `link` properties apply to infra nodes and their sub-resources; all are optional, and omission emits a warning, not an error. The `operations` CRUD property is **not** valid here — it is only meaningful on `resource` declarations inside a `usecase` (see below).
- `database` / `queue` / `storage` are valid only at the top level or as a direct child of `system`. Nesting one inside a `service`, `domain`, or `usecase` is rejected with `infra-not-in-context`.
- `table` / `queue-item` / `bucket` are leaf nodes: they accept properties and edges but no nested declarations.
- A `usecase` ties one of its `resource`s to a shared sub-resource with dot-notation — `resource <InfraId>.<SubResourceId>` (e.g. `resource OrderDB.OrderTable`). The resolver aggregates these references to derive the `service → database` (and `service → queue` / `service → storage`) edges shown on the system view, and may synthesize `[read]` / `[write]` tags on the usecase→resource edges — see [docs/spec/tags-annotations.md](./tags-annotations.md#system-assigned-tags).
- `[external]` may be applied to `database` / `queue` / `storage` for a store that lives outside the system boundary (a managed third-party DB, an external event bus, …).
- Writing `resource OrderTable` *without* a matching `database` block is allowed (warning only, rendered as an orphan node) so you can discover resources bottom-up while sketching a `usecase`, then group them into a `database` block and switch to the dot-notation reference.
- The infra-block **keyword** `table` (a `database` leaf, declaring the shared node) and the shape **tag** `[table]` (a usecase `resource`'s draw-shape) are related, not the same. A usecase references an infra leaf with a `resource` via the dot-notation above, and karasu **infers the shape tag from the referenced infra sub-resource kind** — `table` → `[table]`/cylinder, `queue-item` → `[queue]`, `bucket` → `[storage]` — so the reference is drawn in the same shape as the store it points to. The keyword declares the node's *kind*; the `[...]` tag is a suffix that sets only a `resource`'s *shape* (and may also be written by hand). The same word in two positions never collides. See [tags-annotations.md](./tags-annotations.md) for the full guidance.

```krs
system ECPlatform {
  service ECommerce {}        // domains / usecases omitted for brevity

  database OrderDB {
    label "Order DB"
    table OrderTable   { label "Orders" }
    table ProductTable { label "Products" }
  }
  queue OrderEvents {
    queue OrderPlaced  { label "Order placed" }   // declared with `queue`, parsed as a queue-item
  }
  storage MediaStorage {
    bucket ProductImages { label "Product images" }
  }
}
```

> Related TPLs: [TPL-20260519-02](../test-perspectives/TPL-20260519-02-shared-vocabulary-dual-representation.md) — the infra-sub-kind → shape-tag inference (`INFRA_SUB_KIND_TO_TAG`) and the shape-tag table are two representations of one vocabulary that must stay in sync.

### Organizational structure (who owns what) — rendered as a separate diagram

An independent axis from logical/physical, describing the **ownership** of services and domains.
`organization` is the root, with nested `team` declarations. Each team lists the nodes it owns via `owns` and may contain `member` entries.

| Keyword | Meaning | May contain |
|---------|---------|-------------|
| `organization` | Root of an organization. Multiple declarations allowed | `team` |
| `team` | A team with responsibility. May be nested | `team`, `member`, `owns` |
| `member` | An individual belonging to a team | — |

### Physical structure (how) — rendered as a separate diagram

Deployment units are declared inside a `deploy` block using a kind keyword.
All properties are optional. When omitted, a warning is emitted rather than an error.

<!-- gen:reference:deploy-unit-kinds — DO NOT EDIT. Generated from packages/core/src/builtins/reference-data.ts; run `pnpm gen:reference`. -->
| Keyword | Description | Properties |
|---------|-------------|------------|
| `war` | WAR / EAR (Servlet / EJB container) | `runtime`, `realizes` |
| `jar` | Executable JAR (e.g. Spring Boot) | `runtime`, `realizes` |
| `oci` | Container image | `image`, `runtime`, `realizes` |
| `lambda` | AWS Lambda | `runtime`, `realizes` |
| `function` | Azure Functions / Google Cloud Functions | `runtime`, `realizes` |
| `assets` | Static files / SPA (served via CDN) | `runtime`, `realizes` |
| `job` | Batch job. Without schedule: one-shot; with schedule: recurring | `runtime`, `schedule`, `realizes` |
| `artifact` | Any kind not covered above | `type`, `runtime`, `realizes` |
| `store` | Managed data store realizing a logical infra node (Aurora PostgreSQL, Amazon SQS, S3, …) | `type`, `realizes` |
<!-- /gen:reference:deploy-unit-kinds -->

---

## Node declaration

```
<kind> <id> [<tags>] @<annotation> [{ <properties> <child-nodes> }]
```

`id` is required. Tags, annotations, and the body block are optional.

---

## Property block

Properties are written inside the body block `{ }`. Properties come before child nodes and edges.

| Property | Syntax | Applicable kinds | Description |
|----------|--------|-----------------|-------------|
| `label` | `label "<display-name>"` | All | Display name on the diagram. Defaults to the id when omitted |
| `description` | `description "<text>"` | All | Description text (use `"""..."""` for multi-line) |
| `role` | `role "<role-name>"` | user | Actor archetype, or a short one-line description of what this user does. **Not** an authz primitive (no `requires role = ...` predicate, no RBAC permission bundle) — see [ADR-20260511-02](../adr/20260511-02-no-runtime-authz-modeling.md) and [ADR-20260511-04](../adr/20260511-04-user-role-keyword-clarification.md) |
| `delivers` | `delivers <ClientId>[, <ClientId>...]` | service | Client(s) this service ships (BFF / SSR pattern). The renderer draws each entry as a distinct dashed edge from the service to the referenced `client` |
| `link` | `link "<URL>" "<label>"` | All | Link to related documentation (multiple allowed). Label is optional |
| `resource` | `resource <storageKind> "<name>"` | client | Operation-tied local storage on the client. Multiple allowed. See client resource kinds below |
| `capability` | `capability <name>` or `capability <name> { label "..." description "..." }` | client | Device / browser capability the client requests (camera, geolocation, notification, etc.). Multiple allowed. See client capabilities below |

All properties are optional. `link` may appear multiple times within the same node.
Using a property on a kind that does not support it produces an error.

A `link` URL should be an absolute `http:` / `https:` / `mailto:` URL. Any other
scheme (e.g. `javascript:`) or a relative path emits a
`link-url-scheme-not-allowed` warning. The link is kept in the model (so
formatting does not delete it from your source), but preview panels — which
render link URLs as clickable `<a href>` — only show `http:` / `https:` /
`mailto:` links, since a `javascript:` href would execute in the app origin.

> Related TPLs: TPL-20260510-17 — `外部から来る input は trust boundary を越える前に validate / canonicalize する`

### user node example

```
user <id> [<human|ai>] {
  label "<display-name>"
  role "<role-name>"
  link "<URL>" "<label>"
}
```

- The tag `[human]` / `[ai]` distinguishes human users from AI agents.
- `role` describes the actor archetype or what this user does within the system (a short one-line label or sentence). It is **not** an authz primitive: it does not represent a RBAC permission bundle, and karasu does not introduce a `requires role = ...` predicate or similar authz construct (see [ADR-20260511-02](../adr/20260511-02-no-runtime-authz-modeling.md) and [ADR-20260511-04](../adr/20260511-04-user-role-keyword-clarification.md)). To document who may execute a usecase, use the usecase's `description` and a `link` to an external policy document.
- Properties and the body block `{ }` are optional.

### service / domain node example

```
service <id> {
  label "<display-name>"
  link "<URL>" "<label>"
  link "<URL>" "<label>"

  domain <domainId> {
    label "<domain-name>"
    ...
  }
}
```

### client node example

```
client <id> [<form-factor-tag>] {
  label "<display-name>"
  description "<text>"
  resource <storageKind> "<name>"
  resource <storageKind> "<name>"
}
```

#### `client` `resource` storage kinds

`resource <storageKind> "<name>"` declares operation-tied local storage on a client (a `localStorage` key, an IndexedDB database, an OPFS file, etc.). Multiple `resource` lines are allowed and render inline on the client card.

The `<storageKind>` must be one of the six reserved values below. Any other kind is rejected with `client-resource-invalid-kind` so that authentication credentials, cookies, and device capabilities (which need stronger modeling) do not silently slip into the storage list.

| Storage kind | Typical surface |
|--------------|-----------------|
| `localStorage`   | Browser localStorage key |
| `sessionStorage` | Browser sessionStorage key |
| `indexedDB`      | IndexedDB database |
| `opfs`           | Origin Private File System file/directory |
| `file`           | Local filesystem file (desktop / CLI / device clients) |
| `keychain`       | OS keychain / Keystore entry (excluding raw credentials — modeled separately) |

> Cookie / session / credential storage is intentionally out of scope here and is tracked under the security parent issue (#834). Device capabilities (camera, geolocation, etc.) are tracked under #837.

```
client WebApp [web] {
  label "Customer SPA"
  resource localStorage "preferences"
  resource indexedDB "outbox"
}
```

**Rendering**: the SVG card shows a single `📦 ×N` count badge instead of one row per resource (so card height stays bounded as the list grows). The full list — kind and name in declaration order — is surfaced in the `NodeDetailPanel` "Storage resources" section. See [AT-0069](../acceptance/0069-client-resource-badge-and-detail-panel.md).

#### `client` `capability`

`capability <name>` declares a device or browser capability the client requests (camera, geolocation, notification, bluetooth, …). Capabilities are conceptually distinct from `resource`: a resource is storage the client reads/writes, a capability is a feature the OS / browser must grant permission for. The recommended capability set is documented in [docs/spec/tags-annotations.md](./tags-annotations.md#client-capabilities).

Two forms are supported:

```
client OrderClient [mobile] {
  // Short form — flat 1 line for capabilities that need no annotation
  capability notification

  // Block form — when "why this capability" matters for review / threat
  // modeling, attach a label and / or description
  capability camera {
    label "QR scanning"
    description "Used to scan QR codes attached to inspection items"
  }
  capability geolocation {
    description "Continuous tracking during delivery"
  }
}
```

Capability identifier set is **open**: any kebab-case identifier is accepted. Names outside the recommended set parse without warning so that domain-specific capabilities (industry devices, internal-only features) can be expressed. The validator emits `client-capability-duplicate` when the same capability name is declared more than once on the same client.

**Rendering**: the SVG card shows a single `🔐 ×N` count badge mirroring the `resource` badge so the card height stays bounded. The full list (with label / description) surfaces in the `NodeDetailPanel`. See [AT-1002](../acceptance/1002-client-capability.md).

---

## Writing logical diagrams

### system block

```
system ECPlatform {
  label "EC Platform"

  user Customer [human] {
    description "A general user who purchases products"
  }
  user Admin [human] {
    description "An operator who manages the system"
  }

  service ECommerce {
    label "EC Site"
    description "Product management and order processing"
  }
  service Payment [external] {
    label "Payment Service"
    description "Credit card payment processing"
  }
  service Inventory [external] {
    label "Inventory"
    description "Inventory data management"
  }

  Customer  ->  ECommerce "Place an order"
  ECommerce ->  Payment   "Process payment"
  ECommerce --> Inventory "Sync inventory"
}
```

#### Top-level placement

`user` declarations and edges are only valid **inside** a `system` block — a
`user` actor and a relationship both belong to a system's boundary. Writing
either at the top level of a file is a parse error (`top-level-declaration`);
the parser reports it and skips the offending construct. (By contrast,
`domain` and the infra blocks `database` / `queue` / `storage` *may* sit at the
top level — see their sections.) This rule is catalogued in the
[diagnostics & rules reference](diagnostics.md).

The asymmetry with top-level infra is deliberate: shared infra is a single
**thing** referenced by many systems (one top-level identity), whereas a `user`
models an **actor's relationship** with a particular system — its `role` is
defined *within that system*. So the same person interacting with two systems
is two `user` nodes, linked only by a shared id (by convention). A cross-system
shared actor / persona is intentionally left as a possible post-v1.0 extension,
out of scope here (see [#1639](https://github.com/kompiro/karasu/issues/1639)).

> Related TPLs: [TPL-20260610-02](../test-perspectives/TPL-20260610-02-spec-promised-diagnostics-implemented.md) — a spec-promised placement rule must have a dedicated diagnostic code, not fall through to a generic parse error.

### service block

The internals of a service are decomposed into domains.
If the same domain spans multiple services, the tool emits a warning (a design-problem signal).

```
service ECommerce {
  label "EC Site"
  domain Order {
    label "Orders"
    usecase PlaceOrder {
      label "Accept an order"
      resource OrderTable {
        label "Order table"
      }
      resource InventoryAPI [external] {
        label "Inventory API"
      }
    }
    usecase CancelOrder {
      label "Cancel an order"
    }
    usecase QueryOrder {
      label "Query order status"
    }
  }
  domain Purchasing {
    label "Purchasing"
    usecase OrderFromSupplier {
      label "Place an order with a supplier"
    }
    usecase CheckPurchaseStatus {
      label "Check purchase status"
    }
  }
}
```

#### `delivers` (service → client)

A `service` may declare which `client` node(s) it ships, modeling the BFF / SSR
pattern (Next.js, Rails+React, Laravel+Vue, etc.). The server-side and the
browser-side bundle are different OAuth2 client types and are modeled as
separate nodes joined by `delivers`:

```
service NextServer {
  label "Next.js BFF"
  delivers WebApp           // single client
}

service Gateway {
  delivers WebApp, AdminUI  // comma-separated list
}

client WebApp [web] {}
client AdminUI [desktop] {}
```

Each `delivers` entry synthesizes a dashed edge from the service to the
referenced client on the system view. The target id must resolve to a peer
`client` node; if it does not, the resolver emits a `delivers-target-not-client`
warning. `delivers` is a declarative property — it is not a new edge kind, and
regular API calls between client and service are still written with `->`.

#### `operations` property — CRUD verbs a usecase performs on a resource

Inside a `usecase`, a `resource` may declare `operations` to record which CRUD-style verbs the usecase performs on that resource. This makes the usecase × resource matrix explicit (write vs. read-only) for domain analysis, coupling detection, and translate-adapter round-tripping.

```
usecase PlaceOrder {
  resource OrderTable {
    label "Order table"
    operations create, read
  }
  resource InventoryAPI [external] {
    operations read
  }
}
```

Forms accepted:

```
operations create                 // single verb
operations create, read           // comma-separated list
operations create
operations read, update           // multiple lines accumulate
```

The `operations` property is only valid for `resource` declarations inside a `usecase`. It is not meaningful on infra-side declarations (`table` / `queue-item` / `bucket` — see the "Infra layer (shared data stores)" section above).

| Operation | Meaning |
|-----------|---------|
| `create` | The usecase produces new items in the resource (write) |
| `read` | The usecase consumes the resource non-destructively |
| `update` | The usecase mutates existing items in the resource (write) |
| `delete` | The usecase removes items from the resource (write) |

Verbs outside this set still parse and are preserved on the AST so translate adapters (`translate openapi` / `translate db`) can round-trip non-CRUD operations such as `list`, `search`, or `execute`. The parser emits an `unknown-resource-operation` warning pointing at the offending verb. Duplicate verbs raise a `duplicate-resource-operation` warning and are deduplicated on the AST.

**Omission semantics**: when `operations` is omitted, behavior matches today — the dependency is opaque and no warning is emitted. This preserves the "not-yet-decided" tolerance documented under §Property requirement and omission rules.

##### Verb-decoration syntax (1:N CRUD mapping)

Custom verbs that carry domain meaning can be annotated with their CRUD intent using the `<verb>:<crud>[,<crud>...]` decoration. This lets authors keep their natural vocabulary while still feeding the CRUD matrix view and write-dominates classifier.

```
operations list:read, search:read           // 1:1 mapping
operations enqueue:create, dequeue:delete   // queue idioms
operations replace:create,delete            // physical delete-insert (1:N)
operations create, list:read                // mix decorated + bare
```

Behavior:

- The right-hand side accepts only recognised CRUD verbs (`create` / `read` / `update` / `delete`). Any other identifier raises `invalid-crud-decoration` (error).
- An empty right-hand side (`list:`) raises `empty-crud-decoration` (error).
- A duplicated CRUD verb on the right (`replace:create,create`) raises `duplicate-crud-decoration-target` (warning) and is deduplicated.
- A decorated verb does **not** raise `unknown-resource-operation`, even if the verb itself is outside the recognised set — the decoration is the author's CRUD declaration.
- The CRUD matrix view ([ADR-20260502-01](../adr/20260502-01-crud-matrix-view.md)) reads `decoratedAs` first when computing cell letters, ΣC/R/U/D totals, and the write-dominates flag. A decorated verb never produces a `?` suffix.

Disambiguation rule for 1:N + multiple verbs on one line: once the parser sees `verb:`, the comma-separated identifiers that follow are CRUD-RHS continuations until the next `<id>:` boundary. So `search:read,create, list:read` parses as `search:[read,create]` then `list:[read]`. To express a bare verb after a decorated one, place the bare verb earlier in the list (`create, list:read`).

**Usage guidance — when to use 1:N**: reserve `verb:create,delete` for genuine physical delete-insert idioms (`REPLACE INTO`, soft-delete + new row, Kafka tombstone + new key). For logical in-place rewrites of the same entity, use `update` instead. Tools do not enforce this distinction — it is a documentation convention.

#### Authorization notes — write them as `description` + `link`

[ADR-20260511-02](../adr/20260511-02-no-runtime-authz-modeling.md) decided that karasu does **not** model usecase-level authorization (role / license / plan / scope predicates) in its vocabulary. The structural language describes *what exists* and *how it relates*; *who may call a usecase at runtime* is left to the canonical policy doc or IAM tool (OPA, Cedar, Casbin, internal RBAC docs, etc.).

To keep that prose from drifting into ad-hoc vocabulary across teams, write authz notes on a `usecase` using this pattern:

```
usecase RefundOrder {
  label "Refund an order"
  description "Access: admins and billing operators only. See policy link for the exact rule."
  link "https://policy.example.com/refund-order" "Authorization policy"
}
```

**Convention**:

- Start the relevant sentence in `description` with `Access:` (English) or `アクセス:` (Japanese) so a reader scanning the diagram can recognise the constraint at a glance. Keep it to one short sentence — the description is a *hint*, not the rule.
- Add a `link` whose label contains `Authorization policy` (or `Policy`) and whose URL points at the canonical policy doc / IAM rule. **The link is authoritative.** When the prose and the link disagree, the link wins; readers should treat the description as out-of-date.
- Do not invent attributes (`role: admin`, `requires: billing.write`, etc.) inside `description`. If a constraint cannot be summarised in one sentence, that is a signal the constraint belongs in the policy doc, not in the model.

Tools do not enforce or render this convention — there is no `Access:` badge, no policy-link decoration, no validator. It is a *prose contract* between authors so the same constraint is recognisable across files and teams. If you need a machine-checkable gate, that need is explicitly out of scope (see ADR-20260511-02).

### Top-level domain declaration

A `domain` can be declared at the top level of a file, not only inside a `service`.
Domains that do not belong to any service are treated as "unassigned" and displayed on the system view.
The compiler emits a warning for unassigned domains.

```
// Domains whose service assignment has not been decided yet
domain Payment { label "Payment" }
domain Inventory { label "Inventory" }

system ECPlatform {
  service ECommerce {
    // Domain assignment to be decided later
  }
}
```

Use cases:
- Listing domain concepts early in the design phase.
- Temporarily "parking" domains during a service reorganization.

### Edge declaration

```
<from_id> ->  <to_id> "<label>"   // sync (solid-line arrow)
<from_id> --> <to_id> "<label>"   // async (dashed-line arrow)
```

Edges can be written inside `system`, `service`, and `domain` blocks.

**Edge origin scope.** An edge declared inside a `service` or `domain` block
originates from that block. The implicit form `-> <to_id>` takes the enclosing
block id as its source, and an explicit `<from_id> -> <to_id>` must name that
same enclosing id; naming any other source raises an `edge-source-mismatch`
error (for both `->` and `-->`). Edges inside a `system` block may use any
declared node as their source. This rule and its diagnostic are catalogued in
the [diagnostics & rules reference](diagnostics.md).

**Cross-boundary dependencies.** The rule binds the *source*, not the *target*,
so a block can still depend on things it does not own:

- **On another service's domain** — keep your block as the source:
  `Billing -> Contract`, where `Contract` is a domain of a different service
  (see [Edges inside a domain block](#edges-inside-a-domain-block)).
- **On an external service** — declare it `[external]` and draw the edge to it:
  `ECommerce -> Payment` with `service Payment [external]`.
- **On something not modelled** — the edge is kept and the dangling endpoint is
  reported (`unresolved-edge-endpoint`, see §S6), rather than rejected.

To express an **inbound** dependency whose source you do not own (an external or
other-team service pointing *into* your block), model that source as an
`[external]` node and declare the edge at `system` scope, where any source is
allowed — the edge stays co-located with its source.

#### Optional edge id (`#<id>`)

A trailing `#<id>` gives an edge a stable, author-defined identifier that
the `.krs.style` resolver can target with the `edge#<id>` selector.

```
ECommerce -> Payment "Process payment" #criticalWrite
WebApp --> Bff #liveStream
A -> B [important] #namedEdge
```

The `#<id>` token comes after the optional label and tags. Edge ids must
be unique within the project; duplicates raise a `duplicate-edge-id`
error. When the `#<id>` is omitted, the edge falls back to a computed
canonical id of `<from><arrow><to>` (with `->` for sync and `-->` for
async). If two edges share the same computed base and neither has an
`#<id>`, an `ambiguous-edge-base` warning is raised and per-edge style
selectors do not match either of them.

The same suffix is accepted on a `usecase` block's `resource` row to
identify the synthesized usecase→resource edge:

```
usecase PlaceOrder {
  resource OrderDB.OrderTable #placeOrderWrite { operations create, read }
}
```

See [`docs/design/edge-id-selector.md`](../design/edge-id-selector.md)
for how the id flows into the `edge#<id>` style selector. The selector
itself is documented in [`docs/spec/style.md` — Edge ID selector](style.md#edge-id-selector-edgeid).

#### Edges inside a domain block

Declaring an edge inside a `domain` block expresses a dependency between domains.
`from_id` is the id of the declaring domain; `to_id` is the id of the dependency target.

```
service ECommerce {
  domain Contract { label "Contract" }
}

service BillingService {
  domain Billing {
    label "Billing"
    Billing -> Contract "Created from a contract"       // sync dependency
    Billing --> AuditLog "Record an audit log entry"    // async dependency
  }
}
```

**Intra-service domain edges**: rendered in the service view (drill-down into the service).

**Cross-service domain edges**: automatically derived and rendered as "implicit service-level edges" on the system view.
When multiple domain edges aggregate to the same service pair, the edge label reads `"N domain edges"`.

Implicit edges are automatically tagged with `[implicit]`. By default they are rendered as an amber dashed line.
If an explicit service-level edge already exists in the same direction, the implicit edge is not derived.

See [`docs/spec/tags-annotations.md`](tags-annotations.md) for the full list of available tags and styles.

---

## Writing physical diagrams

```
// deploy.krs
deploy "production" {

  war "order.war" {
    runtime  "Tomcat 9"
    realizes ECommerce
  }

  oci "inventory-service" {
    image    "inventory:2.1.0"
    runtime  "Node.js 20"
    realizes Inventory
  }

  assets "storefront" {
    runtime  "CloudFront / S3"
    realizes Frontend
  }

  job "data-migration" {          // no schedule → one-shot execution
    runtime  "Python 3.12"
    realizes Migration
  }

  job "monthly-billing" {         // with schedule → recurring execution
    schedule "0 0 1 * *"
    runtime  "Java 21"
    realizes Billing
  }

  artifact "legacy-settlement" {  // when no built-in kind fits
    type     "mainframe-batch"
    runtime  "COBOL / z/OS"
    realizes Settlement
  }
}
```

`realizes` corresponds to UML's Realization relationship. The arrow points from physical (concrete) to logical (abstract).

Multiple `realizes` entries can be listed to express that a single deployment unit realizes more than one service.
In that case, the same node is drawn inside each service's container on the deploy diagram.

```
oci "monolith" {
  image    "monolith:1.0.0"
  realizes OrderService
  realizes InventoryService
}
```

### Realizing shared infra (the `store` kind)

`realizes` can also point at a **shared infra node** (`database` / `queue` / `storage`), not just a
`service` / `domain`. This records the *physical form* of a logical data store — which managed service
or engine actually backs it — symmetrically to how an `oci` unit realizes a service. Use the dedicated
**`store`** kind for managed data stores; its free-text `type` names the concrete technology.

```
deploy "production" {
  store "order-db" {
    type     "Aurora PostgreSQL 15"
    realizes OrderDB        // realizes the logical `database OrderDB`
  }
  store "order-events" {
    type     "Amazon SQS"
    realizes OrderEvents    // realizes the logical `queue OrderEvents`
  }
}
```

The unit is drawn inside the realized infra node's container on the deploy diagram, the same way a
service-realizing unit is. `store` carries `type` and `realizes` but no `runtime` / `schedule` — a
managed store has no runtime form of its own. Recommended style: model managed stores with `store`;
other kinds (`oci`, …) *may* realize an infra node too, but `store` keeps the intent explicit.

When a service depends on a realized infra node (a usecase references it via `resource <Infra>.<Sub>`)
and both the service and the store are realized, the deploy diagram draws a dependency edge from the
service's container to the realized store's container ([ADR-20260616-12](../adr/20260616-12-deploy-infra-dependency-edges.md)).

> Scope: this stays within `deploy`'s **runtime-contract** layer (which concrete form backs the store).
> Infrastructure topology — regions, AZs, clusters, nodes — remains out of scope (see [concepts.md](../concepts.md)).
> Decided in [ADR-20260616-09](../adr/20260616-09-infra-physical-realize.md).

---

## Writing organization diagrams

An `organization` block declares the hierarchy of organizations, teams, and members.
It is rendered as a separate "Org view," independent of the logical and physical diagrams.

```
organization TechCorp {
  label "TechCorp Engineering"

  team "ec-team" {
    label "EC Team"
    description "Team responsible for developing and operating the EC site"

    owns ECommerce
    owns Order
    owns Catalog

    member alice {
      label "Alice Yamamoto"
      description "Tech lead of the EC team"
      slack "@alice"
      github "alice-yamamoto"
    }
    member bob {
      label "Bob Tanaka"
      slack "@bob"
      github "bob-tanaka"
    }
  }

  team "platform-team" {
    label "Platform Team"

    team "infra" {
      label "Infrastructure"
      owns Kubernetes
      member dave { label "Dave Suzuki" }
    }
    team "security" {
      label "Security"
    }
  }
}
```

### team node

- `owns <id>` declares a logical node (service / domain, etc.) that the team owns. The same `id` cannot be `owns`-ed by multiple teams; duplicates produce an error.
- Teams can be nested — placing child teams under a parent team expresses organizational hierarchy.
- Team IDs must be unique within the same organization. Duplicates produce an error.
- During parsing, an `ownerIndex` (`node id → team id`) is built so that a logical-diagram node can look up its owner team.

### member node

`member` is declared directly under a `team` to describe an individual.

| Property | Syntax | Description |
|----------|--------|-------------|
| `label` | `label "<display-name>"` | Display name on the diagram |
| `description` | `description "<text>"` | Description of the member |
| `slack` | `slack "<handle>"` | Slack handle |
| `github` | `github "<username>"` | GitHub username |

All properties are optional. `member` cannot be nested.

### How to specify a label

`organization`, `team`, and `member` all support both a positional argument (`team backend "Backend Team"`) and the property form (`team backend { label "Backend Team" }`).
When both are specified, the property form takes precedence.

---

## Diagram legend

A `legend` block declares color → meaning pairs that the renderer paints as a footer band below the diagram view. Use it to document what your colors, annotations, and tags signify so the rendered SVG is self-explanatory in reviews and exports.

### Top-level placement

`legend` blocks live at the top level of a `.krs` file — alongside `system`, `deploy`, and `organization`. Nesting inside any block (`system`, `service`, `domain`, `deploy`, `organization`, `team`, ...) is a parse error (`legend-not-top-level`); the parser reports it once and skips the whole nested legend block. Multiple `legend` blocks are allowed and stack vertically in declaration order on each view that contains them.

### Grammar

```
legend ::= "legend" view-scope? title? "{" entry* "}"

view-scope ::= "system" | "service" | "domain" | "deploy" | "org"
title      ::= <string-literal>
entry      ::= swatch-entry | ref-entry

swatch-entry ::= "swatch" "#" hex-digits <string-literal>
ref-entry    ::= "ref" ref-target <string-literal>

ref-target ::= "@" identifier      ; annotation
             | "[" identifier "]"  ; tag
             | "." identifier      ; class (forward-compat; always unresolved today)
             | "#" identifier      ; node id
             | identifier          ; node-kind type
```

### View scope

The scope vocabulary mixes view types (`system` / `deploy` / `org`) and logical drill-down depths (`service` / `domain`). Matching is **exact** — each rendered level shows only the legends declared for precisely that scope, with no cross-depth stacking (a `legend system` block does not follow you into a service drill-down, and a `legend service` block never appears at the top level).

| `<view-scope>` | Where the legend appears |
|-----------|--------------------------|
| omitted   | the top level of the system, deploy, and org views |
| `system`  | the top level of the system view only |
| `service` | drill-down views whose root is a `service` only |
| `domain`  | drill-down views whose root is a `domain` only |
| `deploy`  | deploy view only |
| `org`     | org view only |

Drill-down levels rooted at a node with no scope keyword of its own (for example a system frame or a usecase) render no legend. In the all-layers view, each stacked level band carries the legends for its own depth scope directly below the band. Legends on drill-down levels are opt-in: a file that only uses the pre-existing scopes (omitted / `system` / `deploy` / `org`) renders no legend below the top level.

### Example

```krs
system ECPlatform {
  service ECommerce { label "EC Site" }
  service Payment [external] { label "Payment" }
  service Legacy @deprecated { label "Legacy" }
}

deploy Production {
  oci "ec-api" { realizes ECommerce }
}

// Shown on every view.
legend "Owner team" {
  swatch #2563EB "Team Backend"
  swatch #16A34A "Team Frontend"
  swatch #DC2626 "Third-party"

  ref @deprecated "Deprecated"   // color from .krs.style
  ref [external]  "External"
  ref service     "Service"
  ref #ECommerce  "EC site"
}

// Deploy-only legend.
legend deploy "Hosting tier" {
  swatch #0EA5E9 "Cloud Run"
  swatch #F59E0B "On-prem"
}

// Shown only on drill-down views rooted at a domain.
legend domain "Data access" {
  swatch #3B82F6 "Read path"
  swatch #F97316 "Write path"
}
```

### Color resolution

- **`swatch`** uses the literal hex color verbatim (3, 4, 6, or 8 hex digits, with `#`).
- **`ref`** resolves through the `.krs.style` cascade. The renderer picks the highest-specificity matching rule and uses its `background-color`, falling back to `badge-color`.
- A `ref` whose target appears on at least one node in the file but has no painting style rule renders with a **neutral fallback swatch** so semantic-only annotations / tags (e.g. `[human]`, `[ai]`) still surface in the legend.
- A `ref` that matches no rule **and** no node is **dropped from the rendered footer** and surfaced in the warning panel as `legend-ref-unresolved`. Authors can then either remove the entry or add a matching style rule.
- `.class` selectors are accepted by the parser for forward compatibility but always resolve as unresolved today (`.krs.style` has no class concept — see [`style.md`](style.md)).

### Labels are not localized

Legend labels are author-supplied strings, treated the same way as `name` and `label` properties on regular nodes — the renderer embeds them verbatim into the SVG and the app's i18n layer does **not** translate them. See [`i18n.md`](i18n.md) for the exemption list.

### Sample file

`examples/en/feature-samples/legend.krs` exercises every primitive in one self-contained file (paste into the app to try).

### What's not in v1

The following are deferred (see [`docs/design/diagram-legend.md`](../design/diagram-legend.md) for rationale):

- Shape / icon / pattern legends (only color today).
- Interactive legends (click to filter, etc.).
- Node-targeted legends (`legend #OrderService "..."`) — depth scopes cover the common case; per-node targeting waits for observed demand (Issue #1513).
- Auto-generation from used annotations / tags.
- Rendering on diff views (`compileSystemDiff` / `compileDeployDiff`) and on org focused-team / icon-mode return paths.

> **Related TPLs**:
> - [TPL-20260510-21](../test-perspectives/TPL-20260510-21-scoped-glance-drill-down.md) — scoped glance: each drill-down level shows only its own vocabulary (exact-match legend switching applies this to legends)
> - [TPL-20260510-11](../test-perspectives/TPL-20260510-11-parallel-function-parity.md) — top-level / drill-down / all-layers render paths must carry the same legend options
> - [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md) — the view-scope vocabulary here must stay in sync with the built-in reference data

---

## Drill-down and external file references

Write with inline nesting first, then extract into separate files as things grow.

```
// Inline nesting (basic form)
system ECPlatform {
  label "EC Platform"
  service ECommerce {
    label "EC Site"
    domain Order { label "Orders" }
  }
}

// After extracting to an external file
import { ECommerce } from "ecommerce.krs"

system ECPlatform {
  label "EC Platform"
  service ECommerce
  service Payment [external] {
    label "Payment Service"
  }
  ECommerce -> Payment "Process payment"
}
```

### Path syntax — reaching nodes nested inside a `system` block

Use **dotted path** form to reach a `service` / `domain` / `usecase` defined deeper than the direct child of a `system` in another file:

```
import { ECPlatform.ECommerce.Order } from "./services.krs"
```

Each segment is matched against the previously-resolved node's `children` array by id (kind is not enforced). Path resolution starts from a top-level `system` in the imported file.

The importer only materializes the chain it asked for: in the example above, the merged file gains a stub of `ECPlatform` with a stub of `ECommerce` whose only child is the resolved `Order` (with `Order`'s full subtree intact). Sibling domains under `ECommerce` are not auto-imported. Bring more by listing them in the same import or by wildcard-importing the whole file.

#### When to use path syntax

Path syntax shines when the same id appears in multiple systems — system migration is the canonical case:

```
// services.krs
system OrderSystemV1 {
  service OrderService { domain Legacy {} }
}
system OrderSystemV2 {
  service OrderService { domain Modern {} }
}

// migration.krs — pull only V2 without renaming
import { OrderSystemV2.OrderService } from "./services.krs"
```

Bare ids (`import { ECommerce }`) keep working — they remain the simplest form when the id is unambiguous.

#### Failure mode

A path that cannot be resolved emits an `import-path-not-found` diagnostic naming the failing segment and the last node walked successfully:

```
import { ECPlatform.NotThere.Order } from "./services.krs"
// → Import path "ECPlatform.NotThere.Order" failed at segment "NotThere" (#1):
//   no child with that id under "ECPlatform"
```

---

## Multi-file import semantics

This section defines what each `import` form means when a model is split across multiple `.krs` files. Implementation: `packages/core/src/fs/import-resolver.ts`. Related ADRs: [ADR-20260405-03](../adr/20260405-03-wildcard-import-two-pass-resolution.md) (wildcard / two-pass), [ADR-20260409-05](../adr/20260409-05-directory-import.md) (directory), [ADR-20260409-06](../adr/20260409-06-named-import-toplevel-service.md) (named top-level), [ADR-20260513-03](../adr/20260513-03-import-system-nested.md) (named path syntax).

### S1. The four import forms

```krs
@import "theme.krs.style"             // (a) style import — see §"@import scope" below
import { Foo, Bar.Baz } from "p.krs"  // (b) named import — see §"Drill-down and external file references"
import "p.krs"                        // (c) whole-file import — defined in this section
import "dir/"                         // (d) directory import — defined in this section
```

(c) and (d) share the same merge rules. (d) is defined as: list all `.krs` files directly under `dir/` in alphabetical order, then process each as if it were a separate `import "..."` declaration at the same place. Sub-directories are not recursed.

### S2. Whole-file import merge rules

`import "p.krs"` brings the **fully-resolved KrsFile of `p.krs`** into the importer. "Fully-resolved" means after recursively resolving all of `p.krs`'s own imports. This resolved snapshot is computed **once per file path** and reused — the same `p.krs` reached through multiple paths yields the same content (see S5).

The importer absorbs:

- all top-level nodes (`system` / `service` / `client` / `database` / `queue` / `storage` / `legend` / `deploy` / `organization`)
- all children inside each `system` block (`user` / `client` / `service` / `domain` / `usecase` / `resource` / edges / infra)
- all stylesheets referenced via `@import` in `p.krs` (added to the cascade)

### S3. Same-id `system` blocks merge (system reopen)

When the same `system` id appears in more than one file (the importer's own file and an imported file, or two imported files), the blocks are **merged into one** rather than treated as duplicates:

- **System body properties** (`label` / `description` / tags): the declaration in the file **closer to the import-graph root** wins. The root is `ImportResolver.resolve(entryPath)`'s `entryPath` — in practice the file currently open in the App / VS Code extension, or the file passed to `karasu render`. The resolver walks the graph bottom-up; values from deeper imports fill in only where the closer file left them unset.
  - When two files declare conflicting non-empty values, the resolver picks the closer-to-root one and emits a `system-property-conflict` warning (chosen value + ignored value + both source locations).
- **Children**: merged by id with find-or-create. Two children with the same id in the same merged system produce a `duplicate-node-in-system` error (existing behavior). Two different ids merge cleanly.
- **Edges**: union. Exact duplicates (same `from`, `to`, kind, label) are deduplicated; otherwise both are kept.

This is the canonical way to split a large `system` into several files. The App / CLI's notion of "the current file" naturally becomes the source of truth for top-level system metadata.

### S4. Same-id `deploy` / `organization` blocks merge

Same rules as S3, applied to `deploy.nodes` (oci / k8s / vm / …) and `organization.teams` (and members). `realizes` / `owns` relations are unioned. `import "p.krs"` therefore brings `deploy` and `organization` content alongside `system` content — there is no separate import form for the physical / org views.

### S5. DAG re-arrival vs. true cycles

The import graph is allowed to be a **DAG**. The same file may be reached through two different import chains (entry → A → C and entry → B → C) without warning. The resolver memoizes the resolved snapshot per file path so the second arrival reuses the first arrival's result.

A `circular-import` warning is emitted only on a **true cycle** — a file is already on the *currently-being-loaded* stack when it is requested again. Detection uses a `loading` set (path stack, push on enter / pop on exit) distinct from a `loaded` memo. The latter does not warn.

```
// DAG — no warning
index.krs:  import "admin.krs"
            import "auth.krs"
admin.krs:  import { Service } from "auth.krs"  // reaches auth.krs via admin
auth.krs:   // (no imports)

// True cycle — warning at the second arrival on a.krs
a.krs:      import "b.krs"
b.krs:      import "a.krs"   // ← circular-import warning
```

### S6. Dangling edge endpoints preserve their nodes

When an edge `A -> B` cannot resolve one of its endpoints (because the target id is not present in the merged model), the resolver:

- drops the edge and emits an `unresolved-edge-endpoint` warning naming the unresolved id and the edge's source location;
- **keeps the node on the resolved side**. A node declared in some file is part of the model regardless of whether its outbound / inbound edges resolve.

The same rule applies to `realizes` / `owns` / `handles` cross-references: the source node stays, the unresolved relation is reported.

### S4.5. Same-id infra reopen (`database` / `queue` / `storage`)

The same rules as S3 apply when the same `database`, `queue`, or `storage` id is declared in more than one file (or in more than one `system` block within one file's import graph):

- **Body properties** (`label`, `description`, tags): root-entry-wins silently. Unlike S3 (which warns on conflicting non-empty `label`/`description`), infra body conflicts emit no diagnostic — the intentional asymmetry: shared infra is more often refactored across files than `system`, and a property warning would be noise during a migration.
- **Children** (`table` declarations and other leaves): merged by id with find-or-create. DAG re-arrival (same node instance reached via two import paths) dedups silently. Two **different** declarations with the same `(id, kind)` — e.g. `table users { ... cols A ... }` in one file and `table users { ... cols B ... }` in another — keep the first one and drop the second; an `infra-leaf-redeclared-silently` **info** diagnostic surfaces the dropped declaration so the loss is visible without blocking the build.
- **Diagnostic**: an `infra-redeclared-across-files` **info** diagnostic surfaces the fact that the infra was declared in multiple places — listing the id and kind — without prescribing how to fix it.

The info register (distinct from `warning`) is intentional: karasu visualizes shared infrastructure (one `database` written to by multiple services across files) but does not refuse to model it. The wording is fact-first; whether the sharing is a smell depends on the project's style and is left to its documentation. See the canonical pattern below.

#### Canonical pattern — dedicated infra file

The recommended way to share `database` / `queue` / `storage` declarations across slices is to put them in a dedicated infra file and `import "infra.krs"` from each slice that uses them. Because of S2's per-file memoization and S5's DAG handling, the infra file is resolved once and reused from every importer:

```krs
// infra.krs
system Blog {
  database ArticleDB { table articles }
}

// reader.krs
import "infra.krs"
system Blog {
  service ArticleDelivery {
    domain Delivery {
      usecase ReadArticle { resource ArticleDB.articles }
    }
  }
}

// editor.krs
import "infra.krs"
system Blog {
  service Authoring {
    domain Publish {
      usecase Publish { resource ArticleDB.articles }
    }
  }
}
```

No `infra-redeclared-across-files` diagnostic fires for this pattern — each infra id is declared exactly once in `infra.krs`; the other slices only reference it via `resource` paths. The diagnostic surfaces only when the **same `database UserDB { ... }`** declaration appears literally in two files, which is the fallback the resolver accepts but does not encourage.

### S7. Deterministic order

`mergedFile` order is determined by:

1. import declarations are processed in source order within each file;
2. directory imports expand to file names in alphabetical order;
3. nodes are inserted into merged collections on first encounter (later merges only mutate existing entries via find-or-create).

The same project always produces the same merged AST.

> **Related TPLs**:
> - [TPL-20260514-01](../test-perspectives/TPL-20260514-01-import-dag-not-cycle.md) — DAG re-arrival is not a cycle (S5)
> - [TPL-20260514-02](../test-perspectives/TPL-20260514-02-whole-file-import-completeness.md) — whole-file import preserves all top-level and nested nodes (S2)
> - [TPL-20260514-03](../test-perspectives/TPL-20260514-03-system-reopen-merge.md) — reopened `system` merges children, root entry wins for properties (S3)
> - [TPL-20260514-04](../test-perspectives/TPL-20260514-04-deploy-org-wildcard-propagation.md) — `deploy` / `organization` propagate through whole-file import (S4)
> - [TPL-20260514-05](../test-perspectives/TPL-20260514-05-dangling-edge-preserves-node.md) — unresolved edge endpoint does not drop the surviving node (S6)
> - [TPL-20260514-07](../test-perspectives/TPL-20260514-07-infra-redeclared-across-files.md) — same-id `database` / `queue` / `storage` reopens union-merge with an info diagnostic (S4.5)

---

## @import scope

- Applies to the entire file (global scope).
- Must be written at the top of the file.
- When the same selector is defined in multiple files, the last one wins (a warning is emitted).

---

## Property requirement and omission rules

All properties are optional. When omitted, a warning is emitted rather than an error.
This policy exists to tolerate a "not yet decided" state while iterating on the design.

| Property | Behavior when omitted |
|----------|----------------------|
| `runtime` | `⚠ runtime is not specified` warning |
| `realizes` | `⚠ realizes is not specified` warning (directly tied to the raison d'être of the physical diagram) |
| `schedule` | Treated as one-shot execution (no warning) |
| `image` (oci only) | Optional. Displayed on the diagram when specified |
| `type` (artifact only) | Optional. Displayed on the diagram when specified |

---

## Domain dispersal

If the same `domain id` appears in multiple `service` blocks within the same `system`, the tool emits an **informational** `domain-dispersal` diagnostic (info register, not an error). The diagram still renders.

```
ℹ domain "Order" appears under multiple services
  - ECommerce
  - Legacy
  DDD sometimes calls cross-service domain reuse a cohesion smell
```

This follows karasu's "visualize, don't prescribe" stance (see `docs/concepts.md` — "What karasu visualizes vs. what it doesn't prescribe"): a domain shared across services is a structural fact karasu draws truthfully and surfaces, leaving the cohesion judgment to the reader. Compilation is never refused on this ground.

Domain edges (`Billing -> Contract`) are resolved by domain ID. When the same ID is dispersed, navigation (the `nodePathIndex`) keeps the **first occurrence**; the higher-priority entry wins when one side carries a migration annotation (see "Deprecated domain migration").

**Detection scope**: per `system` block.
The same `domain` name across different `system` blocks is treated as intentionally independent parallel modeling and produces no diagnostic.

**Detection key**: the `id` of the `domain`. The `label` (display name) is not used for detection.

> Related TPLs: TPL-20260514-08 — `Diagnostic register reflects "fact vs. style"`
