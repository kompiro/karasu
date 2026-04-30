# Resource CRUD operations within a usecase

- **日付**: 2026-04-30
- **ステータス**: 検討中
- **関連**:
  - Issue: [#1046](https://github.com/kompiro/karasu/issues/1046)
  - 既存 ADR:
    - [20260417-01-translate-openapi-resource-grouping.md](../adr/20260417-01-translate-openapi-resource-grouping.md)（OpenAPI の CRUD を 1 usecase に集約）
    - [20260419-01-translate-db-aggregate-grouping.md](../adr/20260419-01-translate-db-aggregate-grouping.md)（DB 側の集約）
  - 関連 Issue: [#643](https://github.com/kompiro/karasu/issues/643)（usecase 爆発を回避する逆方向の決定。本設計はその反対面）
  - 仕様: [docs/spec/syntax.md](../spec/syntax.md) §`Writing logical diagrams` › `service block`

## 背景・課題

現状、`usecase` 内に書く `resource` は「どのリソースに触るか」までしか表せない:

```krs
usecase PlaceOrder {
  resource OrderTable { label "Order table" }
  resource InventoryAPI [external] { label "Inventory API" }
}
```

これだけでは「`PlaceOrder` が `OrderTable` を **書く** のか、**読むだけ** なのか」が読み取れない。CRUD の区別は以下の場面で実用上の意味を持つ:

- **CRUD マトリクスビュー**（usecase × resource）: ドメイン分析の定番アーティファクト。
- **結合度シグナル**: 同じリソースを 2 つの usecase が *書く* のは、両方が *読む* のより強い結合シグナル。
- **translate アダプタの情報損失**: `translate openapi` / `translate db` は CRUD 相当の分類を内部で持っているが、`.krs` 出力時に捨てている（ADR-20260417-01 / 20260419-01）。
- **描画の差**: 書き込みエッジと読み取り専用エッジは視覚的に区別する価値がある。

Issue #643（クローズ済）は「6 個の REST メソッドを 1 つの usecase にまとめる」逆方向の決定だった。本設計はその決定を **覆さず**、まとめた 1 つの `manage X` usecase の中に「どの CRUD verbs をカバーするか」を記録するための語彙を追加する。

## スコープ

### 本設計の対象

- `.krs` の構文拡張（`resource` 内に CRUD operations を書ける）
- `packages/core` のパーサ・バリデータ・AST 拡張
- 認識済み operation 名のテーブル（CRUD 4 種）と未認識 operation の診断

### Out of scope（後続 Issue で扱う）

- CRUD マトリクスビューの描画
- translate アダプタからの自動付与
- 認可モデリング（Issue #832 と重複するため切り離す）
- `:operation(write)` 等のスタイルセレクタ（必要性は v1 出荷後に判断）

## 制約・前提

- 省略時は **今と同じ挙動**（警告を出さず opaque な依存）。`.krs` の "未決定の許容" ポリシー（spec §Property requirement and omission rules）を踏襲する。
- 既存の `[external]` のような **役割タグ** とは独立して共存可能（external API でも read/write の区別はある）。
- 後方互換: 既存の `.krs` ファイルは無修正で動き続ける。

## 設計案

Issue で提示された 2 案に第三案を加えて評価する。

### Form A — flag-style tags

タグ語彙を流用する。

```krs
usecase PlaceOrder {
  resource OrderTable [create, read]
  resource InventoryAPI [external, read]
}
```

### Form B — `operations` property

プロパティブロック内に専用キーワードを置く。

```krs
usecase PlaceOrder {
  resource OrderTable {
    label "Order table"
    operations create, read
  }
  resource InventoryAPI [external] {
    operations read
  }
}
```

### Form C — header shorthand + property（ハイブリッド）

ボディなしの 1 行表現と、ボディ付きで `operations` プロパティを書く形を両方許す。

```krs
resource OrderTable :: create, read              // shorthand
resource InventoryAPI [external] :: read         // shorthand with role tag
resource OrderTable {
  label "Order table"
  operations create, read                         // verbose
}
```

`::` のような専用区切り記号（あるいは `=`）を新設する必要があり、字句解析器に手が入る。

## 評価軸と比較

| 軸 | Form A（tags） | Form B（property） | Form C（shorthand+property） |
|----|----------------|--------------------|------------------------------|
| パーサ実装コスト | 最小（`parseTags()` 流用） | 小（プロパティ 1 種追加） | 中（区切り記号と字句追加） |
| タグ名前空間の汚染 | **大** — `[create]/[read]/[update]/[delete]` をユーザータグから取り上げる | なし | なし |
| 既存タグ役割との混在 | `[external, read]` のように **役割と動作が同列に並ぶ** ため、読み手が分類できない | 役割は header、動作は body の `operations` で物理的に分離 | shorthand では Form A と同様の混在 |
| 診断の明確さ | `[read]` が CRUD なのか「ユーザー定義タグ `read`」なのか実装側で判別が難しい。warning を出すか silent か運用が割れる | 認識外 verb は `unknown-resource-operation` で常に確定的にエラー化できる | 案 B と同等 |
| スタイルセレクタとの干渉 | `.read` セレクタが任意の `[read]` 付きノードに当たり、CRUD 以外の `[read]` でも色が付く可能性 | 干渉なし。将来 `:operation(write)` 等の擬似クラスを別途定義可能 | 干渉なし（プロパティ側に置けば） |
| 既存類似機能との一貫性 | `[external]` は単一の役割タグで前例あり | `handles Order, Catalog` / `delivers WebApp, AdminUI` / `client` の `capability <name>` と同じ「プロパティ + カンマ区切り or 行追加」パターン | 新パターンを導入する |
| `.krs` の読みやすさ（短い場合） | 1 行で済むので簡潔 | 1 行プロパティが増える | shorthand 利用時は Form A と同等 |
| `.krs` の読みやすさ（長い場合） | `[external, create, read, update, delete]` がノイジー | 改行で並べられる | 状況により |
| 翻訳パイプライン互換 | translate adapter から両形式とも出力可 | 同上 | 同上 |
| OSS 化時の英訳・拡張性 | タグ拡張は controlled vocabulary を後付けする難しさあり | controlled vocabulary は spec の表として既に「client form-factor tags」「client storage kinds」で前例あり | 同上 |

## 決定（提案）

**Form B（`operations` プロパティ）を採用する。**

```krs
usecase PlaceOrder {
  resource OrderTable {
    label "Order table"
    operations create, read
  }
  resource InventoryAPI [external] {
    operations read
  }
}
```

### 構文ルール

- 場所: `usecase` 直下の `resource` ブロック内のプロパティとしてのみ許可。`database`/`queue`/`storage` 配下の物理リソース宣言には書けない。
- 値: 識別子のカンマ区切り、または複数行の `operations` 行で並列宣言可（`handles` と同じ受理形）:

  ```krs
  resource OrderTable {
    operations create, read
    operations update           // 追記もできる
  }
  ```

- 認識済み verbs（v1）: `create` / `read` / `update` / `delete`。重複は警告（`duplicate-resource-operation`）。
- 認識外 verbs: warning（`unknown-resource-operation`）。パースは継続し AST には保持して、translate からの非 CRUD 動詞（`list` / `search` / `execute`）を将来取り込む余地を残す。
- 省略時の意味: 現状と同じ。「未決定／不問」を表し警告は出さない。

### 拡張テーブル（spec に記載）

`docs/spec/syntax.md` に以下のセクションを追加する。「client form-factor tags (recognized)」と同じスタイル:

| Operation | 意味 |
|-----------|------|
| `create` | リソース上に新しい項目を生成する書き込み |
| `read` | リソースの内容を参照する非破壊操作 |
| `update` | 既存項目を変更する書き込み |
| `delete` | 項目を消去する書き込み |

将来追加候補（v2 以降、Issue で個別に議論）: `list` / `search` / `execute` / `subscribe`。

## 理由

- **タグ名前空間を温存できる**。`[read]`/`[write]` は今後ユーザー定義タグやスタイルセレクタとして自然に欲しくなる名前で、CRUD verb で先取りすると後悔する。
- **役割と動作が物理的に分離**される。`[external]` は「リソースの種類（外部 API かどうか）」、`operations` は「この usecase がどう触るか」で、文法上のレイヤが別なのが望ましい。
- **既存パターンの踏襲**で学習コストが低い。`handles` / `delivers` / `capability` がいずれも「プロパティ + カンマ区切り or 複数行宣言」を採っており、新しいパターンを導入しなくて済む。
- **診断が確定的に書ける**。Form A だと「`[read]` を未認識タグ警告にすべきか CRUD verb として受理すべきか」が文脈依存になり、翻訳ツールやスタイルファイルとの相互作用で運用ルールが揺れる。

## 却下した案

### Form A — flag-style tags

タグ名前空間の汚染と、役割タグ（`[external]`）と動作タグの混在による可読性低下が最大の懸念。`[create, read]` は短く書けるが、その便益は v1 の段階では小さい（CRUD は通常 1〜2 verb）。スタイルセレクタとの干渉も将来の拡張余地を狭める。

### Form C — shorthand `::` 区切り + property

字句解析器に新しい区切り記号を導入するコストに対し、得られる短縮の便益が小さい。`handles` / `delivers` が shorthand を持たない一貫性も崩したくない。1 行で済ませたければ Form B の `operations create, read` でも十分短い。

### `[external]` を CRUD 表現に再利用する

`[external]` は所在（外部システムかどうか）を表すリソース役割で、操作種別ではない。混ぜると意味の階層が壊れる。

### 認可モデルと統合する（Issue #832 と束ねる）

CRUD 表現は「何をしているか」、認可は「誰が許されているか」で別レイヤ。先に CRUD だけを入れ、認可は別 Issue で独立議論する方が両方の設計余地を確保できる。

## 実装方針（参考、別 PR で具体化）

1. **Lexer/Parser**: `operations` をコンテキスト依存キーワードとして追加（`resource` block の property のみ）。`parseBlockContentsWithProperties` の resource 経路で受理し、`ResourceNode.properties.operations: string[]` を新設（`ServiceNode.properties.handles` と同じ階層）。
2. **Validator**: 認識外 verb は `unknown-resource-operation` warning、重複は `duplicate-resource-operation` warning。CRUD set はテーブル定数として `packages/core/src/spec/operations.ts` に分離（`recognizedClientFormFactorTags` と同じ場所感）。
3. **Spec**: `docs/spec/syntax.md` に節追加、`syntax.ja.md` も追従（ADR ルール上、日本語は英語版に追従して書ける）。
4. **Acceptance test**: `docs/acceptance/` に新規 AT を追加し、(a) 受理ケース、(b) 省略ケース（警告なし）、(c) 認識外 verb の診断、(d) `[external]` との共存、をカバー。
5. **Example**: 以下 2 ファイルを同 PR で更新する。
   - `examples/ec-platform/index.krs` の `PlaceOrder` 等に `operations` を追記し、実用シナリオでの使い方を見せる。
   - `examples/feature-samples/resource-operations.krs` を新規追加し、AT 用の最小サンプル（受理形・省略形・`[external]` 併用形を網羅）を置く（`legend.krs` と同じ運用）。
6. **renderer は無変更**。CRUD マトリクス表示・差別化スタイルは v2 で個別 Issue 化。

## アクセプタンステスト候補（人間確認が必要なもののみ）

- `examples/ec-platform/index.krs` を編集後、`karasu serve` で開いて `PlaceOrder` の `NodeDetailPanel` 上で operations が読めること（現状の Property block 表示で十分かは UI を見て判断）。

> 自動テスト範囲（パーサ受理／拒否、warning 文言、AT-XXXX のフォーマット整合）は Vitest + AT スキーマで保証する。手動確認はパネル表示の見た目のみ。

## 補足: 設計レビューで確定した事項

設計レビュー時に以下を確定した（実装 PR の前提として固定）。

- **operations の AST 配置**: `ResourceNode.properties.operations: string[]` に置く（`ServiceNode.properties.handles` / `properties.delivers` と同じ階層）。`tags` / `annotations` のトップレベル昇格は採らない。`tags` は任意語彙の分類・選択用で、`operations` は controlled vocabulary（CRUD 4 種）として意味階層が違うこと、また既存の種別固有プロパティ（`handles` / `delivers` / `team`）が一律 `properties` 配下である慣例に揃えることが理由。
- **`syntax.ja.md` の追従**: 実装 PR と同 PR で `syntax.ja.md` も更新する。spec/syntax は ja/en で乖離させない運用。
- **examples の改変範囲**: `examples/ec-platform/index.krs` の追記と、`examples/feature-samples/resource-operations.krs` の新規追加を **両方** 同 PR で行う。前者は実用シナリオ、後者は AT 用最小サンプル（`legend.krs` と同じ運用）。
