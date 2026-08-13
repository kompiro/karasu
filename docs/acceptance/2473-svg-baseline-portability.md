# AT-2473: テキストの縦位置を `dy` で出す（SVG の可搬性）

- **日付**: 2026-08-13
- **Issue**: [#2473](https://github.com/kompiro/karasu/issues/2473)（[#2366](https://github.com/kompiro/karasu/issues/2366) の P9 を分離）
- **設計 (ADR)**: [ADR-2473](../adr/2473-dy-instead-of-dominant-baseline.md)
- **関連 ADR**: [ADR-22](../adr/22-svg-export-two-phase.md)（エクスポート SVG の到達先）、[ADR-1805](../adr/1805-resvg-wasm-png-rasterization.md)（PNG 経路と同梱フォント）
- **Related TPLs**: [TPL-1001](../test-perspectives/TPL-1001-display-mode-cross-surface.md)（surface 間の一貫性 — 配置方式を 1 系統に保つ）
- **対象**: `packages/core/src/renderer/svg-builder.ts`、`badge.ts`、`corner-lane.ts`、`multi-level-svg.ts`、`svg-renderer.ts`

## 概要

`dominant-baseline` は SVG の text module に属し、ブラウザ以外のラスタライザには
無視するものがある。無視されるとテキストはベースラインに落ち、カードの中で
3〜4.5px 上に浮く（Chromium 実測）。縦位置を em 単位の `dy`（SVG 1.1 コア）に
置き換えて、どのラスタライザでも同じ位置に載るようにする。

置換の誤差は 0.35px 以下で、レイアウト座標は 1px も動かない。

## 受け入れ条件

### AC-1: `dominant-baseline` を出力しない

> ✅ Automated by `packages/core/src/renderer/baseline-portability.test.ts` (suite-wide)

- [x] renderer の各モジュール（テスト以外）のソースに `"dominant-baseline":` が現れない
- [x] system / deploy / org の実出力に `dominant-baseline` が現れない（空レンダで通らないよう `<text>` の存在も確認する）
- [x] system / deploy の出力に `dy="0.35em"` が現れる
- [x] アイコン slot の description は `dy: DY_HANGING` を使う（この経路は SVG アイコン登録が要るので呼び出し側で固定する）

### AC-2: 縦位置が現状と一致する

> ✅ Automated by `packages/core/src/renderer/svg-renderer.test.ts` (suite-wide)

- [x] ghost domain の sub-label が `dy="0.35em"` 付きで、座標は従来どおり（`x="60" y="84"`）

### AC-3: レイアウトが動かない

- [x] コミット済みガイド図 18 枚の差分が属性の置換のみで、`x` / `y` が 1 つも変わらない（本 PR の diff で確認: 93 行の置換のみ）

> ✅ Automated — `scripts/guide/gen-guide-diagrams.test.ts` › `the committed guide diagrams + image refs are up to date` が再生成結果との一致を検査する（座標が動けば図の差分として現れる）

### AC-4: 手動確認（実機）

判定に実機が要るものだけを残す。座標と属性の不変条件は AC-1〜AC-3 が判定済み。

- [ ] https://karasu.kompiro.dev/ でカードのラベル・説明・チップの縦位置が従来と変わって見えない（0.35px の差は知覚できない想定の確認）
- [ ] `karasu render --format svg` の出力を Inkscape など SVG エディタで開き、テキストがカード内で中央に載っている
