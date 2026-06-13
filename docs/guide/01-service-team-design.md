# Architect's Guide: Designing Service and Team Boundaries with karasu

> **English**（this file） · [日本語](01-service-team-design.ja.md)
>
> 📚 Guide series — Part 1 of 5 ｜ Next: [Onboarding](02-onboarding.md) →

This guide is for architects who want to use karasu not as a diagramming tool but as **a tool for designing service boundaries and team boundaries**. It walks through how to answer three questions in karasu's vocabulary:

1. **Where should services be split, based on domain dependencies?**
2. **How do you redesign team structure to fit a desired architecture?** (the inverse Conway maneuver)
3. **How do you split the model into files so each team can operate its own slice?**

This is not an exhaustive syntax reference. For the precise specification of each feature, see [`docs/spec/syntax.md`](../spec/syntax.md); for the design philosophy, see [`docs/concepts.md`](../concepts.md). This guide shows the operational path — what an architect writes, why, and in what order.

Every `.krs` snippet in this guide has been syntax-checked with `karasu render`. To try them, paste into the karasu web app / VS Code extension, or run `karasu render <file>`.

---

## 0. Prerequisite: the three faces karasu models

karasu describes architecture across three faces — **logical, physical, and organizational** (see the "Three-faced structure" section of [`docs/concepts.md`](../concepts.md)).

| Face | Question | Main vocabulary |
|------|----------|-----------------|
| Logical | What exists, and why | `system` / `service` / `domain` / `usecase` / `resource` |
| Physical | How it runs | `deploy` / `realizes` |
| Organizational | Who owns it | `organization` / `team` / `member` / `owns` |

All three questions in this guide live at **the intersection of the logical and organizational faces**. karasu treats organization as a first-class vocabulary precisely so that this intersection — where Conway's law and the inverse Conway maneuver play out — can be discussed in a single language.

Keep the drill-down principle in mind, too. Rather than cramming everything onto one canvas, karasu is designed for *scoped glance*: you descend `system → service → domain → usecase`, **limiting how much you see at each level**. Discuss service boundaries at the `service`-level overview, and domain dependencies at the `domain`-level drill-down.

---

## 1. Deriving service splits from domain dependencies

### 1.1 Write the domains and their dependencies first (draw boundaries later)

Instead of "decide the boxes first, then fill them in," karasu lets you follow the bottom-up path: **observe the domains and their dependencies first, then draw boundaries where the coupling is thin.**

Start from a monolith where all domains live in one service. Write dependencies between domains as **edges originating from the source domain**, inside that domain's block (`->` for sync, `-->` for async).

```krs
system Shop {
  label "Online shop"

  user Customer [human] { label "Shopper" }

  service Monolith {
    label "Shop core"

    domain Catalog  { label "Catalog" }
    domain Cart {
      label "Cart"
      Cart -> Catalog "look up products"
    }
    domain Ordering {
      label "Ordering"
      Ordering -> Catalog   "read product info"
      Ordering -> Inventory "reserve stock"
      Ordering -> Payment   "request payment"
      Ordering --> Notification "notify order confirmed"
    }
    domain Inventory { label "Inventory" }
    domain Payment {
      label "Payment"
      Payment --> Notification "notify payment result"
    }
    domain Shipping {
      label "Shipping"
      Shipping -> Ordering "read confirmed orders"
    }
    domain Notification { label "Notification" }
  }

  Customer -> Monolith "shop"
}
```

> **Syntax note**: a domain-to-domain edge goes **inside the source domain's `domain` block**. Writing `Cart -> Catalog` directly under the `service` block is an error (an edge's source must match the enclosing block id). Write `Cart -> Catalog` inside the `Cart` block.

Drilling into `service Monolith` now shows seven domains and their dependency arrows. What you want to read off is the **dependency clusters**:

- `Ordering` fans out to `Catalog` / `Inventory` / `Payment` / `Notification` (ordering is the hub)
- `Shipping` depends only on `Ordering` (ordering and shipping are tightly coupled)
- `Cart` depends only on `Catalog` (the discovery side is thin and independent)
- `Notification` is a leaf everyone depends on (a shared capability)
- Payment's notification is async (`-->`) = intentional loose coupling

An async edge (`-->`) is not a cosmetic difference; it carries **structural semantics**. The cycle check described below treats async as "intentional loose coupling" and excludes it (see "Automatic checks — circular dependencies" in [`docs/concepts.md`](../concepts.md)). Which dependencies you make async is itself the design decision that keeps cross-boundary communication loosely coupled.

