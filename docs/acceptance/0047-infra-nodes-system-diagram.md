---
id: AT-0047
title: Infra nodes (database/queue/storage) in System diagram with auto-derived edges
type: acceptance-test
issue: "#351"
date: 2026-04-07
---

## Overview

Verify that `database`, `queue`, and `storage` blocks appear as distinct nodes in the System diagram and that `service → database/queue/storage` edges are automatically derived from `usecase → resource` dot-notation references.

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

### System diagram nodes

- [ ] `OrderDB` appears as a distinct node with cylinder shape (green tones)
- [ ] `EventBus` appears as a distinct node with queue shape (yellow tones)
- [ ] `MediaStorage` appears as a distinct node with cloud shape (blue tones)
- [ ] All three infra nodes are visible in the System-level view alongside `OrderService` and `MediaService`

### Auto-derived edges

- [ ] An edge `OrderService → OrderDB` is rendered (derived from `resource OrderDB.OrderTable` and `resource OrderDB.InventoryTable` — deduplicated to one edge)
- [ ] An edge `OrderService → EventBus` is rendered (derived from `resource EventBus.OrderCreated`)
- [ ] An edge `MediaService → MediaStorage` is rendered (derived from `resource MediaStorage.ImageBucket`)
- [ ] An edge `MediaService → OrderDB` is rendered (derived from `resource OrderDB.InventoryTable`)
- [ ] No duplicate edges appear between the same service and infra node

### Multi-service shared infra

- [ ] When two services reference the same database, both edges appear independently:
  - `[OrderService] → [OrderDB]`
  - `[MediaService] → [OrderDB]`

### Explicit edge takes precedence

Given an additional `OrderService -> OrderDB "カスタムラベル"` edge in the source:

- [ ] Only one `OrderService → OrderDB` edge is rendered (no duplication)

### Unassigned resources

Given a `resource UnassignedTable` (no dot-notation ref) inside a usecase:

- [ ] No spurious edge is derived to a non-existent node
- [ ] No error is thrown; the diagram renders normally

## Manual Verification Steps

1. Open karasu preview UI with the test input above
2. Verify the System diagram shows 5 nodes: `OrderService`, `MediaService`, `OrderDB`, `EventBus`, `MediaStorage`
3. Verify edges match the expected auto-derived connections
4. Drill into `OrderService` — confirm the service view does NOT show infra nodes (they are System-level only)
5. Drill into `OrderService → Order → PlaceOrder` — confirm `OrderDB.OrderTable` and `EventBus.OrderCreated` appear as resource nodes
