---
id: TPL-20260518-01
title: "involutive な toggle は両方の結果状態を end-to-end でレンダリング検証する"
status: active
date: 2026-05-18
applicable_to:
  - "それ自身が逆操作になる UI toggle（diff swap / flip / 表裏入れ替え / 昇順降順）"
  - "toggle が前後の入力を入れ替えるとき、両入力を 1 つの共有リソース（FS overlay / superset）経由で解決する合成パイプライン"
known_consumers:
  - diff-swap-button
discovered_from:
  - issue: "#1402"
  - root_cause_file: "packages/app/src/hooks/useAppViews.ts:151"
related_to:
  - TPL-20260510-09
topic: app-ui
scope:
  packages:
    - app
---

# TPL-20260518-01: involutive な toggle は両方の結果状態を end-to-end でレンダリング検証する

## 観点

「もう一度押すと元に戻る」toggle（swap / flip / 入れ替え）は、押した**結果の両状態**が
それぞれ正しく**最終出力まで（描画・合成まで）**到達することを検証する。

reducer 単体テスト（boolean が反転する）とコンポーネント単体テスト（ボタンが
`onSwap` を発火する・`aria-pressed` が変わる）だけでは不十分 — それらは toggle
**アクション**を検証するが、toggle **後の合成パス**（その状態で実際に描画/コンパイル
されるか）を検証しない。

特に toggle が「before / after の入力を入れ替える」種類のとき、入れ替えの対象を
入力**値**だけに限定する。入力を解決する**共有リソース**（FS overlay など、両入力の
superset）まで一緒に入れ替えると、片方の状態でしか解決できないリソースに退化する。

## 想定される失敗モード

- diff swap で「進む方向」は描画されるが「戻る方向」（swapped 状態）でエラーになる。
  reducer は boolean を反転するだけなので「toggle 自体は動く」ように見え、バグは
  描画パスに隠れる（#1402: swapped 時に `effCompareFs` が overlay ではなく base FS に
  なり、`compile*Diff` が仮想 snapshot path を読めず throw）
- toggle の forward 状態だけ手で確認し、reverse 状態は「対称だから動くはず」と
  仮定してテストを書かない
- 入れ替え対象を広く取りすぎ、both-sides を解決できる superset リソースを、片側
  しか解決できない base リソースに swap してしまう

## チェックリスト

involutive な toggle を実装 / 変更するときに確認する:

- [ ] toggle 後の **両状態**で、最終出力（SVG / 描画結果）が空でなく、エラー
      diagnostic を含まないことを assert するテストがある（reducer・ボタン単体
      テストとは別に）
- [ ] toggle が before/after を入れ替えるなら、入れ替えるのは入力**値（path 等）**
      だけで、両入力を解決する共有リソース（overlay / superset FS）は入れ替えない
- [ ] forward → reverse → forward を往復し、各状態が独立に正しいことを確認する
      （reverse は forward の単なる対称と仮定しない）
- [ ] toggle の各 variant（compare source が file / pasted / snapshot 等）で
      reverse 状態を検証する — overlay を伴う variant が壊れやすい

## 既知の対処パターン

- 両入力を 1 つの FS で解決する合成 API（`compile*Diff` のように単一 `fs` 引数）
  では、その FS を常に superset（両 path を解決できる側）に固定し、swap では
  before/after の **path だけ**を入れ替える
- toggle の hook レベル（`useAppViews` 等）にテストを置き、toggle 後の派生状態
  （`views.system.svg` / `diagnostics`）を両状態で assert する

## 関連テスト

- `packages/app/src/hooks/useAppViews.test.tsx` — snapshot compare source で
  swap した後、diff が overlay FS で再コンパイルされエラーにならないことを assert
- `docs/acceptance/0062-diff-swap-button.md` TC-4 — snapshot 源での swap の手動検証
