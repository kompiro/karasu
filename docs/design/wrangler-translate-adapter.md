# `--from wrangler` translate adapter と「adapter を採る基準」

- **日付**: 2026-07-14
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1935](https://github.com/kompiro/karasu/issues/1935)
  - `translate` CLI: [#355](https://github.com/kompiro/karasu/issues/355) / [#356](https://github.com/kompiro/karasu/issues/356)、in-flight 拡張 [#1909](https://github.com/kompiro/karasu/issues/1909)（`--from db`）
  - reverse-architecture ハーネス: [ADR-20260714-02](../adr/20260714-02-reverse-architecture-harness.md)（引き金 [#1895](https://github.com/kompiro/karasu/issues/1895)）
  - notation watch: [#1816](https://github.com/kompiro/karasu/issues/1816)、cookbook: [#1818](https://github.com/kompiro/karasu/issues/1818)
  - roadmap item C（`translate` の抽象化 = adapter 課題 / post-v1.0 watch）: `docs/roadmap.md`
  - v1 freeze: [ADR-20260616-06](../adr/20260616-06-krs-spec-v1-freeze.md)
  - 関連 TPL: [TPL-20260510-16](../test-perspectives/TPL-20260510-16-convenience-vs-principled-api.md)（deterministic 部は principled API 経由）
  - コード: `packages/core/src/translate/`（`translator.ts` / `compose.ts` / `k8s.ts` / `db.ts` / `openapi.ts` / `realizes.ts`）、`packages/cli/src/translate/index.ts`
  - evidence: `examples/en/hato/index.krs`（reverse-architecture 実走で手モデル化した Cloudflare bindings）

## 背景・課題

reverse-architecture スキル（[ADR-20260714-02](../adr/20260714-02-reverse-architecture-harness.md)）を **hato**（Cloudflare Workers アプリ）に向けた実走で gap が表面化した。hato には compose も k8s も無いため `translate` に食わせる adapter が存在せず、ハーネスは Cloudflare の binding（D1 / R2 / Queues）を **手でモデル化**するしかなかった。

手モデル化した結果は `examples/en/hato/index.krs` に残っている:

```krs
database D1 {
  label "D1 (SQLite)"                    // ← 具体技術がラベルに漏れている
  description "Athlete profiles, goals, and activity records"
}
storage R2 { label "R2 Object Store" }   // ← 同上
queue Tasks { label "Task Queue" }
```

物理層（`deploy { store { type "..."; realizes ... } }`）が起こされておらず、**具体的な Cloudflare 技術（D1 = SQLite, R2 = object store）が論理ノードの `label` に混入**している。これは論理/物理分離の原則違反であり、まさに `translate` が排除するために存在する **物理層の hallucination リスク**そのものである（AI-support design #355 / #356、reverse-arch ADR「物理層の hallucination 回避」節）。

`--from wrangler` adapter があれば、serverless アプリでもこのループを deterministic に閉じられる。

**ただし本 Issue の主眼は adapter 単体ではない**。wrangler を認めるなら `serverless.yml` / `fly.toml` / `app.yaml` / SAM / Pulumi はなぜ認めないのか、という **adapter 乱立（sprawl）を防ぐ admission 基準**を先に固定することが本 Design Doc のデリバリの中心である。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| 既存 adapter | `compose` / `k8s` / `openapi` / `db`（`packages/core/src/translate/`） |
| adapter interface | `Translator.translate(input, context): Promise<string>`。pure（fs / process に触れない）。host が入力読み込み・`karasu.map.yaml` 探索・warning sink を担う |
| 物理層の綴り方 | `deploy "<env>" { <kind> <id> { runtime ...; realizes <logicalId> } store { type "..."; realizes <infraId> } }`。compose / k8s は topology + `realizes` を出力 |
| deploy unit kind | `war` / `jar` / `oci` / `lambda` / `function` / `assets` / `job` / `artifact` / `store`（`function` = Azure Functions / Google Cloud Functions） |
| 論理 infra block | `database`（leaf `table`）/ `queue`（leaf `queue-item`）/ `storage`（leaf `bucket`）。system view の依存 tier に描画 |
| 既存の role tag | `[index]` = **derived search / secondary index**（pgvector / Pinecone / Weaviate 等の vector store を含む）。`[external]` = システム境界外の managed 依存 |
| deterministic 原則 | 構造層 = CLI（決定的）、意味層 = subagent（判断）。adapter は判断を持ち込まない（[ADR-20260714-02](../adr/20260714-02-reverse-architecture-harness.md)） |

## 制約・前提

- **v1 freeze と衝突しない**。adapter は core syntax の変更ではなく、roadmap item C の通り experimental な **adapter 側の関心**（[ADR-20260616-06](../adr/20260616-06-krs-spec-v1-freeze.md) のスコープ外）。本 Doc は**新規 `.krs` 構文をゼロ**に保つ。
- adapter は **pure**（既存 `Translator` interface に従う。fs / process に触れない）。
- **out of scope**: `--from terraform` の実装（後述の通り将来 adapter として coexist させるが本 Doc では作らない）。KV の cache role tag / stateful-compute notation の**新設**（notation-watch に送る）。

## Q1 — adapter admission 基準（refine）

Issue の原案は *「広く使われる machine-readable な deployment descriptor で、新構文なしに karasu の物理語彙へマップできるとき adapter を認める」*。

これは既存セットを説明しきれない。`openapi`（API 契約）と `db`（schema）は **deployment descriptor ではない**。4 つの既存 adapter を貫く原則はもっと締まっている:

> **adapter は、ソースが次の 3 条件すべてを満たすとき採用する:**
> - **(a) 別目的で既に保守されている machine-readable な成果物**である（karasu のために書かれたものではない）。
> - **(b) 保守コストを償却できるだけの ecosystem 規模**を持つ。
> - **(c) 既存の karasu 語彙へ、判断を挟まない decisive な field-level rule でマップできる**（推論なし・新構文なし）。判断や新構文を要する primitive は **out of scope と宣言し、warning で degrade する。決して hallucinate しない。**

- 条件 **(c)** が本質的なゲートであり、reverse-arch ADR の **構造層=CLI（決定的） / 意味層=subagent（判断）** の分界そのものである。マップに判断が要るならそれは skill / subagent の仕事であって adapter ではない。
- wrangler は (a)(b)(c) をクリアする。`fly.toml` / `app.yaml` / `serverless.yml` は (a)(c) を満たすが **(b) を今は満たさない**（ecosystem 規模）。これが **anti-sprawl のレバー**になる — 「マップできるか」ではなく「償却できるか」で足切りする。
- (a)+(c) で `openapi`（API 契約）も `db`（schema）も同じ傘に収まる。**「deployment descriptor」ではなく「別目的の authoritative artifact」**が正しい抽象。

## Q2 — wrangler vs terraform: 安いほうから始めて coexist

- `--from` interface は既に複数フォーマットを多重化している。wrangler と terraform は排他ではない。
- terraform（HCL / modules / interpolation）は faithful に parse するのが高コストかつ **低 fidelity**。長期の一般解ではあるが、待つ理由にはならない。
- wrangler は cheap / precise / high-payoff（Workers は大きな ecosystem）。**wrangler を先に出荷し、将来の `--from terraform` を coexist させる**。

## Q3 — 出力形状: infra blocks + 論理 service 1つ + materialized な物理 deploy

`wrangler.toml` は「1 Worker + attach された resource binding」。compose/k8s のような rich な deploy graph にはならない。出力は:

1. **論理 infra block**（engine-neutral）: binding を `database` / `queue` / `storage` に落とす。
2. **論理 service を 1 つ**: Worker 本体（`wrangler.toml` の `name`）。
3. **物理 `deploy` を materialize**: これが hato 手モデルに対する**本質的な勝ち**。具体的な Cloudflare 技術を `label` ではなく **物理層の `realizes`** に置く。

```krs
deploy "hato" {
  function HatoWorker { runtime "cloudflare-workers"; realizes HatoApi }
  store { type "Cloudflare D1";     realizes D1 }
  store { type "Cloudflare R2";     realizes R2 }
  store { type "Cloudflare Queues"; realizes Tasks }
}
```

- Worker → **`function`** deploy kind（既存 kind のうち最も近い。`worker` / `edge` 新 kind は作らない = Q1(c) 遵守）。`runtime "cloudflare-workers"` で edge serverless を明示。
- 論理 `database` / `storage` / `queue` は engine-neutral のまま。エンジンが変わっても論理モデルが churn しない（`[index]` の設計思想と同じ）。
- 構造は compose/k8s の出力（topology + `realizes`）と同型 → adapter の鋳型に収まる。

## Q4 — Cloudflare primitive → karasu マッピング

多くの行は Issue が懸念したより clean。特に **Vectorize → `database [index]`** は既存語彙にぴったり収まる（`[index]` は "a vector store such as pgvector / Pinecone / Weaviate" のために設計されている）。

| binding | karasu 論理 | 物理 | 状態 |
| --- | --- | --- | --- |
| D1 | `database` | `store "Cloudflare D1"` | clean plumbing |
| R2 | `storage` | `store "Cloudflare R2"` | clean plumbing |
| Queues | `queue` | `store "Cloudflare Queues"` | clean plumbing |
| Vectorize | `database [index]` | `store "Cloudflare Vectorize"` | **clean — `[index]` が既にカバー**（cookbook 1 件） |
| service binding | `->` edge（名前で参照する service へ） | — | clean（cookbook 1 件） |
| Workers AI | `service [external]` + edge | — | cookbook 1 件（外部モデルサービス） |
| KV / cache | `database` | `store "Cloudflare KV"` | **notation-watch**（下記） |
| Durable Object | `service [external]` + edge | — | **notation-watch**（下記） |

### KV → `database` + notation-watch（決定）

KV は service が read/write する data store なので `database` に落とす（物理 `store "Cloudflare KV"`）。ただし KV は cache 用途が多く、RDBMS / SoR の含意とはズレる。

- **決定**: adapter は `database` を emit。
- **notation-watch**（#1816 へ）: `[index]` と平行な **`[cache]` role tag** の新設を将来検討。role（技術ではない）を表す点で `[index]` と同型の拡張になりうる。本 Doc では新設しない（v1 freeze / Q1(c)）。

### Durable Object → `service [external]` + edge + notation-watch（決定）

DO は stateful compute で clean な infra kind が無い。DO の class 実装は adapter からは introspect できない不透明な単位であり、Worker は binding/stub 経由で **別アドレスの stateful actor に到達する**。

- **決定**: DO を **`service [external]`** として emit し、Worker → DO の `->` edge を張る。これにより Workers AI / 他の非 introspectable binding と**統一的**に「Worker が外側の不透明な単位へ依存する」と表現でき、依存 tier に描画される。
- **caveat（Doc に明記）**: DO の class は本来「自分のコード」なので `[external]` は真の所有境界というより **「この adapter からは不透明」を示す実務マーカー**である。DO の stateful/store 側面（DO は store でもある）は undermodel される。
- **notation-watch**（#1816 へ）: stateful-compute notation が将来できたら再訪する。

### cookbook（#1818）に起こす行

- Vectorize = `database [index]`（vector index の綴り方）
- service binding = Worker→Worker の communication edge
- Workers AI = `service [external]`（外部モデルサービス）

### notation-watch（#1816）に送る行

- KV cache role（`[cache]` tag 候補）
- Durable Object の stateful compute

## 現時点の方針

**wrangler adapter を出荷し、terraform を将来 coexist させる**（Q2）。admission 基準は上記 (a)(b)(c)（Q1）。出力は infra blocks + 論理 service 1 つ + materialized 物理 deploy（Q3）。マッピングは Q4 の表。KV = `database` + notation-watch、DO = `service [external]` + notation-watch。

### 実装の指針

本 Design Doc は **design direction** を確定させるもの。実装は別 Issue に展開する。

1. **実装 Issue を起こす**: `packages/core/src/translate/wrangler.ts` 新規。既存 `Translator` interface に従う pure 実装。`wrangler.toml`（TOML）を parse し Q3/Q4 の形状を emit。CLI `--from wrangler` を `packages/cli/src/translate/index.ts` / `TranslateFormat` に追加。
2. `wrangler.toml` の binding セクション（`[[d1_databases]]` / `[[r2_buckets]]` / `[[queues.producers]]` / `[[kv_namespaces]]` / `[[vectorize]]` / `[[durable_objects.bindings]]` / `[ai]` / `[[services]]`）を Q4 表に従って決定的にマップ。未知 binding は warning で degrade（Q1(c)）。
3. **物理層 `realizes` を必ず emit**（Q3 の勝ち筋）。concrete 技術は `label` ではなく `store { type ... }` に置く。
4. AT: `docs/acceptance/` に新規ファイル。TC は:
   - D1/R2/Queues が engine-neutral な `database`/`storage`/`queue` + 物理 `store realizes` に落ちる（label に "D1"/"R2" が混入しない）
   - Vectorize が `database [index]` になる
   - service binding が `->` edge になる／Workers AI が `service [external]` になる
   - KV が `database` になる／DO が `service [external]` + edge になる
   - 未知 binding で warning が出る（silent drop しない）
   - 出力が `karasu` で parse round-trip する
5. **cookbook / notation-watch の派生**: #1818 に Vectorize / service binding / Workers AI の 3 エントリ、#1816 に KV cache role / DO stateful compute の 2 watch 項目を起こす（実装 Issue とは別に扱ってよい）。
6. **ADR 昇格**: 本 Doc の design direction（admission 基準 + wrangler positioning + 出力形状 + マッピング）は実装着手前でも合意が固まれば ADR 化しうる。実装完了後、`docs/adr/YYYYMMDD-NN-wrangler-translate-adapter.md` として昇格し、本 Design Doc は同 PR で削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: **なし**（新 adapter の追加、既存 `--from` の挙動は不変。新構文ゼロ）。
- ドキュメント更新: `docs/spec/` の translate adapter 一覧、`docs/guide/notation-cookbook*.md`（#1818）。
- テスト・examples への影響: `examples/en/hato/index.krs` を将来 adapter 出力で置き換え可能（本 Doc スコープ外の follow-up）。

## 未解決の問い / 決めないこと

- **`[cache]` role tag の新設可否** — notation-watch #1816 に送る。本 Doc では決めない（v1 freeze）。
- **stateful-compute notation**（Durable Object を真に表す kind）— notation-watch #1816。当面は `service [external]` で degrade。
- **`--from terraform` の設計** — coexist させる方針だけ確定。HCL parse の具体は別 Doc。
- **multi-worker（monorepo で複数 `wrangler.toml`）の合成** — service binding を跨る worker 間 edge の解決は v1 adapter では単一 toml 内の名前参照に留める。
