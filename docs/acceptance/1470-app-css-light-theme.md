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

  > ✅ Automated — `styles-no-raw-color.test.ts` › `<file> has no raw color literals` — data-URI に percent-encode された色（`%23RRGGBB`）も検出する。#2193 で `<select>` シェブロンがこの形で dark の値を焼き込んでいた。

### トークンのコントラスト — `packages/app/src/styles/theme-contrast.test.ts`

- [x] 文字系トークンが dark / light 両セットで全 opaque surface に対し 4.5:1 以上（TPL-2193）

  > ✅ Automated — `theme-contrast.test.ts` › `<set> set` › `--<token> clears AA on every opaque surface` — 判定は `packages/core` の `contrastRatio()`（canvas 側の `default-style-contrast.test.ts` と同一実装）。

- [x] 自前の背景を持つバナー（export error / OPFS）の文字が 4.5:1 以上、選択行のアイコンが 3:1 以上

  > ✅ Automated — `theme-contrast.test.ts` › `--<token> clears AA on --<bg>` / `--text-muted clears the non-text minimum on --bg-selected` — グラデーション背景は全 stop に対して測る。

- [x] 色トークンの上に載る文字（`--text-on-accent` / バッジプレビュー）が 4.5:1 以上（TPL-2193）

  > ✅ Automated — `theme-contrast.test.ts` › `--text-on-accent clears AA on --accent` / `--badge-preview-text clears AA on every annotation badge color` — dark の `--accent` の上の白文字は 3.14:1 だった（#2461）。背景が明るい色なので前景をテーマごとのインクにして解く。

- [x] 半透明クロームの上の文字が、下地と合成した色に対して 4.5:1 以上（TPL-2193）

  > ✅ Automated — `theme-contrast.test.ts` › `--<token> clears AA on --<tint> over <surfaces>` — 判定は `compositeOver()`。下地は「そのクロームが載りうる surface」を宣言し、宣言漏れは同ファイルの drift ガード（`accounts for every translucent token this set defines`）が落とす。

- [x] `--diff-color-*` がパネル本文の文字として 4.5:1 以上（TPL-2193）

  > ✅ Automated — `theme-contrast.test.ts` › `--diff-color-* clears AA as panel text on bg-raised` — バナーのラベル・SVG stroke に続く 3 つ目の役割（node detail の annotation diff list）。他 2 つの都合で色を動かしたときにここが沈まないよう固定する。

- [x] テキストを `opacity` で減光していない（減光は明度の違うトークンで表現する）

  > ✅ Automated — `styles-no-raw-color.test.ts` › `<file> dims nothing readable with opacity` — opacity は描画結果を暗くするがトークン値には現れないため、トークンを測る fence は減光前の比で合格を出す。edge-detail の removed 行が実際にそれで 2.95:1 のまま通っていた。装飾（SVG diff state・アイコン・disabled）は許可リストに理由付きで列挙し、消えた selector が残らないことも検証する。

- [x] `--diff-color-*` が SVG stroke として canvas 上で 3:1 以上（非文字基準）

  > ✅ Automated — `theme-contrast.test.ts` › `--<token> stays visible as a stroke on the diagram` — バナーのラベル都合で動かした色が図で薄くならないことを担保する。

- [x] 文字階層のランプが primary → secondary → tertiary → muted の順に暗くなる

  > ✅ Automated — `theme-contrast.test.ts` › `keeps the text hierarchy ordered from primary to muted` — AA を満たすとランプは圧縮されるため、順序の逆転（muted が secondary より明るい）を明示的に禁じる。

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

- [x] light テーマのテキストが primary / secondary とも WCAG AA（4.5:1）を満たす

  > ✅ Automated — `at-1470-app-theme.spec.ts` › `light-theme text meets WCAG AA, primary and secondary alike`。primary（アクティブタブ / ファイルツリー / breadcrumb）に加え、secondary（非アクティブタブ 4.02:1、ghost ボタン 3.51:1 だった 11.5〜12px の面）も 4.5:1 で assert する。[#2193](https://github.com/kompiro/karasu/issues/2193) で light の `--text-muted` を暗くして解消済み。トークン値そのものは `theme-contrast.test.ts` が検証し、こちらは「どのトークンに解決され、透明祖先を辿った先が何色か」という実描画側を見る。

- [x] dark テーマのテキストも同じ面で WCAG AA を満たす

  > ✅ Automated — `at-1470-app-theme.spec.ts` › `dark-theme text meets WCAG AA on the same surfaces`。既定テーマである dark の `--text-muted` は `--bg-overlay` 上で 1.78:1 と light より悪かった（#2193）。light だけを assert していると、同じ欠陥のより重い半分が通過する。

- [x] コマンドパレットの選択行が light / dark とも WCAG AA を満たす

  > ✅ Automated — `at-1470-app-theme.spec.ts` › 上記 2 テストの末尾（`Ctrl/Cmd+Shift+P` で開いて `[role="option"][aria-selected="true"]` を測る）。トークンの組は `theme-contrast.test.ts` が担保するが、「その行が実際にその組に解決されるか」はキーストローク経由でしか到達できないため実ブラウザで見る（#2461）。

## 受け入れ条件（手動 / 目視）

> 上の e2e で fence できない「見た目の質」だけが残る。
> 本番 app（https://karasu.kompiro.dev/）を開いて確認する。

- [ ] light テーマで、チャット / コンテキストメニュー / ノード詳細 /
      Reference パネル（e2e が到達していない surface）の文字が判読できる
- [ ] Monaco の構文ハイライトの色が light 背景で判読できる（背景の輝度は
      自動化済みだが、トークン色の見やすさは目視）
- [ ] dark テーマが #2193 のランプ持ち上げ後も "Onyx Cartographer" の
      見え方を保っている（`--text-muted` を 1.78:1 から 4.81:1 へ上げたため、
      dim だった文字・アイコンが全体に明るくなる。比は自動化済みで、
      階層の印象が崩れていないかだけが目視）
