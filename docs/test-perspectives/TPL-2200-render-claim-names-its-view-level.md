---
id: TPL-2200
title: "「描画される」と書くときは、どの view で描画されるかまで書き、両側をテストで固定する"
status: active
date: 2026-08-12
applicable_to:
  - "spec / guide に「〜として描画される」「〜に出る」と書くとき"
  - "view 抽出（extract）に「解決済みのものだけ昇格させる」ような昇格ゲートを足すとき"
  - "ある要素が描かれないことを assert するテストを書くとき"
known_consumers:
  - view-extract
  - docs-spec
  - docs-guide
discovered_from:
  - issue: "#2200"
  - root_cause_file: "docs/spec/syntax.md:128"
related_to:
  - TPL-2075
  - TPL-1223
  - TPL-1608
  - TPL-2133
topic: core-concepts
scope:
  packages:
    - core
---

# TPL-2200: 「描画される」と書くときは、どの view で描画されるかまで書き、両側をテストで固定する

## 観点

karasu の view は入れ子（system → service → domain → usecase）で、**同じ要素が
ある階層には出て別の階層には出ない**のが正常な設計である。したがって「描画される
／されない」は要素だけでは決まらず、**(要素, view level) の組**でしか決まらない。

散文が view level を省いて「描画される」とだけ書くと、その文はどの階層で読んでも
真になりうるので、**実装と突き合わせても矛盾が検出できない**。読者は自分が見ている
階層で解釈し、そこに無ければ「spec が嘘」と結論する。#2200 はこの形だった:
`docs/spec/syntax.md` は未割当 resource を「孤立ノードとして描画」と書き（level を
書かなかった）、実装は domain view で昇格させず usecase view では描いていた。3 つの
doc が同じ省略を伝播し、報告者・レビュアとも「一度も描かれない」と読んだ。

TPL-2075 は「**どこか 1 つでも**描画先があるか」（silent drop の不在）を見る観点で、
明示的に単一 view の出す/出さないには発火しない。本観点はその隙間、つまり
**描画先はあるが階層が spec の言う場所と違う**ケースを担当する。

## 想定される失敗モード

- spec が「orphan node として描画される」と書き、実装は 1 階層深いところで描く。
  どちらも「描画」なので突き合わせが成立せず、4 ヶ月以上気付かれない（#2200）
- 昇格ゲート（`if (!resolved) continue`）を足したとき、**落ちる側の view だけ**を
  assert するテストを書く。テスト名が `never reaches the canvas` のように
  level を含まない断定になり、テスト自身が誤った前提の運搬役になる（#2200 の
  `resource-shape-tags.test.ts`）
- doc 修正で「描画される」を「描画されない」に反転させ、level を書かないまま
  **新しい不一致**を作る（#2200 の当初案がこれだった）
- ja / en の doc が同じ省略を持ち、片方だけ直る

## チェックリスト

昇格ゲート・view filter を足すとき、および「描画される」と書くときに確認する:

- [ ] 散文の「描画される / されない」に **view level（system / service / domain / usecase / entity …）を明記**したか。level を書けないなら、それは自分がまだ調べていないという信号
- [ ] その要素を**全 view path で抽出**して、出る階層と出ない階層を実測したか（`extractView` を path 長ごとに回すだけでよい）
- [ ] 落ちる側だけでなく**出る側も assert** したか。片側だけのテストは、反対側が変わっても落ちない
- [ ] テスト名・コメントが level を含んでいるか（`never drawn` ではなく `not promoted to the domain view`）
- [ ] 同じ主張を持つ doc を grep で全部数えたか（en / ja、spec / guide / acceptance）。#2200 は 6 ファイルだった
- [ ] CRUD マトリクス・coverage など **SVG 以外の表示面**も確認したか。そこに出るなら「描画されない」は誤り

## 既知の対処パターン

- 昇格ゲートのテストを `describe` にまとめ、`is not promoted to <上位 view>` と
  `is drawn in <下位 view>` を**必ず対で置く**
- spec の文を「A では出る、B では出ない、その差は X が買うもの」という形にする。
  差の理由まで書くと、level を落とした要約に劣化しにくい
- 描画に関する doc 文言を変えるときは、先に `extractView` を全 path で回した実測を
  根拠として PR に貼る

## 派生元 spec

- `docs/spec/syntax.md` § [Infra layer (shared data stores)](../spec/syntax.md#infra-layer-shared-data-stores--rendered-on-the-system-view) — 未割当 `resource` の描画先
- `docs/spec/syntax.md` § [`entity` declaration](../spec/syntax.md#entity-declaration--conceptual-domain-entities) — 解決が domain view への昇格を買う

## 関連テスト

- `packages/core/src/integration/resource-shape-tags.test.ts` › `an unresolved bare resource is drawn in its usecase, not promoted to the domain`（昇格しない側と描かれる側を対で固定）
- `packages/e2e/tests/at-0049-resource-nodes-usecase-diagram.spec.ts` › `inline (unassigned) resources without dot-notation refs are not promoted to siblings`
