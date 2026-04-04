# Domain Drift Detection — Scope and Detection Key

- **Date**: 2026-04-01
- **Status**: Accepted
- **Issue**: [#237](https://github.com/kompiro/karasu/issues/237)
- **Related**: [Core Concepts](../concepts.md), [.krs Syntax Reference](../spec/syntax.md)

## Background

Issue #237 was filed while designing the `examples/migration/` sample scenario,
which models a legacy-to-new migration where the same domain (e.g., `Payment`)
exists in both an old service and a new service that may belong to different `system`
blocks or different files.

The assumption in the issue was "cross-system domain drift is not detected." Code
investigation revealed the actual situation is more nuanced and that there are two
distinct problems in the existing implementation.

## Current Implementation (`resolver/warnings.ts`)

`detectDomainDispersal` maps `domain.label ?? domain.id` → set of parent service IDs,
then warns when the set size exceeds 1.

**Problem 1 — Detection key is `label ?? id`, not `id`**

| Scenario | Expected | Actual |
|----------|----------|--------|
| Same `id`, same label | warn | warn ✓ |
| Same `id`, different labels | warn | **silent** ✗ |
| Different `id`, same label | silent | **warn** ✗ |

`id` is the authoritative identifier in karasu. `label` is a display name that may be
translated, abbreviated, or reworded without changing the underlying concept. Using
`label ?? id` leads to both false negatives and false positives.

**Problem 2 — System boundary is not respected**

The function iterates `file.systems` with a single shared `domainToServices` map.
Domains across different `system` blocks are compared against each other.

In karasu, `system` represents an organizational ownership boundary (analogous to
C4 Model's Context boundary). A `domain Payment` in a legacy system and a
`domain Payment` in a new system are intentionally parallel — they model the same
business concept owned by different organizations at different lifecycle stages.
Flagging this as drift is a false positive that erodes trust in the warning.

## Questions from Issue #237 — Resolved

**Q: Should cross-system domain drift be detected at all?**

No. `system` is an organizational boundary. Same-concept domains across systems
represent intentional parallel ownership, not a design smell. Detection should be
scoped per `system`.

**Q: If yes, what is the scope — same file, same import graph, or globally?**

Moot given the above decision. Within a single system, multi-file detection already
works correctly: `analyze()` is called on the fully-merged `KrsFile` returned by
`ImportResolver.resolve()` in the `compileProject()` path. No additional change needed
for cross-file detection within the same system.

The `compile()` path is single-file by definition. If a service is split across files
and imported, `compileProject()` is the correct entry point. This boundary is expected
and should be documented.

**Q: Should users opt in via annotation?**

Not necessary. Scoping to within a system is the right default. If a user places two
services with the same domain ID inside the same system, it is almost always unintentional.

**Q: How does this interact with `[external]` tag on services?**

`[external]` services often model third-party systems where domain names are not under
the user's control. However, if a user explicitly places an `[external]` service inside
their own `system` block alongside an owned service with a shared domain ID, they have
chosen to co-model them and the warning is still appropriate. No special handling needed.

## Decision

### 1. Scope detection per `system`

Each `system` block is analyzed independently. Domains across different `system` blocks
are never compared for dispersal.

```krs
// No warning — different systems, intentional parallel modeling
system LegacyPlatform {
  service OldBilling {
    domain Payment { label "決済（旧）" }
  }
}

system NewPlatform {
  service PaymentService {
    domain Payment { label "決済（新）" }
  }
}

// Warning — same system, domain dispersal detected
system ECPlatform {
  service ECommerce {
    domain Payment { label "決済" }
  }
  service Checkout {
    domain Payment { label "決済処理" }  // ← warns: domain "Payment" in multiple services
  }
}
```

### 2. Use `id` as the detection key

The detection key changes from `node.label ?? node.id` to `node.id`.

```krs
// Warns (same id, different labels)
domain Payment { label "決済" }    // in ECommerce
domain Payment { label "お支払い" } // in Checkout → warns

// Does NOT warn (different ids, same label — probably a mistake, but not drift)
domain PaymentA { label "決済" }
domain PaymentB { label "決済" }
```

### 3. Cross-file detection via `compileProject()`

No code change needed. When files are compiled as a project, `ImportResolver` merges
all `KrsFile` objects before `analyze()` runs. Domain dispersal within a single system
spread across multiple files is detected correctly.

The single-file `compile()` path does not perform import resolution by design.
Users who split their architecture across files should use `compileProject()`.

## Impact on `examples/migration/`

The migration scenario should place the legacy and new services in **separate `system`
blocks** to model organizational boundaries accurately. Domain drift will NOT fire,
which is correct — this is intentional parallel ownership during migration.

To demonstrate the domain drift warning in examples, a dedicated sample should place
two services with a shared domain ID inside the **same** system.

## Implementation

This design doc describes two changes to `packages/core/src/resolver/warnings.ts`:

1. Scope the `domainToServices` map per system (reset map for each `system` iteration)
2. Change the detection key from `node.label ?? node.id` to `node.id`

These changes are tracked as a follow-up implementation task on Issue #237.
A fix to `warnings.test.ts` will be required to add coverage for:
- Same ID, different labels → should warn
- Different ID, same label → should not warn
- Domains in different systems → should not warn
