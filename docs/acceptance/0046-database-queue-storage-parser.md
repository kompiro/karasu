---
id: AT-0046
title: database / queue / storage ブロックのパースと resource ドット記法参照
type: automated
status: active
---

# AT-0046: database / queue / storage ブロックのパースと resource ドット記法参照

## 概要

`database`, `queue`, `storage` を system 直下のファーストクラスノードとして導入し、
`usecase` 内の `resource` でドット記法による参照をサポートするパーサーの受け入れテスト。

設計: `docs/design/resource-and-database.md`

## 対象バージョン

#350 実装以降

## 前提条件

- `packages/core` のパーサーが対象

---

## AT-0046-1: database ブロックのパース

**種別**: 自動テスト（`parser.test.ts`）

### 入力

```krs
system ECPlatform {
  database OrderDB {
    table OrderTable { label "注文テーブル" }
    table InventoryTable { label "在庫テーブル" }
  }
}
```

### 期待結果

- `diagnostics` が空
- `system.children[0].kind === "database"`
- `system.children[0].id === "OrderDB"`
- `system.children[0].children[0].kind === "table"`, `id === "OrderTable"`, `label === "注文テーブル"`
- `system.children[0].children[1].kind === "table"`, `id === "InventoryTable"`

---

## AT-0046-2: queue ブロックのパース

**種別**: 自動テスト（`parser.test.ts`）

### 入力

```krs
system ECPlatform {
  queue EventBus {
    queue OrderCreated { label "注文作成イベント" }
  }
}
```

### 期待結果

- `system.children[0].kind === "queue"`
- `system.children[0].id === "EventBus"`
- `system.children[0].children[0].kind === "queue-item"`
- `system.children[0].children[0].id === "OrderCreated"`

---

## AT-0046-3: storage ブロックのパース

**種別**: 自動テスト（`parser.test.ts`）

### 入力

```krs
system ECPlatform {
  storage MediaStorage {
    bucket ImageBucket { label "商品画像バケット" }
  }
}
```

### 期待結果

- `system.children[0].kind === "storage"`
- `system.children[0].children[0].kind === "bucket"`, `id === "ImageBucket"`

---

## AT-0046-4: resource ドット記法参照のパース

**種別**: 自動テスト（`parser.test.ts`）

### 入力

```krs
system ECPlatform {
  database OrderDB {
    table OrderTable { label "注文テーブル" }
  }
  service A {
    domain X {
      usecase PlaceOrder {
        resource OrderDB.OrderTable
      }
    }
  }
}
```

### 期待結果

- `diagnostics` が空（warning なし）
- resource ノードの `kind === "resource"`
- `id === "OrderDB.OrderTable"`
- `ref === { parent: "OrderDB", child: "OrderTable" }`

---

## AT-0046-5: 未割当 inline resource の warning

**種別**: 自動テスト（`parser.test.ts`）

### 入力

```krs
system ECPlatform {
  service A {
    domain X {
      usecase B {
        resource OrderTable { label "注文テーブル" }
      }
    }
  }
}
```

### 期待結果

- `diagnostics.length === 1`
- `diagnostics[0].severity === "warning"`
- `diagnostics[0].message` が `"resource \"OrderTable\" is not assigned to any database"`

---

## AT-0046-6: 未宣言 database への参照は warning のみ（error にならない）

**種別**: 自動テスト（`parser.test.ts`）

### 入力

```krs
system ECPlatform {
  service A {
    domain X {
      usecase B {
        resource OrderDB.C
      }
    }
  }
}
```

（`database OrderDB` 宣言なし）

### 期待結果

- `error` 診断が出ない
- ドット記法の場合は warning も出ない（未解決参照の検証は後フェーズ）

---

## AT-0046-7: 完全な統合例（設計ドキュメントのサンプル）

**種別**: 自動テスト（`parser.test.ts`）

### 入力

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
        resource OrderDB.InventoryTable
        resource EventBus.OrderCreated
        resource MediaStorage.ImageBucket
      }
    }
  }
}
```

### 期待結果

- `diagnostics` が空
- `system.children.length === 4`（database, queue, storage, service の順）
- 各 resource ノードに `ref` が設定されている
