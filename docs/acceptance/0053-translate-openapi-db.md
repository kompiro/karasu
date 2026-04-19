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

### AT-0053-04: Translate SQL schema to database block (default, soft FK grouping)

> ✅ Automated — `packages/cli/src/translate/translate.e2e.test.ts` › `AT-0053-04: translates SQL schema to database block with aggregate grouping`

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
  table OrdersTable {
    label "orders"
    description """
      Tables:
      - orders (root)
      - order_items — name suffix + inferred FK column to orders
      """
  }
  table PaymentsTable { label "payments" }
}
```

> Even though this schema declares no `FOREIGN KEY` / `REFERENCES`, the
> `order_items.order_id` column matches the `<parent>_id` soft-FK convention
> and `order_items` matches the `_items` name suffix, so it folds into the
> Orders aggregate. `payments` has neither signal and stays independent. See
> AT-0053-14 for a schema with explicit FKs.

---

### AT-0053-05: DB schema without --database flag uses file name

> ✅ Automated — `packages/cli/src/translate/translate.e2e.test.ts` › `AT-0053-05: derives database name from file name when --database is omitted`

**Input** `order_db.sql`:
```sql
CREATE TABLE orders ( id BIGINT PRIMARY KEY );
```

**Command (no --database flag):**
```bash
karasu translate --from db order_db.sql
```

**Expected output**:
```krs
database OrderDb {
  table OrdersTable { label "orders" }
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

**Expected stderr**: `Error: --granularity for --from openapi must be "resource" or "operation"`
**Expected exit code**: `1`

For `--from db`, the equivalent error is:

```bash
karasu translate --from db schema.sql --granularity invalid
```

**Expected stderr**: `Error: --granularity for --from db must be "aggregate" or "table"`
**Expected exit code**: `1`

`--granularity` is not valid with `--from compose` or `--from k8s`; passing it
there exits with code `1` and
`Error: --granularity is only valid with --from openapi or --from db`.

---

### AT-0053-11: `--from db` folds related tables into the aggregate root by default

> ✅ Automated — `packages/cli/src/translate/translate.e2e.test.ts` › `AT-0053-11: folds child tables into the aggregate root by default`

**Input** `schema.sql`:
```sql
CREATE TABLE contracts (
  id BIGINT PRIMARY KEY
);
CREATE TABLE contract_line_items (
  contract_id BIGINT NOT NULL REFERENCES contracts(id),
  line_no INT NOT NULL,
  amount DECIMAL,
  PRIMARY KEY (contract_id, line_no)
);
CREATE TABLE payments (
  id BIGINT PRIMARY KEY
);
```

**Command:**
```bash
karasu translate --from db schema.sql --database BizDB
```

**Expected output** (stdout):
```krs
database BizDB {
  table ContractsTable {
    label "contracts"
    description """
      Tables:
      - contracts (root)
      - contract_line_items — composite PK with FK to contracts
      """
  }
  table PaymentsTable { label "payments" }
}
```

> `contract_line_items` has a composite PK that includes a foreign key to
> `contracts`, so it folds into the Contracts aggregate. `payments` has no
> FK relationship to any other table and stays as an independent entry.

---

### AT-0053-12: `--granularity table` opts back into per-table output

> ✅ Automated — `packages/cli/src/translate/translate.e2e.test.ts` › `AT-0053-12: --granularity table emits one unit per SQL table`

**Input** `schema.sql`:
```sql
CREATE TABLE contracts (
  id BIGINT PRIMARY KEY
);
CREATE TABLE contract_line_items (
  contract_id BIGINT NOT NULL REFERENCES contracts(id),
  line_no INT NOT NULL,
  PRIMARY KEY (contract_id, line_no)
);
```

**Command:**
```bash
karasu translate --from db schema.sql --database BizDB --granularity table
```

**Expected output**:
```krs
database BizDB {
  table ContractsTable { label "contracts" }
  table ContractLineItemsTable { label "contract_line_items" }
}
```

> Use this when you want the raw per-table surface — for example, when
> generating a full table-level ER view.

---

### AT-0053-13: Junction tables are not folded (M:N relationships stay independent)

> ✅ Automated — `packages/cli/src/translate/translate.e2e.test.ts` › `AT-0053-13: junction tables are not folded into either parent`

**Input** `schema.sql`:
```sql
CREATE TABLE users (id BIGINT PRIMARY KEY);
CREATE TABLE roles (id BIGINT PRIMARY KEY);
CREATE TABLE user_roles (
  user_id BIGINT NOT NULL REFERENCES users(id),
  role_id BIGINT NOT NULL REFERENCES roles(id),
  PRIMARY KEY (user_id, role_id)
);
```

**Command:**
```bash
karasu translate --from db schema.sql --database AuthDB
```

**Expected output**:
```krs
database AuthDB {
  table UsersTable { label "users" }
  table RolesTable { label "roles" }
  table UserRolesTable { label "user_roles" }
}
```

> `user_roles` is a pure junction table (every PK column is an FK), which
> represents an M:N relationship rather than internal structure. Folding it
> into either parent would misrepresent the model, so it stays as an
> independent `table` entry.

---

### AT-0053-14: Soft FK via `<parent>_code` column convention

> ⏸ Manual — exercised by unit tests (`db.test.ts` › `folds via soft FK using <parent>_code column`); no separate e2e.

**Input** `schema.sql`:
```sql
CREATE TABLE products (id BIGINT PRIMARY KEY);
CREATE TABLE product_details (
  id BIGINT PRIMARY KEY,
  product_code VARCHAR(32) NOT NULL
);
```

**Command:**
```bash
karasu translate --from db schema.sql --database CatalogDB
```

**Expected output**:
```krs
database CatalogDB {
  table ProductsTable {
    label "products"
    description """
      Tables:
      - products (root)
      - product_details — name suffix + inferred FK column to products
      """
  }
}
```

> Soft FKs support both `_id` and `_code` column suffixes. This lets schemas
> that use domain-readable keys (product SKUs, currency codes, etc.) still
> benefit from aggregate grouping without declaring explicit foreign keys.
