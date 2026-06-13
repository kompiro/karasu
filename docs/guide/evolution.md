# Guide: Recording Architecture Evolution and Migration

> **English**（this file） · [日本語](evolution.ja.md)

After design (the [Boundary Design Guide](service-team-design.md)) and comprehension (the [Onboarding Guide](onboarding.md)) comes the stage of **changing what already exists.** Splitting a service, decommissioning a legacy system, migrating a monolith to microservices — these are not one-shot operations but processes that **proceed through several intermediate states.**

This guide shows how to honestly draw "the in-flight middle" in karasu and share the intent and progress of a change with the team. karasu has the annotations, inheritance, and diff machinery to express migration.

For the precise syntax, see [`docs/spec/syntax.md`](../spec/syntax.md); for the design philosophy, see [`docs/concepts.md`](../concepts.md). The `.krs` snippets and `karasu diff` runs below have been verified.

---

## 0. Why draw "the in-between state"

The difficulty of migration is that **old and new run side by side for a while.** "The old service is scheduled for removal," "this new service is still experimental," "this domain is temporarily double-owned by two services" — without expressing these intermediate states, a diagram can only draw the idealized "before" or "after," diverging from what's actually happening on the ground.

karasu lets you draw this transition as-is, with its **warn, don't error** policy and **lifecycle annotations.** The diagram becomes a dashboard showing "how far along the migration is," and `karasu diff` shows in review "what this PR did to the architecture."

---

## 1. Lifecycle annotations

Attach `@<annotation>` to a node to declare its lifecycle state. Four are provided.

| Annotation | Meaning | Typical use |
|------------|---------|-------------|
| `@deprecated` | Scheduled for removal; will go away | the legacy being replaced |
| `@new` | Recently introduced | the new replacement service |
| `@experimental` | Under development, unstable API | a trial service behind a feature flag |
| `@migration_target` | The node receiving a migration | the new service taking over responsibilities |

```krs
system ECPlatform {
  service ECommerce { label "E-commerce" }

  // @deprecated: migrating to NewPayment; will be removed
  service LegacyPayment @deprecated {
    label "Payment (old)"
    description "Old payment. Migrating to NewPayment. Decommission in 2026 Q3"
  }

  // @new: the replacement service
  service NewPayment @new {
    label "Payment (new)"
    description "PCI DSS-compliant new payment"
  }

  // @experimental: under development, API may change
  service RecommendationEngine @experimental {
    label "Recommendation engine"
  }

  ECommerce -> LegacyPayment "pay (migrating)"
  ECommerce -> NewPayment    "pay (new)"
}
```

Annotations compose. A "bridge that is deprecated yet also the migration target" is written `@deprecated @migration_target`.

- Adding the **removal date or migration target** in one line of `description` lets the migration plan be read from the diagram alone. A `link` to the migration RFC / ticket URL is even better.
- Annotations can drive styling via `.krs.style` selectors (`@deprecated`, etc.). For making state visible at a glance with color or badges, see the [Communicating Diagrams Guide](communicating-diagrams.md).

---

## 2. Annotation inheritance — context isn't lost on drill-down

An annotation on a `service` is **inherited** by its `domain` / `usecase` / `resource` children. Drilling into a `@deprecated` service draws its domains as deprecated too. If a child carries its own annotation, inheritance stops there.

```krs
service LegacyMonolith @deprecated {
  label "Legacy monolith"
  domain Order {              // inherits @deprecated from the parent
    label "Ordering (old)"
    usecase PlaceOrder { label "place an order" }
  }
}
```

This keeps the context "this service is scheduled for removal" at any depth of diagram. It prevents the accident of the "deprecated" mark suddenly disappearing deep in a drill-down. A migration decision (decommission) propagates automatically to every element underneath.

---

## 3. Drawing migration in stages — honest about old/new coexistence

When carving out of a monolith, a period arises where **the same business domain temporarily belongs to two services, old and new.** karasu does not forbid this; it reports "migration is incomplete" with the `domain-dispersal` (domain drift) diagnostic.

