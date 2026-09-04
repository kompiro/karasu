# Tags and Annotations Reference

> **English** (this file) · [日本語](tags-annotations.ja.md)

## Tags (`[...]`)

Tags declare **architectural meaning**. Styles change in response to tags.
A tag is a semantic declaration, not a direct appearance override. Visual control is handled in `.krs.style`.

**Names lex as kebab-case identifiers.** `[my-team-internal-tag]` is one tag named `my-team-internal-tag`, and the same rule holds at every position that accepts open vocabulary: annotation names (`@my-mark`), `capability` names, and legend `ref` targets. A fragment may be spelled like a keyword (`[legacy-system]` is one tag). `.krs.style` folds hyphens into identifiers natively, so the tag written in `.krs` and the selector written in `.krs.style` land on the same name. (#2509)

> Related TPLs: [TPL-2509](../test-perspectives/TPL-2509-kebab-name-positions-share-one-lexical-rule.md) — every kebab-case name position shares one lexical helper; a new name position must be verified against hyphenated names on both the `.krs` and `.krs.style` sides.

<!-- gen:reference:tags — DO NOT EDIT. Generated from packages/core/src/builtins/reference-data.ts; run `pnpm gen:reference`. -->
| Tag | Meaning | Effect on default rendering |
|-----|---------|-----------------------------|
| `[external]` | Outside the system boundary | Dashed border, gray-toned color |
| `[index]` | A derived index for fast search over the system of record — a role, not the SoR itself (omit on a vector DB / ElasticSearch that is itself the SoR) | Adds an `index` badge to the database node |
| `[cache]` | Not the system of record — a store whose loss is recoverable by rebuilding it (recompute, refetch, re-login); a TTL is typical | Adds a `cache` badge to the database / storage node |
| `[analytics]` | A derived store ingested from the system of record for analysis and aggregation (DWH / data lake) | Adds an `analytics` badge to the database / storage node |
| `[async]` | Asynchronous communication (for edges) | Dashed arrow |
| `[sync]` | Synchronous communication (for edges, default) | Solid arrow (default) |
| `[human]` | A human user | Used only on user nodes. No effect on default style |
| `[ai]` | An AI agent | Used only on user nodes. No effect on default style |
| `[mobile]` | Mobile native app (client) | Recognized form-factor tag for `client` nodes |
| `[web]` | Browser SPA (client) | Recognized form-factor tag for `client` nodes |
| `[desktop]` | Desktop app (client) | Recognized form-factor tag for `client` nodes |
| `[cli]` | Command-line tool / SDK (client) | Recognized form-factor tag for `client` nodes |
| `[device]` | IoT / dedicated terminal / KIOSK (client) | Recognized form-factor tag for `client` nodes |
| `[extension]` | Host-app plugin — Chrome / VS Code / Figma, etc. (client) | Recognized form-factor tag for `client` nodes |
| `[embed]` | Widget / SDK embedded in third-party sites (client) | Recognized form-factor tag for `client` nodes |
| `[table]` | Table-like resource (shape: cylinder) | Rendered as a cylinder shape |
| `[queue]` | Queue-like resource (shape: queue) | Rendered as a queue shape |
| `[api]` | API-like resource (shape: hexagon) | Rendered as a hexagon shape |
| `[storage]` | Storage-like resource (shape: cloud) | Rendered as a cloud shape |
<!-- /gen:reference:tags -->

> The seven `client` form-factor tags are **recognized** by karasu — Icon Mode renders each with a kind-specific icon (Phase 2 of #823); layout hints (Phase 6) are a future addition. Tags outside the builtin table are accepted in v1.x but **deprecated** — see *Non-builtin tag names are deprecated* below.

> **Shape tags mirror the infra-block keywords — they are related, not interchangeable.** An infra-block **keyword** (`table` inside a `database`, `queue-item` inside a `queue`, `bucket` inside a `storage`) declares the actual **shared-store node** on the system view. A usecase's `resource` is the **operational reference** to what that usecase reads or writes; when a `resource` points at an infra leaf via dot-notation — `resource OrderDB.OrderTable` — karasu **infers the matching shape tag from the referenced infra sub-resource kind** (`table` → `[table]`/cylinder, `queue-item` → `[queue]`, `bucket` → `[storage]`), so the reference is drawn in the same shape as the store it points to. The shape tags `[table]` / `[queue]` / `[storage]` therefore deliberately **mirror** the infra sub-resource kinds; you can also write them by hand on any `resource` as a pure shape hint when there is no infra leaf to reference. `[api]` (hexagon) has no infra counterpart — it is a manual-only shape for API-like resources. The same word in two positions never *collides*: the keyword **starts a declaration** and sets a node's *kind*; the `[...]` tag is a **suffix** on a `resource` and sets only its *shape* — they are complementary layers linked by the resource reference. See the *Infra layer* section of [syntax.md](./syntax.md).
>
> Related TPLs: [TPL-1415](../test-perspectives/TPL-1415-shared-vocabulary-dual-representation.md) — the infra-sub-kind → shape-tag inference (`INFRA_SUB_KIND_TO_TAG`) and the shape-tag table are two representations of one vocabulary that must stay in sync.

> **`database [index]`** marks a `database` node as a **derived search / secondary index** — an ElasticSearch / OpenSearch cluster, or a vector store such as pgvector / Pinecone / Weaviate — rather than the system of record. It keeps the database cylinder and adds an `index` badge. The **concrete technology stays in the physical layer** via `store { type "ElasticSearch 8"; realizes SearchIndex }`, so the logical model does not churn when the engine is swapped. The same store can be *both* the system of record and its own index (e.g. Postgres + pgvector) — there the `[index]` tag is simply omitted. **`[index]` denotes a role, not a technology**: tag a secondary store that is derived as an index to search the system of record quickly. Even when it is a vector DB / ElasticSearch, do **not** add `[index]` if that store is itself the system of record. Background: [ADR-316](../adr/316-database-as-first-class-node.md), Issue #1718.
>
> Related TPLs: [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md) — `[index]` is an accepted tag that must carry an effect (the `index` badge), not merely a label.

### Store role tags — one axis, four states

`[index]`, `[cache]` and `[analytics]` form a single axis: **which way this store is not the system of record.** No tag means it *is* the system of record, so four states say everything about a store's role.

| Tag | What kind of non-SoR store | Applies to |
|-----|----------------------------|------------|
| *(no tag)* | The system of record | any store |
| `[index]` | Derived for search | `database` |
| `[cache]` | Recoverable by rebuilding — recompute, refetch, re-login | `database` / `storage` |
| `[analytics]` | Ingested from the SoR for analysis | `database` / `storage` |

**The test for `[cache]` is one question: if this store vanished, is business data lost?** If it is, the store is a system of record — do not tag it. A session store, a Redis cache and a Cloudflare KV namespace all pass; so does a CDN origin cache, a bucket of generated thumbnails or rendered artifacts, or a scratch area for exports (which is why `[cache]` applies to `storage` too). Note that the test is **volatility, not derivation**: a session store is the record of that session rather than a copy of something else, and a rule limited to derived copies would miss the most common case. `[index]` — derived *and* for search — sits inside that definition without contradiction.

`[analytics]` marks the warehouse / data-lake side: a store ingested from the system of record for analysis and aggregation. It applies to `storage` because a data lake is typically object storage (Parquet on S3 / GCS). Where a warehouse also holds data ingested from *other* systems, it is still not this system's SoR, so the tag still applies. The tag is named for the role, not for the product category — `[warehouse]` would name the thing (Snowflake, BigQuery), where `[analytics]` names what the derivation is *for*, matching `[index]`.

**All three stay out of the shared-store diagnostics.** `shared-infra-fan-in` and `cross-domain-store-access` describe a shared *system of record*; several services reading one search index, one cache or one warehouse is a normal shape, not the Database-per-Service smell.

**Where this axis stops.** Role tags express **the SoR difference within one kind, and nothing else.** A difference of technology (graph, time-series, column-oriented) belongs to the physical layer's `store { type "…" }`; a difference of operational placement (read replica, shard) belongs to the physical layer or is not modeled at all. That is why `[kv]`, `[graph]`, `[timeseries]` and `[replica]` are **not** builtin tags and warn as `tag-not-builtin`: judging a new role tag reduces to the same single question as `[cache]` does — is this about being the system of record?

> Related TPLs: [TPL-2172](../test-perspectives/TPL-2172-builtin-vocabulary-addition-gate.md) — the stopping rule above is the third of the three questions a builtin-addition request must pass, and the rejections it produced are recorded rather than re-argued. [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md) — every kind listed in a tag's `appliesTo` carries the badge, so a tag is never accepted-and-inert on one of its own kinds.

### Non-builtin tag names are deprecated (v1.x)

Bare `[<identifier>]` still accepts any name in v1.x — the v1.0 freeze ([ADR-1314](../adr/1314-krs-spec-v1-freeze.md)) keeps parse behaviour unchanged — but a tag outside the **tool vocabulary** (the builtin table above plus the [system-assigned tags](#system-assigned-tags) below) is **deprecated**: karasu emits a `tag-not-builtin` **warning** on every use. There is deliberately **no suppression condition** — a `.krs.style` selector or a `legend` ref proves the name is intentional, but intent does not change the outcome: syntax v2.0 accepts tool vocabulary only (still enforced as a warning, never a parse error — existing files keep parsing). Migration targets:

- **Membership or model-specific labeling** (PCI scope, PII, "requires auth") → the [`facet` construct](./syntax.md#cross-cutting-membership-facet--experimental): declare the set once at the top level and write `facets <id>` on the elements.
- **A missing archetype** → request a builtin tag addition. A deprecated tag keeps working meanwhile — warned, without default-rendering effect. [#2172](https://github.com/kompiro/karasu/issues/2172) is the worked example of this route: `[cache]` and `[analytics]` were adopted, `[kv]` (a technology, not a role) and `[bff]` (already expressed structurally by `delivers <ClientId>`) were rejected with their reasons recorded.

A `.krs.style` rule that **targets** such a name (`[pci] { … }`) is deprecated on the same terms (`style-tag-selector-not-builtin`) and rewrites to a [facet selector](./style.md#facet-selectors-facetsid--experimental). Both halves warn: the tag on the node and the selector in the sheet are two edits, and reporting only one leaves the other unfound.

See [*Vocabulary registers*](#vocabulary-registers--boundary--annotation--tag--facet) below for how to pick the right construct.

> Related TPLs: [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md) — non-builtin tag names previously sat in the forbidden fourth state (accepted, inert, undocumented); `tag-not-builtin` resolves them into state (2), *warned as unknown*. [TPL-2172](../test-perspectives/TPL-2172-builtin-vocabulary-addition-gate.md) — a builtin-addition request arriving through this route is judged by three questions (register / already expressible / stopping rule), and rejections are recorded.

### Example

```krs
system Shop {
  service Payment [external] {
    label "Payment Service"
  }
  service ECommerce {}
  service Inventory {}
  user Customer [human] {
    label "Customer"
  }
  user AIAgent [ai] {
    label "Order Automation Agent"
  }

  ECommerce --> Inventory "Sync inventory" [async]
}
```

---

## Annotations (`@...`)

Annotations are metadata expressing **lifecycle and state**. They are a separate concept from tags.

<!-- gen:reference:annotations — DO NOT EDIT. Generated from packages/core/src/builtins/reference-data.ts; run `pnpm gen:reference`. -->
| Annotation | Meaning | Default rendering |
|------------|---------|-------------------|
| `@deprecated` | Slated for removal | ⚠ badge, node rendered semi-transparent |
| `@new` | Newly added | ✦ badge |
| `@experimental` | Experimental | ⚗ badge |
| `@migration_target` | Migration target | → badge |
| `@planned` | Placed by design, but does not exist yet | ◇ badge |
| `@draft` | Asserted but not confirmed by a human | ✎ badge |
<!-- /gen:reference:annotations -->

### Example

Multiple annotations can be applied. Tags and annotations can be combined.

```krs
service Legacy [external] @deprecated @migration_target {
  label "Legacy System"
}
service NewAPI @new @experimental {
  label "New API"
}
```

#### Domain coexistence during migration

When `@deprecated` or `@migration_target` is applied to a `domain`, duplicate `domain` IDs within the same system are tolerated (modeling a migration period).
The domain carrying `@migration_target` becomes the preferred navigation target.

```krs
system OrderSystem {
  service LegacyService {
    domain Contract @deprecated {   // migration source — scheduled for removal
      -> Billing
    }
  }
  service NewService {
    domain Contract @migration_target {  // migration target — preferred navigation
      -> Billing
    }
  }
}
```

> Duplication is tolerated as long as at least one side carries `@deprecated` alone, or `@migration_target` alone.
> If neither annotation is present, the duplicate remains an error.

### Non-builtin annotation names are deprecated (v1.x)

`@<identifier>` still accepts any identifier in v1.x — the open annotation set itself is frozen by [ADR-1314](../adr/1314-krs-spec-v1-freeze.md) — but a name outside the builtin table above is **deprecated**: karasu emits an `annotation-not-builtin` **warning** on every use, with **no suppression condition** (a stylesheet selector proves intent, but intent does not change the outcome: syntax v2.0 accepts tool vocabulary only, still enforced as a warning, never a parse error). Non-builtin annotations have no default rendering; in v1.x they remain syntactically valid targets for annotation selectors in `.krs.style`, and **that use is now deprecated too** (`style-annotation-selector-not-builtin`) — the styling hook has moved to [facet selectors](./style.md#facet-selectors-facetsid--experimental), which is where the before/after rewrite is written out. Migration targets:

- **Membership or model-specific labeling** (team ownership marks, audience labels) → the [`facet` construct](./syntax.md#cross-cutting-membership-facet--experimental).
- **A missing lifecycle state** → request a builtin annotation addition. [#2172](https://github.com/kompiro/karasu/issues/2172) is the worked example: `@planned` was adopted, while `@canary` (a runtime rollout state that lives for hours, not the slowly-changing structure karasu models — and overlapping `@experimental`) and `@sunset` (`@deprecated` already says it) were rejected. A long-lived canary is `@new @experimental`; a coexisting old and new is `@migration_target`.

The near-miss **typo hint** (`annotation-possible-typo`, info) also still fires: a typo in a builtin name (e.g. `@depracated`) would otherwise surface only as "my badge did not appear". The hint stays suppressed for names that appear in a stylesheet annotation selector. Both diagnostics coexist during v1.x — a near-miss can carry both — and are consolidated in v2.0.

```krs
service Billing @team_alpha   // deprecated: annotation-not-builtin warning
service Legacy  @depracated   // warned twice: typo hint (info) + not-builtin (warning)
```

> Related TPLs: [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md) — the deprecation keeps non-builtin names in state (2), *warned as unknown*, instead of the former undocumented open-set acceptance. [TPL-2172](../test-perspectives/TPL-2172-builtin-vocabulary-addition-gate.md) — the same three-question gate applies to a requested builtin *annotation*, where the lifecycle register is the first filter.

### Annotation parameters

A built-in lifecycle annotation can carry **parameters** that record migration intent, with `@name(key: "value"[, key: "value"]*)`:

```krs
service Legacy @deprecated(until: "2026-Q3")
service NewSvc @migration_target(from: LegacyMonolith)
```

Recognized keys (built-ins only):

| Annotation | Key | Meaning |
|------------|-----|---------|
| `@deprecated` / `@experimental` | `until` | When the node is expected to be removed / stabilized |
| `@migration_target` | `from` | The node this one is migrating away from |
| `@draft` | `confidence` | How sure the author is of this statement — `low` / `medium` / `high` |

- **Graceful degradation by precision**: a `until` value that parses as a date (`YYYY-MM-DD`), year-month (`YYYY-MM`), or quarter (`YYYY-Qn`) is machine-usable (sortable / filterable); any other string (e.g. `"sometime next year"`) is kept verbatim as an opaque, display-only value. No validation error is raised for opaque values.
- **No runtime evaluation**: `until` is recorded **intent**, not a deadline — karasu never compares it to the current date (no "overdue" diagnostic). Consistent with `job.schedule` (stored, not simulated) and the warn-don't-error stance.
- **Unsupported parameters warn, not silently ignored**: a parameter on any other annotation, or with an unrecognized key, is dropped with an `annotation-param-unsupported` warning (TPL-1503 — accepted vocabulary must have an effect or be warned). Custom annotations are param-less for now.
- The annotation **name list** is unchanged by parameters, so `.krs.style` annotation selectors (`@deprecated`) and annotation inheritance are unaffected.
- **One canonical spelling per value kind**: quoting is not recorded, so `karasu fmt` picks the form the value kind calls for. `until` / `confidence` are opaque display values and print quoted; `from` is a node reference and prints like any other reference, bare when the id allows it (`from: "legacy"` reformats to `from: legacy`, the same normalization `service "A"` gets).

> Related TPLs: [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md) — an `@name(key: …)` with an unrecognized key/annotation is warned, never silently accepted. [TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md) — `fmt` must round-trip a parameter rather than drop it (#2571 dropped every one) and must not print a value the author never wrote.

### `@draft` — asserted, not confirmed

`@draft` marks a statement **the model makes but nobody has confirmed**. It is the honesty layer for models that were not written by hand: karasu-nest reverses a repository into `.krs` with an LLM ([ADR-1990](../adr/1990-karasu-nest-pivot-server-reverse.md) decision 4), and a generated model that cannot say which parts it guessed at invites the reader to trust all of it equally.

```krs
system Payments {
  service Ledger {
    label "Ledger"
    domain Posting
  }
  service Reconciliation @draft(confidence: "low") {
    label "Reconciliation"
    // The seam between posting and reconciliation was a judgement call.
    domain Settlement @draft
  }
}
```

- **The mark is the unit, the level is a refinement.** A bare `@draft` is complete. `confidence` is optional and takes `low` / `medium` / `high`; any other string is kept verbatim as an opaque, display-only value, exactly like `until`. A reviewer writing `confidence: "we argued about this one"` is recording something real, and rejecting it would push that note into a comment where nothing can read it.
- **Per node, not per document.** The spike behind decision 4 found that a generated decomposition errs by splitting at genuine judgement-call seams rather than by scrambling, so the useful signal is *which seam* was uncertain. A document-level score would average that away.
- **No gate.** karasu never refuses to render, warns about, or downranks a low-confidence node. The level is recorded judgement, consistent with `until` being intent rather than a deadline.
- **Removing the mark is the point.** `@draft` is what a human review deletes. That deletion is the human ratchet ADR-1990 decision 4 rests on ([#2228](https://github.com/kompiro/karasu/issues/2228)), so the annotation is designed to be cheap to remove: one token, no restructuring.

- **An absent mark means nothing was claimed, not that something was checked.** karasu does not track review state, so a node without `@draft` is simply a node nobody marked. In a hand-written model that is the normal case; in a generated one, treat the generator's marking as the only signal about itself. A generated model that carries no `@draft` anywhere is making a strong claim, and is worth doubting.

`@draft` is a lifecycle annotation, not a tag or a facet: it describes the state of a statement in a review process, the same register as `@new` and `@experimental`, and it is tool-owned rather than a user-declared set.

> Related TPLs: [TPL-1995](../test-perspectives/TPL-1995-generated-content-is-marked-at-its-seams.md) — generated content states its own uncertainty where the uncertainty is, and the mark is removable by the human who resolves it. [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md) — `@draft` has a default badge in the same PR that accepts the name. [TPL-2172](../test-perspectives/TPL-2172-builtin-vocabulary-addition-gate.md) — the three-question gate for adding a builtin annotation.

### `@planned` — designed, not yet built

`@planned` marks an element that the design places but that **does not exist yet**. The other lifecycle states all presuppose existence: `@new` is a real addition, `@experimental` is real but unstable, `@deprecated` is real and on the way out. Nothing said "not there".

```krs
system Payments {
  service Ledger {
    label "Ledger"
    domain Posting
  }
  service Reconciliation @planned {
    // Agreed in the design review; no code yet.
    label "Reconciliation"
    domain Settlement
  }
}
```

- **The moment a diagram is drawn is usually the moment of a decision**, and what a decision draws is the target state. An architecture note that cannot say "this part is the plan" either omits the plan — losing the reason the diagram was drawn — or draws it as if it shipped.
- **`@planned` is about existence; `@draft` is about confidence.** `@planned` says the element is not built yet (the author is certain about what it is); `@draft` says nobody has confirmed the statement (the author is uncertain that it is right). They compose: a `@planned @draft` service is a proposal an LLM inferred and nobody has reviewed.
- **No gate.** As with every other lifecycle annotation, karasu records the mark and never refuses to render, downranks it, or exempts it from a diagnostic. A `@planned` service no deploy unit realizes still reports `unassigned-service` — that is a true statement about the model as written, and silencing it would make the annotation a way to hide gaps.
- **Removing the mark is shipping it.** Like `@draft`, the annotation is one token to delete.

> Related TPLs: [TPL-2172](../test-perspectives/TPL-2172-builtin-vocabulary-addition-gate.md) — `@planned` passed the three-question gate (lifecycle register / no existing way to say "not yet" / no state-enumeration creep) and ships with a badge in the same PR. [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md) — the `◇ Planned` badge is that effect.

---

## Client capabilities

`capability <name>` declares a **device or browser capability** the client requests permission to use. See [`docs/spec/syntax.md`](./syntax.md#client-capability) for the syntax.

The identifier set is **open** — any kebab-case identifier is accepted, no warnings are emitted for names outside the recommended set, and authors can express domain-specific capabilities (industry devices, internal-only features) freely. The recommended set below covers the cases the validator and editor tooling expect to see most often.

### Recommended capability identifiers

| Group | Identifiers |
|-------|-------------|
| Web / browser | `camera`, `microphone`, `geolocation`, `notification`, `push`, `clipboard`, `webauthn`, `bluetooth`, `usb`, `midi`, `screen-wake-lock`, `accelerometer`, `gyroscope`, `storage-access` |
| Mobile (additional) | `contacts`, `calendar`, `photo-library`, `face-id`, `touch-id`, `background-processing`, `local-network`, `bluetooth-le-peripheral` |
| Desktop (additional) | `file-system-access`, `global-shortcuts`, `auto-launch`, `screen-recording` |
| IoT / device (additional) | `gpio`, `serial`, `zigbee`, `lora`, `nfc`, `rfid` |

### Naming conventions

- Use **kebab-case** (`screen-wake-lock`, `face-id`).
- Prefer the Web Permissions API / W3C name when one exists (`geolocation`, `notification`).
- Avoid OS-specific identifiers (`android.permission.CAMERA`); use the abstract feature name.
- For names outside the recommended set, attach a `description` so other readers understand what the capability covers.

### What `capability` is NOT

| Concept | Where it lives |
|---------|----------------|
| Operation-tied storage (`localStorage`, `indexedDB`, `keychain`) | `resource <storageKind> "<name>"` |
| HTTP session / authentication credentials | Separate vocabulary, tracked under #834 |
| Runtime authorization (RBAC permission bundles, license / feature flag gates) | Not modelled in karasu — see [ADR-832](../adr/832-no-runtime-authz-modeling.md). The `user.role` property is an actor-archetype label, not an authz primitive — see [ADR-1281](../adr/1281-user-role-keyword-clarification.md) |

---

## Vocabulary registers — boundary / annotation / tag / facet

karasu separates "what kind of label is this?" into four registers. The tag and annotation vocabularies are **tool-owned**; the sole user extension point is the [`facet` construct](./syntax.md#cross-cutting-membership-facet--experimental) (experimental).

| Register | Construct | Vocabulary | Question it answers |
| --- | --- | --- | --- |
| Archetype | tag `[...]` | tool-owned (builtin table above) | What *is* this element, architecturally? (`[external]`, `[index]`) |
| Lifecycle | annotation `@...` | tool-owned (builtin table above) | What development state is it in? (`@deprecated`, `@new`) |
| View grouping | `boundary` | user-declared ids | How should peers be grouped in this view? (see [syntax.md](./syntax.md)) |
| Set membership | [`facet`](./syntax.md#cross-cutting-membership-facet--experimental) (experimental) | user-declared ids | Which externally defined set does it belong to? (PCI scope, PII, "requires auth") |

Worked decomposition — modeling PCI compliance and authentication without misusing tags:

| Concern component | Register | Where it goes |
| --- | --- | --- |
| The element's architectural role (a search index, an external store) | tag | builtin tags — `[index]`, `[external]` |
| "This table holds cardholder data" / "this entity is PII" (regulatory membership) | facet | `facets pci` / `facets pii`, against a top-level `facet` declaration |
| "This usecase requires authentication" (policy scope) | facet | `facets requires_auth`, with the policy itself in the declaration's `description` / `link` |
| Who may call it, under which plan / condition (rule content) | prose | `description` + `link` to the policy document — never modelled ([ADR-832](../adr/832-no-runtime-authz-modeling.md)) |

The registers matter because membership semantics differ from archetype semantics: an element is a `database` whether or not it is in PCI scope, and a diagram where 9 of 10 in-scope elements carry a membership tag silently reads as a false audit guarantee. Membership therefore gets its own construct with declared metadata (`label` / `description` / `link`) instead of borrowing the tag namespace.

> Related TPLs: [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md) — each register's accepted vocabulary must have an effect or be warned; the v1.x deprecation diagnostics (`tag-not-builtin` / `annotation-not-builtin`) keep the tool-owned registers in state (2).

---

## Difference between tags and annotations

| | Tag | Annotation |
|---|-----|-----------|
| What it expresses | Architectural position / role | Lifecycle / development state |
| Example | `[external]` (outside the boundary) | `@deprecated` (scheduled for removal) |
| Style impact | Controlled by tag selectors in `.krs.style` | Controlled by annotation selectors in `.krs.style` |

---

## System-assigned tags

The following tags are not written by users in `.krs` files; they are automatically assigned by the tool.
They can be referenced and overridden via tag selectors in `.krs.style`.

### Automatic tags on edges

| Tag | Assignment condition | Default style |
|-----|---------------------|---------------|
| `[implicit]` | An implicit service-level edge derived from domain edges | Amber (`#F59E0B`). Line style follows the `kind` of the source domain edge (`[async]` = dashed, `[sync]` = solid) |
| `[async]` | An edge declared with `-->` | Dashed |
| `[sync]` | An edge declared with `->` | Solid |
| `[cyclic]` | Detected as part of a cyclic dependency | Red (`#EF4444`) solid |
| `[write]` | A synthesized usecase→resource edge whose target resource declares any of `create` / `update` / `delete` in its `operations` | `stroke-width: 2`, label `"W"` |
| `[read]` | A synthesized usecase→resource edge classified as read-only (no write verbs, or `operations` omitted) | `stroke-width: 1.5`, label `"R"` |
| `[inferred]` | An entity relation `translate --from db` derived from a **Soft FK** (a `<stem>_id` / `<stem>_code` column with no declared `REFERENCES` / `FOREIGN KEY`). Relations from an explicit FK are left untagged (confirmed) | Muted grey (`#94A3B8` dark / `#64748B` light). **Colour only** — line style stays owned by `[sync]` / `[async]`, so an inferred async relation still reads as dashed |

> `[implicit]` uses color (amber) to signal "derived," while the line style distinguishes sync from async.
> When both sync and async domain edges exist between the same service pair, they are derived as separate implicit edges, one per kind.
>
> `[write]` / `[read]` are auto-injected on synthesized usecase→resource edges only. **Do not write them by hand on explicit edges** — the resolver will accept them syntactically, but the semantics (write-dominates classification of the target resource's `operations`) only make sense for the synthesized edges. The width hierarchy is intentionally `read (1.5) < write (2) < cyclic (2.5)` so that cyclic remains the most attention-grabbing axis.
>
> `[inferred]` is different in kind from the others in this table: `[implicit]` / `[read]` / `[write]` / `[cyclic]` are synthesized by the resolver at render time and **never appear in `.krs` source**, whereas `[inferred]` is stamped **into the emitted source** by `translate --from db` and then persists — it marks a relation the tool guessed from a naming convention rather than a declared FK. Curation is by hand: once you have confirmed the relation is real, delete the single `[inferred]` tag and it becomes a confirmed edge. Its colour is deliberately kept orthogonal to `[sync]` / `[async]` line style so that stamping it never hides the sync/async distinction ([TPL-510](../test-perspectives/TPL-510-derivation-tag-semantics.md)).

> Related TPLs: [TPL-1944](../test-perspectives/TPL-1944-inferred-tag-only-soft-fk.md) — `translate --from db` assigns `[inferred]` to a relation only when every contributing FK is a Soft FK; a single explicit FK leaves the relation untagged (confirmed), and the tag must render with an effect. [TPL-510](../test-perspectives/TPL-510-derivation-tag-semantics.md) — a derived auto-tag must stay orthogonal to the `kind` (`[sync]` / `[async]`) dimension it does not own.

### Customization example

```krs.style
edge[implicit] {
  color: purple;
  border-style: dotted;
}
```

---

## Team contact convention (`owns` + `link`)

To support organizational queries in the AI chat ("who is the owner team of this service?", "I want to contact the affected teams"), declare teams in an `organization` block, have them `owns` the services / domains, and add contact `link`s to the `team` block.

> The old `team "..."` string property on `service` / `domain` has been **removed** (per the deprecation plan of [ADR-14](../adr/14-organization-diagram.md)). The owner team is derived from `organization` / `owns`.

```krs
organization Corp {
  team fintech {
    label "Fintech Team"
    owns Payment
    link "https://slack.com/archives/C..." "Fintech Team Slack"
    link "https://notion.so/..."          "Team page"
  }
}

system Shop {
  service Payment { label "Payment" }
}
```

### Ownership (`owns`)

A `team` lists the services / domains it `owns`. The AI uses this ownership relation (the ownerIndex built at parse time) when answering organizational queries.

### Team annotations and primary owner during a handoff

A `team` block accepts annotations the same way services and domains do, written before the `{`:

```krs
organization Corp {
  team legacy @deprecated {
    owns Payment
  }
  team payments @migration_target(from: legacy) {
    owns Payment
  }
}
```

`@migration_target` and `@deprecated` render as a badge on the team in the organization view, mirroring the node badges in the system diagram.

A node can legitimately be `owns`-ed by more than one team during an inverse-Conway handoff. `ownerIndex` is 1:1, so a single **primary owner** is chosen by migration priority — `@migration_target` (the destination) wins, an unmarked team is next, and `@deprecated` (the source) loses. Ties keep the first declaration. This mirrors the domain migration-coexistence rule (see *Migration annotations* above, where the `@migration_target` domain wins the navigation target). Co-ownership itself stays a tolerated fact, surfaced through the `duplicate-owner-assignment` **info** diagnostic — it is never an error.

> Related TPLs: [TPL-1583](../test-perspectives/TPL-1583-migration-priority-index-winner.md) (the `@migration_target`-wins / first-wins rule must be consistent across every 1:1 index), [TPL-1386](../test-perspectives/TPL-1386-diagnostic-register-fact-vs-style.md) (co-ownership is a fact, kept in the info register).

### `link` property (team contact)

Add contact URLs to the `team` block in the form `link "<url>" "<label>"`.
When the label contains any of the following keywords, the AI recognizes the link as a team contact:

| Keyword examples | Purpose |
|-----------------|---------|
| `Slack` | Slack channel |
| `Teams` | Microsoft Teams channel |
| `Team page` | Team page on Notion, Confluence, etc. |
| `Runbook` | On-call / operations runbook |

### Usage example (AI chat queries)

When the model contains the information above, queries like the following become possible in the Chat tab:

```
Q: "Which teams depend on the Order service?"
A: - Fintech Team (Payment service)
     → https://slack.com/... (Fintech Team Slack)
   - Platform Team (Notification service)
     → https://slack.com/... (Platform Team Slack)

Q: "Who should I meet first during onboarding?"
A: ECommerce (most edges): EC Team
     → https://notion.so/... (Team page)
```
