---
id: ADR-20260714-03
title: --from wrangler translate adapter と「adapter を採る基準」
status: accepted
date: 2026-07-14
topic: cli
authors: [kompiro]
related_to: [ADR-20260616-06, ADR-20260714-02, ADR-20260409-02]
scope:
  packages: [cli, core]
assumptions:
  - "file: packages/core/src/translate/wrangler.ts"
  - "file: packages/core/src/translate/wrangler.test.ts"
  - "symbol: packages/core/src/translate/translate.ts :: translateInfraConfig"
  - "symbol: packages/core/src/translate/translate.ts :: TranslateFormat"
  - "file: packages/cli/src/translate/translate.e2e.test.ts"
  - "file: docs/acceptance/1943-translate-from-wrangler.md"
---

# ADR-20260714-03: --from wrangler translate adapter と「adapter を採る基準」

## 背景

reverse-architecture ハーネス（[ADR-20260714-02](20260714-02-reverse-architecture-harness.md)）を
**hato**（Cloudflare Workers アプリ）に向けた実走で gap が表面化した（Issue #1935）。hato には
compose も k8s も無いため `translate` に食わせる adapter が存在せず、ハーネスは Cloudflare の binding
（D1 / R2 / Queues）を **手でモデル化**するしかなかった。その結果、具体的な Cloudflare 技術
（D1 = SQLite, R2 = object store）が論理ノードの `label` に混入した（`examples/en/hato/index.krs`）。
これは論理/物理分離の原則違反であり、まさに `translate` が排除するために存在する **物理層の
hallucination リスク**そのものである。

同時に、wrangler を認めるなら `serverless.yml` / `fly.toml` / `app.yaml` / SAM / Pulumi はなぜ
認めないのか、という **adapter 乱立（sprawl）を防ぐ admission 基準**を先に固定する必要があった。

本 ADR は設計方向 #1935（元 Design Doc `wrangler-translate-adapter.md`、PR #1941 でマージ）を、
実装（PR #1948 / Issue #1943）を経て確定した決定として集約する。

## 決定

**Cloudflare `wrangler.toml` から物理層を決定的に抽出する `karasu translate --from wrangler` adapter を
採用し、あわせて translate adapter の admission 基準を確定する。** 新規 `.krs` 構文はゼロ
（[ADR-20260616-06](20260616-06-krs-spec-v1-freeze.md) の v1 freeze と非衝突）。

1. **adapter admission 基準（3 条件すべて）** — adapter は、ソースが
   **(a)** 別目的で既に保守されている machine-readable な成果物であり、
   **(b)** 保守コストを償却できるだけの ecosystem 規模を持ち、
   **(c)** 既存の karasu 語彙へ判断を挟まない decisive な field-level rule でマップできる
   （推論なし・新構文なし）とき採用する。判断や新構文を要する primitive は out of scope と
   宣言し、warning で degrade する（決して hallucinate しない）。

2. **wrangler を先に出荷し、`--from terraform` を将来 coexist させる。** terraform（HCL / modules /
   interpolation）は faithful parse が高コストかつ低 fidelity。wrangler は cheap / precise /
   high-payoff（Workers は大きな ecosystem）。`--from` interface は複数フォーマットを多重化しており
   排他ではない。

3. **出力形状** — compose/k8s（deploy のみ）と異なり、`wrangler.toml` は論理ストアと物理実体の
   唯一のソースなので、adapter は自己完結モデルを出力する: engine-neutral な論理 `system`
   （Worker `service` + binding 由来の infra + edge）＋ materialize された物理 `deploy`
   （具体 Cloudflare 技術は `store { type ... }` に、論理 `label` には出さない）。Worker は
   既存の `function` deploy kind + `runtime "cloudflare-workers"`（新 kind は作らない）。

4. **binding → karasu マッピング** — 既存イディオムを再利用し新構文を作らない:

   | binding | 論理 | 物理 |
   | --- | --- | --- |
   | D1 | `database` | `store "Cloudflare D1"` |
   | R2 | `storage` | `store "Cloudflare R2"` |
   | Queues（producers） | `queue` | `store "Cloudflare Queues"` |
   | Vectorize | `database [index]` | `store "Cloudflare Vectorize"` |
   | KV | `database` | `store "Cloudflare KV"` |
   | Workers AI | `service [external]` + `->` edge | — |
   | Durable Object | `service [external]` + `->` edge | — |
   | service binding | `->` edge | — |

   所有 infra への edge は `-->`、外部 service への edge は `->`。未知 binding 種別は warning を
   出して skip する。

