---
type: tooling
---

# AT-0073: VS Code WebView E2E harness — Phase 3 / AT-0038 editor jump (deferred)

## 概要

Phase 3 / AT-0038 の続編として、AT-0072 (#1017) で hint visibility（TC-01,
TC-02）まで自動化していた `at-0038-cmd-click-hint.test.ts` に **modifier-click
で editor cursor が移動する** TC-03 / TC-04 の実装を追加する PR
（Issue [#1014](https://github.com/kompiro/karasu/issues/1014) Phase 3、設計は
`docs/design/vscode-webview-e2e-harness.md`）。

**ただし TC-03 / TC-04 は `it.skip` として merge する**。理由は次のセクションを
参照。実装と doc は `vscode-webview-e2e` ハーネスが LSP に到達できるように
なった時点で un-skip すれば動かせる状態にしてある。

## TC-03 / TC-04 を skip にした経緯

CI の最初の数回で TC-03 / TC-04 が再現性高く失敗した（cursor が `Ln 1, Col 1`
から動かない）。screenshot artifact + `handleNavigate` の早期 return ルートを
追ったところ、原因は karasu 拡張本体の **LSP server module path が
インストール時に解決できない** ことだと判明した。

- `packages/vscode/src/extension.ts:40`:
  ```ts
  const serverModule = context.asAbsolutePath(path.join("..", "lsp", "out", "server.js"));
  ```
- 開発ツリーでは `packages/vscode/../lsp/out/server.js` が存在するため動く。
- しかし `vsce.createVSIX({ cwd: packages/vscode })` が作る `.vsix` には
  `packages/vscode` 配下のファイルしか入らない。インストール後の
  extensionPath からの `..` は `~/.vscode/extensions/` を指してしまい、
  `lsp/out/server.js` は存在しない。
- 結果として `LanguageClient.start()` がサーバを起動できず、
  `handleNavigate` 内の `client.sendRequest(PositionOfNodeRequest, ...)` は
  応答が来ず、`editor.selection` の代入まで到達しない。

ATs が WebView 側 click ハンドラ → postMessage → 拡張ホスト で完結する
TC-02（drill）は問題なく PASS している。LSP を経由する navigate path だけが
詰まる、という切り分けが取れている。

このブロッカは **AT-0073 の自動化スコープ外** だが、修正されれば次の通り
unblock できる:

1. `packages/vscode/src/extension.ts` の serverModule 解決を、
   `../lsp/out/server.js`（dev）と extension 配下の同梱パス（installed）の
   両方を試すフォールバック式にする。
2. ビルド時に `packages/lsp/out/*` を `packages/vscode/lsp/` などへコピーして
   `.vsix` 内に同梱する。
3. このテストファイルの `it.skip` を `it` に戻す。

## スコープ（本 PR で実際に行ったこと）

- 既存 `at-0038-cmd-click-hint.test.ts` を **single big `it()` から
  `before/after` + 4 `it()`** に refactor。`ensureWebViewFrame()`、
  `dispatchClick()`、`readBreadcrumb()`、`readEditorLine()`、
  `clickAndAwaitCursor()` の helper を切り出し、再 acquire / 再 dispatch を
  centralize した。
- TC-01 / TC-02 は automated のまま PASS する。
- TC-03 / TC-04 は **`it.skip`** で source に残した。LSP packaging が直れば
  そのまま un-skip できるようコメントで TODO を残した。
- AT-0038 doc を Coverage policy: Partial automation のまま据え置き、TC-03/04
  が skip 状態である理由を追記。
- AT-0038 doc の TC-05 を「Phase 6 で実装方針が変わった。AT-0039 TC-01 が
  代替自動化済み」と書き直し（superseded）。

技術ポイント（refactor 由来）:

1. **modifier+click は OS キーボード入力を再現せず、`dispatchEvent` の
   MouseEvent オプションで `{ ctrlKey: true, metaKey: true }` を渡す**。
   WebView 側 click handler は `e.metaKey || e.ctrlKey` を見るので、
   この合成イベントで navigate path に入る。xvfb 上での Selenium Actions API
   のキー入力に依存しないため、CI 安定性が高い（このパターンは LSP packaging
   が直った後でもそのまま使える）。
2. **navigate 経路は `webview.html` を再代入しない**。`handleNavigate` は
   `editor.selection` を書き換えるだけなので、Cmd/Ctrl+Click 後は iframe
   コンテキストが生きたままで、`switchBack`/`switchToFrame` の再アタッチは
   drill click のときだけで良い。
3. **editor cursor の検証は `EditorView.openEditor(FIXTURE_NAME, 0)` で
   .krs エディタを active 化してから `TextEditor.getCoordinates()` を読む**。
   座標は 1-indexed の `[line, column]` を返すので、fixture の line 定数
   （`OrderService=2`, `OrderManagement=3`）と直接比較する。

## 受け入れ条件

### AC-1: TC-01 / TC-02 が PASS する（既存）

- [x] TC-01: root view で `#jump-hint` が visible + テキスト一致
> ✅ Automated — `packages/vscode-e2e/tests/webview/at-0038-cmd-click-hint.test.ts` › `TC-01: shows the hint text on the root view` (CI は `vscode-webview-e2e` ラベル opt-in、xvfb 必要のため required check には昇格しない)

- [x] TC-02: drill 後も `#jump-hint` が visible
> ✅ Automated — `packages/vscode-e2e/tests/webview/at-0038-cmd-click-hint.test.ts` › `TC-02: keeps the hint visible after plain-clicking a parent node to drill in` (CI は `vscode-webview-e2e` ラベル opt-in、xvfb 必要のため required check には昇格しない)

### AC-2: TC-03 / TC-04 の実装が `it.skip` で merge されている

- [ ] TC-03 / TC-04 のテストブロックが書かれており、`it.skip(...)` で
  CI からはスキップされる
- [ ] 上の docblock と本ファイルに、LSP packaging blocker (#1024) の解消手順が
  記述されている

> 本 AC は LSP packaging blocker (#1024) が解消した時点で un-skip + AC-3 へ昇格する想定。

### AC-3: AT-0038 doc の Coverage policy が更新される

- [ ] `docs/acceptance/0038-vscode-phase4-5-cmd-click-hint.md` に TC-03/04 が
  `it.skip` 状態である旨と blocker の概要が書かれている
- [ ] TC-05 が「Phase 6 で実装方針が変わり、AT-0039 TC-01 で代替自動化済み」と
  明記されている

> 上記項目は本 PR 内のドキュメント編集で対応済み。リリース QA で目視レビューする。

## 自動化された検証

- `packages/vscode-e2e/tests/webview/at-0038-cmd-click-hint.test.ts` —
  TC-01 / TC-02 が PASS、TC-03 / TC-04 は `it.skip`。CI は
  `vscode-webview-e2e` ラベルでオプトイン。

## 手動確認項目

- [ ] ローカルで `pnpm --filter @karasu-tools/vscode-e2e run test:webview` を
  実行し、4 スイート（runner smoke + AT-0039 + AT-0038 hint+jump）のうち
  `2 passing, 2 pending`（pending = skip）になることを目視確認する。
- [ ] 失敗した場合は `packages/vscode-e2e/test-resources/screenshots/` の
  状態を見て、selector 関連のリグレッションか / VS Code 起動シーケンスの
  揺れかを切り分ける。

## スコープ外

- LSP packaging の修正（フォローアップ Issue で扱う）
- AT-0037-9（SVG-click による editor ↔ preview 双方向ジャンプの SVG 側） — 同じ LSP packaging blocker (#1024) 配下
- AT-0039 残り TC（description / link / Jump-to-editor / [ⓘ] ボタン） — Phase 3 内の別 PR
- AT-0042-vscode（cross-diagram navigation） — Phase 3 内の別 PR
- ADR-20260428-05 の supersede — Phase 3 完了時に実施

## 関連

- Issue: [#1014](https://github.com/kompiro/karasu/issues/1014)
- 設計: `docs/design/vscode-webview-e2e-harness.md`
- 同 Phase の hint visibility AT: `docs/acceptance/0072-vscode-webview-e2e-phase3-at-0038.md`
- 既存 ADR: ADR-20260428-03（拡張ホスト smoke）, ADR-20260428-05（マニュアル運用 — Phase 3 完了時に supersede 予定）
