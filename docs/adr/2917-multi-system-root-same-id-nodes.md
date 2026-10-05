---
id: ADR-2917
title: 複数 system のルートビューは同名ノードを両方描き、要素の id は bare id のまま、着地は path で決める
status: accepted
date: 2026-09-28
topic: renderer
authors: [kompiro]
depends_on:
  - ADR-1884
  - ADR-2714
related_to:
  - ADR-425
  - ADR-2088
  - ADR-2521
  - ADR-2818
scope:
  packages: [core, app, vscode]
assumptions:
  - "symbol: packages/core/src/renderer/layout-types.ts :: nodeIdentity"
  - "grep: packages/core/src/renderer/layout.ts :: allLayoutNodes\\.set\\(nodePathIdentityKey\\(\\[sys\\.id, id\\]\\), node\\)"
  - "grep: packages/core/src/renderer/svg-renderer.ts :: data-node-path"
  - "symbol: packages/core/src/parser/node-path.ts :: parseNodePathRefId"
  - "symbol: packages/core/src/compile/compile.ts :: nodeMetadataByPath"
  - "grep: packages/app/src/components/PreviewPane.tsx :: data-node-path"
  - "symbol: packages/vscode/src/message-validation.ts :: isOptionalNodePath"
  - "file: packages/vscode-e2e/tests/webview/at-2917-same-id-drill.test.ts"
  - "file: docs/acceptance/2917-multi-system-root-same-id-nodes.md"
  - "file: docs/test-perspectives/TPL-2920-duplicate-element-id-on-one-canvas-names-its-landing.md"
---

# ADR-2917: 複数 system のルートビューは同名ノードを両方描き、要素の id は bare id のまま、着地は path で決める

