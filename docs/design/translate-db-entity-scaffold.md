# translate --from db が entity + 関連スキャフォールドを吐く（詳細設計）

- **日付**: 2026-07-14
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1909](https://github.com/kompiro/karasu/issues/1909)（親 [#1870](https://github.com/kompiro/karasu/issues/1870) の PR3 スライス）
  - 親 Design Doc: [`domain-entity-modeling.md`](./domain-entity-modeling.md)（`translate --from db の拡張` 節が本設計の上位方針）
  - 関連 ADR: [ADR-20260419-01](../adr/20260419-01-translate-db-aggregate-grouping.md)（集約畳み込み・FK 2 段階・ジャンクション検出・ID トレーサビリティ）、[ADR-20260405-05](../adr/20260405-05-database-as-first-class-node.md)（database first-class ノード）
  - 関連 TPL: 本文「Related TPLs」節を参照
  - コード: `packages/core/src/translate/db.ts`, `packages/core/src/builtins/default-style.ts`, `docs/spec/tags-annotations.md`

## 背景・課題

`translate --from db` は現在、SQL スキーマを **物理側の `database` ブロック**
（集約ルート = `table`、畳んだ子は `description` に列挙）へ変換する
（ADR-20260419-01）。これはボトムアップの物理棚卸しには十分だが、
オンボーディング読者が本当に欲しい **概念エンティティとその関連**
（誰が何を持ち、どう繋がるか）は出力されない。#1870 で `entity`（domain 子・
属性なし・物理 `table` 対応つき）が導入されたので、translate はその概念層まで
一気にスキャフォールドできる。

現在 translate は集約畳み込みの判定に FK リンク（Explicit / Soft）を使い、
判定後に **捨てている**。この情報を entity 間の関連 edge として再利用すれば、
物理棚卸しと同時に概念モデルの下書きを出せる。

本 Design Doc は #1870 の PR3 として、この生成ロジックの詳細（entity の ID
命名・関連の畳み上げとタグ付け・provisional domain の形・`[inferred]` タグの
既定スタイル）を決める。上位の「なぜ entity を入れるか」は親 Design Doc に
委ねる。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| `db.ts` の出力 | `database <DbName> { table ... }`。`aggregate`（既定）は集約ルートのみ `table` 化し畳んだ子を `description` に残す。`table` granularity は全テーブルを平坦に吐く |
| FK 情報 | `parseTables` → `augmentWithSoftForeignKeys` → `inferAggregates` で `parentOf`（child→root）と各テーブルの `foreignKeys`（`kind: explicit | soft`）を保持。関連生成には未使用 |
| ジャンクション | 全 PK 列が FK のテーブルは畳まない（root として残る）。ADR-20260419-01 |
| `entity` 構文 | domain 子。`table <InfraId>.<subId>` 物理対応（dot 形のみ）。関連は保持側 entity ブロック内に `->` / `-->` で 1 本（edge origin scope 準拠）。intra-domain は bare id、cross-domain は `DomainId.EntityId`。`docs/spec/syntax.md` § entity declaration |
| top-level domain | `domain` はファイル top-level 宣言が正式に許可されている（`docs/spec/syntax.md` § Top-level domain declaration）。service ネストは必須ではない |
| 自動タグ | `[implicit]`/`[read]`/`[write]` 等は resolver が描画時に合成し **ソースには現れない**。`docs/spec/tags-annotations.md` § Automatic tags on edges |
| CLI 露出 | 決定: **flag なし**（`aggregate` 既定で常時 entity を吐く。#1909 で確認済み）。`emitBindings` は opt-in のまま |

## 制約・前提

- **新 edge 構文ゼロ**（親 Design Doc の v1 staging）。関連は既存 `->` / `-->` のみ。
  カーディナリティタグ（`[n:1]` 等）は v2。
- **トレーサビリティを壊さない**（ADR-20260419-01 案 D の却下理由）。
  生成物から「どの SQL テーブル由来か」を追えること。ID・ラベルを勝手な
  集約名にリネームしない。
- **後方互換**: `--granularity table` の出力は不変（entity を吐かない）。
  `aggregate` の `database` ブロック部分も既存のまま。entity は **追記**。
- **`[inferred]` は描画で意味を持つこと**（TPL-20260610-01）。doc にタグを
  載せる以上、既定スタイルで視認できる効果を与える。
- **派生自動タグは semantic 区別と直交させる**（TPL-20260510-07）。`[inferred]`
  の既定スタイルが `[sync]`/`[async]` の線種を打ち消してはならない。
- スコープ外（本 PR）: app `TranslateDialog` UI、entity view の renderer 詳細、
  `Closes #1870`（本 PR は `Refs`）。

## 検討した選択肢

論点ごとに案を比較する。

### 論点 A: entity の ID 命名

- **案 A1: `PascalCase(tableName)`（例 `orders` → `Orders`）** — 決定的・
  テーブルとの対応が自明。entity ID `Orders` と table ID `OrdersTable` は
  非衝突。
- **案 A2: 単数化して `Order`** — 親 Design Doc の例（`entity Order`）に近く
  概念名として自然。だが単数化は heuristic で不安定（`data`/`series`/
  不規則名）、かつ ADR-20260419-01 案 D が「集約名へのリネーム」を
  トレーサビリティ喪失で却下済み。

→ **案 A1 採用**。ADR-20260419-01 のトレーサビリティ原則をそのまま
entity にも適用する。単数化・概念名付けは人間のキュレーション作業に残す
（TODO コメントで促す）。

### 論点 B: provisional domain の形

- **案 B1: top-level `domain <DbName>`** — spec 公認の top-level domain。
  database と同名だが anchor namespace が別（`entity-anchor-collision` は
  {domain}∪{entity} のみ、database は含まない）ので合法。由来が一目で分かる。
- **案 B2: stub `service` でラップ** — `service <DbName>Service { domain ... }`。
  ネストが深くなり、service を勝手に発明することになる。

→ **案 B1 採用**（#1909 で確認）。`domain <DbName>` を top-level に吐き、
先頭に provisional である旨の TODO コメントを置く。

### 論点 C: 関連 edge の生成と `[inferred]` 判定

集約をまたぐ FK から関連を導出する。畳んだ子の FK は root entity に畳み上げる。

- 各 root entity `R` について、`R` 自身と畳まれた子テーブルの FK を集める。
- FK の参照先テーブルを **その集約ルート** に解決する（`parentOf` 経由）。
- 参照先ルート `R'` が `R` 自身なら **内部**（集約内 child→root リンク等）
  としてスキップ。
- `R'` ごとに 1 本へ dedup。`R -> R'` を保持側 entity `R` のブロック内に吐く
  （edge origin scope 準拠、intra-domain なので bare id）。
- **`[inferred]` 判定**: その target への寄与 FK が **すべて soft**（Explicit FK
  宣言がスキーマに無い）なら `[inferred]`。1 本でも Explicit があれば
  無タグ（= 確定関連）。「確定 / 推論」の semantic を保存する。
- ラベルは付けない（関連の意味ラベルは人間のキュレーション作業）。
- ジャンクション（全 FK・非畳み込み）は root として entity 化され、2 本の FK が
  そのまま 2 本の関連（`UserRoles -> Users`, `UserRoles -> Roles`）になる。

### 論点 D: `[inferred]` タグの既定スタイル

親 Design Doc の散文は「破線等で区別」と書いていたが、**TPL-20260510-07** に
照らすと `border-style: dashed` は `[async]`（`-->` = dashed）と衝突し、
推論由来の async 関連が「二重に dashed」で区別不能になる。

- **案 D1: muted color のみ（`edge[inferred] { color: #94A3B8 }`）** — 線種は
  `[sync]`/`[async]` に委ね、色だけで「暫定・要確認」を示す。派生タグと
  semantic タグが直交する（TPL-20260510-07 の対処パターン）。
- **案 D2: dashed** — 親 Design Doc の散文どおりだが上記の衝突を起こす。

→ **案 D1 採用**（#1909 で確認）。親 Design Doc の「破線等」表現は本詳細設計で
上書きし、理由（TPL-20260510-07）を記録する。

## 比較

| 論点 | 採用案 | 主な根拠 |
| --- | --- | --- |
| A entity ID | `PascalCase(tableName)` | ADR-20260419-01 トレーサビリティ |
| B domain 形 | top-level `domain <DbName>` + TODO | spec 公認・由来が自明 |
| C 関連/タグ | FK 畳み上げ・target dedup・soft-only→`[inferred]` | 捨てていた FK 再利用・確定/推論を保存 |
| D 既定スタイル | muted color のみ | TPL-20260510-07（線種と直交） |

## 現時点の方針

上記 A1 / B1 / C / D1 を採用する。`aggregate` granularity で `database` ブロックの
後に provisional `domain` ブロックを追記し、entity（`table` 物理対応つき）と
集約をまたぐ関連（soft-only は `[inferred]`）を吐く。`--granularity table` は不変。

出力例（`OrderDB`）:

```krs
database OrderDB {
  table OrdersTable {
    label "orders"
    description """
      Tables:
      - orders (root)
      - order_items — name suffix + inferred FK column to orders
      """
  }
  table CustomersTable { label "customers" }
  table ProductsTable { label "products" }
}

domain OrderDB {
  // TODO: provisional per-database domain from `translate --from db`.
  // Rename/split this domain, move entities to their real domains, and
  // give relations semantic labels. Delete `[inferred]` once confirmed.
  entity Orders {
    table OrderDB.OrdersTable
    Orders -> Customers                 // explicit FK: orders.customer_id REFERENCES customers
    Orders -> Products [inferred]       // soft FK: order_items.product_id (no REFERENCES)
  }
  entity Customers { table OrderDB.CustomersTable }
  entity Products { table OrderDB.ProductsTable }
}
```

### 実装の指針

1. **`packages/core/src/translate/db.ts`**: `aggregate` 経路で `rootTables` +
   `parentOf` + 各テーブルの `foreignKeys` から entity モデルを組む。
   - entity ID = `toPascalCase(t.name)`、`table <DbName>.<toTableId(t.name)>` を吐く。
   - 関連: root ごとに自身 + 畳んだ子の FK を集め、参照先を集約ルートへ解決、
     内部（self）をスキップ、target で dedup、soft-only なら `[inferred]`。
   - top-level `domain <DbName> { ... }` に TODO コメント + entity 群を吐く。
   - 出力順: `database` → `domain`(entity) → （`emitBindings` 時のみ）bindings。
2. **`packages/core/src/builtins/default-style.ts`**: `edge[inferred]` を
   muted color（`#94A3B8`）で追加。線種は指定しない（`[sync]`/`[async]` に委譲）。
3. **`docs/spec/tags-annotations.md`**: `[inferred]` を追記。`[implicit]` 等の
   描画時合成タグと異なり、**`translate --from db` がソースに書き込み、確認後は
   タグ 1 個を消すと確定 edge になる** 性質を明記。`> Related TPLs:` back-ref を張る。
4. **proactive TPL**（spec 改訂ルール・同 PR で起こす）:
   「`translate --from db` は soft-FK 由来の関連にのみ `[inferred]` を付け、
   Explicit FK 由来には付けない（確定 / 推論の区別を保存）。かつ doc に載せた
   `[inferred]` は既定スタイルで視認できる効果を持つ」を新規 TPL 化し、
   `[inferred]` 節末尾と相互リンク。`discovered_from.root_cause_file` に `db.ts`。
5. AT: `docs/acceptance/0053-translate-openapi-db.md` に追記。TC は:
   - `aggregate` で entity + 関連が生成され、soft-FK 由来に `[inferred]` が付く
   - Explicit FK 由来の関連は無タグ（確定）
   - 全列 FK ジャンクションが entity として生成され 2 本の関連を持つ
   - 生成した provisional domain ブロックがパースし、warning なく resolve する
     （roundtrip: entity `table` 対応が database の sub-id に解決する）
   - `--granularity table` は entity を吐かない（後方互換）
6. **changeset**: `@karasu-tools/core` + `karasu` を `minor`（新 translate 出力 +
   新 render タグ）。
7. ADR 昇格: 本スライスは #1870 の final PR で親 Design Doc とまとめて ADR 化・
   削除する（親 Issue の staging に従う）。本 Design Doc 単体では昇格しない。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: `aggregate`（既定）出力に `domain` ブロックが **追記**
  される。`database` ブロック自体は不変。`--granularity table` は完全不変。
- ドキュメント更新: `docs/spec/tags-annotations.md`（`[inferred]`）、AT-0053。
  親 Design Doc の「破線等」表現は本詳細設計 D で上書き（ADR 昇格時に反映）。
- テスト・examples への影響: `db.test.ts` / `translate.e2e.test.ts` に追加。
  既存 AT-0053-04/11/13 等の `database` ブロック期待値は不変。examples は変更なし。

## Related TPLs

- [TPL-20260510-07](../test-perspectives/TPL-20260510-07-derivation-tag-semantics.md)
  — 派生・集約で自動付与するタグは semantic 区別を保存し、線種など既存の
  次元と直交させる。論点 D（`[inferred]` を color のみにする）の直接根拠。
- [TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md)
  — 受理する語彙は描画に効果を持つ。doc に載せる `[inferred]` は既定スタイルで
  視認できること。
- [TPL-20260711-01](../test-perspectives/TPL-20260711-01-entity-carries-no-attributes.md)
  — entity は属性を持たない。生成する entity も name / relations / `table` 対応
  のみ（列・型を吐かない）。
- [TPL-20260510-20](../test-perspectives/TPL-20260510-20-id-not-label-for-identity.md)
  — identity は ID であってラベルではない。entity ID は table 名由来で決定的に
  与える（論点 A）。
- **proactive TPL（本 PR で新規）**: 「soft-FK 由来のみ `[inferred]`、Explicit は
  無タグ」ガード（実装指針 4）。

## 未解決の問い / 決めないこと

- **関連のラベル自動生成**: FK 列名（stem）から意味ラベルを推定することは
  意図的にしない。false な意味付けより空ラベルの方が安全で、人間のキュレーション
  対象として残す。
- **cross-domain（`DomainId.EntityId`）関連の生成**: translate は 1 database =
  1 provisional domain を吐くので、生成される関連はすべて intra-domain（bare id）。
  ドメイン分割後に cross-domain になるのは人間のキュレーション後。translate 側で
  ghost を意識する必要はない。
- **app `TranslateDialog` への露出**: flag が無い（常時 entity）ので UI 追加は
  不要。app 側の対応は #1870 の別スライスに委ねる。
