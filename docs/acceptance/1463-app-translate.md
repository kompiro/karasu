# AT: App で translate を提供する

- **日付**: 2026-05-20
- **関連 Issue**: [#1463](https://github.com/kompiro/karasu/issues/1463)
- **対象ファイル**: `packages/app/src/components/TranslateDialog.tsx`, `packages/app/src/components/TranslateFeature.tsx`, `packages/core/src/translate/`
- **関連**: [ADR-20260520-02](../adr/20260520-02-app-translate.md)（translate を core に移設し App で提供）/ translate CLI [ADR-20260409-02](../adr/20260409-02-cli-translate-command.md) / TPL-20260510-11（CLI と App の translate output 一致）

## 受け入れ条件

`packages/app/src/components/TranslateDialog.test.tsx`,
`packages/app/src/components/TranslateFeature.test.tsx`,
`packages/core/src/translate/*.test.ts` でカバーされる。

- [x] コマンドパレットに「Translate Infra Config to .krs…」が登録され、選択するとダイアログが開く

  > ✅ Automated — `packages/app/src/components/TranslateFeature.test.tsx` › `registers a command palette entry that opens the translate dialog`

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

- [x] App と CLI は同じ変換ロジック（`translateInfraConfig` in `@karasu-tools/core`）を共有し、同一入力から同一 `.krs` を出力する（TPL-20260510-11）

  > ✅ Automated — `packages/core/src/translate/{compose,k8s,openapi,db,bindings}.test.ts`（core 側の変換テスト）および `packages/cli/src/translate/translate.e2e.test.ts`（CLI が同じ関数を呼ぶ e2e）

## 手動確認チェックリスト

`examples/ja/getting-started/index.krs` を Preview UI（Project モード）で開き、
`Ctrl/Cmd+Shift+P` → 「Translate Infra Config to .krs…」でダイアログを開いて確認する。
jsdom では描画やファイルダウンロードを検証できないため、実ブラウザで確認する。

- [ ] ダイアログがモーダルとして中央に表示され、Esc・外側クリックで閉じる
- [ ] フォーマット選択（Docker Compose / Kubernetes / OpenAPI / DB schema）で詳細オプションが切り替わる
- [ ] 「Load file…」で実ファイルを読み込むと内容がテキストエリアに反映され、Source name が補完される
- [ ] 変換結果の `.krs` がプレビューに表示され、「Download .krs」で `.krs` ファイルがダウンロードされる
- [ ] Memory モード / Serve モードでもコマンドパレットからダイアログを開いて変換できる
