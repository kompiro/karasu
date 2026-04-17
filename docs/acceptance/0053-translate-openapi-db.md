---
id: AT-0053
title: CLI translate — OpenAPI and DB schema input
type: manual
---

# AT-0053: CLI translate — OpenAPI and DB schema input

## Prerequisites

- `karasu` CLI is built and available (`pnpm build` in `packages/cli`)
- Sample files are available (see below)

## Test cases

### AT-0053-01: Translate OpenAPI spec — operations grouped per resource (default)

> ✅ Automated — `packages/cli/src/translate/translate.e2e.test.ts` › `AT-0053-01: groups RESTful operations on the same resource into one usecase by default`

**Input** `api.yaml`:
```yaml
openapi: "3.0.0"
info:
  title: ECommerce API
paths:
  /orders:
    get:
      operationId: listOrders
      summary: List all orders
    post:
      operationId: placeOrder
      summary: Place a new order
  /orders/{id}:
    get:
      operationId: getOrder
    delete:
      operationId: deleteOrder
  /orders/{id}/cancel:
    post:
      operationId: cancelOrder
      summary: Cancel an order
```

**Command:**
```bash
karasu translate --from openapi api.yaml --service ECommerce
```

**Expected output** (stdout):
```krs
service ECommerce {
  usecase ManageOrders {
    label "manage orders"
    description """
      Operations:
      - GET /orders — List all orders
      - POST /orders — Place a new order
      - GET /orders/{id}
      - DELETE /orders/{id}
      - POST /orders/{id}/cancel — Cancel an order
      """
  }
}
```

> All operations sharing the same top-level resource segment fold into a single
> `manage <resource>` usecase. The original operations are preserved as a
> structured `description` block (with OpenAPI `summary` text when available),
> so they survive parsing and are surfaced in the karasu detail panel.

---

### AT-0053-02: Resource grouping works even without operationId

> ✅ Automated — `packages/cli/src/translate/translate.e2e.test.ts` › `AT-0053-02: groups operations even when operationId is absent`

**Input** `api.yaml`:
```yaml
openapi: "3.0.0"
info:
  title: Simple API
paths:
  /items:
    get: {}
    post: {}
```

**Command:**
```bash
karasu translate --from openapi api.yaml --service ItemService
```

**Expected output**:
```krs
service ItemService {
  usecase ManageItems {
    label "manage items"
    description """
      Operations:
      - GET /items
      - POST /items
      """
  }
}
```

---

### AT-0053-03: OpenAPI with default service name (derived from info.title)

> ✅ Automated — `packages/cli/src/translate/translate.e2e.test.ts` › `AT-0053-03: derives service name from info.title when --service is omitted`

**Input** `api.yaml`:
```yaml
openapi: "3.0.0"
info:
  title: Order Service
paths:
  /orders:
    get:
      operationId: listOrders
```

**Command (no --service flag):**
```bash
karasu translate --from openapi api.yaml
```

**Expected output**:
```krs
service OrderService {
  usecase ManageOrders {
    label "manage orders"
    description """
      Operations:
      - GET /orders
      """
  }
}
```

---

### AT-0053-04: Translate SQL schema to database block

> ✅ Automated — `packages/cli/src/translate/translate.e2e.test.ts` › `AT-0053-04: translates SQL schema to database block with table entries`

**Input** `schema.sql`:
```sql
CREATE TABLE orders (
  id BIGINT PRIMARY KEY,
  user_id BIGINT NOT NULL
);
CREATE TABLE order_items (
  id BIGINT PRIMARY KEY,
  order_id BIGINT NOT NULL
);
CREATE TABLE payments (
  id BIGINT PRIMARY KEY
);
```

**Command:**
```bash
karasu translate --from db schema.sql --database OrderDB
```

**Expected output** (stdout):
```krs
database OrderDB {
  table OrdersTable { label "orders" }
  table OrderItemsTable { label "order_items" }
  table PaymentsTable { label "payments" }
}
```

---

### AT-0053-05: DB schema without --database flag uses file name

> ✅ Automated — `packages/cli/src/translate/translate.e2e.test.ts` › `AT-0053-05: derives database name from file name when --database is omitted`

**Input** `order_db.sql` (same content as above)

**Command (no --database flag):**
```bash
karasu translate --from db order_db.sql
```

**Expected output**:
```krs
database OrderDb {
  table OrdersTable { label "orders" }
  table OrderItemsTable { label "order_items" }
  table PaymentsTable { label "payments" }
}
```

---

### AT-0053-06: Generated krs with unclassified usecase shows warning in preview

> ⏸ Manual — preview rendering and diagnostics panel are verified visually.

**Setup**: Paste the output of AT-0053-01 into the karasu preview or a `.krs` file.

**Expected**: The preview renders the `service` block with the grouped `usecase` node directly under it, and the diagnostics panel shows:
```
⚠ usecase "ManageOrders" is not assigned to any domain
```

---

### AT-0053-07: Error on missing --from flag

> ⏸ Manual — Commander built-in `requiredOption` behavior; not exercised by the library-level `translate()` e2e.

**Command:**
```bash
karasu translate api.yaml
```

**Expected**: Commander error message about missing required `--from` option.  
**Expected exit code**: `1`

---

### AT-0053-08: Error on missing file

> ✅ Automated — `packages/cli/src/translate/translate.e2e.test.ts` › `AT-0053-08: exits with code 1 and error message for missing openapi file`

**Command:**
```bash
karasu translate --from openapi nonexistent.yaml --service Foo
```

**Expected stderr**: `Error: File not found: nonexistent.yaml`  
**Expected exit code**: `1`

---

### AT-0053-09: `--granularity operation` opts back into per-operation usecases

> ✅ Automated — `packages/cli/src/translate/translate.e2e.test.ts` › `AT-0053-09: --granularity operation emits one usecase per HTTP operation`

**Input** `api.yaml`:
```yaml
openapi: "3.0.0"
info:
  title: ECommerce API
paths:
  /orders:
    post:
      operationId: placeOrder
  /orders/{id}/cancel:
    post:
      operationId: cancelOrder
```

**Command:**
```bash
karasu translate --from openapi api.yaml --service ECommerce --granularity operation
```

**Expected output**:
```krs
service ECommerce {
  usecase PlaceOrder { label "POST /orders" }
  usecase CancelOrder { label "POST /orders/{id}/cancel" }
}
```

> Use this when you want the full HTTP-operation surface — for example, when
> mapping each endpoint to its own implementation slice.

---

### AT-0053-10: Invalid `--granularity` value is rejected

> ⏸ Manual — validated at the Commander action layer (`packages/cli/src/index.ts`); not exercised by the library-level `translate()` e2e.

**Command:**
```bash
karasu translate --from openapi api.yaml --granularity invalid
```

**Expected stderr**: `Error: --granularity must be "resource" or "operation"`
**Expected exit code**: `1`
