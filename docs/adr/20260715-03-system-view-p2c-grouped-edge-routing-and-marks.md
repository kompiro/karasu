---
id: ADR-20260715-03
title: grouped system view のエッジを直交ルーティング・集約トランク・交差マークで読みやすくする（P2c）
status: accepted
date: 2026-07-15
topic: renderer
related_to: [ADR-20260711-03, ADR-20260429-01, ADR-20260511-01, ADR-20260428-10]
scope:
  concerns: []
---

# ADR-20260715-03: grouped system view のエッジを直交ルーティング・集約トランク・交差マークで読みやすくする（P2c）

- **日付**: 2026-07-15
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#1859](https://github.com/kompiro/karasu/issues/1859)（P2c、親 epic [#1817](https://github.com/kompiro/karasu/issues/1817) comprehension）
  - 前提 ADR: [ADR-20260711-03](20260711-03-system-view-group-by-team.md)（P2a: team 軸グループ化。本 ADR はその follow-up で、**展開されたグループビューのエッジ描画**を扱う）
  - 実装 PR: #1894（P2c-A 直交ルーティング）/ #1901（P2c-B 集約トランク）/ #1933（P2c-C 交差マーク、#1926）/ #1930（#1927 gutter overlap）/ #1970（#1954 mixed channel routing 貫通ゼロ）/ #1949（#1939 斜め交差 + #1956 ungrouped marks + 半月修正）
  - 設計（本 ADR に集約し削除）: `docs/design/system-view-grouping.md` § 「P2c 実装設計」「P2c カバレッジ拡張」/ `docs/design/grouped-edge-channel-routing.md`
  - 関連 ADR: [ADR-20260429-01](20260429-01-orthogonal-edge-routing-skip-layer.md)（skip-layer 直交ルーティング — grouped では別パスに置換、帯間チャネルの pattern を共有）, [ADR-20260511-01](20260511-01-parallel-edge-bundling.md)（parallel-edge bundling — edge identity 保持の立場を継承）
  - TPL: [TPL-20260711-02](../test-perspectives/TPL-20260711-02-routing-measures-crossings-and-penetrations.md)（交差数と貫通数の二重計測）, [TPL-20260715-01](../test-perspectives/TPL-20260715-01-new-route-shape-participates-in-overlap-passes.md)（新 route 形は overlap 回避パスに参加させる）
  - コード: `packages/core/src/renderer/edge-routing-groups.ts` / `crossing-marks.ts` / `edge-geometry.ts` / `edge-routing.ts` / `svg-renderer.ts` / `layout.ts`

## 背景

P2a（ADR-20260711-03）は system view を team 軸で束ね、境界フレームで畳めるようにした。しかし**フレームを展開した状態**のエッジは、既定 system レイアウトと同じ直線／skip-layer ルーティング（ADR-20260429-01）を流用しており読みづらい。設計計測（`system-view-grouping.md` § 計測 5）で、直線モックの illegibility の主因は交差ではなく**ノード/フレーム貫通**（38 本）であり、残る交差も「接続か通過か」が曖昧なことだと判明していた。

`#1859` の受け入れ条件は 5 つ: (1) 展開ビューでエッジがノード/フレーム内部を**貫通しない**（貫通数 == 0）、(2) 同一 infra/external target への複数エッジが 1 トランク + junction dot に束ねられる、(3) 全交差が hop アークで描かれる、(4) 逆流エッジが破線、(5) Group by: none は不変。

## 決定

grouped（展開）ビュー専用の **routing / trunk / marks の 3 パスを新設**し、`.krs` 文法は変えず（view-mode 局所）、既存 ungrouped パイプラインは byte-identity で温存する。3 パスは `groupBands != null` gate 内でのみ走る。

1. **P2c-A `routeGroupedEdges`** — grouped で `routeOrthogonalEdges` の代わりに呼ぶ直交ルーター。障害物集合 = 全ノードカード ∪ **全グループフレーム矩形**。エッジを「必ず空く」経路（帯間チャネル・左右ガター・フレーム内列回廊）のみに通す。逆流（`groupOrder` 上で下帯→上帯）エッジは `LayoutEdge.groupBackward` を立て、**author が `stroke-style` 未指定のときだけ**破線にする。
2. **P2c-B `aggregateGroupTrunks`** — 同一 target（infra/external）へ複数帯から入るエッジを 1 本の縦 **trunk（spine）** に合流する。edge identity は保つ（各 `LayoutEdge` を残し `waypoints` を spine 経由に書き換え + `trunkId` メタを付与。ADR-20260511-01 案 3 と同じく描画の合流であって統合ではない）。target 共有ごとに専用 trunk lane を割り当てる。
3. **P2c-C `computeCrossingMarks` + `renderCrossingMarks`** — 最終ジオメトリから交差マークを座標のみで決定論的に導出する（新モジュール `crossing-marks.ts`、`LayoutResult.crossingMarks` に格納、`svg-renderer.ts` が edge レイヤの後に `crossing-marks` レイヤを emit）。
   - **hop（◠）**: 別エッジのセグメントを **strict-interior**（端点でない）で跨ぐ交点に、跨ぐ線に沿った向きのアークを描く（交差＝非接続）。近接交点はクラスタ化。
   - **junction（●）**: トランク合流 elbow のうち、**spine がその点より上へ延びる T/＋ 点だけ**に接続ドットを打つ（合流＝接続）。トランク最上段（spine の頭）は単線の L コーナーなので打たない（回路図慣習）。
   - **各マークは所有エッジの色/線幅で描く**（色付き図でも線から浮かない）。
   - **hop は host エッジの線を切って描く**（`renderEdge` が host を `<path>` にし `[中心 ± halfWidth]` 区間に gap を空ける）。gap 端＝アーク端点で継ぎ目なく繋がり、hop が「連続線の上のこぶ（半月）」でなく本来の**飛び越え**に見える。跨がれる側は host でないので連続（through-line）。

