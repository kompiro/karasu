---
id: AT-0049
title: table/queue/bucket nodes rendered in domain-level UseCase diagram
type: acceptance-test
issue: "#352"
date: 2026-04-09
---

## Overview

Verify that when drilling down to the **domain** level, `table`, `queue`, and `bucket` sub-resources referenced via dot-notation appear as distinct nodes connected from their usecase nodes.

## Test Input

```krs
system ECPlatform {
  database OrderDB {
    table OrderTable { label "注文テーブル" }
    table InventoryTable { label "在庫テーブル" }
  }
  queue EventBus {
    queue OrderCreated { label "注文作成イベント" }
  }
  storage MediaStorage {
    bucket ImageBucket { label "商品画像バケット" }
  }

  service OrderService {
    domain Order {
      usecase PlaceOrder {
        resource OrderDB.OrderTable
        resource EventBus.OrderCreated
      }
      usecase CancelOrder {
        resource OrderDB.InventoryTable
      }
    }
  }
  service MediaService {
    domain Media {
      usecase UploadImage {
        resource MediaStorage.ImageBucket
        resource OrderDB.InventoryTable
      }
    }
  }
}
```

## Acceptance Criteria

### Domain-level node visibility

> ✅ Automated — `packages/e2e/tests/at-0049-resource-nodes-usecase-diagram.spec.ts` › `table, queue, and bucket resources render as sibling nodes with infra labels`

Drill down to `OrderService → Order` (domain view):

- [ ] `PlaceOrder` and `CancelOrder` appear as usecase nodes
- [x] `OrderDB.OrderTable` appears as a table-shaped node with label "注文テーブル"

> ✅ Automated — the node and its label by `packages/e2e/tests/at-0049-resource-nodes-usecase-diagram.spec.ts` › `table, queue, and bucket resources render as sibling nodes with infra labels`; the **table shape** by `packages/e2e/tests/at-0006-builtin-style.spec.ts` › `resource shapes are inferred from the infra kind (AC-1.2, AT-0049)`.

- [x] `EventBus.OrderCreated` appears as a queue-shaped node with label "注文作成イベント"

> ✅ Automated — as above; the queue shape is distinguished from a cylinder by cap orientation (`rx` vs `ry`), since both emit `path` + `ellipse`.

- [x] `OrderDB.InventoryTable` appears as a table-shaped node with label "在庫テーブル"

> ✅ Automated — as above (node + label by the AT-0049 spec, shape by the AT-0006 spec).
- [ ] No duplicate resource nodes appear (if two usecases reference the same resource, it is shown once)

### Edges

- [x] An edge `PlaceOrder → OrderDB.OrderTable` is rendered
> ✅ Automated — `packages/core/src/view/view-extract.test.ts` › `adds synthetic usecase→resource edges`（read/write の分類は `tags synthetic usecase→resource edges as read by default and labels them R` / `... as write and labels them W when operations include create/update/delete`）

- [x] An edge `PlaceOrder → EventBus.OrderCreated` is rendered
> ✅ Automated — `packages/core/src/view/view-extract.test.ts` › `adds synthetic usecase→resource edges`

- [ ] An edge `CancelOrder → OrderDB.InventoryTable` is rendered

> manual / visual review — the `CancelOrder` instance and visual edge coverage in the rendered domain view.

### Label resolution

- [x] Resource nodes use the label from the `table`/`queue`/`bucket` declaration, not the raw dot-notation ID
> ✅ Automated — `packages/core/src/view/view-extract.test.ts` › `maps dot-notation resource IDs to infra sub-resource labels`（`resourceLabelMap` が宣言 label を返すことを検証）

### Shared resource deduplication

> ✅ Automated — `packages/e2e/tests/at-0049-resource-nodes-usecase-diagram.spec.ts` › `shared resource across usecases deduplicates to one node with two incoming edges`

Add a second usecase referencing the same resource:

```krs
usecase PlaceOrder {
  resource OrderDB.OrderTable
}
usecase UpdateOrder {
  resource OrderDB.OrderTable
}
```

- [ ] `OrderDB.OrderTable` appears exactly once in the domain view
- [ ] Two edges appear: `PlaceOrder → OrderDB.OrderTable` and `UpdateOrder → OrderDB.OrderTable`

### Inline (unassigned) resources are not promoted

> ✅ Automated — `packages/e2e/tests/at-0049-resource-nodes-usecase-diagram.spec.ts` › `inline (unassigned) resources without dot-notation refs are not promoted to siblings`

```krs
usecase PlaceOrder {
  resource UnassignedTable { label "未割り当て" }
}
```

- [ ] `UnassignedTable` does NOT appear as a sibling node in the domain view (it has no dot-notation ref)

## Manual Verification Steps

1. Open the test input in the karasu preview UI
2. Navigate to `OrderService → Order`
3. Verify the diagram shows 5 nodes: `PlaceOrder`, `CancelOrder`, `OrderDB.OrderTable`, `EventBus.OrderCreated`, `OrderDB.InventoryTable`
4. Verify edges match the expected connections
5. Navigate to `MediaService → Media`
6. Verify 3 nodes: `UploadImage`, `MediaStorage.ImageBucket`, `OrderDB.InventoryTable`
7. Verify edges: `UploadImage → MediaStorage.ImageBucket`, `UploadImage → OrderDB.InventoryTable`
