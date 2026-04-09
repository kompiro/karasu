# Deploy 図レイアウト — 同レイヤー内コンテナ順序の最適化（エッジ交差最小化）

- **日付**: 2026-04-09
- **ステータス**: 検討中
- **関連**:
  - [`docs/design/deploy-layout-wrap.md`](deploy-layout-wrap.md) — 階層 DAG レイアウトの設計（本ドキュメントの前提）
  - [Issue #395](https://github.com/kompiro/karasu/issues/395) — 本設計ドキュメントの起点
  - [Issue #396](https://github.com/kompiro/karasu/issues/396) — Layer 0 横展開（関連する将来課題）

## 背景・課題

`deploy-layout-wrap.md` で採用した階層 DAG レイアウト（Longest Path Layering）は、
各レイヤー内のコンテナを**挿入順**に左から右へ並べる。

この挿入順配置は、エッジが交差するケースを生み出しやすい。
例として、`examples/deploy/system.krs` の依存グラフを考える：

```
Layer 0:  [Storefront]
Layer 1:  [OrderAPI]
Layer 2:  [PaymentService, InventoryService, ReportingService]  ← 挿入順
Layer 3:  [LegacyERP]
```

Layer 1 → Layer 2 のエッジは以下の通り：

```
OrderAPI → PaymentService
OrderAPI → InventoryService
OrderAPI → ReportingService
```

Layer 2 が `[Payment, Inventory, Reporting]` の順であれば交差は発生しないが、
別の例（下図）のように順序が悪いと交差が生まれる。

```
Layer 1:  [A]    [B]    [C]
           │      │      │
Layer 2:  [X]    [Y]    [Z]   ← A→Z, B→Y, C→X の場合、3回交差
```

Layer 2 を `[Z, Y, X]` に並べ替えれば交差をゼロにできる。

## 制約・前提

- `assignLayers()` が返す `Map<containerId, layerNumber>` は変更しない
- `LayoutResult` 型（`layout.ts`）は変更しない
- SVG レンダラー・プレビュー UI 側の変更は不要
- 交差数の完全最小化（最適解）は NP 困難であるため、**ヒューリスティック**で近似する
- 各レイヤーのコンテナ数は実用上少ない（通常 2〜10 程度）ため、単純な O(n log n) 解で十分
- 前レイヤー（layer i-1）の配置が確定してから後レイヤー（layer i）を並べ替える **一方向パス** で実装する

## 検討した選択肢

### 案1: Barycenter ヒューリスティック（重心法）

各レイヤー `i` のコンテナ `C` に対して:

```
barycenter(C) = 前レイヤー(i-1)で C に隣接するコンテナの X 中心座標の平均
```

前レイヤーのどのコンテナとも隣接しない（前駆なし）コンテナは `Infinity` を割り当て、末尾に置く。

**メリット**
- 実装が単純（1 パス、O(n log n)）
- 実用的な品質：Sugiyama フレームワークの標準ステップであり、多くのグラフ描画ツールで採用
- 直感的：「つながっている相手の近くに移動する」

**デメリット**
- 最適解の保証なし（局所的な最適に留まることがある）
- 一方向パスのみのため、後レイヤーの影響を考慮できない

---

### 案2: Median ヒューリスティック

Barycenter の代わりに**中央値**を使う。

```
median(C) = 前レイヤー(i-1)で C に隣接するコンテナの X 中心座標の中央値
```

**メリット**
- 外れ値（少数の遠い隣接コンテナ）に対してより頑健
- Barycenter より理論的に交差数が少ないことが示されているケースがある

**デメリット**
- Barycenter との品質差は deploy 図の規模（コンテナ数）では誤差レベル
- 同数の中央値（偶数個の隣接）の扱いが複雑（左中央値か右中央値か）

---

### 案3: Sifting アルゴリズム

各コンテナを 1 つずつ「どの位置に置くと最も交差数が減るか」を計算し移動させる。
全コンテナに対して繰り返す。

**メリット**
- 交差最小化の質が Barycenter より高い

**デメリット**
- O(n²) 以上のコスト（コンテナ数 n）
- 実装が複雑（交差数カウンター、挿入位置探索）
- deploy 図の規模では過剰品質

---

### 案4: 多方向反復パス（双方向 Barycenter）

上→下パス（layer 0 → last）と下→上パス（last → 0）を交互に複数回適用する。
Sugiyama の標準実装では 1〜4 パス程度が一般的。

**メリット**
- 一方向パスより交差数を減らせる
- 前レイヤーだけでなく後レイヤーの影響も考慮できる

**デメリット**
- 実装が複雑（前後レイヤーの参照、複数回ループ）
- deploy 図の深さ（レイヤー数）は通常 3〜5 程度で、多方向の効果が小さい

---

## 比較

| 観点 | 案1 Barycenter | 案2 Median | 案3 Sifting | 案4 双方向 |
|---|---|---|---|---|
| 実装コスト | 小 | 小〜中 | 大 | 中 |
| 交差削減の質 | 良 | 良〜優 | 優 | 良〜優 |
| 計算量 | O(n log n) | O(n log n) | O(n²) | O(k·n log n) |
| 前駆なしコンテナの扱い | 末尾固定 | 末尾固定 | 柔軟 | 双方向で自然 |
| deploy 図の規模での実用性 | ◎ | ◎ | ○（過剰） | ○ |

## 現時点の方針

**案1（Barycenter ヒューリスティック）を採用する。**

deploy 図のコンテナ数は実用上少なく、多方向パスや Sifting の恩恵は限定的。
一方、Barycenter は「前の層とのつながりを近くに寄せる」という自然な動作であり、
コードの可読性・テスト容易性が高い。

将来的に品質向上が必要になった場合（#396 対応時など）、双方向パス（案4）に拡張できる。

### アルゴリズム設計

```
// 前提: assignLayers() によりコンテナが各レイヤーに割り当て済み
// sortedLayerNums: [0, 1, 2, ...] の昇順

containerCenterX = Map<containerId, number>  // 各コンテナの X 中心座標（配置後に記録）

predecessors = Map<containerId, containerId[]>  // 各コンテナへの入力エッジの from 側
for each ghostEdge (from → to):
  predecessors[to].push(from)

for i = 0 to len(sortedLayerNums) - 1:
  layerGroups = layerBuckets[sortedLayerNums[i]]

  if i > 0:
    // Barycenter でソート
    for each group in layerGroups:
      preds = predecessors[group.id] ∩ (前レイヤーのコンテナ)
      if preds is empty:
        barycenter[group.id] = Infinity  // 末尾へ
      else:
        barycenter[group.id] = mean(containerCenterX[p] for p in preds)

    layerGroups = sort(layerGroups, key = barycenter[id])

  // 配置
  currentX = OUTER_PADDING
  for each group in layerGroups:
    containerW = measureContainerWidth(...)
    place group at (currentX, currentY)
    containerCenterX[group.id] = currentX + containerW / 2
    currentX += containerW + CONTAINER_GAP
```

### 実装上の注意点

- **前駆なしコンテナ**: `Infinity` を割り当てて末尾に置く。同じ `Infinity` を持つコンテナ同士は挿入順を保持（`sort` の安定性を活用）
- **前レイヤーに属するかどうかの判定**: `predecessors[C]` には全レイヤーの前駆が入っているが、`containerCenterX` は配置済みコンテナのみ持つため、自然に「前レイヤーの前駆のみ」を参照できる
- **同レイヤーの前駆（サイクル由来）**: `containerCenterX` に未登録のため自動的にスキップされ、Barycenter 計算に含まれない

## 未解決の問い

- 双方向パス（案4）への拡張はいつ必要になるか → #396（layer 0 横展開）対応時に再評価
- 前駆だけでなく後継（layer i+1）も考慮したい場合のアーキテクチャ → 双方向パス設計時に検討