**貫通ゼロは「mixed route」で達成する**（#1927 overlap fix + #1954 penetration fix）。両ガター（`maxRight/minLeft ± GUTTER_GAP`）が塞がれた edge は、**端点ごとに独立に**「side stub が clear ならそれを使い、塞がれた端だけ top/bottom port で隣接空き帯（帯間チャネル）へ迂回」する経路を組む。この新しい route 形（3〜4 waypoint）を既存の overlap 回避パスに載せるため、`isVerticalGutterRoute`（2-wp 限定）に代えて **route からガター corridor（極値 x の縦セグメント）を抽出するヘルパ**を導入し、`distributeGutterLanes` を corridor ベースに一般化、`fanOutGutterPorts` を side＋top/bottom 両軸に一般化する。既存 2-wp route の結果は不変（回帰柵）。

**交差マークの被覆は #1939/#1956 で広げた**:
- **斜め交差**（#1939 Part 1）: `computeCrossingMarks` を軸整列 H×V 専用から**一般線分交差**に一般化し、跨ぐ線に沿った向きの hop を描く（`HopMark.angle`）。routing は変えない（案C）。軸整列交差は角度 0 の特殊ケースとして **byte-identical**。
- **ungrouped ビュー**（#1956）: `groupBands` gate を外し、既定（Group by: none）の単一 system ビューでも交差に hop を描く。ungrouped は集約トランクが無いので **hop のみ**（junction は grouped 限定）。

## 理由

- **専用パス + gate** が「Group by: none 不変」（AC-5）を**構成的に**保証する最も安全な形。既存 `routeOrthogonalEdges` はフレーム回避・ガター迂回を表現できず、継ぎ足すと ungrouped の決定論 snapshot を壊す。geometry helper（`edge-geometry.ts` の strict-interior 判定）だけを共有する。
- **交差は「表現で無害化」できる**。幾何的な交差数を最小化するより、直角/任意角の交差を hop で「非接続」と明示し、トランク合流を junction で「接続」と明示する方が、実装コストに対する可読性の効果が大きい（計測 5）。ルーターの貫通判定と marks の交差判定は**同一の strict-interior 定義**（`edge-geometry.ts`）を使い、両者が食い違わないようにする（TPL-20260711-02）。
- **mixed route（端点単位 side-if-clear）**だけが貫通ゼロと overlap ゼロを**同時に**満たす。挟まれノードの side stub が同 row 兄弟を横切る失敗は、ガターを外へ動かしても消えない（当初の「最外ガターで貫通ゼロ保証」は誤りだった）。塞がれた端だけ帯間チャネルへ逃がし、その corridor を既存 lane/fan-out パスに一般化して載せることで overlap も消える。
- **edge identity 保持**（トランク・マークとも per-edge）: `edge#<id>` selector / direction style / diff renderer が edge 単位で動くため。

## 却下した案

- **既存 `routeOrthogonalEdges` にフレーム対応を継ぎ足す** — ungrouped の決定論 snapshot を壊すリスク。ガター迂回を表現できず両モードのロジックが絡む。→ 専用パスに分離し geometry helper のみ共有。
- **トランクを「1 論理エッジ + 複数ラベル」に統合**（ADR-20260511-01 案 3 と同型）— edge id selector / direction style / diff renderer が壊れる。→ 描画のみ合流。
- **A\* / ELK による障害物回避**（ADR-20260429-01 案 B1/B3）— 帯構造では overkill。帯 + ガター + 回廊の stub-and-bend で貫通ゼロが構成的に取れる。
- **交差数の最小化を追う** — 交差は表現で無害化できるので費用対効果で劣る。
- **貫通対策: progressively-outer gutter**（P2c-A 当初案）— 挟まれノードを救えない（side stub 起因の貫通はガター x を動かしても残る）。
- **貫通対策: 素朴 channel routing**（top/bottom port 固定・後段パス非参加）— 貫通は直るが overlap を 2 件増やし #1927 規律に反する。→ mixed route + パス一般化（案2b）を採用。
- **貫通対策: 配置レベルで解消**（#966 / ADR-20260428-10 拡張）— 共有 infra はどこに置いても誰かの直下に来うるので配置だけでは一般に解けない。routing で構成的に解き、配置最適化は #966 に委ねる。
- **斜め交差対策: clear 帯内エッジを直交化**（#1939 案A/B）— snapshot churn 大・保証が soft（塞がれ L は直線に fallback）・新交差を生む。→ marks 側で任意角に対応（案C、routing 不変）。

## 補足: 正しさの柵

- **交差数と貫通数を両方 assert する**（TPL-20260711-02）。P2c の AT は node/frame **貫通数 == 0** を厳密 assert し、交差は「全交差が mark 付き」を assert する（残存交差を欠陥視しない）。
- **実サンプルにも柵を広げた**: 当初 TPL の貫通ゼロ assert が synthetic fixture にしか及ばず、実サンプル `getting-started` の 2 貫通を漏らしていた。#1954 で `getting-started` を Group by team でレイアウトし **貫通 == 0 かつ collinear overlap == 0** を assert。新 route 形が overlap 回避パスに参加しているかを問う proactive [TPL-20260715-01](../test-perspectives/TPL-20260715-01-new-route-shape-participates-in-overlap-passes.md) を新設。
- **AC-5**（Group by: none 不変）は、新パスが gate 内でのみ走ることをテストで固定。#1956 で ungrouped にも marks を出したが、交差の無いビューは不変（レイヤは mark があるときだけ emit）。
