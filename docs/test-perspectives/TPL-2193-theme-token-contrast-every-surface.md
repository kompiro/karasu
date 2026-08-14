---
id: TPL-2193
title: "テーマトークンの文字色は、載りうる全 surface に対してテーマごとに 4.5:1 を機械検証する"
status: active
date: 2026-08-12
applicable_to:
  - "テーマの色トークン（`--text-*` / status 色）を追加・変更するとき"
  - "背景トークン（`--bg-*`）を追加・変更するとき — 既存の文字色の最悪ケースが変わる"
  - "文字を載せる新しい surface（パネル・バナー・オーバーレイ）を追加するとき"
discovered_from:
  - issue: "#2193"
  - root_cause_file: "packages/app/src/styles/themes.css"
related_to:
  - TPL-2366
  - TPL-1001
  - TPL-1697
topic: styling
scope:
  packages:
    - app
  concerns:
    - accessibility
---

# TPL-2193: テーマトークンの文字色は、載りうる全 surface に対してテーマごとに 4.5:1 を機械検証する

## 観点

文字色トークンの合否は「トークン単体」では決まらない。**そのトークンが載りうる
背景の集合すべて**に対して WCAG AA（通常テキスト 4.5:1）を満たすことを、テーマ
ごとにユニットテストで検証する。判定を最も明るい（light）／最も暗い（dark）
背景 1 枚で代表させると、そこだけ通って他で落ちる。

TPL-2366 が canvas 上に描かれる文字（`packages/core` の builtin sheet）を対象と
するのに対し、本観点は **CSS トークン層（`themes.css`）** を対象とする。同じ
`contrastRatio()` で判定し、chrome と図で合否がずれないようにする。

## 想定される失敗モード

- **白で調整して mid-tone で落ちる**: light パレットを `#ffffff` 上で目視調整
  すると、実際にはより暗い `--bg-void`（`#E9EDF3`）にも文字が載るため、そこで
  0.3〜0.6 ほど下回る。#2193 では light の `--text-muted` が `--bg-raised` 上
  4.12:1 に対し `--bg-void` 上 3.51:1。status 色（`--error` / `--warning` /
  `--info`）も同じ理由で 4.1〜4.3:1 に沈んでいた。
- **既定テーマの見落とし**: 報告が片方のテーマで上がると、そのテーマだけ直して
  もう一方を測らない。#2193 では報告された light（3.51:1）より既定の dark の
  `--text-muted` が悪く（`--bg-overlay` 上 **1.78:1**）、そちらは未報告だった。
- **「dim であること」をコントラストより優先してしまう**: muted は暗くするほど
  意図に合うように見えるが、テキストを担う以上 4.5:1 が下限。結果としてランプは
  圧縮される（この圧縮自体は正常）。
- **半透明のクローム越しに載る**: `--warning-bg` や `--diff-banner-bg` のような
  tint の上の文字は、実効背景が「tint を下地に合成した色」になり比が下がる。
  不透明 surface だけを見る検証では素通りする（#2193 では security notice の
  リンクが `--accent` で 4.30:1、#2461 では diff バナーのラベルが 3.91:1）。
  合成結果は下地に依存するので、**そのクロームが載りうる surface を列挙して
  はじめて判定できる**。
- **背景がテーマに追従しないのに前景だけ追従させる**: 背景がトークンではなく
  外から渡る色（inline style・データ由来）のとき、前景をテーマで切り替えると
  片方のテーマで必ず外す。#2461 の Reference パネルのバッジプレビューは背景が
  常に dark パレット値で、白文字が両テーマとも 2.15〜3.76:1 だった。
- **焼き込まれた色（data-URI / TSX リテラル）**: `background-image` の inline
  SVG は `%23RRGGBB` と percent-encode されるため、生色リテラル検査
  （`styles-no-raw-color.test.ts`）の `#` 正規表現をすり抜け、片方のテーマの値の
  まま固定される。TSX 側の `text-white` のようなリテラルも同様に検査の外に出る。
- **リストからの脱落**: 検証対象トークンを手書きのリストで持つと、後から足した
  トークンが「書き忘れ」によって静かに検証外になる。リスト自体に drift ガードを
  持たせない限り、抜けは事後に気づけない。

