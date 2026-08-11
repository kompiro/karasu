---
id: TPL-2421
title: "kind の色は色相表から導出する — 追加時は表に行を足し、fill / text を同色相ルールで導く"
status: active
date: 2026-08-11
applicable_to:
  - "`default-style.ts` に新しい node kind / deploy kind を追加するとき"
  - "既存 kind の background-color / color / border-color を変更するとき"
  - "塗りなし（`background-color: transparent`）の kind を追加するとき"
  - "カードの塗りを前提に色を読む描画面（凡例スウォッチ等）を追加するとき"
discovered_from:
  - issue: "#2421"
  - root_cause_file: "packages/core/src/builtins/default-style.ts"
related_to:
  - TPL-1697
  - TPL-2366
topic: styling
scope:
  packages:
    - core
---

# TPL-2421: kind の色は色相表から導出する

## 観点

kind の配色は「その場で似合う色を選ぶ」対象ではなく、**規則からの導出**である。
`docs/spec/style.md` §「Kind color vocabulary」が規則と色相表を持ち、
`default-style-contrast.test.ts` が導出結果を機械検証する。kind を足すとは、
表に行を足し、その行から 3 色（accent / fill / text）を導くことである。

[[TPL-1697]] は「対を揃えたか」（fill があるなら text もあるか）、
[[TPL-2366]] は「canvas 上の文字が読めるか」を見る。本観点はその手前にある
**色をどう決めるか**を扱う。3 つは同じガードファイルに同居している。

#2421 以前、この規則は存在しなかった。結果として dark テーマで `domain` /
`usecase` / `resource` / `member` が完全に同一配色（地 `#1E3A5F`）になり、
kind 語彙が色として空洞化していた。deploy 側では `war` の茶・`function` の
オリーブのように**どの色相にも属さない濁色**が地になり、accent の枠線だけが
カードから浮いていた。どちらも「1 つずつ見れば妥当」な選択の積み重ねである。

## 想定される失敗モード

- 新しい kind に「空いている色」を割り当て、色相表に行を足さない。表と実装が
  乖離し、次の追加者は表ではなく既存コードを真似る（規則が死ぬ）。
- deploy kind の地色を、accent とは無関係な彩度を落とした色で決める。枠線だけが
  浮き、カードが「色を持っている」ように見えない（#2421 の `war` / `function`）。
- 塗りなし kind を足すとき、枠線を「見た目の好み」で選ぶ。塗りがない以上**枠線が
  唯一の輪郭**なので、canvas に対して 3:1 が必要になる。判定面は素の canvas だけ
  ではなく、次の 3 つが重なって効く。**測る面を 1 つ落とすたびに、実際には割って
  いる値が緑になる**:
  1. 素の canvas
  2. boundary frame の tint を重ねた canvas。frame は 1:N なので**重なる** —
     #2421 では 1 枚重ねで通る `#4E8FBF` が 3 枚重ねで 2.92 に落ちた
  3. `@deprecated` が fade させた不透明度でのカード。塗りありなら本体が残るが、
     塗りなしでは**輪郭しか残らない**。#2421 では単一 tint ですら 2.46 まで落ちた
- 逆に、**どんな色でも届かない fade 状態**を判定面に入れてしまう。facet dim
  (0.28) / diff ghost (0.3) では純白の枠線でも dark canvas に対して約 2.2:1 で、
  色の選び直しでは解けない。ここは WCAG 1.4.11 の inactive component 除外に倣って
  対象外と**書く**（黙って外すと、次の人が「測り忘れ」と区別できない）。
- 塗りなし kind を足したあと、**カードの塗りを色として読んでいる別の描画面**を
  更新し忘れる。#2421 では凡例スウォッチが `background-color` をそのまま塗って
  いたため、`ref usecase` が `fill="transparent"` の**不可視の四角**になり、
  「エントリが落ちた」と区別できない状態になった。
- 明るいテーマと暗いテーマで同じ枠線色を使う。同じ 3:1 を満たすのに必要な明度は
  テーマで逆向きなので、片方は必ず割る。

## チェックリスト

`default-style.ts` の kind ルールを追加・変更するとき:

- [ ] `docs/spec/style.md` / `style.ja.md` の色相表に、その kind の行があるか
- [ ] 3 色をその色相から導いたか（accent = 彩度そのまま / fill = 明度の両端のうち
      **canvas に近い側** / text = その反対端）。地だけ別系統の色になっていないか。
      「低明度が fill」と絶対値で覚えると light テーマで反転して破綻する
- [ ] `background-color` を設定したなら対の `color` もあるか（[[TPL-1697]]）、
      その対が両テーマで 4.5:1 以上か
- [ ] 塗りなしにするなら、`none` ではなく `transparent` を使ったか
      （`transparent` は painted なのでクリック・ホバーの当たり判定が残る）
- [ ] 塗りなしにするなら、枠線が**素の canvas / 重ねた boundary tint /
      `@deprecated` の fade 後**の 3 面すべてに対して 3:1 以上か。dark / light を
      別々に較正したか（規則は同じでも向きが逆になる）
- [ ] 判定から外した fade 状態があるなら、「どんな色でも届かないから外した」と
      理由を書いたか。ガードのしきい値と builtin の opacity 値が**結ばれて**いるか
      （opacity を上げたのにガードが古い α で測り続ける状態を作らない）
- [ ] 塗りなしにするなら、`background-color` を色として読んでいる描画面を
      grep したか（`merged["background-color"]` / `style.backgroundColor`）
- [ ] 既存の意味色（diff = amber / `edge[cyclic]` = 赤 / boundary の 6 hues /
      team = 緑）と**新たな**衝突を作っていないか

## 既知の対処パターン

- **表が固定するのは色相と規則、hex ではない。** 具体値はガードを通る範囲で
  自由にする。hex を spec に焼くと、コントラスト調整のたびに spec が古くなる。
- **塗りなしの検証面は canvas ではなく「canvas が着ている面」の集合。**
  `compositeOver` を全 `boundaryHues` について**繰り返し適用**して 1〜3 枚重ねの
  面を作り、素の canvas と合わせた集合の全要素に対して判定する。さらにその各面に
  対して、枠線を `@deprecated` の opacity で合成した色でも判定する
  （`default-style-contrast.test.ts`）。
- **塗りなし kind の代表色は border-color。** カードの塗りを色として読む面
  （凡例スウォッチ）では、`transparent` を額面どおり塗らず border-color へ
  フォールバックする（`renderer/svg-builder.ts` の `resolveLegendRefColor`）。
- **ガードは bare kind セレクタに絞る。** タグルール（builtin `[external]`）は
  `background-color` だけを設定して text 色を kind 側から継ぐのが正しい形なので、
  「塗るルールは全部 text も持て」にすると正しいシートで落ちる。

## 関連テスト

- `packages/core/src/builtins/default-style-contrast.test.ts` — `builtin kind
  colors (dark/light theme)`。両テーマの bare kind ルールについて、fill ⇔ text の
  対の存在と 4.5:1、塗りなし kind の枠線 3:1 / 文字 4.5:1 を素の canvas と全
  boundary tint 合成に対して検証する。kind 数は exact 一致で pin してあり、
  片テーマから kind が落ちてもカバレッジが黙って縮まない。
- `packages/core/src/renderer/legend-footer.test.ts` — `swatches a fill-less kind
  with its border color (Issue #2421)`。

## 派生元 spec

- `docs/spec/style.md` / `style.ja.md` §「Kind color vocabulary」/「kind の色語彙」
