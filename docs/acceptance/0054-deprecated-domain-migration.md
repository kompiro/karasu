# AT-0054: migration annotations on domain — co-existence during migration

## Purpose

Verify that `@deprecated` or `@migration_target` on a `domain` node allows two domains with the same ID to co-exist within the same system during a migration period, without producing an error diagnostic. Edges on the deprecated domain must still be rendered, deprecated domains must be visually distinguished, and the `@migration_target` domain takes navigation priority.

## Setup

Use the following `.krs` source:

```krs
system OrderSystem {
  service LegacyService {
    label "Legacy Service"
    domain Contract @deprecated {
      label "Contract (deprecated)"
      -> Billing
    }
  }
  service NewService {
    label "New Service"
    domain Contract @migration_target {
      label "Contract"
      -> Billing
    }
  }
  service BillingService {
    label "Billing Service"
    domain Billing {
      label "Billing"
    }
  }
}
```

---

## Test Cases

### Case 1: No error diagnostic for annotated duplicate

> ✅ Automated — `packages/e2e/tests/at-0054-deprecated-domain-migration.spec.ts` › `annotated duplicate produces no uniqueness error and both edges resolve (Case 1/2)`

**Steps:**

1. Open the `.krs` source above in the editor.

**Expected:**

- No error markers (red squiggles) appear for either `Contract` domain.
- The Diagnostics panel shows no error with the text "must be unique within a system".

---

### Case 2: Both domains' edges are resolved and rendered

> ✅ Automated — `packages/e2e/tests/at-0054-deprecated-domain-migration.spec.ts` › `annotated duplicate produces no uniqueness error and both edges resolve (Case 1/2)`

**Steps:**

1. Open the `.krs` source above.
2. View the system-level diagram for `OrderSystem`.

**Expected:**

- An edge from `LegacyService` toward `BillingService` is visible (implicit service edge derived from `Contract @deprecated { Contract -> Billing }`).
- An edge from `NewService` toward `BillingService` is visible (implicit service edge derived from `Contract @migration_target { Contract -> Billing }`).

---

### Case 3: Deprecated domain is visually distinguished

**Steps:**

1. Open the `.krs` source above.
2. Drill down into `LegacyService`.

**Expected:**

- The `Contract @deprecated` domain node renders with:
  - A red ⚠ badge (or "廃止予定" label).
  - Reduced opacity (appears semi-transparent) compared to the `@migration_target` domain.
- The `Contract @migration_target` domain in `NewService` renders with a → badge.

---

### Case 4: Non-annotated duplicates still produce an error

> ✅ Automated — `packages/e2e/tests/at-0054-deprecated-domain-migration.spec.ts` › `unannotated duplicate still emits uniqueness error (Case 4)`

**Steps:**

1. Open the following `.krs` source:

```krs
system OrderSystem {
  service A {
    domain Contract {}
  }
  service B {
    domain Contract {}
  }
}
```

**Expected:**

- An error diagnostic appears: `Domain id "Contract" must be unique within a system; found in multiple services`.

---

### Case 5: Order of appearance does not matter

> ✅ Automated — `packages/e2e/tests/at-0054-deprecated-domain-migration.spec.ts` › `swapping migration_target before deprecated keeps the duplicate legal (Case 5)`

**Steps:**

1. Swap the order so `NewService` (`@migration_target`) comes **before** `LegacyService` (`@deprecated`):

```krs
system OrderSystem {
  service NewService {
    domain Contract @migration_target {
      -> Billing
    }
  }
  service LegacyService {
    domain Contract @deprecated {
      -> Billing
    }
  }
  service BillingService {
    domain Billing {}
  }
}
```

**Expected:**

- Same as Case 1: no error diagnostic.
- Same as Case 2: edges from both services toward `BillingService` are rendered.
- Same as Case 3: visual distinction is preserved.

---

### Case 6: @deprecated alone (without @migration_target) is sufficient

**Steps:**

1. Open the following `.krs` source:

```krs
system OrderSystem {
  service LegacyService {
    domain Contract @deprecated {}
  }
  service NewService {
    domain Contract {}
  }
}
```

**Expected:**

- No error diagnostic.
- Navigation (`-> Contract`) resolves to `NewService.Contract` (non-annotated domain takes priority over `@deprecated`).

---

### Case 7: @migration_target alone (without @deprecated) is sufficient

**Steps:**

1. Open the following `.krs` source:

```krs
system OrderSystem {
  service OldService {
    domain Contract {}
  }
  service NewService {
    domain Contract @migration_target {}
  }
}
```

**Expected:**

- No error diagnostic.
- Navigation resolves to `NewService.Contract` (`@migration_target` takes highest priority).
