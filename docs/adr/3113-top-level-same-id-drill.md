---
id: ADR-3113
title: system の段のない path は、トップレベルのノードとして先に解決する
status: accepted
date: 2026-10-12
topic: navigation
refines: [ADR-681]
related_to: [ADR-2917, ADR-110]
scope:
  packages:
    - core
    - app
assumptions:
  - "symbol: packages/core/src/view/view-extract.ts :: resolveContainerChain"
  - "symbol: packages/core/src/view/unassigned-system.ts :: isUnassignedSystem"
  - "symbol: packages/core/src/index.ts :: resolveContainerChain"
  - "symbol: packages/app/src/hooks/useBreadcrumbs.ts :: resolveContainerChain"
  - "symbol: packages/app/src/hooks/useChatSession/prompt.ts :: resolveContainerChain"
  - "file: packages/core/src/compile/top-level-same-id-drill.test.ts"
  - "file: docs/test-perspectives/TPL-3113-written-path-resolves-to-its-node.md"
---

# ADR-3113: system の段のない path は、トップレベルのノードとして先に解決する

- **日付**: 2026-10-12
- **ステータス**: 決定済み
- **関連**:
  - Issue #3113（起点）、設計 PR #3127（本 ADR に集約し削除: `docs/design/top-level-same-id-drill.md`）、実装 PR #3143
  - [ADR-681](681-top-level-service-rendering.md)（トップレベルの service / domain を `__unassigned__` 擬似 system で描く。本 ADR はその擬似 system の子を指す path の読み方を決める）、[ADR-2917](2917-multi-system-root-same-id-nodes.md)（同じ id のノードを両方描き、カードの `data-node-path` で click を引く）、[ADR-110](110-permanent-link.md)（permalink と `nodePathIndex`）
  - 同じ根の静的バンドル側: #2933（PR #3125）
  - TPL: [TPL-3113](../test-perspectives/TPL-3113-written-path-resolves-to-its-node.md)（実装 PR で起こした retrospective TPL）、[TPL-1160](../test-perspectives/TPL-1160-top-level-orphans.md)、[TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)、[TPL-1827](../test-perspectives/TPL-1827-deep-link-anchor-cross-surface-parity.md)、[TPL-2920](../test-perspectives/TPL-2920-duplicate-element-id-on-one-canvas-names-its-landing.md)、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)、[TPL-2756](../test-perspectives/TPL-2756-downstream-consumes-what-upstream-assembled.md)
  - AT: `docs/acceptance/3113-top-level-same-id-drill.md`
  - コード: `packages/core/src/view/view-extract.ts`（`resolveContainerChain`）、`packages/core/src/view/unassigned-system.ts`（`isUnassignedSystem`）、`packages/app/src/hooks/useBreadcrumbs.ts`、`packages/app/src/hooks/useChatSession/prompt.ts`（`detectDrillDownLevel`）

## 背景

トップレベル（system の外）のノードが、ある system の子と同じ id を持つと、app でそのトップレベルのノードに入れなかった。

```krs
system Shop {
  service Api { domain Orders { usecase Place {} } }
}
service Api { domain Parked { usecase P {} } }
```

- `#krs-system-Parked` は `nodePathIndex.get("Parked")` = `["Api", "Parked"]` に解決され、空のビューになった。
- ルートの Unassigned 枠の `Api` カードは `data-node-path="Api"` を持ち、click すると `Shop.Api` の中身（`Orders`）が開いた。診断は出ず、見た目には正しいビューに見える。

原因は path の読み手にあった。path を書く側は 3 か所あり、どれも「system の段を省くのはトップレベルのノードだけ」でそろっている。

| 書き手 | トップレベルのノード | 実 system の子 |
| --- | --- | --- |
| `buildNodePathIndex`（permalink・`nodeMetadata.viewPath`） | `["Api", "Parked"]` | `["Shop", "Api", "Orders"]` |
| ルートのカード `data-node-path` と `nodeMetadataByPath` | `Api` | `Shop.Api` |
| drill 先のカード `data-node-path` | `__unassigned__.Api.Parked` | `Shop.Api.Orders` |

読み手は 3 つあり、どれもこの約束を読んでいなかった。

- `resolveContainerChain`（`extractView` / `extractEntityView`）は、先頭が system id でない path を「先頭の id を子に持つ最初の system」から歩き、歩けなくてもほかの候補を試さなかった。擬似 system は実 system より後ろに並ぶので、id が衝突するとトップレベル側が必ず負ける。
- app の `useBreadcrumbs` は `systems[0]` を置いて先頭の段を読み飛ばし、`detectDrillDownLevel` は `"system"` を返した。こちらは id が衝突しなくても、system の段のない path でトップレベルのノードを読めない（パンくずが実 system の名前だけになる）。設計 PR のレビューで見つかった。

## 決定

**system の段のない path は、まずトップレベルのノードとして歩き、歩けなければ実 system の子として歩く。読み手はこの 1 つの関数に寄せる。**

1. `resolveContainerChain` は、先頭が system id でない path を次の順で歩き、path の最後まで歩けた最初の候補を返す。
   1. `__unassigned__` 擬似 system（`systems` に含まれるとき）
   2. 別引数で渡されたトップレベルの service / domain（擬似 system を合成しない呼び出し。drawio exporter の形）。chain の先頭には `systems[0]` を置く
   3. 先頭の id を子に持つ実 system（宣言順）
