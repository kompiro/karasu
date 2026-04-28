---
id: ADR-20260428-03
title: VS Code 拡張ホスト向け smoke test harness
status: accepted
date: 2026-04-28
topic: vscode
related_to:
  - ADR-20260412-05
  - ADR-20260427-05
scope:
  packages:
    - vscode
    - vscode-e2e
  concerns:
    - ci
assumptions:
  - "file: packages/vscode-e2e/package.json"
  - "file: packages/vscode-e2e/.vscode-test.mjs"
  - "file: packages/vscode-e2e/tests/suite/00-activation.test.ts"
  - "file: packages/vscode-e2e/fixtures/workspace/sample.krs"
  - "file: .github/workflows/vscode-e2e.yml"
  - "grep: packages/vscode/package.json :: onLanguage:krs"
---

# ADR-20260428-03: VS Code 拡張ホスト向け smoke test harness

- **日付**: 2026-04-28
- **ステータス**: 決定済み
- **関連**:
  - Issue #863 — VS Code extension host test harness
  - 親 Issue #597 — remaining E2E candidates after #534 rollout
  - PR #895 — Design Doc 追加
  - PR #906 — harness 実装
  - 依存される AT: AT-0037 (#867), AT-0038, AT-0039, AT-0042-vscode
  - ADR-20260412-05 — Playwright + AI visual review 戦略
  - ADR-20260427-05 — OPFS fixture ヘルパー（同種のインフラ ADR）

## 背景

VS Code 拡張（`packages/vscode`）の AT は、エディタ内で発生する操作に依存する:

- AT-0037 — Phase 5 標準 LSP（補完・F12・ホバー・Outline）
- AT-0038 — Phase 4.5 Cmd/Ctrl+Click ヒント
- AT-0039 — Phase 6 詳細パネル
- AT-0042-vscode — クロス図ナビゲーション

これらは現在すべて手動テストで、回帰検出が機能していない。LSP サーバー側の
単体テストは `packages/lsp` にあるが、拡張のアクティベーション・コマンド登録・
LSP クライアント起動・WebView との往復は拡張ホスト（Electron）上で実拡張を
動かさないと検証できない。`packages/e2e` の Playwright は `packages/app` 専用で、
VS Code 拡張ホストは扱えない。

## 決定

新規パッケージ `@karasu-tools/vscode-e2e` を導入し、`@vscode/test-cli`
（`@vscode/test-electron` の公式ラッパ）を使った Mocha スイートで
拡張ホスト上の smoke test を回す。

**ランナー**: `@vscode/test-cli` を採用。指定バージョンの VS Code を
ダウンロードし、拡張ホスト内で Mocha を実行する VS Code 公式の経路。
Playwright と Electron を組み合わせる代替案より、テンプレ整備・将来の
互換維持コストが低い。

**配置**: 新規パッケージ `packages/vscode-e2e/` に独立配置する。

- `packages/e2e` への同居は Playwright と Mocha のランナー混在で `pnpm test` の
  セマンティクスがブレる。
- `packages/vscode` への co-locate は拡張 vsix の devDependencies が肥大化する
  （`.vscodeignore` の整備が必要）。
- 新規パッケージなら CI workflow の paths/label gating を独立に切れ、
  既存の `packages/e2e` ↔ Playwright workspace と並ぶ位置づけになる。

**スコープ**: smoke test 1 本に限定。AT-0037ff の本体実装は本 ADR の
スコープ外で、後続 PR が `tests/suite/*.test.ts` を追加する形で積み増す。

**アクティベーション**: `packages/vscode/package.json` に
`onLanguage:krs` と `onLanguage:krs-style` を追加し、`.krs` を開くだけで
拡張がアクティベートされる経路を harness が検証できるようにした。
従来の `activationEvents: []` のままでは smoke test は「bundle が壊れていない」
ことしか担保できなかった。

**CI**: `.github/workflows/vscode-e2e.yml` を新設。`vscode-e2e` ラベル付き
PR でだけ実行する label-gated 運用に揃える（`e2e.yml` と同じ方式）。
ubuntu-latest 上で Electron 系システムライブラリを `apt-get` し、
`xvfb-run` で headless 起動。`~/.vscode-test/` を `actions/cache` で
キャッシュする。

**VS Code バージョン**: `version: "stable"` で追従する。VS Code は毎週
stable をリリースするため、harness 側で固定するとアップストリームのリグレッションを
見逃しやすい。`@vscode/test-electron` がランごとに最新 stable を解決し、
キャッシュにない版は再ダウンロードする。

**Local 環境**: devcontainer の Dockerfile に `xvfb` / `xauth` /
Electron 系ライブラリを preinstall し、`xvfb-run -a pnpm --filter
@karasu-tools/vscode-e2e test` がそのまま動くようにする。

## 検討した代替

| 案                                  | 理由                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------- |
| Playwright + Electron で VS Code を駆動 | 維持コストが大きく、VS Code 公式の進化に追従しにくい                       |
| `wdio-vscode-service`               | 採用例が少なく、Mocha+test-cli より周辺ノウハウが薄い                     |
| `packages/e2e` 内に同居             | Playwright と Mocha が混在し `pnpm test` のセマンティクスがブレる          |
| `packages/vscode` 内に co-locate    | 拡張 vsix のメタデータ整理コストがかかる                                  |
| 拡張バージョンを pin                 | 毎週 stable がリリースされるため、追従させる方が回帰検出に資する          |

## 影響

- 新規 npm script `pnpm --filter @karasu-tools/vscode-e2e test` がローカルで動く
- CI に `vscode-e2e` ラベル経路が増える（label なし PR には影響なし）
- 拡張は `.krs` / `.krs.style` を開いた瞬間にアクティベートされるようになる
  （以前はコマンド呼び出し時のみ）
- `knip.json` / `.oxlintrc.json` に新ワークスペース向けのスコープ追加
- AT-0037ff（#867 ほか）の自動化が解禁される
