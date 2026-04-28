---
type: tooling
---

# AT-0069: VS Code WebView E2E harness — Phase 1 PoC

## 概要

`packages/vscode-e2e` に `vscode-extension-tester` (ExTester) ベースの WebView ランナーを追加し、karasu プレビュー WebView の DOM へ届く E2E テストを 1 件動かす
（Issue [#928](https://github.com/kompiro/karasu/issues/928)、設計は `docs/design/vscode-webview-e2e-harness.md`）。

Phase 1 のスコープは **runner 選定の妥当性確認に必要な最小限**:

- ExTester を `packages/vscode-e2e` の `devDependencies` に追加
- `tests/webview/` 配下に AT-0039 の "WebView reachability" テストを 1 本追加
- CI に `vscode-webview-e2e` ラベル gated のジョブを追加
- AT-0039 の Coverage policy に Phase 1 の現状（partial automation）を追記

クリック → 詳細パネル → Jump to editor のような **挙動の正面検証は Phase 2 以降**で扱う。Phase 1 では「ExTester で本番 WebView の DOM が読める」までを担保する。

## 前提条件

- `pnpm install` 後に `pnpm --filter @karasu-tools/vscode-e2e build` が通る
- ローカルに GUI が無い場合は `xvfb-run` 経由で実行する（CI も同経路）

## 受け入れ条件

### AC-1: ExTester ランナーが起動できる

- [ ] `pnpm --filter @karasu-tools/vscode-e2e run test:webview` を実行すると
  - `extest setup-and-run` が VS Code stable をダウンロードして起動する
  - karasu 拡張（`packages/vscode`）が dev mode でロードされる
  - `tests/webview/at-0039-detail-panel.test.ts` が Mocha スイートとして実行される
  - exit code が 0 で完了する

### AC-2: Phase 1 PoC テストが「WebView reachable」を証明する

- [ ] `at-0039-detail-panel.test.ts` の唯一のケースが PASS する:
  - `karasu: Open Preview` コマンドで WebView が開く
  - `WebView.switchToFrame()` で iframe に降りられる
  - WebView 内の `document.body.innerHTML` に `OrderService` ラベルが含まれる

### AC-3: CI から label gating でだけ起動する

- [ ] PR に `vscode-webview-e2e` ラベルが**無い**ときは `VS Code WebView (ExTester)` ジョブが skip される
- [ ] ラベルが**ある**ときに ジョブが走り、初回は VS Code + Chromedriver のダウンロード経路を含めて完了する

### AC-4: AT-0039 のドキュメントが Phase 1 状態を反映する

- [ ] `docs/acceptance/0039-vscode-phase6-detail-panel.md` の Coverage policy が "Manual" → "Partial automation (Phase 1 PoC)" に更新されている
- [ ] 当該節から `docs/design/vscode-webview-e2e-harness.md` と ADR-20260428-05 へのリンクが張られている

## 自動化された検証

- `packages/vscode-e2e/tests/webview/at-0039-detail-panel.test.ts` —
  Phase 1 PoC 本体。CI は `vscode-webview-e2e` ラベルでオプトイン。

## 手動確認項目

- [ ] ローカルで `pnpm test:webview` を実行し、ExTester がブラウザを起動して PoC スイートが PASS することを目視確認する。
- [ ] CI の `vscode-webview-e2e` ジョブを 1 度走らせ、artifacts のスクリーンショット / ログから「WebView 描画が想定どおり」を目視確認する（失敗時の回帰検出ハンドル）。

## スコープ外

- AT-0039 TC-02 以降のクリック → 詳細パネル表示の自動化（Phase 2）
- AT-0037-9 / AT-0038 / AT-0042-vscode の自動化（Phase 2 / 3）
- ADR-20260428-05 の supersede（Phase 3）

## 関連

- Issue: [#928](https://github.com/kompiro/karasu/issues/928)
- 設計: `docs/design/vscode-webview-e2e-harness.md`
- 既存 ADR: ADR-20260428-03（拡張ホスト smoke）, ADR-20260428-05（マニュアル運用）
