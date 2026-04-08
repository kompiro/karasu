# Deploy 図レイアウト改善 — 階層 DAG レイアウト（Tree レイアウト）

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
- `DeployViewSlice.ghostEdges` がサービス間の依存グラフを提供している（`extractDeployView` で構築済み）

## 検討した選択肢

### 案1: Wrap レイアウト（行折り返し）

`MAX_DIAGRAM_WIDTH`（例：1200px）を超えた場合に次の行へ折り返す。
CSS `flex-wrap` に近い挙動。

**メリット**
- 実装がシンプル（ループに「折り返し判定」を追加するだけ）
- 既存テストへの影響が最小（座標の絶対値が変わるだけ）

**デメリット**
- コンテナの意味的な関係（service の依存関係）を反映しない
- 行の詰め方が幅基準なので、視覚的なバランスが崩れることがある

---

### 案2: 固定グリッドレイアウト（N×M 均等分割）

コンテナ数から列数を √N 近似で決め、均等に配置する。

**メリット**
- 視覚的なバランスが取りやすい

**デメリット**
- コンテナ幅がばらつく場合に均等割が機能しない
- 依存関係を反映しない

---

### 案3: 階層レイアウト（DAG を使った Sugiyama 風レイアウト）

`ghostEdges` が表すサービス間依存グラフをもとに、
上流のコンテナを上、下流のコンテナを下に配置する「レイヤー分け + 横並べ」のレイアウト。

`examples/deploy/system.krs` の依存グラフ
（`Storefront → OrderAPI → {Payment, Inventory, Reporting}`, `Inventory → LegacyERP`）
に対して次のような配置が得られる：

```
Layer 0:  ┌─ ストアフロント ──┐
          │  storefront SPA   │
          └───────────────────┘
                    │
Layer 1:  ┌─ 注文API ─────────────────────────┐
          │  order-api  order-event-handler    │
          └───────────────────────────────────┘
           │               │              │
Layer 2:  ┌─ 決済 ─┐  ┌─ 在庫 ─┐  ┌─ レポーティング ─┐
          │payment │  │inventory│  │ daily / monthly  │
          └────────┘  └────────┘  └──────────────────┘
                           │
Layer 3:           ┌─ レガシーERP ─┐
                   │  legacy-erp   │
                   └───────────────┘

（孤立・未分類は最下段に独立配置）
┌─ 未分類 ──────┐
│  data-backfill │
└────────────────┘
```

**メリット**
- service 間の依存関係が視覚的に明確になる（上流→下流の流れが見える）
- 横展開を根本的に解消する
- 将来的にドリルダウンやハイライト連携との親和性が高い

**デメリット**
- 実装コストが案1・2より高い（DAG レイヤリングアルゴリズムが必要）
- ghost エッジが存在しない孤立コンテナの扱いを別途定義する必要がある
- 循環依存（サイクル）が存在する場合の扱いが必要

---

## 比較

| 観点 | 案1 Wrap | 案2 Grid | 案3 Tree (DAG) |
|---|---|---|---|
| 実装コスト | 小 | 中 | 中〜大 |
| 横展開の解消 | ○ | ○ | ○ |
| 依存関係の可視化 | × | × | ◎ |
| 既存テストへの影響 | 小 | 中 | 中（座標変更） |
| 孤立コンテナの扱い | 自然 | 自然 | 要定義 |

## 現時点の方針

**案3（階層 DAG レイアウト）を採用する。**

deploy 図の主目的は「どのサービスがどこで動いているか・関係サービスは何か」を伝えることであり、
service 間の依存関係を視覚的に反映したレイアウトが最も目的に適合する。

### アルゴリズム設計

#### 1. レイヤー割り当て（Longest Path Layering）

```
function assignLayers(containerIds, ghostEdges):
  layer = Map<id, number>
  inDegree = Map<id, number>（初期値 0）
  successors = Map<id, id[]>

  for each edge (from → to):
    inDegree[to]++
    successors[from].push(to)

  // BFS — キューに in-degree = 0 のノードを積む
  queue = [id | inDegree[id] === 0]
  while queue not empty:
    node = queue.shift()
    for each successor of node:
      layer[successor] = max(layer[successor], layer[node] + 1)
      inDegree[successor]--
      if inDegree[successor] === 0: queue.push(successor)

  return layer
```

- 孤立コンテナ（どの edge にも登場しない）は layer 0 に入る
- 未分類コンテナは「最大 layer + 1」の専用行に置く

#### 2. 同レイヤー内の水平配置

- 同レイヤーのコンテナをそのまま左から右に並べる（初期実装）
- `MAX_LAYER_WIDTH = 1200` を超える場合は複数行に折り返す（将来拡張）

#### 3. 各レイヤーの Y 座標

```
rowY[0] = OUTER_PADDING
rowY[i] = rowY[i-1] + maxHeightOfLayer[i-1] + ROW_GAP
```

`ROW_GAP = 64`（エッジを引く空間を確保するため、`CONTAINER_GAP` より大きく取る）

#### 4. Ghost エッジのルーティング

- **同レイヤー（異常ケース or サイクル由来）**: 左右接続（従来通り）
- **隣接レイヤー（from.layer < to.layer）**: `from` の下辺中央 → `to` の上辺中央
- **レイヤーをまたぐ長距離エッジ（from.layer + 1 < to.layer）**: 同上（直線で接続）

```ts
function ghostEdgePoints(from: ContainerRect, to: ContainerRect) {
  if (from.y < to.y) {
    // from が上のレイヤー → 下辺中央から上辺中央へ
    return {
      fromPoint: { x: from.x + from.width / 2, y: from.y + from.height },
      toPoint:   { x: to.x   + to.width   / 2, y: to.y },
    };
  } else if (from.y > to.y) {
    // from が下のレイヤー（逆向きエッジ）→ 上辺中央から下辺中央へ
    return {
      fromPoint: { x: from.x + from.width / 2, y: from.y },
      toPoint:   { x: to.x   + to.width   / 2, y: to.y + to.height },
    };
  } else {
    // 同レイヤー → 左右接続（従来ロジック）
    if (from.x < to.x) {
      return {
        fromPoint: { x: from.x + from.width, y: from.y + from.height / 2 },
        toPoint:   { x: to.x,                y: to.y   + to.height   / 2 },
      };
    } else {
      return {
        fromPoint: { x: from.x,              y: from.y + from.height / 2 },
        toPoint:   { x: to.x + to.width,     y: to.y   + to.height   / 2 },
      };
    }
  }
}
```

#### 5. サイクルの扱い

実運用の deploy 定義でサイクルが発生するケースは稀だが、無限ループを防ぐため、
BFS 中に「既に layer が確定したノードへの後退エッジ（back edge）」を検出した場合は
その edge を ghost エッジとして描画するが、レイヤー割り当てには使用しない。

#### 6. 定数追加

```ts
const ROW_GAP = 64;       // レイヤー間の縦余白
const MAX_LAYER_WIDTH = 1200;  // 将来の同レイヤー折り返し用（今回は参考定義のみ）
```

## 未解決の問い

- 同レイヤー内のコンテナ順序（エッジ交差最小化）は今回スコープ外でよいか？
  → 初期実装は挿入順とし、将来の改善 Issue に委ねる。

- 孤立コンテナが多数ある場合の layer 0 の横展開はどう扱うか？
  → `MAX_LAYER_WIDTH` による折り返しは将来拡張とし、今回は直線配置のみ。

- 未分類コンテナを最下段に置く代わりに layer 0 に混在させるか？
  → 「realizes なし = 依存グラフに属さない」ため、最下段の独立行に置く方が意味的に正確。
