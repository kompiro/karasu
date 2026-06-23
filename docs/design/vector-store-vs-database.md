# vector store / search index を `database` と別の語彙として扱うか

- **日付**: 2026-06-23
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1718](https://github.com/kompiro/karasu/issues/1718)
  - PR: [#1719](https://github.com/kompiro/karasu/pull/1719)
  - 関連 ADR: [ADR-20260405-05](../adr/20260405-05-database-as-first-class-node.md)（`database` / `queue` / `storage` を system 直下のファーストクラスノードに昇格）
  - 関連 TPL: [TPL-20260519-02](../test-perspectives/TPL-20260519-02-shared-vocabulary-dual-representation.md), [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md), [TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md)
  - コード: `packages/core/src/types/ast.ts`（`INFRA_BLOCK_KINDS`）, `packages/core/src/builtins/reference-data.ts`, `packages/core/src/renderer/shapes.ts`

## 背景・課題

ElasticSearch / OpenSearch や vector store（pgvector, Pinecone, Weaviate, Milvus, Qdrant 等）を karasu で書くとき、現状の論理 infra 語彙は `database` / `queue` / `storage` の 3 種しかないため、これらは `database` に押し込むしかない。RAG / LLM 構成の普及でこれらが頻出するようになり、「正本（system of record）を持つ `database` と、検索用の派生 index である vector store は直感的に別物ではないか」という問いが出た。

本 Design Doc は **vector store / search index を `database` と別の語彙として扱うべきか** のメリット・デメリットを整理する。実装は対象外（語彙設計の探索）。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| 論理 infra kind | `INFRA_BLOCK_KINDS = ["database", "queue", "storage"]` の 3 種のみ（`packages/core/src/types/ast.ts`） |
| leaf サブリソース | `database`→`table`, `queue`→`queue-item`, `storage`→`bucket` |
| shape tag との対応 | infra sub-kind → shape tag を `INFRA_SUB_KIND_TO_TAG` で推論（`table`→`[table]`/cylinder 等）。2 表現の同期は [TPL-20260519-02](../test-perspectives/TPL-20260519-02-shared-vocabulary-dual-representation.md) が担保 |
| 論理/物理の分離 | **論理の `database OrderDB` は物理の `store { type "..." }` が realize する**（`concepts.ja.md` 「realizes による論理と物理の対応付け」）。例: `store "order-db" { type "Aurora PostgreSQL 15"; realizes OrderDB }` |
| 語彙追加の前例 | `database`/`queue`/`storage` の昇格は ADR-20260405-05。当時から **3 種に絞り、具体技術は持たせない**方針 |

### 重要: この問いには 2 つの別レイヤが混ざっている

ユーザの直感「正本 = database / 検索 index = vector store」は、karasu のモデルに照らすと **2 つの異なる区別** を束ねている。

1. **技術（物理）の区別**: 「ElasticSearch」「Pinecone」「pgvector」は *技術の選択* であり、karasu では既に**物理層の `store { type "..." }` で表現する場所がある**。論理層 `database` は技術非依存に保つ設計（`.krs` を安定した source of truth にするため）。
2. **役割（論理）の区別**: 「正本ストア」と「正本から再構築される派生 index」は *アーキテクチャ上の役割* が違う。これは物理技術とは独立した論理の問いで、ここが本当に検討すべき論点。

→ 「ElasticSearch を別扱いするか」は**ほぼ物理層で既に解けている**。残る本質は「**派生 index という論理的役割**を、`database` と別の論理 kind に昇格させる価値があるか」。

## 制約・前提

- karasu の中核原則: **論理層は技術非依存**（論理が技術選定で揺れない＝ source of truth として安定）。`concepts.ja.md` 三面構造。
- **受理される語彙は効果を持たねばならない**（[TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md)）。新 kind を足すなら「ラベルが違うだけ」では不可で、resolver / 描画に実効果が要る。
- **新しい infra kind = 複数表現の同時編集**: parser / validator / resolver / renderer / `reference-data.ts` / `INFRA_SUB_KIND_TO_TAG` / shape tag / spec doc。[TPL-20260519-02](../test-perspectives/TPL-20260519-02-shared-vocabulary-dual-representation.md)・[TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md) の drift リスクを負う。spec 改訂時の proactive TPL 同梱ルール（`docs/process.md`）も発火する。
- スコープ外: 具体的な shape のデザイン、leaf 名の最終決定、実装。

## 検討した選択肢

### 案A: 新 kind を足さない（技術は物理 `store { type }`、役割は構造で表現）

vector store / search index は論理層では `database`（または無宣言の `resource`）のまま。「ElasticSearch である」ことは物理層 `store { type "ElasticSearch 8"; realizes SearchIndex }` で表す。「正本から派生した index」であることは、正本 `database` → index `database` のエッジ（usecase の read/write 参照や、将来的な再構築パイプライン）で構造的に表す。

**メリット**

- 語彙を増やさない＝ parser/resolver/renderer/TPL の面積ゼロ。
- **論理/物理分離の原則に最も忠実**: 技術（ES/pgvector）が論理を汚さない。ES→pgvector の載せ替えで論理モデルが変わらない。
- 境界クリープ（後述）を完全に回避。

**デメリット**

- 「これは正本ではなく派生 index」という役割が **語彙としては可視化されない**（label/description の自由記述頼み）。
- system 図で正本 DB と検索 index が同じ shape で並び、読者が一目で区別できない。
- ユーザの直感（別物に見える）と語彙が一致しない。

### 案B: 新しい論理 infra kind を追加（`index` / `search` / `vector-store` + leaf `index`）

`database`/`queue`/`storage` と並ぶ第 4 の kind を導入し、専用 shape と専用 shape tag を持たせる。`INFRA_SUB_KIND_TO_TAG` に追加。

**メリット**

- 派生 index が **第一級で可視化**される（専用 shape）。RAG 構成の図で「どこが index か」が一目で分かる。
- resolver が「正本 → index」依存（再構築の向き）を語彙として持てる余地。
- ユーザの直感に最も素直。

**デメリット**

- **境界クリープが最大の懸念**: 「DB の一種」は無数にある — cache（Redis）、graph DB、time-series、OLAP/analytics、full-text、blob とも vector とも。`index` を足すと「ではなぜ cache は無い？」が連鎖し、`INFRA_BLOCK_KINDS` が無秩序に膨らむ。ADR-20260405-05 が 3 種に絞った判断と逆行。
- **ストア ≠ 役割の反例**: pgvector や Postgres FTS では **同じ DB が正本かつ index**。kind を分けると「1 ノードを無理に 2 分割」か「二重モデリング」になる。役割は *使い方* であってストアの種別ではない。
- **論理/物理の混同**: 「vector store」はしばしば技術の言い換え。論理 kind に技術ニュアンスを焼き込むと技術非依存原則に反する。
- 実装面積・drift リスク・proactive TPL 同梱が最大。
- TPL-20260610-01 の「効果を持つ」基準を満たすには、shape 以上の resolver 効果（再構築エッジ等）の設計まで要る。

### 案C: `database` に派生役割の修飾を足す（tag / annotation）

kind は `database` のまま、「派生 index」を示す修飾を足す。例: `database [index]` のような tag、または `database SearchIndex { role: index ... }` のようなプロパティ。

**メリット**

- 新 top-level kind を増やさない（境界クリープを抑制）。役割は `database` のサブ区分として表現。
- 描画やツールが区別できる余地を残しつつ、面積は案 B より小さい。
- 「同じ DB が正本かつ index」も、修飾の有無で自然に表現できる。

**デメリット**

- TPL-20260610-01: 修飾も「効果を持つ」必要があり、最低でも描画差分か診断（例: 「index が正本を持たない」warning）の設計が要る。
- tag 名前空間 / プロパティスキーマの拡張点をどう置くか（既存 `[external]` 等との整合）に追加検討。
- 案 A より語彙が増える分、仕様・ドキュメントの保守が増える。

## 比較

| 観点 | 案A 足さない | 案B 新 kind | 案C 修飾 |
| --- | --- | --- | --- |
| 実装面積 | なし | 最大（parser〜renderer〜TPL） | 中 |
| 論理/物理分離の忠実さ | ◎ | △（技術混入リスク） | ○ |
| 役割の可視化 | ×（自由記述のみ） | ◎（専用 shape） | ○（修飾） |
| 境界クリープ耐性 | ◎ | ×（cache/graph/… が連鎖） | ○ |
| 「同一 DB が正本かつ index」 | ○（構造で表現） | ×（分割を強いる） | ◎（修飾の有無） |
| ユーザ直感との一致 | △ | ◎ | ○ |
| TPL-20260610-01「効果を持つ」 | 該当せず | 効果の設計が要る | 効果の設計が要る |

## 現時点の方針

**判断基準を採用する**:

> karasu が論理 infra kind を増やすのは、それが **system 図に描くべき固有の「相互作用の形（interaction shape）」** を表すときに限る（`database`=ランダムアクセスのストア、`queue`=pub/sub、`storage`=blob のように）。**技術の違い**（ElasticSearch か pgvector か）や、**同じストアの役割違い**（正本か派生 index か）は、それぞれ物理層 `store { type }`・構造/修飾で表すのが karasu 流。

この原則に「vector / search index」を当てた結論:

- 「ElasticSearch である」= 技術 → **物理層 `store { type }` で解決済み**（新語彙不要）。
- 「派生 index である」= 役割 → 固有の interaction shape ではなく `database` のサブ区分。

**案 C（`database` への役割修飾）を採用する。** 案 B（新 kind）は境界クリープ（cache / graph / time-series が連鎖）と「同一 DB が正本かつ index（pgvector）」を分割で壊すコストが、専用 shape の価値を上回る。案 A（無語彙）は分離原則に最忠実だが役割が一切可視化されない。C は **新 top-level kind を増やさず**に役割を可視化でき、原則と整合する。

ユーザの直感「正本と検索 index は別物」は **役割の区別としては正しい**。ただし karasu 的には「別の論理 kind」ではなく「**物理技術（`store { type }`）＋ `database` の派生役割修飾**」で表すのが、語彙を 3 kind に絞ったまま直感を満たす道。

### 実装の指針（案 C の具体化 — ADR/実装フェーズで確定）

推奨は、既存の `[external]` タグと同じ機構に乗せた **`[index]`（仮）タグ**を `database` ブロックに付与する形:

```krs
database SearchIndex [index] {
  table Documents
}
store "search" { type "ElasticSearch 8"; realizes SearchIndex }  // 技術は物理層
```

- **「効果」の最低ライン**（[TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md) を満たすため、ラベル差だけにしない）:
  1. **描画差分** — 派生 index を system 図で正本 `database` と区別（badge か shape variant）。`packages/core/src/renderer/shapes.ts`。
  2. **診断（任意・検討）** — 派生 index が正本（feed 元）を持たないときの info 診断。これにより「正本→index」の構造が言語に意味を持つ。
- 修飾の形は **tag（`[index]`）と property（`role: index`）の二択**。tag は `[external]` との一貫性で優位だが、property は値の拡張余地で優位。ここは ADR で確定する。
- spec 改訂（`docs/spec/{syntax,tags-annotations}.md` + `reference-data.ts`）を伴うため、**proactive TPL を同 PR で同梱**（`docs/process.md` 「spec / concepts 改訂時の proactive TPL 同梱」）。drift 対象は [TPL-20260519-02](../test-perspectives/TPL-20260519-02-shared-vocabulary-dual-representation.md) / [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md)。

### ADR 昇格

実装に進む段で、本 Doc を `docs/adr/YYYYMMDD-NN-vector-store-vs-database.md` として昇格し、同 PR で本 Design Doc を削除する（`.claude/rules/adr.md`）。

### 影響範囲・マイグレーション

- 案 A: 影響なし（ドキュメントに「vector store の書き方（物理 `store { type }`）」例を追記する程度）。
- 案 B / C: `docs/spec/{syntax,tags-annotations}.md` + `reference-data.ts` + renderer 改修、spec 改訂に伴う proactive TPL 同梱が必須。既存 examples に vector store の例を追加。

## 未解決の問い / 決めないこと

方向性（判断基準の採用 + 案 C）はレビューで合意済み。残るのは実装/ADR フェーズで詰める設計詳細:

1. **修飾の形**: tag（`[index]`）か property（`role: index`）か。tag は `[external]` との一貫性、property は拡張余地。ADR で確定。
2. **「効果」の範囲**: 描画差分のみか、「派生 index が正本を持たない」info 診断まで踏み込むか。
3. **「正本 → index」の再構築依存**を語彙として明示的に持つか（持つ設計まで踏み込むなら案 B も再評価対象に戻りうる — 本 Doc では C の範囲に留める）。
4. 具体 shape デザイン・修飾の最終名は本 Doc では決めない。
