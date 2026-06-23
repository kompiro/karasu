---
id: ADR-20260623-06
title: VS Code E2E（extension host / WebView）もラベル駆動をやめ path filter で起動する
status: accepted
date: 2026-06-23
topic: build
related_to:
  - ADR-20260623-05
  - ADR-20260413-01
  - ADR-20260412-05
scope:
  concerns:
    - ci
---

# ADR-20260623-06: VS Code E2E（extension host / WebView）もラベル駆動をやめ path filter で起動する

- **日付**: 2026-06-23
- **ステータス**: 決定済み
- **関連**:
  - Issue #1729（observation）
  - [ADR-20260623-05](20260623-05-e2e-path-filter-trigger.md)（app E2E を path filter へ移行。本 ADR はその「適用範囲外（将来課題）」を実施する follow-up）
  - [ADR-20260413-01](20260413-01-preview-workflow-no-label-gating.md)（Preview workflow の同型移行の原典）
  - [TPL-20260623-03](../test-perspectives/TPL-20260623-03-gated-test-suite-detection-gap.md)（gated-suite detection gap）
  - `.github/workflows/vscode-e2e.yml`

## 背景

ADR-20260623-05 は app の Playwright E2E をラベル駆動から path filter へ移行し、
「検出のブラインドスポット」（surface を変える PR がラベルを付け忘れて stale な
アサーションのまま merge される）を構造的に塞いだ。同 ADR は VS Code 系 E2E
（`vscode-e2e.yml` の `vscode-e2e` / `vscode-webview-e2e` ラベル）を
「xvfb 下の intermittent stall などコスト・flake プロファイルが異なる」として
**適用範囲外（将来課題）** に置いていた。

`vscode-e2e.yml` は同じラベル駆動構造を持つため、同じブラインドスポットを抱える。
本 ADR はその将来課題を実施する。

## 検討した選択肢

### 案 A: app E2E と同型に path filter へ移行（採用）

両ジョブの `if: contains(... ラベル)` ゲートを外し、`labeled` を types から除き、
`paths` ホワイトリストで起動する。

- 両ジョブ（extension host smoke / WebView ExTester）は `packages/vscode-e2e` の
  `pretest` で **同一のビルドチェーン**（`@karasu-tools/core` / `@karasu-tools/i18n`
  / `@karasu-tools/lsp` / `karasu-vscode`）を回す。依存スコープが一致するため、
  workflow レベルの単一 `paths` union で精度十分（per-job のパスフィルタは不要）。
- VS Code 拡張・webview は `packages/app` に依存しない（webview は
  `preview-panel.ts` が core を直接使う）ので、`packages/app/**` は paths に
  含めない。

**採用理由**: ADR-20260623-05 / ADR-20260413-01 と同じ構造で一貫し、
ブラインドスポットを構造的に塞げる。両ジョブのビルド依存が同一なので union で
過剰起動は最小。

### 案 B: per-job path filter（`dorny/paths-filter`）

ジョブごとに別パスで起動制御する。

**却下**: 両ジョブの依存スコープが同一のため per-job 化の利得が無く、
新しい action 依存と複雑度だけが増える。

### 案 C: ラベル駆動のまま維持

**却下**: ブラインドスポットが残る。ADR-20260623-05 で app E2E について退けた
理由がそのまま当てはまる。

## 決定

案 A を採用し、`.github/workflows/vscode-e2e.yml` を以下に変更する。

1. `on.pull_request.types` を `[opened, synchronize, reopened]` にする
   （`labeled` を除外）。
2. `paths` ホワイトリストを追加する:
   - `packages/core/**`
   - `packages/i18n/**`
   - `packages/lsp/**`
   - `packages/vscode/**`
   - `packages/vscode-e2e/**`
   - `pnpm-lock.yaml`
   - `package.json`
   - `.github/workflows/vscode-e2e.yml`（workflow 自身の変更時に動作確認できるように）
3. `vscode-e2e` / `vscode-webview-e2e` 両ジョブの `if: contains(... ラベル)` を削除する。

`VS Code extension host` / `VS Code WebView (ExTester)` は required status check では
ない（ruleset の required は `Check` / `Validate` / `Reference docs` のみ）ため、
path 非該当 PR で起動しなくても「永久 pending」にはならない。

## 結果

- core / i18n / lsp / vscode を触る PR では VS Code E2E がマージ前に自動で走り、
  stale なアサーションがその PR で検出される。
- `packages/app` / `packages/cli` / `docs/**` のみの PR では VS Code E2E は走らない
  （app の Playwright 側は ADR-20260623-05 の path filter が担当）。
- `gh pr edit --add-label vscode-e2e` / `vscode-webview-e2e` の手順が不要になる。
- トレードオフ: WebView (ExTester) は xvfb 下で intermittent stall が出やすく
  （TPL-20260510-14 / webview flake の既知パターン）、起動頻度が上がると flake の
  露出も増える。緩和は既存の retry パターン（AT-0038/0039 の 3-attempt）と nightly。
  flake が開発速度を落とすほど顕在化したら、WebView ジョブのみ起動条件を
  絞る / nightly 専用へ戻す等を再評価する（可逆）。
- `paths` のホワイトリスト漏れリスクは追記で対応できる可逆な変更（ADR-20260413-01
  と同じ評価）。

## 将来の読者への注意

- ラベルでの手動トリガを再導入したくなったら、ADR-20260413-01 / ADR-20260623-05 の
  注意に従い、ラベル反応は別 workflow + 別 concurrency group に切り出すか
  `workflow_dispatch` を使う。`labeled` を同一 workflow・同一 concurrency group の
  types に戻してはならない。
