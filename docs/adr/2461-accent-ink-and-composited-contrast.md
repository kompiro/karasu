---
id: ADR-2461
title: 色の上の文字は per-theme のインクで、半透明クロームの上の文字は合成後の色で判定する
status: accepted
date: 2026-08-13
topic: app-ui
related_to: [ADR-2193, ADR-1470]
depends_on: [ADR-2193]
scope:
  packages: [app]
  concerns: [accessibility]
assumptions:
  - "file: packages/app/src/styles/themes.css"
  - "file: packages/app/src/styles/theme-contrast.test.ts"
  - "grep: packages/app/src/styles/themes.css :: --badge-preview-text"
  - "symbol: packages/core/src/renderer/contrast.ts :: compositeOver"
  - "grep: packages/app/src/components/CommandPalette.tsx :: var\\(--text-on-accent\\)"
---

# ADR-2461: 色の上の文字は per-theme のインクで、半透明クロームの上の文字は合成後の色で判定する

- **日付**: 2026-08-13
- **ステータス**: 決定済み
- **関連**:
  - Issue #2461 — white-on-accent and translucent-tint text miss AA
  - [ADR-2193](2193-theme-text-token-contrast.md) — 不透明 surface に対する文字色の AA
  - [TPL-2193](../test-perspectives/TPL-2193-theme-token-contrast-every-surface.md) — 本 ADR の観点

## 背景

ADR-2193 の fence は「文字色トークン × 不透明 surface」を判定する。#2193 の
測定で見つかった 2 件はどちらもその形に収まらず、後続として #2461 に送っていた。

- **色の上の白文字**: CommandPalette / ProjectPicker の選択行が
  `aria-selected:bg-[color:var(--accent)]` に `text-white` を直書きしており、
  dark で 3.14:1。リテラルなので生色リテラル検査（CSS のみ）にも fence にも
  掛からない。
- **半透明クロームの上の文字**: diff バナーのラベルは `--diff-banner-bg`
  （`rgba(...)`）越しに載るため、実効背景は tint を下地に合成した色になる。
  不透明 surface だけを見ると通るが、合成後は light で 3.91:1 / 4.06:1。

実装中の測定で、Issue に書いていなかった 2 件も出た。Reference パネルの
バッジプレビューは背景が `reference-data.ts` のバッジ色（テーマに追従せず常に
dark パレット値）で、白文字は **両テーマとも** 2.15〜3.76:1。`--error` も
自分自身の `--error-dim` の上に載る配置（danger メニュー項目・プロジェクト
セレクタ）があり、light で 4.11:1 だった。

## 決定

背景の種類ごとに判定方法を分け、3 種すべてを `theme-contrast.test.ts` で
機械検証する。

1. **不透明な色トークンの上の文字**（`SOLID_PAIRS`）は、その色との組で 4.5:1。
   `--text-on-accent` は **テーマごとに別のインク**とする（light は `#FFFFFF`、
   dark は `#0F0F0F`）。既存の `--error-badge-text` と同じ形。
2. **半透明クロームの上の文字**（`TINTED_PAIRS`）は、`compositeOver()` で
   tint を下地 surface に合成した色に対して 4.5:1。下地は「そのクロームが
   実際に載りうる surface」を**列挙して宣言**する。
3. 宣言漏れは drift ガードで落とす。`rgba()` 単体値のトークンは
   `TINTED_PAIRS` か `TEXT_FREE_TINTS` のどちらかに必ず現れる。

この判定に合わせて色を調整した: light `--error` `#CC2121` → `#BC1E1E`、
light `--diff-color-removed` `#DC2626` → `#C72020` / `--diff-color-added`
`#15803D` → `#137538`、dark `--diff-color-removed` `#EF4444` → `#F05454`。
`--diff-color-*` は SVG の stroke でもあるため、canvas に対する 3:1 も同時に
検証する（バナー都合で動かした色が図で薄くならないように）。

バッジプレビューには `--badge-preview-text` を新設し、**両テーマで同じ値**に
する。背景がテーマに追従しない以上、前景も追従させるほうが誤りになる。

## 理由

- **`--accent` を暗くする解は取れない**。dark の `--accent` は「白文字の背景」
  であると同時に「暗い surface の上の文字」（`--bg-overlay` 上 4.68:1）でもある。
  白文字のために暗くすると後者が壊れる。動かすべきは背景ではなく前景で、
  per-theme インクなら両方を同時に満たせる。
- **合成は下地に依存するので、下地を宣言する以外に正しい判定がない**。
  「全 surface に対して安全側で判定する」案も検討したが、実在しない配置
  （settings notice が `--bg-void` に載るなど）のために `--text-link` や
  `--warning` を追加で暗くすることになる。Issue が求めていたのも
  「どの surface に載りうるかを決めること」だった。
- **宣言は必ず古くなるので、漏れは落とす**。列挙は手書きであり、コンポーネント
  の移動で古くなる。だから列挙そのものに drift ガードを置き、「書き忘れ」が
  「検証済み」に見えないようにする（ADR-2193 の `--text-*` / `--bg-*` ガードと
  同じ構造）。

## 却下した案

- **全 surface に対して合成を判定する**: 判定基準は 1 つで済み宣言表も不要に
  なるが、起こりえない配置に合わせて色を暗くすることになる。上記のとおり
  `--text-link` / `--warning` に不要な変更が波及するため却下した。
- **バッジプレビューに `--text-on-accent` を流用する**: light では白のままに
  なり、明るいバッジ色の上で 2.15:1 が残る。背景が別物である以上、トークンも
  別にする。
- **`.reference-badge-preview` の背景をテーマ追従にする**: 正しい方向だが、
  それは「Reference パネルが light でも dark パレットのバッジ色を表示する」と
  いう別の欠陥で、コントラストの修正とはスコープが違う。[#2482](https://github.com/kompiro/karasu/issues/2482) で追跡する。
