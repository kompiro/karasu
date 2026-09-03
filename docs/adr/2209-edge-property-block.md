---
id: ADR-2209
title: エッジのプロパティブロックを additive に足し、位置引数 label は正式な shorthand として残す
status: accepted
date: 2026-09-01
topic: edges
depends_on:
  - ADR-19
  - ADR-1314
  - ADR-438
related_to:
  - ADR-1096
  - ADR-2065
  - ADR-2173
  - ADR-2174
  - ADR-2208
  - ADR-832
scope:
  packages: [core, app, i18n]
assumptions:
  - "symbol: packages/core/src/parser/parser.ts :: parseEdgeBlock"
  - "symbol: packages/core/src/types/ast.ts :: unionEdgeFacets"
  - "symbol: packages/core/src/renderer/facet-overlay.ts :: facetWalkRoots"
  - "file: docs/acceptance/edge-property-block.md"
  - "file: docs/acceptance/edge-facets.md"
---

# ADR-2209: エッジのプロパティブロックを additive に足し、位置引数 label は正式な shorthand として残す

- **ステータス**: 決定済み
- **日付**: 2026-09-01
- **Issue**: [#2209](https://github.com/kompiro/karasu/issues/2209)（スライス A = [#2543](https://github.com/kompiro/karasu/issues/2543) / PR [#2633](https://github.com/kompiro/karasu/pull/2633)、スライス B = [#2544](https://github.com/kompiro/karasu/issues/2544) / PR [#2657](https://github.com/kompiro/karasu/pull/2657)）

## 背景

[ADR-19](19-required-id-label-as-property.md) は id を必須にし `label` をプロパティへ移したが、
残課題節に 1 件だけ残していた ——「エッジの inline label（`A -> B "label"` 構文の
プロパティ化）は別 Issue で扱う」。node 系の位置引数 label は #2133 と
[ADR-2208](2208-positional-label-error-promotion.md) で撤去され、言語に残る位置引数 label は
エッジのものだけになった。

ただしエッジの label は、撤去できた 3 つとは前提がまったく違う。撤去できたのは
**spec に載ったことのない parser の leniency** だったので、撤去そのものが凍結 spec への
準拠だった。エッジの label は spec の文法行に載っており、
[ADR-1314](1314-krs-spec-v1-freeze.md) が凍結した面そのものである。しかも代替表記が存在しない。

したがって本件は「同じ掃除の最後の 1 件」ではなく、**エッジの label を位置引数のまま
仕様として認めるかどうかの決め直し**だった。

実測（`main` の eff605f7 時点）が判断を変えた点が 3 つある。

- `examples/**` のエッジ 284 本のうち **282 本が著者の書いた label を持つ**。移行対象は
  examples 282 + docs 147 = 429 箇所で、しかも言語で最も打鍵される構文である。
- roadmap の gap 表は edge の protocol / cardinality を「当面 `description` / `link` の散文に
  逃がす」と書いていたが、**エッジに `description` も `link` も無かった**。逃がし先として
  書かれたものが存在しなかった。
- spec は facet について「Membership is imposed from outside the architecture, so no kind is
  structurally excluded」と書いた直後に「Edges do not take `facets` in v1」と続けていた。
  [ADR-2065](2065-tags-and-facets.md) / [ADR-2173](2173-facet-grammar-and-model.md) /
  [ADR-2174](2174-facet-overlay.md) は edge に一度も言及しておらず（grep 実測 0 件）、
  除外の理由はどこにも記録が無い。

つまり実際に足りていなかったのは「label の書き方」ではなく、**label 以外を書く場所**だった。

## 決定

エッジに末尾の `{ … }` プロパティブロックを **additive に**足し、位置引数
`A -> B "calls"` を正式な shorthand として残す。ADR-19 は supersede せず、
**エッジについて refine する**。

```krs
A -> B "calls"                                  // shorthand（従来どおり、正式・canonical）

A --> B [async] #orderPlaced {                  // block: label 以外を書きたいときだけ
  label       "places an order"
  description "At-least-once. Retries are idempotent on orderId."
  facets      pii
  link        "https://runbook.example.com/order-placed" "Runbook"
}
```

### 決定事項

1. **ブロックが受理するのは `label` / `description` / `link` / `facets` の 4 つ**で、
   綴りは node のプロパティと完全に同じ（`link` は URL が先で label は任意・複数可、
   `facets` はカンマ区切りで行を繰り返すと累積し重複 id は畳まれる）。tags と `#<id>` は
   node と同じくブロックの**外側**に置く。それ以外のキーワードは
   `unexpected-token-in-block` エラー。

2. **`karasu fmt` の畳み込み条件は 1 つ**、「ブロックが `label` 以外を持つか」。持たなければ
   shorthand に畳み、持てばブロックのまま保つ（`label` もブロック内へ移す）。
   条件が単一なので、label だけのブロックは安定形にならず、2 つの綴りが同じ事実の
   二重表現になることがない（[TPL-1415](../test-perspectives/TPL-1415-shared-vocabulary-dual-representation.md)）。

3. **位置引数とブロックの両方に `label` を書いたら `duplicate-edge-label`（error）**。
   片方を黙って勝たせる優先規則にはしない。

4. **受理した語彙は同じスライスで可視の効果を持つ**（[TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)）。
   `description` / `link` は左クリックで `EdgeDetailPanel` を開く（従来 集約 domain edge 専用
   だったものを通常エッジへ広げる）。`facets` は overlay の対象になり、
   `edge[facets=<id>]` セレクタが一致し、`facet-not-declared` がマージ後モデルで検証し、
   Membership overview に載る。

5. **エッジの facet 所属は id 引きの map に寄せず、レイアウトが持つエッジ実体から解決する。**
   エッジの `canonicalId` は base 形が衝突すると `undefined` になりうる
   （[ADR-1096](1096-edge-id-selector.md)）ので、id を鍵にすると衝突したエッジだけが
   静かに脱落する。

6. **派生エッジの所属は畳んだ中身の和集合**。集約 `"N domain edges"` と、グループ /
   カテゴリを畳んだときの stub エッジが対象。散文（`description` / `link`）は逆に落とす ——
   散文は 1 本のエッジを説明するが、所属は集合なので和集合が束について真になる。
   和集合なので 1:N は保たれる（[TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md)）。

7. **usecase 内の `resource` 行に facet を持たせる綴りは作らない。** その行は既に `facets` を
   受理するが、所属先は resource ノードである。同じ 1 行が文脈で node の所属にもエッジの
   所属にもなるのは [TPL-1415](../test-perspectives/TPL-1415-shared-vocabulary-dual-representation.md)
   が指す二重表現そのもので、エッジ側に所属を持たせたいなら別の綴りが要る（需要は未実測）。

8. **spec 2 文を受理側へ改訂する**（`syntax.md`「Edges do not take `facets` in v1」、
   `style.md`「**Nodes only.**」）。どちらも受理形が増える方向なので追加的変更であり、
   言語版は v1.x のまま。

## 理由

1. **ADR-19 の中核理由がエッジに転移しない。** ADR-19 が解いたのは `node.id ?? node.label` の
   フォールバックと「label が参照キーになる」壊れやすさで、どちらもエッジには存在しない。
   [ADR-1096](1096-edge-id-selector.md) が案C（label を identity の tie-break に使う）を
   却下した時点で、エッジの label が identity に触れないことは決着している。残る論拠は
   表記の対称性だけになる。

2. **位置引数形の撤去は v1.x では実行できず、v2.0 で払う対価が大きすぎる。**
   凍結面を破って得られるのが uniformity のみで、代償は 429 箇所の移行と、言語で最も
   打鍵される構文の可読性低下である。282/284 という比率は、この構文が周辺的な糖衣ではなく
   主要な書き味であることを示している。

3. **実需は「label の書き方」ではなく「label 以外の置き場所が無いこと」。** roadmap gap D は
   protocol / cardinality を `description` / `link` の散文へ逃がす前提で据え置いたのに、
   エッジにはその 2 つが無かった。ブロックはこの穴を埋め、位置引数形の撤去や追認は埋めない。

4. **facet の除外も同じ穴に由来する。** spec は「no kind is structurally excluded」と書いた
   直後にエッジを除外しており、ADR 側に理由の記録が無い。書く場所が無かったから外れていた
   のであって、エッジが概念に属さないからではない。PII を運ぶデータフローや PCI スコープ内の
   呼び出しは**そのエッジについての事実**で、端点ノードに付けるのは所属の場所を偽ることになる。

5. **ADR-19 案C の却下理由には期限付きの前提があった。** 「どちらを使えばいいか迷う」は
   フォーマッターが無かった 2026-03-23 の話で、[ADR-438](438-krs-formatter.md) の
   `karasu fmt` は 2026-04-10 に入った。今は決定事項 2 の単一条件で機械的に答えが出る。

## 却下した案

### 案1: ブロックを入れ、位置引数形を deprecate する（Issue の当初提案）

`A -> B "calls"` を v1.x で warning、v2.0 で error にし、corpus を移行する。

却下理由: v1.x では deprecate までしかできず決着が時期未定の v2.0 に預かる。移行対象が
429 箇所で、得られるものが uniformity だけ（書ける内容は 1 文字も増えない）。加えて
`A -> B { label "calls" }` は `A -> B "calls"` より明確に読みにくい —— node と違い
エッジの label は表示名ではなく関係そのもの（動詞）なので、位置引数であることに意味がある。

### 案2: ブロックを入れず、位置引数形を仕様として追認する

新構文を足さず、ADR-19 の残課題を「エッジは位置引数 label を正式形とする」で閉じる。

却下理由: 実装ゼロで今日閉じられるが、`description` / `link` / `facets` の置き場所が無い
ままになる。次に要望が出た時点で同じ議論をやり直すことになり、そのとき取れる手は
「位置引数のスロットを増やす」しかない。`A -> B "label" [tags] #id` は既に 4 スロットの
位置引数行で、5 つ目は明確に悪化する。

### 案3: 何もせず v2.0 まで持ち越す

却下理由: Syntax 2.0 は時期未定で、残課題が最長で無期限に開いたままになる。先送りしても
情報は増えない —— 判断材料（凍結面・corpus 実測・ADR-1096 の identity 決定）は既に揃っている。

### エッジ専用の `link` 構文を作る案

却下理由: node と同じ `link "<URL>" "<label>"` をそのまま使う。エッジ用に別形を作る理由が無く、
覚えることを増やすだけになる。表示本数の上限も設けない（node の詳細パネルと同じ扱い）。

### `description` / `link` を ⓘ ボタンや `EdgeContextMenu` に出す案

却下理由: ⓘ ボタンは node と同形になるが canvas 上の印が増え、label 衝突回避（#2048）と
node legibility（#2366）の作業に逆行する。`EdgeContextMenu` は実装が最小だが、操作メニューに
読み物を混ぜることになる。左クリックは集約 domain edge で既に「エッジ → パネル」として
動いているので、それを通常エッジへ広げるのが最小の追加になる。

## 影響

- **既存ユーザーへの影響なし。** 追加的変更であり、既存の `.krs` の解釈は変わらない。
  facet 未選択時の SVG は byte-identical のまま（[TPL-2174](../test-perspectives/TPL-2174-opt-in-visual-layer-is-inert-when-off.md)）。
- **spec**: `docs/spec/syntax.md` / `.ja.md`（§ Edge declaration › Property block、
  § Cross-cutting membership）、`docs/spec/style.md` / `.ja.md`（§ Facet selectors）、
  `docs/spec/diagnostics.md` / `.ja.md`（`duplicate-edge-label` / `facet-not-declared`）。
  `syntax.md` / `diagnostics.md` は reverse-architecture スキルが同梱しているので
  `pnpm run lint:skill-reference-bundle-sync` で同期する。
- **受け入れテスト**: [`docs/acceptance/edge-property-block.md`](../acceptance/edge-property-block.md)（スライス A）、
  [`docs/acceptance/edge-facets.md`](../acceptance/edge-facets.md)（スライス B）。
- **副次的な修正**: `renderEdge` がエッジの author 指定 `#<id>` を無条件に削っていた
  （`karasu fmt` が `edge#<id>` セレクタの対象を消していた）バグをスライス A で修正した。

## 関連

- [ADR-19](19-required-id-label-as-property.md) — id 必須化・label のプロパティ化。本 ADR が
  その残課題をエッジについて閉じる（supersede せず refine）
- [ADR-2208](2208-positional-label-error-promotion.md) — organization / team / member の
  positional label を error 化（兄弟決定。エッジだけが違う結論になった理由は上記「理由」1–2）
- [ADR-1096](1096-edge-id-selector.md) — `edge#<id>` セレクタ。エッジの label が identity では
  ないこと、および `canonicalId` が衝突時に `undefined` になりうることの出典（決定事項 5）
- [ADR-1314](1314-krs-spec-v1-freeze.md) — `.krs` v1.0 凍結。本 ADR の最大の制約
- [ADR-438](438-krs-formatter.md) — `.krs` フォーマッター。ADR-19 案C の却下理由を
  期限切れにした決定（理由 5）
- [ADR-2065](2065-tags-and-facets.md) / [ADR-2173](2173-facet-grammar-and-model.md) /
  [ADR-2174](2174-facet-overlay.md) — facet の register・文法・overlay。エッジ除外の出典であり、
  除外の理由が記録されていなかったこと自体が決定事項 8 の根拠
- [ADR-832](832-no-runtime-authz-modeling.md) — 実行時認可をモデル化しない。エッジの `facets` も
  「どの振る舞いをポリシーが覆うか」だけを言い、ポリシーの内容は `description` と `link` の
  散文に留まる
- [TPL-2542](../test-perspectives/TPL-2542-sugar-form-shares-one-ast-and-element-ranges.md) —
  本 ADR の決定 1–2 を裏付ける proactive TPL（スライス A で起票）
