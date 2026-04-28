# AT-0015: Deploy id/label Separation

## Overview

Deploy blocks and deploy nodes support separate `id` (identifier) and `label` (display text) fields,
consistent with logical nodes. The renderer shows the label when set, falling back to the id otherwise.

## Prerequisites

- karasu app is running (`npm run dev` in `packages/app`)
- A `.krs` file with a deploy block can be loaded in the editor

## Test Cases

### AT-0015-1: Deploy node label renders as display text

> ✅ Automated — `packages/e2e/tests/at-0015-deploy-id-label-separation.spec.ts` › `renders label text when both id and label are set (AT-0015-1)`

**Input `.krs`:**

```
deploy Production {
  label "本番環境"
  oci ecommerceApp {
    label "EC Application"
    runtime "Node.js 20"
    realizes ECommerce
  }
}
```

**Steps:**

1. Open the app and paste the above into the editor.
2. Observe the deploy diagram.

**Expected:**

- The deploy container title shows `"本番環境"` (not `"Production"`).
- The deploy node box shows `"EC Application"` (not `"ecommerceApp"`).

---

### AT-0015-2: Fallback to id when label is absent

> ✅ Automated — `packages/e2e/tests/at-0015-deploy-id-label-separation.spec.ts` › `falls back to id when label is absent (AT-0015-2)`

**Input `.krs`:**

```
deploy Production {
  oci ecommerceApp {
    runtime "Node.js 20"
    realizes ECommerce
  }
}
```

**Steps:**

1. Open the app and paste the above into the editor.
2. Observe the deploy diagram.

**Expected:**

- The deploy container title shows `"Production"`.
- The deploy node box shows `"ecommerceApp"`.

---

### AT-0015-3: Legacy string literal syntax continues to work

> ✅ Automated — `packages/e2e/tests/at-0015-deploy-id-label-separation.spec.ts` › `legacy string literal deploy syntax still works (AT-0015-3)`

**Input `.krs`:**

```
deploy "本番環境" {
  oci "order-service" {
    runtime "Node.js 20"
    realizes ECommerce
  }
}
```

**Steps:**

1. Open the app and paste the above into the editor.
2. Observe the deploy diagram.

**Expected:**

- The deploy container title shows `"本番環境"`.
- The deploy node box shows `"order-service"`.
- No parse errors are shown in the warning panel.
