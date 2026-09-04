# ストアスコープの ER ビュー（`database` キャンバスの table 間関連）

- **日付**: 2026-09-04
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2585](https://github.com/kompiro/karasu/issues/2585)
  - 関連 ADR:
    - [ADR-1870](../adr/1870-domain-entity-modeling.md)（ドメインエンティティと関連 v1。本 doc は却下案 B の線を引き直す）
    - [ADR-644](../adr/644-translate-db-aggregate-grouping.md)（`translate --from db` の集約畳み込み・FK 2 段階）
    - [ADR-316](../adr/316-database-as-first-class-node.md)（`database` first-class ノード）
    - [ADR-1911](../adr/1911-cross-domain-ghost-entities.md)（エンティティビューの cross-domain ghost）
    - [ADR-1995](../adr/1995-draft-confidence-annotation.md)（`@draft` = 断定であって確認済みではない）
    - [ADR-1820](../adr/1820-notation-promotion-gate.md)（notation promotion gate）
    - [ADR-2172](../adr/2172-builtin-vocabulary-expansion.md)（builtin 語彙追加の 3 問）
  - 関連 TPL:
    - [TPL-1944](../test-perspectives/TPL-1944-inferred-tag-only-soft-fk.md)（`[inferred]` は soft FK のときだけ）
    - [TPL-510](../test-perspectives/TPL-510-derivation-tag-semantics.md)（派生タグは kind 次元と直交させる）
    - [TPL-1223](../test-perspectives/TPL-1223-scoped-glance-drill-down.md)（一度に見せる範囲の上限）
    - [TPL-1882](../test-perspectives/TPL-1882-entity-carries-no-attributes.md)（entity は属性を持たない）
    - [TPL-2200](../test-perspectives/TPL-2200-render-claim-names-its-view-level.md)（描画の主張はビュー水準を名指す）
    - [TPL-2075](../test-perspectives/TPL-2075-parsed-construct-renders-or-warns.md)（parse した構文は描くか警告する）
    - [TPL-2585](../test-perspectives/TPL-2585-partial-mapping-view-states-its-denominator.md)（本 PR で起こす proactive TPL）
  - コード: `packages/core/src/parser/parser.ts`、`packages/core/src/view/view-extract.ts`、`packages/core/src/view/coverage-extract.ts`、`packages/core/src/translate/db.ts`

## 背景・課題

`database` ブロックのドリルダウンキャンバスは、いま `table` leaf を**関連ゼロで**並べる。
大きなストアではノードの壁になる。Dify を逆生成した実測では `database DifyDB` が
**leaf 137 個・エッジ 0 本**で、グルーピング軸として使えるのは scoped `boundary` だけだった
（`owns` は infra leaf を `invalid-owns` で弾き、`entity … table` から導かれるドメイン所有は
ストア自身のドリルダウンビューを枠づけない）。

提案は「`database` ブロックに、**独立した 2 つのソース**を束ねたストアスコープの ER ビューを与える」こと。

- **ソース A: 宣言された外部キー。** スキーマがそう言っている。
- **ソース B: `entity` 関連の table 対応を通した投影。** モデルがそう主張している。

どちらも新しい著述構文を必要としない。これはドメイン単位のエンティティビュー（ADR-1870 決定 4）を
置き換えるものではなく、**ストア 1 個まるごとのキャンバス**という別の面を足す。ストレージ層での
ドメイン横断の接触が見えるのはこの面である。

### 2 つのソースが必要な理由（可用性が逆相関する）

primary と fallback の関係ではない。どちらがビューを担うかはプロジェクトによって変わり、
両端でプロファイルがほぼ反転する。

- **小さい／制約の効いたスキーマは FK を宣言している。** そこでは FK 抽出は密で決定的、
  逆生成すら要らない。`translate --from db` をスキーマダンプに当てた直後の、**`entity` 層が
  1 個も無いモデル**でも ER ビューが出る。entity 投影しかしない設計はこの利用者に何も返さない。
- **大きいスキーマはたいてい宣言していない。** Dify 実測:

  | Dify (`langgenius/dify`) | |
  |---|---|
  | テーブル数 | 137 |
  | ORM モデル中の `ForeignKey` 宣言 | **6** |
  | 211 本の Alembic migration 中の `ForeignKeyConstraint` | **6** |
  | 逆生成で回収された entity 関連 | **201** |
  | `entity … table` 対応を持つテーブル | 135 / 137 |

  FK だけの ER は約 6 本で、しかも偏っている（3 本が `workflow_comments` の自己/返信連鎖、
  2 本が `conversations`、1 本が `apps`）。UUID 主キー + アプリ層整合性はマルチテナントや
  シャード前提のスキーマで一般的な形なので、Dify が特殊なわけではない。

- **両方あるとき、FK 側が高確度。** FK は DB が強制する。entity 関連はモデルを書いた者
  （逆生成ならコードを読んだ LLM）の断定であり、まさに `@draft` が存在する理由の側にある。
- **内容としても相補的。** FK は方向と存在を無料でくれる（参照保持側が source。karasu の
  エッジ方向規約そのもの）が、ラベルを持たない。entity 関連は人が読める意味ラベル
  （`"belongs to"`）を持つが強制力がない。**同じテーブル対を両ソースが出したら 1 本に畳み、
  FK-backed と印を付け、ラベルは entity 関連から取る。**

### 過去決定との衝突（着手前確認）

`docs/adr/` を「entity」「table」「ER」「FK」で走査した結果、**却下済みの決定に 1 件当たる**。

[ADR-1870](../adr/1870-domain-entity-modeling.md) 「却下した案」:

> ### 案B: 物理側（`database` 配下の `table` 間関連）
> 物理面にはドメインスコープがない（1 つの DB が複数ドメインに仕えうる）。集約畳み込みで
> 畳んだ粒度を再展開してしまう。ニーズはドメインモデル層（論理面）にある。

同 ADR は「モデル横断の単一 ER ビュー」も v2 節で**意図的に採らない**と書いている。

**本 doc の立場**: 案B が答えていたのは「**エンティティ関連をどこに著述するか**」という問いで、
その答え（論理面の `entity`）は覆さない。本 doc が問うのは「**ストア 1 個のキャンバスに
物理的事実を描くか**」であり、別の問いである。ADR-1870 自身が DB スキーマ非目標に対して
やったのと同じ形で、**線を引き直す**。

3 つの却下理由への応答:

| ADR-1870 案B の却下理由 | 本設計での応答 |
| --- | --- |
| 物理面にドメインスコープがない | それがこのビューの狙い。ドメイン境界を跨ぐストレージ層の接触は、ドメインスコープの面には原理的に出ない |
| 集約畳み込みで畳んだ粒度を再展開する | 再展開しない。畳んだ子の FK は root に畳み上げ、target で dedup する（ADR-644 / ADR-1870 決定 7 が entity 関連に対して既にやっている処理と同一） |
| ニーズはドメインモデル層にある | entity 層があるモデルではその通りで、本ビューはそこを置き換えない。**entity 層が無いモデル**（`translate --from db` 直後・手書きスキーマ）には論理面が存在しないので、そこは論理面では解けない |

`docs/concepts.md` の非目標も同じ操作で refine する。現状の文:

> **Physical schema** — columns, types, indexes, foreign-key constraint definitions — is out of scope.

「FK 制約**定義**」（列・型・cascade・制約名）は対象外のまま。「どのテーブルがどのテーブルを
参照するか」は ADR-1870 の共通フィルタ（存在・関係・所有、かつ緩やかに変化する）を通る。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| `table` leaf のエッジ | **既に書ける**。`parseLeafNodeContents`（`packages/core/src/parser/parser.ts`）は leaf でも `label` / `description` / `link` / `facets` / **edge** を受理する |
| `database` のドリルダウン | **既に描かれる**。汎用の drill-down extract を通るので leaf 間エッジはそのまま出る。実測: `table orders { orders -> customers }` を render すると `krs-system-<DbId>` ビューに `data-edge-from="orders" data-edge-to="customers"` が出る |
| `translate --from db` | FK は集約畳み込み（ADR-644）と entity 関連生成（ADR-1870 決定 7）に使うが、**table 間エッジとしては吐かない**（`packages/core/src/translate/db.ts`） |
| FK 由来かどうかの印 | **entity 層には既にある**。`[inferred]` = soft FK 由来、無タグ = 明示 FK 由来（TPL-1944）。table 層には無い |
| entity → table 対応 | `entity X { table DbId.leafId }`。1 entity につき物理対応は 1 つ |
| 物理カバレッジ | `extractCoverage`（`packages/core/src/view/coverage-extract.ts`）が `InfraCoverage.unmappedButReferenced` / `unreferenced` / `tablelessEntities` を持つ |
| 派生エッジの先例 | `deriveImplicitServiceEdges`（domain エッジ → service エッジの畳み**上げ**）。`[implicit]` は render 時付与で `.krs` には現れない |

**ここから読める重要な事実**: Issue の受け入れ条件 1「`database` のドリルダウンが table→table
エッジを描く」の**描画側は既に存在する**。足りないのは (a) FK からエッジを作る側と
(b) entity 関連の投影である。

## 制約・前提

- **線種は区別軸に使えない。** `[async]` が dashed を所有しており、ADR-1870 は
  「`[inferred]` を破線で区別する」案を同じ理由で却下済み（TPL-510）。Issue 本文の
  「solid vs dashed」案はそのままでは通らない。**区別は色（線種以外の軸）**に載せる。
- **render 時に DDL は無い。** ソース A は `.krs` に記録するしかない。
- **entity の物理対応は 1 つ。** DB 行でもありオブジェクトストアの実体でもある entity は
  片方しか写せない。投影は本質的に lossy（TPL-2585）。
- **table 対応を持たない entity の関連は写らない。** Dify 実測で、あるサービスは 19 entity
  すべてが設計上 tableless、Plugin は 13 中 9、Billing は 11 中 10 が tableless（記録が外部
  デーモンや SaaS にある）。これは正しい挙動だが、**このビューは完全な ER 図ではない**。
- **視覚密度の上限。** 137 ノード + 201 エッジは TPL-1223 が言う「一目で把握できる解像度」を
  超えうる。ビューが毛玉になるなら ADR-1870 が「全部一度に吐く ER」を却下した理由の再生産になる。
- **多態 FK は両ソースとも表現不能。** 1 列・複数ターゲット・兄弟の `type` 列で判別する形
  （`workflows.app_id` が app か pipeline か snippet、`credential_permissions.credential_id` が
  4 テーブル）。Dify 逆生成で最も多く報告された記法ギャップ（19 ドメイン中 9）。
- **out of scope**: 列・型・index・cascade・制約名。ADR-1870 の「属性なし」線
  （TPL-1882）は動かさない。

## 検討した選択肢

### 案1: FK は `.krs` に記録し、entity 投影は render 時に導出する（union）

- ソース A: `translate --from db` が `database` ブロック内に `table -> table` を吐く。
- ソース B: renderer が `entity` 関連を `table` 対応越しに投影する。`.krs` は変わらない。
- 印: **無タグ = 宣言 FK 由来**、`[inferred]` = soft FK 由来（既存意味の table 層への拡張）、
  投影由来 = render 時付与の system-assigned tag。

**メリット**

- 両ソースが単独で有用。entity 層ゼロのモデルでも A から ER が出る。FK ゼロのスキーマでも B から出る。
- 新しい**著述**構文がゼロ。A は既存の leaf edge 構文、B は `.krs` に現れない。
- 情報の置き場所が発生源と一致する。FK は render 時に再取得できない事実なので記録し、
  entity 投影はモデル内にある事実なので導出する（記録すると二重管理になり drift する。TPL-1032）。
- provenance の半分が既存機構の再利用。`[inferred]` の意味をそのまま持ち上げられる。

**デメリット**

- ADR-1870 案B の線を引き直す必要がある（背景節で応答済み）。
- `.krs` が「何も再検査しない主張」を運ぶ。FK 記録は emit 時点のスキーマのスナップショット。
- system-assigned tag が 1 つ増える。

### 案2: 投影のみ（render 時導出だけ、`.krs` は不変）

**メリット**

- ADR-1870 案B の却下線に一切触れない。記録ゼロ。

**デメリット**

- entity 層の無いモデルには**何も出ない**。Issue の受け入れ条件「どちらのソース単独でも有用」を落とす。
- 小さい・FK が密なスキーマ（このビューが最も効くはずの側）がまるごと対象外になる。

### 案3: 両ソースとも `.krs` に記録する（translate が table エッジも entity 関連も吐く）

**メリット**

- 描画側は既存のまま。実装が最小。

**デメリット**

- 手書きモデル・逆生成モデル（`translate` を通らない）で B が効かない。
- entity 関連と table エッジが同じ事実の 2 表現になり、entity を直しても table 面が古いまま残る（TPL-1032）。

### 案4: 却下する（ADR-1870 の線を維持）

**メリット**

- 語彙・機構の増加ゼロ。

**デメリット**

- entity 層の無いモデルのストアキャンバスは 137 ノード 0 エッジのまま。
- ADR-1870 案B の却下理由「ニーズは論理面にある」は、論理面が存在しないモデルには適用できない。

## 比較

| 観点 | 案1（記録 + 導出） | 案2（導出のみ） | 案3（記録のみ） | 案4（却下） |
| --- | --- | --- | --- | --- |
| entity 層なしモデルで有用 | ○ | × | ○ | × |
| FK なしスキーマで有用 | ○ | ○ | △（translate 経由のみ） | × |
| 新しい著述構文 | なし | なし | なし | なし |
| drift 耐性 | ○（各事実の置き場が 1 つ） | ○ | ×（二重管理） | — |
| ADR-1870 案B との衝突 | 引き直しが要る | なし | 引き直しが要る | なし |
| 実装量 | 大 | 中 | 小 | ゼロ |

## 現時点の方針

**案1 を採用する。** 各事実をその発生源に置くのが決め手である。FK は render 時に再取得
できないので記録し、entity 投影はモデル内にある事実なので導出する。この分割は
「どちらのソース単独でも有用」という受け入れ条件を満たす唯一の形でもある。

### 決めること 5 点

**1. 方向規約は両ソースで一致する。** FK の方向（参照保持側 → 参照される側）は
ADR-1870 決定 2 の entity 関連の方向規約と**同じ規則**である。よって union は
**順序付きペア** `(from, to)` をキーにできる。

**2. 印は 3 状態。**

| 状態 | 印 | 出どころ |
| --- | --- | --- |
| 宣言 FK 由来 | 無タグ | `translate --from db` が `.krs` に記録 |
| soft FK 由来（列名規約） | `[inferred]` | 同上。既存 TPL-1944 の意味をそのまま table 層へ拡張 |
| entity 関連からの投影 | `[projected]` | renderer が付与。`.krs` には現れない |

`[projected]` は `[implicit]` と同じ register（render 時付与の system-assigned tag）。
`[implicit]` が domain → service の畳み**上げ**なのに対し、`[projected]` は entity → table の
畳み**下げ**である。著述可能な builtin タグではないので ADR-2172 の 3 問の対象外だが、
TPL-1503（受理した語彙は効果を持つ）に従い既定スタイルを与える。

**3. 既定スタイルは色のみ。** 線種は `[sync]` / `[async]` が所有する（TPL-510）。
`[projected]` は `[inferred]` と同系の muted 色を取り、`[sync]` / `[async]` の線種を保存する。

**4. union 規則。**

- 同じ順序付きペアを両ソースが出したら **1 本**。FK 側を採り（`[projected]` を付けない）、
  **ラベルは entity 関連から取る**（FK 側にラベルが無いときのみ。`.krs` に書かれたラベルが勝つ）。
- **逆向きで衝突**したら（FK が `A -> B`、entity が `B -> A`）FK 側だけを描く。
  スキーマの側に寄せる。ラベルは**移さない**（`"belongs to"` は方向依存なので、逆向きに
  貼ると嘘になる）。この不一致はスライス C の差分レポートが報告する。
- 集約畳み込み（`--granularity aggregate`）では、畳んだ子の FK を root に畳み上げ、
  target で dedup し、**自己エッジは落とす**（ADR-644 / ADR-1870 決定 7 と同一処理）。

**5. 投影のスコープはストア 1 個。** 両端の entity が**同じ** `database` ブロックへ
table 対応を持つ関連だけが投影される。ストアを跨ぐ entity 関連はどちらのキャンバスにも
出ない（システムビューの service → database エッジとして既に見える）。

### スライス（実装ステップ）

| スライス | 前提 | 独立に出荷できる理由 |
| --- | --- | --- |
| **A** entity 関連の table 面への投影 + `[projected]` + 描き分け | — | `.krs` を一切変えないので、既存モデル（Dify 逆生成の 201 関連・135/137 対応済みテーブル）に即座に効く。全エッジが `[projected]` になるだけで、FK-backed を騙る主張はどこにも出ない |
| **B** `translate --from db` が FK を table エッジとして吐く + union 規則 | A | A で描き分けの器（3 状態のうち 2 つ）ができているので、B は無タグ / `[inferred]` を足して union を効かせるだけ。B 単独でも A 無しで動くが、union は A の投影集合が要る |
| **C** 宣言 FK と投影 entity 関連の差分レポート | A, B | 両集合が揃って初めて差が取れる。レポートは `coverage` の既存の形（`InfraCoverage`）に乗るので、ビューを触らない |

> 各スライスで何ができるようになるか / その時点でまだできないことは
> 親 Issue [#2585](https://github.com/kompiro/karasu/issues/2585) の `## Slice status` を参照。

### 実装の指針

**スライス A（投影）**

1. `packages/core/src/view/view-extract.ts` に投影関数を足す。`extractEntityView` が使う
   `buildDomainEntityIndex` を再利用して entity → `table <DbId>.<leafId>` 対応の索引を作り、
   両端が同じ `database` に着地する関連を `(leafId, leafId)` エッジに写す。
2. 投影エッジに `[projected]` を付与する。`edge.kind`（sync / async）は保存する（TPL-510）。
3. `packages/core/src/builtins/default-style.ts` に `[projected]` の既定スタイル（色のみ）を足す。
4. `database` のドリルダウン extract が投影エッジを childEdges に足すよう配線する。
   leaf 間の著述エッジは既に描かれるので、投影分を union するだけ。
5. spec 更新: `docs/spec/syntax.md` の infra 節に本ビューを追記し、`docs/spec/tags-annotations.md`
   の system-assigned tag 表に `[projected]` を足す。**lossy であること（tableless entity の
   関連は写らない、完全な ER 図ではない）を同じ場所に書く**。
6. `docs/concepts.md` / `docs/concepts.ja.md` の DB スキーマ非目標を refine する
   （FK 制約定義は対象外のまま、テーブル間参照は構造的事実）。

**スライス B（FK 記録 + union）**

1. `packages/core/src/translate/db.ts` の `emitFlatTable` / `emitAggregateTable` を拡張し、
   `database` ブロック内に `table -> table` を吐く。既存の `ForeignKey` 抽出と
   `augmentWithSoftForeignKeys` をそのまま使う。soft FK 由来には `[inferred]` を付ける。
2. 集約時は畳んだ子の FK を root に畳み上げ、target で dedup、自己エッジを落とす。
3. union 規則を投影側に実装する（同方向 → 1 本 + ラベル移送、逆向き → FK 側だけ）。
4. `edge-endpoint-scope`（ADR-2075）が `database` を跨ぐ table エッジをどう扱うか確認し、
   跨ぐ場合の診断を決める。

**スライス C（差分レポート）**

1. `packages/core/src/view/coverage-extract.ts` の `InfraCoverage` に 2 フィールドを足す:
   - `fkWithoutEntityRelation`: スキーマが明示している関連を論理モデルが持っていない。
     機械的に修復可能な指摘。
   - `entityRelationWithoutFk`: アプリ層整合性。事実として報告し、欠陥としない
     （`tablelessEntities` の既存コメントと同じ立場）。
   - 逆向き不一致も 3 つ目として報告する。
2. CLI から読めるようにする（`coverage` の既存出力に乗せる）。

**受け入れテスト**

`docs/acceptance/store-scoped-er-view.md` を新規作成する。TC は:

- FK 宣言のみ・`entity` 層ゼロの `.krs` で、`database` キャンバスに ER が出る
- `entity` 関連のみ・FK ゼロの `.krs` で、`database` キャンバスに ER が出る
- 両ソースが同じ順序付きペアを出したとき 1 本になり、FK-backed の見え方でラベルが entity 由来
- 逆向き衝突で FK 側だけが描かれ、ラベルが移らない
- 投影エッジと FK エッジが**線種ではなく色**で区別され、`[async]` の破線が保存される
- tableless entity 間の関連がキャンバスに出ない（lossy であることの明示的な確認）
- 集約畳み込み時に子の FK が root に畳み上がり、自己エッジが出ない

### 影響範囲・マイグレーション

- **既存ユーザーへの影響**: `.krs` の書き方は変わらない。既存モデルはスライス A の時点で
  ストアキャンバスにエッジが**増える**（これまで 0 本だった面に投影が出る）。既存の
  著述済み leaf 間エッジの描画は変わらない。
- **ドキュメント更新**: `docs/spec/syntax.md`（infra 節）、`docs/spec/tags-annotations.md`
  （system-assigned tag 表）、`docs/concepts.md` / `docs/concepts.ja.md`（DB スキーマ非目標の refine）。
- **テスト・examples への影響**: `translate --from db` の出力が変わるのでスライス B で
  `packages/core/src/translate/db.test.ts` の期待値が動く。`examples/` は entity 層を持つものが
  スライス A でストアキャンバスにエッジを得る。
- **notation promotion gate**: `[projected]` は system-assigned tag（著述面ではない）なので
  v1.0 freeze 面を触らない。ADR-1820 の gate は著述 notation を対象とするため発火しない。

## 未解決の問い / 決めないこと

- **視覚密度の上限をどう置くか。** 137 ノード + 201 エッジのキャンバスが TPL-1223 の
  「一目で把握できる解像度」を保てるかは未検証。スライス A の実装時に Dify の `.krs` で
  実測し、必要なら畳み込み（`boundary` 単位の集約エッジなど）を別 Issue に切る。
  **本 doc ではエッジ集約を決めない。**
- **多態 FK は表現しない。** 1 列・複数ターゲット・兄弟の判別列という形は両ソースとも
  表現できず、派生ビューは entity 層が選んだ形（1 本描いて選択肢を失うか、複数描いて
  過剰主張するか）をそのまま引き継ぐ。記法の追加は本 doc の範囲外。
- **`.krs` に記録した FK を誰も再検査しない。** emit 時点のスキーマのスナップショットであり、
  スキーマが変わっても `.krs` は黙って古くなる。スライス C の差分レポートは論理モデル側の
  欠落を見るもので、DDL との照合ではない。DDL 再照合は将来の別問題。
- **`queue` / `storage` への一般化。** 本 doc は `database` / `table` に限る。`queue-item` /
  `bucket` の間に同種の関連があるかは未評価。
