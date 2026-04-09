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

Drill down to `OrderService → Order` (domain view):

- [ ] `PlaceOrder` and `CancelOrder` appear as usecase nodes
- [ ] `OrderDB.OrderTable` appears as a table-shaped node with label "注文テーブル"
- [ ] `EventBus.OrderCreated` appears as a queue-shaped node with label "注文作成イベント"
- [ ] `OrderDB.InventoryTable` appears as a table-shaped node with label "在庫テーブル"
- [ ] No duplicate resource nodes appear (if two usecases reference the same resource, it is shown once)

### Edges

- [ ] An edge `PlaceOrder → OrderDB.OrderTable` is rendered
- [ ] An edge `PlaceOrder → EventBus.OrderCreated` is rendered
- [ ] An edge `CancelOrder → OrderDB.InventoryTable` is rendered

### Label resolution

- [ ] Resource nodes use the label from the `table`/`queue`/`bucket` declaration, not the raw dot-notation ID

### Shared resource deduplication

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