- **日付**: 2026-09-28
- **ステータス**: 決定済み・実装完了
- **関連**:
  - Issue: [#2917](https://github.com/kompiro/karasu/issues/2917)（#2818 の SVG を測っているときに見つけた。[ADR-2818](2818-cross-navigation-highlight-id-space.md) の「残課題」）
  - PR: [#2920](https://github.com/kompiro/karasu/pull/2920)（Design Doc）, [#2947](https://github.com/kompiro/karasu/pull/2947)（実装）
  - 本設計の再点検で切り出した Issue: [#2933](https://github.com/kompiro/karasu/issues/2933)（静的バンドルの重複レベル id）, [#2934](https://github.com/kompiro/karasu/issues/2934)（bare id をキーにした per-node Map の勝者不一致）, [#2935](https://github.com/kompiro/karasu/issues/2935)（残りの hand-over を path で運ぶ。ADR-2818 A-2 を含む）
  - 前提 ADR: [ADR-1884](1884-group-by-team-multi-system-root-per-system-frames.md)（同じ関数で collapse stub の id を system で namespace した前例）, [ADR-2714](2714-deploy-container-id-injective.md)（identity と突き合わせ用 id を分ける前例。`nodePathRefId` の出どころ）
  - 関連 ADR: [ADR-2521](2521-multi-system-pipeline-convergence.md)（multi-system ルートは single-system の計算に合わせる）, [ADR-2088](2088-node-reference-path-notation.md)（参照は path 記法。bare id の多重一致は意図的 broadcast）, [ADR-2818](2818-cross-navigation-highlight-id-space.md)（ハイライトは 1 属性でノード id を引く）
  - 関連 spec: `docs/spec/syntax.md`「When to use path syntax」（同じ id が複数 system にあるのが path 記法の典型）, `docs/spec/style.md`「Scoped boundaries」（無修飾は全 scope に一致し、修飾形は後から足せる）, `docs/spec/permalink.md`（identity は id、anchor 文法に system の段は無い）, `docs/spec/diagnostics.md`（`node-id-multiple-locations` に本 ADR の挙動を追記）
  - 関連 TPL: [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)（区別に要る次元をキーに含める。`discovered_from` に #2917）, [TPL-2920](../test-perspectives/TPL-2920-duplicate-element-id-on-one-canvas-names-its-landing.md)（本件で起こした proactive TPL）, [TPL-1583](../test-perspectives/TPL-1583-migration-priority-index-winner.md), [TPL-1666](../test-perspectives/TPL-1666-style-lookup-matches-layout-id-form.md), [TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md), [TPL-2818](../test-perspectives/TPL-2818-cross-view-handover-carries-receiver-id-space.md)
  - AT: [AT-2917](../acceptance/2917-multi-system-root-same-id-nodes.md)
  - 設計（本 ADR に集約し削除）: `docs/design/multi-system-root-same-id-nodes.md`

## 背景

2 つの system が同じ bare id の service を持つモデル（`Shop.Api` と `Admin.Api`）のルート
ビューは、その id のノードを 1 つしか描かなかった。`layoutMultipleSystems` が system ごとの
`localNodes`（bare id が key）を `allLayoutNodes.set(id, node)` と bare id のまま 1 つの Map に
畳むので、後の system の `Api` が前の system の `Api` を上書きし、`Shop` の枠には `Worker`
だけが残って `Api -> Worker` の線は何も無い場所から出ていた。同じ関数の collapse stub は
ADR-1884 が system id を key に含めて同じ上書きを防いでおり、ノードだけが残っていた。

言語側は同名 id を許容する設計である。`docs/spec/syntax.md` は「同じ id が複数 system に
あるのが path 記法の典型（system 移行）」と書き、ADR-2088 は「(kind, 深さ) の揃った多重一致は
意図的 broadcast として沈黙する」と決めている。モデルにあるノードを描かないことのほうが
仕様に反する。

描画を直すだけでは足りないことが、設計の再点検で分かった。bare id で引く消費側を app /
VS Code / e2e / LSP まで全件洗うと、クラッシュも一意性の assert も無い代わりに、**どの消費側
もそれぞれ別の規則で 1 つを選んでいた**:

| 消費側                                                              | 規則                                                     |
| ------------------------------------------------------------------- | -------------------------------------------------------- |
| SPA のドリル（`nodeMetadata.get(id).viewPath` = `nodePathIndex`）   | 勝者（`@migration_target` 優先、同点は宣言順。TPL-1583） |
| 静的 SVG のドリル（`resolveContainerChain`）                        | 最初の所有 system（勝者規則とは別。#2933）               |
| ハイライト・アウトライン・VS Code のカーソル追従（`querySelector`） | DOM 順で最初                                             |
| エディタへジャンプ・LSP `findRangeOfNode`・`nodeFileIndex`          | 走査順で最初                                             |
| `nodeMetadata`（詳細パネル・hover）・style                          | last write（後の system）                                |
| facet リング                                                        | bare id の union                                         |
| diff 状態・draw.io の `cellId`                                      | bare id で 1 エントリ                                    |

今日の唯一のカード（`Admin` の位置）はクリックすると詳細パネルは `Admin`、ドリルは `Shop`
という不整合を既に持っていた。描画を直して 2 枚目のカードを出すと、その不整合が「クリック
すると別の system に潜るカード」として目に見える。描画の修正と、クリックの着地を正確にする
手段を同じ変更で入れる理由はここにある。静的バンドルの重複レベル（`<g id="krs-system-Api">`
が 2 つ、どちらも最初の所有 system の内容）は別の producer の既存バグとして #2933 に、bare id
をキーにした per-node Map の勝者不一致（TPL-1583 違反）は #2934 に切り出した。

## 決定

**merge の key を system で scope して同名ノードを両方描き、要素の id（`data-node-id`）は bare id
のまま、各ノードカードに `data-node-path` を出して app / VS Code のドリルと詳細パネルはそれで
自分のノードに着く。**

1. **merge の key**: `layoutMultipleSystems` は `allLayoutNodes.set(nodePathIdentityKey([sys.id, id]), node)`
   と (system, id) で畳む（ADR-1884 の stub と同じく生成時点で一意。衝突の有無で key を変える
   案は ADR-2714 と同じ理由で採らない）。ループ内で蓄積中の Map を受け取っていた
   `placeExternalServicesOnSides` と `computeEdgePoints` にはその system の `localNodes` を渡し、
   `markParallelBundles` は system ごと（cross-system edge は source system ごと）に呼ぶ。
   cross-system edge の端点は scoped key で引き、source system が不明な compare mode の
   removed edge だけ「bare id がルート全体で 1 つのときに限り返す」`uniqueByBareId` に落とす。
   collapsed stub へ再ターゲットされた edge の dedupe identity は source system を含む。
2. **要素の id**: renderer は `LayoutResult.nodeIdentity === "key"` のときだけ Map の key を要素の
   id にし（deploy layout が設定する。`<container>::<unit>` が identity）、それ以外は
   `LayoutNode.id`（bare id）を `data-node-id` と per-node lookup に使う。ルートの id 空間、
   permalink・hash・アウトラインの契約は変えない。
3. **`data-node-path`**: layout は実 canvas ノードに `LayoutNode.path`（canvas scope + id。in-place
   展開で置かれた domain は展開元 service を挟む `Shop.Api.Orders`）を設定し、renderer は論理
   ビューの全レベルで `data-node-path={nodePathRefId(path)}` を出す。ghost と合成 stub は持たない。
   テキスト形は ADR-2714 の `nodePathRefId`（deploy コンテナの `serviceId` と同じ）で、逆変換
   `parseNodePathRefId` を core が持つ。
4. **消費側**: `CompileResult.nodeMetadataByPath`（key は `nodePathRefId(path)`、`viewPath` はその
   path そのもの）を足し、app の `PreviewPane` と VS Code webview の click delegation はカードの
   `data-node-path` を先に読んでドリルと詳細パネルを解決する。VS Code の `drillDown` message は
   `nodePath` を運び、host は canonical 形の round-trip 検査を通ったものだけ受理する。
   bare id の `nodeMetadata` は互換のため変えない（last write のまま。#2934）。
5. **仕様として書く着地点**: ハイライト・アウトライン・permalink・エディタへジャンプは bare id
   だけを運ぶので、DOM 順で最初の要素 / `nodePathIndex` の勝者に着く。AT-2917 AC-8 と
   `docs/spec/diagnostics.md` の `node-id-multiple-locations` に明記し、path 化は #2935。

## 理由

- **bare id は集合を指す。1 ノードを指したい消費側は path を持つ。** ADR-2088 の解決規則
  （接尾辞一致、揃った多重一致は broadcast）と `docs/spec/style.md` の「無修飾は全 scope に
  一致、修飾形は後から足せる」に揃える読み方。この読み方では同一 canvas に `data-node-id` が
  複数あることは矛盾ではなく、1 ノードを指す属性が別に要るという意味になる。
- **key と要素の id を分ける構造は deploy ビューが既に持っていた**（TPL-1666）。結果単位の
  `nodeIdentity` フラグで明示するだけで、ノードごとに同じ値を複製するフィールドは要らない
  （TPL-1032）。
- **衝突しないモデルのレイアウトは byte-identical に保てる**（ADR-2521 の並列性の前提）。
  変わるのは SVG テキストに `data-node-path` が 1 属性増えることだけで、既存の multi-system
  fence はそのまま通る。
- **`data-node-path` は全論理ビューで出す。** ルートだけに出すと click delegation が「属性が無い
  ときは index の勝者」という 2 本目の規則を持ち続け、TPL-2818 の「hand-over は 1 つの id 空間」
  に反する。single-system の深いレベルで同名 domain が 2 つある場合も同じ理由で直る。
- **A（描画）と C（path）を同じ変更で入れる。** A だけを出荷すると「クリックすると別 system に
  潜るカード」が目に見える形で増える。

## 却下した案

- **案 B: ルートの要素 identity を `<system>::<id>` にする**: DOM で一意になりドリル・ハイライト・
  permalink をノードごとに正確にできるが、bare id を読む消費側すべて（app の drill・アウトライン・
  ハイライト・D ボタン・静的 SVG の drill link・permalink の grammar）が同時に変わり、
  `docs/spec/permalink.md` と ADR-425 の契約変更を含む。ルートビューが 1 system のときは bare の
  ままなので system 数で id 空間が変わる。Issue 1 件のバグ修正で持てる範囲ではなく、ADR-2088 の
  延長のプログラムとして切るべき。
- **案 D: 描かないまま、枠に「同名のため非表示」と示す**: モデルに存在するノードを描かない理由に
  ならない。
- **`LayoutNode.elementId` をノードごとに持つ**: 値は常に `LayoutNode.id` と同じで、派生した値の
  複製になる（TPL-1032）。結果単位のフラグに改めた。
- **`data-node-path` をルートビューだけに出す**: 上の理由のとおり 2 本目の規則が残る。
- **衝突したときだけ key を scope する**: ADR-2714 が「衝突の有無で id が変わる」として却下した形と
  同じで、Map の中身がモデルの他の部分に依存する。

## 影響

- 同名 id を持たないモデルは、論理ビューの各実ノードカードに `data-node-path` が付く以外
  変わらない（座標・他の属性は不変）。同名 id を持つモデルは、ルートビューで消えていたノードが
  描かれ、その system の edge がそのノードから出て、どちらのカードもクリックで自分の system に
  潜り自分の metadata を出す。
- `examples/` に同名 id を持つモデルは無い。ガイドの生成 SVG（`docs/guide/diagrams/`）は属性追加で
  再生成した。
- 残課題は #2933 / #2934 / #2935。
