---
type: acceptance-test
id: "0045"
title: Cyclic Dependency Detection and Visual Highlighting
issue: "#287"
---

# AT-0045: Cyclic Dependency Detection and Visual Highlighting

## Purpose

Verify that cyclic sync (`->`) dependencies between services are detected, reported as warnings, and rendered visually distinct (red, bold) in the diagram.

## 受け入れ条件

### AC-1: 警告メッセージとエッジへのマーキング

Setup:

```krs
system ECommerce {
  service OrderService {}
  service PaymentService {}
  service InventoryService {}

  OrderService -> PaymentService
  PaymentService -> OrderService
  OrderService -> InventoryService
}
```

- [x] 警告パネルに `cyclic-dependency` 警告 (`Circular dependency detected: OrderService → PaymentService → OrderService`) が表示される
> ✅ Automated — `packages/e2e/tests/at-0045-cyclic-dependency-detection.spec.ts` › `sync cycle emits warning and marks edges with krs-edge--cyclic`

- [x] 循環エッジ (`OrderService → PaymentService`, `PaymentService → OrderService`) に `class="krs-edge--cyclic"` が付与され、SVG 出力にビルトインスタイルの赤色 (`#EF4444`) が含まれる
> ✅ Automated — `packages/e2e/tests/at-0045-cyclic-dependency-detection.spec.ts` › `sync cycle emits warning and marks edges with krs-edge--cyclic`

- [ ] 循環エッジが赤色かつ太く描画される（視覚確認）
- [ ] 非循環エッジ (`OrderService → InventoryService`) は通常の色で描画される
- [ ] 循環エッジがあっても図全体は描画される（エッジが省略されない）

> 上記 3 項目は赤色・太さの視覚的判定が必要なため AI / 人間レビューに残す。
> ユニットテスト側ではエッジ属性 (`krs-edge--cyclic` クラス、ストローク色) を
> 検証している (`packages/core/src/resolver/warnings.test.ts`)。

### AC-2: 直接 / 間接の循環検出

- [x] 自己参照 (`A -> A`) で `cyclic-dependency` 警告が出る
> ✅ Automated — `packages/core/src/resolver/warnings.test.ts`（unit）

- [x] 直接循環 (`A -> B -> A`) で警告が出て両エッジが `cyclic` マークされる
> ✅ Automated — `packages/core/src/resolver/warnings.test.ts`（unit）

- [x] 間接循環 (`A -> B -> C -> A`) で警告が出て 3 本すべてが `cyclic` マークされる
> ✅ Automated — `packages/core/src/resolver/warnings.test.ts`（unit）

- [x] 非循環グラフ (`A -> B -> C`) では警告が出ない
> ✅ Automated — `packages/core/src/resolver/warnings.test.ts`（unit）

- [x] 循環があるグラフでも、循環に関与しないエッジは `cyclic` マークされない
> ✅ Automated — `packages/core/src/resolver/warnings.test.ts`（unit）

### AC-3: async edge は循環判定に含まれない

Setup:

```krs
system ECommerce {
  service OrderService {}
  service PaymentService {}

  OrderService --> PaymentService
  PaymentService --> OrderService
}
```

- [x] async cycle (`A --> B --> A`) は `cyclic-dependency` 警告を出さない
> ✅ Automated — `packages/e2e/tests/at-0045-cyclic-dependency-detection.spec.ts` › `async-only cycle does not emit a cyclic-dependency warning`

- [ ] 両エッジがデフォルトの dashed async スタイルで描画される（赤くない）

> 視覚的判定のため AI / 人間レビューに残す。

### AC-4: ユーザースタイルでの上書き

Setup: `.krs.style` に以下を追加:

```krs.style
edge[cyclic] {
  color: #F97316;
  stroke-width: 4;
}
```

- [ ] 循環エッジがオレンジ (`#F97316`) かつ stroke-width 4 で描画される
- [ ] 非循環エッジは影響を受けない

> ユーザースタイル適用後の視覚確認のため AI / 人間レビューに残す。
