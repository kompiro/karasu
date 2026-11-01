---
id: TPL-3180
title: "SVG の押せる要素は、描いた線と文字の形ではなく、押せる領域を当たり判定に持つ"
status: active
date: 2026-10-17
applicable_to:
  - "SVG の <g> を role=button やクリックの受け口にし、中身が fill=\"none\" の線や <text> だけのもの"
  - "細い線・折り返したラベルなど、見た目の面積が小さい要素をクリック対象にする描画面"
known_consumers:
  - focus-canvas
  - main-canvas-edge
discovered_from:
  - issue: "#3180"
  - root_cause_file: "packages/app/src/components/focus-canvas/build.ts"
related_to:
  - TPL-2044
  - TPL-3022
  - TPL-3437
topic: app-ui
scope:
  packages:
    - app
    - core
---

# TPL-3180: SVG の押せる要素は、描いた線と文字の形ではなく、押せる領域を当たり判定に持つ

## 観点

SVG の当たり判定は**塗った形の上**だけで起きる。`fill="none"` の path はストロークの幅（1.5px）の上だけ、`<text>` は文字の形（glyph）の上だけが押せる。`<g>` 自体は当たり判定の領域を持たない。そのため、線とラベルでできた要素を押せるようにしても、読み手が「そこを押した」と思う場所（単語と単語のあいだ、折り返した 2 行のあいだ、線のすぐ横）は背景に落ち、何も起きない。カーソルも同じ場所でちらつく。

押せる要素には、見た目とは別に**押せる領域そのものを描く**。線に沿った透明な太い帯（`stroke="transparent"` の幅の広いストローク）と、ラベルのブロック全体を覆う透明な rect を、見える線と文字の**後ろ**に置く（前に置くと文字の選択などを奪う。重なり順は [TPL-2044]）。

発見事例（#3180）: focus canvas の node の行（lane）は `<g>` に線と `<text>` しか持たず、ラベルの行と行のあいだを押すと背景の rect に当たった。メインのキャンバスの edge は同じ理由で当たり判定用の線（`.krs-edge__hitline`）を既に持っていたが、新しく足した描画面には引き継がれていなかった。

## 想定される失敗モード

- 押せるはずの要素が、線の上と文字の上でしか反応しない。単語のあいだ、行のあいだ、線の横を押しても何も起きない
- pointer を動かすと、押せる表示（cursor: pointer）が文字の上でだけ点いたり消えたりする
- 押せる領域を見える要素より前に描き、文字の選択やほかの要素の当たり判定を奪う

当たり判定の領域はあるのに、タッチのタップが近くの別の要素へ移る失敗は別の原因で起きる（[TPL-3437](TPL-3437-tap-target-needs-its-own-pressability-cue.md)）。

## チェックリスト

押せる SVG 要素を追加・変更するとき:

- [ ] 要素の中身が `fill="none"` の線や `<text>` だけなら、押せる領域（透明な帯・rect）を別に描いたか
- [ ] 実ブラウザで、ラベルの文字と文字のあいだ（折り返しなら行のあいだ）を `document.elementFromPoint` で調べ、その要素に当たることをテストしたか（jsdom は当たり判定を持たない）
- [ ] 押せる領域は見える線と文字より後ろに描いたか（[TPL-2044] の重なり順）
- [ ] 押せない状態（クリックを受けない描画）では、押せる領域を描いていないか

## 既知の対処パターン

- **見える要素の後ろに、透明な当たり判定を置く**（#3180）。focus canvas の lane は、線と同じ `d` で `stroke="transparent"` / `stroke-width="12"` の path と、ラベルのブロックより 3px 広い `fill="transparent"` の rect を、見える path と `<text>` より先に出力する（文書順で先に描かれるので下になる）。lane が押せない edge の focus では描かない
- メインのキャンバスの edge は `.krs-edge__hitline`（太い透明線）で同じことをしている（`packages/core/src/renderer/edge-routing.ts`）

## 関連テスト

- `packages/app/src/components/focus-canvas/build.test.ts` › `lane hit areas (#3180)`（帯とラベル領域の有無・大きさ・透明・描く順）
- `packages/e2e/tests/at-3031-focus-canvas.spec.ts` › `a lane takes a press between the lines of its label (#3180)`（実ブラウザで行のあいだの点が lane に当たり、押すと組の focus に移る）

[TPL-2044]: TPL-2044-svg-interactive-control-paints-last.md
