---
id: ADR-2330
title: グループ軸とルーティング能力を分離し、両モードを 1 本の候補列で経路づける
status: accepted
date: 2026-08-05
topic: renderer
refines: [ADR-1859]
related_to: [ADR-968, ADR-1728, ADR-1185, ADR-1724, ADR-2048]
scope:
  concerns: []
assumptions:
  - "file: packages/core/src/renderer/routing-parity.test.ts"
  - "symbol: packages/core/src/renderer/edge-routing-groups.ts :: frameObstaclesFor"
  - "symbol: packages/core/src/renderer/edge-routing-groups.ts :: tryCorridorRoute"
  - "grep: packages/core/src/renderer/layout.ts :: routeGroupedEdges"
---

# ADR-2330: グループ軸とルーティング能力を分離し、両モードを 1 本の候補列で経路づける

- **日付**: 2026-08-05
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#2330](https://github.com/kompiro/karasu/issues/2330)（親）。スライス
    [#2362](https://github.com/kompiro/karasu/issues/2362) / [#2365](https://github.com/kompiro/karasu/issues/2365) /
    [#2363](https://github.com/kompiro/karasu/issues/2363) / [#2364](https://github.com/kompiro/karasu/issues/2364)
  - 設計（本 ADR に集約し削除）: `docs/design/ungrouped-routing-parity.md`（PR #2338）
  - refines: [ADR-1859](1859-system-view-p2c-grouped-edge-routing-and-marks.md)（P2c。本 ADR は
    その **AC-5「Group by: none は byte-identity で温存」** を置き換える。P2c の他の決定
    — gutter / mixed route・集約トランク・hop/junction マーク — はそのまま有効）
  - 関連 ADR: [ADR-968](968-orthogonal-edge-routing-skip-layer.md)（skip-layer チャネルルーティング。
    本 ADR で候補列の第 1 候補として存続）, [ADR-1728](1728-external-on-sides-layout.md)（external
    左右配置 — ungrouped 固有の配置として不変）, [ADR-1185](1185-parallel-edge-bundling.md)（edge
    identity 保持）
  - TPL: [TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md),
    [TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md),
    [TPL-1761](../test-perspectives/TPL-1761-external-side-placement-invariant.md),
    [TPL-1983](../test-perspectives/TPL-1983-view-state-gate-parity-across-surfaces.md)
  - コード: `packages/core/src/renderer/layout.ts` / `edge-routing-channels.ts` /
    `edge-routing-groups.ts` / `routing-parity.test.ts`

## 背景

ADR-1859（P2c）は grouped ビュー専用のルーティングパスを新設し、AC-5 として
「Group by: none は byte-identity で温存する」と決めた。その保証は
`if (groupBands)` という **gate（構造）** で与えられ、既存 `routeOrthogonalEdges`
へのフレーム対応の継ぎ足しは「ungrouped の決定論 snapshot を壊す」として却下された。

その後 grouped 側だけが強化され続けた結果、**既定ビュー（Group by: none）の品質が
opt-in ビューより低い**という逆転が固定化した。ungrouped は downward edge の 1 段
L 字しか持たず、塞がれれば直線に戻って貫通したままになる。実サンプル 12 本を計測
すると ungrouped に 10 件の貫通が残っていた。multi-system root に至っては port 分散
もルーティングも走らず、grouped にしてもエッジは直線のままだった。

一方で gate を緩めた先例は既に 2 つあった。in-place expansion（#1921/#1955）は
Group by: none でも `groupBands` を立てて grouped ルーターを走らせており、hop マークは
#1956 で ungrouped と共有済みだった。つまり grouped ルーターは team/boundary 固有では
なく **band 固有**であり、ungrouped キャンバス上で動く実績があった。

PoC（`spike/composed-router`）で AC-5 を破って計測したところ、**落ちた既存テストは
0 件**だった。AC-5 は gate という構造で守られていたのであって、テストで固定されて
いたわけではない。更新が必要だったのは commit 済み guide 図 3 枚のみだった。

## 決定

**グループ軸（none / team / boundary）とルーティング能力を独立の軸として扱い、
両ルーターモジュールを残したまま 1 本の優先順位付き候補列に合成して、全モードで
同じパイプラインを走らせる。**

```
straight（clear ならそのまま。斜め線を含む）
  → 内側 channel-L      （edge-routing-channels.ts — ADR-968）
  → 内側 corridor        （edge-routing-groups.ts — 本 ADR。ungrouped 限定）
  → side gutter / mixed  （edge-routing-groups.ts — ADR-1859 P2c-A + #1954）
```

各パスは前段が経路を決めたエッジ（`waypoints` あり）と迂回不要なエッジを飛ばす
ため、「最も近い clear な候補が勝つ」形になる。付随する決定は以下。

1. **`routeOrthogonalEdges` は外部から障害物提供関数を受け取る。** grouped では
   フレーム片を（`obstaclesFor` と同じ per-endpoint 免除で）渡し、内側 L が所属
   しないフレームを貫かないようにする。省略時は ADR-968 の挙動そのまま。
2. **後段の lane 分離・4 辺 port fan-out は両モードで走らせる**（TPL-1954）。
   band 順序を前提とする `groupBackward` 破線は grouped 限定のまま。
3. **内側 corridor は ungrouped 限定**。理由は「却下した案」を参照。
4. **multi-system root にも同じ候補列を配線する。ただし system ごとにスコープする。**
   障害物・content bounds・gutter x はすべて渡されたノード集合から導出されるため、
   キャンバス全体で 1 回走らせると、ある system 内のエッジが他の system の外側まで
   出てしまう。`placeExternalServicesOnSides` が既に採っている per-system スコープと
   同じ扱いにする。
5. **ungrouped では集約トランクを使わない**（計測して見送り。「却下した案」参照）。
6. **AC-5 の byte-identity を、`routing-parity.test.ts` の計測柵で置き換える。**
   実サンプルに対し貫通 0・collinear overlap 0・全交差に hop マークを assert し、
   grouped の交差数を pin して「ungrouped の改善が grouped の退行を隠す」ことを防ぐ。

## 理由

- **軸の直交性がコード構成に残る。** グループ化とルーティングは独立の関心で、
  boundary / team のどちらでも edge-routing の全能力が使え、グループなしでも
  gutter ルーティングが使える。経路形 1 つ = モジュール 1 つを保ったまま候補列で
  合成するので、以後の経路形追加も候補列への挿入で済み、改善が両モードに同時に効く。
- **grouped パスは frames が空集合なら自然に縮退する。** `obstaclesFor` /
  `contentBounds` の 2 箇所しか frames に触れないため、ungrouped では「ノード
  カードのみが障害物」になる。第 2 実装を書かずに ungrouped が gutter ルーティングを
  獲得できるのはこの性質による。
- **AC-5 を守るコストのほうが高くなっていた。** gate は「ungrouped を変えない」
  ことは保証したが「ungrouped が良いこと」は何も保証していなかった。実測で
  ungrouped の貫通 10 件が誰にも検出されないまま残っていたのが、その帰結である。
- **計測値**（実サンプル 12 本・18 レイアウト）:
  - ungrouped の貫通 **10 → 0**、grouped は全指標不変
  - ungrouped の交差 17 → 30（全数 hop マーク付き。ADR-1859 の「交差は表現で
    無害化する」スタンスの範囲内）
  - 内側 corridor により ungrouped の総エッジ長 **45,780 → 42,883（−6.3%）**、
    交差 42 → 39、最大改善は `ec-platform/04-annotations` の −42%
- **交差数は柵に含めない。** ADR-1859 が「交差は最小化せず表現で無害化する」と
  決めており、数を pin すると内側 corridor（交差を減らす）と将来の改善が柵と
  戦うことになる。

## 却下した案

- **grouped パイプラインへ一本化し `edge-routing-channels.ts` を削除する**
  （設計初期案）— グループ軸とルーティング能力は独立の軸なので、経路形ごとに
  モジュールを保って候補列で合成するほうが軸の直交性がコード構成に残る。機能面の
  到達点は採用案と同じ。
- **`routeOrthogonalEdges` を単独で拡張して追いつかせる** — ADR-1859 が
  「両モードのロジックが絡む」として却下した形の裏返しで、2 系統が別々に進化し
  続ける。継ぎ足しの終着点は `edge-routing-groups.ts` の再実装であり、#1927/#1954 の
  教訓（progressively-outer gutter の失敗、素朴 channel routing の overlap 増）を
  もう一度踏み直すリスクが高い。
- **内側 corridor を grouped にも適用する** — P2c の gutter は「全 content の外側に
  あるから貫通しない」という**構成的**保証を持ち、`distributeGutterLanes` はその
  前提の上で lane を広げている。内側 corridor はどちらの性質も持たず、経路ごとの
  検証でしか安全でない（実際、grouped に入れると既存 P2c テスト 5 件が落ち、
  collinear overlap が発生した）。grouped の構成的保証を短い経路と引き換えに
  手放さない。長い迂回が観測されたのは ungrouped 側であり、そこだけで足りる。
- **ungrouped で集約トランクを使う**（スライス [#2364](https://github.com/kompiro/karasu/issues/2364) の評価結果）—
  実サンプル 9 本で変化したのは `client-mcp` 1 本のみ、交差 5 → 4 の代わりに
  **総エッジ長 +27%・図幅 +52px**。トランク lane は右ガターに置かれるため、内側
  corridor（#2365）で短くなった fan-in 経路をキャンバス端まで引き戻してしまう。
  grouped では帯構造ゆえにそれらのエッジはどのみちガターへ出るのでコストが無い、
  という非対称がある。**ADR-1728 が同じ扱いを ungrouped 配置で既に却下していた**
  （直交トランク/バス・ルーティングは PoC で 33〜53 交差）こととも整合する。
- **常時矩形線化（斜め線の廃止）** — ADR-1859 が #1939 案A/B として却下したものの
  再訪を検討した。本プログラムは当時の却下理由のうち snapshot churn と overlap
  パス不参加を解消するため好機ではあったが、Z 折りが斜め線には無かった新交差を
  生むこと、塞がれた場合の直線 fallback で完全な統一にはならないことは残る。
  交差は hop マークで無害化する現行スタンスを継続する。
- **row 内順序への barycenter 導入** — 配置の論点でルーティングとは独立。宣言順は
  「書いた順に並ぶ」という予測可能性でもあるため、問題が観測されるまで現状維持と
  し Issue も起こさない。

## 補足: この決定が残した課題

- **ラベルがエッジの線に乗る問題は未解決**（[#2360](https://github.com/kompiro/karasu/issues/2360)）。
  ADR-2048 のラベル配置パスの障害物集合がエッジ polyline を含まないことが原因で、
  grouped / ungrouped の双方で発生する。本 ADR の候補列合成とは独立（実測
  before 18 / after 20 件）。
- **`hr-tool` の迂回は短くならなかった。** 行ごとにカードが x 方向で重なっており、
  迂回が通過する全行で clear な内側 lane が無いため、gutter 経路のまま残る。
  内側 corridor は「lane がある図では効くが、無い図では何もしない」性質を持つ。
- **cross-system エッジは per-system の side map を受け取らない**（ADR-1728 の
  既知の制限）。root view のルーティングは system 内エッジに閉じており、
  system 間エッジは従来どおり右→左アンカーで描かれる。
