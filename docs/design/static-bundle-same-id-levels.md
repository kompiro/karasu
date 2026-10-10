# 静的バンドルは同じ anchor id のレベルを 1 つだけ出し、その中身を SPA と同じ索引で決める

- **日付**: 2026-10-08
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2933](https://github.com/kompiro/karasu/issues/2933)（#2917 の設計の再点検で切り出した）
  - 関連 ADR: [ADR-2917](../adr/2917-multi-system-root-same-id-nodes.md)（同名ノードを両方描き、要素の id は bare id のまま、1 ノードを指す消費側は path を持つ。anchor 文法を path にする案 B は先送り）, [ADR-1827](../adr/1827-permalink-deep-element.md)（anchor 文法は `anchorId` 1 つ。静的 SVG と SPA の parity）, [ADR-2088](../adr/2088-node-reference-path-notation.md)（bare id は集合を指す）, [ADR-110](../adr/110-permanent-link.md)（`nodePathIndex` が bare id を path に解決する）
  - 関連 spec: `docs/spec/permalink.md`（2 つの面が同じ anchor を解決する）, `docs/spec/diagnostics.md`（`node-id-multiple-locations` の勝者規則）
  - 関連 TPL: [TPL-1827](../test-perspectives/TPL-1827-deep-link-anchor-cross-surface-parity.md), [TPL-1583](../test-perspectives/TPL-1583-migration-priority-index-winner.md), [TPL-2920](../test-perspectives/TPL-2920-duplicate-element-id-on-one-canvas-names-its-landing.md), [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md), [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)
  - コード: `packages/core/src/renderer/drill-down-svg.ts`, `packages/core/src/renderer/all-layers-svg.ts`, `packages/core/src/renderer/svg-renderer.ts`, `packages/core/src/view/view-extract.ts`（`resolveContainerChain`）

## 背景・課題

静的 SVG のドリルダウンバンドル（`buildDrillDownSvg`、all-views の `buildAllViewsSvg`）は、ルートから drillable な子をたどって 1 ノードにつき 1 つの `<g id="krs-system-<id>">` レベルを出す。anchor の `<id>` は path の最後の 1 段（bare id）なので、同じ id のノードが 2 つあるとレベルの id が重複する。さらに複数 system のルートでは、子の path を `[child.id]`（system の段なし）で組むため、`extract(["Api"])` は `resolveContainerChain` で**最初の所有 system** に解決され、後の system のノードの中身が一度も描かれない。

### 実測（main 4cf95dfc）

scratch test で `buildDrillDownSvg` / `buildAllViewsSvg` の出力からレベルごとに `data-node-id` を数え、`compile(..., { viewPath: nodePathIndex.get(id) })`（SPA が hash を解決する経路）と比べた。

**1. Issue のモデル**（`Shop.Api { domain Orders }` と `Admin.Api { domain Users }`）

| anchor              | 静的バンドル                | SPA（`nodePathIndex`）        |
| ------------------- | --------------------------- | ----------------------------- |
| `krs-system-Api`    | 2 レベル。どちらも `Orders` | `Shop.Api`（`Orders`）        |
| `krs-system-Orders` | 2 レベル。どちらも `Place`  | `Shop.Api.Orders`             |
| `krs-system-Users`  | **レベルが無い**            | `Admin.Api.Users`（`Invite`） |

Issue が挙げた `Api` の重複に加えて、**後の system の部分木全体が先の system の複製になる**。2 回目の再帰も `extract(["Api", "Orders"])` を引くので `Orders` レベルも 2 つ出て、`Users` は一度も現れない。SPA では `#krs-system-Users` が開くのに、静的バンドルでは同じ fragment がルートへ落ちる。これは TPL-1827 の「片方の面でだけ解決する permalink」そのものである。

**2. `Admin.Api` が `@migration_target` のモデル**

`nodePathIndex.get("Api")` は `["Admin", "Api"]`（勝者規則、TPL-1583）。SPA の `#krs-system-Api` は `Users` を出し、静的バンドルは 2 つのレベルのどちらも `Orders` を出す。同じ anchor が 2 つの面で別のノードに着く。

**3. single-system の深いレベル**（`Shop { service A { domain Core } service B { domain Core } }`）

複数 system に限らない。`krs-system-Core` が 2 つ出る（中身はそれぞれ `X` と `Y` で正しい）。CSS `:target` は DOM 順で最初の 1 つ（`A.Core`）を出すので、`B.Core` のレベルは要素として存在しても到達できない。同じ domain id を複数 service が持つのは `domain-dispersal`（info）が語る合法な形で、`node-id-multiple-locations` も出ない。

両方の `Core` が entity を持つと、all-views の `krs-entity-Core` も 2 つ出る（`E1` のレベルと `E2` のレベル）。entity レベルは domain を full path で walk するので中身は正しく、id だけが重複する。

**4. stacked の all-layers export**（`buildAllLayersSvg`）

anchor は持たないが、同じ path の組み方なので Issue のモデルでは `Shop › Api` の帯が 2 本出て、`Admin.Api.Users` の帯は出ない。2 本目の帯のラベルも `Shop › Api` で、`Admin` の帯であることが読めない。

**5. 参考: SPA 側の取りこぼし**（本設計の範囲外）

トップレベルの `service Api { domain Parked }` が `Shop.Api` と id を共有すると、`nodePathIndex.get("Parked")` は `["Api", "Parked"]`（system の段なし）で、SPA の `compile(..., { viewPath: ["Api", "Parked"] })` は空のビューを返す。`resolveContainerChain` が `Api` を最初の所有 system（`Shop`）で探すため。静的バンドルと同じ根の SPA 側のバグで、[#3113](https://github.com/kompiro/karasu/issues/3113) に切り出した。

### なぜ今これを決めるか

ADR-2917 は「bare id しか運ばない hand-over（ハイライト・アウトライン・permalink）は `nodePathIndex` の勝者か DOM 順で最初の要素に着く」と仕様に書き、静的バンドルの食い違いをこの Issue に送った。permalink の文法（`#krs-<view>-<id>`）は system の段を持たないので、直すには「重複をやめて勝者 1 つにする」か「文法を拡張する」かを決める必要がある。

## 現状（インベントリ）

| 生成器                                           | 場所                | 子の path                                           | 重複の扱い                                       |
| ------------------------------------------------ | ------------------- | --------------------------------------------------- | ------------------------------------------------ |
| `buildDrillDownSvg`（system）                    | `drill-down-svg.ts` | ルートでは `[child.id]`、以下 `[...path, child.id]` | なし（全部出す）                                 |
| `buildAllViewsSvg` の system pane                | `drill-down-svg.ts` | 同上（`collectDrillDownLevelsWithDimensions`）      | なし                                             |
| `collectEntityLevels`（`krs-entity-<domainId>`） | `drill-down-svg.ts` | system ごとに full path で walk                     | なし（同じ id の domain が entity を持てば重複） |
| `buildAllLayersSvg`（stacked）                   | `all-layers-svg.ts` | system drill と同じ                                 | anchor なし。中身だけ誤る                        |
| org の drill / all-layers                        | 同上                | team の path                                        | team id は organization 内で一意なので対象外     |

- 子カードのリンクは `render(..., childLevelLinks)` に渡す `Map<bare id, anchor>` で、`svg-renderer.ts` の `childLevelLinks?.get(nodeId)` がカードを `<a href>` で包む。key が bare id なので、ルートの 2 枚の `Api` カードはどちらも `#krs-system-Api` へリンクする。
- 戻るボタンは親の anchor（`renderBackButton(parentViewId)`）。entity レベルの戻り先は「その domain の usecase レベルがあれば domain id、無ければ親」。
- `extract(path)` は path の先頭が system id なら system を確定する（`resolveContainerChain`）。single-system で `["A"]` と `["Shop", "A"]` を引いた slice は JSON で一致することを実測した。カードの `data-node-path` はどちらでも `Shop.A.Core` のように system から始まる。
- `KrsFile.nodePathIndex` は SPA が `#krs-system-<id>` を解決する索引そのもの（`compile.ts` の `nodeMetadata.viewPath`）。project のビルドでは ImportResolver が merge 後のモデルで作り直す（TPL-2221）。キーは service / domain / client と top-level infra。path は system id から始まり、トップレベル（Unassigned）のノードは system の段を持たない。

## 制約・前提

- **anchor 文法は変えない**（ADR-1827、`docs/spec/permalink.md`）。ADR-2917 は path を anchor に入れる案 B を ADR-2088 の延長のプログラムとして先送りした。本 Issue はバグ修正の範囲で閉じる。
- **同名 id の無いモデルの出力は byte-identical に保つ**（ADR-2521 と同じ前提。examples と既存の fence がそのまま通ることを確認できる）。
- 要素の `data-node-id` / `data-node-path` は変えない（ADR-2917）。
- org view は対象外（team id が organization 内で一意）。deploy は単一レベル。

## 検討した選択肢

### 案1: anchor id ごとに 1 レベル。中身は `nodePathIndex` の勝者で決める

1. **walk は full path で回す**。ルートの子は `[system.id, child.id]`（Unassigned 擬似 system も同じ）、以下 `[...path, child.id]`。これで各ノードは自分の中身で描かれる（実測 4 と 1 の「部分木の複製」が消える）。
2. **anchor id `X` のレベルを出すのは、walk の path が `X` の canonical path に一致するノードだけ**。canonical path は `nodePathIndex.get(X)`（Unassigned の walk path は擬似 system の段を外して比べる）。`nodePathIndex` に無い id（infra のように索引の kind 外のもの）は walk 順で最初のノードにする。
3. **canonical でないノードも再帰はする**。その下に一意な id があればそのレベルは出る（`Admin.Api.Users` は `krs-system-Users` として出る）。
4. **子カードのリンクは、そのカード自身のレベルがバンドルにあるときだけ張る**。`childLevelLinks` の key を bare id からカードの path（`nodePathRefId`）に変え、canonical でない `Admin.Api` のカードはリンクを持たない。既存のコメントが書く規則（「レベルを出さない子にリンクすると行き止まる」）を、「別のノードのレベルに着くリンクも張らない」へ延ばす形になる。
5. **戻るボタンは、path をさかのぼって最初にバンドルにレベルがある祖先へ向ける**。`Users` の親 `Admin.Api` はレベルを持たないので、戻り先はルート。entity レベルの戻り先も同じ規則で決める。
6. **stacked の all-layers は重複除去をしない**（anchor が無く、全部が同時に見える）。1 の full path walk だけを入れ、複数 system のルート直下の帯は `[system ラベル, 子ラベル]` から始める。

**メリット**

- 1 つのモデルで anchor id ごとにレベルが 1 つになり、その中身は SPA が同じ fragment で開くノードと定義上一致する（同じ索引を読む）。TPL-1827 の parity と TPL-1583 の勝者規則に、新しい規則を足さずに乗る。
- 部分木の取りこぼしが消える。一意な id の子孫（`Users`）は両方の面で開ける。
- 同名 id の無いモデルでは canonical 判定が常に真で、リンクの key も 1 対 1 に対応するので出力は変わらない。

**デメリット**

- canonical でないノード（`Admin.Api`、`B.Core`）自身のレベルは静的バンドルから開けない。そのカードはクリックできない。文法に path を持たない以上どの案でも残る制約で、SPA の permalink も同じノードには着かない（SPA ではカードのクリックだけが `data-node-path` で正確に着く。ADR-2917）。
- canonical でないカードがリンクを持たない理由は図からは読めない。`node-id-multiple-locations`（service / client の場合）が作者に状態を伝えるが、domain 同士は警告が出ない。

### 案1': 案1 のまま、canonical でないカードも勝者のレベルへリンクする

`childLevelLinks` を bare id のままにし、`Admin.Api` のカードも `#krs-system-Api`（`Shop.Api` のレベル）へリンクする。bare id の hand-over は勝者に着くという ADR-2917 の仕様には沿う。

**デメリット**

- クリックすると別の system のノードに潜るカードが静的バンドルに残る。ADR-2917 が A（描画）と C（path）を同じ変更で入れた理由（「クリックすると別 system に潜るカード」を目に見える形で増やさない）と逆の結果になる。
- 戻るボタンで戻ると、クリックしたカードとは別の親（`Shop` 側）に戻る。

### 案2: anchor 文法に path を入れる（`#krs-system-Admin.Api`）

ADR-2917 の案 B。静的バンドルでもノードごとにレベルを持てる。

**デメリット**

- `docs/spec/permalink.md` と ADR-1827 / ADR-425 の契約変更で、SPA の `parseHash` / `buildHash`、share の `target.node`、ADR の permalink 検証（`adr:check-permalinks`）が同時に変わる。ルートが 1 system のときと複数 system のときで anchor の形が変わるかどうかも決める必要がある。バグ修正 1 件の範囲を超え、ADR-2917 が先送りした判断をここで覆すことになる。

### 案3: canonical でないレベルに文法外の id を付ける（`krs-system-Admin__Api` など）

公開の文法を変えずに、静的バンドルの中だけでクリック到達できるようにする。

**デメリット**

- その id は `#krs-system-<id>` と同じ形の fragment としてコピーされ、SPA では解決しない（`Admin__Api` という node は無い）。別の prefix にしても SPA が知らない fragment が増える。TPL-1827 の「片方でだけ解決する permalink」を、意図して作ることになる。実質的に案 2 を非公開で入れる形。

### 案4: 重複を DOM 順の最初の 1 つで切る

walk はそのままで、すでに出した anchor id を飛ばす。

**デメリット**

- 実測 2 の `@migration_target` で SPA と別のノードに着く食い違いが残る（静的は最初の所有 system、SPA は勝者）。
- 実測 1 の部分木の取りこぼし（`Users` が無い）が直らない。path の組み方を直さない限り、後の system の中身は描かれない。

## 比較

| 観点                             | 案1  | 案1' | 案2               | 案3             | 案4  |
| -------------------------------- | ---- | ---- | ----------------- | --------------- | ---- |
| anchor id ごとにレベル 1 つ      | ○    | ○    | ○                 | ○               | ○    |
| 着地が SPA と一致                | ○    | ○    | ○（両面を変える） | ×（SPA 未解決） | ×    |
| 一意な子孫（`Users`）に届く      | ○    | ○    | ○                 | ○               | ×    |
| クリックが別ノードに着かない     | ○    | ×    | ○                 | ○               | ×    |
| canonical でないノード自身に届く | ×    | ×    | ○                 | ○（静的のみ）   | ×    |
| 文法・契約の変更                 | なし | なし | あり              | 事実上あり      | なし |
| 同名 id の無いモデルの出力       | 不変 | 不変 | 変わりうる        | 不変            | 不変 |

## 現時点の方針

**案1 を採用する。** anchor が bare id しか持たない以上、静的バンドルが出せる正しいレベルは anchor id ごとに 1 つで、それを SPA と同じ索引で選べば 2 つの面の着地は定義で揃う。canonical でないノード自身に届かない制約は、文法に path を入れる（案 2）まで両方の面に共通で、静的バンドルだけが別の規則を持つ理由にはならない。案1' はリンクの数は増えるが、クリックが別のノードに着くカードを作る点で ADR-2917 の判断と逆を向く。

### 実装の指針

1. **canonical 判定の helper**（`drill-down-svg.ts` 内、export しない）: `nodePathIndex` と walk の full path を受け取り、その path が bare id の canonical path かを返す。Unassigned の擬似 system の段を外して比べる。索引に無い id は「walk 順で最初に見た path」を canonical とし、bundle 1 回分の Map に記録する。
2. **walk の path**: `buildDrillDownSvg` と `buildAllViewsSvg` の `getChildren` が返す子に、その子の full path を持たせる（ルートでは所有 system の id を前に付ける）。`DrillDownCallbacks.getChildren` の戻り値を `{ node, path }` にするか、system drill 用に path を返す callback を足す。org 側の呼び出しは現在の path 規則のままでよい（team の path は一意）。
3. **レベルの出力**: `collectDrillDownLevelsGeneric` / `collectDrillDownLevelsWithDimensions` は、canonical でないノードではレベルを push しない。再帰は続ける。
4. **リンク**: `childLevelLinks` の key をカードの path（`nodePathRefId(path)`）に変え、`svg-renderer.ts` は `node.path` があればそれで、無ければ bare id で引く。canonical で、かつレベルを出す子だけを Map に入れる。カードの `node.path` がルートの Unassigned ノードでどの形になるかを実装時に確かめ、walk path と同じ形に揃える。
5. **戻るボタン**: 再帰で「最後にレベルを出した祖先の anchor」を引き回し、それを `parentViewId` にする。`collectEntityLevels` も同じ規則に揃え、canonical でない domain の entity レベルは出さない（`#krs-entity-<domainId>` も SPA は `nodePathIndex` で解決する）。
6. **stacked の all-layers**: 2 の full path を使い、複数 system のルート直下の帯ラベルを `[system ラベル, 子ラベル]` で始める。重複除去はしない。
7. **テスト**（`packages/core/src/renderer/` に新しい test file。既存の `multi-system-same-id.test.ts` の隣）:
   - Issue のモデルで `<g id="krs-system-Api">` が 1 つで中身が `Shop.Api.Orders`、`krs-system-Users` が 1 つで中身が `Admin.Api.Users`。各 anchor のレベルの `data-node-path` の集合が `compile(..., { viewPath: nodePathIndex.get(id) })` の出力と一致する（parity を 1 つの helper で全 anchor について見る）。
   - `@migration_target` のモデルで `krs-system-Api` が `Admin.Api` のレベルになる。
   - single-system の `A.Core` / `B.Core` で `krs-system-Core` が 1 つ。
   - リンク: ルートで `Shop.Api` のカードだけが `<a href="#krs-system-Api">` に包まれ、`Admin.Api` のカードは包まれない。`Users` レベルの戻るボタンはルートへ向く。
   - entity: 同じ id の domain が 2 つとも entity を持つとき `krs-entity-<id>` が 1 つ。
   - 同じ検査を `buildAllViewsSvg` にもかける（TPL-219: 並列する 2 つの生成器）。
   - stacked: Issue のモデルで `Admin.Api.Users` の帯があり、帯ラベルが `Admin › Api` で始まる。
   - 不変性: `examples/` の全モデルについて、`buildDrillDownSvg` / `buildAllViewsSvg` の出力が変わらないことを既存の snapshot / fence で確かめる（無ければ PR で main の出力と diff を取る）。
8. **TPL**: TPL-2920 の「既知の対処パターン」の静的 SVG の行を本設計の規則（anchor id ごとに 1 レベル、勝者で選ぶ、別ノードに着くリンクは張らない）に書き換え、`known_consumers` の `drill-down-svg-child-links` の着地点を更新する。TPL-1352 の `discovered_from` に #2933 を足す（walk の path が区別に要る次元 system を落としていた）。原則は既存 TPL に収まるので新しい proactive TPL は起こさない。
9. **AT**: `docs/acceptance/2933-static-bundle-same-id-levels.md`。手動項目は 1 つ: CLI で Issue のモデルを `karasu render` し、ブラウザで `#krs-system-Users` と `#krs-system-Api` を開いて、SPA で同じ fragment を開いたときと同じノードが出ること。他は自動テストで覆う。
10. **spec**: `docs/spec/permalink.md` の Static rendered SVG の行に「同じ id のノードが複数あるときは `nodePathIndex` の勝者のレベルだけを出す」を 1 文足す。`docs/spec/diagnostics.md` の `node-id-multiple-locations` の末尾（hand-over の着地点）に静的バンドルを足す。
11. **ADR 昇格**: 実装完了後に ADR-2933 として昇格し、本 Design Doc は同じ PR で削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 同名 id を持つモデルの静的 SVG / all-views export / stacked export だけが変わる。重複していたレベルが 1 つになり、後の system の部分木が自分の中身で描かれ、canonical でないカードのリンクが外れる。同名 id の無いモデルは不変。
- changeset: `@karasu-tools/core` と `karasu` に patch。
- ドキュメント更新: `docs/spec/permalink.md`（en / ja）、`docs/spec/diagnostics.md`（en / ja）、TPL-2920、TPL-1352。
- examples への影響: `examples/` に同名 id を持つモデルは無い（ADR-2917 の確認）。

## 未解決の問い / 決めないこと

- canonical でないカードに「静的バンドルでは開けない」ことを示す見た目（tooltip など）を付けるか。本設計ではリンクを外すだけにする。付けるならモデル全体の同名 id の扱い（#2934 / #2935）と合わせて決める。
- anchor 文法に path を入れるか（案 2）。ADR-2917 と同じく、ADR-2088 の延長のプログラムとして別に決める。
