---
type: product
---

# AT: ストアスコープの ER ビュー（`database` キャンバスへの entity 関連の投影）（#2721）

- **日付**: 2026-09-06
- **関連 Issue**: [#2721](https://github.com/kompiro/karasu/issues/2721)（親: [#2585](https://github.com/kompiro/karasu/issues/2585)）
- **Related TPLs**: [TPL-2585](../test-perspectives/TPL-2585-partial-mapping-view-states-its-denominator.md)（部分的な写像を通した派生ビューは写らなかった分母を示す）, [TPL-510](../test-perspectives/TPL-510-derivation-tag-semantics.md)（派生タグは kind 次元と直交させる）, [TPL-1936](../test-perspectives/TPL-1936-cross-domain-entity-reference-qualified.md)（cross-domain の entity 参照は限定子付き）
- **対象ファイル**:
  - `packages/core/src/view/view-extract.ts`（`projectEntityRelationsOntoStore`）
  - `packages/core/src/builtins/default-style.ts`（`edge[projected]`）
  - `packages/core/src/resolver/style-resolver.ts`（静的バンドルで派生エッジにスタイルを当てる `styleDerivedEdges`）
  - `docs/spec/syntax.md` / `syntax.ja.md`（§ Store-scoped ER view）、`docs/spec/tags-annotations.md` / `.ja.md`（`[projected]`）

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

### 手動確認

- [ ] M-1: [https://karasu.kompiro.dev/](https://karasu.kompiro.dev/) で `entity … table` 対応を持つサンプル（`examples/` の ec-platform）を開き、`database` にドリルダウンすると table 間に投影エッジが出て、手書きの leaf エッジや `[inferred]` の灰色と一目で見分けられる（色の判別は実機でしか確かめられない）
