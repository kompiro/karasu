---
type: product
---

# AT: ストアスコープの ER ビュー（`database` キャンバスへの entity 関連の投影）（#2721）

- **日付**: 2026-09-06
- **関連 Issue**: [#2721](https://github.com/kompiro/karasu/issues/2721)（slice A）, [#2722](https://github.com/kompiro/karasu/issues/2722)（slice B）, [#2723](https://github.com/kompiro/karasu/issues/2723)（slice C）（親: [#2585](https://github.com/kompiro/karasu/issues/2585)）
- **Related TPLs**: [TPL-2585](../test-perspectives/TPL-2585-partial-mapping-view-states-its-denominator.md)（部分的な写像を通した派生ビューは写らなかった分母を示す）, [TPL-510](../test-perspectives/TPL-510-derivation-tag-semantics.md)（派生タグは kind 次元と直交させる）, [TPL-1936](../test-perspectives/TPL-1936-cross-domain-entity-reference-qualified.md)（cross-domain の entity 参照は限定子付き）
- **対象ファイル**:
  - `packages/core/src/view/view-extract.ts`（`projectEntityRelationsOntoStore`）
  - `packages/core/src/builtins/default-style.ts`（`edge[projected]`）
  - `packages/core/src/resolver/style-resolver.ts`（静的バンドルで派生エッジにスタイルを当てる `styleDerivedEdges`）
  - `docs/spec/syntax.md` / `syntax.ja.md`（§ Store-scoped ER view）、`docs/spec/tags-annotations.md` / `.ja.md`（`[projected]`）
  - `packages/core/src/translate/db.ts`（`collectRootRelations` / `emitTableEdges`。slice B）
  - `packages/core/src/view/coverage-extract.ts`（`diffStoreRelations`）、`packages/cli/src/coverage.ts`（slice C）

> `database` のドリルダウンは `table` leaf を関連ゼロで並べていた。両端が同じストアへ `table` 対応を持つ `entity` 関連を、描画時に leaf 間エッジとして投影する。`.krs` は変えない。投影エッジは `[projected]`（色のみ）で記録済みエッジと区別され、`[async]` の破線は保たれる。

## 受け入れ条件

### AC-1: entity 関連がストアのキャンバスに投影される

- [x] TC-A1: 両端が同じ `database` へ `table` 対応を持つ関連が、その `database` のキャンバスに `[projected]` 付きの leaf 間エッジとして出る

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › store-scoped ER projection onto a database canvas (#2721) › projects a relation whose endpoints both map into the store, tagged [projected] (TC-A1)

- [x] TC-A2: 投影エッジは関連のラベルと `->` / `-->` の種別を保つ（`-->` の関連は async のまま）

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › store-scoped ER projection onto a database canvas (#2721) › keeps the relation's label and kind: an async relation stays async (TC-A2, TPL-510)

- [x] TC-A7: `translate --from db` が吐く形（トップレベルの `database` + トップレベルの `domain`）でも投影される。`[inferred]` は投影エッジにも残る

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › store-scoped ER projection onto a database canvas (#2721) › projects onto a top-level database from an orphan domain, as `translate --from db` emits (TC-A7)

### AC-2: 端点解決がエンティティビューと一致する

- [x] TC-A3: 限定子付き `DomainId.EntityId` の参照先は解決され、bare な cross-domain id は投影されない（TPL-1936）

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › store-scoped ER projection onto a database canvas (#2721) › resolves a qualified cross-domain target and drops a bare one (TC-A3, TPL-1936)

- [x] 宣言元 entity から始まらない関連（`entity B { A -> B }`）は投影されない（#2501 と同じ規則）

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › store-scoped ER projection onto a database canvas (#2721) › does not project a relation whose source is not the declaring entity (#2501)

### AC-3: 写らないものが写らない（lossy であることの固定）

- [x] TC-A4: tableless な entity に触れる関連はキャンバスに出ない（TPL-2585）

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › store-scoped ER projection onto a database canvas (#2721) › does not project a relation to a tableless entity (TC-A4, TPL-2585)

- [x] TC-A5: 両端が別々のストアに対応する関連はどちらのキャンバスにも出ない

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › store-scoped ER projection onto a database canvas (#2721) › puts a relation mapping into two different stores on neither canvas (TC-A5)

- [x] TC-A9: entity がひとつもストアへ対応しないモデルでは、`database` のページにエッジが出ない

  > ✅ Automated — `packages/core/src/renderer/drill-down-svg.test.ts` › store-scoped ER projection on the database drill-down page (#2721) › keeps the leaves' page free of relations when no entity maps into the store (TC-A9)

### AC-4: 記録済みエッジとの描き分け

- [x] TC-A6: `table` leaf に手で書いたエッジと同じ順序付きペアは二重に描かれず、手書きの側が残る

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › store-scoped ER projection onto a database canvas (#2721) › does not duplicate an authored table edge for the same ordered pair (TC-A6)

- [x] TC-A8: 描画された SVG で投影エッジが `[projected]` の色（dark `#38BDF8`）を持ち、sync は実線・async は破線のまま（線種ではなく色で区別される）

  > ✅ Automated — `packages/core/src/renderer/drill-down-svg.test.ts` › store-scoped ER projection on the database drill-down page (#2721) › draws the projected relations on the database page, coloured by [projected] rather than dashed (TC-A8)

- [x] `[projected]` の既定色が dark / light 両テーマでキャンバス背景に対して AA コントラストを満たす

  > ✅ Automated — `packages/core/src/builtins/default-style-contrast.test.ts` › builtin badge colors (dark theme) / (light theme) › edge color of {"tag":"projected"…} is AA-legible on the canvas

### AC-5: `translate --from db` が外部キーを table エッジとして記録する（slice B, #2722）

- [x] TC-B1: 宣言 FK は無タグの `table -> table` エッジ、Soft FK は `[inferred]` 付きで `database` ブロック内に出る。ダンプ内に無いテーブルへの FK は記録されない。`entity` 層ゼロ（`--granularity table`）でもエッジが出る

  > ✅ Automated — `packages/core/src/translate/db.test.ts` › recorded table edges (#2722) › records a declared FK as an untagged table edge and a Soft FK as [inferred], in flat mode (TC-B1, TPL-1944)

- [x] TC-B2: 同じペアに宣言 FK が 1 本でも寄与すれば無タグになる（Soft FK のみのときだけ `[inferred]`）（TPL-1944）

  > ✅ Automated — `packages/core/src/translate/db.test.ts` › recorded table edges (#2722) › promotes a pair to confirmed when any contributing FK is declared (TPL-1944)

- [x] TC-B3: aggregate 粒度で畳んだ子の FK が root に畳み上がり、target で重複排除され、自己エッジが出ない

  > ✅ Automated — `packages/core/src/translate/db.test.ts` › recorded table edges (#2722) › rolls a folded child's FK up to its root, dedups by target and emits no self-edge (TC-B3)

- [x] TC-B7: 出力は parse でき、edge 系の診断がゼロで、table エッジ集合と entity 関連集合が一致する

  > ✅ Automated — `packages/core/src/translate/db.test.ts` › recorded table edges (#2722) › emits table edges the entity scaffold agrees with, and the file parses with no edge diagnostics (TC-B7)

### AC-6: 記録側と投影側の union

- [x] TC-B4: 同じ順序付きペアを両ソースが出したら 1 本（記録側、`[projected]` なし）で、ラベルは記録に無いときだけ関連から移る（書かれたラベルが勝つ）

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › union with the edges the .krs records (#2722) › draws one edge per pair, as recorded, labelled from the relation (TC-B4) ／ keeps a written label over the relation's (TC-B4)

- [x] TC-B5: 同じペアで kind が食い違う（記録 `->`、関連 `-->`）とき、生き残るエッジは記録の kind（実線）のまま

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › union with the edges the .krs records (#2722) › keeps the recorded kind when the relation's differs (TC-B5)

- [x] TC-B6: 逆向き衝突では記録側だけが描かれ、ラベルは移らない

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › union with the edges the .krs records (#2722) › draws only the recorded side of an opposite-direction pair and does not move the label (TC-B6)

- [x] TC-B8: 手で書いた無タグの table エッジは translate の出力と同じ「確認済み」として描かれる（`[projected]` が付かず、タグは書かれたまま）

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › union with the edges the .krs records (#2722) › draws a hand-written untagged table edge exactly as a translated one — untagged, not [projected] (TC-B8)

- [x] 別の `database` の leaf を指す記録エッジはどちらのキャンバスにも描かれず、`edge-endpoint-not-at-scope` が出る（ADR-2075 の既存判定をそのまま採用）

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › union with the edges the .krs records (#2722) › does not draw a recorded table edge whose target is a leaf of another store (edge-endpoint-not-at-scope owns it) ／ `packages/core/src/resolver/warnings.test.ts` › table edge crossing two database blocks (#2722) › reports edge-endpoint-not-at-scope on the leaf, the same verdict a cross-block bare edge gets anywhere

### AC-7: 記録済み table 関連と投影 entity 関連の差分が `coverage` に出る（slice C, #2723）

- [x] TC-C1: 記録にあって投影に無い関連が `recordedWithoutProjection` に順序付き `{from, to}` で出る（論理モデルの欠落。修復可能な指摘）

  > ✅ Automated — `packages/core/src/view/coverage-extract.test.ts` › recorded vs projected table relations (#2723) › reports a recorded relation the logical model lacks, separately from the reverse (TC-C1, TPL-999)

- [x] TC-C2: 投影にあって記録に無い関連が `projectionWithoutRecorded` に出る。TC-C1 と別の一覧に保たれ、欠陥ではなく事実として報告される（TPL-999）

  > ✅ Automated — `packages/core/src/view/coverage-extract.test.ts` › recorded vs projected table relations (#2723) › reports a projected relation no record enforces, as a fact (TC-C2)

- [x] TC-C3: 逆向きの組（記録 `A -> B`、投影 `B -> A`）が `directionMismatch` に記録側の向きで出る。キャンバスは記録側に寄せて描くので、レポートだけが不一致を残す

  > ✅ Automated — `packages/core/src/view/coverage-extract.test.ts` › recorded vs projected table relations (#2723) › reports an opposite-direction pair in the recorded orientation, which the canvas resolves silently (TC-C3)

- [x] TC-C4: 同じ組で kind が割れたものが `kindMismatch` に出る。両側が一致する組はどの一覧にも出ない

  > ✅ Automated — `packages/core/src/view/coverage-extract.test.ts` › recorded vs projected table relations (#2723) › reports a same-pair kind mismatch the canvas keeps as recorded (TC-C4)

- [x] `queue` / `storage` と、記録も投影も無い `database` では 4 つの一覧が空

  > ✅ Automated — `packages/core/src/view/coverage-extract.test.ts` › recorded vs projected table relations (#2723) › keeps the four lists empty for a queue / storage block and for a store with nothing recorded or projected

- [x] TC-C5: CLI の `coverage` が `database` ごとの差分表（markdown）と `--format json` の 4 フィールドを出す。`database` の無いモデルでは表を出さない

  > ✅ Automated — `packages/cli/src/coverage.test.ts` › coverage CLI › adds a table-relation diff per database, in the same pair shape as the JSON (TC-C5) ／ omits the table-relation section for a model whose infra has no database

### 手動確認

- [ ] M-1: [https://karasu.kompiro.dev/](https://karasu.kompiro.dev/) で `entity … table` 対応を持つサンプル（`examples/` の ec-platform）を開き、`database` にドリルダウンすると table 間に投影エッジが出て、手書きの leaf エッジや `[inferred]` の灰色と一目で見分けられる（色の判別は実機でしか確かめられない）
- [ ] M-2: `karasu translate --from db <schema.sql>` の出力をそのまま app で開き、`database` にドリルダウンすると `entity` 層を消しても（domain ブロックを削除しても）table 間のエッジが残り、`[inferred]` の灰色と無タグの既定色が見分けられる