## チェックリスト

`themes.css` の色トークンを追加・変更するとき:

- [ ] そのトークンは `color:` として使われるか（= 文字か、それとも fill / border か）
      を grep で確認したか。文字なら 4.5:1、非文字なら 3:1（WCAG 1.4.11）
- [ ] **両方のテーマセット**で、載りうる全 `--bg-*` に対して 4.5:1 以上か
      （`theme-contrast.test.ts` が自動判定。新トークンは `TEXT_TOKENS` /
      `SURFACES` に追加する。追加も除外もしなければ drift ガードが落ちるので、
      「書き忘れ」ではなく「除外した理由」を必ず残すことになる）
- [ ] その文字が半透明の背景（tint / バナー）の上に載るなら、下地との合成後の
      色で測ったか（`compositeOver()` を使う。不透明 surface だけの検証は通る）。
      `TINTED_PAIRS` に「載りうる surface」を列挙する — 列挙しなければ
      drift ガードが落ちる
- [ ] 不透明な**色**（`--accent` 等）の上に文字を置くなら、前景をテーマごとの
      インクにしたか。背景色を暗くして解こうとすると、その色が別の場所で
      「文字」として使われている場合に壊れる（#2461 の `--accent`）
- [ ] ランプの順序（primary → secondary → tertiary → muted）が保たれているか
- [ ] 未達なら同色相のまま明度だけ倒したか（`contrastRatio()` で再測定する。
      目視・手計算で決めない）
- [ ] data-URI に色を焼き込んでいないか。焼き込む必要があるなら画像ごと
      `themes.css` のトークンにしてテーマごとに定義する

## 既知の対処パターン

- 色相・彩度を固定して明度のみを解き、目標比（例 4.7:1）を満たす値を求める。
  #2193 の light: `--text-tertiary` `#5F7088` → `#526480`、`--text-muted`
  `#6F7E95` → `#576A87`。dark: `--text-muted` `#3D5068` → `#7F95B6`、および
  それに合わせて `--text-secondary` / `--text-tertiary` を持ち上げ、ランプの
  順序を維持。
- 文字色ではないトークン（`--accent` / `--feather` / `*-dim` / `*-border`）は
  倒さない。3:1 の非文字基準で足りるうえ、ブランド色を必要以上に動かす。
- data-URI の画像は `--select-chevron` のようにトークン化し、セットごとに
  stroke 色を焼いた 2 本を定義する（CSS の `var()` は data-URI 内で解決されない）。
- 色の上の文字は前景を per-theme のインクにする（#2461 の `--text-on-accent`:
  light `#FFFFFF` / dark `#0F0F0F`。既存の `--error-badge-text` と同じ形）。
  背景がテーマに追従しないなら前景も固定する（`--badge-preview-text`）。

## 関連テスト

- `packages/app/src/styles/theme-contrast.test.ts`。`themes.css` を両セットに
  分解し、文字系トークン × 全 opaque surface を 4.5:1 で検証する。加えて
  自前の背景を持つバナー（`--export-error-text` / `--opfs-banner-text`、
  グラデーションは全 stop）と、非文字グリフ（選択行の `--text-muted` アイコン）
  の 3:1 バックストップ、色トークンの上の文字（`--text-on-accent` / バッジ
  プレビュー）、半透明 tint の合成後の比、SVG stroke の 3:1、ランプ順序、
  data-URI に焼いた色と元トークンの一致、
  および `--text-*` / `--bg-*` を検証対象リストが取りこぼしていないかの drift
  ガードを検証する。半透明 tint は載りうる surface を宣言して合成後の色で測り
  （#2461）、宣言漏れは tint 側の drift ガードが落とす。
- `packages/app/src/styles/styles-no-raw-color.test.ts`。`%23` 形式の
  encode 済み hex も検出対象（#2193 で追加）。
- `packages/e2e/tests/at-1470-app-theme.spec.ts`。実ブラウザで light / dark
  両方の primary / secondary 系 surface の実効比を測る（どのトークンに解決され、
  透明祖先を辿った先が何色かは実描画でしか分からない）。
