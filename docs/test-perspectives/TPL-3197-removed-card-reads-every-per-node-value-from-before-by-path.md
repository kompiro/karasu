---
id: TPL-3197
title: "compare モードで削除されたカードを描くのに引く per-node の値は、すべて before 側から自分の path で補う"
status: active
date: 2026-10-17
applicable_to:
  - "after の model から作った index・style を引いて、before にしか無い要素（removed）も同じ描画で描く処理"
  - "per-node の値を path と bare id の 2 段で引き、path に無ければ bare id にフォールバックする描画"
known_consumers:
  - compare-mode
  - compile-system-diff
discovered_from:
  - issue: "#3197"
  - root_cause_file: "packages/core/src/compile/compile-diff.ts :: compileSystemDiff"
related_to:
  - TPL-3126
  - TPL-1886
  - TPL-1583
topic: renderer
scope:
  packages:
    - core
---

# TPL-3197: compare モードで削除されたカードを描くのに引く per-node の値は、すべて before 側から自分の path で補う

## 観点

compare モードは after の model から index と style を作り、before にしか無い要素（`removed`）も同じ描画で描く。削除されたカードは after に無いので、after から作った path キーの map には入っていない。描画が path に無ければ bare id へフォールバックする作りだと、**削除されたカードは bare id で引かれ、同じ id を持つ別のカードの値を受け取る**。複数 system のルートでは別の system の枠にある同名のカードが bare id に答えるので、誤った値が実際に描かれる（per-node の値は path で引く。ADR-2934）。

削除されたカードを描くのに引く per-node の値（owner・boundary・facet・style・layout hint …）は、**1 つ残らず** before 側から、そのカード自身の path で補う。1 つでも補い漏れると、その値だけが同名のカードのものになる。

発見事例（#3197）: `compileSystemDiff` は owner・boundary・scoped boundary・facet を `removed` のカードの path で before から補っていたが、style だけは after の model からしか解決していなかった。削除された `Admin.Mail [external]` は `Shop.Mail` の無地で、逆に削除された無地の `Shop.Mail` は生き残った `Admin.Mail` の赤で描かれた。

## 想定される失敗モード

- 削除されたカードが、別の枠にある同名のカードの色・形・バッジで描かれる（見た目は「削除された別の何か」に見える）
- 同名のカードが 1 つしか無い fixture では bare id と path が同じ答えを返し、柵が素通りする
- per-node の値を 1 種類足したとき、after からの解決だけを書き、before からの補いを足し忘れる

## チェックリスト

compare モードの描画に per-node の値を足す・変えるとき:

- [ ] その値を `removed` のカードの path で before から補っているか（after 側に path がある値は上書きしない）
- [ ] fixture に「別の system に同じ id のカードがあり、片方だけを削除する」ケースを、両方向（スタイルのある側を消す / ない側を消す）で入れたか
- [ ] 補う値と補わない値の境界（after を正とする値、たとえばラベルや宣言の順）を、意図して決めているか

## 既知の対処パターン

- `compileSystemDiff` は before 側のモデルを同じシート（before + after を連結した `assembleDiffSheets`）で解決し、`removed` のカードの path について `nodesByPath` / `paintedColorsByPath` / `layoutHintsByPath` を補う（#3197）。owner・boundary・facet の補いと同じ形

## 関連テスト

- `packages/core/src/renderer/removed-card-style-by-path.test.ts`（同名のカードが別の system にあるとき、削除されたカードが自分のスタイルで描かれる。両方向）
- `packages/core/src/renderer/multi-system-root-diff.test.ts`（owner・facet・boundary の補い。#3126）
