---
id: ADR-20260715-04
title: infra leaf のドメイン所有を entity から導出し cross-domain ストアアクセスを info 診断する
status: accepted
date: 2026-07-15
topic: resolver
depends_on:
  - ADR-20260715-01
  - ADR-20260405-05
related_to:
  - ADR-20260615-02
  - ADR-20260514-02
  - ADR-20260714-01
scope:
  packages: [core, i18n, lsp, app, cli]
assumptions:
  - "symbol: packages/core/src/resolver/warnings.ts :: detectCrossDomainStoreAccess"
  - "symbol: packages/core/src/resolver/warnings.ts :: collectInfraInScope"
  - "grep: packages/core/src/types/warnings.ts :: cross-domain-store-access"
  - "symbol: packages/core/src/spec/operations.ts :: isReadOperation"
  - "grep: packages/core/src/resolver/resource-entity.ts :: infraChildId"
  - "file: docs/test-perspectives/TPL-20260715-02-domain-ownership-derived-from-entity-not-declared.md"
---

# ADR-20260715-04: infra leaf のドメイン所有を entity から導出し cross-domain ストアアクセスを info 診断する

- **日付**: 2026-07-15
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#1819](https://github.com/kompiro/karasu/issues/1819)（親 [#1816](https://github.com/kompiro/karasu/issues/1816) notation watch round 2, item 2）
  - 実装 PR: [#1967](https://github.com/kompiro/karasu/pull/1967)（設計 PR [#1950](https://github.com/kompiro/karasu/pull/1950) — 旧 `docs/design/domain-store-ownership-diagnostic.md`。本 ADR に集約して削除）
  - 土台 ADR: [ADR-20260715-01](20260715-01-domain-entity-modeling.md)（`entity`（domain 子）+ `table DB.tbl` 物理マッピング。所有導出の source-of-truth）、[ADR-20260405-05](20260405-05-database-as-first-class-node.md)（database first-class ノード）
  - 対になる診断: [ADR-20260615-02](20260615-02-shared-infra-fan-in-diagnostic.md)（`shared-infra-fan-in` info。本診断はこれと直交）
  - 統治 ADR: [ADR-20260514-02](20260514-02-style-prescription-stance.md)（流派が smell と呼ぶ構造は `info` で事実通知 / register は事実 vs 流派判断で決める）
  - 前例 ADR: [ADR-20260714-01](20260714-01-cross-domain-ghost-entities.md)（cross-domain 参照の per-system スコープ解決）
  - 関連 TPL: [TPL-20260715-02](../test-perspectives/TPL-20260715-02-domain-ownership-derived-from-entity-not-declared.md)（所有は entity 層から導出し物理 table に宣言しない・leaf 粒度・所有集合・per-system）、[TPL-20260519-02](../test-perspectives/TPL-20260519-02-shared-vocabulary-dual-representation.md)、[TPL-20260623-02](../test-perspectives/TPL-20260623-02-validation-target-set-enumerates-all-kinds.md)、[TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md)
  - コード: `packages/core/src/resolver/warnings.ts`（`detectCrossDomainStoreAccess` / `collectInfraInScope`）、`packages/core/src/resolver/resource-entity.ts`、`packages/core/src/spec/operations.ts`、`packages/core/src/types/warnings.ts`

## 背景

実 OSS のアーキテクチャを起こす作業（karasu-nest リバース含む）で 2 つの関連ニーズが浮上した（#1816 item 2）:

1. **infra leaf（table）をドメインで括りたい** — 1 つの database の table 群は別々のドメインに属していることがあり、その所有を可視化したい。
2. **cross-domain ストアアクセスを自動検出したい** — ドメイン A の usecase が、ドメイン B が所有する table を read/write するのは境界シグナルであり、診断に値する。

(2) は round-2 findings の中で最も karasu-native — 「誰が何を所有し、どこで境界を跨ぐか」そのもの。そして (1) が (2) を可能にする: table にドメイン所有者が付けば cross-domain アクセスが計算可能になる。ここで所有をどう与えるかが設計の要になる。物理 `schema` を所有元にする案が親 Issue で挙がったが、1 domain ↔ N schema・1 schema ↔ N domain と非 1:1 で、所有の source-of-truth にはならない。

## 決定

**infra leaf の所有を、既存の `entity { table DB.tbl }` マッピング（ADR-20260715-01）から導出し**（新構文ゼロ・物理 `table` に所有を宣言させない）、**ドメイン A の usecase がドメイン B 所有の leaf を読み書きしたとき新 Warning kind `cross-domain-store-access`（`info` register）を発火させる。** `shared-infra-fan-in` と対になるが直交する。

個別の設計判断:

- **所有はドメインの集合** — `owners(leaf) = { D : D に属する entity が leaf をマッピング }`。通常は単一要素。複数ドメインの entity が同一 leaf をマッピングする co-owned leaf は集合として保持する。
- **判定は `accessingDomain ∉ owners(leaf)`** — single-owner への reach-in も、co-owned leaf への「所有集合外の第三ドメイン」からのアクセスも同じ式で捕捉し、co-owned leaf の所有者どうしは免除される。
- **leaf 粒度でキーする**（`infraId.tableId`、`database` 単位ではない）— 1 store 内の兄弟テーブルが別ドメインに属しうるため。store 単位に丸めると、accessor が *ある* テーブルの所有者であることで *別* テーブルへの越境が隠れる。
- **read/write を `mode` param に集約** — resolver が既に合成する `[read]`/`[write]` タグから `mode ∈ { read, write, readwrite }` を導出（`isReadOperation` を `isWriteOperation` と対称に新設）。severity は read/write とも `info`。write-only 発火や severity 分割はしない（read も CQRS / shared kernel の観測対象）。
- **register は `info`** — ADR-20260514-02 / TPL-20260514-08 の判定樹に従う。「domain A が domain B のストアに触れる」は構造的事実で、smell と呼ぶかは流派判断（shared kernel・移行期・意図的共有では正当）。
- **scope は per-system + top-level**。domain id は system をまたいで比較しない。ただし同一 system 内で同じ domain id が複数 service に分散する（`domain-dispersal` の info 事実。error ではない）ケースでは、両者を **1 つの論理ドメイン**として扱う — domain 辺・ghost domain・`handles` などモデル全体が domain 同一性を id で扱うのと一貫し、分散自体は `domain-dispersal` が surface する。
- **`[external]` / `[index]` ストアは除外** — `shared-infra-fan-in` と対称。境界外の managed store や派生 read model へのアクセスは所有境界の smell ではない。除外ストアは所有も供給しない。
- **検出は `analyze()`（merge 後 `KrsFile`）で行う** — view 非依存。App / CLI / LSP のいずれからも surface される。LSP single-document では抑制しない（under-report のみで false-positive は出ない。fan-in / domain-dispersal と同性質）。
- **entity 未導入モデルは許容** — leaf を誰の entity もマッピングしていなければ所有不明として発火しない（ボトムアップの正当な中間状態。entity を足せば zero-edit で後から効く）。
- **params** = `{ accessingDomain, owningDomains, infraId, infraKind, tableId, mode }`。resolver の resource→store 解決集合は `deriveInfraEdges` / `detectSharedInfraFanIn` / `detectUnassignedResources` と同期する（TPL-20260623-02）。実装では infra 収集と `[external]`/`[index]` 除外を `collectInfraInScope` に共通化し、fan-in と 1 箇所で共有する。

## 理由

- **所有を entity 層から導出することで論理/物理分離を保ちつつ新 builtin を増やさない**。ちょうど着地した entity 層（ADR-20260715-01）を再利用し、「infra leaf をドメインで括る」(1) が entity マッピングの副産物としてタダで手に入る。#1816 の promotion-gate（実利用証拠なしに builtin を凍結しない）に整合する。
- **leaf 粒度 + 所有集合が現実（schema は 1:1 でない）を正しく扱う**。co-owned leaf を「所有者なし」に落とさず、所有集合外からの越境だけを発火させる。
- **`shared-infra-fan-in` との直交性**。あちらは store を何 service が共有するか（物理共有の量）、こちらは所有境界の越境（論理）を観測する。同一 store で両方が独立に発火してよく、二重計上でも相互抑制でもない（ADR-20260615-02 が `infra-redeclared-across-files` と fan-in を書き分けたのと同じ原則）。
- **`info` register の一貫性**。ADR-20260514-02 の判定樹が想定した「次のエントリ」を追加するだけで、原理から再導出可能。`warning`（=直すべき）は意図的な cross-domain 共有で誤報になり ADR-20260514-02 と矛盾する。

## 却下した案

- **案B — 物理 `table` にドメインを宣言させる**（`table T { domain Ordering }`）: 物理面にドメインスコープを持ち込み論理/物理を conflate（core concept 違反、TPL-20260519-02）。新 builtin を増やし（promotion-gate 違反）、entity マッピングと二重管理になりどちらが正典か曖昧。
- **案C — 物理 `schema` を store に持たせ `schema.table` 粒度で realize する**: これは物理配置の問題で論理所有ではない。1 domain ↔ N schema・1 schema ↔ N domain と非 1:1 で所有導出に使えず、entity 未導入 table の所有補完もできない。本診断とは独立の物理層フィーチャとして切り離す（動機が生じたとき #1632 とは別に扱う）。
- **案D — グルーピングを view/rendering 側だけで解く**: (2) の診断ニーズ（最も karasu-native な finding）に応えない。視覚グルーピングは comprehension pillar の関心事で、所有導出（本 ADR）が入った後の follow-up とする。
- **`warning` register で出す** / **write-only 発火** / **severity 分割**: いずれも意図的 cross-domain 共有や read での誤報・情報欠落を招く。単一 `info` + `mode` param に統一した。

## 残りの follow-up

- **co-ownership それ自体の通知**（`multi-domain-table` info 等）: 実利用証拠が出てから判断（promotion-gate）。
- **視覚グルーピング**: system view の infra leaf に所有ドメインの sub-label / badge を付す軽量案（ADR-20260714-01 の ghost sub-label 機構を再利用）を第一候補に、別 Issue で。
- **物理 schema モデリング**（案C）: 動機が生じたとき独立フィーチャとして。