## 理由

- **物理層の hallucination 回避**が中核。具体技術を `label` ではなく物理 `store { type ... realizes }`
  に落とすことで、論理モデルはエンジン非依存に保たれ、エンジン交換で churn しない（`[index]` の
  設計思想と同じ）。deterministic 抽出はエージェントの hand-modeling を置き換える
  （[ADR-20260714-02](20260714-02-reverse-architecture-harness.md) の「物理層の hallucination 回避」）。
- admission 基準の **条件 (c)** が本質的ゲートであり、reverse-arch ADR の
  **構造層 = CLI（決定的） / 意味層 = subagent（判断）** の分界そのもの。マップに判断が要るなら
  それは skill / subagent の仕事であって adapter ではない。
- **条件 (b)** が anti-sprawl のレバー。`fly.toml` / `app.yaml` / `serverless.yml` は (a)(c) を
  満たすが今は (b) を満たさない — 「マップできるか」ではなく「償却できるか」で足切りする。
- (a)+(c) で既存の `openapi`（API 契約）/ `db`（schema）も同じ傘に収まる。原案の「deployment
  descriptor」ではこの 2 つを説明できなかったため「別目的の authoritative artifact」に refine した。
- **Vectorize → `database [index]`** は既存語彙にぴったり収まる（`[index]` は pgvector / Pinecone /
  Weaviate 等の vector store のために設計されている）ため、懸念された「専用 kind の新設」は不要。

## 却下した案

- **原案の admission 基準「広く使われる machine-readable な deployment descriptor」** — 既存の
  `openapi` / `db` adapter は deployment descriptor ではなく、既存セットを説明しきれない。
  「別目的の authoritative artifact」＋「償却できる ecosystem 規模」＋「決定的 field-level マッピング」
  の 3 条件に refine して採用した。
- **`--from terraform` を先に作る** — 一般解ではあるが HCL / modules / interpolation の faithful parse が
  高コストかつ低 fidelity。安い precise な wrangler を先に出し、terraform は coexist させる方針とした
  （排除ではなく順序の選択）。
- **Worker 用の新 deploy kind（`worker` / `edge`）を新設する** — v1 freeze に反し、既存の `function` +
  `runtime "cloudflare-workers"` で十分表現できるため却下。
- **KV に `[cache]` role tag を、Durable Object に stateful-compute notation を新設する** — 本 adapter の
  ために v1 語彙を広げるのは admission 基準 (c)（新構文なし）に反する。KV は素の `database`、DO は
  `service [external]` に degrade し、両者を **notation-watch（[#1816](https://github.com/kompiro/karasu/issues/1816)）** に送った。
  `[external]` は DO の真の所有境界というより「この adapter からは不透明」を示す実務マーカーである。
- **未知 binding を silent に無視する** — silent drop は「全部カバーした」と誤読される。warning を出して
  skip し、決して infra kind を hallucinate しない。

## 関連

- Issue: 設計方向 [#1935](https://github.com/kompiro/karasu/issues/1935)、実装 [#1943](https://github.com/kompiro/karasu/issues/1943)
- PR: design doc [#1941](https://github.com/kompiro/karasu/pull/1941)、実装 [#1948](https://github.com/kompiro/karasu/pull/1948)
- ADR: [ADR-20260616-06](20260616-06-krs-spec-v1-freeze.md)（v1 freeze）、[ADR-20260714-02](20260714-02-reverse-architecture-harness.md)（reverse-architecture harness）、[ADR-20260409-02](20260409-02-cli-translate-command.md)（translate CLI）
- AT: [docs/acceptance/1943-translate-from-wrangler.md](../acceptance/1943-translate-from-wrangler.md)
- cookbook: `docs/guide/notation-cookbook.md` idiom #7（Cloudflare Workers）
- notation-watch: [#1816](https://github.com/kompiro/karasu/issues/1816)（KV `[cache]` role / Durable Object stateful compute）
