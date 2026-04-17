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

**Input** `api.yaml`:
```yaml
openapi: "3.0.0"
info:
  title: ECommerce API
paths:
  /orders:
    get:
      operationId: listOrders
    post:
      operationId: placeOrder
  /orders/{id}:
    get:
      operationId: getOrder
    delete:
      operationId: deleteOrder
  /orders/{id}/cancel:
    post:
      operationId: cancelOrder
```

**Command:**
```bash
karasu translate --from openapi api.yaml --service ECommerce
```

**Expected output** (stdout):
```krs
service ECommerce {
  // Operations: GET /orders, POST /orders, GET /orders/{id}, DELETE /orders/{id}, POST /orders/{id}/cancel
  usecase ManageOrders { label "manage orders" }
}
```

> All operations sharing the same top-level resource segment fold into a single
> `manage <resource>` usecase. The original operations are preserved in the
> `// Operations:` comment for traceability.

---

### AT-0053-02: Resource grouping works even without operationId

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
  // Operations: GET /items, POST /items
  usecase ManageItems { label "manage items" }
}
```

---

### AT-0053-03: OpenAPI with default service name (derived from info.title)

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
  // Operations: GET /orders
  usecase ManageOrders { label "manage orders" }
}
```

---

### AT-0053-04: Translate SQL schema to database block

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

**Setup**: Paste the output of AT-0053-01 into the karasu preview or a `.krs` file.

**Expected**: The preview renders the `service` block with the grouped `usecase` node directly under it, and the diagnostics panel shows:
```
⚠ usecase "ManageOrders" is not assigned to any domain
```

---

### AT-0053-07: Error on missing --from flag

**Command:**
```bash
karasu translate api.yaml
```

**Expected**: Commander error message about missing required `--from` option.  
**Expected exit code**: `1`

---

### AT-0053-08: Error on missing file

**Command:**
```bash
karasu translate --from openapi nonexistent.yaml --service Foo
```

**Expected stderr**: `Error: File not found: nonexistent.yaml`  
**Expected exit code**: `1`

---

### AT-0053-09: `--granularity operation` opts back into per-operation usecases

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

**Command:**
```bash
karasu translate --from openapi api.yaml --granularity invalid
```

**Expected stderr**: `Error: --granularity must be "resource" or "operation"`
**Expected exit code**: `1`
