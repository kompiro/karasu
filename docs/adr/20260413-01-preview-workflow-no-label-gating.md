---
id: ADR-20260413-01
title: Preview workflow はラベル駆動をやめ path filter で制御する
status: accepted
date: 2026-04-13
scope:
  domains:
    - ci
    - deployment
---

# ADR-20260413-01: Preview workflow はラベル駆動をやめ path filter で制御する

- **日付**: 2026-04-13
- **ステータス**: 決定済み
- **関連**:
  - Issue #579
  - PR #575（症状が観測された例）
  - `.github/workflows/preview.yml`

## 背景

Cloudflare Pages への Preview デプロイは `.github/workflows/preview.yml` で
自動化されている。導入当初は以下の構成だった。

- `on.pull_request.types: [opened, synchronize, reopened, closed, labeled, unlabeled]`
- `concurrency.group: preview-${{ github.ref }}` + `cancel-in-progress: true`
- `skip-preview` ラベルによる opt-out（`if: !contains(labels.*.name, 'skip-preview')`）
- `paths-ignore: ["docs/**", "**/*.md"]`

`skip-preview` ラベルは「プレビューを焼きたくない PR（ドキュメントのみなど）」を
opt-out するために導入された。`labeled` / `unlabeled` を types に含めていたのは、
ラベル付与と同時に Preview の起動可否が切り替わるようにするためである。

## 問題

この構成には2つの実害があった。

1. **無関係ラベル操作で in-flight deploy がキャンセルされる。**
   PR に `e2e` や `status: *` などの**preview と関係ない**ラベルを付け外しすると、
   `labeled` / `unlabeled` イベントで Preview workflow が再起動され、
   同一 `github.ref` の concurrency group で `cancel-in-progress: true` が発動し、
   進行中の Cloudflare Pages デプロイがキャンセルされる。

2. **キャンセルされた run の status がマージ後もコミットに残る。**
   GitHub Actions はキャンセル済み run の check status をコミット SHA に
   紐付けたまま保持するため、PR 自体はクリーンにマージされても、
   コミット履歴ではそのコミットが失敗扱いに見える（例: PR #575）。
   reviewer や将来の自分が「マージされたのに失敗している？」と混乱する。

根本原因は「ラベル変化」と「コード変化」を**同じ workflow・同じ concurrency group**で
扱っていたことにある。

## 検討した選択肢

### 案 A: opt-in `preview` ラベルへ反転

`skip-preview`（opt-out）を `preview`（opt-in）に変えて、デフォルトでは Preview を
焼かない運用にする。`e2e` ラベルと揃う。

**却下**: CLI 中心の開発フローでは `gh pr edit --add-label preview` を毎回実行する
摩擦が大きい。また「ラベル駆動」という構造そのものは残るので、問題 (1) は
緩和されるだけで根本解決しない。

### 案 B: ラベル反応を別 workflow に分離

メインの Preview workflow は `labeled` / `unlabeled` を外し、ラベル付与・削除時の
deploy 起動 / cleanup は別 workflow（`preview-label.yml`）で `concurrency` group を
分けて扱う。

**却下**: 案 C を採るなら「ラベル駆動そのもの」を捨てるので、分離する対象が
そもそも存在しなくなる。不要な複雑度。

### 案 C: path filter で絞り、ラベル駆動を廃止（採用）

`labeled` / `unlabeled` を types から除外し、`paths-ignore` を具体的な `paths`
ホワイトリストに置き換えて「Preview 成果物に影響するファイルが変わった時だけ」
起動する。ラベルによる制御は撤廃する。

## 決定

案 C を採用し、以下を行う。

1. `.github/workflows/preview.yml` の `on.pull_request.types` を
   `[opened, synchronize, reopened, closed]` に変更する（`labeled, unlabeled` 除外）。
2. `paths-ignore` を削除し、`paths` で以下を明示する。
   - `packages/app/**`
   - `packages/core/**`
   - `pnpm-lock.yaml`
   - `package.json`
   - `.github/workflows/preview.yml`（workflow 自身の変更時に動作確認できるように）
3. `skip-preview` ラベルへの `if:` 参照を削除する。ラベルそのものは
   `.github/workflows/` から参照が消えた後にリポジトリから削除してよい。
4. `/start-dev` skill のラベル付与手順を削除する。

## 結果

- ラベル操作が Preview run を起動・キャンセルしなくなる。PR #575 で観測された
  「マージ済みコミットが赤く見える」症状は消える。
- `packages/cli`・`packages/e2e`・`packages/lsp`・`packages/vscode`・`docs/**` のみを
  変更する PR では Preview が焼かれなくなり、Cloudflare Pages のビルド時間が節約できる。
- CLI 運用での `gh pr edit --add-label skip-preview` という余計な手順が消える。
- トレードオフとして、`paths` のホワイトリスト漏れで「本当は preview したい PR に
  preview が走らない」ケースがあり得る。その場合は `paths` を追記するだけなので
  可逆な変更であり、実害は小さい。

## 将来の読者への注意

- GitHub Actions の `concurrency.cancel-in-progress: true` は同一 group のあらゆる
  起動を競合と見なす。`labeled` / `unlabeled` のようなメタイベントを `types` に
  含めたまま同一 concurrency group を使うと、**コード変更と無関係なラベル操作**で
  進行中の run が死ぬ。これは直感に反し、かつマージ後のコミット履歴にキャンセル
  status を残すため、症状の発見が遅れやすい。
- もし将来「ラベルを付けた時に何かをトリガしたい」ニーズが再発した場合は、
  以下のいずれかを選ぶこと。
  - ラベル反応を別 workflow に切り出し、**concurrency group も別名**にする。
  - ラベル駆動ではなく PR description のチェックボックス、`workflow_dispatch`、
    または path filter 等の**コード側の変化**をトリガ源にする。
