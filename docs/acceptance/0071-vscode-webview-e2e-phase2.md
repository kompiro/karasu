---
type: tooling
---

# AT-0071: VS Code WebView E2E harness — Phase 2 (AT-0039 TC-01 migration)

## 概要

Phase 1 (#928 / AT-0069) で wired した ExTester ランナー上で、**WebView の iframe DOM へ降りて leaf node をクリックし、詳細パネルが表示されることを確認する**第一の AT を migrate する
（Issue [#928](https://github.com/kompiro/karasu/issues/928) Phase 2、設計は `docs/design/vscode-webview-e2e-harness.md`）。

Phase 2 のスコープ:

- ExTester ランナーが untitled buffer で `.krs` 言語モードに切り替える方式に書き換え（xvfb 上での folder/file open path が不安定なため、ファイルシステムを経由しないようにした）
- Test を 1 件追加: 新規 untitled → `.krs` 内容を貼り付け → "Change Language Mode" で krs に切替 → `karasu: Open Preview` → WebView frame 切替 → `data-node-id="Customer"` click → `#detail-panel.visible` 検出
- AT-0039 の Coverage policy を "Manual" → "Partial automation" に更新

Phase 2 の鍵となる技術ポイント:

1. **`new WebView()` は default で active editor に解決される**。プレビューは `ViewColumn.Beside` (group 1) で開くため、untitled が group 0 に残っている状態で `new WebView()` を構築すると `.editor-instance` 配下に iframe が見つからず NoSuchElementError になる。解決策: `EditorView.openEditor("karasu Preview", 1)` で WebView を active にしてから構築する。
2. **`code -r <folder>` 経由の workspace open は xvfb で不安定**。Phase 2a の試行で「VS Code は起動するが workspace は無い／ Quick Open がファイルを見つけられない」事象を確認した（screenshot）。Phase 2b では untitled + Change Language Mode で krs を活性化することにして file system 経由を避けた。

## 前提条件

- Phase 1 の harness（`packages/vscode-e2e` の `test:webview` script、`vscode-webview-e2e` workflow ジョブ）が main にある
- ローカル GUI が無い場合は `xvfb-run` 経由で実行する

## 受け入れ条件

### AC-1: Phase 2 テストが PASS する

- [x] `at-0039-detail-panel.test.ts` の唯一のケースが PASS する（VS Code 起動 → untitled 作成 → krs 内容貼付 → Change Language Mode → preview command → WebView frame 切替 → leaf node click → `#detail-panel.visible` 検出）
> 🟡 Partially automated — `packages/vscode-e2e/tests/webview/at-0039-detail-panel.test.ts` › `opens the preview, focuses the WebView, and clicks Customer to surface the detail panel` (CI は `vscode-webview-e2e` ラベル opt-in、xvfb 必要のため required check には昇格しない)

### AC-2: AT-0039 の Coverage policy が更新される

- [ ] `docs/acceptance/0039-vscode-phase6-detail-panel.md` の Coverage policy が "Manual" → "Partial automation" に変わっている
- [ ] 残り TC（description / link / Jump-to-editor / [ⓘ] ボタン）は依然 ADR-20260428-05 manual で運用される旨が明記されている

> 上記 2 項目は本 PR 内のドキュメント編集で対応済み。リリース QA で目視レビューする。

## 自動化された検証

- `packages/vscode-e2e/tests/webview/at-0039-detail-panel.test.ts` —
  本 Phase の本体テスト。CI は `vscode-webview-e2e` ラベルでオプトイン。

## 手動確認項目

- [ ] ローカルで `pnpm --filter @karasu-tools/vscode-e2e run test:webview` を実行し、両方のスイート（runner smoke + 詳細パネル）が PASS することを目視確認する。
- [ ] 失敗した場合は `packages/vscode-e2e/test-resources/screenshots/` の状態を見て、selector 関連のリグレッションか / VS Code 起動シーケンスの揺れかを切り分ける。

## スコープ外

- AT-0039 の TC-02..TC-N（description / links / Jump-to-editor / [ⓘ] ボタン） — Phase 3 で TC ごとに分離
- AT-0037-9 / AT-0038 / AT-0042-vscode の自動化 — Phase 3
- ADR-20260428-05 の supersede — Phase 3

## 関連

- Issue: [#928](https://github.com/kompiro/karasu/issues/928)
- 設計: `docs/design/vscode-webview-e2e-harness.md`
- Phase 1 AT: `docs/acceptance/0069-vscode-webview-e2e-phase1.md`
- 既存 ADR: ADR-20260428-03（拡張ホスト smoke）, ADR-20260428-05（マニュアル運用 — Phase 3 で supersede 予定）
