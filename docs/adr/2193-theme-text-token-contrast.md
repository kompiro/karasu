---
id: ADR-2193
title: テーマの文字色トークンは載りうる全 surface で AA を満たす値に揃える
status: accepted
date: 2026-08-12
topic: app-ui
related_to: [ADR-1470, ADR-1368]
scope:
  packages: [app, core]
  concerns: [accessibility]
assumptions:
  - "file: packages/app/src/styles/themes.css"
  - "file: packages/app/src/styles/theme-contrast.test.ts"
  - "file: packages/app/src/styles/styles-no-raw-color.test.ts"
  - "symbol: packages/core/src/renderer/contrast.ts :: contrastRatio"
  - "grep: packages/app/src/styles/themes.css :: --select-chevron"
---

# ADR-2193: テーマの文字色トークンは載りうる全 surface で AA を満たす値に揃える

- **日付**: 2026-08-12
- **ステータス**: 決定済み
- **関連**:
  - Issue #2193 — light theme secondary text falls below WCAG AA contrast
  - [ADR-1470](1470-app-css-modularization-and-light-theme.md) — トークン層で light テーマを提供する
  - [TPL-2193](../test-perspectives/TPL-2193-theme-token-contrast-every-surface.md) — 本 ADR の観点
  - [TPL-2366](../test-perspectives/TPL-2366-badge-color-canvas-contrast.md) — canvas 側の同種観点

## 背景

ADR-1470 で light パレットを導入したとき、色は白背景（`--bg-raised`）を基準に
調整していた。#2193 で AT-1470 の目視項目を自動化する過程で実測したところ、
非アクティブタブ 4.02:1、ghost ボタン 3.51:1（いずれも 11.5〜12px）と、通常
テキストの AA（4.5:1）を下回っていた。

測定を両セット・全 surface に広げると、問題は報告より広かった。

- 落ちていたのは報告にある `--text-secondary` ではなく `--text-muted` だった
  （タブも ghost ボタンも `--text-muted` を塗る）。
- light の未達は白ではなく **`--bg-void`（`#E9EDF3`）** で起きていた。ここは
  パネル・ツールバーの背景として広く使われており、白基準の調整では見えない。
  同じ理由で status 色（`--error` / `--warning` / `--info`）と `--text-link` も
  4.1〜4.4:1 に沈んでいた。
- 既定テーマである dark はさらに悪く、`--text-muted` は `--bg-overlay` 上で
  **1.78:1**。報告は light についてだったが、未報告の側の方が重かった。

`styles-no-raw-color.test.ts` は「色がトークン経由か」を検証するが、
「トークンの値が読めるか」は誰も検証していなかった。

## 決定

文字を塗るトークンは、**そのテーマで載りうる不透明 surface すべて**に対して
4.5:1 以上となる値に揃え、その条件を `theme-contrast.test.ts` で機械検証する。

- light: `--text-tertiary` `#5F7088` → `#526480`、`--text-muted` `#6F7E95` →
  `#576A87`、`--text-link` / `--nav-btn-text` `#2563EB` → `#1C5DEA`、
  `--error` `#DC2626` → `#CC2121`、`--warning` `#B45309` → `#AA4E08`、
  `--info` `#1D6FD4` → `#1B67C5`。いずれも色相・彩度を固定し明度のみを倒した。
- dark: `--text-muted` `#3D5068` → `#7F95B6`。これに合わせて `--text-secondary`
  `#7B92B4` → `#9EAFC8`、`--text-tertiary` → `#8DA1BF` を持ち上げ、ランプの
  順序（primary → secondary → tertiary → muted）を維持する。
- 判定は `packages/core` の `contrastRatio()` を index から公開して共有する。
  chrome（CSS トークン）と図（builtin sheet）が同じ実装で合否を出す。

