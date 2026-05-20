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

- [x] 切替で light・dark **両方** が `data-theme` と localStorage まで到達する（TPL-20260518-01）

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

- [x] select に `aria-label` が付く（TPL-20260516-01）

  > ✅ Automated — `SettingsPane.test.tsx` › `labels the select for assistive tech (TPL-20260516-01)`

### CSS トークン化 — `packages/app/src/styles/styles-no-raw-color.test.ts`

- [x] `layout.css` / `base.css` / `components/*.css` に生の色リテラルが無い（TPL-20260510-06）

  > ✅ Automated — `styles-no-raw-color.test.ts` › `<file> has no raw color literals`

## 受け入れ条件（手動 / 目視）

> CSS の見た目とテーマのちらつきはブラウザでの目視確認が必要で、自動化対象外。
> `pnpm --filter @karasu-tools/app run dev` で起動して確認する。

### 検証方法

1. `localStorage` を空にし、OS のカラースキームを **dark** にしてアプリを開く。

   - [ ] dark テーマで表示される

2. OS のカラースキームを **light** にし、`localStorage` を空のままリロードする。

   - [ ] 初回ロードから light テーマで表示される（OS 設定に追従）

3. Settings ペインを開き、テーマセレクタで **Light** を選ぶ。

   - [ ] 即座に light テーマへ切り替わる
   - [ ] リロードしても light のまま（永続化されている）
   - [ ] ロード時にテーマのちらつき（dark → light のフラッシュ）が無い

4. テーマセレクタで **System** に戻し、OS のカラースキームを切り替える。

   - [ ] OS 設定に追従してテーマがライブで切り替わる

5. light テーマのまま、主要パネルの可読性を確認する。

   - [ ] サイドバー / ツールバー / タブバー / チャット / 設定 /
         コンテキストメニュー / ノード詳細 / Reference パネルの文字が判読できる
   - [ ] Monaco エディタが `karasu-light` になり、構文ハイライトが判読できる
   - [ ] プレビューキャンバスが明るい背景になる（図そのものは現状のまま）
