# AT: SVG 図のライト / ダークテーマ対応

- **日付**: 2026-05-21
- **関連 Issue**: [#1479](https://github.com/kompiro/karasu/issues/1479)
- **関連 ADR**: [ADR-1470](../adr/1470-app-css-modularization-and-light-theme.md)
- **関連 TPL**: [TPL-1001](../test-perspectives/TPL-1001-display-mode-cross-surface.md)
- **対象ファイル**: `packages/core/src/renderer/palette.ts`,
  `packages/core/src/builtins/default-style.ts`, `packages/core/src/index.ts`,
  `packages/core/src/renderer/*.ts`, `packages/cli/src/render.ts`,
  `packages/app/src/hooks/useViewSvg.ts`, `packages/vscode/src/preview-panel.ts`,
  `packages/vscode/src/theme-mapping.ts`（`ColorThemeKind` → theme 対応、#2002 で抽出）

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

### theme の全描画面貫通（TPL-1001）— `packages/core/src/theme-meta.test.ts`

- [x] すべての SVG 生成エントリポイント（org-tree view を含む）で theme 省略時の出力が `theme:"dark"` と byte 一致する（既存スナップショット不変）

  > ✅ Automated — `theme-meta.test.ts` › `default invocation is byte-identical to theme:'dark'`

- [x] 同じエントリポイントで `dark` と `light` の出力が異なる（theme が全描画面まで届く）

  > ✅ Automated — `theme-meta.test.ts` › `produces different SVG for dark vs light`

### CLI `karasu render --theme` — `packages/cli/src/render.test.ts`

- [x] `--theme light` が light テーマの `.svg` を出力する

  > ✅ Automated — `render.test.ts`

- [x] `--theme` 省略時は従来どおり dark を出力する（後方互換）

  > ✅ Automated — `render.test.ts`

### app の view フックが theme を転送する — `packages/app/src/hooks/useSystemView.test.tsx`

- [x] システムビュー（既定のプレビュー面）の hook が theme を compileProject に渡し、light / dark で SVG が変わる

  > ✅ Automated — `useSystemView.test.tsx` › `threads the theme into the rendered system-view SVG`

### app 実機でのテーマ追従 — `packages/e2e/tests/at-1479-svg-theming.spec.ts`

`theme-meta.test.ts` は「各エントリポイントが dark / light で異なる出力を出す」
ことを証明するが、app が実際にテーマ変更で**再描画するか**、そして
**system 以外の描画面**（drill-down / all-layers / org / deploy）にも theme が
届くかは示さない。後者は TPL-20260510-06 がグローバル描画切替について警告する
cross-surface のギャップそのもの。

判定にはキャンバス背景（レンダラーがパレットから出す単一の `<rect fill>`）の
輝度を使う。theme が届かなかったビューは light の app 上で dark のまま残るため
検出できる。色の完全一致ではなく輝度帯で見るので、パレット微調整では落ちない。

- [x] dark テーマで図の背景・ノード色が dark で表示される

  > ✅ Automated — `at-1479-svg-theming.spec.ts` › `the diagram follows a theme switch and returns on switching back`

- [x] Light へ切り替えると SVG 図（キャンバス背景・ノード色）が light になる

  > ✅ Automated — `at-1479-svg-theming.spec.ts` › `the diagram follows a theme switch and returns on switching back` — 背景だけでなくノード fill も変わることを assert する（背景だけ追従してノードパレットが取り残される回帰を拾う）。

- [x] drill-down / all-layers / org / deploy の各ビューでも図が light になる

  > ✅ Automated — `at-1479-svg-theming.spec.ts` › `every drawing surface threads the theme (TPL-20260510-06)` — all-layers は `<iframe srcDoc>` に描画されるため frame 越しに読む（app document で止まった theme はここで露見する）。all-layers トグルは root レベルでのみ有効なので drill-down より前に検証する。

- [x] **Dark** に戻すと図も dark に戻る

  > ✅ Automated — `at-1479-svg-theming.spec.ts` › `the diagram follows a theme switch and returns on switching back` — 元の dark ノード色に戻ることまで assert する（TPL-20260518-01: 双方向の遷移を両方描画させる）。

- [x] 明示指定したノード色は light / dark どちらでも維持される

  > ✅ Automated — `at-1479-svg-theming.spec.ts` › `an explicitly styled node colour is identical under both themes` — user シートの色が両テーマで不変であることに加え、同じ切替でキャンバスが実際に変化することも assert するので、no-op で緑になることはない。

## 受け入れ条件（手動 / 目視）

> 図の「見た目の質」と CLI / VS Code 側は目視確認が残る。

### 検証方法（app）

- [ ] light テーマで凡例（legend）の文字・スウォッチが判読できる
      （キャンバスとノードの追従は自動化済み）

### 検証方法（CLI）

1. `karasu render index.krs --theme light -o out-light.svg` を実行する。

   - [ ] 出力 `.svg` が light テーマ（明るい背景）でレンダリングされる
   - [ ] ブラウザ以外（OS の画像プレビュー等）で開いても色が正しく表示される

### 検証方法（VS Code 拡張）

> 🟡 Partially automated — `packages/vscode/src/theme-mapping.test.ts` › `diagramThemeFromColorTheme` が
> `ColorThemeKind` 全 4 値（Light / Dark / HighContrast / HighContrastLight）→ diagram theme の
> 対応表を fence する（#2002）。テーマ変更への追従再レンダリングと図の見た目は、WebView 側の
> 描画面であり app e2e の射程外なので以下の目視確認のまま。

1. VS Code を light カラーテーマにして `.krs` ファイルのプレビューを開く。

   - [ ] プレビューの図がエディタテーマに合わせて light になる

2. VS Code を dark カラーテーマに切り替える。

   - [ ] プレビューの図が dark に追従して再レンダリングされる
