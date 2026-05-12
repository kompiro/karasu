---
id: TPL-20260512-01
title: "値ごとに区別が必要な属性は、その値を格納するマップのキーに含める"
status: active
date: 2026-05-12
applicable_to:
  - "複数の独立した属性で識別される要素を、一部の属性だけを連結したキーで Map/Record に格納するコード"
  - "解決済みスタイル・レイアウト・診断メタデータを `id` 系の文字列キーで引くキャッシュ"
known_consumers:
  - style-resolver
discovered_from:
  - issue: "#1352"
  - root_cause_file: "packages/core/src/resolver/style-resolver.ts"
related_to:
  - TPL-20260510-20
topic: core-concepts
scope:
  packages:
    - core
---

# TPL-20260512-01: 値ごとに区別が必要な属性は、その値を格納するマップのキーに含める

## 観点

要素が複数の独立した属性で識別される（例: edge は `(from, to, kind)`、node は `(id, annotations)`）とき、
その要素ごとの解決結果を Map に格納するなら、**結果が異なりうる全ての属性をキーに含める**。
一部の属性だけ（`from->to` だけ、`id` だけ）でキーを作ると、残りの属性で区別されるべき複数の要素が
同じキーに衝突し、最後に書いた 1 件が他を上書きする（silent last-write-wins）。

「ある属性は表示の別ルートで区別されているから無視してよい」と考えがちだが、
解決結果（stroke style など）自体がその属性に依存しているなら、無視できない。

## 想定される失敗モード

- 同じ `(from, to)` を持つ parallel edge（sync `A -> B` と async `A --> B`）の両方が、後勝ちで同じ stroke style（破線）で描画される（#1352）。
- 同じ ID を持つ移行共存ノード（annotation 違い）が同じスタイルで描画される（nodeStyleKey が annotations を含むことで対処済み）。
- diff メタデータ・レイアウトヒントなど、`id` 系キーで引く他のキャッシュでも同型の衝突が起こりうる。

## チェックリスト

新しい「要素 → 解決結果」マップを追加する/既存のものを変更するとき:

- [ ] その要素を一意に識別する属性を列挙し、解決結果がどの属性に依存するか確認する（依存するものは全てキーに入れる）
- [ ] 同じ部分キーを共有する複数要素（parallel edge、同 ID の annotation 違いノード等）が存在しうるか考える
- [ ] 衝突しうるなら、合成キーのヘルパー関数を 1 つ用意し、書き込み側と参照側の両方で同じ関数を使う
- [ ] 合成キーで引けなかった場合のフォールバック（synthetic 要素用の bare key 等）の挙動を意図的に決める
- [ ] parallel / 共存ケースを 1 件、レンダリング結果の差（実線 vs 破線等）まで含めてテストする

## 既知の対処パターン

合成キーのヘルパー関数（`nodeStyleKey(id, annotations)`, `edgeStyleKey(from, to, kind)`）を `style-resolver.ts` に置き、
resolver（書き込み）と renderer（参照）の両方から import する。synthetic 要素（delivers / owns / ghost / 集約 domain edge）は
区別属性を持たないので bare key で登録し、参照側は「合成キー → bare key → default」の順にフォールバックする。

## 関連テスト

- `packages/core/src/renderer/svg-renderer.test.ts` — "keeps the sync edge solid when a parallel async edge exists between the same pair"
