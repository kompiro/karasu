# AT-0048: Resource Shape Auto-inference and Icon Mode for Infra Nodes

## Overview

Verifies that:
1. `resource` nodes with dot-notation refs automatically infer a style tag based on the referenced infra sub-resource kind.
2. Infra nodes (`database`, `queue`, `storage`) display as icon cards in Icon Mode.
3. `resource[table]`, `resource[queue]`, and `resource[storage]` display as distinct icon cards.

## Prerequisites

Use the following `.krs` file:

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

## Test Cases

### TC-1: Resource shape auto-inference (default mode)

1. Open the file in the preview.
2. Navigate to `OrderService → Order → PlaceOrder` (usecase level).
3. Verify that `OrderDB.OrderTable` renders with a table-like shape (distinct from the default resource shape).
4. Verify that `EventBus.OrderCreated` renders with a queue-like shape.
5. Navigate to `MediaService → Media → UploadImage`.
6. Verify that `MediaStorage.ImageBucket` renders with a storage/cloud-like shape.

### TC-2: Resource shape auto-inference does not override explicit tags

Add an explicit tag to a resource:

```krs
resource OrderDB.OrderTable [custom]
```

1. Verify that `OrderDB.OrderTable` renders with the `custom` tag's shape, not the inferred `table` shape.

### TC-3: Infra nodes in Icon Mode

1. Switch display mode to "Icon Mode".
2. In the system view, verify:
   - `OrderDB` renders as a `database` icon card.
   - `EventBus` renders as a `queue` icon card.
   - `MediaStorage` renders as a `cloud` (storage) icon card.

### TC-4: Resource tag variant icons in Icon Mode

1. Switch display mode to "Icon Mode".
2. Navigate to `OrderService → Order → PlaceOrder`.
3. Verify that `OrderDB.OrderTable` renders as a `table` icon card.
4. Verify that `EventBus.OrderCreated` renders as a `queue-card` (envelope) icon card.
5. Navigate to `MediaService → Media → UploadImage`.
6. Verify that `MediaStorage.ImageBucket` renders as a `cloud-card` (document) icon card.

### TC-5: Resource label resolution (regression)

1. Navigate to `OrderService → Order → PlaceOrder` in any display mode.
2. Verify that `OrderDB.OrderTable` displays the label "注文テーブル" (not "OrderTable" or the raw dot-notation ID).
3. Verify that `EventBus.OrderCreated` displays "注文作成イベント".
