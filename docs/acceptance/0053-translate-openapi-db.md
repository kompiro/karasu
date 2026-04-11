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

### AT-0053-01: Translate OpenAPI spec to service usecases

**Input** `api.yaml`:
```yaml
openapi: "3.0.0"
info:
  title: ECommerce API
paths:
  /orders:
    post:
      operationId: placeOrder
      tags: [Order]
  /orders/{id}/cancel:
    post:
      operationId: cancelOrder
      tags: [Order]
```

**Command:**
```bash
karasu translate --from openapi api.yaml --service ECommerce
```

**Expected output** (stdout):
```krs
service ECommerce {
  usecase PlaceOrder { label "POST /orders" }
  usecase CancelOrder { label "POST /orders/{id}/cancel" }
}
```

---

### AT-0053-02: OpenAPI without operationId falls back to method+path

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
  usecase GetItems { label "GET /items" }
  usecase PostItems { label "POST /items" }
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
  usecase ListOrders { label "GET /orders" }
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

**Expected**: The preview renders the `service` block with `usecase` nodes directly under it, and the diagnostics panel shows:
```
⚠ usecase "PlaceOrder" is not assigned to any domain
⚠ usecase "CancelOrder" is not assigned to any domain
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
