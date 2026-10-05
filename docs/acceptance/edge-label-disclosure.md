---
type: product
---

# AT: edge ラベルの段階的開示（canvas の段）（#3030）

- **日付**: 2026-10-02
- **関連 Issue**: [#3030](https://github.com/kompiro/karasu/issues/3030)（slice A: canvas の段）（親: [#3022](https://github.com/kompiro/karasu/issues/3022)）
- **Related TPLs**: [TPL-3022](../test-perspectives/TPL-3022-withheld-content-stays-reachable.md)（canvas が省略・保留した authored 情報は、その surface 上で全文に到達できる）, [TPL-2048](../test-perspectives/TPL-2048-label-placement-measured-and-byte-stable.md)（ラベルの衝突は数値で計測し、衝突の無い図は byte-stable に保つ）, [TPL-2174](../test-perspectives/TPL-2174-opt-in-visual-layer-is-inert-when-off.md)（何も保留していないときはマーカーを 1 つも出さない）
- **対象ファイル**:
  - `packages/core/src/renderer/edge-label-disclosure.ts`（省略と、保留の対象を決める規則）
  - `packages/core/src/renderer/label-placement.ts`（座れないラベルの保留、ghost / cyclic edge の扱い）
  - `packages/core/src/renderer/edge-routing.ts`（`renderEdge` の出力）
  - `packages/core/src/resolver/style-resolver.ts`（`label-max-chars` / `label-display`）
  - `docs/spec/style.md` / `style.ja.md`（2 つの property の節）

> 線が多い canvas では、edge のラベルが node card や他のラベル、他の edge の線に重なって読めなくなる。canvas は「重ならずに置けるラベルだけを、上限文字数まで」描き、描かなかった分は edge 自身が全文を持ち続ける。`.krs` は変えない。

## 受け入れ条件

### AC-1: 長いラベルは省略して描く（`label-max-chars`）

- [x] 上限（既定 48 文字）を超えるラベルは単語の境界で切り、`…` を付けて描く。`…` を含めて上限を超えない

  > ✅ Automated — `packages/core/src/renderer/edge-label-disclosure.test.ts` › displayEdgeLabel › cuts at a word boundary and ends with an ellipsis

  > ✅ Automated — `packages/core/src/renderer/edge-label-disclosure.test.ts` › displayEdgeLabel › never draws more characters than the budget, ellipsis included

- [x] 結合文字や絵文字の連結の途中では切らない

  > ✅ Automated — `packages/core/src/renderer/edge-label-disclosure.test.ts` › displayEdgeLabel › does not cut a letter from its combining accent

  > ✅ Automated — `packages/core/src/renderer/edge-label-disclosure.test.ts` › displayEdgeLabel › does not leave an emoji sequence half-joined

- [x] 上限に収まるラベルは書かれたとおりに描く

  > ✅ Automated — `packages/core/src/renderer/edge-label-disclosure.test.ts` › displayEdgeLabel › returns the label itself when it fits, so a short label is drawn as written

- [x] `label-max-chars: none` は全文を描く。正の整数でない値は無視し、既定値を使う

  > ✅ Automated — `packages/core/src/compile/edge-label-disclosure-surfaces.test.ts` › a label longer than `label-max-chars` is drawn truncated › `label-max-chars: none` draws the label whole

  > ✅ Automated — `packages/core/src/resolver/style-resolver.test.ts` › label-max-chars / label-display properties (#3022) › keeps the default for a value that is not a positive whole number

- [x] 配置パスは、省略後の文字列の幅でラベルを動かす（描く文字列と測る文字列が一致する）

  > ✅ Automated — `packages/core/src/renderer/label-placement.test.ts` › buildLabelInputs › measures the truncated text, not the authored one (`label-max-chars`)

### AC-2: 重ならずに置けないラベルは描かない（`label-display: auto`）

- [x] 41 本のラベル付き edge を持つ密な canvas で、描かれたラベルと card・他のラベル・他の edge の実線との衝突が 0 件になる。全部を外したのではなく、置けるラベルは残る

  > ✅ Automated — `packages/core/src/renderer/label-placement.test.ts` › dense canvas fence — 41 labelled domain edges over 10 domains (#3022) › under `auto`, every label left on the canvas is clear of cards, labels and solid lines

- [x] 同じ canvas を `always` で描くと衝突する（fixture が実際に密であることの前提確認）

  > ✅ Automated — `packages/core/src/renderer/label-placement.test.ts` › dense canvas fence — 41 labelled domain edges over 10 domains (#3022) › drawn in full, the labels collide with cards, each other and other edges' lines

- [x] 外したラベルは、後から置くラベルの障害物にならない

  > ✅ Automated — `packages/core/src/renderer/label-placement.test.ts` › resolveLabelPlacements — leaving a label off the canvas (`label-display: auto`, #3022) › a deferred label is not an obstacle for the labels placed after it

- [x] 動かせば置けるラベルは、外さずに動かす

  > ✅ Automated — `packages/core/src/renderer/label-placement.test.ts` › resolveLabelPlacements — leaving a label off the canvas (`label-display: auto`, #3022) › does not defer a label that can be seated clear

- [x] 外すのは衝突するラベルだけ。重なっていないラベルは、他の edge の線のほうが近くても描く

  > ✅ Automated — `packages/core/src/renderer/label-placement.test.ts` › resolveLabelPlacements — leaving a label off the canvas (`label-display: auto`, #3022) › draws a label that is clear but ambiguous: only a collision leaves it off

- [x] ghost edge と cyclic edge のラベルも `auto` の対象になる。ghost のラベルは実線のラベルの後に置き、ghost の線は障害物にしない。cyclic の線は、ラベルの有無にかかわらず障害物になる

  > ✅ Automated — `packages/core/src/renderer/label-placement.test.ts` › buildLabelInputs › lets ghost and cyclic labels into the pass when the canvas may leave them off (auto, #3022)

  > ✅ Automated — `packages/core/src/renderer/label-placement.test.ts` › resolveLabelPlacements — leaving a label off the canvas (`label-display: auto`, #3022) › places a late (ghost) label after the others, so it yields to them

  > ✅ Automated — `packages/core/src/renderer/label-placement.test.ts` › buildLabelInputs › makes an unlabelled cyclic line an obstacle too, once any label may be left off (#3022)

- [x] `always` は今までどおり全部を描き、`hover` は描かない

  > ✅ Automated — `packages/core/src/renderer/label-placement.test.ts` › buildLabelInputs › excludes ghost and cyclic edges (peripheral geometry — ADR-968), keeps real ones

  > ✅ Automated — `packages/core/src/compile/edge-label-disclosure-surfaces.test.ts` › `label-display: hover` leaves the label off the canvas › $name draws no label text and keeps it reachable

### AC-3: 描かなかった分に、同じ surface で届く（TPL-3022）

- [x] 省略・保留した edge は、書かれた全文を `data-edge-label` と `<title>` の両方に持ち、`data-edge-label-withheld` で省略か保留かを示す。live compile と 3 つの静的バンドルのすべてで成り立つ

  > ✅ Automated — `packages/core/src/compile/edge-label-disclosure-surfaces.test.ts` › a label longer than `label-max-chars` is drawn truncated › $name keeps the authored text on the edge and in a <title>

  > ✅ Automated — `packages/core/src/compile/edge-label-disclosure-surfaces.test.ts` › dense canvas: what `auto` leaves off stays reachable on every surface (TPL-3022) › $name: every withheld label in the bundle is reachable

- [x] 機械生成のラベル（`W` / `R`、`N domain edges`）と、集約 edge のクリック対象のラベルは、値にかかわらず保留しない

  > ✅ Automated — `packages/core/src/compile/edge-label-disclosure-surfaces.test.ts` › a synthetic label is never withheld (TPL-3022) › stays drawn, with no marker, under `label-display: hover`

  > ✅ Automated — `packages/core/src/renderer/edge-label-disclosure.test.ts` › canvasLabel › never withholds a label that is the click target of the aggregated-edge panel

- [x] author が `label-position` / `label-offset` で位置を指定したラベルは保留しない

  > ✅ Automated — `packages/core/src/renderer/label-placement.test.ts` › resolveLabelPlacements — leaving a label off the canvas (`label-display: auto`, #3022) › never defers an author-positioned label (ADR-1184: the author's position wins)

### AC-4: 何も省略・保留しない canvas は変わらない（TPL-2174）

- [x] 短いラベルだけの canvas は、2 つの property が無かったときと byte-identical。全 surface で成り立つ

  > ✅ Automated — `packages/core/src/compile/edge-label-disclosure-surfaces.test.ts` › a canvas that withholds nothing is unchanged (TPL-2174) › $name is byte-identical to the behaviour before

- [x] そのとき `data-edge-label-withheld` も edge の `<title>` も 1 つも出ない（等値では相殺されて見えないので、名前で列挙して不在を確かめる）

  > ✅ Automated — `packages/core/src/compile/edge-label-disclosure-surfaces.test.ts` › a canvas that withholds nothing is unchanged (TPL-2174) › $name carries none of the markers

- [x] `examples/` の全ファイルの all-views バンドル（root・各 drill-down 階層・deploy・org）に、省略・保留されたラベルが 1 つも無い

  > ✅ Automated — `packages/core/src/compile/edge-label-disclosure-surfaces.test.ts` › examples corpus: the defaults withhold nothing (#3022) › no example's all-views bundle carries a withheld label

## 手動確認

- [ ] 本番 app（<https://karasu.kompiro.dev/>）で `index.krs` に下のモデルを貼る。`A → B` のラベルが `…` で終わる形で描かれ、その線の上に pointer を置いて待つと、ブラウザの tooltip に全文が出る

  ```krs
  system S {
    service A {
      label "A"
    }
    service B {
      label "B"
    }
    A -> B "authorizes every request through the permissions module and the request parser"
  }
  ```

  > 🧑 Manual — ブラウザ自身が出す tooltip（`<title>`）は jsdom に無く、自動テストでは出たことを確かめられない
