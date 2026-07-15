---
id: TPL-20260715-01
title: "infra leaf のドメイン所有は entity 層から導出する — 物理 table に再宣言せず、leaf 粒度・所有集合で扱う"
status: active
date: 2026-07-15
applicable_to:
  - "infra leaf（table / queue-item / bucket）のドメイン所有を読む機能を追加・変更するとき"
  - "cross-domain-store-access 診断や、その所有導出（entity → table → domain）に関わるコードを追加・変更するとき"
  - "infra leaf に「所有ドメイン」を持たせたくなったとき（物理側への所有宣言の誘惑）"
  - "所有・アクセスの scope（system 単位）や store 除外（[external] / [index]）を変更するとき"
known_consumers:
  - warnings（detectCrossDomainStoreAccess）
  - resource-entity（buildEntityResolver）
discovered_from:
  - root_cause_file: "docs/spec/syntax.md"
  - root_cause_adr: "docs/adr/20260715-01-domain-entity-modeling.md"
related_to:
  - TPL-20260519-02
  - TPL-20260623-02
  - TPL-20260514-08
topic: resolver
scope:
  packages:
    - core
---

# TPL-20260715-01: infra leaf のドメイン所有は entity 層から導出する（物理 table に宣言しない）

## 観点

infra leaf の「所有ドメイン」は **論理層（`entity` の親 domain）から導出される単一の事実**であり、
物理 `table` / `queue-item` / `bucket` には決して宣言させない。これを破ると論理/物理の分離が
崩れ（[TPL-20260519-02](TPL-20260519-02-shared-vocabulary-dual-representation.md) の dual-representation）、
所有の source-of-truth が 2 つに割れて静かに drift する。

導出には 4 つの構造的規定があり、いずれか 1 つでも崩すと診断が誤る:

1. **導出元は entity 一本** — 所有 = `owners(leaf) = { D : D に属する entity が leaf をマッピング }`。
   物理側（`table` ノードやそのプロパティ）に所有を持たせない。
2. **leaf 粒度でキーする** — 所有は `infraId.tableId`（例 `OrderDB.orders`）で持つ。`database`
   単位に丸めると、1 store 内の兄弟テーブルが別ドメインに属するケースで reach-in を取りこぼす
   （accessor が *ある* テーブルの所有者なら *別* テーブルへの越境が隠れる）。
3. **所有はドメインの集合** — 1 leaf は複数ドメインに所有されうる（co-ownership）。単一所有者を
   前提にすると co-owned leaf で誤判定する。判定は `accessingDomain ∉ owners(leaf)`。
4. **scope は system 単位、除外は fan-in と対称** — domain id は system 内でのみ error 級一意
   （[ADR-20260714-01](../adr/20260714-01-cross-domain-ghost-entities.md)）。cross-system は解決しない。
   `[external]` / `[index]` store は所有・アクセスの両方から除外する（`shared-infra-fan-in` と対称）。

## 失敗パターン

1. **物理 table に所有を宣言できるようにする** — `table orders { domain Ordering }` 等。所有が
   entity 由来と二重化し、どちらが正典か曖昧になる。物理側はドメインを持たない設計が正しい。
2. **database 粒度でキーする** — Ordering が `OrderDB.orders`、Billing が `OrderDB.invoices` を
   所有するとき、Ordering の `OrderDB.invoices` アクセスが「OrderDB を所有しているから」と誤って
   免除される。leaf 粒度なら発火する。
3. **単一所有者前提** — co-owned leaf（2 ドメインの entity が同一 table をマッピング）を「所有者なし」
   に落として発火させない、あるいは第三ドメインの reach-in を取りこぼす。集合で持てば所有者は免除・
   集合外は発火が両立する。
4. **read/write の取り違え** — `mode` は read/write/readwrite を集約する。write-only 発火にしたり
   read を落としたりしない。severity は read/write とも info（[TPL-20260514-08](TPL-20260514-08-diagnostic-register-fact-vs-style.md)
   の事実 vs 流派判断）。
5. **解決集合の非同期** — resource→store の解決を `deriveInfraEdges` / `detectSharedInfraFanIn` /
   `detectUnassignedResources` と別ロジックで実装し drift させる（[TPL-20260623-02](TPL-20260623-02-validation-target-set-enumerates-all-kinds.md)）。
   `buildEntityResolver` を共有する。
6. **entity 未導入モデルで誤発火** — leaf を誰の entity もマッピングしていないとき所有は不明。
   発火させてはならない（ボトムアップの正当な中間状態。entity を足せば zero-edit で有効化）。

## 検証の指針

- 別ドメイン所有の leaf への read/write → 1 件発火、`accessingDomain` / `owningDomains` /
  `infraId` / `tableId` / `mode` が正しい。
- 所有ドメイン自身のアクセス（intra）→ 発火しない。
- 兄弟テーブル: A が `DB.a` 所有・B が `DB.b` 所有、A が `DB.b` にアクセス → 発火（leaf 粒度）。
- co-owned leaf: A・B が同一 leaf を所有、C がアクセス → 発火（owners=[A,B]）、A / B のアクセス → 発火しない。
- `[external]` / `[index]` store 越え → 発火しない。
- entity マッピングの無い純物理モデル → 発火しない。
- cross-system 参照 → 発火しない（scope 外）。
- read+write を同一ドメインから → 1 件に集約、`mode: readwrite`。
- `shared-infra-fan-in` と同一 store で共起しても互いに抑制せず独立に発火する。

## 派生元 spec

- [`docs/spec/syntax.md`](../spec/syntax.md) § `entity` declaration →「Domain ownership of an
  infra leaf — cross-domain store access」節（本 TPL への back-ref あり。ja は `syntax.ja.md` の
  「infra leaf のドメイン所有 — cross-domain ストアアクセス」節）。
- 診断カタログ: [`docs/spec/diagnostics.md`](../spec/diagnostics.md) `cross-domain-store-access`。
- 設計経緯: [`docs/design/domain-store-ownership-diagnostic.md`](../design/domain-store-ownership-diagnostic.md)
  （ADR 昇格予定）、土台は [ADR-20260715-01](../adr/20260715-01-domain-entity-modeling.md)。
