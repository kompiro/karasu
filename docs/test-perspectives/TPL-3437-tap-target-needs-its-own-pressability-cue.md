---
id: TPL-3437
title: "押せる要素は、ブラウザから見ても押せる要素であること。クリックを祖先に委譲すると、タッチのタップが近くの別の要素に移る"
status: active
date: 2026-11-01
applicable_to:
  - "クリックを祖先の要素（プレビューのコンテナなど）で受け、押せる要素自身にはリスナーもフォーカスも `:hover` も無い描画面"
  - "小さな押せる要素の近くに、`:hover` のスタイルやリスナーを持つ別の押せる要素（edge の hit-line など）がある配置"
known_consumers:
  - main-canvas-edge
discovered_from:
  - issue: "#3027"
  - root_cause_file: "packages/app/src/styles/components/preview.css"
related_to:
  - TPL-3180
topic: app-ui
scope:
  packages:
    - app
---

# TPL-3437: 押せる要素は、ブラウザから見ても押せる要素であること。クリックを祖先に委譲すると、タッチのタップが近くの別の要素に移る

## 観点

Chrome はタッチを点ではなく面として扱い、その面に入る要素のうち「押せる」と判断したものへタップを寄せる（touch adjustment）。押せると判断する手がかりは、その要素自身のイベントリスナー・フォーカスできること・`:hover` などのスタイルである。

クリックを祖先の要素で受ける描画面では、押せる要素自身がどの手がかりも持たないことがある。すると、すぐ横に手がかりを持つ別の要素があるだけで、押せる要素の真上のタップがそちらへ移る。最前面の要素は押せる要素のままなので、`elementFromPoint` を調べても見つからない。当たり判定の領域を大きくしても候補に入らないので直らない（[TPL-3180](TPL-3180-svg-control-hit-area-is-its-region.md) は領域の問題で、こちらとは原因が違う）。

押せる要素には、ブラウザが押せると判断できる手がかりを要素自身に持たせる。

## 想定される失敗モード

- **card の角のボタンへのタップが、横を通る edge に移る**（#3027）: クリックはプレビューのコンテナが受けている。edge は `:hover` のスタイルを持つので候補になり、card の角のボタン（ⓘ・D・links・team）は何も持たなかったので候補にならなかった。fit した canvas で 7px ほどの Identity のⓘをタップすると、`Sharing -> Identity` の hit-line に移り、その edge の focus canvas が開いた。両方向の組を 1 本にして近くの線が 2 本減ったことで、候補がその hit-line だけになった
- **配置が少し変わっただけで結果が変わる**: どの要素へ寄せるかは近くにある候補の組み合わせで決まる。ボタンの位置が同じでも、近くの線が増えたり減ったりするとタップの行き先が変わる
- **柵が見逃す**: jsdom にはタッチの補正が無い。実ブラウザでも、マウスのクリックや `elementFromPoint` は補正を通らない。`hasTouch` のタップだけが補正を通る

## チェックリスト

押せる要素を足す・クリックの受け方を変える・押せる要素の近くに別の押せる要素を置くときに確認する:

- [ ] 押せる要素が、要素自身に手がかり（`:hover` のスタイル、フォーカスできること、自身のリスナー）を持つ
- [ ] 近くに別の押せる要素がある配置で、`hasTouch` のタップがその要素に届くことを実ブラウザでテストした
- [ ] 足したテストが修正前のツリーで落ちることを確認した

## 既知の対処パターン

- **押せる要素に `:hover` のスタイルを持たせる**（#3027）。card の角のボタン（`.krs-node-controls`）に、edge と同じ明るさの hover を足した（`packages/app/src/styles/components/preview.css`）。見た目の手がかりにもなり、Chrome がタップの候補として数える。Chromium の headless shell には touch adjustment を止めるスイッチが無く、半径 0.5 の低レベルのタッチ入力でも補正がかかったので、テスト側で補正を外す方法は取れなかった

## 関連テスト

- `packages/e2e/tests/at-3057-focus-canvas-keyboard-touch.spec.ts` › `AT-3057 focus canvas from touch` › `a tap on ⓘ, then on Relations in the panel, opens the node's canvas`: Identity のⓘのすぐ横を `Sharing -> Identity` の hit-line が通る配置で、ⓘのタップがパネルを開くこと。hover のスタイルを外すと毎回 edge の focus canvas が開いて落ちる
