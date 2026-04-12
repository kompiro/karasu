---
type: tool
---

# AT-0055: E2E Playwright foundation (pilot: AT-0030 SVG Export)

- **日付**: 2026-04-12
- **関連 Issue**: #529
- **関連 ADR**: ADR-20260412-05
- **対象**: `packages/e2e/`、`.github/workflows/e2e.yml`

## 概要

Playwright ベースの E2E 自動化層を `packages/e2e/` に新設し、パイロットとして
AT-0030（SVG Export）の最小検証を1本実装する。CI は PR に `e2e` ラベルが
付いているときのみ実行され、artifact（スクショ・トレース・HTML レポート）を
14日間保持する。

## 受け入れ条件

### AC-1: workspace セットアップ

- [ ] `packages/e2e/` が pnpm workspace として認識される
- [ ] `pnpm --filter @karasu-tools/e2e install-browsers` で chromium を取得できる
- [ ] `pnpm --filter @karasu-tools/e2e test` がローカルで成功する

### AC-2: パイロット E2E（AT-0030 最小カバレッジ）

- [ ] Export SVG ボタンがロード直後に可視かつ有効である
- [ ] ボタンクリックで `.svg` ファイルがダウンロードされる
- [ ] ダウンロード内容に `<svg` と `</svg>` が含まれる
- [ ] ダウンロード内容に `<script` が含まれない

### AC-3: CI ラベル駆動実行

- [ ] `e2e` ラベルの付いた PR で `.github/workflows/e2e.yml` が実行される
- [ ] `e2e` ラベルの付いていない PR では E2E ジョブが起動しない
- [ ] ラベルなしで開いた PR に後から `e2e` ラベルを付与すると `labeled` イベントで実行される
- [ ] artifact（`playwright-report`、`playwright-test-results`）が 14日保持で
      アップロードされる

### AC-4: ADR の整合性

- [ ] 新 ADR `20260412-05-playwright-with-ai-visual-review.md` が作成されている
- [ ] 旧 ADR `20260324-01-manual-qa-over-e2e.md` のステータスが
      `Superseded by ADR-20260412-05` に更新されている
- [ ] `docs/process.md` の E2E 関連記述が新 ADR を指すように更新されている

## 検証方法

```bash
# ローカル
pnpm install
pnpm --filter @karasu-tools/e2e install-browsers
pnpm --filter @karasu-tools/e2e test

# CI（GitHub 側）
# 1. PR を作成（ラベルなし）→ E2E ジョブが起動しないことを確認
# 2. `e2e` ラベルを付与 → E2E ジョブが実行され、artifact がアップロードされる
# 3. artifact をダウンロードし、スクショを Claude に見せて視覚判断できることを確認
```
