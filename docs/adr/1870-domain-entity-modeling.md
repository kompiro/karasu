---
id: ADR-1870
title: ドメインエンティティと関連のモデリング（v1）— 非目標「DB スキーマ」の線引き直し
status: accepted
date: 2026-07-15
topic: core-concepts
related_to:
  - ADR-644
  - ADR-316
  - ADR-1911
scope:
  packages:
    - core
    - app
    - cli
---

# ADR-1870: ドメインエンティティと関連のモデリング（v1）— 非目標「DB スキーマ」の線引き直し

- **日付**: 2026-07-15
- **ステータス**: 決定済み
- **関連**:
  - Issue [#1870](https://github.com/kompiro/karasu/issues/1870)（v1 epic）、[#1910](https://github.com/kompiro/karasu/issues/1910)（PR 4 = 本 ADR 昇格）
  - PR: [#1882](https://github.com/kompiro/karasu/pull/1882)（core）、[#1896](https://github.com/kompiro/karasu/pull/1896)（entity view）、[#1918](https://github.com/kompiro/karasu/pull/1918)（resource→entity 解決）、[#1919](https://github.com/kompiro/karasu/pull/1919)（app view toggle + permalink parity）、[#1944](https://github.com/kompiro/karasu/pull/1944)（translate --from db）
  - [ADR-1911](1911-cross-domain-ghost-entities.md) — 本 ADR の sub-decision。エンティティビューの cross-domain 関連を限定子付き参照 + ghost で表示する詳細
  - [ADR-644](644-translate-db-aggregate-grouping.md) — translate --from db の集約畳み込み・FK 2 段階・ジャンクション検出・ID トレーサビリティ。本 ADR の scaffold はこの粒度・ヒューリスティクスを再利用する
  - [ADR-316](316-database-as-first-class-node.md) — database first-class ノード（entity の物理対応先）
  - 関連 TPL: [TPL-20260711-01](../test-perspectives/TPL-20260711-01-entity-carries-no-attributes.md)、[TPL-20260714-01](../test-perspectives/TPL-20260714-01-cross-domain-entity-reference-qualified.md)、[TPL-20260714-02](../test-perspectives/TPL-20260714-02-inferred-tag-only-soft-fk.md)、[TPL-20260510-07](../test-perspectives/TPL-20260510-07-derivation-tag-semantics.md)、[TPL-20260510-19](../test-perspectives/TPL-20260510-19-information-flows-up.md)、[TPL-20260510-21](../test-perspectives/TPL-20260510-21-scoped-glance-drill-down.md)、[TPL-20260623-02](../test-perspectives/TPL-20260623-02-validation-target-set-enumerates-all-kinds.md)、[TPL-20260630-01](../test-perspectives/TPL-20260630-01-deep-link-anchor-cross-surface-parity.md)
  - コード: `packages/core/src/parser/parser.ts`（entity 宣言）、`packages/core/src/resolver/resource-entity.ts`（bare id → entity 解決）、`packages/core/src/view/view-extract.ts`（`extractEntityView`）、`packages/core/src/translate/db.ts`（scaffold）
  - 仕様: `docs/spec/syntax.md` § entity declaration、`docs/spec/tags-annotations.md` §『[inferred]』、`docs/spec/permalink.md`、`docs/spec/diagnostics.md`、`docs/concepts.md` 非目標節

## 背景

システム開発ではドメインごとに担当チームがあり、新メンバーはそのドメインの
キャッチアップをしたい。オンボーディングで特に効くのは **そのドメインが扱う
エンティティとその関連**（ER）の把握である。しかし既存 ER ツールは
**スキーマ全体を一度に吐き出す**ため役立てづらい。「一目で把握できる情報量に
絞る」という karasu の中核原則（drill-down・ghost 表示・ビュー単位の情報量制御）が、
まさにこの問題を解く。

一方、当時の非目標（`docs/concepts.md`）は「テーブル、カラム、インデックス、
外部キー、ER レベルの関係は対象外」と、物理スキーマ（カラム・型・インデックス・
FK 制約定義）と概念レベルのエンティティ・関連を **区別せず一括で** 弾いていた。

本決定はこの非目標を **覆すのではなく線を引き直す**。非目標の共通フィルタ
「karasu が扱うのは *ゆっくり変化する構造的な文脈* — 何が存在し、どう関係し、
誰が所有するか」に、ドメインエンティティは合格する（Order が **存在** し、
Customer と **関係** し、注文ドメイン＝注文チームが **所有** する）。フィルタが
本当に弾いているのはカラム・型・インデックス（実装詳細）と、モデル→DDL という
詳細化方向（down）である。情報の流れる方向（抽象化方向 = up）は変わらない
（[TPL-20260510-19](../test-perspectives/TPL-20260510-19-information-flows-up.md)）。

## 決定

論理面に **`entity`（`domain` の子）** を新設し、そのドメインが所有する概念
エンティティと関連をモデリングする。v1 は新 edge 構文をゼロで出す。

1. **語彙 — 属性を持たない `entity`。** `entity` は `domain` の子で、保持するのは
   名前・関連（エッジ）・物理対応（`table <InfraId>.<subId>` dot 記法）・
   `label` / `description` のみ。**カラム・型・インデックスは持たない**。この
   「属性なし」線が滑り坂ガードで、非目標の物理スキーマ側に踏み込まない
   （[TPL-20260711-01](../test-perspectives/TPL-20260711-01-entity-carries-no-attributes.md)）。
   entity id は他ノードと同じフラットな id 空間に置く。

2. **関連 1 つ = edge 1 本、方向 = 参照保持側 → 参照される側。** entity 間は
   **依存**ではなく **関連（association）** なので、依存の双方向 2 本書きを
   持ち込まない。`Order -> Customer` = Order 側が参照を保持する（AR:
   `belongs_to`、物理: `orders.customer_id`）。逆方向は同じ 1 本から読み取れる。
   保持側 entity ブロック内に宣言し、既存の edge origin scope 規則
   （`edge-source-mismatch`）が方向規約を強制する。多重度タグ（`[n:1]` / `[n:m]`）
   と bare ジャンクションのビュー畳みは v2。

3. **`resource` の正準形は論理参照。** usecase 内の bare `resource <id>` は、
   model-wide で unique match する `entity` に解決する（別ドメイン / 別サービスの
   宣言でも可）。この論理参照が正準形で、物理 dot 記法（`resource OrderDB.orders`）は
   ボトムアップの正当な中間状態として残す。解決は resolver が担うため、後日
   `entity Order { table OrderDB.orders }` を宣言すると usecase 側 **無編集で**
   `unassigned-resource` 警告が消える（編集ゼロの昇格）。`usecase → entity → table →
   database` を辿って `service → database` エッジと read/write タグを導出し、
   物理直参照と entity 経由参照が同じ store に到達しても **二重計上しない**。

4. **domain 配下のエンティティビュー。** domain drill-down に usecase と混載すると
   視覚密度原則（[TPL-20260510-21](../test-perspectives/TPL-20260510-21-scoped-glance-drill-down.md)）に
   抵触するため、**別ビュー**として追加しユースケースビューと切り替える。ドメイン外
   entity への関連は **ghost** 表示（詳細は [ADR-1911](1911-cross-domain-ghost-entities.md)）。
   モデル横断の単一 ER ビューは採らない（本設計の原点＝「全部一度に吐く ER」の
   再生産になる）。entity 関連は上位ビューで domain 間エッジに畳み上げる。

5. **permalink view token `entity`。** `#krs-entity-<id>[:<highlight>]` を追加。
   `<id>` = domain id ならそのエンティティビューを開き、entity id なら所有 domain の
   ビューを開いて当該 entity にフォーカスする。`ShareTargetView` に `entity` を追加し、
   静的 SVG / SPA 両 surface で `anchorId(viewPrefix, id)` 経由の cross-surface parity を
   保つ（[TPL-20260630-01](../test-perspectives/TPL-20260630-01-deep-link-anchor-cross-surface-parity.md)）。

6. **診断 `entity-anchor-collision`（warning）。** `entity` token の
   アドレス可能集合 **{全 domain id} ∪ {全 entity id}（model-wide）** 内の id 衝突を
   warning で検出する（静的 SVG の DOM id 重複による `:target` の静かな破綻を予防）。
   モデルの意味論は壊れず deep-link のアドレス可能性のみ劣化するため error にしない。
   同一親スコープの重複は既存 `duplicate-node-id-parent`（error）の検査集合に entity を
   加えてカバーする（[TPL-20260623-02](../test-perspectives/TPL-20260623-02-validation-target-set-enumerates-all-kinds.md)）。

7. **`translate --from db` が entity + 関連スキャフォールドを吐く。** aggregate
   granularity（既定）で、物理 `database` ブロックの後に **暫定の per-database
   `domain`** を追記する:
   - 集約ルート = entity 粒度。entity id は `PascalCase(tableName)` で **SQL テーブル
     由来を保つ**（単数化・概念名付けはしない。ADR-644 案 D と同じ
     トレーサビリティ原則）。`table <DbName>.<TableId>` 物理対応を同時に吐く。
   - 集約をまたぐ FK リンク（畳んだ子の FK は root に畳み上げ、target で dedup）から
     関連 edge を生成する。全列 FK ジャンクションは entity 化し、各親への関連 2 本を持つ。
   - **Soft FK 由来（`REFERENCES` 宣言なし）の関連にのみシステム自動付与タグ
     `[inferred]`** を付ける。Explicit FK が 1 本でも寄与すれば無タグ（確定）。
     確認後はタグ 1 個を消すと確定 edge になる
     （[TPL-20260714-02](../test-perspectives/TPL-20260714-02-inferred-tag-only-soft-fk.md)）。
   - `[inferred]` の既定スタイルは **色のみ**（muted grey）。線種は `[sync]` / `[async]` に
     委ね、派生タグを semantic 区別と直交させる
     （[TPL-20260510-07](../test-perspectives/TPL-20260510-07-derivation-tag-semantics.md)）。

## 理由

- **既存 4 機構の再適用で全条件を満たす。** 所有（domain → チーム）・スコープ
  （drill-down）・論理/物理分離（entity ↔ table 対応）・畳み上げ（entity 関連 →
  domain エッジ）が、いずれも既存機構の再適用で成立する。新語彙の表面積増加は
  spec の役割/種別 対応表の明文化で吸収する。
- **warn-don't-error でオンボーディングと整合。** 未解決 bare id・table 対応のない
  entity・anchor 衝突をエラーにせず、「分かったところまで書いてコミット」を許す。
- **後方互換。** `resource` の物理 dot 記法は非推奨にしない。唯一の挙動変化は
  「未解決だった bare id が同名 entity 宣言で解決されるようになる」で、これは意図的な
  昇格（spec に明記）。translate の `--granularity table` 出力は不変。
- **生成 → 手整理のワークフローを永続化。** translate が entity + 関連 + 物理対応の
  スキャフォールドを吐き、人間がドメイン割当・意味ラベル・ジャンクションの
  昇格/維持を整理する。捨てていた FK 情報の再利用で、キュレーションが `.krs` に残る。
- **FK-less システムを一級に扱う。** 参照の保持は FK 制約の宣言有無ではなく論理的
  事実。前向き設計時（スキーマ未存在）も AR の列名規約運用も同じ形で書ける。

## 却下した案

### 案A: 既存 `resource` の拡張（resource 間エッジを許可）

`resource` は「usecase の操作対象」という usecase スコープの語彙で、外部 API・
ファイルも含む。同じエンティティが usecase ごとに複数回出現し、「ドメインが所有する
エンティティ」という所有を表せない。

### 案B: 物理側（`database` 配下の `table` 間関連）

物理面にはドメインスコープがない（1 つの DB が複数ドメインに仕えうる）。集約畳み込みで
畳んだ粒度を再展開してしまう。ニーズはドメインモデル層（論理面）にある。

### 案D: モデルに持たせず translate の出力フィルタで解く

語彙追加ゼロだが、「translate で生成 → 手で整理」の成果物の永続先が `.krs` に
なく、キュレーションが使い捨てになる。

### `[inferred]` を破線で区別する

当初の散文は「破線等で区別」としていたが、`border-style: dashed` は `[async]`
（`-->` = dashed）と衝突し、推論由来の async 関連が二重に dashed で区別不能になる
（[TPL-20260510-07](../test-perspectives/TPL-20260510-07-derivation-tag-semantics.md)）。
既定スタイルは **色のみ**にして線種次元を空けておく。

### entity id を単数化する（`orders` → `Order`）

概念名として自然だが、単数化は heuristic で不安定（不規則名・`data` / `series`）、
かつ「どの SQL テーブル由来か」のトレーサビリティを失う（ADR-644 案 D と
同じ却下理由）。`PascalCase(tableName)` を保ち、概念名付けは人間のキュレーションに残す。

## v2 に残した範囲

- ペア形式多重度タグ（`[n:1]` / `[n:m]`）
- bare ジャンクション entity のビュー畳み表示オプション
- モデル横断の単一 ER ビュー（意図的に採らない）
