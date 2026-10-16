# AT: App で translate を提供する

- **日付**: 2026-05-20
- **関連 Issue**: [#1463](https://github.com/kompiro/karasu/issues/1463)
- **対象ファイル**: `packages/app/src/components/TranslateDialog.tsx`, `packages/app/src/components/TranslateProvider.tsx`（旧 `TranslateFeature.tsx` — #1467 で改名）, `packages/core/src/translate/`
- **関連**: [ADR-1463](../adr/1463-app-translate.md)（translate を core に移設し App で提供）/ translate CLI [ADR-355](../adr/355-cli-translate-command.md) / TPL-219（CLI と App の translate output 一致）

## 受け入れ条件

`packages/app/src/components/TranslateDialog.test.tsx`,
`packages/app/src/components/TranslateProvider.test.tsx`,
`packages/core/src/translate/*.test.ts` でカバーされる。

- [x] コマンドパレットに「Translate Infra Config to .krs…」が登録され、選択するとダイアログが開く

  > ✅ Automated — `packages/app/src/components/TranslateProvider.test.tsx` › `registers a command palette entry that opens the translate dialog`

- [x] docker-compose を App 上で `deploy` ブロックに変換できる

  > ✅ Automated — `packages/app/src/components/TranslateDialog.test.tsx` › `translates a docker-compose file into a deploy block`

- [x] OpenAPI を変換し、`system` ブロックでラップできる

  > ✅ Automated — `packages/app/src/components/TranslateDialog.test.tsx` › `translates an OpenAPI spec wrapped in a system block`

- [x] `realizes` が解決できないとき警告が UI に表示される

  > ✅ Automated — `packages/app/src/components/TranslateDialog.test.tsx` › `surfaces warnings for an unresolved realizes`

- [x] 不正な入力でエラーが UI に表示され、App がクラッシュしない

  > ✅ Automated — `packages/app/src/components/TranslateDialog.test.tsx` › `shows an error and does not crash on invalid input`

- [x] 生成された `.krs` をクリップボードにコピーできる

  > ✅ Automated — `packages/app/src/components/TranslateDialog.test.tsx` › `copies the generated .krs to the clipboard`

- [x] 入力が変わると古い変換結果はクリアされる

  > ✅ Automated — `packages/app/src/components/TranslateDialog.test.tsx` › `clears a stale result when the input changes`

- [x] App と CLI は同じ変換ロジック（`translateInfraConfig` in `@karasu-tools/core`）を共有し、同一入力から同一 `.krs` を出力する（TPL-219）

  > ✅ Automated — `packages/core/src/translate/{compose,k8s,openapi,db,bindings}.test.ts`（core 側の変換テスト）および `packages/cli/src/translate/translate.e2e.test.ts`（CLI が同じ関数を呼ぶ e2e）

- [x] 実ブラウザで、サイドバーの「⇄ Translate」から開いたダイアログに docker-compose を貼り付けて変換すると、`Generated .krs` に `deploy` ブロックが出る（プロジェクトのファイルには書き込まない）

  > ✅ Automated — `packages/e2e/tests/at-1463-app-translate.spec.ts` › `the sidebar entry translates a pasted compose file into a deploy block`

- [x] Memory モードで、コマンドパレット（`Ctrl/Cmd+Shift+P`）の「Translate Infra Config to .krs…」からダイアログが開く（コマンドを登録する `TranslateProvider` は `App.tsx` でモード分岐の外側に置かれているので、Serve モードも同じコマンドを持つ）

  > ✅ Automated — `packages/e2e/tests/at-1463-app-translate.spec.ts` › `the palette command opens the dialog in memory mode`

- [x] 「Load file…」で読み込んだファイルの内容がテキストエリアに入り、Source name がファイル名から補完される。「↓ Download .krs」で `<Source name>.krs` が生成結果と同じ内容でダウンロードされる

  > ✅ Automated — `packages/e2e/tests/at-1463-app-translate.spec.ts` › `loading a file fills the source and the source name, and the result downloads`

- [x] 実ブラウザで不正な YAML を変換するとエラーが表示され、ダイアログを閉じた後も App を操作できる

  > ✅ Automated — `packages/e2e/tests/at-1463-app-translate.spec.ts` › `invalid YAML shows the error and the app stays usable`

## 手動確認チェックリスト

`examples/ja/getting-started/index.krs` を `index.krs` として Preview UI（Project モード）で開き、
`Ctrl/Cmd+Shift+P` → 「Translate Infra Config to .krs…」でダイアログを開いて確認する。

- [ ] ダイアログがモーダルとして中央に表示され、Esc・外側クリックで閉じる
- [ ] フォーマット選択（Docker Compose / Kubernetes / OpenAPI / DB schema）で詳細オプションが切り替わる
