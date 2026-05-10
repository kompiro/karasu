---
id: TPL-20260510-15
title: "dev tree のレイアウトに依存するパス / 設定は packaged / installed モードでも動くことを確認する"
status: active
date: 2026-05-10
applicable_to:
  - "拡張機能 / CLI / バンドルアプリなど、配布物がリポジトリの構造とは別レイアウトでインストールされる成果物"
  - "monorepo の `packages/foo` から `packages/bar` を参照する relative path / sibling 解決"
  - "dev サーバー / debug 起動と production 起動で挙動が分岐する初期化コード"
known_consumers:
  - vscode-extension
  - vscode-lsp
related_to:
  - TPL-20260510-13
discovered_from:
  - issue: "#1024"
  - root_cause_file: "packages/vscode/src/extension.ts:46"
topic: vscode
scope:
  packages:
    - vscode
    - lsp
    - cli
---

# TPL-20260510-15: dev tree のレイアウトに依存するパス / 設定は packaged / installed モードでも動くことを確認する

## 観点

karasu の VS Code 拡張や CLI のように **配布物としてユーザー環境にインストールされるパッケージ** は、開発時の monorepo レイアウト（`packages/vscode/` の隣に `packages/lsp/` がある、など）と、インストール後のレイアウト（`<extensions-root>/karasu.karasu-vscode-X.Y.Z/` の隣には `lsp/` など存在しない）で **ファイル配置が根本的に違う**。

dev tree の relative path（`asAbsolutePath(path.join("..", "lsp", "out", "server.js"))` のような `..` を含む参照）は dev では通るが packaged では破綻する。型エラーにも実行時例外にもならず、**「特定の機能だけサイレントに動かない」** という形で観測されるのが厄介。

#1024 では LSP server の path が dev 配置を前提にしていたため、`.vsix` 配布された拡張で LSP client が起動できず、Cmd+Click → editor jump（TC-03/TC-04）が無反応になっていた。E2E テスト（WebView ExTester）でようやく検出された。

## 想定される失敗モード

- 開発者の手元（`F5` での Extension Development Host）では完全に動くが、`.vsix` をインストールしたユーザー環境で **特定機能だけ動かない**
- エラーログにも何も出ず、「機能が存在するボタンを押しても何も起きない」形で観測される（LSP の起動失敗 → request の Promise が resolve しない → silent return）
- CI が dev tree でしか動かしていない場合、回帰が 0 件として通る
- 修正後に dev mode が動かなくなる（packaged 用パスを優先したが dev tree でその場所にファイルが無い）逆方向の事故も起きやすい

## チェックリスト

配布物に含まれる拡張機能 / CLI / アプリを実装・修正するとき、以下を確認する:

- [ ] dev tree 前提の relative path（`..` を含む `asAbsolutePath` / `path.resolve` / sibling package 参照）が無いか grep し、見つけたら **dev / packaged 両方の候補パス** を試す解決ロジックに置き換えているか
- [ ] 別 package のビルド成果物（`packages/lsp/out/`）を参照している場合、packaging ステップで **拡張内 (`packages/vscode/lsp/` 等) にコピー** するスクリプトを持っているか
- [ ] **dev mode と packaged mode の両方で同じテストが走る** 経路があるか（拡張なら ExTester で実 `.vsix` を install して動かすテスト）
- [ ] パス解決が失敗したときに **明示的なエラーログ** を出しているか（silent fallback で「動いているように見える」状態を作らない）
- [ ] バージョンアップで配布物の構造を変える PR では、dev / packaged の両方の path 解決が壊れていないことを差分でチェック

## 既知の対処パターン

- **候補パス配列 + `find(fs.existsSync)`** で複数の配置パターンに耐える解決ロジック（#1024 の修正パターン）。dev 配置と packaged 配置の両方を候補に並べる
- packaging 直前に `cp packages/lsp/out/* packages/vscode/lsp/` のような **bundling step** を持つ。手動コピーではなく `npm run build` / `vsce package` の前段に組み込む
- E2E に **packaged mode のスモーク** を 1 件入れる（拡張なら `.vsix` を install → 主要機能 1 つを実行）。dev mode テストだけだと dev 配置にしか存在しないファイルへの依存を検出できない
- パス解決が想定外になったとき、**stderr / output channel に経路をログ** して debug 容易性を確保する

## 関連テスト

- `packages/vscode-e2e/tests/webview/at-0038-cmd-click-hint.test.ts` — installed extension で LSP が動くかの E2E
- `packages/vscode/scripts/` — packaging 関連スクリプト（bundling step がここに入る）