### 1.2 Drawing the boundaries — assigning to services

Once you have observed the clusters, **cut where the coupling is thin** and assign domains to services. Split the monolith above like this:

- `CatalogService` … `Catalog` (a foundation referenced by many; highly independent)
- `ShoppingService` … `Cart` (the discovery experience; depends only on Catalog)
- `OrderService` … `Ordering` + `Shipping` (ordering and shipping are tightly coupled — keep them together)
- `InventoryService` … `Inventory`
- `PaymentService` … `Payment` (high specialization — isolate it)
- `NotificationService` … `Notification` (a shared leaf capability)

```krs
system Shop {
  label "Online shop"

  user Customer [human] { label "Shopper" }

  service CatalogService {
    label "Catalog"
    domain Catalog { label "Catalog" }
  }

  service ShoppingService {
    label "Shopping experience"
    domain Cart {
      label "Cart"
      Cart -> Catalog "look up products"
    }
  }

  service OrderService {
    label "Order & shipping"
    domain Ordering {
      label "Ordering"
      Ordering -> Catalog   "read product info"
      Ordering -> Inventory "reserve stock"
      Ordering -> Payment   "request payment"
      Ordering --> Notification "notify order confirmed"
    }
    domain Shipping {
      label "Shipping"
      Shipping -> Ordering "read confirmed orders"
    }
  }

  service InventoryService {
    label "Inventory"
    domain Inventory { label "Inventory" }
  }

  service PaymentService {
    label "Payment"
    domain Payment {
      label "Payment"
      Payment --> Notification "notify payment result"
    }
  }

  service NotificationService {
    label "Notification"
    domain Notification { label "Notification" }
  }

  Customer -> ShoppingService "shop"
}
```

### 1.3 Implicit edges — domain dependencies surface as the service-boundary overview

This is the heart of domain-driven service splitting in karasu. **Just by writing domain-to-domain edges**, when one crosses between services, karasu **automatically synthesizes the higher-level service-to-service edge**. This is called an **implicit edge**.

In the example above, writing `Ordering -> Catalog` (a domain in OrderService → a domain in CatalogService) is enough for an implicit `OrderService -> CatalogService` edge to surface in the system overview as an amber dashed line. Multiple domain edges between the same service pair collapse into one, labeled `"N domain edges"`.

This asymmetry is the payoff — **the author only writes the fine-grained edges that fall out of domain modeling, and the reader receives the inter-service dependencies at the service-level overview.** The output of domain analysis flows directly into the service-boundary discussion, with no manual translation step. In other words, you can try "how should we cut services" over and over, just by rewriting the domain dependency graph.

Reading the post-split system overview, the inter-service dependencies are:

- `ShoppingService -> CatalogService` (from Cart→Catalog)
- `OrderService -> CatalogService` / `-> InventoryService` / `-> PaymentService`
- `OrderService --> NotificationService` (async)
- `PaymentService --> NotificationService` (async)
- `Shipping -> Ordering` is **contained within OrderService**, so it does not appear in the overview — it shows only when you drill into the `OrderService` service view

That last point is the rationale for co-location. By putting `Shipping` and `Ordering` in the same service, their tight dependency does not cross a service boundary and does not add to the overview's cognitive load. **Dependencies that should be contained within a service, and dependencies that span services, separate naturally on the diagram.**

### 1.4 Validating the split with static checks

karasu validates the boundaries you drew with two static signals. Both are "observations," not "prescriptions" — karasu draws and reports the structure, and leaves the judgment to the team (see "What karasu visualizes vs. what it doesn't prescribe" in [`docs/concepts.md`](../concepts.md)).

**Circular dependencies (`[cyclic]`, red)** — karasu detects cycles over **sync edges (`->`) only**. A sync cycle crossing a service boundary directly threatens startup order, call chains, and deploy independence, so it is a strong signal to redraw the boundary. Async (`-->`) cycles, by contrast, are excluded as "intentional loose coupling." **If a sync cycle spans two services, read it as: those two services are still fused into one boundary.**

**Domain dispersal (`domain-dispersal`, info)** — when the **same domain id appears in multiple services** within one system, an info diagnostic fires. DDD treats a domain spanning multiple services as a signal of low cohesion, so karasu reports it as a fact (it does not say "fix it"). This is an early warning for when you accidentally split one domain across two services mid-refactor. The detection key is `id`; `label` (display name) is not used.

