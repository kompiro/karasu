---
type: tooling
---

# AT-0069: VS Code WebView E2E harness — Phase 1 PoC (runner smoke)

## 概要

`packages/vscode-e2e` に `vscode-extension-tester` (ExTester) ベースの WebView ランナーを追加し、ExTester から karasu 拡張を VS Code に install → 起動 → コマンド実行までを CI で再現できることを確認する
（Issue [#928](https://github.com/kompiro/karasu/issues/928)、設計は `docs/design/vscode-webview-e2e-harness.md`）。

Phase 1 のスコープは **runner 選定の妥当性確認に必要な最小限**:

- ExTester を `packages/vscode-e2e` の `devDependencies` に追加
- `@vscode/vsce.createVSIX({ dependencies: false })` を経由して、monorepo の `workspace:*` 依存をスキップしながら拡張を vsix にパッケージング
- `tests/webview/` 配下に runner smoke を 1 本追加（`Extensions: Show Installed Extensions` で karasu 拡張が install されていることを assert）
- CI に `vscode-webview-e2e` ラベル gated のジョブを追加

WebView の iframe に降りてカード/詳細パネルを assert するのは **Phase 2 以降** の作業。Phase 1 は「ExTester で karasu 拡張が VS Code に load される」までを担保する。

## 前提条件

- `pnpm install` 後に `pnpm --filter @karasu-tools/vscode-e2e build` が通る
- ローカルに GUI が無い場合は `xvfb-run` 経由で実行する（CI も同経路）

## 受け入れ条件

### AC-1: ExTester ランナーが起動できる

- [ ] `pnpm --filter @karasu-tools/vscode-e2e run test:webview` を実行すると
  - `node run-webview-tests.mjs` が VS Code stable をダウンロード・展開する
  - karasu 拡張（`packages/vscode`）が `@vscode/vsce.createVSIX({ dependencies: false })` で vsix にパッケージされる
  - VS Code に install されてから Mocha スイートが走る
  - exit code が 0 で完了する

### AC-2: Phase 1 PoC スイートが karasu 拡張を認識する

- [ ] `at-0069-runner-smoke.test.ts` が PASS する:
  - `Extensions: Show Installed Extensions` を実行して Extensions view を開ける
  - インストール済みリストに `karasu` の文字列を含む item がある
  - `karasu: Open Preview` コマンドを呼び出せる（krs エディタが無いので info メッセージ分岐に落ちる — それで OK）

### AC-3: CI から label gating でだけ起動する

- [ ] PR に `vscode-webview-e2e` ラベルが**無い**ときは `VS Code WebView (ExTester)` ジョブが skip される
- [ ] ラベルが**ある**ときに ジョブが走り、初回は VS Code + Chromedriver のダウンロード経路を含めて完了する

### AC-4: AT-0039 の Coverage policy 注記が Phase 1 進捗を反映する

- [ ] `docs/acceptance/0039-vscode-phase6-detail-panel.md` の Coverage policy に
  「Phase 1 が landed、Phase 2 で AT-0039 を移植予定」を示す注記が入っている
  （TC-01..TC-N 自体は Phase 2 で書き換えるため Manual のまま据え置き）

## 自動化された検証

- `packages/vscode-e2e/tests/webview/at-0069-runner-smoke.test.ts` —
  Phase 1 PoC 本体。CI は `vscode-webview-e2e` ラベルでオプトイン。

## 手動確認項目

- [ ] ローカルで `pnpm test:webview` を実行し、ExTester がブラウザを起動して PoC スイートが PASS することを目視確認する。
- [ ] CI の `vscode-webview-e2e` ジョブを 1 度走らせ、artifacts のログ / スクリーンショットから「karasu 拡張が認識されている」を目視確認する。

## スコープ外

- WebView の iframe DOM へ降りる経路（`WebView.switchToFrame()` の selector チューニング）— Phase 2
- AT-0039 / AT-0037-9 / AT-0038 / AT-0042-vscode の自動化（Phase 2 / 3）
- ADR-20260428-05 の supersede（Phase 3）

## 関連

- Issue: [#928](https://github.com/kompiro/karasu/issues/928)
- 設計: `docs/design/vscode-webview-e2e-harness.md`
- 既存 ADR: ADR-20260428-03（拡張ホスト smoke）, ADR-20260428-05（マニュアル運用）
