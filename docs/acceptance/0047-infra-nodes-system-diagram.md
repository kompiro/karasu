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

> 🟡 Partially automated — `packages/e2e/tests/at-0047-infra-nodes-system-diagram.spec.ts` › `database, queue and storage blocks render as System-level nodes` / `drilling into OrderService hides System-level infra nodes`（形状・色の視覚確認は手動）

- [ ] `OrderDB` appears as a distinct node with cylinder shape (green tones)
- [ ] `EventBus` appears as a distinct node with queue shape (yellow tones)
- [ ] `MediaStorage` appears as a distinct node with cloud shape (blue tones)
- [ ] All three infra nodes are visible in the System-level view alongside `OrderService` and `MediaService`

### Auto-derived edges

> ✅ Automated by `packages/core/src/view/view-extract.test.ts` (suite-wide) — "derives service→database edge from resource dot-notation reference" / "derives service→queue edge" / "derives service→storage edge" / "deduplicates edges when multiple usecases reference the same infra node"; plus `packages/core/src/view/derivation-contracts.test.ts` › "deriveInfraEdges: service→database via resource dot-notation"（TPL-20260510-07 attribute contract）

- [x] An edge `OrderService → OrderDB` is rendered (derived from `resource OrderDB.OrderTable` and `resource OrderDB.InventoryTable` — deduplicated to one edge)
- [x] An edge `OrderService → EventBus` is rendered (derived from `resource EventBus.OrderCreated`)
- [x] An edge `MediaService → MediaStorage` is rendered (derived from `resource MediaStorage.ImageBucket`)
- [x] An edge `MediaService → OrderDB` is rendered (derived from `resource OrderDB.InventoryTable`)
- [x] No duplicate edges appear between the same service and infra node

### Multi-service shared infra

> ✅ Automated by `packages/core/src/view/view-extract.test.ts` (suite-wide) — "derives service→database edge from resource dot-notation reference"（OrderService → OrderDB）+ "deduplicates edges when multiple usecases reference the same infra node"（MediaService → OrderDB がちょうど 1 本）

- [x] When two services reference the same database, both edges appear independently:
  - `[OrderService] → [OrderDB]`
  - `[MediaService] → [OrderDB]`

### Explicit edge takes precedence

Given an additional `OrderService -> OrderDB "カスタムラベル"` edge in the source:

- [x] Only one `OrderService → OrderDB` edge is rendered (no duplication)
> ✅ Automated — `packages/core/src/view/view-extract.test.ts` › `does not override explicitly declared edges with derived ones`

### Unassigned resources

Given a `resource UnassignedTable` (no dot-notation ref) inside a usecase:

- [x] No spurious edge is derived to a non-existent node
> ✅ Automated — `packages/core/src/view/view-extract.test.ts` › `does not derive edges for resources without dot-notation ref`

- [ ] No error is thrown; the diagram renders normally

> manual / visual review — verifies the no-crash / renders-normally half on a real render.

## Manual Verification Steps

1. Open karasu preview UI with the test input above
2. Verify the System diagram shows 5 nodes: `OrderService`, `MediaService`, `OrderDB`, `EventBus`, `MediaStorage`
3. Verify edges match the expected auto-derived connections
4. Drill into `OrderService` — confirm the service view does NOT show infra nodes (they are System-level only)
5. Drill into `OrderService → Order → PlaceOrder` — confirm `OrderDB.OrderTable` and `EventBus.OrderCreated` appear as resource nodes
