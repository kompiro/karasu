---
type: product
---

# AT-0056: child nodes inherit parent service annotations for rendering

## Purpose

Verify that when a `service` carries lifecycle annotations (`@deprecated`, `@migration_target`, `@experimental`) and its child domains/usecases/resources do **not** declare any annotations of their own, the children are rendered as if they carried the parent's annotations (reduced opacity, badge, etc.). Explicit annotations on the child must continue to take priority over inherited ones, and a sibling un-annotated service must not give its children any inherited visual treatment.

## Setup

Use the bundled example `examples/migration/system.krs`. The relevant subset:

```krs
system ECommercePlatform {
  service LegacyMonolith @deprecated {
    domain Order { ... }
    domain Catalog { ... }
  }
  service OrderService @migration_target {
    domain Order { ... }
  }
  service CatalogService @experimental {
    domain Catalog { ... }
  }
  service Payment {
    domain Pay { ... }
  }
}
```

---

## Test Cases

### Case 1: child domain inherits `@deprecated` from its service

**Steps:**
1. Open `examples/migration/system.krs` in the preview UI.
2. Drill down into `LegacyMonolith`.

**Expected:**
- The `Order` domain node renders with a red ⚠ badge **and** reduced opacity (semi-transparent), matching the `@deprecated` styling visible at the system level.
- The `Catalog` domain node renders with the same `@deprecated` styling.
- Drilling further into `Order` shows its child usecases also rendered with `@deprecated` styling (transitive inheritance).

### Case 2: child domain inherits `@migration_target` from its service

**Steps:**
1. From the system view, drill down into `OrderService`.

**Expected:**
- The `Order` domain renders with the → badge characteristic of `@migration_target`.
- This `Order` is visually distinct from the `LegacyMonolith.Order` of Case 1, even though both share the same domain ID.

### Case 3: child domain inherits `@experimental` from its service

**Steps:**
1. From the system view, drill down into `CatalogService`.

**Expected:**
- The `Catalog` domain inside `CatalogService` renders with the `@experimental` visual treatment (badge / opacity per the builtin style for `@experimental`).

### Case 4: un-annotated services do not introduce inherited visual treatment

**Steps:**
1. From the system view, drill down into `Payment` (which carries no annotations).

**Expected:**
- Child domain nodes inside `Payment` render with the default style — no badge, full opacity.

### Case 5: explicit child annotations take priority over inherited ones

**Setup:** Edit `examples/migration/system.krs` (or use a scratch `.krs` file) so that one domain inside `LegacyMonolith @deprecated` carries its own annotation, e.g.:

```krs
service LegacyMonolith @deprecated {
  domain Order @experimental { ... }
}
```

**Steps:**
1. Drill down into `LegacyMonolith`.

**Expected:**
- The `Order` domain renders with the `@experimental` visual treatment, **not** the `@deprecated` one — explicit child annotations always replace inherited ones (no merging).
- Sibling domains inside `LegacyMonolith` that have no annotation of their own continue to render as `@deprecated`.

### Case 6: parser duplicate-domain-id check still uses source-level annotations only

**Setup:** Use the following `.krs` source (no explicit annotations on either `Order`):

```krs
system Test {
  service LegacyMonolith @deprecated {
    domain Order {}
  }
  service OrderService @migration_target {
    domain Order {}
  }
}
```

**Steps:**
1. Open the source in the editor.

**Expected:**
- An error diagnostic appears: `Domain id "Order" must be unique within a system; found in multiple services`.
- This confirms that ADR-20260411-02's duplicate-domain-id rule continues to look at each `domain` node's own annotations and is **not** influenced by the new inheritance behaviour. To legalize duplicate domain IDs, the explicit annotations on the domains themselves are still required.
