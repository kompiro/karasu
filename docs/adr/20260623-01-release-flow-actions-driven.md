---
id: ADR-20260623-01
title: "リリースを workflow_dispatch 起動の Prepare → release PR → マージで publish にする"
status: accepted
date: 2026-06-23
topic: build
related_to:
  - ADR-20260512-05
  - ADR-20260619-02
scope:
  concerns:
    - ci
    - deployment
assumptions:
  - "file: .github/workflows/release-prepare.yml"
  - "file: .github/workflows/release.yml"
  - "grep: .github/workflows/release.yml :: packages/\\*\\*/CHANGELOG.md"
  - "grep: package.json :: \"version-packages\": \"changeset version && pnpm install --lockfile-only\""
---

# ADR-20260623-01: リリースを workflow_dispatch 起動の Prepare → release PR → マージで publish にする

- **日付**: 2026-06-23
- **ステータス**: 決定済み
- **関連**:
  - 設計検討 PR: [#1701](https://github.com/kompiro/karasu/pull/1701)（旧 `docs/design/release-flow-actions-driven.md` — 本 ADR に集約して削除）
  - [ADR-20260512-05](20260512-05-release-automation-changesets.md) — changesets 採用・publish-only。本 ADR はその「リリースの流れ」（ローカル `changeset version` → release PR → マージ → publish）の **trigger / version-bump の起こし方**を更新する
  - [ADR-20260619-02](20260619-02-npm-trusted-publishing-oidc.md) — publish 認証を OIDC trusted publishing 化（同じ `release.yml` を扱う）
  - [#1370](https://github.com/kompiro/karasu/issues/1370) — Actions の PR 作成権限を OFF にした経緯

## 背景

メンテナは**ローカルで `pnpm changeset version` を回したくない**。リリースは「**GitHub Actions をポチッと起動して始める**」フローにしたい。加えて 2 つの状況が確定した:

1. `release.yml` は OIDC trusted publishing 化済み（ADR-20260619-02）。
2. default branch (`main`) が repository ruleset で保護された（**PR 必須・squash のみ・直 push 不可**・force-push/削除禁止・必須チェック・bypass actors なし）。

この下で「version bump をどう起こし、どこに着地させ、どう publish に繋ぐか」を決める。

## 決定

**workflow_dispatch 起動の 2 段フロー（Design Doc 案A）を採用する。**

1. **`.github/workflows/release-prepare.yml`（新規, `workflow_dispatch`）**: `pnpm version-packages`（= `changeset version` + lockfile 更新）を実行し、`chore/release-<karasu version>` ブランチを push する。pending changeset が無ければ no-op で終了。`permissions: contents: write`、`concurrency: release-prepare`（`cancel-in-progress: false`）で直列化。
2. メンテナがそのブランチから **PR を開き、版番号と CHANGELOG をレビューして squash マージ**する。
3. **`release.yml`（publish）の trigger を `push: branches:[main], paths: ["packages/**/CHANGELOG.md"]` + `workflow_dispatch`** にする。`changeset version` は CHANGELOG.md を必ず書き換えるため、release PR のマージ時にだけ発火し、毎 push のフルビルド浪費を避ける。publish 本体は OIDC（ADR-20260619-02）のまま。

main ruleset の必須レビュー承認数は **0 のまま維持**し（ソロメンテナで self-merge 可能にするため）、「release PR はマージ前に版番号と CHANGELOG を必ず読む」を運用ルールとして `docs/process.md` に明記する。

## 理由

- **ローカル `changeset version` を廃せる**（要件）。起動は Actions の workflow_dispatch。
- **不可逆 publish の前にレビュー関門（版番号・CHANGELOG）が残る**。release PR を人が確認してからマージする。
- **main 直 push 不可・Actions PR 作成 OFF の両制約に抵触しない**。push するのは default 以外の `chore/release-*` ブランチで、PR 作成は人がワンクリック。人が PR を開くことで必須チェックも走る（GITHUB_TOKEN の push は他 workflow を発火させないため、bot が PR を作る形だと checks が走らない問題も同時に回避できる）。
- **CHANGELOG path filter** で publish workflow が毎 push 走る無駄（全パッケージ build → no-op）を排除する。

## 却下した案

- **1 ボタンで version + publish（main に直接 commit して publish）**: main ruleset が直 push を禁止（bypass なし）するため**成立しない**。仮に bypass を足しても publish 前のレビュー関門が消える。
- **`changesets/action`（ボット PR）**: 意図的に OFF にした #1370 の「Actions に PR 作成・承認を許可」設定を ON に戻す必要がある。案 A はその設定を OFF のまま同等の体験を実現できる。

## 影響

- メンテナのリリース操作が「ローカル `changeset version`」→「Actions 起動 + release PR をマージ」に変わる。通常の feature 開発（`pnpm changeset` で changeset を足す）は不変。
- fork / 外部コントリビューターへの影響なし（Prepare は maintainer が起動）。
