# boundary grouping の drill-down ビュー拡張 — 既成挙動の正規化と inert member 診断

- **日付**: 2026-07-16
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1983](https://github.com/kompiro/karasu/issues/1983)（parent: [#1822](https://github.com/kompiro/karasu/issues/1822) comprehension、follow-up to [#1974](https://github.com/kompiro/karasu/issues/1974) P2b）
  - 経緯 Issue: [#1879](https://github.com/kompiro/karasu/issues/1879)（export surface への groupBy 配線 — 「root system-view level only」の由来）、[#1884](https://github.com/kompiro/karasu/issues/1884)（multi-system per-(system, team) フレーム）、[#1921](https://github.com/kompiro/karasu/issues/1921) / [#1923](https://github.com/kompiro/karasu/issues/1923)（in-place expansion / mixed-LOD）
  - 関連 ADR: [ADR-20260711-03](../adr/20260711-03-system-view-group-by-team.md)（P2a team 軸 — 決定 7 が root-only の出所）、[ADR-20260713-01](../adr/20260713-01-notation-promotion-gate.md)（notation promotion gate）、[ADR-20260715-03](../adr/20260715-03-system-view-p2c-grouped-edge-routing-and-marks.md)（P2c routing/marks）、[ADR-20260716-01](../adr/20260716-01-group-by-diff-removed-node-placement-and-aggregated-edge-state.md)（diff-mode grouping）、[ADR-20260714-04](../adr/20260714-04-expand-container-in-place.md)（入れ子は drill-down の領域）、[ADR-20260611-02](../adr/20260611-02-legend-drill-down-scope.md)（per-drill-depth exact-match の前例）、[ADR-20260403-01](../adr/20260403-01-drill-down-adapter-hierarchy-node.md) / [ADR-20260401-05](../adr/20260401-05-vscode-phase3-5-drilldown.md)（drill-down の node 集合・ナビゲーション契約）
  - 親 Design Doc: [system-view-grouping.md](system-view-grouping.md)（P2b 詳細設計。「boundary の入れ子 / boundary 単位の drill-down」を deferred（却下ではない）として本 Issue に送った出所）
  - 関連 TPL: [TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md), [TPL-20260510-11](../test-perspectives/TPL-20260510-11-parallel-function-parity.md), [TPL-20260624-02](../test-perspectives/TPL-20260624-02-relayout-into-group-preserves-placement-and-edges.md), [TPL-20260510-21](../test-perspectives/TPL-20260510-21-scoped-glance-drill-down.md), [TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md), [TPL-20260610-02](../test-perspectives/TPL-20260610-02-spec-promised-diagnostics-implemented.md), [TPL-20260616-02](../test-perspectives/TPL-20260616-02-diagnostics-catalog-completeness.md), [TPL-20260711-02](../test-perspectives/TPL-20260711-02-routing-measures-crossings-and-penetrations.md), [TPL-20260615-02](../test-perspectives/TPL-20260615-02-diagnostic-absence-assertion-scope-severity.md), **[TPL-20260716-01](../test-perspectives/TPL-20260716-01-view-state-gate-parity-across-surfaces.md)（本 doc と同 PR で起票する proactive TPL）**
  - コード: `packages/core/src/parser/parser.ts`, `packages/core/src/renderer/layout.ts`, `packages/core/src/renderer/drill-down-svg.ts`, `packages/core/src/renderer/all-layers-svg.ts`, `packages/core/src/renderer/svg-renderer.ts`, `packages/core/src/index.ts`, `packages/app/src/hooks/useSystemView.ts`

## 背景・課題

Issue #1983 の報告: `boundary` の `contains` は宣言済みの任意 id を受理する（kind 制限なし、
`contains-target-not-found` は「存在しない id」にしか出ない）が、**drill-down ビューにしか
描画されない member**（service 配下の nested `domain`、`usecase`、`entity`）は
`groupBy: "boundary"` の system view で**フレームにも入らず警告も出ない**。
受理される語彙・参照が効果も警告も持たない状態は [TPL-20260610-01] が禁じる
ghost 状態（第 4 状態）に近い（P2b-C で spec に「accepted but not grouped today」と
明文化したため厳密には第 3 状態だが、spec を読まない限り気づけない点は変わらない）。

### 実測（本 doc 作成時の compile probe）

Issue の観測を再現し、さらに drill-down 経路を実測したところ、**Issue の前提を覆す事実**が出た。

probe モデル（要旨）: `system Shop { service Orders { domain OrderDomain { usecase PlaceOrder } domain ShippingDomain } domain TopDomain; service Billing }` + `boundary cluster { contains TopDomain, Orders, OrderDomain, PlaceOrder, Billing }`（実際は 1 行 1 `contains`）。

| probe | 経路 | 結果 |
| --- | --- | --- |
| 1 | `compile(src, { groupBy: "boundary" })`（root system view） | `__group_cluster__` フレーム生成。TopDomain / Orders / Billing は枠内。**OrderDomain / PlaceOrder は SVG に不在、warning / diagnostics ともゼロ**（Issue の観測どおり） |
| 1' | 同上 + `contains NoSuchNode` | `contains-target-not-found { memberId: "NoSuchNode" }` が発火（「実在しない id は警告、実在するが drill-down のみの id は無警告」の非対称を確認） |
| 2 | `compile(src, { groupBy: "boundary", viewPath: ["Shop", "Orders"] })`（service drill view） | **`__group_cluster__` フレームが出る**。OrderDomain（member）と ShippingDomain（non-member）が描画される |
| 2' | 同 domain view（`["Shop","Orders","OrderDomain"]`） | **フレームが出る**。PlaceOrder が描画される |
| 3 | probe 2 + `collapsedGroups: new Set(["cluster"])` | **member の OrderDomain だけが stub `__group_collapsed_cluster__` に畳まれ、non-member の ShippingDomain は残る** — membership は drill レベルで完全に機能している |
| 4 | cross-service edge で ghost domain を発生させ、ghost が member の場合 | ghost（BillingDomain）は描画されるが **collapse に巻き込まれない** — ghost は `ViewSlice.childNodes` ではなく `ghostDomains` 等の別フィールド経由で配置されるため、構造的に bucket の外にある |

つまり現状の真の姿は「drill-down では効かない」ではなく、**surface 間で挙動が割れている**:

| surface | drill レベルの grouping | 根拠 |
| --- | --- | --- |
| **interactive preview**（app: `compile()` + `viewPath`。`useSystemView` は drill 中も `groupBy` を渡す — `packages/app/src/hooks/useSystemView.ts` の compile options） | **既に効いている**（フレーム・collapse とも。ただし未仕様・専用テストなし） | probe 2/2'/3 |
| **静的 export**（`buildDrillDownSvg` / `buildAllLayersSvg` / `buildAllViewsSvg`） | root のみ。`groupBy: legendScopeForLogicalSlice(slice) === "system" ? groupBy : undefined` の明示 gate（`drill-down-svg.ts:133`, `all-layers-svg.ts:254`、コメント「Root system-view level only (#1879); collapse off by design.」） | コード |
| **entity view**（`renderEntityView`） | 効かない。`groupBy` / `boundaryIndex` を **signature ごと受け取らない**（`packages/core/src/index.ts:1030-1038`） | コード |
| **spec**（`docs/spec/syntax.md:970-978`、P2b-C #1980 でマージ） | 「grouping takes visible effect **only** on nodes that render at the grouped level — **the system-view top tier**」と記述 | spec |

interactive で効いてしまっている理由は単純で、bucket 計算が最初から「view に渡された
ノード集合 × 軸 index の交差」でしか書かれていないから（後述のインベントリ参照）。
`#1879` の gate は export surface にだけ入り、interactive 経路には最初から存在しなかった。
これは「view-state option の制限（gate）を一部 surface にだけ入れた結果、残りの surface で
undocumented 挙動が生きて出荷される」という失敗クラスで、[TPL-20260510-11]（parity）の
逆方向（機能を通す漏れではなく、制限をかける漏れ）。本 doc と同 PR で proactive TPL
[TPL-20260716-01] として観点化する。

したがって本 doc の問いは Issue 起票時の「drill-down grouping をどう作るか」から
**「既に interactive で動いている drill-down grouping を仕様として認めて柵をかける（正規化）か、
gate を追加して spec 記述どおりに殺すか。正規化するなら、レベルを跨ぐ boundary の
セマンティクスをどう言語化し、残る真の inert member に何を言うか」**に変わる。

## 現状（インベントリ）

| 観点 | 現状 | 位置 |
| --- | --- | --- |
| `contains` の格納 | `buildBoundaryIndex` が全 member を**無条件・kind 不問**で `boundaryIndex: Map<string,string>` に格納（first-wins、重複は info `duplicate-boundary-assignment`） | `packages/core/src/parser/parser.ts:2030-2047` |
| `contains` の検証 | `validateContainsReferences` は**存在チェックのみ**。`collectContainableIds` が全 system の全 descendant + top-level 孤児を再帰収集するため、nested usecase / domain の id も「存在する」— レベル・可視性のチェックは無い | `parser.ts:2220-2234` / `:2240-2258` |
| 軸の選択 | `groupIndex = groupBy === "boundary" ? boundaryIndex : groupBy === "team" ? ownerIndex : undefined` が唯一の分岐点（multi-system 側にミラー） | `packages/core/src/renderer/layout.ts:961-962` / `:1602-1603` |
| bucket 計算 | `allNodes.map(n => ({ id, groupId: groupIdOf(n.id), ungroupedRank: systemTier(n) }))` — **`allNodes` は渡された slice の top-level childNodes**。「system-view top tier 限定」はここではなく、**呼び出し側が drill slice に groupBy を渡さないことで**成立している | `layout.ts:1070-1084`（gate `:1070`）、`groupIdOf` `:1051-1052` |
| export surface の gate | `groupBy: legendScopeForLogicalSlice(slice) === "system" ? groupBy : undefined`。`legendScopeForLogicalSlice` は slice が root（`slice.systems.length > 0`）のときだけ `"system"` を返す | `drill-down-svg.ts:133`, `all-layers-svg.ts:254`, `svg-renderer.ts:168-174` |
| interactive 経路 | `compile()` → `extractView(systems, viewPath, ...)`（`index.ts:665`）→ `render()` → `layout()`。**gate なし** — drill slice にも `groupBy` / `boundaryIndex` がそのまま届く（`index.ts:687-688`） | `packages/core/src/index.ts` |
| entity view | `renderEntityView(krsSource, viewPath, ...)` は `groupBy` を受けない（未配線） | `index.ts:1030-1038`, `drill-down-svg.ts:186` |
| フレーム描画 | layout が `buildGroupFrames` で `ContainerRect`（`__group_<gid>__`, `group: true`）を作り、renderer は `container.group` だけ見て破線枠 + `data-group` を描く。**renderer に view-scope 依存は無い** | `layout.ts:63-97` / `:1391`、`svg-renderer.ts:846` / `:870` / `:895` |
| collapse | `collapseGroups` が member を `<Boundary> (N)` stub に畳み、境界エッジを stub へ再ターゲット。stub id は single-system で `__group_collapsed_<gid>__`、multi-system は `<sys>` で namespace | `packages/core/src/renderer/group-collapse.ts:82` / `:25-29` |
| P2c routing | `routeGroupedEdges` / `aggregateGroupTrunks` / `computeCrossingMarks` は **`groupBands != null` のみで発火**（level 判定なし）。drill slice に groupBands ができれば自動で付いてくる（probe 2/3 で既に発火している） | `layout.ts:1461` / `:1468` / `:1472`、ADR-20260715-03 |
| diff-mode | `compileSystemDiff` が removed node の boundary を before 側から backfill する `mergedBoundaryIndex` を構築（axis map レベルの操作。drill とは独立） | `index.ts:1348-1353`、ADR-20260716-01 |
| app | `GroupByMode`（none/team/boundary）は app の view-state。`useSystemView` は **drill 中も** `groupBy` を compile に渡す。Group-by セレクタは `activeView === "system" && view.groupByAvailable` で drill 中も表示 | `useSystemView.ts`（`groupBy: groupBy === "none" ? undefined : groupBy`）、`PreviewColumn.tsx:295-320` |
| ghost | `ViewSlice` の `ghostDomains` / `ghostSystems` / `ghostEntities` 等は `childNodes` と別フィールド。`LayoutNode.ghost?: boolean` あり。**bucket 対象にならない**（probe 4） | `packages/core/src/view/view-extract.ts:353-393`, `layout-types.ts:36` |
| owns（team 軸）との対称性 | `owns` は kind 制限あり（service / domain / client / infra — `invalid-owns`、[TPL-20260623-02]）だが**レベル制限は無い** — nested domain を owns すれば team 軸でも drill view で同じことが起きる。usecase / entity は owns 不可なので、実利用上の主対象は kind 無制限の boundary 軸 | `docs/spec/syntax.md:915` |

## 制約・前提

- **`boundary` は experimental notation のまま**（[ADR-20260713-01]）。本拡張は stable 昇格ではなく
  experimental 層内の挙動確定であり、stable 昇格は従来どおり karasu-nest corpus の evidence を
  待つ（`docs/roadmap.md` §promotion gate の watch 表は変えない。promotion trigger の観察対象に
  「drill-down での利用」が加わる）。
- **ADR-20260711-03 決定 7（root-only）は team 軸の根拠で決まった**: #1879 の文言は
  「drill-down levels have no teams, so grouping does not apply there」。boundary 軸は任意 kind を
  含められるためこの根拠は成立しない。root-only を覆すのではなく「軸の member が居るレベルで
  効く」へ一般化する（decision 7 は当時の team 軸には正しく、supersede は不要 — 実装完了後の
  ADR 昇格時に関係を記す）。
- **ADR-20260714-04**: 「深い入れ子展開は不採用（展開 domain の子をさらに展開するのは
  drill-down の領域）」— 入れ子の表現は drill-down に委ねるのが既決。drill-down ビューの内側で
  グルーピングする本件はこの routing に沿う（system view を deep 化しない）。
- **[TPL-20260624-02] の不変条件は各レベルで維持**: 全ノードちょうど一度配置 / collapse 時の
  端点再解決 / 退化ケースで破綻しない。
- **[TPL-20260510-21]（scoped glance）**: drill ビュー内の grouping は「単一ビューの視覚的密度に
  上限の発想を持つ」原則の各レベルへの適用であり、逆行ではない。ghost（視野外の文脈）は
  枠に入れない。
- **out of scope**（親 doc の deferred を継続）: nested `boundary` 構文、boundary 単位の
  drill-down（boundary をクリックして中に入る）、deploy / org view への適用、diff × drill の
  組み合わせ（diff は system root のみ — ADR-20260716-01 の現状維持）、#1923 mixed-LOD との
  合成（`expandedContainers` は Group-by と排他のまま）、CLI への `groupBy` 露出。

## 検討した選択肢

### 案 1: 正規化 — 「grouping は描画レベルとの交差で効く」を仕様に昇格し、全 surface の parity を回復する

interactive で既に動いているセマンティクス — **軸 index（model-wide の `Map<id, groupId>`）と
「いま描画しているレベルの childNodes」の交差でフレームを組む** — を意図された仕様として
言語化する。実装は (a) export surface の gate（`drill-down-svg.ts:133` / `all-layers-svg.ts:254`）を
外して interactive と揃え、(b) `renderEntityView` に軸を配線し、(c) ghost 除外・退化ケースに
テストの柵をかけ、(d) spec の interim 記述を書き換える。文法変更ゼロ。

**メリット**

- Issue の要求（nested domain / usecase / entity をグルーピングしたい）を新構文ゼロで満たす。
- 差分が最小 — bucket 計算・フレーム描画・collapse・P2c は最初から level 非依存に書かれており
  （インベントリ参照）、「作る」ものがほぼ無い。変更は gate の緩和と柵。
- 三者不整合（interactive / export / spec）を「実装 2 面を spec に合わせて殺す」のではなく
  「spec を実挙動 + ユーザー価値side に合わせる」形で解消する。interactive の挙動は P2a 以来
  出荷され続けており、殺す方が実質的な挙動変更。
- ADR-20260611-02（legend の per-drill-depth exact-match）が示した「レベルごとに、そのレベルの
  ものだけを描く」原則と一致する。

**デメリット**

- 未仕様のまま動いていた挙動を追認する形になる（ghost・groupTier・P2c の drill での振る舞いを
  柵で固める作業が必須。追認 ≠ 無検証）。
- export（all-layers / all-views）で各レベル band に枠が増え、出力が変わる（experimental 軸を
  使っている場合のみ。ungrouped 出力は byte 不変）。

### 案 2: gate 追加 — interactive も root のみに制限し、spec の現行記述に実装を合わせる

`compile()` 経路（`index.ts:687-688` → `render()`）にも `legendScopeForLogicalSlice` 相当の
gate を入れ、drill slice への `groupBy` を落とす。その上で「drill-down grouping」は将来の
新設計として仕切り直す。

**メリット**

- spec（P2b-C の記述）と実装が一致し、三者不整合は解消する。
- 未検証挙動を隠せる。

**デメリット**

- **ユーザー価値を消す方向の変更**。P2a 以来 interactive で動いてきた挙動（team 軸でも nested
  domain の owns で発生しうる）を止め、しかも Issue の要求と真逆。
- gate を足すコード + 「なぜ効かないのか」の説明コストは、正規化の柵とほぼ同額。
- 正規化を将来やるなら二度手間（gate を足して外す）。

### 案 3: per-level axis — レベル別の宣言・軸を新設する

legend の scope 語彙（`legend service` / `legend domain`）に倣い、boundary にもレベル指定
（例: `boundary payments service { ... }`）や per-level の別軸を導入する。

**メリット**

- 「どのレベルで枠を出すか」を著者が明示制御できる。

**デメリット**

- **宣言の必要がない**。member は id 参照であり、その id がどのレベルで描画されるかはモデル構造が
  既に決めている — flat index × 描画レベルの交差（案 1）で同じ結果が得られ、著者に冗長な指定を
  課すだけ。legend が per-level 宣言なのは「凡例の語彙がレベルごとに別物」だからで、membership には
  当てはまらない。
- experimental の `boundary` に corpus evidence ゼロの段階で構文表面積を足すのは
  [ADR-20260713-01] の「昇格に渋く、灰色は experimental に留める」規律に逆行。

### 案 4: nested boundary 構文 — boundary の入れ子で階層を表現する

`boundary outer { boundary inner { ... } }` を許し、boundary 自体に階層を持たせる。

**メリット**

- boundary 間の包含関係を表現できる。

**デメリット**

- #1983 の要求（**モデル階層の**深い node をグルーピングしたい）と直交する別問題
  （**boundary 同士の**階層）を解いてしまう。案 1 で要求は満たせる。
- `boundaryIndex` の 1:1 前提（開閉の単一値識別子 — 親 doc「開閉の識別子は単一値」）が壊れ、
  レベルごとの winner 解決・フレーム重なり回避など機構コストが跳ねる。
- 親 doc が deferred にした項目そのもの。解禁する動機（corpus 証拠・実利用 pain）が無い。
  [ADR-20260714-04] の flatness への注意（深い入れ子は scoped glance を崩す）にも触れる。

> **診断先行案（Issue の「interim / independent」項目）について**: Issue は「diagnostic は
> full drill-down grouping より安価なので先行出荷できる」としていたが、これは
> 「drill-down grouping が全く動いていない」前提だった。実測でその前提が崩れた
> （本体は「作る」ではなく「認めて柵をかける」であり、診断より高価とは言えない）ため、
> 診断は独立した選択肢ではなく **どの案でも付随する workstream** として「診断の設計」節で
> 扱い、フェーズ順序は「現時点の方針」で決める。特に「system-view top tier に居ない member に
> warning」という Issue 当初の発火条件は、案 1 の正規化と**矛盾する**（正規化後は drill で
> 効くので警告が誤りになり、一度出荷して撤回する羽目になる）点が重要。

## 比較

| 観点 | 案 1: 正規化 | 案 2: gate 追加 | 案 3: per-level axis | 案 4: nested boundary |
| --- | --- | --- | --- | --- |
| #1983 の要求充足 | ○（全レベル） | ×（先送り） | ○（ただし冗長な宣言） | △（別問題を解く） |
| 文法変更 | **ゼロ** | ゼロ | あり（experimental 拡張） | あり（機構コスト大） |
| 変更量 | 小（gate 緩和 + entity 配線 + 柵） | 小（ただし価値を消す） | 中 | 大 |
| 既存挙動への影響 | export のみ変化（grouped 時） | **interactive の既成挙動を停止** | 追加のみ | 追加のみ |
| ADR-20260713-01 との整合 | ○（構文据え置き） | ○ | ×（証拠なき構文追加） | ×（同左） |
| 三者不整合の解消 | ○ | ○ | △（不整合は別途要解消） | △（同左） |

## 現時点の方針

**案 1（正規化）を採用する** — grouping のセマンティクスを「**軸 index と、いま描画している
レベルに描画されるノード集合の交差**」として仕様化する。これは P2a が root で確立した
「the axis buckets whatever appears at the level being drawn」（Issue 本文の表現）の素直な
一般化であり、bucket 計算（`layout.ts:1070-1084`）が最初からそう書かれている事実、
ADR-20260714-04 の「入れ子は drill-down の領域」、ADR-20260611-02 の per-level exact-match
前例のすべてと整合する。案 3 / 案 4 は要求に対して過剰な構文追加で、promotion gate の規律に
反するため採らない（案 4 は引き続き deferred — 却下ではなく、corpus 証拠が要求したときに
再検討する）。

### レベルを跨ぐ boundary の描画セマンティクス（仕様として言語化する内容）

1. **per-view 独立**: 各ビュー（root system view / service view / domain view / entity view /
   all-layers の各 band）は独立に描画され、**そのビューに描画される member の部分集合**で
   フレームを組む。他レベルの member はそのビューのフレームに参加しない。
2. **同一 boundary の複数フレーム**: member が複数レベルに散る boundary は、レベルごとに
   同名ラベルの disjoint なフレームを持つ（例: root では `Orders` を含む `Cluster` 枠、
   `Orders` の service view では `OrderDomain` を含む `Cluster` 枠）。これは #1884 の
   per-(system, team) フレームと同型の「正直な表現」（1 枚の枠でレベルを跨いで囲まない —
   囲むと [TPL-20260624-02] の disjoint 不変条件と replace-context ナビゲーション
   （ADR-20260401-05）の前提を壊す）。
3. **member 不在のビューでは枠を出さない**: そのビューに member が 1 つも居なければ
   フレームなし（`assignGroupedLayers` が group 不在で null を返す既存挙動
   `group-layout.ts:261-262` を継承）。
4. **ghost は grouping に参加しない**: ghost node（`ghostDomains` / `ghostSystems` /
   `ghostEntities` / `ghostUsers`）は member であっても bucket / collapse の対象外
   （probe 4 で実測済みの現挙動を明文化し、テストで柵をかける）。ghost は「視野の外にある
   ものの文脈」であり、ビュー内の整理対象ではない（[TPL-20260510-21]）。
5. **collapse・P2c routing は同じ機構がそのまま効く**: collapse は per-view の view-state、
   P2c 3 パスは `groupBands != null` で発火（従来どおり）。diff-mode は system root のみ
   （現状維持）。

### フェーズ分割（実装 PR の出荷単位）

> Issue 起票時の想定（Phase 1 = 診断先行、Phase 2 = 本体）から**順序を入れ替える**。
> 理由: 本体が「新造」ではなく「正規化」だと実測で判明し（背景節）、診断の発火条件は
> 正規化後のセマンティクスが確定して初めて安定に定義できるため。

| フェーズ | 内容 | 出荷単位 / changeset |
| --- | --- | --- |
| **Phase 1（正規化 — 本体）** | 1a: export surface の gate 緩和（`drill-down-svg.ts:133` / `all-layers-svg.ts:254` — collapse off は #1879 どおり維持）+ `renderEntityView` への軸配線 + ghost 除外と退化ケースのテスト柵（core）。1b: spec 書き換え（`syntax.md` / `syntax.ja.md` — 下記差分案）+ examples 拡張 + AT + roadmap watch 表の promotion trigger 追記 | 1a: `@karasu-tools/core` + `karasu` minor。1b: docs のみ（1a と同 PR でも可） |
| **Phase 2（診断）** | `contains-target-not-groupable` 警告（下記具体設計）: どの groupable ビューにも描画され得ない kind の member への warning。i18n en/ja + catalog + tests | `@karasu-tools/core` + `karasu` minor |

Phase 1 と 2 は独立して出荷可能（診断は kind ベースの静的判定であり、正規化の前後で意味が
変わらないよう設計する — 下記）。推奨順序は 1 → 2。

### 診断の具体設計（Phase 2）

**発火条件を「system-view top tier に居ない member」にしない**ことが要点。それは正規化後には
偽（drill で効く）になる。正規化後も**恒久的に真**である条件は kind ベースで書ける:

- **コード**: `contains-target-not-groupable`（`DiagnosticParamsByCode` に追加。
  既存 `contains-target-not-found`（`ast.ts:555`）と対になる命名）
- **severity**: `warning` — 「author が書いた指定が効果を持たない」は defect 側の register
  （[TPL-20260514-08]）。「受理されるが当該 view では無視」を warning にする前例は
  `style-column-ignored-non-system-view`（`docs/spec/diagnostics.md` Style validation 節）
- **発火条件**: `contains` の member が実在するが、その kind が **grouping の効くどのビューでも
  top-level ノードとして描画され得ない**とき。対象 kind の候補は `resource` と infra leaf
  （`table` / `queue-item` / `bucket`）— service/domain/usecase/entity/user/client/infra
  コンテナは root か drill のどこかで bucket 対象になるため対象外。確定は実装時に
  view-extract の描画 kind 集合を列挙して行う（[TPL-20260623-02] — valid-target set は全 kind を
  列挙して同期する）
- **emit 層**: parser の `validateContainsReferences`（`parser.ts:2220-2234`）に条件を追加
  （`contains-target-not-found` と同じ層・同じタイミング。multi-file merge 後の解決で
  false positive を出さないことは既存診断と同経路であることをテストで確認する）
- **params**: `{ memberId: string, kind: string }`（kind を含めて「なぜ groupable でないか」を
  文言に出す）
- **i18n**（`docs/spec/i18n.md` の手順どおり `packages/i18n/src/types.ts` に key、`en.ts` 必須 /
  `ja.ts` 推奨、`render-diagnostic.ts` に case 追加）:
  - key: `diagnostic.containsTargetNotGroupable.message`
  - en: `"${memberId}" referenced in "contains" is a ${kind}, which never renders at a groupable level — grouping has no effect on it`
  - ja: `"contains" で参照されている "${memberId}"（${kind}）はグルーピング可能なレベルに描画されないため、グルーピングは効果を持ちません`
- **catalog**: `docs/spec/diagnostics.md` の「Cross-reference resolution」rule family に登録
  （catalog completeness meta-test `packages/core/src/types/diagnostics-catalog.test.ts` が
  強制 — [TPL-20260616-02]）。spec 約束の診断は実装と同 PR（[TPL-20260610-02]）
- **絶対に出さないケース**のテスト（[TPL-20260615-02] — absence assertion は scope と severity を
  固定して書く）: nested domain / usecase / entity の member（正規化後は groupable）に
  この警告が出ないこと

### 実装の指針

Phase 1（core / 変更対象は実在パス）:

1. `packages/core/src/renderer/drill-down-svg.ts:133` と
   `packages/core/src/renderer/all-layers-svg.ts:254` の
   `legendScopeForLogicalSlice(slice) === "system" ? groupBy : undefined` を、slice 種別に
   依らず `groupBy` を渡す形に緩和する（`collapsedGroups` を渡さない「collapse off by design」
   は維持）。両ファイルの entity path も同様。
2. `packages/core/src/index.ts:1030-1038` `renderEntityView`（および
   `drill-down-svg.ts:186` `_renderEntityView`）の signature に `groupBy` / `boundaryIndex`
   （+ `ownerIndex`）を追加し、`layout()` まで配線する。app の entity view 呼び出し
   （呼び出し元は実装時に特定）にも通す（[TPL-20260510-11] — 全 call site へ、漏れは黙って落ちる）。
3. ghost 除外の柵: `layout()` の bucket 対象が `viewSlice.childNodes` 由来に限られ、ghost 系
   フィールドが `groupIdOf` に到達しないことを assert する renderer テストを追加
   （現挙動の追認 + 将来の retrofit からの保護）。
4. 退化ケーステスト: drill view で member 0（枠なし）/ 全 childNodes が同一 boundary /
   member 1 個 / collapse round-trip（[TPL-20260624-02] の全域性・端点保持を drill slice で
   assert）/ `groupBy` 未指定の drill 出力が従来と byte 一致（回帰なし）。
5. P2c が drill で発火した出力の crossings / penetrations 計測テスト（[TPL-20260711-02]）。

Phase 1（docs / examples）:

6. spec 差分案（`docs/spec/syntax.md:970-978` の書き換え。`syntax.ja.md` §「システムビューの
   グルーピング」も同内容。**spec 改訂 PR の proactive TPL 義務**は本 doc 同 PR の
   [TPL-20260716-01] を `> Related TPLs:` に back-ref して満たす）:

   > - **`contains <id>`** lists one member per line (mirroring `owns`). The parser
   >   accepts any declared id (no kind restriction, unlike `owns`). Grouping resolves
   >   **per view, against the nodes rendered at the level being drawn**: each view frames
   >   the members present at that level; members living at other levels simply do not
   >   participate in that view's frames. A `domain` nested under a `service` is framed in
   >   that service's drill-down view; a `usecase` in its domain view; an `entity` in the
   >   entity view. One boundary may therefore produce frames on several levels (same
   >   label, disjoint frames — the same honest representation as the per-system team
   >   frames of the multi-system root view). Ghost nodes never participate in grouping.
   >   A member whose kind never renders at a groupable level (a `resource`, an infra leaf
   >   such as `table`) is reported as `contains-target-not-groupable`（Phase 2 マージ後に
   >   この一文を追加。Phase 1 時点では当該 kind の記述を「has no visible effect」として残す）.

   また team 軸側の記述（同節冒頭の「exactly as the team axis does」と P2a 節）にレベル交差
   セマンティクスが波及することを確認し、必要なら同 PR で揃える（`owns` はレベル制限が無いため
   team 軸でも nested domain で同じことが起きる — インベントリ最終行）。
7. `examples/en/feature-samples/boundary-clusters.krs` に drill-down member（nested domain /
   usecase）を含む boundary を追加拡張（**`/update-examples` スキル経由**で `examples.ts` 同期、
   `.claude/rules/examples-sync.md`）。
8. `docs/roadmap.md` §promotion gate の boundary watch 行の promotion trigger に「drill-down
   grouping の実利用」を追記。
9. AT を `docs/acceptance/1983-boundary-drilldown-grouping.md` に起こす（AT 案は下記）。
10. changeset: `@karasu-tools/core` + `karasu` の両方 minor（`.claude/rules/changesets.md` —
    core の利用者向け変更は両方名指し。**experimental notation の挙動に触れる changeset**なので
    `docs/process.md` §リリース運用の promotion gate touchpoint に従い、gate 判断
    （= 昇格ではなく experimental 内の挙動確定であること、corpus 待ちは維持）を PR description に
    明記する）。

Phase 2: 上記「診断の具体設計」のとおり（`parser.ts` / `packages/i18n/src/{types,en,ja,render-diagnostic}.ts` /
`docs/spec/diagnostics.md`（+ `.ja.md`）/ `docs/spec/syntax.md` の一文追加 / core vitest / changeset minor）。

11. ADR 昇格: Phase 1+2 実装完了後、本 doc を `docs/adr/YYYYMMDD-NN-boundary-drilldown-grouping.md`
    へ昇格し、本 doc は同 PR で削除する（親 doc `system-view-grouping.md` の P2b 節・bundled P2c
    ADR の扱いと整合させる）。ADR には ADR-20260711-03 決定 7 との関係（supersede ではなく
    「team 軸根拠の root-only を、軸非依存のレベル交差へ一般化」）を明記する。

### テスト計画

- **core（vitest）**: 上記 3-5 の renderer テスト（`packages/core/src/renderer/` に
  `group-by-drilldown-render.test.ts` を新設、既存 `group-by-boundary-render.test.ts` の
  流儀に倣う）。parser テスト（Phase 2 の発火 / 非発火 / multi-file、
  `packages/core/src/parser/parser.test.ts`）。診断カタログ meta-test は追加コードで自動的に
  効く。export surface（`buildAllLayersSvg` / `buildDrillDownSvg` / `buildAllViewsSvg`）の
  grouped スナップショット。
- **app（vitest + RTL)**: drill 中に Group-by セレクタが機能し続けること（既存
  `PreviewColumn.test.tsx` / `useSystemView` テストに drill 状態のケースを追加。
  **`afterEach(cleanup)` を明示する**（repo 慣習 — globals 無効のため RTL の自動 cleanup が
  効かない））。
- **e2e（Playwright、任意）**: 既存 group-by e2e があれば drill 遷移 1 ケースを追加。無ければ
  AT の手動確認に委ね、e2e 追加は別 Issue。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: `groupBy` 未使用・`boundary` / `organization` 未宣言のモデルは
  **全 surface で byte 不変**（gate 緩和は grouped render にしか効かない）。grouped の
  interactive 挙動は変わらない（既に効いている）。grouped の**静的 export のみ**各レベル band に
  枠が現れる（experimental 軸の利用者のみ）。
- ドキュメント更新: `docs/spec/syntax.md` / `syntax.ja.md`、`docs/spec/diagnostics.md` /
  `diagnostics.ja.md`（Phase 2）、`docs/roadmap.md`、`examples/`。
- テスト・examples への影響: 上記テスト計画 / examples 同期のとおり。

## 相互作用（P2c / collapse / diff / 兄弟機能）

| 機構 | 相互作用と方針 |
| --- | --- |
| **P2c routing / trunks / marks**（ADR-20260715-03） | `groupBands != null` gate（`layout.ts:1461`）で drill でも自動発火する（実測済み）。「grouped（展開）ビュー専用の 3 パス」という ADR の原則は「grouped な drill ビュー」を自然に含むと解釈し、変更しない。柵は [TPL-20260711-02]（crossings + penetrations の両計測）を drill ケースへ拡張 |
| **collapse / stub** | stub id は single-context で `__group_collapsed_<gid>__`（`group-collapse.ts:25-29`）。drill slice は常に単一コンテキストなので multi-system の `<sys>` namespace 問題は再発しない。app の `collapsedGroups` state は view-state として drill 前後で共有される（boundary id はレベル非依存なので自然に意味を保つ）— 挙動として妥当だが AT で目視確認する |
| **diff-mode**（ADR-20260716-01） | diff は `compileSystemDiff`（system root）のみで drill diff は存在しない。`mergedBoundaryIndex` backfill（`index.ts:1348-1353`）は axis map レベルの操作なので本件と直交。**diff × drill grouping は out of scope のまま** |
| **in-place expansion**（#1921 / #1923、ADR-20260714-04） | `expandedContainers` は「ungrouped system view のみ」で Group-by と排他（`useSystemView` が axis 有効時に suppress）。この排他は本件でも変えない。将来 #1923 Phase 2 で mixed-LOD × grouping を合成する際、本件のレベル交差セマンティクスが前提になる（expand された子の bucket は `expandMembership` — `layout.ts:1051-1052` — が既に担う） |
| **multi-system root**（#1884） | drill slice は単一 system 文脈のため per-(system, team) フレームの機構と干渉しない |
| **legend**（ADR-20260611-02） | 独立機能だが、per-level exact-match の前例として本件のセマンティクスの先行事例。`legendScopeForLogicalSlice` を gate に転用していた結合が Phase 1 で解ける（legend 用途は不変） |

## experimental gating / changeset の扱い

- 本拡張後も `boundary` は **experimental のまま**（後方互換は約束しない）。stable 昇格は
  [ADR-20260713-01] の gate（karasu-nest corpus の実利用証拠）を通る。本件は「experimental 層内の
  挙動確定 + surface 間不整合の解消」であり、昇格判断ではない — が、**experimental notation の
  挙動に触れる changeset** に該当するため、`docs/process.md` §リリース運用に従い PR description で
  gate 判断（据え置き + 挙動確定の根拠）を明示する。
- changeset は Phase 1a / Phase 2 とも `@karasu-tools/core` と `karasu` の**両方**を minor で
  名指す（`.claude/rules/changesets.md` の cascade 非対称性）。

## AT 案（人間の目視確認が必要な項目のみ — 実装 PR で `docs/acceptance/1983-*.md` に起こす）

自動化可能な検証（フレームの有無・membership・byte 不変・診断発火）はすべて上記テスト計画側に
置く。目視が必要なのは「読める配置か」の判断を含む以下のみ:

1. **手動**: boundary の drill member を含む examples を app で開き、Group by: **Boundary** の
   まま service へ drill → nested domain 群に枠が出て、**配置が読める**（枠と ghost・エッジが
   視覚的に破綻しない — P2c が drill で発火した結果の目視）。domain へさらに drill しても同様。
2. **手動**: drill ビューで枠の ⊖ → member だけが `<Boundary> (N)` stub に畳まれ、ghost と
   non-member が残る。⊕ で戻る。breadcrumb で root へ戻っても Group-by 状態が破綻しない。
3. **手動**: entity view（Phase 1 の新規配線面）で entity member に枠が出て、FK エッジ表示と
   両立して読める。
4. **手動**: Show All Layers / Open All Views の export で、各レベル band に枠が出た出力が
   1 枚の SVG として読める（band 間で枠が視覚的に混線しない）。

## 未解決の問い / 決めないこと

- **Phase 1 の着手タイミング**: Issue は「this extension is also gated on corpus evidence」と
  書いたが、実測により本件は「新挙動の追加」ではなく「出荷済み挙動の正規化 + 不整合解消」で
  あることが判明した。corpus を待つ対象は stable 昇格であって Phase 1 ではない、というのが
  本 doc の整理だが、**着手順の最終判断（他の comprehension 課題との優先度）はレビューに委ねる**。
- **`contains-target-not-groupable` の対象 kind 集合の確定**（resource / infra leaf 以外に
  「どのビューでも描画されない kind」が無いか、view-extract の全列挙で確定 — Phase 2 の
  実装時課題）。
- **usecase 直下の `resource` を描く view が将来生えた場合**、診断の対象 kind から外す再判断が
  要る（診断とビュー集合の同期を Phase 2 のテストで機械化できるか）。
- **collapse 状態・Group-by 状態の URL / Share payload への符号化**は #1838 系の既存
  follow-up 枠のまま（drill との組み合わせで面が増えるが、本件では扱わない）。
- **team 軸の spec 記述**（`owns` で nested domain を掴んだ場合のレベル交差）を boundary と
  同じ PR で明文化するか、別 Issue に切るか（実装時判断）。
