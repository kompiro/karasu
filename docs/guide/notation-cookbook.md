# Notation cookbook — idioms for modeling with karasu

> **English**（this file） · [日本語](notation-cookbook.ja.md)

[`docs/spec/syntax.md`](../spec/syntax.md) is the **grammar** — every keyword and
rule. This cookbook is the missing companion: a compact **idiom catalog** that
answers "how do I express *X*" for patterns that are reachable from the grammar
but not obvious from it. Each entry is a worked snippet you can copy, adapt, and
learn from.

It is deliberately short so you can **feed it to an LLM alongside `syntax.md`**
when reverse-engineering a project (see
[Reverse-engineering with an LLM](reverse-engineering-with-ai.md)), and it doubles
as human onboarding. Like any generated model, treat the output as a *map, not a
spec* — verify against the code.

## How to use this

- **With an LLM**: paste this file after `syntax.md`. It shows the model *idioms*,
  not just grammar, so it picks the karasu-idiomatic shape instead of inventing one.
- **As a human**: skim for the pattern you need; each entry stands alone.

Every entry follows the same shape: **When** you reach for it, the **Pattern**
(the rule in one line), a minimal **`.krs`**, and **Why** it's modeled this way.

---

## 1. Key/value store (Redis, etcd) — a leaf-less `database`

**When** — you have a store with no meaningful table/collection structure to model:
a session cache, a KV/config store, a lock service.

**Pattern** — declare a `database` with **no leaves**, connect a service to it with
a **node-level edge** (`Service --> Store`), and name the concrete engine in the
**physical layer** with a `store` unit. Do *not* freeze a `@kv` annotation or a new
`kv` kind — a KV store is a `database` you simply don't decompose.

```krs
system Web {
  service ApiGateway {
    label "API Gateway"
  }

  database SessionStore {          // leaf-less: no `table` inside
    label "Session store"
  }

  ApiGateway --> SessionStore "Reads/writes session tokens"   // node-level edge
}

deploy "production" {
  store "session-kv" {
    type     "Redis 7"             // the concrete engine lives here
    realizes SessionStore
  }
}
```

**Why**