```krs
system ECommercePlatform {
  label "E-commerce platform (migrating)"

  user Customer [human] { label "Shopper" }

  service LegacyMonolith @deprecated {
    label "Legacy monolith"
    domain Order {                 // <- same id "Order"
      label "Ordering (old)"
      usecase PlaceOrder { label "place an order" }
    }
  }

  service OrderService @migration_target {
    label "Order service"
    domain Order {                 // <- same id "Order" -> drift warning
      label "Ordering (new)"
      usecase PlaceOrder  { label "place an order" }
      usecase CancelOrder { label "cancel an order" }
    }
  }

  // Draw the fact that old and new flows run in parallel, as edges
  Customer -> LegacyMonolith "buy (old flow)"
  Customer -> OrderService   "buy (new flow)"
}
```

The `domain-dispersal` (info) here is **not a bug but a migration status indicator.** The same `Order` domain living in two services = the carve-out is not yet complete. Once migration finishes and you delete `domain Order` from the old service, this warning disappears on its own. **The warning disappearing is itself the completion criterion** (full example: [`examples/migration/system.krs`](../../examples/migration/system.krs)).

> Domain-edge resolution and navigation prefer the side carrying a migration annotation (`@migration_target`, etc.) during drift. Even when old and new collide by name, resolution leans toward the migration target.

---

## 4. `karasu diff` — visualizing architecture change

A migration spans multiple PRs. `karasu diff` draws "what each PR did to the architecture" as an SVG of the difference (added / removed / changed nodes and edges) between two `.krs` states.

```console
# Diff between two git revisions (all views bundled)
$ git show HEAD~1:docs/system.krs | karasu diff - docs/system.krs > diff.svg

# Two files on disk, deploy view only
$ karasu diff old.krs new.krs --view deploy --output deploy.svg
```

- Passing `-` for either `before` / `after` reads that side from **stdin.** Combined with `git show <rev>:<path>`, you get the architecture diff between commits directly.
- Registered as a **git custom diff driver**, `git diff` on a `.krs` becomes an SVG render (see the `diff --help` examples).
- This lets PR review handle not only "what did this code change" but **"what did this change do to the architecture"** — one service added, one dependency rerouted, visible at a glance.

The "graphically diff two `.krs` files" experience follows naturally from karasu's properties — text, deterministic output, local changes (the Goals section of [`docs/concepts.md`](../concepts.md)).

---

## 5. Running a staged migration (the Strangler Fig pattern)

The canonical way to safely replace a legacy system is the **Strangler Fig**: run the new alongside, gradually shift traffic, and finally delete the old. Record each stage as a `.krs` state.

| Stage | Representation in `.krs` | Diagnostic emitted |
|-------|--------------------------|--------------------|
| 1. Introduce the new service in parallel | Add the new service with `@new` / `@migration_target`; it carries the same-id domain as the old | `domain-dispersal` (migrating) |
| 2. Shift traffic | Add a `Customer -> new` edge; keep the old edge | same |
| 3. Mark the old deprecated | Add `@deprecated` to the old service | same |
| 4. Delete the old | Remove the old service and its domain from `.krs` | drift warning disappears |

Put each stage in a separate PR and attach the `karasu diff` to the description, so migration progress is traceable across commit history. The annotation transition itself — an `@experimental` new service becoming `@new` once stable, then unmarked (established) — is also a migration log.

---

## 6. Checklist

- [ ] Did you mark the removal target `@deprecated` and the replacement `@new` / `@migration_target`?
- [ ] Did you add the removal date / migration target to `description`, and the migration RFC to `link`?
- [ ] Are you keeping the `domain-dispersal` warning during old/new coexistence as an "incomplete migration" signal? (Deleting the old to clear it is the completion condition.)
- [ ] Did you attach the `karasu diff` SVG to each migration PR's description?
- [ ] On completion, did you delete the old service / old domain and confirm the drift warning is gone?

---

## Further reading

- Companion guides: [Boundary Design](service-team-design.md) / [Onboarding](onboarding.md) / [Communicating Diagrams (style, legend, CI)](communicating-diagrams.md)
- Lifecycle annotation reference: [`docs/spec/tags-annotations.md`](../spec/tags-annotations.md)
- Complete migration example: [`examples/migration/system.krs`](../../examples/migration/system.krs)
- Design philosophy (annotation inheritance, the motivation for diff): [`docs/concepts.md`](../concepts.md)
