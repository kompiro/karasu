---
id: ADR-2585
title: ストアスコープの ER ビュー — FK は記録し、entity 関連は投影し、確認済みかどうかで描き分ける
status: accepted
date: 2026-09-08
topic: core-concepts
depends_on:
  - ADR-1870
  - ADR-644
related_to:
  - ADR-316
  - ADR-1911
  - ADR-1995
  - ADR-1820
  - ADR-2172
scope:
  packages:
    - core
    - cli
assumptions:
  - "symbol: packages/core/src/view/view-extract.ts :: projectStoreRelations"
  - "symbol: packages/core/src/view/view-extract.ts :: containerCanvasEdges"
  - "symbol: packages/core/src/view/coverage-extract.ts :: diffStoreRelations"
  - "symbol: packages/core/src/translate/db.ts :: collectRootRelations"
  - "grep: packages/core/src/builtins/default-style.ts :: edge\\[projected\\]"
  - "file: docs/acceptance/store-scoped-er-view.md"
---

# ADR-2585: ストアスコープの ER ビュー — FK は記録し、entity 関連は投影し、確認済みかどうかで描き分ける

- **日付**: 2026-09-08
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2585](https://github.com/kompiro/karasu/issues/2585)。スライス [#2721](https://github.com/kompiro/karasu/issues/2721)（PR [#2724](https://github.com/kompiro/karasu/pull/2724)）／[#2722](https://github.com/kompiro/karasu/issues/2722)（PR [#2725](https://github.com/kompiro/karasu/pull/2725)）／[#2723](https://github.com/kompiro/karasu/issues/2723)（PR [#2727](https://github.com/kompiro/karasu/pull/2727)）。設計 PR は [#2699](https://github.com/kompiro/karasu/pull/2699)
  - [ADR-1870](1870-domain-entity-modeling.md) — ドメインエンティティと関連 v1。本 ADR はその **却下案 B の線を引き直す**（下記「ADR-1870 案B との関係」）
  - [ADR-644](644-translate-db-aggregate-grouping.md) — `translate --from db` の集約畳み込みと FK 2 段階（explicit / soft）。本 ADR の記録側はこの抽出をそのまま再利用する
  - [ADR-316](316-database-as-first-class-node.md)（`database` first-class ノード）、[ADR-1911](1911-cross-domain-ghost-entities.md)（cross-domain ghost）、[ADR-1995](1995-draft-confidence-annotation.md)（`@draft` = 断定であって確認済みではない）、[ADR-1820](1820-notation-promotion-gate.md)（notation promotion gate）、[ADR-2172](2172-builtin-vocabulary-expansion.md)（builtin 語彙追加の 3 問）
  - TPL: [TPL-2585](../test-perspectives/TPL-2585-partial-mapping-view-states-its-denominator.md)（本設計で起こした proactive TPL）、[TPL-1944](../test-perspectives/TPL-1944-inferred-tag-only-soft-fk.md)、[TPL-510](../test-perspectives/TPL-510-derivation-tag-semantics.md)、[TPL-1223](../test-perspectives/TPL-1223-scoped-glance-drill-down.md)、[TPL-1882](../test-perspectives/TPL-1882-entity-carries-no-attributes.md)、[TPL-1936](../test-perspectives/TPL-1936-cross-domain-entity-reference-qualified.md)
  - 仕様: `docs/spec/syntax.md` § Store-scoped ER view、`docs/spec/tags-annotations.md` §『[projected]』、`docs/concepts.md` DB スキーマ非目標
  - コード: `packages/core/src/view/view-extract.ts`、`packages/core/src/view/coverage-extract.ts`、`packages/core/src/translate/db.ts`、`packages/core/src/builtins/default-style.ts`
  - AT: `docs/acceptance/store-scoped-er-view.md`

## 背景

`database` ブロックのドリルダウンキャンバスは `table` leaf を**関連ゼロで**並べていた。大きなストアではノードの壁になる。Dify を逆生成した実測では `database DifyDB` が **leaf 137 個・エッジ 0 本**で、使えるグルーピング軸は scoped `boundary` だけだった（`owns` は infra leaf を `invalid-owns` で弾き、`entity … table` から導かれるドメイン所有はストア自身のビューを枠づけない）。

関連の出どころは 2 つある。**宣言された外部キー**（スキーマがそう言っている）と、**`entity` 関連の `table` 対応を通した投影**（モデルがそう主張している）である。両者の可用性はほぼ逆相関する。

- 小さい／制約の効いたスキーマは FK を宣言しているので、`translate --from db` 直後の **`entity` 層が 1 個も無いモデル**でも ER が出る。投影しかしない設計はこの利用者に何も返さない。
- 大きいスキーマはたいてい宣言していない。Dify 実測: テーブル 137 に対し ORM の `ForeignKey` 宣言 **6**、211 本の Alembic migration 中の `ForeignKeyConstraint` **6**、一方で逆生成が回収した entity 関連 **201**、`entity … table` 対応を持つテーブル 135/137。FK だけの ER は約 6 本で、しかも 3 本が `workflow_comments` の自己/返信連鎖に偏る。UUID 主キー + アプリ層整合性はマルチテナント／シャード前提のスキーマで一般的な形なので、Dify が特殊なわけではない。

内容としても相補的である。FK は方向と存在を無料でくれる（参照保持側が source。karasu のエッジ方向規約そのもの）がラベルを持たない。entity 関連は人が読めるラベルを持つが強制力がない。

### ADR-1870 案B との関係

ADR-1870 は「却下した案」で **案B: 物理側（`database` 配下の `table` 間関連）** を退けている。理由は 3 つ（物理面にドメインスコープがない／集約畳み込みで畳んだ粒度を再展開する／ニーズは論理面にある）で、同 ADR は「モデル横断の単一 ER ビュー」も意図的に採らないと書いた。

**案B が答えていたのは「エンティティ関連をどこに*著述*するか」という問いで、その答え（論理面の `entity`）は覆さない。** 本 ADR が問うのは「ストア 1 個のキャンバスに物理的事実を描くか」であり、別の問いである。ADR-1870 自身が DB スキーマ非目標に対してやったのと同じ操作で線を引き直す。却下理由への応答:

| ADR-1870 案B の却下理由 | 本 ADR の応答 |
| --- | --- |
| 物理面にドメインスコープがない | それがこのビューの狙い。ドメイン境界を跨ぐストレージ層の接触は、ドメインスコープの面には原理的に出ない |
| 集約畳み込みで畳んだ粒度を再展開する | 再展開しない。畳んだ子の FK は root に畳み上げ target で dedup する（ADR-644 / ADR-1870 決定 7 が entity 関連に対して既に行っている処理と同一） |
| ニーズは論理面にある | entity 層があるモデルではその通りで、本ビューはドメイン単位のエンティティビューを置き換えない。**entity 層が無いモデル**には論理面が存在しないので、そこは論理面では解けない |

`docs/concepts.md` の非目標も同じ操作で refine した。「FK 制約**定義**」（列・型・cascade・制約名）は対象外のまま、「どのテーブルがどのテーブルを参照するか」は共通フィルタ（存在・関係・所有、かつ緩やかに変化する）を通る。ADR-1870 の「属性なし」線（TPL-1882）は動かしていない。

## 決定

**`database` ブロックのキャンバスに、`.krs` に記録された table 間エッジと、`entity` 関連を `table` 対応越しに render 時投影したエッジを union して描く。印は「誰かが確認したか」の 1 軸 3 状態で、区別は色に載せる。両集合の差分は `coverage` が報告する。**

1. **FK は `.krs` に記録し、entity 投影は render 時に導出する。** 各事実をその発生源に置く。FK は render 時に DDL が無いので再取得できず記録するしかない。entity 投影はモデル内にある事実なので導出する（記録すると二重管理になり drift する）。新しい**著述**構文はゼロで、記録側は既存の leaf edge 構文、投影側は `.krs` に現れない。

2. **方向規約は両ソースで一致する。** FK の方向（参照保持側 → 参照される側）は ADR-1870 決定 2 の entity 関連の方向規約と同じ規則なので、union は**順序付きペア** `(from, to)` をキーにできる。

3. **印は 3 状態。軸は「誰も確認していないか」であって「機械が書いたか」ではない。**

   | 状態 | 印 | 出どころ |
   | --- | --- | --- |
   | 確認済み | 無タグ | `translate --from db` が宣言 FK から記録した、**または人が書いた** |
   | soft FK 由来（列名規約） | `[inferred]` | `translate --from db`。TPL-1944 の意味をそのまま table 層へ拡張 |
   | entity 関連からの投影 | `[projected]` | renderer が付与。`.krs` には現れない |

   **無タグを「宣言 FK 由来」の証拠にはしない。** `table` leaf のエッジは人が書けるので、無タグの table エッジが `translate` の出力とは限らない。これは `[inferred]` とまったく同じ設計で、entity 関連でも無タグは「確定」を意味し、人が `[inferred]` を 1 個消すことが確定への昇格そのものだった。著述由来と translate 由来を分ける marker は足さない。読み手が区別すべきなのは「誰かが確認したか」であり、後者を印にすると `[inferred]` を手で消すキュレーションの意味が壊れる。`[projected]` は `[implicit]` と同じ register（render 時付与の system-assigned tag）で、`[implicit]` が domain → service の畳み**上げ**なのに対し entity → table の畳み**下げ**である。著述可能な builtin タグではないので ADR-2172 の 3 問の対象外だが、TPL-1503 に従い既定スタイルを与える。

4. **既定スタイルは色のみ**（`[projected]` は dark `#38BDF8` / light `#0369A1`）。線種は `[sync]` / `[async]` が所有する。Issue 本文は「solid vs dashed」で区別する案だったが、ADR-1870 が `[inferred]` に対して同じ案を既に却下している（TPL-510）。

5. **union 規則 — 生き残ったエッジは「自分が持っていない属性だけを受け取る」。** 同じ順序付きペアなら 1 本にし、`.krs` 側を採る（`[projected]` を付けない）。**ラベルは** `.krs` 側が持っていないときだけ entity 関連から移る。**`edge.kind` は移さない** — ラベルが移るのは `.krs` 側が持っていないからで、kind は `->` / `-->` のどちらで書かれても必ず決まっているからである。逆向き衝突（記録 `A -> B` / 投影 `B -> A`）は記録側だけを描き、ラベルは移さない（`"belongs to"` は方向依存なので逆向きに貼ると嘘になる）。集約粒度では畳んだ子の FK を root に畳み上げ、target で dedup し、自己エッジを落とす。

6. **投影のスコープはストア 1 個。** 両端の entity が**同じ** `database` へ table 対応を持つ関連だけが投影される。端点の解決は `resolveQualifiedEntity` を、関連の起点判定は `isAnchoredAt` を再利用する — 自前の解決を書くと同じ関連の扱いがエンティティビューと投影で割れる（TPL-1936）。

7. **差分は `coverage` が報告する。軸は「記録済み vs 投影」であって「FK vs アプリ層」ではない。** 決定 3 で無タグを機械 provenance にしないと決めた以上、parse 後の `.krs` に FK 由来と手書きを分ける情報は残っていない。隠し属性として origin を持ち回れば、足さないと決めた marker を読み手から見えない場所に置き直すだけになる。`InfraCoverage` に順序付きペアの 4 リスト（`recordedWithoutProjection` / `projectionWithoutRecorded` / `directionMismatch` / `kindMismatch`）を足し、レポートとキャンバスが**同じ関数**（`containerCanvasEdges` / `projectStoreRelations`）から読むようにした。修復可能な欠落（`recordedWithoutProjection`）と設計上正しい事実（`projectionWithoutRecorded`）は別リストに分ける — 畳むと片方の修復手段が失われる（TPL-999、`tablelessEntities` と同じ立場）。

8. **このビューは完全な ER 図ではない、と仕様に書く。** `table` 対応を持たない entity の関連は写らない。Dify 実測ではあるサービスの 19 entity すべてが設計上 tableless で、Plugin は 13 中 9、Billing は 11 中 10 が tableless（記録が外部デーモンや SaaS にある）。落ちること自体は正しいが、ER 図に見えるビューの分母が黙って絞られている状態は誤読を生むので、写らないものを同じ面に明記する（TPL-2585）。

## 理由

- **各事実をその発生源に置くのが、「どちらのソース単独でも有用」を満たす唯一の形だった。** 投影のみ（案2）は entity 層の無いモデルに何も返さず、記録のみ（案3）は手書き・逆生成モデルで投影が効かない。
- **描画側は既に存在していた。** `parseLeafNodeContents` は leaf でもエッジを受理し、`database` のドリルダウンはそれを描く（設計時に `table orders { orders -> customers }` を render して確認）。足りなかったのは「エッジを作る側」だけで、実装は新語彙を増やさずに済んだ。
- **provenance の半分は既存機構だった。** `[inferred]` は soft FK 由来の entity 関連に translate が刻むタグで、明示 FK 由来は無タグ。この意味をそのまま table 層へ持ち上げるだけで、確認済み/推論の軸が手に入った。
- **レポートは推測を照合に変える。** 逆生成ハーネスのクロスドメイン関連照合は、各ドメインのエージェントが他ドメインの entity id を*推測*して突き合わせる形だった。スキーマ由来の期待関連リストが出れば、そこが推測ではなく照合になる。

## 却下した案

### 投影のみ（`.krs` に何も記録しない）

ADR-1870 案B の却下線に一切触れない代わり、entity 層の無いモデル（`translate --from db` 直後・手書きスキーマ）に何も出ない。FK が密な小さいスキーマ、つまりこのビューが最も安価に効くはずの側がまるごと対象外になる。

### 両ソースとも `.krs` に記録する（translate が table エッジも entity 関連も吐く）

描画側は既存のままで実装は最小だが、`translate` を通らないモデル（手書き・逆生成）で投影が効かない。加えて entity 関連と table エッジが同じ事実の 2 表現になり、entity を直しても table 面が古いまま残る。

### 本件そのものを却下する（ADR-1870 の線を維持）

語彙・機構の増加はゼロだが、entity 層の無いモデルのストアキャンバスは 137 ノード 0 エッジのまま残る。「ニーズは論理面にある」は、論理面が存在しないモデルには適用できない。

### 線種（solid / dashed）で FK-backed と投影を区別する

Issue 本文の案。`[async]` が dashed を所有しており、ADR-1870 が `[inferred]` に対して同じ案を同じ理由で却下済み（TPL-510）。区別は色に載せた。

### 著述由来と translate 由来を分ける marker を足す

レビューで挙がった案（PR #2699）。無タグが「宣言 FK 由来」の証拠にならないのは事実だが、機械 provenance を印にすると `[inferred]` を手で消すキュレーションの意味が壊れる。軸を「誰が確認したか」に統一した。

### 差分レポートに非表示の origin を持ち回る

同じくレビューで挙がった案（PR #2727）。決定 3 で足さないと決めた marker を、読み手から見えず誰も再検査しない場所に置き直すだけになる。レポートの軸を「記録済み vs 投影」に定義し直した。

## 実装後に残した範囲

- **密なキャンバスのエッジ集約** — [#2728](https://github.com/kompiro/karasu/issues/2728)。設計では「実装時に実測して必要なら別 Issue」としていた。実測は Dify の `DifyDB` で **leaf 137 に対し投影エッジ 296 本**で、TPL-1223 の「一目で把握できる解像度」を超える。集約は本 ADR では決めていない。
- **多態 FK は表現しない。** 1 列・複数ターゲット・兄弟の判別列という形は両ソースとも表現できず、派生ビューは entity 層が選んだ形をそのまま引き継ぐ。Dify 逆生成で最も多く報告された記法ギャップ（19 ドメイン中 9）だが、記法の追加は本 ADR の範囲外。
- **記録した FK を誰も再検査しない。** emit 時点のスキーマのスナップショットであり、スキーマが変わっても `.krs` は黙って古くなる。差分レポートは論理モデル側の欠落を見るもので、DDL との照合ではない。
- **`queue` / `storage` への一般化は未評価。** 本 ADR は `database` / `table` に限る。
