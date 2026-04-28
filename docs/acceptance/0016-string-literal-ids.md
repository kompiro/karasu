# AT-0016: String Literal IDs for Logical and Organization Nodes

## Overview

Logical nodes (`system`, `service`, `domain`, `usecase`, `resource`, `user`),
organization nodes (`organization`, `team`, `member`), and edge endpoints (`-->`, `->`)
accept string literals as IDs, allowing hyphenated or otherwise non-identifier names.
`realizes` and `owns` cross-reference values also accept string literals.

## Prerequisites

- karasu app is running (`npm run dev` in `packages/app`)
- A `.krs` file can be loaded in the editor

## Test Cases

### AT-0016-1: Logical nodes with hyphenated string literal IDs render correctly

> ✅ Automated — `packages/e2e/tests/at-0016-string-literal-ids.spec.ts` › `logical nodes with hyphenated string literal IDs parse and render labels (AT-0016-1)`

**Input `.krs`:**

```
system "e-commerce" {
  label "ECサイト"
  service "order-service" {
    label "受注サービス"
  }
  service "payment-gateway" {
    label "決済サービス"
  }
  "order-service" --> "payment-gateway" "決済を呼び出す"
}
```

**Expected:**

- No parse errors in the warning panel.
- Diagram shows `"ECサイト"` as the system label.
- Services show `"受注サービス"` and `"決済サービス"`.
- An edge connects the two services.

---

### AT-0016-2: Organization/team/member with string literal IDs

> ✅ Automated — `packages/e2e/tests/at-0016-string-literal-ids.spec.ts` › `organization/team/member with string literal IDs parse cleanly (AT-0016-2)`

**Input `.krs`:**

```
organization "dev-team" {
  label "開発チーム"
  team "backend-team" {
    label "バックエンド"
    owns "order-service"
    owns "payment-gateway"
    member "alice-smith" {
      label "Alice"
      github "alice-dev"
    }
  }
}
```

**Expected:**

- No parse errors in the warning panel.

---

### AT-0016-3: Deploy `realizes` with string literal ID cross-reference

> ✅ Automated — `packages/e2e/tests/at-0016-string-literal-ids.spec.ts` › `deploy realizes with string literal cross-reference parses cleanly (AT-0016-3)`

**Input `.krs`:**

```
system "e-commerce" {
  service "order-service" {
    label "受注サービス"
  }
}

deploy Production {
  label "本番環境"
  oci "order-api" {
    runtime "Node.js 20"
    realizes "order-service"
  }
}
```

**Expected:**

- No parse errors.
- Deploy diagram shows a `realizes` link from `"order-api"` to the `"order-service"` service.

---

### AT-0016-4: Identifier syntax continues to work unchanged

**Input `.krs`:**

```
system ECommerce {
  label "ECサイト"
  service OrderService {
    label "受注"
  }
}
```

**Expected:**

- No parse errors.
- Diagram renders correctly.