検証対象は「役割が文字であるトークン」に限る。`--accent` / `--feather` /
`--success` は fill・border・glow を塗るトークンなので対象外（非文字は 3:1 の
1.4.11 基準）。ただし `--accent` を文字として使っていた箇所は残さない:
`.settings-security-notice__link` は半透明の `--warning-bg` 越しに載るため
light で 4.30:1 だった（この合成後の値は不透明 surface だけを見る本 fence では
検出できない）。リンクなので `--text-link` に付け替え、`--accent` の `color:`
用途は不透明な `--bg-raised` 上の 1 箇所（5.17:1）だけになった。

背景集合には不透明な surface のみを取る。半透明のクローム（`--warning-bg` /
`--accent-dim` / `--diff-banner-bg`）は下地との合成後が実効背景になり比が下がる
ため、合成を含む検証は別に必要で、[#2461](https://github.com/kompiro/karasu/issues/2461)
で扱う。`--bg-selected` も外している: それを設定するルールは必ず
`--text-primary` も設定しており、そこに残るのはアイコングリフだけなので、
3:1 のバックストップとして別に検証する。

## 理由

- **未達の在処が背景側で決まる**ため、トークン単体では合否が定義できない。
  白 1 枚を基準にした調整は `--bg-void` で崩れる、というのが #2193 の実態だった。
- **既定テーマを直さない選択は取れない**。報告は light だったが、実測すると
  dark の `--text-muted` の方が悪い。片側だけ直すと、同じ欠陥のより重い半分が
  「修正済み」の外に残る。
- **dim さより比を優先する**。muted は暗いほど設計意図に合うように見えるが、
  テキストを担う以上 4.5:1 が下限で、結果としてランプは圧縮される。圧縮しても
  順序さえ保てば階層は読める（順序自体もテストで固定した）。
- ランプの再調整は目視では検出できない種類の変更なので、**回帰は機械検証に
  委ねる**。テストは値を読み上げるのではなく比を計算するため、将来トークンを
  足したときも同じ基準で判定できる（新トークンは対象リストへの追加が必要）。

## 却下した案

- **light だけ直し、dark は後続 Issue に送る**: 検討したが、`--text-muted` は
  両セットで同じ役割・同じ surface に載る 1 つのトークンであり、片側だけ直すと
  fence にも恒久的な例外リストが残る。既定テーマの見た目が変わる点は承知のうえで
  同時に直した。
- **`--bg-selected` も背景集合に含める**: 含めると `--text-tertiary` と
  `--text-muted` がほぼ同値に潰れる（4.51 と 4.50）。実際にそこへ文字を置く
  ルールが `--text-primary` だけである以上、得るものより階層の損失が大きい。
- **e2e の実測だけで担保する**: AT-1470 の e2e は実際に描画された 2〜3 の
  surface しか触れない。トークン × surface の組み合わせは e2e で網羅するには
  高価で、ユニットテストなら全組が数 ms で回る。両者は役割が違うので併用する
  （e2e はどのトークンに解決されるかを、ユニットは値が足りるかを見る）。

## 付随して直したもの

`<select>` のシェブロンは inline SVG の data-URI に `%233D5068`（dark の
`--text-muted`）を焼き込んでいた。`%23` は生色リテラル検査の `#` 正規表現に
掛からないため、light テーマでも dark の値のまま固定されていた。画像ごと
`--select-chevron` トークンにしてセットごとに定義し、検査には `%23` 形式の
検出を追加した。

## 残る未達（本 ADR の対象外）

同じ測定で見つかったが、トークン層ではなくコンポーネント側の組み合わせの問題:

- CommandPalette の選択行が `--accent` の上に `text-white` を直書きしており、
  dark で 3.14:1。
- diff バナーのラベル（`--diff-color-added` / `--diff-color-removed`）は
  半透明のバナー tint 越しに載るため、合成後の背景で測る必要がある。同じ理由で
  `--warning`（security notice の見出し）も、下地が `--bg-void` になる配置が
  生じれば合成後 4.24:1 まで落ちる。現在の下地は `body` の `--bg-base` で
  4.59:1。

いずれも #2461 で追跡する。合成の計算は `compositeOver()` が既に持っている。
