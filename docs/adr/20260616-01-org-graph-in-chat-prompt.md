---
id: ADR-20260616-01
title: "組織グラフと解決済み ownerIndex を AI チャットプロンプトにシリアライズする"
status: accepted
date: 2026-06-16
topic: chat-ai
depends_on:
  - ADR-20260615-05
related_to:
  - ADR-20260614-01
scope:
  packages: [core, app]
assumptions:
  - "symbol: packages/app/src/hooks/useChatSession/prompt.ts :: serializeOrganizations"
  - "grep: packages/app/src/hooks/useChatSession/prompt.ts :: organizations: OrganizationBlock\\[\\]"
  - "grep: packages/core/src/index.ts :: ownerIndex: krsFile.ownerIndex"
  - "file: docs/acceptance/1580-chat-org-query-imported-file.md"
  - "file: docs/test-perspectives/TPL-20260615-01-migration-priority-index-winner.md"
---

# ADR-20260616-01: 組織グラフと解決済み ownerIndex を AI チャットプロンプトにシリアライズする

- **日付**: 2026-06-16
- **ステータス**: 決定済み
- **関連**:
  - Issue [#1580](https://github.com/kompiro/karasu/issues/1580)（実装）、PR [#1614](https://github.com/kompiro/karasu/pull/1614)
  - [ADR-20260615-05](20260615-05-team-annotations-owner-priority.md)（`ownerIndex` の `@migration_target` 主オーナー選択。本 ADR はその index を消費する）
  - [ADR-20260614-01](20260614-01-remove-team-property.md)（per-node `team` プロパティ削除。これによりチャットがオーナーをファイル本文から読めなくなった）
  - [TPL-20260514-02](../test-perspectives/TPL-20260514-02-whole-file-import-completeness.md)（import 先の宣言は merged グラフに流入する）
  - [TPL-20260615-01](../test-perspectives/TPL-20260615-01-migration-priority-index-winner.md)（1:1 index は `@migration_target` を勝者に選ぶ）
  - 受け入れテスト: `docs/acceptance/1580-chat-org-query-imported-file.md`
  - コード: `packages/app/src/hooks/useChatSession/prompt.ts`（`serializeModelGraph` / `serializeOrganizations` / `serializeNode`）、`packages/core/src/index.ts`（`OrgCompileResult.ownerIndex`）

## 背景

AI チャットの system prompt は `serializeModelGraph(systems)` で **system グラフ（service / domain / edge）だけ**を JSON 化していた。組織情報（team / `owns` / member / team の `link`）は一切シリアライズせず、オーナーシップに関する問いは「`## ファイルの内容` を読んで `organization` / `owns` から導出せよ」という指示で代替していた。

ところが #1564（[ADR-20260614-01](20260614-01-remove-team-property.md)）で per-node `team` プロパティを廃止したため、オーナーは `organization` ブロック経由でしか表現されなくなった。プロンプトに含まれるファイル本文は**現在開いているファイルのみ**であり、マルチファイル構成で `organization` ブロックが import 先のファイルに宣言されていると、その本文はプロンプトに現れない。結果として「X のオーナーは？」「X の連絡先は？」がマルチファイルで解決できなかった。

なお merged な `KrsFile` には全ファイル統合済みの `organizations` と、主オーナーを解決した `ownerIndex`（`Map<nodeId, teamId>`）が既に存在する。これらを `buildSystemPrompt` まで配線していなかったのが本質的な欠落である。

## 決定

`buildSystemPrompt` に **統合済み `organizations` と core の `ownerIndex` を配線**し、組織グラフ（team / `owns` / member / `link` / 入れ子の subteam）をモデル JSON の `organizations` セクションとしてシリアライズする。あわせて各 service / domain ノードに解決済み主オーナーを `owner` フィールドとして注記する。組織クエリの指示文（ja / en）は「ファイル本文を読め」から「シリアライズ済み `organizations` を使え」に改める。

主オーナーの 1:1 解決は **app 側で再導出せず、core が公開する `ownerIndex` をそのまま使う**。そのため `OrgCompileResult` に `ownerIndex` を新たに公開する。

## 理由

- **マルチファイル解決**: `organizations` / `ownerIndex` は merged `KrsFile` 由来なので、`organization` ブロックが import 先で宣言されていても解決できる（TPL-20260514-02）。開いているファイル本文には依存しない。
- **owner 解決の単一の真実**: `ownerIndex` は parser の `migrationPriority` ヘルパで `@migration_target` を主オーナーに選ぶ（[ADR-20260615-05](20260615-05-team-annotations-owner-priority.md) / TPL-20260615-01）。app で `owns` から再導出すると、この優先規則を二重実装することになり、レンダラーの owner バッジとチャットの回答がずれる危険がある。core の index を消費すれば全 index で規則が一貫する。
- **構造情報の範囲に収まる**: 「誰が何を所有するか」は karasu が扱う緩やかに変化する構造的コンテキストそのものであり（`docs/concepts.md` のスコープ）、実装詳細・実行時状態を持ち込むものではない。

## 却下した案

- **`owns` から app 側で owner を再導出する**: `ownerIndex` を core から公開せずに済むが、`@migration_target` 主オーナー選択を app に複製することになり TPL-20260615-01 に反する（index ごとに規則がずれる失敗モード）。却下。
- **組織グラフをシリアライズせず、import 先ファイルの本文をすべてプロンプトに連結する**: プロンプトが肥大化し、AI が「構造」ではなく生テキストのパースに頼る。構造を JSON で渡す既存方針（system グラフ）と非対称になるため却下。
- **system ノードにも `owner` を注記する**: `ownerIndex` は parser の `INDEXED_KINDS`（`service` / `domain`）でしかキーを持たないため system は決して所有されず、dead lookup になる。注記は子ノード（service / domain）に限定した。
