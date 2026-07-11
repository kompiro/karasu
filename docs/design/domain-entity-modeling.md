# ドメインエンティティと関連のモデリング — 非目標「DB スキーマ」の線引き直し

- **日付**: 2026-07-11
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: なし（オンボーディング実体験からの壁打ち起点）
  - PR: [#1868](https://github.com/kompiro/karasu/pull/1868)
  - 関連 ADR: [ADR-20260419-01](../adr/20260419-01-translate-db-aggregate-grouping.md)（集約畳み込み・FK リンク 2 段階・ジャンクション検出）、[ADR-20260405-05](../adr/20260405-05-database-as-first-class-node.md)（database first-class ノード）
  - 関連ドキュメント: [`docs/concepts.ja.md`](../concepts.ja.md) 非目標節「データベーススキーマのモデリングはしない」、[`docs/guide/02-onboarding.ja.md`](../guide/02-onboarding.ja.md)
  - 関連 TPL: 本文末尾の「Related TPLs」節を参照

## 背景・課題

システム開発ではドメインごとに担当チームが定義されており、チームに新しく入る
メンバーはそのドメインのキャッチアップをしたい。オンボーディングで特に効くのは
**そのドメインが扱うエンティティとその関連**の把握である — ER を理解しておくと
コードリーディングが捗るため。

しかし既存ツールの ER 図生成は**スキーマ全体を一度に吐き出す**ため、
キャッチアップには役立てづらい。「一目で把握できる情報量に絞る」という
karasu の中核原則（drill-down・ghost 表示・ビュー単位の情報量制御）は、
まさにこの問題を解く装置である。

一方、現在の非目標（`docs/concepts.ja.md`）は
「テーブル、カラム、インデックス、外部キー、ER レベルの関係は対象外」と、
物理スキーマ（カラム・型・インデックス・FK 制約定義）と
概念レベルのエンティティ・関連を**区別せず一括で**弾いている。

本 Design Doc は、この非目標を**覆すのではなく線を引き直す**:

- 非目標の共通フィルタ「karasu が扱うのは **ゆっくり変化する構造的な文脈** —
  何が存在し、どう関係し、誰が所有するか」に、ドメインエンティティは合格する
  （Order というエンティティが**存在**し、Customer と**関係**し、
  注文ドメイン＝注文チームが**所有**する）
- フィルタが本当に弾いているのはカラム・型・インデックス（実装詳細）と
  スキーマ設計という方向（モデル → DDL、詳細化方向）である
- 非目標には既に非対称性の但し書きがある: `translate --from db` で既存スキーマを
  取り込んで**抽象化する**のは目標内。本設計はその抽象化の到達点に
  「エンティティと関連」という語彙を与えるものであり、情報の流れる方向
  （抽象化方向 = up）は変わらない

> **過去決定との衝突**: 本設計は `docs/concepts.ja.md` 非目標節
> 「データベーススキーマのモデリングはしない」の適用範囲を狭める。
> 採用時は同節を改訂し（改訂方針は「影響範囲」節）、ADR 昇格時に
> 経緯を記録する。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| 非目標 | 「テーブル、カラム、インデックス、外部キー、ER レベルの関係は対象外」。translate --from db（抽象化方向）は目標内という但し書きあり |
| `resource`（usecase 配下） | usecase の操作対象。infra dot 記法参照（`resource OrderDB.orders`）または bare id（未解決警告・孤立ノード描画）。`operations` で CRUD 宣言 |
| infra `database` / `table` | 物理面の共有データストア。usecase の dot 記法参照から `service → database` エッジを導出し read/write タグを合成 |
| `translate --from db`（ADR-20260419-01） | 集約ルート単位の畳み込み。FK リンクは 2 段階（Explicit FK / 列名規約による Soft FK）。全列 FK のジャンクションは畳まない。畳み込み理由を description に明記 |
| domain エッジ | domain ブロック内に宣言。cross-service は system ビューで `[implicit]` タグ付きサービス間エッジに畳み上げ。明示エッジが同方向にあれば派生しない（二重計上排除の前例） |
| edge 構文 | `->`（同期）/ `-->`（非同期）、ラベル、タグ `[...]`、任意 id `#<id>`。プロパティブロックは持たない |
| ビュー体系 | system / service / domain の drill-down。ビュー内の視覚密度を一定に保つ原則（TPL-20260510-21） |

## 制約・前提

- **抽象度フィルタの維持**: エンティティは名前・関連・所有・物理対応参照のみを持ち、
  **属性（カラム・型）を持たない**。これが滑り坂ガードであり、
  「型だけ」「主キーだけ」という隣接する誘惑にも一貫した答えを与える
- **スキーマ設計方向は引き続き非目標**: entity から DDL を生成しない
  （モデルからコードを生成しない、の一貫）
- **warn-don't-error**: 途中状態（未解決 bare id、table 対応のない entity）を
  エラーにしない。オンボーディングの「分かったところまで書いてコミット」と整合
- **後方互換**: `resource` の物理 dot 記法は非推奨にしない。entity 未導入モデルと
  ボトムアップ読み下しの正当な中間状態として残す
- **FK 制約を張らないシステムを扱う**: 意図的に FK 宣言をしない運用
  （オンライン DDL・シャーディング等）は現代でも普通にある。translate は
  ADR-20260419-01 の Soft FK 推論（列名規約 `<stem>_id`）を関連導出にも再利用する。
  AR（ActiveRecord）では `belongs_to` が DB 制約なしで列名規約から動くため、
  AR 文化圏では Soft FK 推論は fallback ではなく AR 自身と同じ推論である。
  MyISAM 等レガシーエンジン固有の対応はスコープ外
- **想定ユーザー文化**: AR の考え方が広まっており、物理テーブルを AR で扱い
  それをドメインモデルとするコードベースが多い。エンティティ粒度は
  集約ルート（畳み込み後）がドメインモデル層の粒度と一致する

## 検討した選択肢

### 案A: 既存 `resource` の拡張（resource 間エッジを許可）

**メリット**: 新語彙なし。`[table]` shape・`operations` を流用できる。

**デメリット**: `resource` は「usecase の操作対象」という usecase スコープの
語彙で、外部 API・ファイルも含む。同じエンティティが usecase ごとに複数回
出現し、「ドメインが所有するエンティティ」という所有を表せない。

### 案B: 物理側（`database` 配下の `table` 間関連）

**メリット**: table ノードは既存。FK = table 間関連は自然。

**デメリット**: 物理面にはドメインスコープがない（1 つの DB が複数ドメインに
仕えうる）。集約畳み込みで畳んだ粒度を再展開してしまう。ニーズは
ドメインモデル層（論理面）にある。

### 案C: 新語彙 `entity`（`domain` の子）【採用】

論理面に `entity` ノードを追加し、domain が所有する。詳細は「現時点の方針」。

**メリット**: 所有（domain → チーム）・スコープ（drill-down）・
論理/物理分離（entity ↔ table 対応）・畳み上げ（entity 関連 → domain エッジ）の
すべてが既存機構の再適用で成立する。

**デメリット**: 新語彙による表面積増加。`resource` / infra `table` との
対応関係を spec に明文化する義務が生じる。

### 案D: モデルに持たせず translate の出力フィルタで解く

**メリット**: 語彙追加ゼロ。

**デメリット**: 「translate で生成 → 手で整理」というワークフローの
「整理した成果物」の永続先が `.krs` にない。キュレーションが使い捨てになる。

## 比較

| 観点 | 案A: resource 拡張 | 案B: 物理側 | 案C: entity 新設 | 案D: translate のみ |
| --- | --- | --- | --- | --- |
| 所有（domain/チーム）の表現 | ✗ | ✗ | ✓ | ✗ |
| ドメインスコープの情報量制御 | △ | ✗ | ✓ | △（毎回生成） |
| 手キュレーションの永続先 | △ | △ | ✓ | ✗ |
| 論理/物理分離との整合 | ✗（混在） | ✗（物理のみ） | ✓ | — |
| 語彙の表面積 | 増えないが意味が濁る | 増えない | 増える | 増えない |

## 現時点の方針

**案C を採用する** — オンボーディングのニーズ（ドメイン単位のエンティティ把握）は
所有・スコープ・分離・畳み上げのすべてに触れるため、既存の 4 機構が再適用できる
案C だけが全条件を満たす。

### 語彙と構文

`entity` は `domain` の子。保持するのは **名前・関連（エッジ）・物理対応
（infra dot 記法参照）・label / description** のみ。属性は持たない。

```krs
service OrderService {
  domain Ordering {
    entity Order {
      table OrderDB.orders            // 物理対応（任意）
      Order -> Customer "発注者"       // 関連（Customer は他ドメイン所有でも可）
      Order -> Product "品目"
    }
  }
}
```

entity の id は他ノードと同じフラットな id 空間に置く（`Billing -> Contract` が
bare id で越境するのと同じ流儀）。dot 記法は infra 専用のまま保ち、
「domain 修飾の entity パス」のような新記法は導入しない。

### `resource` の参照解決拡張 — 正準形は論理参照

usecase の思考順序は「Order という entity を操作する、だから orders テーブルに
触る」（AR の `belongs_to` / モデル経由アクセス）であり、また前向き設計時は
物理スキーマがまだ存在しないため、**正準形は論理参照**とする。

| 書き方 | 解決先 | 面 | 位置づけ |
| --- | --- | --- | --- |
| `resource OrderDB.orders`（dot 記法） | infra サブリソース | 物理 | 現状どおり。ボトムアップの中間状態・entity 未導入モデルの正当な形 |
| `resource Order`（bare id が entity に解決） | `entity` ノード | 論理 | **新規・正準形**。`operations` もそのまま付く |
| `resource Order`（bare id が未解決） | なし（警告） | — | 現状どおり。ボトムアップの出発点 |

- **role と kind の分離**: `resource` は「usecase から見た操作対象という**役割**」、
  `entity` / infra `table` / 外部 API は「**種別**」。`[table]` は描画 shape。
  この 4 層の対応表を spec に明文化する（infra `table` キーワード ↔ `[table]` タグの
  対応を明文化した前例に倣う）
- **編集ゼロの昇格**: bare `resource Order`（未解決警告）は、後日
  `entity Order { table OrderDB.orders }` を宣言した時点で usecase 側無編集で
  論理参照に解決される。現状の「dot 記法への書き換え」より昇格コストが下がる
- **推移的導出**: `usecase → entity → table → database` を辿って既存の
  `service → database` エッジ導出と read/write タグ合成を行う。物理直参照と
  entity 経由参照が同じ table に到達する混在モデルでは**二重計上しない**
  （domain エッジ畳み上げの「明示エッジがあれば暗黙エッジを派生しない」規則と
  同じクラスの排除規則）

### 関連エッジの意味論 — 関連 1 つ = edge 1 本、方向 = 参照保持側 → 参照される側

既存の service / domain 間エッジは**依存**（有向な事実、双方向依存 = 2 本）だが、
entity 間の関連は**関連（association）**であり意味論が異なる。依存の慣習
（双方向 2 本書き）を持ち込むと、(1) 同一事実の鏡像 2 本の整合性負担、
(2) domain への畳み上げが「相互依存」に化けて結合度シグナルが汚染される、
という問題が起きるため採らない。

- **方向規約**: `Order -> Customer` = Order 側が参照を保持する
  （AR: `Order belongs_to :customer`、物理: `orders.customer_id`）。
  逆方向ナビゲーション（`has_many`）は同じ edge 1 本から読み取れるため書かない。
  真の相互参照（互いに FK を持つ稀なケース）のみ正当に 2 本になる
- **論理的事実としての参照**: edge が主張するのは「参照の保持」であり、
  FK 制約の宣言有無ではない。前向き設計時（スキーマ未存在）も
  FK-less システムも同じ形で書ける
- **多重度**: 両端の多重度はペア形式タグ 1 個（`[n:1]` = 起点 n : 終点 1）で
  1 本の edge に載る。**v1 はラベルのみ**とし、ペア形式タグは v2
  （translate が FK から確定できるのは N 側がどちらか程度で、正確な多重度は
  手整理の負担になるため。既存タグ構文 `[...]` があるので拡張余地は塞がれない）

**多対多と中間テーブル** — 参照（FK）の在り処で場合分けすると `->` の方向規約に
例外は生まれない。判定線は ADR-20260419-01 の既存ヒューリスティクスと一致する:

| ケース | 物理 | 論理面の表現 |
| --- | --- | --- |
| FK が集約内部（畳み込まれた子テーブル）にある | `order_items.product_id` | `Order -> Product` 直接 edge。参照保持者は Order 集約なので方向規約維持（v2 では `[n:m]` タグ可） |
| FK が独立ジャンクション（全列 FK、畳まれない）にある | `orders_products` | ジャンクション自身を **entity** にし、`OrdersProducts -> Order` + `OrdersProducts -> Product` の 2 本（各 n:1）。追加カラムを持つ中間テーブル（`has_many :through` のモデル）も同様に entity |

「起点が参照を持てないケース」とは、まさにジャンクションをノード化すべきケース
そのものである。ジャンクション entity の所有 domain から畳み上げの依存方向も
正しく決まる（ジャンクションが Ordering 所有なら Ordering → Products）。

bare ジャンクション entity（関連 2 本のみ）を 1 本の edge 風に描く**表示の畳み**は
将来のビュー層オプションとする — モデルは事実を保持し、情報量の制御はビューの
責務、という既存の分担（TPL-20260510-21）に従う。これにより edge プロパティ
ブロック等の新構文は当面不要。

### ビュー — domain 配下のエンティティビュー

domain drill-down の既存ビュー（usecase が並ぶ）に entity を混載すると視覚密度の
原則（TPL-20260510-21）に抵触するため、**domain 配下に「エンティティビュー」を
別ビューとして追加**し、ユースケースビューと切り替える。

- ドメイン外エンティティへの関連は **ghost 表示**（domain-to-domain の既存パターン）。
  ドメイン境界＝チーム境界がビュー上で見える
- モデル横断の単一 ER ビューは**採らない** — 「既存 ER ツールは全部一度に吐くから
  役立てづらい」という本 Design Doc の原点の再生産になるため
- entity 関連は上位ビューで domain 間エッジに畳み上げる（cross-service domain
  エッジ → `[implicit]` サービス間エッジの既存機構と同型）。境界設計の
  結合度シグナルとしても機能する
- ビュー体系への追加は renderer・app のナビゲーション・CLI `render` の
  出力対象に波及する。permalink contract への拡張は次節で本 Design Doc 時点で
  確定する

### permalink contract の拡張 — view token `entity` の追加

`docs/spec/permalink.md` の anchor 文法 `#krs-<view>-<id>[:<highlight>]` に
view token **`entity`** を追加する（現行: `system` · `deploy` · `org` · `matrix`）。

```
#krs-entity-<id>[:<highlight>]
```

- **`<id>` = domain の id**: そのドメインのエンティティビューを開く
- **`<id>` = entity の id**: 所有 domain のエンティティビューを開き、当該 entity に
  フォーカスする。leaf id から drill path を node-path index で復元する既存機構
  （`SharePayload.target.node` の解決）をそのまま使う
- `:<highlight>` は既存どおり SPA のみ
- identity は author-given `id`（`label` 不可）・`sanitizeId` 通過・rename で
  anchor が壊れる caveat — すべて既存規約のまま
- `ShareTargetView`（`@karasu-tools/core`）に `entity` を追加する。
  `SharePayload` の形は変えない（`target.node` が entity id を取れるようになるだけ）
- 静的 SVG では domain ごとのエンティティビューを 1 level として描画し、
  `#krs-entity-<domainId>` の CSS `:target` で表示する。entity id の anchor は
  `:has()` で所属 level の表示に解決する（highlight channel がない既存制約と
  同じ degrade）。両 surface とも `anchorId(viewPrefix, id)` を経由し、
  cross-surface parity（TPL-20260630-01）を保つ

### `translate --from db` の拡張

- 集約畳み込み後の**集約ルート = entity 粒度**でスキャフォールドを生成する
  （AR 文化圏でも出力はドメインモデル層の粒度になる）
- entity スキャフォールドは **database 単位の暫定 domain** にまとめて吐く
  （例: `domain OrderDB { entity Order ... }` + 暫定である旨の TODO コメント）。
  テーブル → ドメインの対応は自動導出できないが、構文的に正しい状態で生成され、
  手整理は「domain の改名・分割・entity の移動」という編集になる
- 集約をまたぐ FK リンク（Explicit / Soft）から関連 edge を生成する。
  現在は畳み込み判定に使って捨てている情報の再利用
- entity には `table` 物理対応を同時に吐く。「同じテーブルが 2 つの語彙に
  非連結に現れる」生成物を作らない
- Soft FK 由来の関連 edge には**システム自動付与タグ `[inferred]`** を付ける
  （`[implicit]` と同じ「システム自動付与タグ」の流儀・ADR-20260419-01 が
  畳み込み理由を明記するのと同じ透明性原則）。エンティティビューで推論由来
  edge を視覚的に区別（破線等）でき、キュレーションで確認済みならタグ 1 個を
  消すだけで確定 edge になる。`docs/spec/tags-annotations.md` に追加する
- 生成 → 手整理のワークフロー: translate が entity + 関連 + 物理対応の
  スキャフォールドを吐き、人間がドメイン割当・関連の意味ラベル・
  ジャンクションの entity 昇格/維持を整理する

### 実装の指針（staging）

**v1 — 新 edge 構文ゼロで出す**:

1. parser: `entity` ブロック（domain 子）、`table` 物理対応プロパティ、
   entity ブロック内の関連 edge（既存 `->` 構文 + edge origin scope 規則の適用）
2. resolver: bare id → entity 解決、推移的導出（usecase → entity → table）と
   二重計上排除、entity 関連 → domain エッジ畳み上げ、ghost エンティティ
3. renderer + app: domain 配下のエンティティビュー（ユースケースビューと切り替え）
4. translate --from db: entity + 関連 + 物理対応のスキャフォールド生成、
   Soft FK 由来マーキング
5. spec / concepts 更新: 非目標節の改訂、syntax.md への entity 節追加、
   role/kind 対応表、tags-annotations.md への `[inferred]` タグ追加、
   permalink.md への view token `entity` 追加。
   **spec 新設節への proactive TPL 同梱ルールが発動する**
6. AT: `docs/acceptance/` に新規。TC 観点:
   - entity 宣言 → エンティティビューに描画される
   - 他ドメイン entity への関連が ghost 表示される
   - bare `resource Order` が entity 宣言追加で無編集解決される
   - 物理直参照と entity 経由参照の混在で service → database エッジが二重計上されない
   - translate --from db が entity + 関連を生成し、Soft FK 由来に `[inferred]` が付く
   - 全列 FK ジャンクションが entity として生成される
   - `#krs-entity-<id>` anchor が静的 SVG / SPA の両 surface で解決する

**v2 — 需要実証後**:

- ペア形式多重度タグ（`[n:1]` / `[n:m]`）
- bare ジャンクション entity のビュー畳み表示オプション

7. ADR 昇格: 実装完了後、`docs/adr/YYYYMMDD-NN-domain-entity-modeling.md` として
   昇格し、本 Design Doc は同 PR で削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 破壊的変更なし。唯一の挙動変化は「未解決だった bare id が
  同名 entity 宣言の追加で解決されるようになる」で、これは意図的な昇格
  （spec に明記する）
- ドキュメント更新: `docs/concepts.ja.md` / `docs/concepts.md` 非目標節の改訂
  （「物理スキーマ（カラム・型・インデックス・FK 制約定義）は対象外。
  概念レベルのエンティティと関連は domain の子として目標内。entity は属性を
  持たない」への線引き直し）、`docs/spec/syntax.md`、
  `docs/spec/tags-annotations.md`、`docs/guide/02-onboarding.md`
  （エンティティビューを使うキャッチアップ手順の追加）、`docs/spec/permalink.md`
- テスト・examples への影響: `examples/` にエンティティビューのサンプル追加

## Related TPLs

- [TPL-20260510-21](../test-perspectives/TPL-20260510-21-scoped-glance-drill-down.md)
  一度に見せる範囲を限定し、drill-down を first-class に保つ —
  ビュー混載案の却下理由・ビュー層畳み表示の分担根拠
- [TPL-20260510-19](../test-perspectives/TPL-20260510-19-information-flows-up.md)
  新機能の情報の流れは抽象化方向（up）か詳細化方向（down）かを判定する —
  本設計が非目標に抵触しないことの判定枠組みそのもの（translate → entity は up、
  entity → DDL 生成は down なので非目標のまま）
- [TPL-20260510-07](../test-perspectives/TPL-20260510-07-derivation-tag-semantics.md)
  派生・集約で自動付与するタグは元ノードの semantic 区別を保存する —
  entity 関連 → domain エッジ畳み上げ・read/write タグ合成の実装時観点
- [TPL-20260514-05](../test-perspectives/TPL-20260514-05-dangling-edge-preserves-node.md)
  edge / relation の片側が未解決でも解決できた側のノードは drop しない —
  未解決 bare id・他ドメイン entity 参照の実装時観点
- [TPL-20260623-02](../test-perspectives/TPL-20260623-02-validation-target-set-enumerates-all-kinds.md)
  cross-reference 検証の valid-target set は spec が許す全 kind を列挙し、
  重複する集合は同期させる — `resource` の解決先に entity を追加する際、
  検証 target set の全箇所を同期させる観点
- [TPL-20260630-01](../test-perspectives/TPL-20260630-01-deep-link-anchor-cross-surface-parity.md)
  静的 SVG と SPA hash の anchor は 1 つの id ベース文法を維持する —
  view token `entity` 追加時の cross-surface parity 観点
