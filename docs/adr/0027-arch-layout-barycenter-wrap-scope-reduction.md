# ADR-0027: Architecture レイアウトへの Barycenter + Sub-row wrap は適用せず共通ユーティリティのみ抽出

- **日付**: 2026-04-11
- **ステータス**: 決定済み
- **関連**: Issue #458, [deploy-layout-wrap.md](../design/deploy-layout-wrap.md), [barycenter-layer-ordering.md](../design/barycenter-layer-ordering.md)

## 背景

deploy 図のレイアウトパイプラインは #392 → #395 → #396 を経て、Longest Path Layering + Barycenter + Sub-row wrap の改善を受けた。一方 architecture diagram (`layout.ts`) は同じ「層ごとに横に並べる」構造を持ちながら未改善で、同様の横展開・見づらさが起きる懸念があった。当初は `layout.ts` にも deploy と同等の改善を適用する方針（左揃え統一、barycenter 順序付け、sub-row wrap）で設計を進めた。

## 決定

`layout.ts` への barycenter + sub-row wrap 適用は行わない。センタリングレイアウトを維持する。共通ユーティリティ `sortByBarycenter` のみ `layer-layout-logics.ts` に抽出し、`deploy-layout.ts` から利用する。

## 理由

- 実装・動作確認の結果、`layout.ts` が扱う全ビュー（system / service / domain）はツリー構造（依存グラフ、ドメイン分解、呼び出し関係）であり、deploy 図のような「横に並ぶコンテナ群」とは性質が異なる
- センタリングによってツリー構造が視覚的に読みやすくなっており、左揃えに変更すると見た目が著しく悪化することが確認された
- `computeEdgePoints` の方向検出を y 座標比較に切り替える必要も、sub-row wrap を導入しないのであれば不要
- 共通ユーティリティの抽出のみ実施すれば、`deploy-layout.ts` の重複コードを削除でき、将来 `layout.ts` 以外のレイアウトエンジンでも再利用可能になる

## 却下した案

### 左揃え統一（A-2）

deploy 図と完全に同じ見た目にする案。ツリービューの視認性が落ちるため不採用。

### `computeEdgePoints` の y 座標比較化（B-1）

`layers` パラメータを削除し y 座標のみで方向判定する案。sub-row wrap を入れないため不要。

### `layoutMultipleSystems` への同時適用（D-1）

スコープ拡大案。そもそも `layout.ts` 本体を変更しないため対象外。Issue #467 で追跡。

## 将来の課題

- `layout.ts` のツリービューで横方向に要素が多くなった場合の対策は別途検討が必要（センタリングを維持しつつ wrap のみ導入する案など）
- `layoutMultipleSystems` への barycenter + sub-row wrap 適用は Issue #467 で追跡