2. 先頭が system id の path は今までどおりその system から歩く。歩けなければ、2 段目を別引数のトップレベルのノードとして歩く（擬似 system を持たない呼び出しは、トップレベルのノードを最初の system の枠に描くため。旧実装の挙動を保つ）。
3. `resolveContainerChain` と結果型 `ResolvedContainerChain` を core から export し、app の `useBreadcrumbs` と `detectDrillDownLevel` はそれを呼ぶ。`viewPath[0]` を自前で読まない。
   - パンくずは解決した chain の各段を項目にし、各項目の `navigatePath` は入力 path の接頭辞にする（system の段のない入力は段のないまま）。トップレベルのノードのパンくずは、入口によらず `Unassigned > …` になる。
   - モデルから消えた段を含む path は、解決できる最長の接頭辞までを出す。
4. 擬似 system の判定は `isUnassignedSystem`（`unassigned-system.ts`）で行い、`"__unassigned__"` を読み手に直書きしない。
5. `nodePathIndex` の値、permalink の文法、カードの `data-node-path` の形は変えない。

### 柵

- `packages/core/src/compile/top-level-same-id-drill.test.ts`: permalink の path と、ルート・drill 先の各カードの `data-node-path` / `nodeMetadataByPath` の `viewPath` を compile に戻し、そのノードの子が描かれる（round-trip）。旧実装ではトップレベル側の 3 件が落ちる。
- `packages/core/src/view/top-level-same-id-path.test.ts`: 候補の順、system id で始まる path が変わらないこと、entity ビュー、擬似 system を持たない呼び出し。
- `packages/core/src/renderer/static-bundle-same-id.test.ts`: 静的バンドルと SPA の比較（TPL-1827）に、トップレベルと system の子が id を共有するモデルを含める。#2933 の時点では本件のために外していた。
- app: `useBreadcrumbs.test.ts`、`useChatSession.test.ts`。e2e: `at-3113-top-level-same-id-drill.spec.ts`（click・permalink・パンくず）。

## 理由

- **ずれていたのは読み手だけだった。** 書き手 3 か所はすでに同じ約束で書いているので、読み手をそれに合わせれば、permalink・ルートの click・drill 先の click が同じノードに着く。
- **省略していない path は変わらない。** system id で始まる path は今までどおりで、system の段を省いて実 system の子を引く呼び出し（`["Api", "Orders"]`）も、トップレベルで歩けない限り同じ結果を返す。
- **読み手を 1 つにすると、次の書き手の変更でずれない。** 並行する読み手を別々に直すと、どれか 1 つが取り残される（TPL-219、TPL-2756）。設計の初版は core だけを直す計画で、レビューで app の 2 つが見つかった。

## 却下した案

### トップレベルのノードの path に、曖昧にならない段を付ける

`nodePathIndex` とルートのカードで、トップレベルのノードの path に `__unassigned__` を付ける。path だけで所属が決まるが、合成した id が `nodePathIndex` と permalink の解決先に出る。ADR-681 は擬似 system を描画の枠として導入しており、モデルの path の一部にはしていない。`nodePathIndex` を読む消費側（#2933 の canonical 判定、`compile-diff`、`nodeMetadata.viewPath`）と permalink の spec も直すことになり、#2933 が決めた「擬似 system の段を外して比べる」と逆向きになる。古い形の path を読むため、読み手の分岐も残る。

### 歩けなかったときだけ、ほかの候補を試す

今の順序（実 system が先）を保ち、歩けなかったときだけトップレベルを試す。今 実 system に着く呼び出しは 1 つも変わらないが、ルートの click の症状が直らない。`["Api"]` は `Shop` でも歩けてしまい、フォールバックが発火しない。

## 影響

- 既存ユーザー: トップレベルのノードと実 system の子が同じ id を持つモデルで、トップレベル側の drill と permalink が正しいノードに着く。id が衝突しないモデルでも、トップレベルのノードをルートの click や permalink で開いたときのパンくずが `Unassigned > …` になる（以前は実 system の名前だけ）。描かれるビューは変わらない。
- `docs/spec/permalink.md`（と `.ja`）の SPA の行に、解決の向きを 1 文足した。
- 決めなかったこと:
  - **カードの `data-node-path` の形をそろえるか**（ルートは擬似 system の段を落とし、drill 先は残す）。本件の後はどちらの形でも同じノードに着くので、表示上の都合だけで決められる。
  - **トップレベルのノードの id が system id と同じ場合**（`system Api` とトップレベルの `service Api`）。先頭が system id に一致するので system として読み、トップレベルの `Api` には入れない。候補の順では直らず、path の形か id の検証で扱う問いとして残す。
  - **トップレベルに同じ id のノードが 2 つある場合**（トップレベルの `service Api` と `domain Api`）。擬似 system の中で最初に歩けたものに着く。擬似 system の内側の重複で、本件とは別の問題。
  - VS Code のパンくずは path の id をそのままラベルにするので、drill 先の Unassigned の path では `__unassigned__` が見える。着くノードは正しく、表示だけの既存の問題。
