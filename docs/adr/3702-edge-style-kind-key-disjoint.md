---
id: ADR-3702
title: 解決済み edge スタイルの kind 無しキーと kind 付きキーを重ならないようにする
status: accepted
date: 2026-11-09
topic: edges
related_to:
  - ADR-2714
  - ADR-3480
scope:
  packages: [core]
assumptions:
  - "symbol: packages/core/src/view/edge-key.ts :: quoteEdgeEndpoint"
  - "grep: packages/core/src/view/edge-key.ts :: \\\\\\\\#\\]"
  - "symbol: packages/core/src/resolver/style-resolver.ts :: edgeStyleKey"
  - "file: docs/acceptance/3702-edge-style-kind-key-disjoint.md"
  - "file: docs/test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md"
---

# ADR-3702: 解決済み edge スタイルの kind 無しキーと kind 付きキーを重ならないようにする

- **日付**: 2026-11-09
- **ステータス**: 決定済み・実装完了
- **関連**:
  - Issue: [#3702](https://github.com/kompiro/karasu/issues/3702)（#3481 のレビューで発見）
  - PR: [#3715](https://github.com/kompiro/karasu/pull/3715)（Design Doc）, [#3732](https://github.com/kompiro/karasu/pull/3732)（実装）
  - 後続 Issue: [#3731](https://github.com/kompiro/karasu/issues/3731)（`edge-routing-ports.ts` のコメントが「node id に `#` は入らない」と書いている）
  - 関連 ADR: [ADR-2714](./2714-deploy-container-id-injective.md)（`nodePathRefId` で区切りを含む segment を囲んだ前例）, [ADR-3480](./3480-edge-canonical-id-quoted-endpoints.md)（`.krs.style` に書く canonical id。内部キーとは別の規則）
  - 関連 TPL: [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)
  - AT: [3702-edge-style-kind-key-disjoint](../acceptance/3702-edge-style-kind-key-disjoint.md)

## 背景

解決済みスタイルの `styles.edges` は、1 つのマップに 2 つの形のキーを持つ。どちらも `edgeStyleKey` が書く。

- kind 付きキー `edgeKindKey(edge)`（`<pair>#<kind>`）: model の edge が自分のスタイルを引く
- kind 無しキー `edgeKey(edge)`（`<pair>`）: kind を持たない layout edge（delivers・owns・ghost・集約 edge）の fallback

`edgeKey` は `->`・`"`・`\` を含む端点だけを `.krs` の文字列リテラル形で囲んでいた（Design Doc `injective-node-path-keys.md` の案D）。`#` は囲まないので、`#sync` / `#async` で終わる端点を持つ edge の kind 無しキーが、別の edge の kind 付きキーと同じ文字列になった。`x -> "y#sync"` の kind 無しキーは `x->y#sync` で、`x -> y` の sync のキーと同じである。後に書いた方が残る。

`svg-renderer.ts` はこのマップの全キーから `edgeDirections` を作り、レイアウトは kind 無しキーで `direction` を引く。同じ衝突で `direction` も取り違えた。

main（f5ad4897）で、`x -> y` と `x -> "y#sync"` を持つ system を描いて測った結果（どの場合も診断は出ない）:

| model の順 | rule | `x -> y` | `x -> "y#sync"` |
| --- | --- | --- | --- |
| `x -> y` が先 | `edge#x->y { color: #00FF00; }` | 既定色 | 既定色 |
| `x -> y` が先 | `edge#x->"y#sync" { color: #00FF00; }` | 緑 | 緑 |
| `x -> "y#sync"` が先 | `edge#x->y { direction: up; }` | 上下が入れ替わる | 上下が入れ替わる |
| `x -> "y#sync"` が先 | `edge#x->"y#sync" { direction: up; }` | そのまま | そのまま |

2 つの形を混ぜるマップは `styles.edges` と `edgeDirections` の 2 つだけで、diff・dedup・バンドル・`implicitEdgeDetails`・`drawnEdgeKey` はどれも 1 つの形しか入れない。`edgeKey` は core の index から export されているが、core の外（app・vscode・cli・lsp・nest）に読み手も書き手も無く、SVG にも出ない。

## 決定

`edgeKey` は、`->`・`"`・`\` に加えて `#` を含む端点も `.krs` の文字列リテラル形で囲む（`quoteEdgeEndpoint` の正規表現を `/["\\#]/` にし、`->` の判定は残す）。`#` は `edgeKindKey` が足す区切りなので、kind 無しキーは `#sync` / `#async` で終わらなくなり、2 つの形はどのマップでも重ならない。

## 理由

- 案D の規則（区切りを含む端点を囲む）をそのまま当てはめるだけで済む。`ownsEdgeKey`（`org-view-diff.ts`）は区切り `#owns#` を含みうる team id を、`#`・`"`・`\` を含むときに囲んでおり、同じ規則の前例がある
- 変更は `quoteEdgeEndpoint` の 1 行で、`styles.edges` と `edgeDirections` が同時に直る。書き手と読み手は今のまま `edgeKey` / `edgeKindKey` を通るので、#3481 の揃え方も TPL-1352 の「ヘルパーを 1 つにする」も保てる
- 重なる性質をヘルパーの側で消すので、今は 1 つの形しか入れないマップが将来 2 つの形を混ぜても衝突しない
- 普通のモデル（端点に `#`・`->`・`"`・`\` を含まない）のキーは変わらない。実装 PR で examples 77 件の描画が変わらないことを `pnpm pr:shots` で確かめた
- 修正後は、model の順がどちらでも、上の 4 つの rule はそれぞれ書いた edge だけの色と上下を変える

## 影響

- `#` を含む端点を持つ edge のスタイルと `direction` が、書いた edge にだけ効く
- 公開の `edgeKey` の出力が、`#` を含む端点で引用符付きになる（`x->"y#sync"`）。diff・dedup・バンドルのキー文字列も同じく変わるが、どれも同じヘルパーで書いて引くので挙動は変わらない
- `.krs.style` に書く canonical id（ADR-3480 の `edgeBaseForm`）は対象外で、変わらない

## 却下した案

- **`styles.edges` のキーだけで `#` を囲む**: レイアウトの `direction` の引き当て 3 か所も別の関数に替える必要があり、#3481 で `edgeKey` に揃えた箇所を分けることになる。edge の組のキーの規則が 2 つになり、TPL-1352 に反する
- **kind 付きと kind 無しを別のマップに分ける**（`nodesByPath` と同じ形、#2934）: 構造としては最も堅いが、公開の型 `ResolvedStyles`・読み書き 5 か所・40 行以上のテストを変える。直るのは `styles.edges` と `edgeDirections` だけで、2 つの形が重なる性質は `edgeKey` / `edgeKindKey` に残る。`nodesByPath` を分けたのは素の id と path が別の識別の空間だからで、edge の 2 つの形は同じ `edgeKey` から作るので区切りを囲めば文字列のまま分けられる
- **`#sync` / `#async` で終わる端点だけを囲む**: 規則が `EdgeKind` の値の一覧に依存し、kind が増えると黙って壊れる
- **`edgeKindKey` の区切りを、`edgeKey` が既に囲む文字に替える**: 普通のモデルの kind 付きキーがすべて変わる（`A->B#sync` が別の文字列になる）
