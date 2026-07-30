# AT: app.css モジュール分割とライトテーマ

- **日付**: 2026-05-20
- **関連 Issue**: [#1470](https://github.com/kompiro/karasu/issues/1470)
- **対象ファイル**: `packages/app/src/styles/`, `packages/app/src/theme/`,
  `packages/app/src/components/SettingsPane.tsx`,
  `packages/app/src/components/EditorPane.tsx`, `packages/app/index.html`

## 受け入れ条件（自動）

### テーマ解決・永続化 — `packages/app/src/theme/theme-storage.test.ts`

- [x] 保存値が無いときは preference が `"system"` になる

  > ✅ Automated — `theme-storage.test.ts` › `defaults to 'system' when nothing is stored`

- [x] 保存済みの有効な preference を返す / 無効値は `"system"` にフォールバック

  > ✅ Automated — `theme-storage.test.ts` › `returns a stored valid preference` / `falls back to 'system' when the stored value is invalid`

- [x] `"system"` を `prefers-color-scheme` から light / dark に解決する

  > ✅ Automated — `theme-storage.test.ts` › `derives 'system' from prefers-color-scheme: light` / `: dark`

- [x] `matchMedia` 不在時は `"system"` を dark に解決する

  > ✅ Automated — `theme-storage.test.ts` › `defaults 'system' to dark when matchMedia is unavailable`

- [x] preference を localStorage に永続化し、実効テーマを `<html data-theme>` に書く

  > ✅ Automated — `theme-storage.test.ts` › `persists the preference …` / `writes the effective theme onto <html data-theme>`

### ThemeProvider — `packages/app/src/theme/index.test.tsx`

- [x] provider 外で `useTheme` を呼ぶと例外を投げる

  > ✅ Automated — `index.test.tsx` › `throws when used outside a ThemeProvider`

- [x] 明示的な light / dark が `<html data-theme>` に反映される

  > ✅ Automated — `index.test.tsx` › `applies an explicit light preference …` / `dark …`

- [x] 切替で light・dark **両方** が `data-theme` と localStorage まで到達する（TPL-1402）

  > ✅ Automated — `index.test.tsx` › `drives both light and dark all the way to <html data-theme> and storage`

- [x] `"system"` のとき OS 設定に追従し、OS 変更をライブ反映する

  > ✅ Automated — `index.test.tsx` › `follows prefers-color-scheme …` / `live-updates when the OS scheme changes …`

- [x] 明示選択後は OS 変更を無視する

  > ✅ Automated — `index.test.tsx` › `ignores OS changes once an explicit preference is chosen`

### Settings のテーマセレクタ — `packages/app/src/components/SettingsPane.test.tsx`

- [x] テーマ見出しと System / Light / Dark の選択肢を表示する

  > ✅ Automated — `SettingsPane.test.tsx` › `renders the theme section heading` / `offers System, Light and Dark options`

- [x] 現在の preference を select 値に反映し、切替で適用＋永続化する

  > ✅ Automated — `SettingsPane.test.tsx` › `reflects the active theme preference …` / `applies and persists the chosen theme when switched`

- [x] select に `aria-label` が付く（TPL-1399）

  > ✅ Automated — `SettingsPane.test.tsx` › `labels the select for assistive tech (TPL-1399)`

### CSS トークン化 — `packages/app/src/styles/styles-no-raw-color.test.ts`

- [x] `layout.css` / `base.css` / `components/*.css` に生の色リテラルが無い（TPL-1001）

  > ✅ Automated — `styles-no-raw-color.test.ts` › `<file> has no raw color literals`

### ブラウザ実機での挙動 — `packages/e2e/tests/at-1470-app-theme.spec.ts`

OS のカラースキームは Playwright の `colorScheme` で emulate する。テーマ解決の
単体テスト（上記）に対して、こちらは「実際に描画された結果」を確認する層。

- [x] `localStorage` が空 + OS が **light** のとき、初回ロードから light になる

  > ✅ Automated — `at-1470-app-theme.spec.ts` › `first load with no stored preference follows the OS scheme, stamped before first paint`

- [x] `localStorage` が空 + OS が **dark** のとき、初回ロードから dark になる

  > ✅ Automated — `at-1470-app-theme.spec.ts` › `first load with no stored preference follows the OS dark scheme`

- [x] ロード時のちらつき（dark → light のフラッシュ）が無い

  > ✅ Automated — `at-1470-app-theme.spec.ts` › `first load with no stored preference follows the OS scheme, stamped before first paint` — 「ちらつきを見なかった」ことは直接観測できないため、それを防いでいる**機構**を fence する: `index.html` の boot script が `document.readyState === "loading"` の間（= `<head>` 内で同期的に、body が描画される前）に `data-theme` を stamp していることを `addInitScript` + `MutationObserver` で assert する。boot script を React 側へ移すとこのテストが落ちる。

- [x] Settings のテーマセレクタで即座に切り替わる / リロードしても維持される

  > ✅ Automated — `at-1470-app-theme.spec.ts` › `the Settings switch is immediate, survives a reload, and Monaco follows`

- [x] Monaco エディタがテーマに追従する（light で `karasu-light`）

  > ✅ Automated — `at-1470-app-theme.spec.ts` › `the Settings switch is immediate, survives a reload, and Monaco follows` — Monaco は独自のテーマ系統を持ち app パレットと独立に drift しうるため、エディタ背景の輝度を直接見る。

- [x] `system` のまま OS のカラースキームを変えるとライブで追従する

  > ✅ Automated — `at-1470-app-theme.spec.ts` › `preference 'system' follows a live OS scheme change without a reload`

- [x] light テーマの主要テキストが判読できる（primary は WCAG AA 4.5:1、secondary は実測 floor）

  > 🟡 Partially automated — `at-1470-app-theme.spec.ts` › `light-theme text stays legible: primary text meets WCAG AA, secondary keeps its floor`。primary（アクティブタブ / ファイルツリー / breadcrumb）は 12〜15:1 で AA を満たすため 4.5:1 を assert する。**secondary は AA を満たしていない** — 非アクティブタブ 4.02:1、ghost ボタン 3.51:1（11.5〜12px）で、これは fixture の都合ではなく light パレットの実際のギャップ。テストは AA を装わず実測 floor（3:1）を固定し、light パレットがこれ以上悪化することを防ぐ。ギャップ自体の是正は [#2193](https://github.com/kompiro/karasu/issues/2193) で追跡する（修正時に secondary の閾値も 4.5 へ上げる）。

## 受け入れ条件（手動 / 目視）

> 上の e2e で fence できない「見た目の質」だけが残る。
> `pnpm --filter @karasu-tools/app run dev` で起動して確認する。

- [ ] light テーマで、チャット / コンテキストメニュー / ノード詳細 /
      Reference パネル（e2e が到達していない surface）の文字が判読できる
- [ ] Monaco の構文ハイライトの色が light 背景で判読できる（背景の輝度は
      自動化済みだが、トークン色の見やすさは目視）
