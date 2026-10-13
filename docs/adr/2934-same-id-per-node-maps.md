---
id: ADR-2934
title: 同名ノードの per-node Map は path をキーにし、bare id の見え方は勝者規則 1 つで決める
status: accepted
date: 2026-10-13
topic: renderer
authors: [kompiro]
depends_on:
  - ADR-2917
  - ADR-2550
related_to:
  - ADR-2088
  - ADR-2173
  - ADR-2174
  - ADR-2596
  - ADR-2714
scope:
  packages: [core]
assumptions:
  - "symbol: packages/core/src/parser/node-path.ts :: bareIdView"
  - "symbol: packages/core/src/types/ast.ts :: nodePathRanking"
  - "symbol: packages/core/src/types/ast.ts :: nodeFileIndexByPath"
  - "symbol: packages/core/src/types/ast.ts :: facetIndexByPath"
  - "symbol: packages/core/src/types/style.ts :: nodesByPath"
  - "symbol: packages/core/src/types/style.ts :: layoutHintsByPath"
  - "symbol: packages/core/src/types/style.ts :: paintedColorsByPath"
  - "symbol: packages/core/src/renderer/facet-overlay.ts :: membershipByPath"
  - "symbol: packages/core/src/compile/compile-diff.ts :: nodeDiffByPath"
  - "grep: packages/core/src/renderer/layout-types.ts :: fromKey\\?: string"
  - "grep: packages/core/src/exporter/drawio/drawio-exporter.ts :: nodePathRefId\\(node\\.path\\)"
  - "file: packages/core/src/renderer/multi-system-same-id.test.ts"
  - "file: docs/acceptance/2934-same-id-per-node-maps.md"
  - "file: docs/test-perspectives/TPL-1583-migration-priority-index-winner.md"
---

# ADR-2934: 同名ノードの per-node Map は path をキーにし、bare id の見え方は勝者規則 1 つで決める

