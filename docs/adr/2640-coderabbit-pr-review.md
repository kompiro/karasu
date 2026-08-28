---
id: ADR-2640
title: PR の一次レビューに CodeRabbit を入れる（advisory 固定）
status: accepted
date: 2026-08-28
topic: build
scope:
  packages: []
  concerns:
    - ci
related_to:
  - ADR-128
  - ADR-903
  - ADR-953
assumptions:
  - "file: .coderabbit.yaml"
  - "grep: .coderabbit.yaml :: language: en-US"
  - "grep: .coderabbit.yaml :: request_changes_workflow: false"
---

# ADR-2640: PR の一次レビューに CodeRabbit を入れる（advisory 固定）

- **日付**: 2026-08-28
- **ステータス**: 決定済み
- **関連**:
  - Issue #2640
  - ADR-128（Dependabot による依存更新の自動化）
  - ADR-903（Secret 必須の CI ジョブは bot 作者の PR で skip する）
  - ADR-953（Required Check は paired stub workflow で docs-only PR を成功扱いにする）
  - `.coderabbit.yaml`, `docs/process.md`

## 背景

karasu は単独メンテナ + AI 支援で開発しており、ほとんどの PR は人間のレビュアーを
1 人も通さずにマージされる。機械的な層（lint / format / typecheck / knip /
check:cycles と lefthook・ci.yml の drift ガード群）は厚いが、それらが見るのは
「規約を機械で書き下せた部分」だけで、次のものは誰も読んでいない。

- 差分の意図と実装のズレ（考慮漏れのケース、想定外の入力）
- drift ガードにまだ落とし込めていない規約違反
- Issue のスコープを黙って広げた／狭めた変更

CodeRabbit は public リポジトリでは無料で使えるため、マージフローを変えずに
この空白を埋める常時稼働の一次レビュアーとして置ける。

## 決定

CodeRabbit GitHub App を導入し、設定をリポジトリ直下の `.coderabbit.yaml` で
バージョン管理する。**レビューは advisory 固定**とし、required check にもせず、
CodeRabbit による approve / block も有効にしない（`request_changes_workflow: false`）。
マージ判断は従来どおり人間が持つ。

## 理由

- **人間のレビュアーが 0 人の PR に、少なくとも 1 つの独立した読み手が付く。**
  CI が担当していない「差分を読む」層をコストゼロで足せる
- **advisory 固定なら既存のマージフローに影響しない。** required にすると
  外部サービスの障害がそのままマージ不能に直結する。ADR-953 で required check の
  pending が PR を止める事故を既に踏んでいるので、その形は繰り返さない
- **設定をリポジトリに置くことで規約を機械可読な場所に集約できる。**
  `path_instructions` に i18n の単一所有者・core の barrel import 禁止・
  paired skip stub（ADR-953）・ADR 採番といった規約を書き、
  `knowledge_base.code_guidelines` から `CLAUDE.md` と `.claude/rules/*.md` を
  参照させる。ダッシュボード側の設定にすると、この対応関係が repo の外に出て
  drift する
- **レビュー言語は英語（`language: en-US`）。** Issue / PR / コメントは英語という
  既存ポリシー（`docs/process.md`）に揃え、public repo の外部読者にも読める形にする
- **bot 作者の PR は対象外。** 依存更新 PR は `/hane:dependabot` が
  `docs/release.md` のサプライチェーン基準で個別にトリアージしており（ADR-128）、
  lockfile bump への二重の所見はノイズにしかならない

## 却下した案

- **CodeRabbit のレビューを required status check にする**: 外部サービスの停止が
  マージ不能に直結する。レビューの価値は「読まれること」であって「ゲートになること」
  ではない
- **`request_changes_workflow: true`（コメント解決で自動 approve）**: approve が
  実質的なマージ許可として機能してしまい、人間がマージ判断を持つという前提が崩れる
- **ダッシュボードだけで設定し `.coderabbit.yaml` を置かない**: 設定変更が PR に
  残らず、レビュー方針の変更が誰にも見えない
- **設定なしの既定値で導入する**: 既定では draft PR と Dependabot PR にも所見が付き、
  markdownlint / LanguageTool が日本語中心の docs に英語向けの指摘を出す。
  最初のノイズで無視する習慣が付くと、以後どんな所見も読まれなくなる

## 運用ルール

- **所見は「読んで判断する」対象であって、全部潰す対象ではない。** 採用しない指摘は
  返信で理由を書いて解決する（その判断は CodeRabbit の learnings に蓄積され、
  同じ指摘が繰り返されなくなる）
- 繰り返し同じ規約違反を指摘されるなら、それは `.coderabbit.yaml` の
  `path_instructions` ではなく **drift ガード（lefthook + `scripts/lint/`）に
  落とすべき規約**である合図として扱う。機械で落とせるものは機械で落とす
- 設定の変更は通常どおり PR で行う。スキーマは
  `https://storage.googleapis.com/coderabbit_public_assets/schema.v2.json`
