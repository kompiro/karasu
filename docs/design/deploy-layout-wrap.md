# Deploy 図レイアウト改善 — 横展開を抑えるラップレイアウト

- **日付**: 2026-04-08
- **ステータス**: 検討中
- **関連**:
  - [`docs/design/deployment-diagram.md`](deployment-diagram.md) — deploy 図の初期設計
  - [Issue #392](https://github.com/kompiro/karasu/issues/392) — 横展開が見づらいという報告

## 背景・課題

deploy 図のレイアウト（`deploy-layout.ts`）は、コンテナを一律に左から右へ並べる。
`examples/deploy/system.krs` のように7つのコンテナがある場合、図の幅が 2000px を超えることがあり、
プレビューUI・エクスポートSVGともに非常に見づらくなる。

現状の実装の核心：

```ts
// deploy-layout.ts（現状）
let currentX = OUTER_PADDING;
for (const group of groups) {
  const containerW = measureContainerWidth(...);
  containers.push({ x: currentX, y: OUTER_PADDING, ... });  // 全コンテナが同じ Y
  currentX += containerW + CONTAINER_GAP;                    // X のみ増加
}
```

## 制約・前提

- `LayoutResult`（`layout.ts`）の型は変更しない（`containers`, `nodes`, `edges`, `width`, `height`）
- ghost エッジは `LayoutEdge` 型のまま。`fromPoint` / `toPoint` の座標で表現する
- SVG レンダラー（`svg-renderer.ts`）はレイアウト座標をそのまま使うため、
  レンダラー側の変更なしで完結させる
- プレビューUI は SVG の `viewBox` をそのまま使うため、`width` / `height` が正しければ自動スケール

## 検討した選択肢

### 案1: Wrap レイアウト（行折り返し）

`MAX_DIAGRAM_WIDTH`（例：1200px）を超えた場合に次の行へ折り返す。
CSS `flex-wrap` に近い挙動。

```
┌─ Storefront ──┐  ┌─ OrderAPI ────┐  ┌─ Payment ────┐
│  storefront   │  │  order-api    │  │  payment-svc │
└───────────────┘  └───────────────┘  └──────────────┘

┌─ Inventory ───┐  ┌─ Reporting ───┐  ┌─ LegacyERP ─┐
│  inventory    │  │  daily-report │  │  legacy-erp  │
└───────────────┘  └───────────────┘  └──────────────┘

┌─ 未分類 ──────┐
│  data-backfill│
└───────────────┘
```

**メリット**
- 実装がシンプル（ループに「折り返し判定」を追加するだけ）
- 既存テストへの影響が最小（座標の絶対値が変わるだけ）
- コンテナ数に依存して自動調整される

**デメリット**
- コンテナの意味的な関係（realizes の階層）を反映しない
- 行の詰め方が幅基準なので、視覚的なバランスが崩れることがある
  （例：最後の行にコンテナ1つだけが残る）

---

### 案2: 固定グリッドレイアウト（N×M 均等分割）

コンテナ数から列数を √N 近似で決め、均等に配置する。

```
n=6 → 3列 × 2行
n=7 → 3列 × 3行（最終行は2つ）
```

**メリット**
- 視覚的なバランスが取りやすい

**デメリット**
- コンテナ幅がばらつく場合（ラベル長）に均等割が機能しない
- 実装が案1より複雑（列幅の最大値揃えが必要）

---

### 案3: 階層レイアウト（realizes の親子ツリー）

`realizes` が指す service の依存関係グラフを使い、
system 図と対応したトポロジーで配置する。

```
OrderAPI の上流 → OrderAPI → 下流（Payment, Inventory）
```

**メリット**
- 論理構造と物理構造の対応が一目でわかる

**デメリット**
- 実装コストが高い（DAG レイアウトアルゴリズムが必要）
- `realizes` が持つ情報は「service ID」だけで service 間エッジは ghost エッジ経由 —
  deploy 図だけでは依存グラフを完全に復元できない場合がある
- 今回の Issue の主目的（「横展開を抑える」）からスコープが大きく広がる

---

## 比較

| 観点 | 案1 Wrap | 案2 Grid | 案3 Tree |
|---|---|---|---|
| 実装コスト | 小 | 中 | 大 |
| 横展開の解消 | ○ | ○ | ○ |
| 意味的な配置 | △ | △ | ○ |
| 既存テストへの影響 | 小（座標変更のみ） | 中 | 大 |
| 将来の拡張性 | 案3への移行が可能 | 案3への移行が可能 | − |

## 現時点の方針

**案1（Wrap レイアウト）を採用する。**

最小の変更で「横展開を抑える」という目標を達成でき、
将来的に案3（階層レイアウト）へ発展させる際にも
`layoutDeploy` の入出力型を変えずに内部アルゴリズムを差し替えられる。

### 実装方針の詳細

#### 定数

```ts
const MAX_DIAGRAM_WIDTH = 1200;  // 折り返しの基準幅（px）
const ROW_GAP = 48;              // 行間の余白
```

#### アルゴリズム

1. 全コンテナの幅を事前計算する
2. 左から順にコンテナを並べ、`currentX + containerW > MAX_DIAGRAM_WIDTH - OUTER_PADDING` になったら改行
3. 各行の最大高さを記録し、次の行の `startY` を `startY += maxRowHeight + ROW_GAP` で更新

#### Ghost エッジのルーティング

- **同行（`fromRow === toRow`）**: 従来通り左右エッジを接続
- **異なる行**: `from` の下辺中央 → `to` の上辺中央 で接続
  （`from` が上の行にある場合）、または逆向き

```ts
function ghostEdgePoints(from: ContainerRect, to: ContainerRect) {
  if (from.y === to.y) {
    // 同行: 左右接続（従来ロジック）
  } else if (from.y < to.y) {
    // from が上の行: from 下辺中央 → to 上辺中央
    fromPoint = { x: from.x + from.width / 2, y: from.y + from.height };
    toPoint   = { x: to.x   + to.width   / 2, y: to.y };
  } else {
    // from が下の行: from 上辺中央 → to 下辺中央
    fromPoint = { x: from.x + from.width / 2, y: from.y };
    toPoint   = { x: to.x   + to.width   / 2, y: to.y + to.height };
  }
}
```

## 未解決の問い

- `MAX_DIAGRAM_WIDTH = 1200` はハードコードでよいか？
  将来的にユーザーが `.krs.style` や CLI オプションで変更したいケースがあるか？
  → 今回はハードコードとし、設定化は別 Issue で検討する。

- 行内でコンテナ高さが異なる場合（例：units が多いコンテナと少ないコンテナが同行にある）、
  短いコンテナをどう扱うか？
  → 今回は特に揃えず、各コンテナを自然な高さで配置する（CSS `align-items: flex-start` 相当）。
