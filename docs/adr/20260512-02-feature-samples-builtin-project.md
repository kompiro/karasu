---
id: ADR-20260512-02
title: "`examples/feature-samples/` を built-in ProjectMode example（1 プロジェクト）として同梱"
status: accepted
date: 2026-05-12
topic: app-ui
scope:
  packages:
    - app
    - core
related_to:
  - ADR-20260408-03
assumptions:
  - "grep: packages/core/src/builtins/examples.ts :: export const FEATURE_SAMPLES_PROJECT"
  - "grep: packages/app/src/hooks/useProjectInitialization.ts :: FEATURE_SAMPLES_PROJECT"
  - "grep: .claude/rules/examples-sync.md :: feature-samples/"
---

# ADR-20260512-02: `examples/feature-samples/` を built-in ProjectMode example（1 プロジェクト）として同梱

- **日付**: 2026-05-12
- **ステータス**: 決定済み
- **関連**:
  - [ADR-20260408-03](./20260408-03-project-mode-initial-content.md)（ProjectMode 初期コンテンツ — `examples/ec-platform` からの自動生成）
  - Issue [#1344](https://github.com/kompiro/karasu/issues/1344)
  - `examples/feature-samples/`、`.claude/rules/examples-sync.md`、`.claude/skills/update-examples/`

## 背景

`examples/feature-samples/` には、構文機能を 1 つずつ最小構成で示す単機能サンプル（`legend.krs` / `parallel-edges.krs` / `crud-matrix.krs` / `usecase-authorization.krs` / `resource-operations.krs` / `annotations.krs` / `edges.krs` / `external-nodes.krs` / `domain-drift.krs` / `domain-drill.krs` / `deploy-all.krs` / `bff-delivers.krs` / `users.krs` / `minimal.krs` の 14 個）が蓄積されている。これらは [ADR-20260408-03](./20260408-03-project-mode-initial-content.md) で同梱した `examples/ec-platform/`（段階的チュートリアル）と異なり built-in examples に登録されておらず、アプリからは到達できなかった — 利用者はリポジトリからコピーしてくる必要があった。

直接の動機は acceptance test（`docs/acceptance/`）の運用にある。AT のシナリオで `feature-samples/<feature>.krs` を「アプリで開く対象ファイル」として指定したいケースが出てきたが、`examples/feature-samples/` がアプリのどこからも開けないため、AT 実施者が「実例を参照する」手順を踏めなかった。アプリに同梱しておけば、AT は ProjectMode のセレクタから `feature-samples` プロジェクトを開いて該当ファイルを参照する、という再現可能な手順に落とせる。

## 決定

`packages/core/src/builtins/examples.ts` に `FEATURE_SAMPLES_PROJECT: ExampleProject`（`name: "feature-samples"`）を 1 件追加し、`useProjectInitialization` の初回シードに `client-mcp` の次として加える。

- **1 プロジェクトに 14 ファイル + `index.krs`**: アプリは project 切替時に `index.krs` を自動で開く（`useProjectInitialization` の switch エフェクト）。そのため、14 サンプルへの索引コメントと「ファイルツリーから開いてください」という最小の `system FeatureSamples` を持つ `index.krs` を 1 つ追加し、利用者は残り 14 ファイルをファイルツリーから開く。
- **`examples/feature-samples/index.krs` を実ファイルとして追加**: `examples/` ↔ `examples.ts` の同期ルール（`.claude/rules/examples-sync.md`）を一様に保つため、`index.krs` もディスク上の実ファイルとして置く。
- **drift ガード**: `packages/core/src/examples.test.ts` に、`examples/feature-samples/*.krs` の各ファイル内容が `FEATURE_SAMPLES_PROJECT.files` の対応エントリと byte 単位で一致することを検証するテストを追加する（`examples/ec-platform/` には従来テストがなかったが、本プロジェクトは数が多くドリフトしやすいため明示的に守る）。
- **`/update-examples` スキルと同期ルールの更新**: `.claude/rules/examples-sync.md` のマッピング表と `.claude/skills/update-examples/SKILL.md` の対象に `feature-samples/` を追加する。

## 理由

- **AT が実例を参照できる**: AT シナリオから `feature-samples` プロジェクトを「アプリで開く対象」として指定でき、手順が再現可能になる（本 ADR の直接動機）。
- **1 プロジェクト方式を選ぶ理由**: 14 個を別プロジェクトにすると初回起動時のセレクタに 14 エントリ増えて視認性が落ちる。`ec-platform`（段階的に切り替えて学ぶ — ADR-20260408-03 案B が却下された理由）と異なり、feature-samples は「索引から目的のものを 1 つ開く」アクセスパターンなので、1 プロジェクト + `index.krs` カタログが UX 上自然。
- **全 14 件を同梱する理由**: いずれも小さく、各々が固有の構文機能を示す。キュレーションして一部を落とすと、AT・ドキュメントからの参照先として歯抜けになる。
- **`core` に置く理由**: ADR-20260408-03 と同じ — `app`/`cli`/`vscode` から参照でき、TypeScript で型を添えられ、`.claude/rules/examples-sync.md` で `examples/` との同期を強制できる。

## 却下した案

### 案B: 14 個を別プロジェクトとして展開

`ec-platform` と同じく 1 サンプル 1 プロジェクト。初回セレクタに 14 エントリ増え、かつ「索引から 1 つ開く」アクセスパターンに合わない。却下。

### 案C: キュレーションした部分集合のみ同梱

`minimal` / `legend` / `edges` 等の数件のみ。同期負荷は下がるが、AT・docs からの参照先が歯抜けになる。却下。

## 関連ルール

`examples/feature-samples/` の編集は `/update-examples` スキル経由で行い、`examples.ts` の同期まで含めて同一コミットにする。`.claude/rules/examples-sync.md` にマッピング表を記載。
