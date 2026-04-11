# Architecture Diagram レイアウト — Barycenter + Sub-row wrap の適用

- **日付**: 2026-04-11
- **ステータス**: 完了（スコープ縮小）
- **関連**:
  - [`docs/design/deploy-layout-wrap.md`](deploy-layout-wrap.md) — deploy 図への Longest Path Layering 導入（前提知識）
  - [`docs/design/barycenter-layer-ordering.md`](barycenter-layer-ordering.md) — deploy 図への Barycenter 導入（前提知識）
  - [Issue #458](https://github.com/kompiro/karasu/issues/458) — 本ドキュメントの起点

## 背景・課題

deploy 図のレイアウトパイプラインは #392 → #395 → #396 を経て整備された：

1. **Longest Path Layering** — BFS によるレイヤー割り当て
2. **Barycenter ヒューリスティック** — レイヤー内順序をエッジ交差が少なくなるよう並べ替え
3. **Sub-row wrap** — レイヤー幅が `MAX_LAYER_WIDTH(1200px)` を超えたら折り返し

一方、architecture diagram（`layout.ts`）は同じ「層ごとに横に並べる」構造を持ちながら、
これらの改善を受けていない：

- **Barycenter なし** → ノードが挿入順に並ぶためエッジ交差が生じやすい
- **Sub-row wrap なし** → 同一レイヤーにノードが多いと図が 2000px 以上に広がる

deploy 図と同様の問題（#392 で報告された横展開・見づらさ）が architecture diagram でも起きうる。

### 現状のレイアウトループ（抜粋）

```ts
// layout.ts — 現状
for (const layerIdx of sortedLayers) {
  const nodesInLayer = nodesByLayer.get(layerIdx)!;
  let xOffset = NODE_GAP;
  for (const nid of nodesInLayer) {
    // 挿入順にそのまま配置（barycenter なし）
    const y = layerIdx * (dims.height + LAYER_GAP) + NODE_GAP;
    layoutNodes.set(nid, { ..., x: xOffset, y });
    xOffset += dims.width + NODE_GAP;  // wrap なし
  }
}
// 最後に全レイヤーをまとめてセンタリング
for (const layerIdx of sortedLayers) {
  const offset = Math.max(0, (childMaxWidth - layerWidth) / 2);
  // ...
}
```

## 制約・前提

- `LayoutResult` 型（`layout.ts`）は変更しない
- SVG レンダラー（`svg-renderer.ts`）はレイアウト座標をそのまま使う
- プレビュー UI は `width` / `height` が正しければ自動スケールする
- edge routing（`computeEdgePoints`）は座標を参照するため、レイアウト変更と整合が必要

## 検討した選択肢

### A. センタリングの扱い

現状の architecture diagram はレイヤーをセンタリング（水平中央揃え）する。
deploy 図は左揃えのみ（センタリングなし）。Sub-row wrap 導入時にどちらに揃えるか。

#### 案A-1: Sub-row ごとにセンタリングを維持する

折り返し後の各 sub-row を `childMaxWidth` 基準で個別にセンタリングする。

```
Layer 0 (sub-row 0):   [A] [B] [C] [D]   ← センタリング
Layer 0 (sub-row 1):        [E] [F]       ← 同 childMaxWidth 基準でセンタリング
Layer 1 (sub-row 0):      [G] [H]         ← センタリング
```

**メリット**
- 既存の見た目（中央揃え）を維持する
- 少数ノードのレイヤーが左に偏らず読みやすい

**デメリット**
- 折り返し行のノードが「なぜここに？」と見えることがある
- Sub-row を先に配置してから `childMaxWidth` が決まるため、２パス必要

---

#### 案A-2: 左揃えに統一する（deploy 図と完全に揃える）

センタリングを廃止し、`OUTER_PADDING` からの左揃えにする。

**メリット**
- deploy 図と完全に同じ見た目になる
- 実装が単純（センタリングパス不要）

**デメリット**
- **既存の見た目が大きく変わる**（特に少数ノードのレイヤーが左寄りになる）
- ユーザーが慣れた中央揃えから外れる

---

### B. `computeEdgePoints` の方向検出

現状の `computeEdgePoints` は `layers.get(from) === layers.get(to)` でレイヤー番号を比較して横向きエッジを検出する。
Sub-row wrap 後は、同一レイヤー番号でも異なる sub-row（異なる y 座標）にノードが入る。
このとき横向きルーティングを適用すると方向が逆になる。

**前提: 関数の呼び出し元は2か所**

| 呼び出し元 | y の決め方 | 同レイヤーノードの y |
|---|---|---|
| `layout()` (新実装) | `subRowY`（全 sub-row ノード共通）| 常に同一 |
| `layoutMultipleSystems()` (旧実装のまま) | `layerIdx * (dims.height + LAYER_GAP) + NODE_GAP` | ノード高さが異なれば異なる |

`layoutMultipleSystems` のケースでは、同レイヤー内でノード高さが異なると（説明有無・チーム有無など）y がずれる。
ただし、同レイヤーへのエッジ（同じトポロジカル順位間のエッジ）は実際の KRS ファイルでは極めて稀。

#### 案B-1: y 座標比較に置き換える

```ts
// before: layers パラメータを使う
if (fromLayer === toLayer) { /* 横向き */ }
else if (fromLayer > toLayer) { /* 逆向き */ }

// after: y 座標のみで判定（layers パラメータを削除）
if (fromNode.y === toNode.y) { /* 同一行 → 横向き */ }
else if (fromNode.y > toNode.y) { /* from が下 → 逆向き */ }
```

**メリット**
- `layers` パラメータを削除でき API がシンプルになる
- Sub-row を跨ぐエッジが正しくルーティングされる
- y は整数演算で求まるため浮動小数点誤差なし

**デメリット**
- `layoutMultipleSystems`（旧実装のまま）において、同レイヤー・異高さノード間のエッジが
  横向きではなく縦向きにルーティングされる可能性がある
  - 発生条件：同レイヤー間エッジ かつ 高さが異なるノード（稀）
  - `layoutMultipleSystems` を後続で更新すれば解消される

#### 案B-2: `layers` 比較に y 判定を追加する

```ts
// layers パラメータを維持し、y 一致も必要条件に加える
if (fromLayer === toLayer && fromNode.y === toNode.y) { /* 横向き */ }
else if (fromLayer > toLayer || (fromLayer === toLayer && fromNode.y > toNode.y)) { /* 逆向き */ }
```

**メリット**
- `computeEdgePoints` のシグネチャが変わらない（`layoutMultipleSystems` の呼び出し元変更不要）
- 同レイヤー・異 y ノード間エッジの挙動が B-1 と同じになり、退行なし

**デメリット**
- 条件が複雑になり可読性が落ちる
- `layers` パラメータが実質的に `layoutMultipleSystems` のためだけに残る
  （`layout()` の新実装では y 比較のみで完全に正確なため不要）
- B-1 と実際の挙動は同一：`layoutMultipleSystems` の同レイヤー・異 y ケースは
  **B-1 も B-2 も同じ結果**（y が異なれば両案とも横向き判定にならない）

#### 両案の挙動比較

| ケース | B-1 | B-2 |
|---|---|---|
| `layout()` — 同 sub-row（同 y） | 横向き ✓ | 横向き ✓ |
| `layout()` — 異 sub-row（異 y、同レイヤー） | 縦向き ✓ | 縦向き ✓ |
| `layoutMultipleSystems` — 同レイヤー・同高さ（同 y） | 横向き ✓ | 横向き ✓ |
| `layoutMultipleSystems` — 同レイヤー・異高さ（異 y） | 縦向き △ | 縦向き △ |

△ = 退行ではなく既存の pre-existing issue（同レイヤーエッジ自体が稀）

**結論: B-1 と B-2 の実挙動は同一。違いは `layers` パラメータを残すかどうかのみ。**

---

### C. 共通ユーティリティの抽出

`sortLayerByBarycenter` (`deploy-layout.ts`) と、architecture 側で必要な `sortNodesByBarycenter` は
ロジックが同一（型パラメータが `{ id: string }` のジェネリック関数）。

#### 案C-1: 共通モジュールに抽出する（`layer-layout-logics.ts`）

```ts
// packages/core/src/renderer/layer-layout-logics.ts
export function sortByBarycenter<T extends { id: string }>(
  items: T[],
  predecessorsMap: Map<string, string[]>,
  centerX: Map<string, number>,
): T[] { ... }
```

**メリット**
- DRY。両ファイルが共通実装を使う
- 将来の改善が一か所で済む

**デメリット**
- 新規ファイルが増える
- deploy-layout.ts の既存関数を変更する必要がある

#### 案C-2: layout.ts に独立して実装する

`sortNodesByBarycenter` を layout.ts 内にコピーし、関数名とコメントで「deploy-layout.ts の sortLayerByBarycenter と同等」と明記する。

**メリット**
- 変更範囲が layout.ts のみで済む
- deploy-layout.ts への影響なし

**デメリット**
- 実質的なコードの重複

---

### D. `layoutMultipleSystems` の対応範囲

`layoutMultipleSystems` も同じレイヤー配置パターンを持つが、
各システムのノード数は少なく wrap が必要になるケースは稀。

#### 案D-1: 同様に barycenter + wrap を適用する

スコープを広げて `layoutMultipleSystems` も対応する。

**メリット**
- 一貫性が高まる

**デメリット**
- 変更量が増える
- テストも増える

#### 案D-2: 今回は対象外とし、sub-issue として登録する

main `layout()` のみ対応し、`layoutMultipleSystems` は後続 Issue とする。

**メリット**
- スコープが明確
- PR が小さくなりレビューしやすい

---

## 比較

| 観点 | 案 | 推奨 |
|---|---|---|
| センタリング | A-1（維持）vs A-2（左揃え） | **A-2** — deploy 図と統一する |
| edge routing | B-1（y 座標比較）vs B-2（追加条件） | **B-1** — `layers` の役割を y 座標で正確に引き継ぐ |
| 共通ユーティリティ | C-1（抽出）vs C-2（独立実装） | **C-1** — `layer-layout-logics.ts` に抽出し DRY にする |
| layoutMultipleSystems | D-1（対応）vs D-2（除外） | **D-2** — 今回は main `layout()` のみ、後続 Issue に委ねる |

## 実装後の判断（スコープ縮小）

設計時は `layout.ts` の全ビューに barycenter + sub-row wrap を適用する方針（A-2）を採用した。
しかし実装・動作確認の結果、`layout.ts` が扱う全ビューがツリー構造であることが判明した：

| ビューレベル | 表示内容 | 構造 |
|---|---|---|
| system | user + service | ツリー（依存グラフ） |
| service | domain | ツリー（ドメイン分解） |
| domain | usecase + resource | 呼び出し関係のツリー |

これらは deploy 図のような「横に並ぶコンテナ群」とは異なる。
センタリングによってツリー構造が視覚的に読みやすくなっており、
左揃えに変更すると見た目が著しく悪化する。

### 結論

**`layout.ts` への barycenter + sub-row wrap 適用は行わない。**
センタリングレイアウトを維持する。

#### 実施したこと

- **C-1 のみ実施**: `sortByBarycenter` を `layer-layout-logics.ts` に抽出し、`deploy-layout.ts` で利用
  - `deploy-layout.ts` 内の重複コード（`sortLayerByBarycenter`）を削除
  - 将来 `layout.ts` 以外のレイアウトエンジンでも再利用可能な状態にした

#### 実施しなかったこと

- A-2（左揃え統一）: 採用せず。architecture diagram はセンタリングを維持
- B-1（y 座標比較）: 採用せず。`computeEdgePoints` は `layers` パラメータを維持
- layout.ts への barycenter 順序付けおよび sub-row wrap: 採用せず

## 決定事項まとめ

| # | 論点 | 当初の方針 | 最終決定 | 理由 |
|---|---|---|---|---|
| A | センタリング | **A-2** — 左揃え | **A-1 相当（維持）** | layout.ts の全ビューがツリー構造のため |
| B | `computeEdgePoints` 方向検出 | **B-1** — y 座標比較 | **採用せず** | layout.ts に sub-row wrap を入れないため不要 |
| C | 共通ユーティリティ | **C-1** — 抽出 | **C-1（実施）** | deploy-layout.ts の重複コードを削除 |
| D | `layoutMultipleSystems` スコープ | **D-2** — 除外 | **D-2（維持）** | そもそも layout.ts 本体も変更しないため |

## 将来の課題

- `layout.ts` のツリービューで横方向に要素が多くなった場合の対策は別途検討が必要
  （現状のセンタリングは維持しつつ、wrap だけを導入する案なども考えられる）
- `layoutMultipleSystems` への barycenter + sub-row wrap 適用は Issue #467 で追跡
