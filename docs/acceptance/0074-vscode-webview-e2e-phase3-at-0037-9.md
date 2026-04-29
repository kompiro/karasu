---
type: tooling
---

# AT-0074: VS Code WebView E2E harness — Phase 3 / AT-0037-9 bidirectional jump

## 概要

Phase 3 の続編として、AT-0037-9（Phase 5 の no-regression テスト
"Bidirectional Jump Still Works"）の **editor cursor → SVG highlight
方向** を ExTester WebView ハーネスへ移植する
（Issue [#1014](https://github.com/kompiro/karasu/issues/1014) Phase 3、設計は
`docs/design/vscode-webview-e2e-harness.md`）。

AT-0037-9 のもう一方の direction（SVG node click → editor jump）は、
Phase 6 (#250) で実装方針が変わった後の現行挙動が以下 2 つの AT で
既に自動化済みである:

- **Cmd/Ctrl+Click on a node → editor jump**: AT-0038 TC-03 / TC-04
- **Plain click on a leaf → detail panel opens**: AT-0039 TC-01

したがって本 AT のスコープは editor → SVG 方向のみ。

## スコープ

- 新テスト `at-0037-9-bidirectional-jump.test.ts` 1 ファイル / 1 `it()`:
  AT-0038 fixture を再利用し、`TextEditor.moveCursor(2, 11)` で `OrderService`
  identifier に cursor を置く → debounce(150ms)+LSP roundtrip 待ち →
  WebView frame で `[data-node-id="OrderService"]` の class 属性に
  `karasu-highlighted` が含まれることを assert。
- AT-0037 doc の TC-9 を **Manual → Automated** に更新。SVG-click 方向は
  AT-0038 TC-03/04 と AT-0039 TC-01 で代替自動化済みである旨を追記。

技術ポイント:

1. **cursor watcher は 150ms debounce + LSP roundtrip を経由する**。
   `extension.ts:115` の `onDidChangeTextEditorSelection` がデバウンサと
   LSP `karasu/nodeAtPosition` リクエストをチェーンし、応答 nodeId を
   `previewPanel.highlight()` 経由で WebView へ post する。テストは
   `driver.wait` で WebView 側 class 属性をポーリングし、これら全部が
   完了したのを検出する。
2. **highlight handler は class を加算する**。WebView の handler は
   `el.classList.add('karasu-highlighted')` を呼ぶだけなので、
   既存 class（例: `data-has-children` から派生する style 関連）と
   並列して付加される。テストは `getAttribute('class').includes(...)` で
   検証する。
3. **エディタ操作と WebView 検証で focus が変わる**。`TextEditor.moveCursor`
   は .krs エディタが active である必要があり、WebView frame に入るには
   preview が active かつ `switchToFrame()` 済みである必要がある。
   先に editor を focus + moveCursor → preview に focus 移動 →
   `switchToFrame()` の順で行う。

## 前提条件

- AT-0072 / AT-0073 の harness（`packages/vscode-e2e/run-webview-tests.mjs`、
  `vscode-webview-e2e` workflow ジョブ）が main にある
- LSP packaging fix (#1024) が適用済み（installed mode で LSP が起動する）
- ローカル GUI が無い場合は `xvfb-run` 経由で実行する

## 受け入れ条件

### AC-1: editor cursor → SVG highlight が PASS する

- [x] `.krs` エディタで `OrderService` identifier に cursor を置くと、preview の `[data-node-id="OrderService"]` 要素の class に `karasu-highlighted` が付与される
> ✅ Automated — `packages/vscode-e2e/tests/webview/at-0037-9-bidirectional-jump.test.ts` › `highlights [data-node-id="OrderService"] in the SVG when the editor cursor lands on the OrderService identifier` (CI は `vscode-webview-e2e` ラベル opt-in、xvfb 必要のため required check には昇格しない)

### AC-2: AT-0037-9 doc の Coverage policy が更新される

- [ ] `docs/acceptance/0037-vscode-phase5-standard-lsp.md` の TC-9 が
  "manual" → "automated" に変わっている
- [ ] SVG-click 方向が AT-0038 TC-03/04 と AT-0039 TC-01 で代替自動化済み
  である旨が明記されている

> 上記 2 項目は本 PR 内のドキュメント編集で対応済み。リリース QA で目視レビューする。

## 自動化された検証

- `packages/vscode-e2e/tests/webview/at-0037-9-bidirectional-jump.test.ts` —
  本 Phase の本体テスト。CI は `vscode-webview-e2e` ラベルでオプトイン。

## 手動確認項目

- [ ] ローカルで `pnpm --filter @karasu-tools/vscode-e2e run test:webview` を
  実行し、5 スイート（runner smoke + AT-0037-9 + AT-0038 4 TCs + AT-0039）
  がすべて PASS することを目視確認する。
- [ ] 失敗した場合は `packages/vscode-e2e/test-resources/screenshots/` の
  状態を見て、selector 関連のリグレッションか / VS Code 起動シーケンスの
  揺れかを切り分ける。

## スコープ外

- AT-0039 残り TC（description / link / Jump-to-editor / [ⓘ] ボタン） — Phase 3 内の別 PR
- AT-0042-vscode（cross-diagram navigation） — Phase 3 内の別 PR
- ADR-20260428-05 の supersede — Phase 3 完了時に実施

## 関連

- Issue: [#1014](https://github.com/kompiro/karasu/issues/1014)
- 設計: `docs/design/vscode-webview-e2e-harness.md`
- 関連 AT: `docs/acceptance/0072-vscode-webview-e2e-phase3-at-0038.md` (hint), `docs/acceptance/0073-vscode-webview-e2e-phase3-at-0038-jump.md` (editor jump)
- 既存 ADR: ADR-20260428-03（拡張ホスト smoke）, ADR-20260428-05（マニュアル運用 — Phase 3 完了時に supersede 予定）
