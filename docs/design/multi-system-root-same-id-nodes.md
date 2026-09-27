# 複数 system のルートビューは同名ノードを両方描き、要素の id は bare id のまま、着地は path で決める

- **日付**: 2026-09-27
- **ステータス**: 検討中
- **Issue**: [#2917](https://github.com/kompiro/karasu/issues/2917)
- **PR**: [#2920](https://github.com/kompiro/karasu/pull/2920)
- **関連**:
  - 引き金 Issue: [#2917](https://github.com/kompiro/karasu/issues/2917)（#2818 の SVG を測っているときに見つけた。[ADR-2818](../adr/2818-cross-navigation-highlight-id-space.md) の「残課題」）
  - 本 doc の再点検で切り出した Issue: [#2933](https://github.com/kompiro/karasu/issues/2933)（静的バンドルの重複レベル id）、[#2934](https://github.com/kompiro/karasu/issues/2934)（bare id をキーにした per-node Map の勝者不一致）、[#2935](https://github.com/kompiro/karasu/issues/2935)（残りの hand-over を path で運ぶ。ADR-2818 A-2 を含む）
  - 関連 ADR: [ADR-1884](../adr/1884-group-by-team-multi-system-root-per-system-frames.md)（同じ関数で collapse stub の id を system で namespace した前例）、[ADR-2521](../adr/2521-multi-system-pipeline-convergence.md)（multi-system ルートは single-system の計算に合わせる）、[ADR-2088](../adr/2088-node-reference-path-notation.md)（参照は path 記法。bare id の多重一致は意図的 broadcast）、[ADR-2714](../adr/2714-deploy-container-id-injective.md)（identity と突き合わせ用 id を分ける前例。`nodePathRefId` の出どころ）、[ADR-2818](../adr/2818-cross-navigation-highlight-id-space.md)（ハイライトは 1 属性でノード id を引く）
  - 関連 spec: [`docs/spec/syntax.md`「When to use path syntax」](../spec/syntax.md#when-to-use-path-syntax)（同じ id が複数 system にあるのが path 記法の典型）、[`docs/spec/style.md`「Scoped boundaries」](../spec/style.md)（無修飾は全 scope に一致し、修飾形は後から足せる）、[`docs/spec/permalink.md`](../spec/permalink.md)（identity は id、anchor 文法に system の段は無い）
  - 関連 TPL: [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)（区別に要る次元をキーに含める。本件はその直接の consumer で、`discovered_from` に #2917 を足す）、[TPL-2920](../test-perspectives/TPL-2920-duplicate-element-id-on-one-canvas-names-its-landing.md)（本 PR で起こした proactive TPL）、[TPL-1583](../test-perspectives/TPL-1583-migration-priority-index-winner.md)（1:1 index の勝者規則）、[TPL-1666](../test-perspectives/TPL-1666-style-lookup-matches-layout-id-form.md)（layout の key とノード自身の id は別の形）、[TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)（派生した値を別フィールドに複製しない）、[TPL-2818](../test-perspectives/TPL-2818-cross-view-handover-carries-receiver-id-space.md)（hand-over は受け手の id 空間で運ぶ）
  - コード:
    - `packages/core/src/renderer/layout.ts`（`layoutMultipleSystems`: system ごとの `localNodes` を `allLayoutNodes` に bare id で merge する）
    - `packages/core/src/renderer/layout-types.ts`（`LayoutNode` / `LayoutResult`）
    - `packages/core/src/renderer/svg-renderer.ts`（ノードのループが Map の key を `data-node-id` と各 lookup の id に使う）
    - `packages/core/src/renderer/deploy-layout.ts`（key を `<container>::<unit>`、`id` を bare に分けている前例）
    - `packages/core/src/renderer/external-columns.ts`（`placeExternalServicesOnSides`。ループ内で蓄積中の Map を受け取る）
    - `packages/core/src/renderer/layout-edges.ts`（`computeEdgePoints`。ループ内で蓄積中の Map を受け取る）
    - `packages/core/src/renderer/edge-routing-bundles.ts`（`markParallelBundles`。`${from}->${to}` で束ねる）
    - `packages/core/src/parser/node-path.ts`（`nodePathKey` / `nodePathIdentityKey` / `nodePathRefId`）
    - `packages/core/src/parser/reference-validation.ts`（`node-id-multiple-locations` と `nodePathIndex` の勝者）
    - `packages/core/src/compile/compile.ts`（`buildNodeMetadata`。`addNode(node, pathPrefix)` は full path を知っている）
    - `packages/core/src/view/view-extract.ts`（`resolveContainerChain`。system 接頭辞の無い path を最初の所有 system で解決する）
    - `packages/app/src/components/PreviewPane.tsx`（click delegation。ドリルは `nodeMetadata.get(id)?.viewPath`、詳細パネルは `nodeMetadata.get(id)`）
    - `packages/vscode/src/webview-content.ts` / `preview-panel.ts` / `drilldown-state.ts`（同じ流れを message 越しに行う）

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

言語側は同名 id を許容する設計である。`docs/spec/syntax.md` は「同じ id が複数 system に
あるのが path 記法の典型（system 移行）」と書き、ADR-2088 は「(kind, 深さ) の揃った多重
一致は意図的 broadcast として沈黙する」と決めている。モデルにあるノードを描かないことの
ほうが仕様に反する。

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
key と同じ値。ノードの `<g>` に `id=` 属性は無い（測定で 0 件）ので、重複しうるのは
`data-*` 属性だけで、HTML / SVG の id 一意性には触れない。

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

edge の `from` / `to` は `edge-routing.ts` が `data-edge-from` / `data-edge-to` として SVG に
出し、app の `PreviewPane` が edge の詳細パネルとラベルにそれを読む（識別は `canonicalId`）。
**scoped key はノードの内部 lookup にだけ使い、`LayoutEdge.from` / `to` は bare id のまま**
出す。

### 同名 id の消費側は、すでにそれぞれ別のノードを指している

bare id で引く消費側を app / VS Code / e2e / LSP まで全件洗った（PR #2920 のレビュー中）。
クラッシュも一意性の assert も無い。代わりに、**どの消費側もそれぞれ別の規則で 1 つを
選んでいる**。同名の `Api` が `Shop`（先に宣言）と `Admin` にある場合:

| 消費側                                                                                  | 規則                                                     | `Admin` の `Api` に対して返るもの |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------- |
| SPA のドリル（`nodeMetadata.get(id).viewPath` = `nodePathIndex`）                       | 勝者（`@migration_target` 優先、同点は宣言順。TPL-1583） | `Shop.Api` に潜る                 |
| 静的 SVG のドリル（`resolveContainerChain`、`view-extract.ts`）                         | **最初の所有 system**（勝者規則とは別）                  | `Shop.Api`                        |
| ハイライト・アウトライン・VS Code のカーソル追従（`querySelector('[data-node-id=…]')`） | DOM 順で最初                                             | `Shop` の要素が光る               |
| エディタへジャンプ（`find-node-line.ts`）・LSP `findRangeOfNode`・`nodeFileIndex`       | 走査順で最初                                             | `Shop` の宣言へ                   |
| `nodeMetadata`（詳細パネル・hover）・style（`nodeStyles` / `layoutHints`）              | **last write**（後の system）                            | `Admin` の情報                    |
| facet リング（`facetIndex`）                                                            | bare id の **union**                                     | 両ノードの facet                  |
| diff 状態・annotation diff・draw.io の `cellId`                                         | bare id で 1 エントリ                                    | 同じ状態 / 重複 cell              |

つまり今日の唯一のカード（`Admin` の位置に描かれる）は、クリックすると詳細パネルは
`Admin`、ドリルは `Shop` という不整合をすでに持っている。同名 id のナビゲーションの
曖昧さは `node-id-multiple-locations` 付きで受け入れられているが、**着地点の規則は 1 つ
ではない**（TPL-1583 が要求する「全 index で同じ勝者」を、`nodeMetadata` の last write と
`nodeFileIndex` の first は満たしていない。[#2934](https://github.com/kompiro/karasu/issues/2934)）。

静的バンドルはさらに、同名の drillable 子ノードごとに `path: ["Api"]` で再帰するので、
`<g id="krs-system-Api">` を **2 つ**出し（本物の重複 id）、どちらも最初の所有 system の
内容になる（Issue のモデルで測ると 2 レベルとも `Orders` を含み `Users` を含まない。
`Admin.Api` のレベルには到達できない）。本件とは別の producer の既存バグとして
[#2933](https://github.com/kompiro/karasu/issues/2933) に切り出した。

本 Issue が壊しているのは描画だが、描画を直して 2 枚目のカードを出すと、上の不整合が
「クリックすると別の system に潜るカード」として目に見える。描画の修正（案 A）と、
クリックの着地を正確にする手段（案 C）を同じ変更で入れる理由はここにある。

## 制約・前提

- **ルートビューの `data-node-id` は bare id のまま。** app の click delegation・
  アウトライン・ハイライト（ADR-2818: system ビューは `data-node-id` を引く）・D ボタン
  （`serviceIdsWithDeploy.has(id)`）・静的 SVG の drill link・permalink（`#krs-system-<id>`）
  のすべてが bare id を読む。ここを変えるのは別のプログラム（案 B）
- **bare id は集合を指し、1 ノードを指したい消費側は path を持つ。** ADR-2088 の解決規則
  （接尾辞一致、揃った多重一致は broadcast）と `docs/spec/style.md` の「無修飾は全 scope に
  一致、修飾形は後から足せる」に揃える。`data-node-id` が同一 canvas に複数あることは、
  この読み方では矛盾ではなく、1 ノードを指す属性が別に要るという意味になる
- **修飾も衝突も無いモデルのレイアウトは byte-identical に保つ**（ADR-2521 の並列性の
  前提。single-system の配置計算は触らない）。SVG テキストは、論理ビューの全ノードカードに
  `data-node-path` が 1 つ増える分だけ変わる（属性の追加のみ。座標・順序・他の属性は不変）
- **key の scope は無条件にする。** 衝突したときだけ key を変える案は、ADR-2714 が
  「衝突の有無で id が変わる」として却下した形と同じで、Map の中身がモデルの他の部分に
  依存する
- **`LayoutEdge.from` / `to` は bare id のまま。** `data-edge-from` / `data-edge-to` として SVG に
  出て app が読むので、scope はノードの Map の key にとどめ、edge の端点フィールドには及ぼさない
- **勝者規則（TPL-1583）は変えない。** `nodePathIndex` が 1:1 であることに依存する消費側
  （permalink・hash・アウトライン）はそのまま。path を持つ消費側は index を引かなくなるだけ
- **同じ値を 2 つのフィールドに持たない。** `LayoutNode.id` は既に bare id を持つので、
  同じ値の `elementId` を足すと片方だけ更新される余地ができる（TPL-1032）。`LayoutNode.path`
  は scope を足した別の情報なので、この制約には当たらない
- **path のテキスト形は 1 つ。** `nodePathRefId`（ADR-2714。`.` / `"` / `\` を含む segment だけ
  `.krs` の文字列リテラルで囲む injective な join）。deploy コンテナの `serviceId` と同じ形
  なので、将来 deploy → system の hand-over（#2935）がそのまま `data-node-path` を指せる
- 対象外: ルートの要素 identity を path にする（ADR-2088 の延長、案 B）、ハイライト・
  アウトライン・permalink・エディタへジャンプの path 化と ADR-2818 A-2（#2935）、bare id を
  キーにした style / facet / diff / draw.io / `nodeFileIndex` の勝者揃え（#2934）、静的
  バンドルの重複レベル（#2933）、system の枠の中でノードの id を表示上区別する UI

## 検討した選択肢

### 案 A: merge の key を system で scope し、要素の id は bare のまま出す

`layoutMultipleSystems` の merge を `allLayoutNodes.set(scopedKey, node)` にする
（`scopedKey = nodePathIdentityKey([sys.id, id])`。ADR-1884 の stub と同じく生成時点で一意）。
renderer には「要素の id を Map の key から取るか、`LayoutNode.id` から取るか」を
**結果単位**で伝える: `LayoutResult.nodeIdentity?: "key"` を足し、deploy layout だけが
`"key"` を設定する。renderer のループは
`const elementId = layoutResult.nodeIdentity === "key" ? nodeId : layoutNode.id` を
「ノードの id」として `data-node-id` と per-node lookup に使う。single-system の各レベルは
key と `id` が同じ値なので変わらず、deploy は `"key"` で今までどおり、ノードごとの
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
- ルートの id 空間・permalink の契約は一切変わらない
- deploy ビューが既に持っている「key と `id` は別」の構造を、結果単位のフラグとして
  明示する

**デメリット**

- ルートに同じ `data-node-id` の要素が 2 つできる。`querySelector` は DOM 順で最初の
  要素を返し、Playwright の strict locator は同じ id が 2 要素に解決すると失敗するので、
  同名 id を持つモデルの E2E は `first()` / `nth()` か `data-node-path` で着地点を明示する
  必要がある（TPL-2920）
- **単独では、2 枚目のカードのクリックが別の system に潜る**（上の表）。描画を直した
  分だけ不整合が見える形になる
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

### 案 C: 案 A に加えて、ノードカードに `data-node-path` を出し、クリックはそれで着地する

`data-node-id` は bare のまま、ノードの full path（`Admin.Api`）を別属性で持たせ、app と
VS Code の click delegation が**ドリル先と詳細パネルの metadata をその path で引く**。
`docs/spec/style.md` の「無修飾は全 scope、修飾形は後から足す」と同じ足し方で、bare の
意味を変えずに 1 ノードを指す手段を足す。

- **core / layout**: `LayoutNode.path?: readonly string[]`。実 canvas ノードにだけ layout が
  設定する。single-system の各レベルは `[...scopePath, id]`（`scopePath` は
  `ancestorChain + containerNode`。既に `canvasOwnerOf` がこの形を作っている）、
  multi-system ルートは `[sys.id, id]`（`__unassigned__` 疑似 system は `[id]`）。
  ghost と合成 stub（collapse / category）は持たない
- **core / renderer**: `path` を持つノードカードの `<g>` に
  `data-node-path={nodePathRefId(path)}` を出す。論理ビューの全レベルで同じ規則
  （受け手の id 空間は 1 つ。TPL-2818）
- **core / parser**: `parseNodePathRefId(text): string[]`（`nodePathRefId` の逆。囲まれた
  segment は `.krs` の文字列リテラル）。round-trip の property test を置く
- **core / compile**: `CompileResult.nodeMetadataByPath: Map<string, NodeMetadata>`
  （key は `nodePathRefId(path)`、`viewPath` はその path そのもの）。`buildNodeMetadata` の
  `addNode(node, pathPrefix)` は既に full path を知っているので、同じ場所で 2 つ目の Map に
  入れる。bare id の `nodeMetadata` は互換のため変えない（last write のまま。#2934）
- **app**: `PreviewPane` の click delegation は `closest("[data-node-id]")` から
  `data-node-path` も読む。ドリルは `path ? parseNodePathRefId(path) : meta?.viewPath ??
[...viewPath, id]`、詳細パネル（info / link ボタン経由も含む）は state に `nodePath` を持ち
  `nodeMetadataByPath.get(path) ?? nodeMetadata.get(id)` で引く。`nodeMetadataByPath` は
  `nodeMetadata` と同じ経路（preview context）で渡す
- **VS Code**: webview は `drillDown` message に `nodePath` を足す（無ければ今までどおり）。
  `preview-panel` は文字列検証の上で `parseNodePathRefId` して `viewPath` にし、
  `drilldown-state.drillDown` に `viewPath` を渡せる形にする。詳細パネルと hover は
  `nodeMetadataByPathMap` を `nodeMetadataMap` と並べて webview に渡し、path で先に引く。
  Cmd/Ctrl+click の `navigate`（bare id）は #2935

**メリット**

- 2 枚目のカードのクリックが自分の system に潜り、自分の metadata を出す。single-system の
  深いレベルで同名 domain が 2 つある場合（`nodePathIndex` の勝者に潜っていた）も同じ理由で
  直る
- ADR-2818 A-2（曖昧な bare id を持つコンテナからの hand-over）の受け皿がそのまま
  `data-node-path` になる（`serviceId` が同じ `nodePathRefId` 形。#2935）
- permalink・hash・アウトラインの契約は変えない

**デメリット**

- 属性が 1 つ増え、論理ビューの SVG テキストが全モデルで変わる（座標は不変。スナップショットは
  1 ファイル）
- ハイライト・アウトライン・permalink・エディタへジャンプは bare id のまま「最初の要素」に
  着く。ここは仕様として書き、#2935 で path 化する
- app / VS Code の click 経路と `CompileResult` に変更が及ぶ（core だけでは閉じない）

### 案 D: 描かないまま、枠に「同名のため非表示」と示す

正直だが、モデルに存在するノードを描かない理由にはならない。却下。

### 却下した変種: `LayoutNode.elementId` をノードごとに持つ

初版の案 A はノードごとに `elementId = id` を設定する形だった。値は常に `LayoutNode.id` と
同じで、派生した値の複製になる（TPL-1032）。結果単位のフラグに改めた。

### 却下した変種: `data-node-path` をルートビューだけに出す

衝突しないビューの SVG を変えずに済むが、受け手の属性がビューによって有ったり無かったり
すると、click delegation が「属性が無いときは index の勝者」という 2 本目の規則を持ち続ける
（TPL-2818 の「hand-over は 1 つの id 空間」に反する）。全レベルで出す。

## 比較

| 観点                               | 案 A                                  | 案 B                                 | 案 A + C（採用）                             |
| ---------------------------------- | ------------------------------------- | ------------------------------------ | -------------------------------------------- |
| 症状（ノードが消える）             | 直る                                  | 直る                                 | 直る                                         |
| 衝突しないモデルの出力             | byte-identical                        | ルートの `data-node-id` が全部変わる | レイアウト byte-identical、属性が 1 つ増える |
| id 空間・permalink の契約          | 変えない                              | 変える（spec / ADR-425）             | 変えない                                     |
| 同名 id のドリル・詳細パネル       | 勝者 / last write（カードごとに別物） | 正確                                 | 正確（path）                                 |
| 同名 id のハイライト・アウトライン | DOM 順で最初                          | 正確                                 | DOM 順で最初（#2935 で path 化）             |
| 変更量                             | core 小                               | core + app + spec、プログラム        | core 中 + app / VS Code の click 経路        |

## Related TPLs

- [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md):
  区別に要る次元（ここでは system）を Map の key に含める。ADR-1884 が同じ関数の stub で
  適用済みで、ノードの merge と `markParallelBundles` の束ね key が漏れていた。3-Yes の
  3 つ目（既存 TPL 未掲載）が No なので新規 TPL は起こさず、`discovered_from` に #2917 を足す
- [TPL-2920](../test-perspectives/TPL-2920-duplicate-element-id-on-one-canvas-names-its-landing.md)
  （本 PR で起こした proactive TPL）: 1 つのキャンバスに同じ要素 id が 2 つ以上描かれる面では、
  「最初の要素を返す」API に乗る消費側の着地点を決めて記録し、1 ノードを指したい消費側には
  path を渡す。テストの locator は `data-node-path` か `first()` / `nth()` で着地点を明示する。
  案 A が意図して作る状態と、案 C がそれに与える答えの観点
- [TPL-1583](../test-perspectives/TPL-1583-migration-priority-index-winner.md):
  1:1 index の勝者規則は全 index で揃える。`nodeMetadata`（last write）と `nodeFileIndex`
  （first）がこれに反していることを本 doc の点検で見つけた（#2934）。案 C は path を持つ
  消費側を index から外すことで、勝者規則の適用範囲を「path を持てない消費側」に絞る
- [TPL-1666](../test-perspectives/TPL-1666-style-lookup-matches-layout-id-form.md):
  layout の key とノード自身の id は別の形。案 A はこの分離を結果単位のフラグとして明示する
- [TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md):
  ノードごとの `elementId` を退けた根拠。`LayoutNode.path` は scope を足した別情報
- [TPL-2818](../test-perspectives/TPL-2818-cross-view-handover-carries-receiver-id-space.md):
  受け手の id 空間は producer が名指す。`data-node-path` を全レベルで出す理由

## 現時点の方針

**案 A + C を採用する。** 症状は merge の key 1 つが原因で、ADR-1884 が同じ関数に既に引いた
線（生成時点で system を含む key）をノードにも当て、ループ内の 2 箇所と束ね判定を system
単位に戻せば直る（A）。描画を直すと同名 id の 2 枚目のカードが現れるので、そのクリックが
自分のノードに着くように、ノードカードに `data-node-path` を出し、app / VS Code のドリルと
詳細パネルはそれで引く（C）。ルートの `data-node-id` は bare id のまま、permalink・hash・
アウトラインの契約は変えない。bare id は集合を指す（ADR-2088）という読み方で、
`data-node-id` の重複は矛盾ではなく、1 ノードを指す属性が別にある状態として仕様化する。
ハイライト・アウトライン・permalink・エディタへジャンプが「最初の要素」に着くことは
AT に仕様として書き、path 化は #2935、bare id の per-node Map の勝者揃えは #2934、
静的バンドルの重複レベルは #2933 で扱う。identity の path 化（案 B）は行わない。

### 実装の指針

1. **core / layout-types**: `LayoutResult` に `nodeIdentity?: "key"` を足す。docstring に
   「要素の id（`data-node-id` と per-node lookup）を Map の key から取る結果。未設定なら
   `LayoutNode.id`。deploy が `<container>::<unit>` の key を identity に使うために設定する。
   multi-system ルートは key を system で scope するので設定しない」と書く。
   `deploy-layout.ts` の結果に `nodeIdentity: "key"` を設定する。`LayoutNode` に
   `path?: readonly string[]` を足す（docstring: 実 canvas ノードの full path。ghost と
   合成 stub は持たない。renderer が `data-node-path` に `nodePathRefId` で出す）
2. **core / layout**: (a) single-system の `layout()` で `makeLayoutNode` に
   `[...scopePath, id]` を渡して `path` を設定する、(b) `layoutMultipleSystems` で
   `placeExternalServicesOnSides` と `computeEdgePoints` に `localNodes` を渡す、(c) merge を
   scoped key にし、`path` を `[sys.id, id]`（`__unassigned__` は `[id]`）にする、
   (d) `markParallelBundles` を system ごと（ループ内、`localNodes`）と cross-system edge の
   source system ごと（ループ後）に呼ぶ、(e) cross-system 端点を scoped key と
   `uniqueByBareId` で引く
3. **core / svg-renderer**: ノードのループ（描画と chip zone の 2 箇所）で `elementId` を
   取り、`data-node-id`・style の key・`serviceIdsWithDeploy`・`childLevelLinks`・facet・
   chip zone・diff の lookup にそれを渡す。`resolveNodeStyle` の第 4 引数（`layoutNode.id`）は
   そのまま。カードの `<g>` に `data-node-path` を足す（`path` があるときだけ）
4. **core / parser**: `parseNodePathRefId` を `node-path.ts` に足し、`nodePathRefId` との
   round-trip をテストする（bare・`.` 入り・`"` 入り・`\` 入り・空 segment）
5. **core / compile**: `nodeMetadataByPath` を `CompileResult` に足す。`addNode` で
   `nodePathRefId([...pathPrefix, id])` をキーに、`viewPath: [...pathPrefix, id]` で入れる
   （ghost は `svc.path`）。app の `result-fingerprint` にも含める
6. **app**: `PreviewPane` の click delegation とレビュー中の `openDetailPanel` に `nodePath` を
   通す。`nodeMetadataByPath` を `usePreviewContextValue` → `PreviewColumn` → `PreviewPane` に
   渡す。ドリルは path があれば `parseNodePathRefId(path)`。テストは
   `PreviewPane.test.tsx` に「同名 id の 2 枚目のカードをクリックすると自分の system に潜り、
   自分の metadata を出す」を足す
7. **VS Code**: webview の `drillDown` message に `nodePath` を足し、`message-validation` に
   文字列検証を足す。`preview-panel` は `parseNodePathRefId` で `viewPath` を作って
   `drillDown(state, nodeId, meta, viewPath?)` に渡す。webview に `nodeMetadataByPathMap` を
   渡し、詳細パネルと hover は `data-node-path` → path map → bare map の順で引く。
   `webview-content.test.ts` と `drilldown-state.test.ts` を更新する
8. **テスト（core）**: Issue のモデル（`Api -> Worker` 付き）で (a) `data-node-id="Api"` が
   2 回出る、(b) それぞれが `Shop` / `Admin` の枠の矩形の中に置かれる、(c) `Worker` は 1 回、
   (d) `Api -> Worker` の始点が `Shop` の `Api` の矩形上にある、(e) 同じモデルの
   `viewPath: ["Shop"]` と枠内のノード数が一致する、(f) 2 枚のカードの `data-node-path` が
   `Shop.Api` / `Admin.Api`、(g) `service "www.example.com"` を含む system で
   `data-node-path` が `Sys."www.example.com"` になり round-trip する。レイアウトの
   byte-identical の fence は既存の multi-system テスト（`expand-render.test.ts` /
   `routing-parity.test.ts` / `layout.test.ts`）がそのまま担い、属性追加によるスナップショットの
   更新は 1 ファイル
9. **テスト（core / 束ねと側面配置）**: 2 system が同じ `Api -> Worker` を持つとき、2 本の edge が
   `bundleSize` を持たない（別々の system で束ねない）。2 system が同名の `@external`
   service を持つとき、それぞれが自 system の枠の側面に置かれ、前の system のノードが
   後の system の bbox に入らない
10. **テスト（core / cross-system edge）**: `Shop.Api -> Admin.Api` が正しい矩形から出て
    正しい矩形に着く。compare mode で before slice にだけある cross-system edge が、同名 id を
    持たないモデルでは今までどおり描かれる（既存 fence があればそれを参照）
11. **AT**: `docs/acceptance/2917-multi-system-root-same-id-nodes.md`。AC は (1) 両方描かれる、
    (2) 枠の中に置かれる、(3) 衝突しないモデルのレイアウトは変わらない（既存 fence を参照）、
    (4) 束ねと側面配置、(5) cross-system edge の端点、(6) 全ノードカードに `data-node-path`
    （`nodePathRefId` 形、引用符付き segment を含む）、(7) app と VS Code で 2 枚目のカードの
    クリックが自分の system に潜り自分の metadata を出す（Playwright は AT-2818 と同じ
    fixture 形、VS Code webview は既存 suite に co-locate するか AT-0038 / 0039 の retry
    パターンを使う）、(8) ハイライト・アウトライン・permalink は DOM 順 / index の勝者に
    着くことを**仕様として**明記する（#2935 まで）。手動項目は `N/A`
12. **TPL**: TPL-1352 の `discovered_from` に `#2917` を足し、「既知の対処パターン」に
    ADR-1884 と本件の scoped key を 1 行足す。TPL-2920 の「関連テスト」に 8〜10 の fence を
    足す。TPL-1583 の `discovered_from` は #2934 で足す
13. **changeset**: `@karasu-tools/core` と `karasu` に patch（描画の修正と `data-node-path`）、
    `karasu-vscode` に patch（ドリルと詳細パネルの path 解決）
14. **spec**: `docs/spec/diagnostics.md` の `node-id-multiple-locations` の説明に
    「ルートビューは両方描く。クリックは `data-node-path` で自分のノードに着き、
    ハイライトと permalink は最初の要素 / index の勝者」を足す（`.claude/rules/spec-audit.md`
    に従い TPL-2920 を back-ref する）
15. **ADR 昇格**: `docs/adr/2917-multi-system-root-same-id-nodes.md` に昇格し、本 doc は
    同 PR で削除する。ADR-1884 と ADR-2818 の `related_to` に足す

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 同名 id を持たないモデルは、論理ビューの各ノードカードに
  `data-node-path` が付く以外変わらない（座標・他の属性は不変）。持つモデルは、ルートビューで
  消えていたノードが描かれ、その system の edge がそのノードから出るようになり、どちらの
  カードもクリックで自分の system に潜る。ハイライトとアウトラインは DOM 順で最初の要素、
  permalink は index の勝者に着く（今と同じ。#2935 まで）
- ドキュメント更新: 上記 14 の `docs/spec/diagnostics.md`
- テスト・examples への影響: `examples/` に同名 id を持つモデルは無い（全 `.krs` を
  compile して `node-id-multiple-locations` が 0 件であることを確認した）。E2E の既存 spec も
  同名 id のモデルを持たないので strict locator は影響を受けない。`data-node-path` の追加で
  `toContain` 系の SVG アサーションは影響を受けず、スナップショットは 1 ファイルを更新する

## 未解決の問い / 決めないこと

- **決めないこと**: 案 B（ルートの identity を path にする）。ハイライト・アウトライン・
  permalink・エディタへジャンプの path 化と ADR-2818 A-2 は #2935、bare id をキーにした
  per-node Map の勝者揃えは #2934、静的バンドルの重複レベルは #2933
- レビューで確認したいこと: `data-node-path` を論理ビューの全レベルに出す（衝突しない
  モデルの SVG テキストも変わる）ことを受け入れてよいか。ルートだけに出す変種は
  上記の理由で退けた
