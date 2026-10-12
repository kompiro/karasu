---
id: TPL-3113
title: "ノードを名指す path を書く側と、その path を解決する側は、同じノードに着地する"
status: active
date: 2026-10-12
applicable_to:
  - "ノードの path を書き出す処理（`nodePathIndex`、カードの `data-node-path`、`nodeMetadata.viewPath`、静的バンドルの walk）を作る・触るとき"
  - "path を受け取ってノードに解決する処理（`resolveContainerChain`、パンくず、drill レベルの判定、hash の解決）を作る・触るとき"
  - "path の形に省略（system の段・擬似 system の段・in-place 展開の親）を入れる・変えるとき"
known_consumers:
  - view-extract
  - compile-node-metadata
  - app-breadcrumbs
  - chat-drill-level
  - history-navigation
discovered_from:
  - issue: "#3113"
  - issue: "#2933"
  - root_cause_file: "packages/core/src/view/view-extract.ts"
  - root_cause_file: "packages/app/src/hooks/useBreadcrumbs.ts"
related_to:
  - TPL-1352
  - TPL-2920
  - TPL-219
  - TPL-2756
  - TPL-1160
topic: navigation
scope:
  packages:
    - core
    - app
    - e2e
---

# TPL-3113: ノードを名指す path を書く側と、その path を解決する側は、同じノードに着地する

## 観点

karasu の drill と permalink は、ノードを **path** で運ぶ。path を書く側と読む側は別々のコードで、
間にある約束は path の形だけである。

- 書く側: `nodePathIndex`（permalink の解決先と `nodeMetadata.viewPath`）、ルートと drill 先の
  カードの `data-node-path`、`nodeMetadataByPath`、静的バンドルの walk
- 読む側: `resolveContainerChain`（`extractView` / `extractEntityView`）、app のパンくず、
  chat に渡す drill レベルの判定

path の形には**省略**がある。トップレベル（Unassigned）のノードは system の段を持たず
（`["Api", "Parked"]`）、ルートのカードは擬似 system の段を落とし、drill 先のカードは残す。
省略した path は 2 通り以上に読める。書く側は「system の段が無ければトップレベル」のつもりで
書いても、読む側が「先頭の id を子に持つ最初の system」と読めば、別のノードに着く。

判定条件は 1 つ。**書く側が出す path を、読む側に通して、書いたノードに戻るか。**

## 想定される失敗モード

- 省略した path が、読む側で**別のノード**に着く。診断は出ず、描かれるビューは正しく
  見える（#3113: ルートの Unassigned 枠の `Api` を click すると `Shop.Api` の中身が開く）
- 省略した path を読む側が歩ききれず、**空のビュー**になる（#3113: `#krs-system-Parked` が
  `["Api", "Parked"]` を `Shop` で歩いて失敗する）
- 読む側が複数あり、1 つだけ直して残りがずれたまま残る。ビューは正しいノードを描くのに、
  パンくずや chat のレベルが別のノードを語る（#3113 の設計レビューで、`useBreadcrumbs` と
  `detectDrillDownLevel` が `viewPath[0]` を自前で読んでいた）
- 同じノードに入口ごとに別の path が届き（click は `__unassigned__.Api.Parked`、permalink は
  `["Api", "Parked"]`）、読む側がその片方しか正しく読まない。入口によって結果が変わる
- id が衝突しないモデルでは、どの読み方でも同じノードに着くので、テストが通る。
  衝突するモデルを fixture にしたときだけ出る

## チェックリスト

path を書く処理か読む処理を作る / 触るとき:

- [ ] その path を**読む側をすべて列挙**したか（`viewPath[0]` や `path[0]` を grep する）。
      読む側が 2 つ以上あるなら、1 つの関数に寄せたか（TPL-219、TPL-2756）
- [ ] path の省略（system の段・擬似 system の段）があるなら、省略した path が**どのノードを
      指すか**を 1 文で言えるか。読む側はその 1 文どおりに候補の順を決めているか
- [ ] 書く側の出力をそのまま読む側に通す **round-trip テスト**があるか。fixture は
      トップレベルのノードと system の子が**同じ id** を持つモデルか（衝突しないモデルでは
      読み違いが表に出ない）
- [ ] 入口（ルートの click、drill 先の click、permalink、パンくず）ごとに届く path の形を
      並べ、どれも同じノードに着くことを確かめたか
- [ ] 読む側の候補を変えたとき、省略していない path（system id で始まる path）の結果が
      変わらないことを確かめたか

## 既知の対処パターン

- **書く側の約束に読む側を合わせ、読む側を 1 つにする**（#3113、[ADR-3113](../adr/3113-top-level-same-id-drill.md)）。`resolveContainerChain` は system の段の無い path を
  まずトップレベルとして歩き、歩けなければ実 system で歩く。app のパンくずと chat の
  drill レベル判定は core の `resolveContainerChain` を呼ぶ
- **比べる側は省略をそろえてから比べる**（#2933）。静的バンドルの canonical 判定は
  `withoutUnassignedSegment` で擬似 system の段を外し、`nodePathIndex` の形と比べる

## 関連テスト

- `packages/core/src/compile/top-level-same-id-drill.test.ts` › a top-level node sharing its id
  with a system's child (#3113)（permalink の path と、ルート・drill 先の各カードの
  `data-node-path` / `nodeMetadataByPath` の `viewPath` を compile に戻し、そのノードの子が
  描かれる round-trip）
- `packages/core/src/view/top-level-same-id-path.test.ts` › resolveContainerChain: a path with
  no system segment (#3113)（候補の順、system id で始まる path が変わらないこと、entity ビュー、
  擬似 system を持たない呼び出し）
- `packages/app/src/hooks/useBreadcrumbs.test.ts` › a top-level node sharing its id with a
  system's child (#3113)（パンくずが入口によらず同じラベル列になる）

## 派生元 spec

- [`docs/spec/permalink.md`](../spec/permalink.md)「nest/app SPA」行（system の段のない path は
  Unassigned の枠の下で先に解決する）