- **日付**: 2026-10-13
- **ステータス**: 決定済み
- **関連**:
  - Issue #2934（[ADR-2917](2917-multi-system-root-same-id-nodes.md) の再点検で切り出した残課題）、Design Doc PR #3108、実装 PR #3142
  - 隣接 Issue: [#3126](https://github.com/kompiro/karasu/issues/3126)（ルートの diff が `systems[0]` 以外の子に状態を付けない。本件の path キー化で着手できるようになった）、[#2935](https://github.com/kompiro/karasu/issues/2935)（hand-over に path を運ぶ）、[#2819](https://github.com/kompiro/karasu/issues/2819)（path key の単射化）
  - 関連 ADR: [ADR-2917](2917-multi-system-root-same-id-nodes.md)（`data-node-path` と `nodeMetadataByPath`）、[ADR-2550](2550-order-independent-node-path-index.md)（`nodePathIndex` の勝者規則）、[ADR-2088](2088-node-reference-path-notation.md)（索引は path キー。揃った多重一致は broadcast）、[ADR-2714](2714-deploy-container-id-injective.md)（衝突したときだけ key を変える案の却下）、[ADR-2173](2173-facet-grammar-and-model.md) / [ADR-2174](2174-facet-overlay.md)（facet の所属と overlay）、[ADR-2596](2596-node-path-index-merged-model.md)（`resolve()` での `nodePathIndex` 再構築）
  - TPL: [TPL-1583](../test-perspectives/TPL-1583-migration-priority-index-winner.md)（1:1 の値は全 Map で同じ勝者規則。本件で `discovered_from` とチェックリストを追記）、[TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)、[TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md)、[TPL-2920](../test-perspectives/TPL-2920-duplicate-element-id-on-one-canvas-names-its-landing.md)、[TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)
  - AT: `docs/acceptance/2934-same-id-per-node-maps.md`
  - spec: `docs/spec/diagnostics.md`（`node-id-multiple-locations`）

## 背景

2 つの system が同じ bare id のノードを持つモデル（`Shop.Api` と `Admin.Api`）は言語上正当である（ADR-2088）。ADR-2917 でルートビューは両方のカードを描き、クリックはカードの `data-node-path` で自分のノードに着くようになった。しかし compile / render の途中で作る per-node の Map の多くは bare id をキーにしたままで、同名の 2 ノードのどちらを表すかを Map ごとに別の規則で決めていた。

次のモデルで測った（`main` = `dc23315a`）。

```krs
facet pii { label "PII" }
system Shop {
  service Api [external] @migration_target {
    description "Shop's Api"
    facets pii
  }
  service Worker {}
  Api -> Worker "queues"
}
system Admin {
  service Api {
    description "Admin's Api"
  }
  service Jobs {}
  Api -> Jobs "runs"
}
```

| Map                                                        | 観測                                                                  | 規則                                                               |
| ---------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `nodeMetadata.get("Api")`                                  | description は `Admin's Api`、`viewPath` は `["Shop","Api"]`          | 本体は後勝ち、`viewPath` は勝者。1 つのレコードに 2 ノードが混ざる |
| style（`service[external] { background-color: #ff0000 }`） | `Shop` を先に書くとどちらも赤くない、`Admin` を先に書くとどちらも赤い | 後勝ち。tag 付きの `Shop.Api` だけが赤いのが正しい                 |
| facet overlay（`pii` を選択）                              | 両カードに `data-facet-member="pii"`                                  | bare id で union                                                   |
| draw.io（system ページ）                                   | `system-Api` の cell id が 2 つ、edge は両方 `source="system-Api"`    | 同じページに重複 id                                                |
| diff 状態（ルートビュー）                                  | `Admin.Api` だけ変えても `Admin.Api` カードは `unchanged`             | `Admin.Api` が bare id 経由で `Shop.Api` の状態を借りる            |
| `nodeFileIndex`                                            | 走査順で最初のファイル                                                | 先勝ち                                                             |

ADR-2917 の表と合わせると、同じ bare id について「詳細パネルは後の system、ドリルは勝者、エディタへジャンプは最初の宣言、facet リングは両方の和」という 4 通りの答えが同時に出ていた。TPL-1583（1:1 index は主を選ぶ規則を全 index で揃える）に反する。

## 決定

**消費側が「この 1 ノード」の値を問う Map は path キーを primary にし、bare id の見え方は `nodePathIndex` と同じ順位で primary から導く。消費側が「この id を持つノード全部」を問う Map だけを broadcast として bare id の union に残し、そう明記する。**

判定の基準は 1 つで、その Map を引く消費側が知りたいのが 1 ノードの値か、id を持つノード全部の値か、である。

1. **順位**: `buildNodePathIndex` は勝者を選ぶ walk で集めた候補を捨てず、id ごとの順位付き path 列 `KrsFile.nodePathRanking`（先頭が勝者。`migrationPriority()` 最大、同点は traversal 順で最初。ADR-2550）を併せて返す。`nodePathIndex` の値は変わらない。`resolve()` は `nodePathIndex` と同じ位置で再構築する（ADR-2596）。
2. **bare の見え方**: `bareIdView(byPath, ranking)`（`parser/node-path.ts`）を全 Map で共有する。その Map が持つ同じ bare id の entry のうち順位が最上位のものを返す。勝者が Map に居なければ次点以下から選び、順位列に載らない path は最後に回して `nodePathRefId` の文字列順で決める。Map を埋めた順には依存しない。末尾 segment は `parseNodePathRefId` で取り出し、key を `.` で split しない（TPL-1352 / #2819）。
3. **1 ノード側の Map**（path キーの primary を足し、bare は 2 で導く）:
   - `nodeMetadata`: primary は既存の `nodeMetadataByPath`。bare の `viewPath` も勝者自身なので、1 つのレコードに 2 ノードが混ざらない。
   - `nodeFileIndex`: `nodeFileIndexByPath` を新設。bare は `resolve()` で導く。
   - style: `ResolvedStyles.nodesByPath` / `layoutHintsByPath` / `paintedColorsByPath` を別 Map として新設する。引用符付き id `"Shop.Api"` の bare key と path `Shop.Api` が同じ文字列になりうるので、bare の Map に混ぜない。カードは path を先に引き、無ければ従来の順（`id@annotation` → bare）。カードの計測（`shapeForNode`）と canvas ごとの `column` hint も path で引く。論理ビューの container 枠も `ContainerRect.path` で自分の style を引く。
   - facet の所属: `KrsFile.facetIndexByPath` と `FacetOverlay.membershipByPath` を新設。カードのリング、collapse stub が畳み込むメンバーの facet、edge の dim はそれぞれの path で引く。
   - diff 状態: `DiffedView.nodesByPath`（`SystemDiffCompileResult.nodeDiffByPath`）を新設。path を持つカードは自分の状態だけを読む。compare モードの facet 所属の統合も path で行う。
   - draw.io: 複数 system のルートページでは、すべてのカードの cell id を path から作る（`system-Shop_Api`）。ルートの system 内 edge は `LayoutEdge.fromKey` / `toKey` で端点を引き、無ければ bare id に落ちる。
4. **broadcast 側の Map**: bare の `KrsFile.facetIndex` は union のまま残す。用途は model が知る facet id の列挙・ghost カード・canvas 上のカードでない edge 端点で、doc comment に「1 ノードを塗る用途には `facetIndexByPath` を引く」と書く（ADR-2173 / TPL-2161: 所属を捨てない）。
5. **公開面**: bare の Map（`CompileResult.nodeMetadata`、`KrsFile.nodeFileIndex`、`KrsFile.facetIndex`、`ResolvedStyles.nodes` ほか）は型を変えずに残す。同名 id があるときの値が後勝ち・先勝ちから勝者に変わる。`KrsFile` と `ResolvedStyles` には path キーのフィールドが必須で増えるので、parser・`emptyKrsFile()`・`resolveStyles` を通さずに手で組み立てるコードは追加が要る。

## 理由

- **カードごとに自分の値で描かれる。** 実測した目に見える誤り（style・facet リング・diff 状態・draw.io の重複 cell id）がすべて直る。bare キーのまま tie-break だけを揃える案では、ルートの `Admin.Api` カードは引き続き `Shop.Api` の値で描かれる。
- **bare id の答えが 1 つに揃う。** 詳細パネルの fallback、ドリル、jump-to-editor、ghost カードの style が同じノード（勝者）を指す。順位を Map の外（model）から取るので、勝者がその Map に居ないとき（勝者が別 service 配下の `domain Api` で、ルートの canvas には 2 つの service だけが載る場合など）にも Map の組み立て順で答えが変わらない。
- **helper を 1 つにする。** Map ごとに `set` の条件を書き下すと、規則がコピーごとに drift する（TPL-1583「三項のコピペ」）。bare の Map は primary から導く派生ビューで、別々に構築しない（TPL-1032）。
- **broadcast を残すのは、ADR-2088・ADR-2917・`docs/spec/style.md` と読み方を揃えるため。** bare id は集合を指し（ADR-2088 決定 4、無修飾 selector は全 scope に一致）、1 ノードを指したい消費側は path を持つ（ADR-2917）。facet id の列挙まで勝者で間引くと、宣言された所属を捨てる。
- **同名 id を持たないモデルの出力は変わらない。** SVG と bare の Map の中身は既存の fence で byte-identical を確かめた。draw.io は複数 system のルートページの cell id だけが変わる（下の「Design Doc からの逸脱」）。

### 柵

- `packages/core/src/renderer/multi-system-same-id.test.ts`: 上のモデルで Map ごとの規則を固定する。style・`column` hint・facet リング・metadata・ファイルは system の宣言順を入れ替えた 2 通りで同じ結果になること、priority が同点なら traversal 順で最初の system が勝つこと、勝者が canvas に居ないとき次点が順位で決まること、draw.io の cell id が一意で各 edge が自分の system の `Api` から出ること、`Admin.Api` が `Shop.Api` の diff 状態を借りないこと。
- `packages/core/src/parser/node-path.test.ts`: `bareIdView` が Map を埋めた順に依存しないこと。
- `packages/core/src/renderer/container-frame-theme-defaults.test.ts`（#2662）: service と同じ id の system の枠が、その service の style を取らないこと。実装中にこの fence が落ちて、`paintedColorsByPath` と `ContainerRect.path` が要ると分かった。
- 手動の AT-K（draw.io で開いて、各 `Api` が自分の枠と edge を持つ）は PR #3142 で確認した。

## Design Doc からの逸脱

- **draw.io の cell id。** Design Doc は「layout の Map key から cell id を作れば、同名なしモデルでは Map key が bare id と同じなので出力は変わらない」と想定していた。実際には複数 system のルートページの Map key は `(system, id)` の組で、bare id と一致しない。そこで**ルートページではすべてのカードを path で命名する**ことにした。衝突したときだけ path にする形は、key が他のノードの有無で変わるので ADR-2714 が却下した形である。結果として、**複数 system のルートページは同名 id が無くても cell id が変わる**（`system-Api` → `system-Shop_Api`）。他のページは変わらない。
- **container 枠。** Design Doc はカードだけを path で引く想定だったが、system の枠も同じ id の service の style を取っていたので、`paintedColorsByPath` と `ContainerRect.path` を足した。

## 却下した案

### bare キーのまま、各 Map の tie-break を勝者に揃える

変更が小さく公開面も変わらないが、揃うだけで正しくならない。ルートの `Admin.Api` カードは引き続き `Shop.Api` の style・facet リング・diff 状態で描かれ、draw.io の重複 cell id も直らない（bare キーは 1 つの値しか持てない）。「衝突したら勝者の値で全カードを塗る」は ADR-2917 の「1 ノードを指したい消費側は path を持つ」と逆向きである。

### すべての Map を path キーにし、bare の見え方は一律に勝者で導く

カードの値は直るが、facet id の列挙のような本当の broadcast まで勝者で間引き、宣言された所属を捨てる（ADR-2173 / TPL-2161 違反）。判定基準で 1 ノード側と broadcast 側に分ける採用案に吸収した。

## 影響

- 同名 id を持つモデル: ルートビューのカードがそれぞれ自分の style・`column` hint・facet リング・diff 状態で描かれ、draw.io export のルートページが正しい親子と edge を持つ。bare id でしか引けない値（詳細パネルの fallback、jump-to-editor のファイル、ghost カードの style）は後の system や最初の宣言ではなく勝者のノードになる。
- 同名 id を持たないモデル: SVG と bare の Map は変わらない。draw.io の複数 system ルートページの cell id だけが path 形になる。
- 範囲外として残したもの:
  - ルートの diff が `systems[0]` 以外の子に状態を付けないこと（#3126）。詳細パネルの annotation diff を path で引くこともそちらで扱う。
  - ghost と合成 stub は `LayoutNode.path` を持たないので bare の見え方（勝者）で引く。ghost の `Admin.Api` が勝者 `Shop.Api` の style で描かれることは残る。
  - jump-to-editor・ハイライト・アウトラインが path を運ぶこと（#2935）。それまでは bare id で運ぶかぎり勝者に着く。
  - system をまたぐ edge が draw.io に出ないこと、ルートビューで collapse stub の facet リングを畳み込まないことは、本件より前からの挙動で変えていない。
