# facet overlay の実装設計 — multi-select 強調・多重所属の描画・legend 掲出（Part B slice 2）

- **日付**: 2026-07-30
- **ステータス**: 検討中
- **Issue**: [#2174](https://github.com/kompiro/karasu/issues/2174)
- **関連**:
  - 引き金 Issue: [#2174](https://github.com/kompiro/karasu/issues/2174)（Part B slice 2）。親 [#2160](https://github.com/kompiro/karasu/issues/2160)（Part B）／ [#2065](https://github.com/kompiro/karasu/issues/2065)（program）。前提 slice 1 [#2173](https://github.com/kompiro/karasu/issues/2173)（merged）
  - 上位 Design Doc: [`tags-and-facets.md`](tags-and-facets.md)（語彙 register と facet の形）／ [`facet-grammar-and-model.md`](facet-grammar-and-model.md)（slice 1 の実装設計 — `facetIndex` の形と 1:N 原則）
  - 関連 ADR: [ADR-999](../adr/999-legend-in-use-fallback.md)（legend footer の machinery）、[ADR-833](../adr/833-diagram-legend-syntax.md)（legend 構文 — 対話的 legend は defer）、[ADR-1858](../adr/1858-system-view-group-by-team.md) / [ADR-1974](../adr/1974-boundary-declaration-syntax.md) / [ADR-2036](../adr/2036-scoped-boundary-declaration.md)（Group-by 軸 — overlay が**直交**すべき相手）、[ADR-21](../adr/21-two-layer-rendering.md)（layout と描画の二層）、[ADR-1820](../adr/1820-notation-promotion-gate.md)（experimental 着地）、[ADR-1368](../adr/1368-adopt-shadcn-ui.md)（app の UI プリミティブ）、[ADR-832](../adr/832-no-runtime-authz-modeling.md)（値言語を入れない fence — overlay は選択状態であって `.krs` に書かない）
  - 関連 TPL: 下記 [Related TPLs](#related-tpls)
  - コード: `packages/core/src/renderer/svg-renderer.ts`、`packages/core/src/renderer/svg-builder.ts`（`buildLegendFooter`）、`packages/core/src/renderer/layout.ts` / `layout-types.ts`、`packages/core/src/renderer/group-collapse.ts` / `category-collapse.ts`、`packages/core/src/compile/compile.ts`、`packages/app/src/components/PreviewColumn.tsx`、`packages/app/src/hooks/useAppViews.ts` / `useSystemView.ts` / `useViewSvg.ts`、`packages/i18n/src/{types,en,ja}.ts`

## 背景・課題

slice 1（#2173）で `facet` 宣言・`facets` プロパティ・`facetIndex`（1:N）・診断・fmt・spec が入った。
ただし**描画面は空**で、spec も「overlay は後続 slice」と明記している。
[TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md) の観点では、
slice 1 は「診断という効果を持つ」ことで暫定的に第 4 状態（受理・無効果）を回避しているだけで、
本来の効果（所属が図から読める）はまだ無い。本 slice がその interim-inert 状態を解消する。

上位 doc が (B3) で「overlay は v1 から複数 facet の同時表示（multi-select + 色割り当て）」まで
決め、**多重所属要素の表現は実装 Issue で詰める**と残した。本 doc がそこを詰める。

解くべき問いは 5 つ:

1. overlay を **renderer（SVG に焼く）**で描くか、**app（DOM/CSS で後付け）**で描くか。
2. **多重所属**（1 要素が複数の選択中 facet に属する）をどう描くか。
3. **どこまで減光する**か（ノード / コンテナ枠 / エッジ / Group-by の band）。
4. **色の割り当て**をどう安定させるか（選択順か、モデル内の既知順か）。theme との関係。
5. **legend** に何をどう出すか（ADR-999 の machinery をどう使うか）。

加えて、既存機構との噛み合わせ 2 点 — **畳み込み（collapse stub）を跨いで装飾が残るか**
（[TPL-1886](../test-perspectives/TPL-1886-rekey-transform-preserves-per-element-decoration.md)）と、
**選択状態がどのサーフェスまで届くか**
（[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md) /
[TPL-1983](../test-perspectives/TPL-1983-view-state-gate-parity-across-surfaces.md)）。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| 所属データ | `KrsFile.facetIndex: Map<nodeId, Set<facetId>>`（merge 後に再構築）、宣言は `KrsFile.facets: FacetBlock[]`（`label` / `description` / `link`） |
| 描画オプション | `RenderOptions`（`svg-renderer.ts:82`）に `groupBy` / `boundaryIndex` / `nodeDiffMeta` / `legends` / `legendUsage` などが並ぶ。`compile()` が `krsFile` から詰めて渡す |
| ノード描画 | `renderNode()`（`svg-renderer.ts:956`）が `<g data-node-id data-node-kind data-diff-state …>` を吐く。減光の既存手段は wrapper の `opacity`（`GHOST_OPACITY = 0.3`）と `style.opacity` |
| コンテナ描画 | `renderContainer()` が `<g data-container-id data-kind-band data-group …>` |
| Group-by の band | layout が `containers`（`group: true`）として返し、`groupLabels` でタイトルを付ける。overlay とは別レイヤ |
| legend | `buildLegendFooter(legends, scope, sheets, width, palette, usage)` が band を返し、`renderFromLayout` が `translate(0,height)` で下に置き viewBox を伸ばす。`legends.length > 0 && viewScope` のときだけ呼ばれる |
| 畳み込み | `collapseGroups` / `collapseCategories` が member を 1 つの stub に畳み、`remapEndpoint` で端点を書き換える。diff 装飾は `foldedEdgeDiffState` として **再導出**して stub に付け直している（#1886） |
| 描画サーフェス | live: `compile` / `compileProject`（drill-down も viewPath 経由でここ）。static: `buildDrillDownSvg` / `buildAllLayersSvg` / `buildAllViewsSvg` / `renderEntityView`（いずれも `groupBy` を末尾 positional で受け取り済み） |
| app の view state | `useAppViews` の `useState`（`groupBy` / `collapsedCategories` / `collapsedGroups` / `expandedContainers`）→ `useSystemView`（compile options）と `useViewSvg`（static builders）へ。URL hash や share bundle には載っていない |
| toolbar | `PreviewColumn` の `preview-toolbar`。Group-by は `<select>`、その他は shadcn `Button`（`variant="actionable"` + アイコン+テキスト） |
| `facets` を受理する kind | 14 種（`system` / `user` / `client` / `service` / `domain` / `usecase` / `resource` / `entity` / `database` / `queue` / `storage` / `table` / `queue-item` / `bucket`）。**deploy unit・`team` / `member` は受理しない**（`reference-data.ts`） |

## 制約・前提

- **既定描画への影響ゼロ**（上位 doc の中核制約）: facet を 1 つも選択していないとき、出力 SVG は
  **今日とバイト単位で同一**。これはテストで固定する（下記 (7)）。
- **Group-by と直交**: overlay は per-element の塗りであり、band / frame の geometry には一切
  触らない。*Group by: team* / *boundary* と**同時に**見える（Issue #2174 の AT 必須項目）。
- **drill を跨いで断片化しない**: 所属は要素の属性なので、どの階層を描いていてもその階層に居る
  要素に同じ規則で塗る。
- **`.krs` に選択は書かない**: overlay の選択は viewer の状態であり、モデルの事実ではない。
  facet を狙う styling は slice 3（`.krs.style` セレクタ）の担当。
- **experimental**: facet は ADR-1820 の experimental 着地中。overlay の見た目・属性名は
  promotion までは変わりうる。
- out of scope: `.krs.style` の facet セレクタ（slice 3）、概観 / 監査パネル・examples（slice 4）、
  edge への `facets`、CLI の overlay フラグ（下記「未解決の問い」）、明示的除外の tri-state（B5）。

## 過去決定の確認

- `docs/adr/` を `facet` / overlay / 強調 / フィルタで grep。`status: not_adopted` の 5 本
  （ADR-7 / 45 / 104 / 105 / 284）はいずれも本テーマと無関係。**衝突する却下決定は無い**。
- 隣接する却下は [ADR-833](../adr/833-diagram-legend-syntax.md) の「**対話的 legend**（クリックで
  フィルタ）は defer」。本 slice は legend をクリック可能にはせず、選択の入口を toolbar に置く
  ので、この defer は維持される（legend は overlay の**結果を説明する**だけ）。
- [ADR-1974](../adr/1974-boundary-declaration-syntax.md) の「Group-by 軸は排他」は **boundary /
  team の軸選択**についての決定であり、overlay はその軸選択に参加しない別レイヤ。上位 doc が
  「facet はどの view 状態でも重畳できる overlay であるべき」と明記しており、整合している。
- [ADR-832](../adr/832-no-runtime-authz-modeling.md) の fence は本 slice でも保たれる — overlay は
  選択 UI と描画であって、`.krs` の語彙は 1 語も増えない。

## 検討した選択肢

### 論点 1: overlay をどの層で描くか

#### 案 1-A: renderer で SVG に焼く（採用）

`RenderOptions` に overlay 状態を足し、`renderFromLayout` が per-element に装飾と減光を出力する。

- **メリット**: export SVG / All Layers の iframe / `karasu render` の静的バンドルでも overlay が
  そのまま残る。legend band は renderer にしか描けないのでどのみち renderer 側の実装が要り、
  ノード装飾だけ app に置くと **2 箇所に分裂**する。VS Code preview など別サーフェスにも
  自動で乗る（TPL-1983）。
- **デメリット**: 選択のたびに再コンパイル・再レイアウトが走る（既存の `groupBy` と同じコスト）。

#### 案 1-B: app が DOM/CSS で後付けする

`data-facet` 属性だけ renderer が出し、app が CSS で強調する。

- **メリット**: 選択の切り替えが再コンパイル無しで速い。
- **デメリット**: export した SVG に overlay が乗らない（見えているものを保存できない）。
  legend band を app 側で描けないので legend だけ別実装になる。他サーフェスに乗らない。

→ **案 1-A**。ただし `data-facet-member="pii pci"` 属性は**併せて出す**ので、将来 app 側で
クリック連携や CSS 強調を足す道は塞がない（e2e の assertion 点にもなる）。

### 論点 2: 多重所属の描画

| 案 | 内容 | 評価 |
| --- | --- | --- |
| 2-A: 同心リング（採用） | ノード外周に色付き矩形の輪郭を、所属数だけ外側へ重ねる（幅 3px・間隔 1px） | 形状非依存（bbox 基準）なので icon / shape 両モードで同一に効く（TPL-1001）。N が増えても順序が保たれ読み取れる |
| 2-B: 縁取りの分割 | 上辺 / 右辺 …と辺ごとに色を変える | 小さいノード・icon モードで破綻。どの色がどの facet か読み取れない |
| 2-C: 主 facet 1 色 + `×N` バッジ | 1 色だけ塗り、残りはバッジで件数 | 多重所属を**隠す**。1:N を model 層の原則にした設計意図（TPL-2161）に反する |
| 2-D: 背景色の混色 | 所属色をブレンドして塗る | 混色は元の色に戻せない（読み取り不能）。既定のノード塗り（style cascade）を壊すので「既定描画への影響ゼロ」とも噛み合わない |

→ **案 2-A（同心リング）**。リング色の順序は論点 4 の**既知 facet 順**に従うので、選択の増減で
リングの並びが入れ替わらない。リング本数に上限は設けない（実務上 2〜3、破綻しても内側から
読める）。

### 論点 3: 減光の対象範囲

overlay の可読性は「メンバーが目立つ」だけでなく「非メンバーが引く」ことで決まる。どこまで引くか:

| 要素 | 決定 | 理由 |
| --- | --- | --- |
| ノード（非メンバー） | `opacity` を `FACET_DIM_OPACITY = 0.28` に落とす | 主目的。ghost（0.3）と近いが別定数にして意味を分ける |
| コンテナ枠 | **減光しない**（メンバーならリングを付ける） | 枠はレイアウトの読み取り基盤。薄くすると「どこに居るか」が読めなくなり overlay の価値を下げる |
| エッジ | **端点の片方でもメンバーなら通常、両端非メンバーなら減光** | 「強調集合が外とどこで接しているか」が overlay の主用途（`requires_auth` の認証境界）。全エッジを通常のままにすると減光したノードの上に明るい線が残って読めない |
| Group-by の band / frame | **一切触らない** | 直交性そのもの。band が減光すると「同時に見える」という AT が壊れる |
| 畳み込み stub | 集約した元ノードの**所属の和集合**でリングを描く。和集合が空なら減光 | TPL-1886。fold 規則を明示しないと「畳んだ瞬間に overlay が消える」silent な劣化になる |

### 論点 4: 色の割り当てと安定性

- 色は **core が持つ固定パレット**（8 色。dark / light 双方でコントラストの出る中彩度）。
  app のチェックボックスに出す色ドットも同じ関数を呼ぶ（SSOT — 図と UI で色がずれない）。
- 割り当ての基準:
  - 案 4-A: **選択順**（1 番目に選んだ facet が色 1）→ 途中の facet を外すと**残りの色が動く**。
  - 案 4-B: **モデル内の既知 facet 順**（`facet` 宣言順 → 宣言の無い参照 id を辞書順で後置）
    のインデックス % 8 → 選択の増減で色が動かない。**採用**。
- theme: 減光は `opacity` なので theme 非依存。リング色は 1 セットで両 theme に載せる
  （[TPL-1697](../test-perspectives/TPL-1697-kind-style-sets-text-color-per-theme.md) が問う
  「theme ごとに読めるか」は、彩度と明度を中庸に取ることで満たす）。

### 論点 5: legend への掲出

- 選択中の facet ごとに **swatch = 割当色 / ラベル = 宣言の `label`（無ければ id）** の行を
  legend band に足す。既存の `legend` ブロックとは**積み重なる**（ブロックとして 1 つ増える形）。
- 実装は `buildLegendFooter` に「合成ブロック」を 1 つ渡せるようにする（ADR-999 の machinery を
  そのまま使う）。band の背景・区切り線・行送りは既存コードが持っているので重複実装しない。
- **scope に縛られない**: 既存 legend は `legendScopeMatches` で階層ごとに出し分けるが、overlay の
  legend は**選択している限りどの階層でも出す**。色の意味が読めない図を作らないため
  （[TPL-1223](../test-perspectives/TPL-1223-scoped-glance-drill-down.md) の「その階層の語彙だけ
  見せる」は満たしている — 選択中の facet はまさにその階層で見えている語彙）。
- ブロック見出し（"Facets" / 「ファセット」）は app が i18n 文字列を渡す。core は英語既定値を
  持つ（`emptyLabels` / `annotationBadgeLabels` と同じ作法）。

### 論点 6: 選択状態の置き場と鮮度

- 置き場は `useAppViews` の `useState<string[]>`（`groupBy` と同じ層）。URL hash / share bundle への
  永続化は **しない**（`groupBy` も未対応で、範囲を広げると #1094 の hash 仕様と交差する）。
- **鮮度**: モデルを編集して facet 宣言が消えたら、選択集合から自動的に落とす
  （[TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)）。selector に出す候補は
  「宣言済み facet ∪ `facetIndex` に現れる facet」で、選択はそれと交差させてから compile に渡す。
- selector 自体の可視条件: 候補が 0 件なら **描かない**（Group-by selector が
  `groupByAxes.length > 0` で消えるのと同じ作法）。facet を使っていないモデルの toolbar は不変。

### 論点 7: 対象サーフェスと parity

`groupBy` が通っている経路に**同じ形で**通す（TPL-219 / TPL-1983）:

| サーフェス | 扱い |
| --- | --- |
| `compile` / `compileProject`（live system view + drill-down） | `CompileOptions.selectedFacets?: readonly string[]` |
| `buildDrillDownSvg` / `buildAllLayersSvg` / `buildAllViewsSvg` / `renderEntityView` | 末尾 positional で `selectedFacets` を追加（`groupBy` の直後） |
| deploy view / org view | **対象外**。deploy unit・`team` / `member` は `facets` を受理しない kind なので、渡っても該当ノードが 0 件。`renderFromLayout` は共有だが option 未指定で no-op |
| CLI `karasu render` | フラグを足さない（下記「未解決の問い」） |

### 論点 8: 実装の座り — 所属を renderer にどう届けるか

- 案 8-A: `LayoutNode.facets?: string[]` を足して layout が運ぶ。→ ノード構築点が logical /
  deploy / org / ghost に分かれており、足し忘れが起きやすい。
- 案 8-B（採用）: `RenderOptions.facetOverlay` に **`facetIndex` と選択の解決結果**を渡し、
  renderer は `nodeId`（deploy の `container::unit` 形は `layoutNode.id` に fallback。diff 装飾と
  同じ引き方 — [TPL-1666](../test-perspectives/TPL-1666-style-lookup-matches-layout-id-form.md)）で
  引く。`boundaryIndex` と同じ既存作法。
- 畳み込みの fold は layout 側でしか作れないので、`LayoutOptions.facetIndex` を受けて
  `LayoutResult.foldedFacetMembership?: Map<stubId, Set<facetId>>` を返す
  （`foldedEdgeDiffState` と**同型**）。renderer は stub の所属をこちらから引く。

## 比較

| 観点 | 案 1-A renderer（採用） | 案 1-B app CSS |
| --- | --- | --- |
| export / All Layers / 静的バンドル | 乗る | 乗らない |
| legend band | 同じ層で描ける | 別実装が要る |
| 他サーフェス（VS Code preview 等） | 自動で乗る | 乗らない |
| 選択切り替えの速さ | 再 compile（`groupBy` と同等） | 速い |
| 実装の分散 | 1 箇所 | 2 箇所 |

## Related TPLs

| TPL | 本設計での取り込み |
| --- | --- |
| [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md) — 受理語彙は効果を持つ | 本 slice が slice 1 の interim-inert を解消する。spec の「今は描画に影響しない」注記を overlay の記述に差し替える |
| [TPL-1886](../test-perspectives/TPL-1886-rekey-transform-preserves-per-element-decoration.md) — 畳み込みは per-要素装飾を再導出する | 論点 3 / 8。`foldedFacetMembership` で stub に所属を fold し、**畳んでも overlay が消えない**ことをテストで固定する |
| [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md) — 並行する描画経路は同じ options を運ぶ | 論点 7。live / drill-down / all-layers / all-views / entity view の 5 経路すべてに `selectedFacets` を通す |
| [TPL-1983](../test-perspectives/TPL-1983-view-state-gate-parity-across-surfaces.md) — view 状態のゲートは全サーフェスで同一 | 論点 7。「deploy / org は対象外」を**設計として明記**し、片側だけの暗黙の差にしない |
| [TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md) — 宣言された多重所属を捨てない | 論点 2。overlay は所属の**全件**を描く（案 2-C の「主 facet 1 件」を却下した根拠） |
| [TPL-1001](../test-perspectives/TPL-1001-display-mode-cross-surface.md) — display mode を跨いで同じ機能が効く | 論点 2。リングは bbox 基準なので icon / shape 両モードで効く。両モードのテストを置く |
| [TPL-1402](../test-perspectives/TPL-1402-involutive-toggle-renders-both-states.md) — トグルは両状態を描く | 選択 → 解除で**元に戻る**（後述の byte-identical テストが復路を固定する） |
| [TPL-2044](../test-perspectives/TPL-2044-svg-interactive-control-paints-last.md) — 対話的 chrome は最後に描く | リングと減光はノード層の一部として描き、category / group / expand の各コントロールより**前**に置く（コントロールがリングに埋もれない） |
| [TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md) — 派生 state の陳腐化 | 論点 6。宣言が消えた facet を選択に残さない |
| [TPL-1697](../test-perspectives/TPL-1697-kind-style-sets-text-color-per-theme.md) — theme ごとに読めるか | 論点 4。dark / light 双方で読めるパレットを 1 セットで用意する |
| [TPL-1666](../test-perspectives/TPL-1666-style-lookup-matches-layout-id-form.md) — lookup はレイアウト id 形に一致させる | 論点 8。deploy の `container::unit` 形に備えて `layoutNode.id` fallback を持つ |
| [TPL-1716](../test-perspectives/TPL-1716-user-facing-surface-docs-sync.md) — user-facing な面は docs と同期する | 新しい toolbar コントロールを `docs/tools/app.md`（+ja）に同 PR で書く |
| [TPL-1790](../test-perspectives/TPL-1790-root-svg-viewbox-responsive.md) — root SVG の viewBox | legend band の追加分だけ viewBox を伸ばす（既存 footer と同じ扱い） |
| [TPL-1223](../test-perspectives/TPL-1223-scoped-glance-drill-down.md) — 階層ごとの語彙だけ見せる | 論点 5。overlay legend は選択中の facet に限る（モデル内の全 facet は出さない） |

### proactive TPL の要否（3-Yes ルール）

**1 件起こす**: 「**opt-in な視覚レイヤは、無効時に出力がバイト単位で不変であること**」。

- 横展開しうるか → **Yes**（diff mode / Group-by / collapse / 次 slice の facet セレクタ、
  今後の overlay 系すべてに効く）
- 構造的に再発しうるか → **Yes**（オプションを追加すると、未指定でも属性 1 個・空 `<g>` 1 個が
  混ざり込む形の退行が起きる。差分は目視レビューでは見えない）
- 既存 TPL に未掲載か → **Yes**（TPL-1402 は「両状態が描けること」、TPL-1983 は「ゲートの
  サーフェス間一致」で、**無効時の出力同一性**を要求する観点は無い）

`docs/spec/syntax.md` の facet 節を改訂するので、`CLAUDE.md` の spec 改訂ルールに従い
節末尾の `> Related TPLs:` と TPL 側 `## 派生元 spec` を同 PR で双方向に張る。

## 現時点の方針

**overlay は renderer に焼き（案 1-A）、多重所属は同心リング（案 2-A）で描き、色は既知 facet 順で
安定に割り当て（案 4-B）、legend は ADR-999 の footer に合成ブロックとして積む（論点 5）。**
減光はノードとエッジに限り、コンテナ枠と Group-by の band には触れない（論点 3）— これが
「Group-by と同時に見える」という本 slice の中核要件を構造的に保証する。

### 実装の指針

1. **core / overlay モデル** — `packages/core/src/renderer/facet-overlay.ts` を新設:
   `FACET_OVERLAY_COLORS`（8 色）、`knownFacetIds(file)`（宣言順 → 参照のみの id を辞書順）、
   `resolveFacetOverlay(file, selected)` → `{ entries: {id,label,color}[], index }`。選択が空 /
   交差が空なら `undefined` を返す（= overlay 無効）。
2. **layout** — `LayoutOptions.facetIndex` を受け、`collapseGroups` / `collapseCategories` の
   remap から `LayoutResult.foldedFacetMembership` を導出（`foldedEdgeDiffState` と同型）。
3. **renderer** — `RenderOptions.facetOverlay`。`renderNode` に所属色リストを渡してリングを描き、
   非メンバーは `opacity`。エッジは端点の所属で判定。`<g data-node-id …>` に
   `data-facet-member="pii pci"`（半角空白区切り、既知 facet 順）を出す。コンテナはリングのみ。
4. **legend** — `buildLegendFooter` に `extraBlock?: { title?: string; rows: {color,label}[] }` を
   追加。`renderFromLayout` の呼び出し条件を「既存 legend が該当する **または** overlay ブロックが
   ある」に広げる。
5. **compile** — `CompileOptions.selectedFacets`。`compile()` で `resolveFacetOverlay` を 1 回呼び、
   system view の `render()` に渡す。`buildDrillDownSvg` / `buildAllLayersSvg` /
   `buildAllViewsSvg` / `renderEntityView` にも同じものを通す（TPL-219）。
   `SystemCompileResult` に `facets: { id: string; label?: string }[]`（selector の候補）を追加。
6. **app** — `useAppViews` に `selectedFacets` state（候補との交差で自浄）→ `useSystemView` /
   `useViewSvg` へ。`PreviewColumn` に `Facets` ドロップダウン（shadcn `DropdownMenuCheckboxItem`
   を wrapper に追加。トリガーは `variant="actionable"` + アイコン+テキスト
   `◎ Facets (2)`、各項目は色ドット + `label`（無ければ id））。`activeView === "system"` かつ
   候補が 1 件以上のときだけ描く。i18n キー `preview.facets.*` を en / ja に追加。
7. **テスト**
   - byte-identical: facet を持つモデルで `selectedFacets` 未指定 / 空配列の SVG が、facet を
     消したモデルの SVG と**同一**であること（proactive TPL の機械検証）。
   - 1 facet 選択でメンバーにリング・非メンバーが減光、`data-facet-member` が出る。
   - 多重所属で**リングが所属数だけ**出て、色順が既知 facet 順に一致する。
   - Group-by team / boundary と**同時**に有効（band の frame と overlay のリングが同一 SVG に
     共存する assertion）。
   - collapse（team stub / category stub）後も stub にリングが残る（TPL-1886）。
   - icon / shape 両 display mode（TPL-1001）。
   - legend に選択中 facet の行が出る／未選択では出ない。宣言 `label` 無しは id で出る。
   - drill-down / all-layers / all-views / entity view の各経路で overlay が乗る（TPL-219）。
   - app: 候補 0 件で selector 非表示、選択のトグル、宣言が消えたときの自浄（TPL-1032）。
8. **spec / docs** — `docs/spec/syntax.md`（+ja）facet 節の「This slice has no visual effect yet」を
   overlay の記述に差し替え（選択は viewer 状態であり `.krs` には書かない旨、legend への掲出、
   セレクタ / 概観は後続 slice）。`docs/tools/app.md`（+ja）に Facets コントロール。
   proactive TPL 1 本と双方向 back-ref。
9. **changeset** — `@karasu-tools/core` + `karasu` を minor（renderer の挙動追加）。
10. **AT** — `docs/acceptance/2174-facet-overlay.md`。目視項目は Issue #2174 の 3 点:
    Group-by team / boundary と同時表示、`requires_auth` が drill を跨いで読める、
    overlay 非選択時の描画が不変。
11. **ADR 昇格** — 本 doc 単独では昇格させない。Part B 全 slice 完了後に
    [`tags-and-facets.md`](tags-and-facets.md) / [`facet-grammar-and-model.md`](facet-grammar-and-model.md)
    と統合して `docs/adr/2065-tags-and-facets.md`（`refines: [ADR-832]`）へ昇格する。

### 影響範囲・マイグレーション

- **既存ユーザーへの影響**: なし。overlay を選択しない限り出力は不変（byte-identical テストで
  固定）。`.krs` / `.krs.style` の構文は 1 語も変わらない。
- **ドキュメント**: `docs/spec/syntax.md`+ja（facet 節）、`docs/tools/app.md`+ja、
  proactive TPL 1 本、AT 1 本。
- **examples**: 変更しない（facet を使う feature-sample は slice 4）。

## 未解決の問い / 決めないこと

- **CLI からの overlay 指定**（`karasu render --facet pii`）は本 slice では入れない。静的出力に
  「選択状態」を持ち込む是非は、slice 4 の概観 / 監査レポート（同じく「facet X の全要素」を
  静的に出す機能）と一緒に決めるほうが register が揃う。
- **overlay 選択の共有 / 永続化**（URL hash・share bundle）は範囲外。`groupBy` も未対応で、
  一緒に決めるべき論点（#1094 の hash 仕様）。
- **edge への `facets`** は v1 対象外のまま（上位 doc）。エッジの減光は端点からの導出に留める。
- リング以外の強調（グロー・ハッチング）は、experimental の間の実測フィードバックを待つ。