> When evaluating a split, you can treat **"no cycles, no domain dispersal"** as one finish line. But this is not "the right answer" — it is "health from one school's point of view." There are legitimate cases for a shared DB or intentional domain sharing. Read the context the diagnostic links to, and judge against your project's constraints.

### 1.5 Quantifying coupling with a CRUD matrix

Edges show "who calls whom," but **data coupling** (which usecase reads/writes which resource) is a finer-grained coupling signal. As you fill in `operations` on a usecase's `resource`s, `karasu matrix` can emit a usecase × resource CRUD matrix.

```console
$ karasu matrix index.krs --format md --writes-only
```

What to look at from a service-split perspective:

- **Usecases from multiple services writing to the same resource (a column with high ΣC/U/D)** — write contention is a strong coupling signal. If you're writing the same data across a boundary, consider concentrating ownership of that resource in one service and having the others request via API.
- **A write-dominated resource** — a resource where writes dominate is a candidate for clear ownership, rather than being shared read-only.
- Narrowing with `--service` to one service shows how much it depends on external resources (the `[external]` columns).

The matrix is the "data-face" corroboration of a boundary; viewed together with edges (the call face), it lets you judge a split in three dimensions. For how to read it, see [Onboarding Guide §4.4](02-onboarding.md#44-listing-what-touches-what-with-a-crud-matrix).

---

## 2. The inverse Conway maneuver — designing teams to fit the architecture

Once boundaries are drawn, the next question is **who owns each boundary.** Conway's law states that software structure mirrors organizational structure. The inverse Conway maneuver uses this in reverse — **deliberately redesigning team structure to realize a desired architecture.**

For karasu, the org chart is not documentation but **a subject of design decisions.** By making service/domain ownership explicit in the diagram, you can discuss "we want to split this service — which team should own the new boundary?" at the same table as the logical structure.

### 2.1 organization / team / owns

Declare `team`s nested under an `organization` root, and have each team list the logical nodes (service / domain) it `owns`. Map teams onto the service boundaries drawn in §1.2.

```krs
organization Shop {
  label "Shop Engineering"

  team discovery {
    label "Discovery"
    description "Stream-aligned: owns the end-to-end flow from product discovery to cart"
    owns CatalogService
    owns ShoppingService
    owns Catalog
    owns Cart
  }

  team fulfillment {
    label "Fulfillment"
    description "Stream-aligned: owns order confirmation through shipping and stock reservation"
    owns OrderService
    owns InventoryService
    owns Ordering
    owns Shipping
    owns Inventory
  }

  team payments {
    label "Payments"
    description "Complicated-subsystem: holds the payment-domain specialization"
    owns PaymentService
    owns Payment
  }

  team platform {
    label "Platform"
    description "Platform team: provides shared capabilities such as notification to other teams"
    owns NotificationService
    owns Notification
  }
}
```

`owns` is the relation linking organization to logical/physical, symmetric to `realizes` (which links physical to logical). This way the three faces can be written independently, yet the correspondences always appear in the diagram.

### 2.2 Duplicate ownership is a boundary-collision signal

**The same node id cannot be `owns`ed by more than one team** — a duplicate is an error (or warning). This constraint earns its keep during an inverse Conway maneuver: while redrawing teams, if two teams try to own the same service, that is a signal that **the boundary is still fuzzy and the line of responsibility is undecided.** karasu detects it statically.

Conversely, if no team owns a service (it appears in no `owns`), it surfaces as ownerless in the org view. You catch "we split this service but never decided who owns the new boundary."

### 2.3 Expressing team topologies with description

karasu has no dedicated keyword for the *type* of a team (the Team Topologies vocabulary: stream-aligned / platform / enabling / complicated-subsystem). This is deliberate — karasu does not pin a particular organizational theory into its vocabulary. Instead, adopt a convention of stating it in one line in `description`, so the notation stays consistent across teams and both human readers and AI can read off "which role is this team" at a glance.

- **Stream-aligned team** … owns along a flow of user value (browse → buy → order → ship). `discovery` / `fulfillment` above.
- **Platform team** … provides shared capabilities to other teams. `platform` (notification) above.
- **Complicated-subsystem team** … isolates a part requiring deep specialization. `payments` above.
- **Enabling team** … helps other teams acquire capabilities (cross-cutting; support over ownership).

Practicing the inverse Conway maneuver is the work of "finding, for the service boundaries (§1), a team split that can be owned with minimal cognitive load." The size of each `owns` cluster is a proxy for that team's cognitive load — if one team `owns` too broad a range, it is a candidate for splitting.

### 2.4 Nested teams for org hierarchy

`team`s can nest, letting you place child teams (squads, on-call rotations, etc.) under a parent. Use `member` for individuals and `slack` / `github` for contact info. See [`examples/org/system.krs`](../../examples/org/system.krs) for a complete example.

---

## 3. Splitting files for per-team operation

Once service and team boundaries are settled, **split the model into files so each team can own and edit only its boundary.** This is the stage where the consequence of the inverse Conway maneuver is reflected into the repository's file structure too.

### 3.1 Grow first, extract later

karasu's principle is "write and grow with inline nesting, then extract to external files once it has grown." You don't need to aim for perfect file splitting from the start. Grow the model in one file as in §1–§2, and once the service boundaries stabilize, carve them out into per-team files.

### 3.2 Whole-file import and system reopen

The canonical way to split one `system` across files is to **reopen the same-id `system` block** in each file, and have an orchestrator file pull them in with whole-file `import "..."` (spec: "Multi-file import semantics" S2/S3 in [`docs/spec/syntax.md`](../spec/syntax.md)).

`index.krs` (the orchestrator — the entry file you open in the App / CLI):

```krs
import "discovery.krs"
import "fulfillment.krs"
import "payments.krs"
import "platform.krs"

system Shop {
  label "Online shop"
  user Customer [human] { label "Shopper" }
  Customer -> ShoppingService "shop"
}
```

`fulfillment.krs` (the slice the Fulfillment team owns):

```krs
system Shop {
  service OrderService {
    label "Order & shipping"
    domain Ordering {
      label "Ordering"
      Ordering -> Catalog   "read product info"
      Ordering -> Inventory "reserve stock"
      Ordering -> Payment   "request payment"
      Ordering --> Notification "notify order confirmed"
    }
    domain Shipping {
      label "Shipping"
      Shipping -> Ordering "read confirmed orders"
    }
  }
  service InventoryService {
    label "Inventory"
    domain Inventory { label "Inventory" }
  }
}

organization Shop {
  team fulfillment {
    label "Fulfillment"
    owns OrderService
    owns InventoryService
    owns Ordering
    owns Shipping
    owns Inventory
  }
}
```

The other teams (`discovery.krs` / `payments.krs` / `platform.krs`) take the same shape — each holds only its own services and the matching `team` block. Opening `index.krs` merges all four files into one `system Shop`, producing the same overview as §1.2.

Key merge rules (S3):

- **Same-id systems merge into one.** Children (service / domain / edge) union by id.
- **System body properties** (`label`, etc.) follow **root-entry-wins**: the file closer to the import-graph root wins. Above, `index.krs`'s `label "Online shop"` is adopted even if each slice writes a different label. The file you currently have open naturally becomes the source of truth for overview metadata.
- `organization` / `deploy` blocks propagate through whole-file import too, and same-id ones union (S4). If each team writes its own `team` block in its own file, they consolidate into one org chart at `index.krs`.

> **Mapping to CODEOWNERS**: this file split can be put in one-to-one correspondence with the repository's `CODEOWNERS`. Make `fulfillment.krs` owned by the Fulfillment team, and ownership in the model (`owns`) aligns with review rights in the repo — the inverse-Conway boundary rides straight into the PR flow.

### 3.3 Making each slice render standalone

When you open a team file by itself in the App, how are **edges pointing at other teams' domains** handled? `fulfillment.krs`'s `Ordering -> Catalog` has no `Catalog` in the same file, so the endpoint is unresolved when rendering standalone.

In that case karasu drops the edge and emits an `unresolved-edge-endpoint` warning, but **does not drop the node that did resolve (`Ordering`)** (S6). So the diagram doesn't break even standalone; all that's missing is one outbound arrow. Merge via `index.krs` and that arrow comes back.

To resolve the external reference standalone, import the referenced slice. To named-import a nested node (a domain inside a service), use a **dotted path**:

```krs
// Add at the top of fulfillment.krs to resolve Catalog even standalone
import { Shop.CatalogService.Catalog } from "discovery.krs"
```

A setup where `index.krs` whole-file imports both `discovery.krs` and `fulfillment.krs`, and `fulfillment.krs` also named-imports `discovery.krs`, is a **DAG (directed acyclic graph)**, not a cycle. Reaching the same file through multiple paths produces no `circular-import` warning (S5). The warning fires only for a **true cycle** — a file that loads itself back, directly or indirectly.

### 3.4 Shared infra: declared once in a dedicated file

A `database` / `queue` / `storage` shared by multiple slices is canonically declared once in a dedicated infra file, with each consuming slice pulling it in via `import "infra.krs"`. This lets each slice resolve its datastore references even standalone, and removes ambiguity about "where shared infra lives." For a complete working example, see [`examples/multi-file-system/`](../../examples/multi-file-system/) (`infra.krs` plus the reader / editor / moderation slices) — it demonstrates all of §3 end-to-end.

---

## 4. Closing the loop across all three faces — connecting to deploy via realizes

Having linked the logical (service boundaries) and organizational (teams) faces, add the physical face with `deploy` + `realizes` and all three line up. `realizes` points physical (concrete) → logical (abstract), declaring "this deploy unit realizes this service."

```krs
deploy Production {
  label "Production"
  oci orderContainer {
    image   "order-service:1.0.0"
    runtime "Docker"
    realizes OrderService
  }
}
```

`deploy` propagates through whole-file import too (S4), so each team can write its own `deploy` units in its own slice file. In the `multi-file-system` example, the reader / editor / moderation files each declare an `oci`, which union into one production deploy diagram at `index.krs`.

The loop closes like this:

```
domain dependencies (§1)
  → service boundaries (validated via implicit edges / cycle checks)
    → team ownership (§2: owns / inverse Conway)
      → file split (§3: each team owns a slice)
        → deploy (§4: realizes)
```

Because all three faces ride the same `.krs` vocabulary inside the same drill-down, re-cutting a service shows, on the same model, which team holds the new boundary and which deploy unit runs it, all in lockstep. This is the **design-at-the-intersection-of-three-faces** that karasu aims for.

---

## 5. Anti-patterns and how to read the diagnostics

karasu's diagnostics distinguish "fact" (the model's internal consistency) from "style" (a smell from some school's point of view) in their register. How to read them in the boundary-design context:

| Diagnostic | Level | Reading in boundary design |
|------------|-------|----------------------------|
| Circular dependency `[cyclic]` (sync only) | warning | A sync cycle crossing a service boundary = still fused. Redraw the boundary, or make one side async |
| `domain-dispersal` | info | One domain split across multiple services. A cohesion signal (DDD lens). Ignorable if intentional |
| `infra-redeclared-across-files` | info | Same DB declared in multiple files. A Database-per-Service smell. Ignorable if sharing is legitimate |
| Duplicate `owns` | error/warning | Two teams own the same node. The line of responsibility is undecided |
| `unresolved-edge-endpoint` | warning | An external reference is unresolved in a standalone slice render (S6, node preserved). Resolved on merge |
| `unassigned-database` | warning | A `database` sits outside any `system`. Place it directly under (or reopen) a `system` |

Read `info`-level diagnostics as **"karasu noticed something — read it if it matters in context, ignore it if it doesn't."** karasu does not refuse to render because of a style violation. A shared DB or a domain spanning multiple services, if structurally valid, is drawn faithfully, and the judgment is left to you, who knows the project's constraints.

---

## Further reading

- Related guides: [Onboarding](02-onboarding.md) (comprehension) / [Evolution & Migration](03-evolution.md) (change) / [Communicating Diagrams](05-communicating-diagrams.md) (style, legend, CI) / [Access Paths & Clients](04-access-paths.md)
- Map of all guides: [`docs/guide/README.md`](README.md)
- Precise syntax spec: [`docs/spec/syntax.md`](../spec/syntax.md)
- Style (`.krs.style`): [`docs/spec/style.md`](../spec/style.md)
- Tags and annotations: [`docs/spec/tags-annotations.md`](../spec/tags-annotations.md)
- Design philosophy (three faces, scoped glance, inverse-Conway motivation): [`docs/concepts.md`](../concepts.md)
- Working multi-file example: [`examples/multi-file-system/`](../../examples/multi-file-system/)
- Complete org-chart example: [`examples/org/system.krs`](../../examples/org/system.krs)
- Step-by-step tutorial: [`examples/ec-platform/`](../../examples/ec-platform/) (start at `01-system.krs`)