- **Reference at node granularity with an edge, not a `resource` dot-path.** A
  `resource <Db>.<Leaf>` reference needs a declared leaf; a KV store has no leaves
  to name, so writing `resource SessionStore` leaves it *unassigned* (a warning,
  rendered as an orphan). The idiomatic connection is a direct
  `Service --> SessionStore` edge — the same way the
  [`hato`](https://github.com/kompiro/karasu/tree/main/examples/en/hato) example
  wires its leaf-less `D1` / `R2` / `Tasks` stores.
- **Engine in the physical layer.** "Redis 7" is a *technology* choice. The logical
  layer stays technology-agnostic; the `store { type … }` unit records which engine
  realizes the logical store, so swapping Redis for etcd never disturbs the logical
  model.
- **No new vocabulary.** Annotations (`@…`) are *lifecycle* markers (deprecated,
  experimental), not kinds — `@kv` is rejected on purpose. A leaf-less `database`
  already expresses "a store with no interesting sub-structure".

## 2. Derived search index — the `[index]` tag

**When** — you have a search / vector index (ElasticSearch, OpenSearch, pgvector)
that is **derived** from a system of record, not the source of truth itself.

**Pattern** — tag the `database` with `[index]`; keep the concrete engine in the
physical layer.

```krs
database SearchIndex [index] {
  table documents
}

// physical layer
store "search" {
  type     "ElasticSearch 8"
  realizes SearchIndex
}
```

**Why** — `[index]` marks a **role** (a secondary index over the SoR), not a
technology, and adds an `index` badge. A vector DB or ElasticSearch that is *itself*
the system of record stays a plain `database` (no `[index]`); a single Postgres that
is both SoR and index also stays plain. This is the same "role via tag, technology in
the physical layer" discipline as idiom #1 — it avoids minting a `vector-store` /
`search` kind for every engine. See
[ADR-1718](https://github.com/kompiro/karasu/blob/main/docs/adr/1718-vector-store-vs-database.md).

## 3. Something outside the boundary — the `[external]` tag

**When** — a third-party API, a managed SaaS, or a store your system depends on but
does not own.

**Pattern** — suffix the node id with `[external]`. It applies to `service` and to
the infra kinds `database` / `queue` / `storage`.

```krs
service PaymentGateway [external] {
  label "Payment gateway"
}

database AnalyticsDB [external] {  // a managed third-party store
  label "Vendor analytics DB"
}
```

**Why** — `[external]` draws the node with a dashed, gray-toned border so a reader
instantly sees the system boundary. External stores are also excluded from the
`shared-infra-fan-in` diagnostic (idiom #4) — sharing a vendor API across services
is expected, not a design smell.

## 4. Shared infrastructure (fan-in)

**When** — several services read/write the **same** datastore.

**Pattern** — declare the store once; each service's `usecase` references the shared
leaf with a `resource <Db>.<Leaf>` dot-path. The resolver aggregates these into
`service → database` edges automatically.

```krs
database ArticleDB {
  table articles
}

service ArticleDelivery {
  domain Delivery {
    usecase "Fetch an article" {
      resource ArticleDB.articles
    }
  }
}

service Authoring {
  domain Publishing {
    usecase "Publish an article" {
      resource ArticleDB.articles
    }
  }
}
```

**Why** — two services fanning into one `ArticleDB` raises the **`shared-infra-fan-in`**
info diagnostic (never an error — karasu surfaces the coupling without prescribing
against it). Note this uses the `resource` dot-path because the store *has* a
modeled leaf (`articles`); contrast idiom #1, where a leaf-less store uses a
node-level edge instead. See [diagnostics](../spec/diagnostics.md).

## 5. Cross-domain and cross-system references

**When** — one domain depends on something owned by **another** domain, service, or
system.

**Pattern** — declare the edge inside the **source** block; the origin-scope rule
binds the source, not the target, so a block may depend on things it does not own.
For another **system**, use `System.Node` dot-notation (the referenced system
renders as a ghost).

```krs
service BillingService {
  domain Billing {
    label "Billing"
    Billing -> Contract "Created from a contract"   // Contract lives in another service
  }
}

// cross-system: PaymentGateway is a separate `system` (imported elsewhere)
OrderService -> PaymentGateway.PaymentService "Request payment"
```

**Why** — cross-service domain edges are auto-derived into implicit service-level
edges on the system view, so the high-level picture stays readable while the detail
lives where you wrote it. An endpoint you never modeled is kept and reported as
`unresolved-edge-endpoint` rather than dropped.

## 6. Split a model across files

**When** — one system grows too large for a single file, or different teams own
different slices.

**Pattern** — split by **facet** (per-service files + a shared `infra.krs`), and
stitch them with `import`. Same-id `system` / `deploy` / `organization` blocks merge
(reopen). Import a whole file with `import "x.krs"`, or a single node with
`import { Node } from "x.krs"`.

```krs
// index.krs — the entry point
import "infra.krs"     // shared database / queue / storage
import "reader.krs"    // one service per file
import "editor.krs"

system Blog {
  label "Blog Platform Demo"
}
```

**Why** — the **file is not a grouping unit** in the model: splitting is purely for
authoring ergonomics, and the merged result renders identically to a single file.
Keep shared stores in one `infra.krs` that each slice imports, so every slice also
renders standalone. See the
[`multi-file-system`](https://github.com/kompiro/karasu/tree/main/examples/en/multi-file-system)
example.

## 7. Cloudflare Workers — from `wrangler.toml`

**When** — a serverless Cloudflare Workers app whose physical layer lives in a
`wrangler.toml`. There is no compose / k8s file, so hand-modeling the bindings
risks leaking the concrete tech ("D1 (SQLite)") into logical labels.

**Pattern** — let `karasu translate --from wrangler` extract it deterministically.
The adapter emits a logical `system` (engine-neutral infra + the Worker `service`
+ edges) and a physical `deploy` where the concrete Cloudflare technology lands in
`store { type ... }`, never in a logical label:

```krs
system Hato {
  service Hato { label "hato" }

  database DB { }                  // D1
  storage EXPORTS { }              // R2
  queue TASKS { }                  // Queues
  database SEARCH [index] { }      // Vectorize — a derived vector index (idiom #2)
  database CACHE { }               // KV
  service AI [external] { }        // Workers AI — an external model service (idiom #3)
  service SessionActor [external] { }  // Durable Object — opaque stateful actor

  Hato --> DB                      // owned infra uses -->
  Hato -> AI                       // external / other Workers use ->
  Hato -> AuthWorker               // service binding = Worker→Worker RPC edge
}

deploy "hato" {
  function "hato" { runtime "cloudflare-workers"; realizes Hato }
  store DBStore     { type "Cloudflare D1";       realizes DB }
  store SEARCHStore { type "Cloudflare Vectorize"; realizes SEARCH }
}
```

**Why** — the binding→karasu mapping reuses existing idioms rather than minting
new syntax: **Vectorize → `database [index]`** (idiom #2, a derived index), **Workers
AI and Durable Objects → `service [external]`** (idiom #3, opaque to this adapter),
and a **service binding → a `->` communication edge**. KV maps to a plain `database`
(a dedicated `[cache]` role is a
[notation-watch item](https://github.com/kompiro/karasu/issues/1816), not yet
notation). Unknown binding kinds are skipped with a warning — never guessed. Run
`karasu translate --from wrangler wrangler.toml > index.krs`.

## See also

- [`docs/spec/syntax.md`](../spec/syntax.md) — the precise `.krs` grammar (feed this first)
- [`docs/spec/tags-annotations.md`](../spec/tags-annotations.md) — the full tag / annotation list
- [Reverse-engineering with an LLM](reverse-engineering-with-ai.md) — feed this cookbook alongside the grammar
- [Onboarding guide](02-onboarding.md) — reading an existing system down into diagrams
