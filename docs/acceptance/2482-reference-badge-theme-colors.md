# AT-2482: Reference パネルのバッジ色がテーマに追従する

- **日付**: 2026-08-14
- **関連 Issue**: [#2482](https://github.com/kompiro/karasu/issues/2482)（light テーマで dark パレットのバッジ色が出る）、[#2461](https://github.com/kompiro/karasu/issues/2461)（バッジプレビューの可読性）
- **設計 (ADR)**: [ADR-2482](../adr/2482-themed-badge-color-single-source.md)
- **関連 ADR**: [ADR-2461](../adr/2461-accent-ink-and-composited-contrast.md)（色の上の文字は per-theme のインク）、[ADR-1479](../adr/1479-svg-diagram-theming.md)（light / dark パレット）
- **Related TPLs**: [TPL-1001](../test-perspectives/TPL-1001-display-mode-cross-surface.md)（グローバル切替は全描画面を点検・cross-surface は同一ソースから）、[TPL-2366](../test-perspectives/TPL-2366-badge-color-canvas-contrast.md)（バッジ色のテーマ別 4.5:1）、[TPL-1415](../test-perspectives/TPL-1415-shared-vocabulary-dual-representation.md)（語彙の二重表現の同期）
- **対象**: `packages/core/src/builtins/reference-data.ts` / `reference.ts` / `default-style.ts`、`packages/app/src/components/ReferenceContent.tsx`、`packages/app/src/styles/themes.css`

## 概要

アノテーションのバッジ色を `{ dark, light }` の対にして `reference-data.ts` に集約し、
built-in シート（図が描く色）と Reference パネルの swatch（読み手が色を選ぶ面）が
アクティブなテーマで同じ値を引くようにする。バッジプレビューのインクも通常のテーマ対
になり、light では白へ倒す。

## 受け入れ条件

### AC-1: パネルの swatch がテーマのパレットを塗る

- [x] dark テーマで `@deprecated` の swatch が `#EF4444`、light テーマで `#DC2626` になる

> ✅ Automated — `packages/app/src/components/ReferenceContent.test.tsx` › `Tags tab paints the dark badge swatch with that theme's color` / `Tags tab paints the light badge swatch with that theme's color`

- [x] 6 つの annotation すべてで、swatch の色が同テーマの built-in シートの `badge-color` と一致する（パネルと図が同じ値を引く）

> ✅ Automated — `packages/app/src/components/ReferenceContent.test.tsx` › `Tags tab swatches agree with the builtin sheet's badge-color per theme`

### AC-2: 色は reference-data が単一ソース

- [x] dark / light 両シートの `badge-color` が `defaultBadge.color[theme]` と一致する（`LIGHT_BADGE_COLORS` の複製が残っていない）

> ✅ Automated — `packages/core/src/builtins/default-style.test.ts` › `dark badge colors come from reference-data defaultBadge.color` / `light badge colors come from reference-data defaultBadge.color`

- [x] すべての annotation が light に固有の色を持つ（dark 値のフォールバックで済ませていない）

> ✅ Automated — `packages/core/src/builtins/default-style.test.ts` › `gives light its own badge color for every annotation`

- [x] すべての annotation が dark / light 両方に `#RRGGBB` を持つ

> ✅ Automated — `packages/core/src/builtins/reference-data.test.ts` › `annotations: every default badge carries a hex color for both themes`

### AC-3: swatch のインクが両テーマで AA を満たす

- [x] `--badge-preview-text` が、そのテーマの 6 バッジ色すべてに対して 4.5:1 以上（バッジ色は `getReference()` から読み、テストにリテラルを複製しない）

> ✅ Automated — `packages/app/src/styles/theme-contrast.test.ts` › `--badge-preview-text clears AA on every annotation badge color`

- [x] 図に描かれる badge-color 自体も両テーマの canvas 背景に対して AA を満たす（色の移設で退行していない）

> ✅ Automated — `packages/core/src/builtins/default-style-contrast.test.ts` › `badge-color of %s is AA-legible on the canvas`

## 手動確認

- [ ] light テーマの app で Reference の Tags & Annotations タブを開き、各 swatch の色が、同じアノテーションを付けたノードのプレビュー上のバッジ色と同じに見える（dark でも同様）
