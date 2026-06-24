---
id: ADR-20260623-05
title: app E2E（Playwright）はラベル駆動をやめ path filter で起動する
status: accepted
date: 2026-06-23
topic: build
related_to:
  - ADR-20260412-05
  - ADR-20260413-01
  - ADR-20260623-07
scope:
  concerns:
    - ci
---

# ADR-20260623-05: app E2E（Playwright）はラベル駆動をやめ path filter で起動する

- **日付**: 2026-06-23
- **ステータス**: 決定済み
- **関連**:
  - Issue #1729（observation）、#1725 / #1548（症状が観測された例）
  - [ADR-20260412-05](20260412-05-playwright-with-ai-visual-review.md)（E2E の `e2e` ラベル駆動 CI を導入した ADR — 本 ADR はその **CI トリガーの一点のみ** を更新する）
  - [ADR-20260413-01](20260413-01-preview-workflow-no-label-gating.md)（Preview workflow を同じ理由で path filter へ移行した先例）
  - [TPL-20260623-03](../test-perspectives/TPL-20260623-03-gated-test-suite-detection-gap.md)（gated-suite detection gap）
  - `.github/workflows/e2e.yml`

## 背景

app の Playwright E2E は `.github/workflows/e2e.yml` で、PR に `e2e` ラベルが
付いているときだけ実行される（ADR-20260412-05 の「保守コスト抑制」のための
opt-in 設計）。

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened, labeled]
jobs:
  e2e:
    if: contains(github.event.pull_request.labels.*.name, 'e2e')
```

E2E は nightly（`e2e-nightly.yml`）でも全件走るが、これは検出の最後の砦であり、
マージ前ゲートではない。

## 問題

ラベル駆動には **検出のブラインドスポット** がある。E2E がアサーションして
いる surface（DOM 構造・control のラベル・ARIA role・セレクタ）を変える PR が
`e2e` ラベルを付けずにマージされると、**壊れたアサーションが緑のまま `main` に
入り**、失敗が nightly か後続の（無関係な）ラベル付き PR まで遅延する。

実例（#1725）: #1548 が reference を独立ボタンから docs dropdown 内項目へ
リファクタした際、E2E が未実行のまま merge され、`at-0014` AC-5 の
`getByRole("button", {name:/Open reference/})` が stale 化。数日後、まったく
無関係な E2E ラベル付き PR (#1725) で初めて失敗が表面化し、その PR の作者が
切り分けコストを払った。

この観点は TPL-20260623-03 として記録済みで、本 ADR はその **構造的な対処**
（仕組み化）を定める。

## 検討した選択肢

### 案 A: path filter で起動し、ラベル駆動を廃止（採用）

`labeled` を types から外し、`paths` ホワイトリスト（E2E 成果物に影響する
ファイル = `packages/app/**` / `packages/core/**` / `packages/e2e/**` ほか）が
変わったときに起動する。ラベルによる制御は撤廃する。Preview workflow が
ADR-20260413-01 で採った構成と同型。

**採用理由**: リポジトリにすでに同じ問題を path filter で解決した先例があり、
構造・教訓ともに流用できる。E2E が「必要な PR（app/core を触る PR）」で
自動的に走り、人間がラベルを覚える必要が消える。

### 案 B: path ベースの auto-label

`actions/labeler` で app/core 変更時に `e2e` ラベルを自動付与する。

**却下**: ラベルをトリガに残すと、ADR-20260413-01 が警告する
「`labeled` メタイベント + concurrency group で無関係なラベル操作が in-flight
run を殺す」リスクと、labeler workflow という moving part が残る。path filter で
直接トリガすれば中間のラベルは不要。

### 案 C: 軽量ガード（ラベル維持）

全 PR で走る安価なチェックを足し、`packages/app/**` を触っているのに `e2e`
ラベルが無い PR を warn/fail する。

**却下**: リマインドは自動化されるが、結局人間のラベル付けに依存し、
ブラインドスポットを「塞ぐ」のではなく「気づきやすくする」に留まる。

## 決定

案 A を採用し、`.github/workflows/e2e.yml` を以下に変更する。

1. `on.pull_request.types` を `[opened, synchronize, reopened]` にする
   （`labeled` を除外）。
2. `paths` ホワイトリストを追加する:
   - `packages/app/**`
   - `packages/core/**`
   - `packages/e2e/**`
   - `pnpm-lock.yaml`
   - `package.json`
   - `.github/workflows/e2e.yml`（workflow 自身の変更時に動作確認できるように）
3. `e2e:` ジョブの `if: contains(... 'e2e')` ゲートを削除する。

`Playwright` は required status check ではない（ruleset の required は
`Check` / `Validate` / `Reference docs` のみ）ため、path 非該当 PR で workflow が
起動しなくても「永久 pending」にはならない。

## 結果

- app/core/e2e を触る PR では E2E がマージ前に自動で走り、stale セレクタが
  その PR の中で検出される。#1725 型の検出遅延が消える。
- `packages/cli` / `packages/lsp` / `packages/vscode` / `docs/**` のみの PR では
  E2E が走らず、CI 時間を節約できる（従来のラベル省略時と同じ挙動）。
- CLI 運用での `gh pr edit --add-label e2e` という手順が不要になる。
- トレードオフ: `paths` のホワイトリスト漏れで「本当は E2E したい PR に
  走らない」ケースがあり得るが、`paths` を追記するだけの可逆な変更で実害は
  小さい（ADR-20260413-01 と同じ評価）。nightly が最終セーフティネットとして
  残る。
- ADR-20260412-05 の三層 QA モデル・AI 視覚レビュー・パイロットスコープ等の
  判断は **不変**。本 ADR は同 ADR の「CI トリガー: e2e ラベル付き時のみ」の
  一点だけを更新する（そのため `supersedes` ではなく `related_to` とする）。

## 適用範囲外（将来課題）

- ~~`vscode-e2e.yml`（`vscode-e2e` / `vscode-webview-e2e` ラベル駆動）は同じ
  ブラインドスポットを持つが、xvfb 下の intermittent stall などコスト・flake
  プロファイルが異なるため本 ADR の対象外とする。同型の移行が妥当かは別途
  評価する。~~ → **[ADR-20260623-07](20260623-07-vscode-e2e-path-filter-trigger.md)**
  で同型の path filter 移行を実施した（flake トレードオフの評価込み）。

## 将来の読者への注意

- もし将来「ラベルを付けたときに E2E をトリガしたい」ニーズが再発したら、
  ADR-20260413-01 の注意に従い、ラベル反応は **別 workflow + 別 concurrency
  group** に切り出すか、`workflow_dispatch` を使う。`labeled` を同一 workflow・
  同一 concurrency group の types に戻してはならない。
