---
id: ADR-2552
title: 同じ `realizes` ターゲットの繰り返しは 1 つの関係を宣言する（冪等）
status: accepted
date: 2026-09-04
topic: parser
related_to:
  - ADR-2167
  - ADR-1566
  - ADR-2161
scope:
  packages: [core]
assumptions:
  - "symbol: packages/core/src/parser/parser.ts :: parseRealizesList"
  - "grep: packages/core/src/view/deploy-view-extract.ts :: group.units.includes"
  - "grep: packages/core/src/renderer/deploy-layout.ts :: placeGroupBlock"
  - "file: docs/test-perspectives/TPL-2552-repeated-relation-is-idempotent-across-counting-and-keyed-consumers.md"
  - "file: docs/acceptance/2552-duplicate-realizes-target.md"
---

# ADR-2552: 同じ `realizes` ターゲットの繰り返しは 1 つの関係を宣言する（冪等）

- **日付**: 2026-09-04
- **ステータス**: 決定済み・実装完了
- **関連**:
  - Issue: [#2552](https://github.com/kompiro/karasu/issues/2552)（[#2542](https://github.com/kompiro/karasu/pull/2542) のコードレビュー中に発見）
  - PR: [#2700](https://github.com/kompiro/karasu/pull/2700)（Design Doc）, [#2711](https://github.com/kompiro/karasu/pull/2711)（実装。本 ADR に集約して Design Doc を削除）
  - 関連 ADR: [ADR-2167](2167-realizes-comma-list.md)（`realizes` を reference list と定め、カンマ形を sugar として受理）, [ADR-1566](1566-ownership-during-migration.md)（`duplicate-owner-assignment` の register）, [ADR-2161](2161-boundary-membership-1n.md)（boundary membership 1:N）
  - 関連 TPL: [TPL-2552](../test-perspectives/TPL-2552-repeated-relation-is-idempotent-across-counting-and-keyed-consumers.md)（本 Issue で新設）, [TPL-2542](../test-perspectives/TPL-2542-sugar-form-shares-one-ast-and-element-ranges.md), [TPL-1386](../test-perspectives/TPL-1386-diagnostic-register-fact-vs-style.md), [TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md)
  - コード: `packages/core/src/parser/parser.ts`, `packages/core/src/view/deploy-view-extract.ts`

## 背景

1 つの deploy unit が同じ `realizes` ターゲットを 2 回名指すと、そのターゲットの
container に unit が 2 回入っていた。行の繰り返し形とカンマ形の両方で起きる。

```krs
deploy Production {
  oci app {
    realizes OrderService
    realizes OrderService
  }
}
```

### 症状は Issue の記述とは異なる

Issue #2552 は「unit が 2 回描画され、SVG id が重複し、deep permalink の anchor が
曖昧になる」と記録しているが、実測ではそうならない。`placeGroupBlock` は unit の
**件数**でグリッドのセルを確保する一方、`layoutNodes` は配置を
`` `${containerId}::${unit.id}` `` を key とする `Map` に格納するので、2 件目の配置は
1 件目を上書きして消える。

出荷されるのは **2 unit 分に採寸された container の中に 1 unit だけが描かれた状態**、
つまり誰も描かれない空きセルである。main での実測は次のとおり。

| 入力 | viewBox | `data-node-id` の数 |
| --- | --- | --- |
| `realizes OrderService` | `0 0 320 260` | 1 |
| `realizes OrderService` を 2 行 | `0 0 320 360` | 1 |

id は重複せず、anchor も曖昧にならない。これはレイアウトの bug であり、anchor の
bug ではない。この読み替えは register を決める材料に影響する（「anchor が壊れている」
という緊急性は使えない）。

### 回帰ではない

行の繰り返し形は #409 以来の受理形で、カンマ形（ADR-2167）も同じ挙動をする。両形が
区別できないことは ADR-2167 が sugar として要求する性質なので、そこは正しい。

## 決定

**同じターゲットを 2 回名指すことは 1 つの関係の宣言であり、冪等に畳む。診断は出さない。**

冪等化は 2 段で閉じる。

1. **宣言側（`parseRealizesList`）** — 既に保持している path と同一のターゲットを
   push しない。繰り返しがカンマ列挙の中にあっても別の行にあっても同じく落とし、
   残るのは**最初の綴り**なので、記録される range は著者が最初に書いた位置を指す。
2. **view 側（`extractDeployView`）** — container の membership を冪等にする。
   ここの grouping key は ref が**解決した先のノード**なので、parser が畳めない
   2 つの ref（`realizes Api` と `realizes Shop.Api`）も 1 つの container に着く。

この 2 つは重複しているのではなく、扱う同一性が違う。parser は**綴りの同一性**を、
view は**解決先の同一性**を畳む。後者の 2 ref が AST に 2 件残るのは意図的で、
各 ref が `unresolved-realizes` / `realizes-target-ambiguous` のための自分の range を
持つ必要があるためである（TPL-2161 が守る「宣言された事実を落とさない」に沿う）。

`karasu fmt` は畳んだ結果を出すので、正準形は 1 行になる。

## 理由

### 宣言側で閉じると全消費者が一度に直る

Design Doc（#2700）は view 側だけで畳む案を採り、parser 側を却下していた。実装で
覆した。deploy view は `properties.realizes` の消費者の 1 つに過ぎず、他にも

- `NodeDetailPanel` の `metadata.realizes.join(", ")`（"OrderService, OrderService" と表示）
- `compile.ts` の `realizes: unit.properties.realizes?.map(...)`（重複した配列を出力）
- `karasu fmt`（重複行をそのまま再出力）

がある。view 側だけで畳むとこれらは壊れたままになる。宣言側で落とせば、件数を
数える消費側と id で畳む消費側の食い違い（TPL-2552 の観点そのもの）が発生源で消える。

### Design Doc が parser 案に付けた 3 つの反対理由の帰結

| 反対理由 | 実装での扱い |
| --- | --- |
| `fmt` が利用者の行を黙って削除する | 受け入れる。削除されるのは**重複を含むファイルだけ**で、それは修正対象の typo そのものである。ADR-2167 の「既存ドキュメントに churn が出ない」は正しい `.krs` についての約束であり、重複を含むファイルには当たらない |
| 綴り一致では `Shop.Api` と `Api` を畳めない | 正しい。だから view 側の解決先同一性と 2 段にした。parser 案の**代わり**ではなく**併用**である |
| in-flight の PR #2686 と衝突する | 解消済み。#2686 がマージされた後にその共通 grammar（`commaSeparatedValues` / `readReferencePathElement`）の上へ載せたので、grammar は変えずループ本体の 3 行で済んでいる |

### 診断を出さない理由

Issue は「黙って畳む」と「残して警告する」の 2 案を挙げ、後者に傾いて
`duplicate-owner-assignment`（ADR-1566）を前例に引いていた。しかしこの前例は
Issue が言うことを言っていない。karasu の規則は 2 段になっている。

| プロパティ | 同じ主体が二度宣言 | 別の主体が同じ相手を名指す |
| --- | --- | --- |
| `owns` | 黙る（`if (current === team.id) continue`） | `duplicate-owner-assignment`（info） |
| `contains` | 黙る（"re-listing the same boundary is idempotent rather than an extra entry"） | `duplicate-boundary-assignment`（info） |
| `facets` | 黙る（"saying it twice is not a mistake worth a diagnostic"） | 該当なし |
| `delivers` | 黙る（`deriveDeliversEdges` の `seen`） | 該当なし |
| `realizes` | **本 ADR: 黙る** | 既に正常系（`units[]`） |

`duplicate-owner-assignment` が発火するのは team が 2 つあるときだけで、同じ team の
繰り返しは黙って畳まれる。つまり `realizes A, A` の正確な対応物は、その診断が
**意図的に発火しない側**である。

info の診断が正当化されるのは、**畳むことで失われる事実がある**ときに限る。
2 つ目の team はオーナーにならないので、その事実は診断でしか観測できない。同一の
再宣言を畳んでも失われる事実は無いので、述べるべき事実が存在しない。TPL-1386 の
判定樹でも同じ結論になる。繰り返しはモデルについての観測ではなく、2 つ目の観測が
無いことである。

ADR-2167 が reference list を「順序も個数も関係の意味を変えない」と定義済みである
ことも同じ方向を指す。個数が意味を持たないなら、繰り返しは情報を持たない。

## 却下した案

- **view 側だけで畳む（Design Doc #2700 の採用案）** — deploy view は直るが、
  detail panel・`compile.ts`・`fmt` は重複を持ったままになる。上記のとおり実装で覆した。
- **parser 側だけで畳む** — 綴り一致しか見られないので、`realizes Api` と
  `realizes Shop.Api` が同じノードに解決される場合を取りこぼす。
- **残して info 診断を出す** — `owns` / `contains` / `facets` / `delivers` の同一相手
  繰り返しがすべて黙っている以上、`realizes` だけが喋るのは非対称を作り直すだけになる。
  述べるべき事実も無い。
- **残して warning 診断を出す**（`duplicate-resource-operation` に揃える） — warning は
  「直すべき」を含意する。ADR-1566 が `duplicate-owner-assignment` を error から info へ
  下げたのはその含意を避けるためで、より軽い事象に逆行する register を与えることになる。
  `duplicate-resource-operation` が warning である非対称は、本 Issue とは別に評価する。
- **修正しない** — 空きセルが残り続ける。

## 影響範囲

- 重複 `realizes` を含む既存 `.krs` は、container の高さが縮み（空きセルが消え）、
  `karasu fmt` が重複行を 1 行に畳む。重複を含まないファイルは一切変わらない。
- AST: `properties.realizes` の要素数が変わりうる。公開型の変更は無い。
- 解決先が同じで綴りが違う 2 ref は AST に 2 件残り続ける（診断の range のため）。
