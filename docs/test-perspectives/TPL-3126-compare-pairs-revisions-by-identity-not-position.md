---
id: TPL-3126
title: "compare モードは before と after の要素を id で突き合わせる。配列の位置や「先頭」で突き合わせない"
status: active
date: 2026-10-13
applicable_to:
  - "2 つの revision（before / after）から作った同じ形の構造を、要素ごとに突き合わせて差分を取る処理"
  - "各 revision で「先頭の要素」「i 番目の要素」として選ばれた部分集合どうしを比べる処理。選び方が revision ごとに独立なので、選ばれた要素が同じものとは限らない"
known_consumers:
  - compare-mode
  - view-diff
discovered_from:
  - issue: "#3126"
  - root_cause_file: "packages/core/src/diff/view-diff.ts"
related_to:
  - TPL-219
  - TPL-1352
  - TPL-2756
topic: renderer
scope:
  packages:
    - core
---

# TPL-3126: compare モードは before と after の要素を id で突き合わせる。配列の位置や「先頭」で突き合わせない

## 観点

compare モードは before と after から同じ手順で構造を作り、要素ごとに突き合わせて `added` / `removed` / `changed` / `unchanged` を決める。突き合わせの前提は「比べている 2 つが同じものを指している」ことである。

この前提は、**各 revision の中で位置によって選んだ部分集合**を比べるときに黙って崩れる。ルートビューの `childNodes` は各 slice の `systems[0]` の子で、before と after でそれぞれ独立に決まる。先頭に system を 1 つ足すと、before の `childNodes` は `Shop` の子、after の `childNodes` は `Billing` の子になる。2 つを突き合わせると、変わっていない `Shop` の子が `removed`、`Billing` の子が `added` として、`Billing` の枠の中に描かれる。

判定条件は 1 つ。**突き合わせる 2 つの集合の対応を、要素の id で決めているか。** 「両方の先頭」「両方の i 番目」で決めているなら、revision 間で並びが変わったときに別のものを比べる。

## 想定される失敗モード

- 先頭の要素を足す・消す・並べ替えると、変わっていない要素が `added` と `removed` の組として描かれる。見えないのではなく、**誤った差分が見える**
- 誤った差分が別の要素の枠の中に描かれる（`Shop` の子が `Billing` の枠に入る）
- テストの fixture が先頭を変えない変更（子の追加・説明の変更）だけを使うと、柵が素通りする。#3126 の Issue 本文も先頭を変えない 4 通りしか挙げていなかった
- 部分集合の外にある要素（非先頭の system の子）は突き合わせ自体から漏れ、状態なしで描かれる

## チェックリスト

compare モードの突き合わせを書く・変えるときに確認する:

- [ ] 突き合わせる 2 つの集合が、各 revision で「位置」によって選ばれていないか（`[0]`、`slice(1)`、`find` の最初の一致、`primary` / `first` と名の付く値）。選ばれているなら、相手側は id で引き直す
- [ ] 片方の revision にしか無い要素（足した / 消した system）を、空の相手と突き合わせているか。位置で選んだ部分集合に入らないので漏れやすい
- [ ] fixture に「先頭の要素を足す」「先頭の要素を消す」を 1 件ずつ含めたか。子の変更だけの fixture では位置の突き合わせと id の突き合わせが同じ答えを出す
- [ ] 突き合わせの key が、区別に要る次元（system など）を含んでいるか（[TPL-1352](TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)）

## 既知の対処パターン

- **エッジ**: `diffSystemFrames`（ADR-2756）は `systemEdges` を system id で引き、片方にしか無いフレームは空の相手と diff する。
- **ノード**: `diffSystemViewSlices`（#3126）はフレームごとに同じ id の system の子を突き合わせる。先頭フレームは in-place 展開のために `childNodes` で表すが、before 側の相手は id で決める（`docs/design/root-diff-per-system-frame.md`）。

## 関連テスト

- `packages/core/src/renderer/multi-system-root-diff.test.ts`（先頭の system を足す / 消す fixture、片方にしか無い system、モデルを空にする場合を含む）
