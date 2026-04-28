---
type: tooling
---

# AT-0070: VS Code WebView E2E harness — Phase 2 (AT-0039 TC-01 migration)

## 概要

Phase 1 (#928 / AT-0069) で wired したエクステシンランナー上で、**WebView の iframe DOM へ降りて leaf node をクリックし、詳細パネルが表示されることを確認する**第一の AT を migrate する
（Issue [#928](https://github.com/kompiro/karasu/issues/928) Phase 2、設計は `docs/design/vscode-webview-e2e-harness.md`）。

Phase 2 のスコープ:

- Fixture を `packages/vscode-e2e/fixtures/webview-workspace/` に追加（leaf node を 1 つ以上含む `.krs`）
- Test を 1 件追加: `karasu: Open Preview` → `EditorView.openEditor("karasu Preview")` → `WebView.switchToFrame()` → `data-node-id="Customer"` を click → `#detail-panel.visible` が出ることを assert
- AT-0039 の Coverage policy を "Manual" → "Partial automation" に更新
- ExTester ランナーが `runTests({ resources: [workspaceFolder] })` で fixture workspace を最初から開くよう更新

Phase 2 の鍵となる技術ポイント:

> `new WebView()` は default で active editor に解決される。プレビューは `ViewColumn.Beside` (column 2) で開くため、`.krs` を column 1 に置いた状態で `new WebView()` を構築すると **column 1 の Monaco editor を WebView と誤認** して `.editor-instance` 配下に iframe が見つからず NoSuchElementError になる。
>
> 解決策: WebView を構築する前に `new EditorView().openEditor("karasu Preview")` で column 2 を active にする。

## 前提条件

- Phase 1 の harness（`packages/vscode-e2e` の `test:webview` script、`vscode-webview-e2e` workflow ジョブ）が main にある
- ローカル GUI が無い場合は `xvfb-run` 経由で実行する

## 受け入れ条件

### AC-1: Fixture が parser を通る

- [ ] `packages/vscode-e2e/fixtures/webview-workspace/at-0039.krs` をパースしてエラー / 警告が出ないこと

### AC-2: Phase 2 PoC テストが PASS する

- [x] `at-0039-detail-panel.test.ts` の唯一のケースが PASS する（VS Code 起動 → fixture 開く → preview command → WebView frame 切替 → leaf node click → `#detail-panel.visible` 検出）
> 🟡 Partially automated — `packages/vscode-e2e/tests/webview/at-0039-detail-panel.test.ts` › `opens the preview, focuses the WebView, and clicks Customer to surface the detail panel` (CI は `vscode-webview-e2e` ラベル opt-in、xvfb 必要のため required check には昇格しない)

### AC-3: AT-0039 の Coverage policy が更新される

- [ ] `docs/acceptance/0039-vscode-phase6-detail-panel.md` の Coverage policy が "Manual" → "Partial automation" に変わっている
- [ ] 残り TC（描画 / link / Jump-to-editor / [ⓘ] ボタン）は依然 ADR-20260428-05 manual で運用される旨が明記されている

## 自動化された検証

- `packages/vscode-e2e/tests/webview/at-0039-detail-panel.test.ts` —
  本 Phase の本体テスト。CI は `vscode-webview-e2e` ラベルでオプトイン。

## 手動確認項目

- [ ] ローカルで `pnpm --filter @karasu-tools/vscode-e2e run test:webview` を実行し、両方のスイート（runner smoke + 詳細パネル）が PASS することを目視確認する。
- [ ] 失敗した場合は `packages/vscode-e2e/test-resources/screenshots/` の SVG 状態を見て、selector 関連のリグレッションか / WebView 起動シーケンスの揺れかを切り分ける。

## スコープ外

- AT-0039 の TC-02..TC-N（description / links / Jump-to-editor / [ⓘ] ボタン）
- AT-0037-9 / AT-0038 / AT-0042-vscode の自動化
- ADR-20260428-05 の supersede（Phase 3）

## 関連

- Issue: [#928](https://github.com/kompiro/karasu/issues/928)
- 設計: `docs/design/vscode-webview-e2e-harness.md`
- Phase 1 AT: `docs/acceptance/0069-vscode-webview-e2e-phase1.md`
- 既存 ADR: ADR-20260428-03（拡張ホスト smoke）, ADR-20260428-05（マニュアル運用 — Phase 3 で supersede 予定）
