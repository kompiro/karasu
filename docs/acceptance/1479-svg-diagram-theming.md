# AT: SVG 図のライト / ダークテーマ対応

- **日付**: 2026-05-21
- **関連 Issue**: [#1479](https://github.com/kompiro/karasu/issues/1479)
- **関連 ADR**: [ADR-20260520-06](../adr/20260520-06-app-css-modularization-and-light-theme.md)
- **関連 TPL**: [TPL-20260510-06](../test-perspectives/TPL-20260510-06-display-mode-cross-surface.md)
- **対象ファイル**: `packages/core/src/renderer/palette.ts`,
  `packages/core/src/builtins/default-style.ts`, `packages/core/src/index.ts`,
  `packages/core/src/renderer/*.ts`, `packages/cli/src/render.ts`,
  `packages/app/src/hooks/useViewSvg.ts`, `packages/vscode/src/preview-panel.ts`

## 受け入れ条件（自動）

### パレット抽象 — `packages/core/src/renderer/palette.test.ts`

- [x] `resolvePalette()` は theme 省略時に dark パレットを返す

  > ✅ Automated — `palette.test.ts`

- [x] `resolvePalette("light")` / `resolvePalette("dark")` がそれぞれ light / dark パレットを返す

  > ✅ Automated — `palette.test.ts`

### built-in stylesheet の light 変種 — `packages/core/src/builtins/default-style.test.ts`

- [x] `getBuiltinStyleSheet("light")` がエラー無くパースされる

  > ✅ Automated — `default-style.test.ts` › `parses the light variant without errors`

- [x] theme 省略時は dark シートを返す（後方互換）

  > ✅ Automated — `default-style.test.ts` › `defaults to the dark sheet (backward compatible)`

- [x] dark / light シートは別々にキャッシュされ、異なる node 色を持つ

  > ✅ Automated — `default-style.test.ts` › `caches the dark and light variants separately` / `uses different node colors`

- [x] light 変種は dark とルール構造（selector / shape）が一致する

  > ✅ Automated — `default-style.test.ts` › `keeps the same rule structure`

### theme の全描画面貫通（TPL-20260510-06）— `packages/core/src/theme-meta.test.ts`

- [x] 15 個の SVG 生成エントリポイントすべてで theme 省略時の出力が `theme:"dark"` と byte 一致する（既存スナップショット不変）

  > ✅ Automated — `theme-meta.test.ts` › `default invocation is byte-identical to theme:'dark'`

- [x] 同じ 15 エントリポイントで `dark` と `light` の出力が異なる（theme が全描画面まで届く）

  > ✅ Automated — `theme-meta.test.ts` › `produces different SVG for dark vs light`

### CLI `karasu render --theme` — `packages/cli/src/render.test.ts`

- [x] `--theme light` が light テーマの `.svg` を出力する

  > ✅ Automated — `render.test.ts`

- [x] `--theme` 省略時は従来どおり dark を出力する（後方互換）

  > ✅ Automated — `render.test.ts`

## 受け入れ条件（手動 / 目視）

> 図の見た目はブラウザ / VS Code での目視確認が必要で、自動化対象外。

### 検証方法（app）

`pnpm --filter @karasu-tools/app run dev` で起動し、`index.krs` を開く。

1. app を **dark** テーマにする。

   - [ ] 図の背景・凡例・ノード色が従来どおり dark で表示される

2. Settings でテーマを **Light** に切り替える。

   - [ ] プレビュー内の SVG 図（キャンバス背景・凡例・ノード色）が light になり、
         app の chrome（パネル・ツールバー）と一致する
   - [ ] drill-down / all-layers / org / deploy の各ビューでも図が light になる

3. **Dark** に戻す。

   - [ ] 図も dark に戻る

4. `index.krs` に対応する `index.krs.style` でノード色を明示指定する。

   - [ ] 明示指定した色は light / dark どちらのテーマでも維持される
         （built-in シートより user シートが勝つ）

### 検証方法（CLI）

5. `karasu render index.krs --theme light -o out-light.svg` を実行する。

   - [ ] 出力 `.svg` が light テーマ（明るい背景）でレンダリングされる
   - [ ] ブラウザ以外（OS の画像プレビュー等）で開いても色が正しく表示される

### 検証方法（VS Code 拡張）

6. VS Code を light カラーテーマにして `.krs` ファイルのプレビューを開く。

   - [ ] プレビューの図がエディタテーマに合わせて light になる

7. VS Code を dark カラーテーマに切り替える。

   - [ ] プレビューの図が dark に追従して再レンダリングされる
