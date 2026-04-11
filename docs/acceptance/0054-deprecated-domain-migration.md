# AT-0054: [deprecated] tag on domain — migration co-existence

## Purpose

Verify that `domain [deprecated]` allows two domains with the same ID to co-exist within the same system during a migration period, without producing an error diagnostic. Edges on the deprecated domain must still be rendered, and deprecated domains must be visually distinguished.

## Setup

Use the following `.krs` source:

```krs
system OrderSystem {
  service LegacyService {
    label "Legacy Service"
    domain Contract [deprecated] {
      label "Contract (deprecated)"
      -> Billing
    }
  }
  service NewService {
    label "New Service"
    domain Contract {
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

### Case 1: No error diagnostic for deprecated duplicate

**Steps:**
1. Open the `.krs` source above in the editor.

**Expected:**
- No error markers (red squiggles) appear for either `Contract` domain.
- The Diagnostics panel shows no error with the text "must be unique within a system".

---

### Case 2: Deprecated domain's edges are resolved and rendered

**Steps:**
1. Open the `.krs` source above.
2. View the system-level diagram for `OrderSystem`.

**Expected:**
- An edge from `LegacyService` toward `BillingService` is visible (implicit service edge derived from `Contract [deprecated] -> Billing`).
- An edge from `NewService` toward `BillingService` is visible (implicit service edge derived from `Contract -> Billing`).

---

### Case 3: Deprecated domain is visually distinguished

**Steps:**
1. Open the `.krs` source above.
2. Drill down into `LegacyService`.

**Expected:**
- The `Contract [deprecated]` domain node renders with:
  - A red ⚠ badge (or "非推奨" label).
  - Reduced opacity (appears semi-transparent) compared to non-deprecated domains.

---

### Case 4: Non-deprecated duplicates still produce an error

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

**Steps:**
1. Swap the order so `NewService` (non-deprecated) comes **before** `LegacyService` (deprecated):

```krs
system OrderSystem {
  service NewService {
    domain Contract {
      -> Billing
    }
  }
  service LegacyService {
    domain Contract [deprecated] {
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
- Same as Case 3: the `Contract [deprecated]` domain appears visually distinct.
