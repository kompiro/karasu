# 複数 system のルートビューは、同名ノードを両方描き、要素の id は bare id のまま保つ

- **日付**: 2026-09-27
- **ステータス**: 検討中
- **Issue**: [#2917](https://github.com/kompiro/karasu/issues/2917)
- **PR**: [#2920](https://github.com/kompiro/karasu/pull/2920)
- **関連**:
  - 引き金 Issue: [#2917](https://github.com/kompiro/karasu/issues/2917)（#2818 の SVG を測っているときに見つけた。[ADR-2818](../adr/2818-cross-navigation-highlight-id-space.md) の「残課題」）
  - 関連 ADR: [ADR-1884](../adr/1884-group-by-team-multi-system-root-per-system-frames.md)（同じ関数で collapse stub の id を system で namespace した前例）、[ADR-2521](../adr/2521-multi-system-pipeline-convergence.md)（multi-system ルートは single-system の計算に合わせる）、[ADR-2088](../adr/2088-node-reference-path-notation.md)（参照は path 記法。要素の identity を path にする案の受け皿）、[ADR-2714](../adr/2714-deploy-container-id-injective.md)（identity と突き合わせ用 id を分ける前例）、[ADR-2818](../adr/2818-cross-navigation-highlight-id-space.md)（ハイライトは 1 属性でノード id を引く）
  - 関連 TPL: [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)（区別に要る次元をキーに含める。本件はその直接の consumer で、`discovered_from` に #2917 を足す）、[TPL-1583](../test-perspectives/TPL-1583-migration-priority-index-winner.md)（1:1 index の勝者規則）、[TPL-1666](../test-perspectives/TPL-1666-style-lookup-matches-layout-id-form.md)（layout の key とノード自身の id は別の形）
  - コード:
    - `packages/core/src/renderer/layout.ts`（`layoutMultipleSystems`: system ごとの `localNodes` を `allLayoutNodes` に bare id で merge する）
    - `packages/core/src/renderer/layout-types.ts`（`LayoutNode`）
    - `packages/core/src/renderer/svg-renderer.ts`（ノードのループが Map の key を `data-node-id` と各 lookup の id に使う）
    - `packages/core/src/renderer/deploy-layout.ts`（key を `<container>::<unit>`、`id` を bare に分けている前例）
    - `packages/core/src/parser/reference-validation.ts`（`node-id-multiple-locations` と `nodePathIndex` の勝者）

## 背景・課題

2 つの system が同じ bare id の service を持つモデルのルートビューは、その id のノードを
**1 つしか描かない**。

```krs
system Shop {
  service Api {}
  service Worker {}
}

system Admin {
  service Api {}
}
```

`main`（8633b017）で `compile(src, { diagramType: "system", viewPath: [] })` を測ると、
テキストは `Shop` / `Admin` / `Api` / `Worker` の 4 つ、`data-node-id="Api"` は **1 回**、
診断は `node-id-multiple-locations`（期待どおり）。`viewPath: ["Shop"]` と `["Admin"]` では
それぞれの `Api` が描かれるので、ノードは両方存在し、消えるのはルートビューだけ。
`Admin` の枠は空のまま描かれ、読み手には「Admin には何も無い」と見える。

原因は `layoutMultipleSystems` の merge。system ごとに `localNodes`（bare id が key）で
レイアウトした結果を、`allLayoutNodes.set(id, node)` と **bare id のまま** 1 つの Map に
畳むので、後の system の `Api` が前の system の `Api` を上書きする。同じ関数の collapse
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

### merge 後に `allLayoutNodes` を引くもの

| 消費側                                                         | 引き方                                                                                        |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| cross-system edge の端点解決                                   | `allLayoutNodes.get(fromId)` / `get(toService)`、bare id（`crossSystemTargets` の `path[1]`） |
| `markParallelBundles`                                          | `allEdges` の `from` / `to`（bare）で `allLayoutNodes.get`                                    |
| `normalizeCoordinates` / `computeTotalDimensions` / 交差マーク | Map を走査するだけ（key を見ない）                                                            |
| `channelReservations` などの行ヘルパ                           | `rows` を使うが、multi-system は `rows: []` を返す                                            |
| renderer                                                       | 上記のループ                                                                                  |

edge の `from` / `to` は SVG 属性には出ない（edge は `canonicalId` で識別される）。

### 同名 id のナビゲーションは既に「勝者」に決まっている

`nodePathIndex` は id ごとに 1 つの path しか持たず（`@migration_target` 優先、同点は
宣言順。TPL-1583）、負けた宣言に `node-id-multiple-locations` が付く。app の
`nodeMetadata` はこの index から `viewPath` を引くので、ルートで `Api` をクリックすると
どちらの `Api` でも勝者（`Shop.Api`）にドリルする。静的 SVG の `childLevelLinks` も
子 id で引くので、両方のノードが `#krs-system-Api`（勝者のレベル）にリンクする。
permalink の `<id>` は author-given id（`docs/spec/permalink.md`）で、`#krs-system-Api` は
1 つのレベルしか指せない。deploy → system のハイライトは、ADR-2714 が bare id が
2 ノードに届くコンテナに `nodeId` を出さないので、この形では最初から光らない。

つまり同名 id の**ナビゲーション**の曖昧さは、描画とは別に、warning 付きで受け入れられて
いる状態にある。本 Issue が壊しているのは描画だけ。

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
- 対象外: ルートの要素 identity を path にする（ADR-2088 の延長、案 B）、同名 id の
  ドリル先を正確にする（案 C。ADR-2818 の A-2 の受け皿でもある）、system の枠の中で
  ノードの id を表示上区別する UI

## 検討した選択肢

### 案 A: merge の key を system で scope し、要素の id は bare のまま出す

`layoutMultipleSystems` の merge を `allLayoutNodes.set(scopedKey(sys.id, id), node)` に
する（scoped key は `nodePathIdentityKey([sys.id, id])`。ADR-1884 の stub と同じく
生成時点で一意）。renderer は Map の key ではなく**要素の id**を `data-node-id` と各 lookup
に使えるようにする: `LayoutNode` に `elementId?: string` を足し、renderer のループは
`layoutNode.elementId ?? nodeId` を「ノードの id」として使う。multi-system ルートだけが
`elementId = id`（bare）を設定し、single-system と deploy は今までどおり key を使う
（byte-identical）。

merge 後に bare id で `allLayoutNodes` を引く 2 箇所は次のようにする。

- cross-system edge の端点: 端点の system は `crossSystemSource` / `targetPath[0]` で
  分かるので、scoped key で引く
- `markParallelBundles`: bare id → ノードの lookup を「その bare id がルート全体で
  1 つのときだけ返す」map に置き換える。衝突していない id の結果は今と同じで、衝突した id
  に触れる edge は束ね判定から外れる（今は上書き後の別 system のノードを見ていたので、
  外れる方が正しい）

**メリット**

- Issue の症状（枠が空になる）が消え、`Admin` の `Api` が `Admin` の枠の中に描かれる
- ルートの id 空間・ナビゲーション・permalink の契約は一切変わらない。衝突しないモデルは
  byte-identical
- deploy ビューが既に持っている「key と `id` は別」の構造を、ルートにも同じ語彙で当てる

**デメリット**

- ルートに同じ `data-node-id` の要素が 2 つできる。app の `querySelector` は最初の要素を
  返すので、ハイライトやクリックは勝者に着く（今と同じ勝者規則。warning が負けた宣言を
  名指ししている）。DOM の `id` 属性ではないので HTML としては不正にならない
- `LayoutNode` にフィールドが 1 つ増える

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

## 比較

| 観点                      | 案 A                   | 案 B                                 | 案 C                          |
| ------------------------- | ---------------------- | ------------------------------------ | ----------------------------- |
| 症状（ノードが消える）    | 直る                   | 直る                                 | 直る                          |
| 衝突しないモデルの出力    | byte-identical         | ルートの `data-node-id` が全部変わる | byte-identical                |
| id 空間・permalink の契約 | 変えない               | 変える（spec / ADR-425）             | 変えない（属性が 1 つ増える） |
| 同名 id のドリル          | 勝者に着く（現状維持） | 正確                                 | 正確                          |
| 変更量                    | core 小                | core + app + spec、プログラム        | 案 A + app 中                 |

## Related TPLs

- [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md):
  区別に要る次元（ここでは system）を Map の key に含める。ADR-1884 が同じ関数の stub で
  適用済みで、ノードの merge だけが漏れていた。3-Yes の 3 つ目（既存 TPL 未掲載）が No
  なので新規 TPL は起こさず、`discovered_from` に #2917 を足す
- [TPL-1666](../test-perspectives/TPL-1666-style-lookup-matches-layout-id-form.md):
  layout の key とノード自身の id は別の形。案 A はこの分離を renderer の「要素の id」
  として明示する
- [TPL-2818](../test-perspectives/TPL-2818-cross-view-handover-carries-receiver-id-space.md):
  ルートの `data-node-id` が bare id のままであることは、system ビューに id を手渡す
  すべての導線が前提にしている

## 現時点の方針

**案 A を採用する。** 症状は merge の key 1 つが原因で、ADR-1884 が同じ関数に既に引いた
線（生成時点で system を含む key）をノードにも当てるだけで直る。ルートの id 空間と
permalink の契約は変えず、衝突しないモデルは byte-identical に保つ。同名 id の
ナビゲーションが勝者に着くのは今と同じで、`node-id-multiple-locations` がその状態を
作者に伝えている。正確なドリル（案 C）と identity の path 化（案 B）は別 Issue に切る。

### 実装の指針

1. **core / layout-types**: `LayoutNode` に `elementId?: string` を足す。docstring に
   「Map の key と別に、`data-node-id` と per-node lookup に使う id。multi-system ルートが
   key を system で scope したときに bare id を保つために設定する。未設定なら key」と書く
2. **core / layout**: `layoutMultipleSystems` の merge を scoped key にし、各ノードに
   `elementId = id` を設定する。cross-system edge の端点解決を scoped key で引く。
   `markParallelBundles` に渡す lookup を「bare id がルート全体で一意なときだけ返す」map に
   する
3. **core / svg-renderer**: ノードのループ（描画と chip zone の 2 箇所）で
   `const elementId = layoutNode.elementId ?? nodeId` を取り、`data-node-id`・style の key・
   `serviceIdsWithDeploy`・`childLevelLinks`・facet・chip zone・diff の lookup にそれを渡す。
   `resolveNodeStyle` の第 4 引数（`layoutNode.id`）はそのまま
4. **テスト（core）**: `layout.test.ts` か `svg-renderer.test.ts` に、Issue のモデルで
   (a) `data-node-id="Api"` が 2 回出る、(b) それぞれが `Shop` / `Admin` の枠の矩形の中に
   置かれる、(c) `Worker` は 1 回、(d) 同じモデルの `viewPath: ["Admin"]` と枠内のノード数が
   一致する、を見る fence。byte-identical の fence は既存の multi-system テスト
   （`expand-render.test.ts` / `routing-parity.test.ts` / `layout.test.ts`）がそのまま担う
5. **テスト（core / cross-system edge）**: 同名 id を持つ 2 system 間の cross-system edge
   （`Shop.Api -> Admin.Api`）が、正しい system の矩形から出て正しい矩形に着くことを見る
6. **AT**: `docs/acceptance/2917-multi-system-root-same-id-nodes.md`。AC は (1) 両方描かれる、
   (2) 枠の中に置かれる、(3) 衝突しないモデルは変わらない（既存 fence を参照）、
   (4) cross-system edge の端点。手動項目は `N/A`
7. **TPL**: TPL-1352 の `discovered_from` に `#2917` を足し、「既知の対処パターン」に
   ADR-1884 と本件の scoped key を 1 行足す
8. **changeset**: `@karasu-tools/core` と `karasu` に patch
9. **follow-up Issue**: 案 C（`data-node-path` で正確なドリル。ADR-2818 の A-2 も含む）を
   起票し、ADR に記録する
10. **ADR 昇格**: `docs/adr/2917-multi-system-root-same-id-nodes.md` に昇格し、本 doc は
    同 PR で削除する。ADR-1884 の `related_to` に足す

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 同名 id を持たないモデルは変わらない。持つモデルは、ルートビューで
  消えていたノードが描かれるようになる。同名ノードへのクリック・ハイライト・permalink は
  今までどおり `nodePathIndex` の勝者に着く
- ドキュメント更新: `docs/spec/diagnostics.md` の `node-id-multiple-locations` の説明に
  「ルートビューは両方描く。ナビゲーションは勝者」を 1 文足す（spec の変更なので
  `.claude/rules/spec-audit.md` に従い TPL-1352 を back-ref する）
- テスト・examples への影響: `examples/` に同名 id を持つモデルは無い（`node-id-multiple-locations`
  が examples の drift ガードで出ていないことから）

## 未解決の問い / 決めないこと

- **決めないこと**: 案 B（ルートの identity を path にする）と案 C（`data-node-path`）。
  どちらも別 Issue。案 C は ADR-2818 の A-2 と同じ Issue にまとめるのがよい
- レビューで確認したいこと: `LayoutNode` の新フィールド名 `elementId`。「SVG 要素に載る id」
  の意味で選んだが、`domId` / `svgId` の方が読みやすければ変える
