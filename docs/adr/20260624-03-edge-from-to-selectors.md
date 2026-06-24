---
id: ADR-20260624-03
title: "`.krs.style` に始点 / 終点エッジセレクタ `edge[from=<id>]` / `edge[to=<id>]` を追加"
status: accepted
date: 2026-06-24
topic: styling
related_to: [ADR-20260506-02, ADR-20260623-06]
assumptions:
  - "symbol: packages/core/src/parser/style-parser.ts :: computeSpecificity"
  - "symbol: packages/core/src/resolver/style-resolver.ts :: edgeSelectorMatches"
  - "grep: packages/core/src/types/style.ts :: edgeFrom"
  - "grep: packages/core/src/types/style.ts :: edgeTo"
  - "file: docs/spec/style.md"
scope:
  packages: [core]
---

# ADR-20260624-03: `.krs.style` に始点 / 終点エッジセレクタ `edge[from=<id>]` / `edge[to=<id>]` を追加

- **日付**: 2026-06-24
- **ステータス**: 決定済み
- **関連**:
  - Issue [#1755](https://github.com/kompiro/karasu/issues/1755)（本体）、[#1728](https://github.com/kompiro/karasu/issues/1728)（分離元 — system view の交差削減。配置で減らせない残り交差を color-by-source で補う動機）
  - 関連 ADR: [ADR-20260506-02](./20260506-02-edge-id-selector.md)（`edge#<id>` セレクタ — base id + canonical id。本決定の id 形・specificity 階段を踏襲）, [ADR-20260623-06](./20260623-06-system-view-infra-external-tier-split.md)（external-on-sides 配置で交差を削減する別アプローチ）
  - TPL: [TPL-20260624-03](../test-perspectives/TPL-20260624-03-edge-endpoint-selector-id-form.md)（端点セレクタはビューが格納する id 形で比較する）, [TPL-20260618-01](../test-perspectives/TPL-20260618-01-style-lookup-matches-layout-id-form.md)
  - AT: [AT-1755](../acceptance/1755-edge-from-to-selectors.md)
  - コード: `packages/core/src/{lexer/style-lexer,parser/style-parser,resolver/style-resolver}.ts`, `docs/spec/style.md`(+`.ja.md`)

## 背景

密な図では、あるハブの fan-out（9〜10 本）をたどりやすくする color-by-source
が有効だが、既存の `.krs.style` には「あるノードから出る / に入る全エッジ」を
1 ルールで指す手段が無かった。`edge` / `edge[tag]` / `edge#A->B` しか無いため、
ハブを 1 色にするには `edge#Hub->Target` をターゲットごとに列挙するしかなかった。

この affordance は #1728（system view の交差削減）の議論で必要性が確認されたが、
**配置の問題とは独立した styling 機能**なので #1755 として切り出した
（`docs/design/system-edge-crossing-reduction.md` で確定）。

## 決定

`.krs.style` に端点セレクタ `edge[from=<id>]`（始点が `<id>` の全エッジ）と
`edge[to=<id>]`（終点が `<id>` の全エッジ）を追加する。`<id>` はノード id で、
合成 usecase→resource エッジ向けに dot-notation 端点（`OrderDB.OrderTable`）も
取り、`edge.from` / `edge.to` と直接比較する。specificity は 11（`edge` 種別 1 +
端点述語 10）で `edge[tag]` と同格。

## 理由

- **既存 selector 文法への自然な拡張**: `[...]` ブラケットを再利用し、内側の
  identifier の後ろに `=` があれば端点述語、無ければ従来どおりタグ、と一意に
  分岐できる（タグは常に `=` を伴わないので衝突しない）。`edge#<id>` で確立した
  id 形（dot-notation 端点を 1 トークンに畳む lexer 規則）をそのまま使える。
- **specificity を `edge[tag]` と同格（11）に**: 端点述語はタグと同じ「分類軸での
  絞り込み」であり、`edge#<id>`（特定 1 本の surgical override, 101）より弱く、
  全エッジ `edge`（1）より強い、という直感に合う。`computeSpecificity` の lock
  テストで `reference-data.ts` の specificity 表と縛る。
- **端点 id を `edge.from` / `edge.to` と直接比較**: ビューが格納する端点 id 形
  （bare / dot-notation）と同じ形で比較するので、合成エッジも追加処理なしで当たる。
  id 形不一致による silent breakage の観点は TPL-20260624-03 に固定した。

## 却下した案

- **`edge#Hub->*` のようなワイルドカード base id**: `edge#<id>` の canonical id
  解決（base 衝突時の曖昧解決・author id）と混線し、ワイルドカードの意味論
  （`*` は from だけか to だけか両方か）が曖昧。属性述語 `[from=X]` のほうが
  始点 / 終点を明示でき、CSS 属性セレクタとの類推も効く。
- **`from` / `to` 以外の属性も汎用に許す**: 現時点で意味のある端点軸は始点 /
  終点のみ。未知属性は `unknown-edge-selector-attribute` エラーにして、将来
  軸を足すときに明示的に拡張する。
