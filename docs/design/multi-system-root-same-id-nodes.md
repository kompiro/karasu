# 複数 system のルートビューは、同名ノードを両方描き、要素の id は bare id のまま保つ

- **日付**: 2026-09-27
- **ステータス**: 検討中
- **Issue**: [#2917](https://github.com/kompiro/karasu/issues/2917)
- **PR**: [#2920](https://github.com/kompiro/karasu/pull/2920)
- **関連**:
  - 引き金 Issue: [#2917](https://github.com/kompiro/karasu/issues/2917)（#2818 の SVG を測っているときに見つけた。[ADR-2818](../adr/2818-cross-navigation-highlight-id-space.md) の「残課題」）
  - 関連 ADR: [ADR-1884](../adr/1884-group-by-team-multi-system-root-per-system-frames.md)（同じ関数で collapse stub の id を system で namespace した前例）、[ADR-2521](../adr/2521-multi-system-pipeline-convergence.md)（multi-system ルートは single-system の計算に合わせる）、[ADR-2088](../adr/2088-node-reference-path-notation.md)（参照は path 記法。要素の identity を path にする案の受け皿）、[ADR-2714](../adr/2714-deploy-container-id-injective.md)（identity と突き合わせ用 id を分ける前例）、[ADR-2818](../adr/2818-cross-navigation-highlight-id-space.md)（ハイライトは 1 属性でノード id を引く）
  - 関連 TPL: [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)（区別に要る次元をキーに含める。本件はその直接の consumer で、`discovered_from` に #2917 を足す）、[TPL-2920](../test-perspectives/TPL-2920-duplicate-element-id-on-one-canvas-names-its-landing.md)（本 PR で起こした proactive TPL）、[TPL-1583](../test-perspectives/TPL-1583-migration-priority-index-winner.md)（1:1 index の勝者規則）、[TPL-1666](../test-perspectives/TPL-1666-style-lookup-matches-layout-id-form.md)（layout の key とノード自身の id は別の形）、[TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)（派生した値を別フィールドに複製しない）
  - コード:
    - `packages/core/src/renderer/layout.ts`（`layoutMultipleSystems`: system ごとの `localNodes` を `allLayoutNodes` に bare id で merge する）
    - `packages/core/src/renderer/layout-types.ts`（`LayoutNode` / `LayoutResult`）
    - `packages/core/src/renderer/svg-renderer.ts`（ノードのループが Map の key を `data-node-id` と各 lookup の id に使う）
    - `packages/core/src/renderer/deploy-layout.ts`（key を `<container>::<unit>`、`id` を bare に分けている前例）
    - `packages/core/src/renderer/external-columns.ts`（`placeExternalServicesOnSides`。ループ内で蓄積中の Map を受け取る）
    - `packages/core/src/renderer/layout-edges.ts`（`computeEdgePoints`。ループ内で蓄積中の Map を受け取る）
    - `packages/core/src/renderer/edge-routing-bundles.ts`（`markParallelBundles`。`${from}->${to}` で束ねる）
    - `packages/core/src/parser/reference-validation.ts`（`node-id-multiple-locations` と `nodePathIndex` の勝者）

## 背景・課題

2 つの system が同じ bare id の service を持つモデルのルートビューは、その id のノードを
**1 つしか描かない**。

```krs
system Shop {
  service Api {}
  service Worker {}
  Api -> Worker "queues"
}

system Admin {
  service Api {}
}
```

`main`（8633b017）で `compile(src, { diagramType: "system", viewPath: [] })` を測ると、
`data-node-id="Api"` は **1 回**で、その矩形は `Admin` の枠（x=450〜770）の中（x=530）にある。
`Shop` の枠には `Worker` だけが残り、`Api -> Worker` の線は、いまは何も無い場所から
`Worker` へ向かって描かれる。診断は `node-id-multiple-locations`（期待どおり）。
`viewPath: ["Shop"]` と `["Admin"]` ではそれぞれの `Api` が描かれるので、ノードは両方存在し、
消えるのはルートビューだけ。

原因は `layoutMultipleSystems` の merge。system ごとに `localNodes`（bare id が key）で
レイアウトした結果を `allLayoutNodes.set(id, node)` と **bare id のまま** 1 つの Map に
畳むので、**後の system の `Api` が前の system の `Api` を上書きする**（残るのは最後に
置かれた system のノード。`nodePathIndex` の勝者とは無関係）。`Shop` の edge の座標は
上書きより前にその system のループ内で計算済みなので、線だけが残る。同じ関数の collapse
stub は ADR-1884 で system id を key に含めて同じ上書きを防いでおり、ノードだけが残っていた。

## 現状（インベントリ）

### Map の key と要素の id

| 場所                     | Map の key                                                    | `LayoutNode.id` | SVG の `data-node-id` |
| ------------------------ | ------------------------------------------------------------- | --------------- | --------------------- |
| single-system の各レベル | bare id（同一親内の重複は `duplicate-node-id-parent` エラー） | 同じ            | key                   |
| deploy ビュー            | `<container>::<unit>`（unclassified は bare unit id）         | bare unit id    | key                   |
| multi-system ルート      | bare id（**衝突する**）                                       | 同じ            | key                   |

renderer のノードのループ（`svg-renderer.ts` の `for (const [nodeId, layoutNode] of
layoutResult.nodes)`）は、Map の key `nodeId` を `data-node-id`・style の key・
`serviceIdsWithDeploy.has`・`childLevelLinks.get`・facet・chip zone に使い、
`layoutNode.id` は style と diff の fallback にだけ使う。deploy ビューはこの分離に
乗って、key を identity、`id` を「ノード自身の id」として使い分けている（TPL-1666）。
multi-system ルートの `LayoutNode.id` は `makeLayoutNode(krsNode, nid, …)` の bare id で、
key と同じ値。

### `allLayoutNodes` を引くもの

蓄積中の Map を**ループの中で**受け取るものと、merge 後に受け取るものがある。

| いつ                           | 消費側                                                         | 引き方                                                                                                                                                                                                                                                  |
| ------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ループ内（各 system の配置後） | `placeExternalServicesOnSides(… allLayoutNodes …)`             | `[...layoutNodes.values()]` を `n.id`（bare）で自 system の集合と突き合わせる。前の system の同名ノードも通る                                                                                                                                           |
| ループ内                       | `computeEdgePoints(edge, allLayoutNodes, …)`                   | その system の edge の `from` / `to`（bare）で `get`                                                                                                                                                                                                    |
| ループ後                       | cross-system edge の端点解決                                   | `get(fromId)` / `get(toServiceRemapped)`（bare。端点の system は `crossSystemSource` と `crossSystemTargets` の `path[0]` で分かる。compare mode で before slice にだけある removed edge は source system が無く、`crossSystemRemapUnscoped` に落ちる） |
| ループ後                       | `markParallelBundles(allEdges, id => allLayoutNodes.get(id))`  | 全 system の edge を `${from}->${to}` で束ねる（system の次元が無い）。`anchorRectFor` は nudge の向きにだけ使い、束ねるかどうかには関与しない                                                                                                          |
| ループ後                       | `normalizeCoordinates` / `computeTotalDimensions` / 交差マーク | Map を走査するだけ                                                                                                                                                                                                                                      |
| ループ後                       | `channelReservations` などの行ヘルパ                           | `rows` を使うが、multi-system は `rows: []`                                                                                                                                                                                                             |

edge の `from` / `to` は SVG 属性には出ない（edge は `canonicalId` で識別される）。

### 同名 id のナビゲーションには、既に 2 つの「着地点」がある

- **ドリル**: app の `nodeMetadata` は `nodePathIndex` から `viewPath` を引く。index は id
  ごとに 1 つの path しか持たず（`@migration_target` 優先、同点は宣言順。TPL-1583）、
  負けた宣言に `node-id-multiple-locations` が付く。静的 SVG の `childLevelLinks` も子 id で
  引くので、同名ノードはどれも勝者のレベル（`#krs-system-Api`）にリンクする。permalink の
  `<id>` は author-given id（`docs/spec/permalink.md`）で、1 つのレベルしか指せない
- **ハイライトとアウトライン**: `PreviewPane` は `querySelector('[data-node-id="Api"]')` で
  **DOM 順で最初の要素**を光らせる。ルートの DOM 順は system の配置順なので、
  `@migration_target` が後の system を index の勝者にしていれば、ドリル先と光る要素が
  別の system になる
- deploy → system のハイライトは、ADR-2714 が bare id が 2 ノードに届くコンテナに `nodeId`
  を出さないので、この形では最初から光らない

つまり同名 id の**ナビゲーション**の曖昧さは、描画とは別に、warning 付きで受け入れられて
いる状態にある（ただし着地点は 1 つの規則ではない）。本 Issue が壊しているのは描画。

## 制約・前提

- **ルートビューの `data-node-id` は bare id のまま。** app の click delegation・
  アウトライン・ハイライト（ADR-2818: system ビューは `data-node-id` を引く）・D ボタン
  （`serviceIdsWithDeploy.has(id)`）・静的 SVG の drill link・permalink（`#krs-system-<id>`）
  のすべてが bare id を読む。ここを変えるのは別のプログラム
- **修飾も衝突も無いモデルの出力は byte-identical に保つ**（ADR-2521 の並列性の前提。
  single-system は触らない）
- **key の scope は無条件にする。** 衝突したときだけ key を変える案は、ADR-2714 が
  「衝突の有無で id が変わる」として却下した形と同じで、Map の中身がモデルの他の部分に
  依存する
- **勝者規則（TPL-1583）は変えない。** `nodePathIndex` が 1:1 であることに依存する消費側
  （permalink・app の drill・`nodeMetadata`）はそのまま
- **同じ値を 2 つのフィールドに持たない。** `LayoutNode.id` は既に bare id を持つので、
  同じ値の `elementId` を足すと片方だけ更新される余地ができる（TPL-1032）
- 対象外: ルートの要素 identity を path にする（ADR-2088 の延長、案 B）、同名 id の
  ドリル先を正確にする（案 C。ADR-2818 の A-2 の受け皿でもある）、system の枠の中で
  ノードの id を表示上区別する UI

## 検討した選択肢

### 案 A: merge の key を system で scope し、要素の id は bare のまま出す

`layoutMultipleSystems` の merge を `allLayoutNodes.set(scopedKey, node)` にする
（`scopedKey = nodePathIdentityKey([sys.id, id])`。ADR-1884 の stub と同じく生成時点で一意）。
renderer には「要素の id を Map の key から取るか、`LayoutNode.id` から取るか」を
**結果単位**で伝える: `LayoutResult.nodeIdentity?: "key"` を足し、deploy layout だけが
`"key"` を設定する。renderer のループは
`const elementId = layoutResult.nodeIdentity === "key" ? nodeId : layoutNode.id` を
「ノードの id」として `data-node-id` と per-node lookup に使う。single-system の各レベルは
key と `id` が同じ値なので byte-identical、deploy は `"key"` で今までどおり、ノードごとの
複製フィールドは要らない。

`allLayoutNodes` を引く箇所は次のようにする。

- **ループ内の 2 箇所**（`placeExternalServicesOnSides`、`computeEdgePoints`）には、
  蓄積中の `allLayoutNodes` ではなく、その system の `localNodes`（bare key）を渡す。
  どちらもその system のノードだけを見たい処理で、`placeExternalServicesOnSides` は
  そのために自分で `sourceIds` に絞っている（絞り込みは `n.id` なので、同名ノードが
  両方残ると前の system のノードが通る）
- **`markParallelBundles`**: system ごとにループ内で、その system の edge と `localNodes`
  に対して呼ぶ（single-system の `layout()` と同じ位置）。cross-system edge はループ後に
  **source system ごと**に呼ぶ（`from` が bare なので、別 system の同名 `from` を 1 つの
  束にしないため）。束ね判定は `from->to` の一致だけで決まり、`anchorRectFor` は nudge の
  向きにしか効かないので、resolver で外すのではなく呼ぶ単位で分ける
- **cross-system edge の端点**: source system が分かる edge は
  `allLayoutNodes.get(scopedKey(system, id))` で引く。compare mode の removed edge
  （source system 不明）は、bare id がルート全体で 1 つのときだけ返す `uniqueByBareId`
  で引き、同名 id なら今の `crossSystemRemapUnscoped === null` と同じく端点をそのままにする

**メリット**

- Issue の症状（枠からノードが消える）が消え、`Shop` の `Api` が `Shop` の枠の中に描かれ、
  `Api -> Worker` はそのノードから出る
- ルートの id 空間・ナビゲーション・permalink の契約は一切変わらない。衝突しないモデルは
  byte-identical
- deploy ビューが既に持っている「key と `id` は別」の構造を、結果単位のフラグとして
  明示する

**デメリット**

- ルートに同じ `data-node-id` の要素が 2 つできる。`querySelector` は DOM 順で最初の
  要素を返し、`nodePathIndex` の勝者とは別に決まる（上記）。Playwright の strict locator は
  同じ id が 2 要素に解決すると失敗するので、同名 id を持つモデルの E2E は `first()` /
  `nth()` で着地点を明示する必要がある。この契約を TPL-2920 に書き、AT にも載せる
- `LayoutResult` にフィールドが 1 つ増える

### 案 B: ルートの要素 identity を `<system>::<id>` にする

deploy ビューと同じく、multi-system ルートの `data-node-id` を scoped key にする。DOM で
一意になり、ドリル・ハイライト・permalink をノードごとに正確にできる。

**デメリット**

- bare id を読む消費側すべて（app の drill・アウトライン・ハイライト・D ボタン・静的 SVG の
  drill link・permalink の grammar）が同時に変わる。`docs/spec/permalink.md` と ADR-425 の
  契約変更を含む。ルートビューが 1 system のときは bare のままなので、system 数で id 空間が
  変わる。Issue 1 件のバグ修正で持てる範囲ではなく、ADR-2088 の延長のプログラムとして
  切るべき

### 案 C: 案 A に加えて、ルートのノードに `data-node-path` を出す

`data-node-id` は bare のまま、ドリル先の path（`Admin.Api`）を別属性で持たせ、app の
click delegation が `nodeMetadata` より先にそれを読む。同名 id のドリルが正確になり、
ADR-2818 が見送った A-2（`nodeId` の無いコンテナから所属 system へドリル）の受け皿にもなる。

**デメリット**

- 属性の encode（引用符付き id を含む path）と app 側の parse を決める必要がある。
  ハイライト・permalink・アウトラインの曖昧さは残るので、案 A の上に乗せる 2 段目として
  別 Issue で扱う方が切り方がきれい

### 案 D: 描かないまま、枠に「同名のため非表示」と示す

正直だが、モデルに存在するノードを描かない理由にはならない。却下。

### 却下した変種: `LayoutNode.elementId` をノードごとに持つ

初版の案 A はノードごとに `elementId = id` を設定する形だった。値は常に `LayoutNode.id` と
同じで、派生した値の複製になる（TPL-1032）。結果単位のフラグに改めた。

## 比較

| 観点                      | 案 A                     | 案 B                                 | 案 C                          |
| ------------------------- | ------------------------ | ------------------------------------ | ----------------------------- |
| 症状（ノードが消える）    | 直る                     | 直る                                 | 直る                          |
| 衝突しないモデルの出力    | byte-identical           | ルートの `data-node-id` が全部変わる | byte-identical                |
| id 空間・permalink の契約 | 変えない                 | 変える（spec / ADR-425）             | 変えない（属性が 1 つ増える） |
| 同名 id のドリル          | 勝者に着く（現状維持）   | 正確                                 | 正確                          |
| 同名 id のハイライト      | DOM 順で最初（現状維持） | 正確                                 | DOM 順で最初                  |
| 変更量                    | core 小                  | core + app + spec、プログラム        | 案 A + app 中                 |

## Related TPLs

- [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md):
  区別に要る次元（ここでは system）を Map の key に含める。ADR-1884 が同じ関数の stub で
  適用済みで、ノードの merge と `markParallelBundles` の束ね key が漏れていた。3-Yes の
  3 つ目（既存 TPL 未掲載）が No なので新規 TPL は起こさず、`discovered_from` に #2917 を足す
- [TPL-2920](../test-perspectives/TPL-2920-duplicate-element-id-on-one-canvas-names-its-landing.md)
  （本 PR で起こした proactive TPL）: 1 つのキャンバスに同じ要素 id が 2 つ以上描かれる面では、
  「最初の要素を返す」API に乗る消費側の着地点を決めて記録し、テストの locator は
  `first()` / `nth()` で着地点を明示する。案 A が意図して作る状態そのものの観点。
  `docs/spec/permalink.md`（identity は id）と ADR-2818（1 属性で引く）から導いた
- [TPL-1666](../test-perspectives/TPL-1666-style-lookup-matches-layout-id-form.md):
  layout の key とノード自身の id は別の形。案 A はこの分離を結果単位のフラグとして明示する
- [TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md):
  ノードごとの `elementId` を退けた根拠
- [TPL-2818](../test-perspectives/TPL-2818-cross-view-handover-carries-receiver-id-space.md):
  ルートの `data-node-id` が bare id のままであることは、system ビューに id を手渡す
  すべての導線が前提にしている

## 現時点の方針

**案 A を採用する。** 症状は merge の key 1 つが原因で、ADR-1884 が同じ関数に既に引いた
線（生成時点で system を含む key）をノードにも当て、ループ内の 2 箇所と束ね判定を system
単位に戻せば直る。ルートの id 空間と permalink の契約は変えず、衝突しないモデルは
byte-identical に保つ。同名 id のナビゲーションは今と同じ 2 つの着地点（ドリルは index の
勝者、ハイライトは DOM 順の最初）のままで、`node-id-multiple-locations` がその状態を
作者に伝えている。正確なドリル（案 C）と identity の path 化（案 B）は別 Issue に切る。

### 実装の指針

1. **core / layout-types**: `LayoutResult` に `nodeIdentity?: "key"` を足す。docstring に
   「要素の id（`data-node-id` と per-node lookup）を Map の key から取る結果。未設定なら
   `LayoutNode.id`。deploy が `<container>::<unit>` の key を identity に使うために設定する。
   multi-system ルートは key を system で scope するので設定しない」と書く。
   `deploy-layout.ts` の結果に `nodeIdentity: "key"` を設定する
2. **core / svg-renderer**: ノードのループ（描画と chip zone の 2 箇所）で
   `elementId` を上記のとおり取り、`data-node-id`・style の key・`serviceIdsWithDeploy`・
   `childLevelLinks`・facet・chip zone・diff の lookup にそれを渡す。`resolveNodeStyle` の
   第 4 引数（`layoutNode.id`）はそのまま
3. **core / layout**: `layoutMultipleSystems` で (a) `placeExternalServicesOnSides` と
   `computeEdgePoints` に `localNodes` を渡す、(b) merge を scoped key にする、
   (c) `markParallelBundles` を system ごと（ループ内、`localNodes`）と cross-system edge の
   source system ごと（ループ後）に呼ぶ、(d) cross-system 端点を scoped key と
   `uniqueByBareId` で引く
4. **テスト（core）**: Issue のモデル（`Api -> Worker` 付き）で (a) `data-node-id="Api"` が
   2 回出る、(b) それぞれが `Shop` / `Admin` の枠の矩形の中に置かれる、(c) `Worker` は 1 回、
   (d) `Api -> Worker` の始点が `Shop` の `Api` の矩形上にある、(e) 同じモデルの
   `viewPath: ["Shop"]` と枠内のノード数が一致する。byte-identical の fence は既存の
   multi-system テスト（`expand-render.test.ts` / `routing-parity.test.ts` / `layout.test.ts`）
   がそのまま担う
5. **テスト（core / 束ねと側面配置）**: 2 system が同じ `Api -> Worker` を持つとき、2 本の edge が
   `bundleSize` を持たない（別々の system で束ねない）。2 system が同名の `@external`
   service を持つとき、それぞれが自 system の枠の側面に置かれ、前の system のノードが
   後の system の bbox に入らない
6. **テスト（core / cross-system edge）**: `Shop.Api -> Admin.Api` が正しい矩形から出て
   正しい矩形に着く。compare mode で before slice にだけある cross-system edge が、同名 id を
   持たないモデルでは今までどおり描かれる（既存 fence があればそれを参照）
7. **AT**: `docs/acceptance/2917-multi-system-root-same-id-nodes.md`。AC は (1) 両方描かれる、
   (2) 枠の中に置かれる、(3) 衝突しないモデルは変わらない（既存 fence を参照）、(4) 束ねと
   側面配置、(5) cross-system edge の端点、(6) 同名 id の着地点（ドリルは index の勝者、
   ハイライトは DOM 順の最初）を**仕様として**明記する。手動項目は `N/A`
8. **TPL**: TPL-1352 の `discovered_from` に `#2917` を足し、「既知の対処パターン」に
   ADR-1884 と本件の scoped key を 1 行足す。TPL-2920 の「関連テスト」に 4〜6 の fence を
   足す
9. **changeset**: `@karasu-tools/core` と `karasu` に patch
10. **follow-up Issue**: 案 C（`data-node-path` で正確なドリル。ADR-2818 の A-2 も含む）を
    起票し、ADR に記録する
11. **ADR 昇格**: `docs/adr/2917-multi-system-root-same-id-nodes.md` に昇格し、本 doc は
    同 PR で削除する。ADR-1884 の `related_to` に足す

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 同名 id を持たないモデルは変わらない。持つモデルは、ルートビューで
  消えていたノードが描かれ、その system の edge がそのノードから出るようになる。同名ノードへの
  ドリルは `nodePathIndex` の勝者、ハイライトとアウトラインは DOM 順で最初の要素に着く
  （今と同じ）
- ドキュメント更新: `docs/spec/diagnostics.md` の `node-id-multiple-locations` の説明に
  「ルートビューは両方描く。ドリルは勝者、ハイライトは最初の要素」を足す（spec の変更なので
  `.claude/rules/spec-audit.md` に従い TPL-2920 を back-ref する）
- テスト・examples への影響: `examples/` に同名 id を持つモデルは無い（全 `.krs` を
  compile して `node-id-multiple-locations` が 0 件であることを確認した）。E2E の既存 spec も
  同名 id のモデルを持たないので strict locator は影響を受けない

## 未解決の問い / 決めないこと

- **決めないこと**: 案 B（ルートの identity を path にする）と案 C（`data-node-path`）。
  どちらも別 Issue。案 C は ADR-2818 の A-2 と同じ Issue にまとめるのがよい
- レビューで確認したいこと: 同名 id の 2 つの着地点（ドリル = index の勝者、ハイライト =
  DOM 順の最初）を仕様として受け入れてよいか。揃えるなら案 C の Issue で扱う
