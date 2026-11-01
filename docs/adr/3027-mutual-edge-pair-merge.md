---
id: ADR-3027
title: 見た目が同じ両方向の edge の組を、card を動かさずに両端に矢印のある 1 本の線で描く
status: accepted
date: 2026-11-01
topic: renderer
refines: [ADR-3022]
related_to: [ADR-1185, ADR-445, ADR-463, ADR-1096, ADR-9019, ADR-650, ADR-1184, ADR-2958, ADR-2632, ADR-2394, ADR-2585, ADR-1870]
scope:
  packages:
    - core
    - app
assumptions:
  - "symbol: packages/core/src/renderer/mutual-pair.ts :: applyMutualPairs"
  - "symbol: packages/core/src/renderer/mutual-pair.ts :: findMutualPairs"
  - "symbol: packages/core/src/renderer/mutual-pair.ts :: chooseSplit"
  - "symbol: packages/core/src/renderer/mutual-pair.ts :: pairLabelSegment"
  - "grep: packages/core/src/renderer/mutual-pair.ts :: SPLIT_WINDOW = 1 / 6"
  - "symbol: packages/core/src/renderer/edge-line-key.ts :: edgeLineKeyOf"
  - "symbol: packages/core/src/renderer/edge-line-key.ts :: resolvedEdgeStyle"
  - "symbol: packages/core/src/renderer/edge-label-disclosure.ts :: directionArrow"
  - "grep: packages/core/src/renderer/edge-routing.ts :: krs-edge__cue"
  - "grep: packages/core/src/renderer/layout.ts :: applyMutualPairs\\(result\\.edges, options\\)"
  - "grep: packages/app/src/styles/components/preview.css :: \\.krs-node-controls:hover"
  - "file: docs/test-perspectives/TPL-3027-visual-merge-only-when-indistinguishable.md"
  - "file: docs/test-perspectives/TPL-3437-tap-target-needs-its-own-pressability-cue.md"
  - "file: docs/acceptance/3027-mutual-edge-pair-merge.md"
---

# ADR-3027: 見た目が同じ両方向の edge の組を、card を動かさずに両端に矢印のある 1 本の線で描く

- **日付**: 2026-11-01
- **ステータス**: 決定済み
- **関連**:
  - Issue #3027（起点）、Design Doc PR #3410、実装 PR #3437。ラベルの向きの手がかりは spike `spike/3027-pair-label-direction` で比べた
  - 同じ問いの database 版: #2728（hub の扱いはそちらで決める）
  - 実装中に見つけて別に直したもの: #3494（PR #3502。折り返した layer の card 間の edge が自分の card を突っ切り、矢印が隠れていた）、#3495（hover で矢印が倍になる。未着手）
  - [ADR-3022](3022-edge-label-disclosure.md)（ラベルの段階的開示。本 ADR は残っていた「線」の側を扱う）、[ADR-1185](1185-parallel-edge-bundling.md)（同じ `(from, to)` の束ね。論理統合を却下した理由が本 ADR の制約になる）、[ADR-2958](2958-gutter-lane-bundling.md)（種別の違う edge を束ねない）、[ADR-2632](2632-edge-hover-affordance.md)（全 edge の hit-line）、[ADR-2394](2394-external-side-straddle-rule.md)（集合から取った閾値の却下）、[ADR-1184](1184-edge-label-position-offset.md)（ラベルの既定位置と author の指定）、[ADR-463](463-implicit-edge-detail-panel.md)（`N domain edges` の内訳パネル）、[ADR-445](445-domain-to-domain-edges-implicit-tag.md)、[ADR-1096](1096-edge-id-selector.md)、[ADR-9019](9019-edge-direction-style.md)、[ADR-650](650-graphical-diff-viewer.md)、[ADR-2585](2585-store-scoped-er-view.md) / [ADR-1870](1870-domain-entity-modeling.md)
  - TPL: [TPL-3027](../test-perspectives/TPL-3027-visual-merge-only-when-indistinguishable.md)（本件で起こした proactive TPL）、[TPL-3437](../test-perspectives/TPL-3437-tap-target-needs-its-own-pressability-cue.md)（実装中に見つけたタッチの失敗）、[TPL-3022](../test-perspectives/TPL-3022-withheld-content-stays-reachable.md)、[TPL-1227](../test-perspectives/TPL-1227-writer-reader-asymmetry.md)、[TPL-2174](../test-perspectives/TPL-2174-opt-in-visual-layer-is-inert-when-off.md)、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)、[TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)、[TPL-2632](../test-perspectives/TPL-2632-viewer-affordance-not-gated-on-author-identity.md)
  - AT: `docs/acceptance/3027-mutual-edge-pair-merge.md`
  - コード: `packages/core/src/renderer/mutual-pair.ts`、`edge-line-key.ts`、`layout.ts`（呼び出し位置）、`edge-routing.ts`（`renderEdge` / `ownLabelSegment`）、`edge-label-disclosure.ts`（`canvasLabel` / `directionArrow`）、`label-placement.ts`、`packages/app/src/components/focus-canvas/build.ts`、`packages/app/src/styles/components/preview.css`

## 背景

ADR-3022 で、密な domain canvas のラベルは「置けるものだけ描き、残りは段階的に開示する」ようになった。線は対象外として残した。Umami の `UmamiApp` drill-down（fixture `packages/core/src/renderer/fixtures/dense-domain-canvas.krs`）は、ラベルを全部外しても、10 domain の間に 41 本の線が走っていて追えない。

Design Doc 時点の計測（fixture を `layout()` に通し、折れ線どうしの交差点を数えた）:

| 項目 | 値 |
| --- | --- |
| 書かれた domain 間 edge | 41 本 |
| 端点の組（向きを区別しない） | 27 組 |
| 両方向に edge がある組 | 14 組（28 本） |
| 線どうしの交差 | 157 か所 |
| 入次数の上位 | `TrackedEntities` 9、`Identity` 8 |

14 組の両方向の edge は 2 本の別々の線として描かれていた。ADR-1185 が束ねるのは同じ `(from, to)` だけで、逆向きは別の port から出て別の経路を通る。node focus（ADR-3022 の段 1）は hover すれば読めるが、hover する前の canvas が何を描くかは決めていなかった。

制約:

- **authored な edge はすべて辿れる**（TPL-3022）。線を減らしても、各 edge のラベル全文に各 surface から届く
- **writer に組を書かせない**（TPL-1227）。公開済みのモデルにも効く
- **edge の identity を保つ。** ADR-1185 は並列を単一の論理 edge に集約する案を、id selector・`direction`・diff の表示が edge 単位で動くことを理由に却下している
- **意味の違う edge を 1 本にしない。** sync と async は構造の意味である（ADR-2958）
- **閾値で canvas を不連続に変えない**（ADR-3022、ADR-2394）
- **両方向の組が無い canvas の出力は変えない**（TPL-2174）

## 決定

見た目で区別できない両方向の組（`A -> B` と `B -> A`）は、card の位置を変えずに、両端に矢印のある 1 本の線として描く。edge は 2 本のまま残し、それぞれが共有の線の自分の target 側の半分と矢印を描く。組のラベルは、その半分が向かう方向の矢印を先頭に付けて描く。

1. **1 本にする条件**（1 つでも外れたら今日どおり 2 本。TPL-3027）
   - 同じ canvas の同じ system にあり、両端がその canvas の card で、各向きに edge がちょうど 1 本（multi-system の root では `fromKey` / `toKey` で照合し、system 間の組は対象にしない。TPL-1352）
   - 種別（sync / async）が同じ
   - 線の見た目の鍵が同じ。鍵は解決済みの style の色・太さ・`stroke-style` と diff state
   - どちらも ghost・cyclic・`groupBackward` でない（どれも layout が描き方を変える印で、style の鍵に現れない）
   - どちらも trunk の束（`trunkId` / `outTrunkId`）や並列の束（`bundleSize`）に入っていない
   - どちらも category / group collapse の stub ではない
   - 集約した `N domain edges` の service 間 edge は対象に入る（畳んだ後の diff state と style で判定する）
2. **見た目の鍵は renderer が渡す。** `layout()` は style を知らないので、`LayoutOptions.edgeLineKey` の callback を svg-renderer が `edgeLineKeyOf` で作って渡す（`chipZoneFor` と同じ注入の形）。edge の style の解決は `resolvedEdgeStyle` 1 つに寄せ、描画と鍵が同じ解決を読む。callback を渡さない呼び出し（draw.io exporter など）は 1 本にしない。facet の overlay は鍵に入れない（overlay は配置を変えない約束。TPL-2174）
3. **共有の線と分け目。** AST の出現順で先の edge の経路を共有の線にし、後の edge の経路は捨てる。分け目は共有の線の中点から、次をすべて満たす最も近い点へ線に沿ってずらす。中央の 3 分の 2（長さの 1/6 から 5/6）にそういう点が無ければ、その組は 2 本で描く
   - 角（waypoint）から 10 px 以上離れている
   - 他の edge との交差から 14 px 以上離れている
   - 線の上の hop から、その hop が共有の線に空ける隙間の半分（共有の線が持つ hop）、または弧の高さ（他の線が持つ hop）と 14 px の大きい方以上離れている
4. **パスの位置。** 幅の探索と再配置が終わった後、`layout()` が交差マークを計算する位置で `applyMutualPairs` を呼ぶ。そこで交差マークの計算を取り込み、「捨てる経路を除いて `computeCrossingMarks` を走らせる → 各組の分け目を選ぶ → 分け目が無い組を 2 本に戻す」を、戻す組が無くなるまで繰り返す。組は減る一方なので終わる。最後の結果を描画に使い、hop の持ち主だけを、その hop が乗る側の半分に付け替える。組の無い canvas は今日どおり 1 回だけ計算する
5. **ラベル。** 組の edge のラベルの既定位置は、自分の半分のうち分け目に接しない最も長い区間の中点にする（長さ 0 の区間は使わない。`pairLabelSegment`）。先頭に、その区間の向きの矢印（→ ↘ ↓ ↙ ← ↖ ↑ ↗ の 8 方位、`directionArrow`）を付ける。矢印は `canvasLabel` が描く文字列の一部として作り、配置の計測と描画が同じ文字列を使う（TPL-219）。描画では `<tspan class="krs-edge__cue">` に分け、`data-edge-label` と保留したラベルの `<title>` は書いたラベルのままにする。focus canvas は合成ラベルを描画から読むとき、この tspan を除く
6. **hover と hit。** 各 edge の hit-line は自分の半分だけを覆い、hover の強調はその半分と矢印に掛かる（TPL-2632）。クリックは今日どおり focus canvas を開き、両方向が 1 行ずつ出る
7. **surface。** パスは `layout()` にあるので、system・drill-down・all-layers・静的出力・VS Code preview に同じく効く。deploy view は `layoutDeploy` で配置するので掛からない
8. **card の角のボタンに hover のスタイルを持たせる**（`.krs-node-controls:hover`、実装中に追加）。Chrome はタッチを面として扱い、近くの「押せる」要素へタップを寄せる。ボタンはクリックをプレビューのコンテナに委譲していて手がかりを持たず、1 本にして近くの線が減ると、Identity のⓘへのタップが横の `Sharing -> Identity` の hit-line に移った（TPL-3437）

## 理由

- 線と交差がいちばん減り、card が動かない。Umami の `UmamiApp` は 41 本 → 27 本。交差は Design Doc 時点で 157 → 61 か所、#3494 の修正後の配置で 134 → 58 か所（14 組すべてが 1 本になる）
- edge は 1 本ずつ残る。まとめるのは描画だけで、ADR-1185 が却下した論理統合ではない。線を重ねないので、hover の強調・diff の色と透明度・facet の casing・hop の隙間はその edge の半分にだけ掛かり、どちらの向きの装飾か見て分かる
- 閾値を持たない。1 本にするかどうかは、その 2 本が区別できるかどうかだけで決まる（TPL-3027）
- 両方向の依存（循環）が、両端に矢印のある線としてかえって目に付く
- 分け目の幅（中央の 3 分の 2）は試作で決めた。中央の 2 分の 1 では 13 組・28 本・66 か所、3 分の 1 では 11 組・30 本・76 か所で、3 分の 2 だけが 14 組すべてを 1 本にした
- 位置だけでは、読む人が線を矢印の先まで辿らないとどちらのラベルか分からない。spike で位置だけの案と矢印を足す案を Umami と小さな例で並べ、矢印を足す案を採った

## 却下した案

- **2 本を同じ線に重ねる**（後の edge に先の edge の折れ線を逆順で持たせる）: 重ねた見た目が 2 本の属性の合成になる。逆向きの破線は位相がずれて実線に見えうる（async の組が sync に見える）。半透明の線が重なって濃くなる。facet の casing が全長に掛かる。hop は持ち主の線にしか隙間を空けないので相手の線が hop を貫く。上の線が pointer を取って下の edge に hover できない。半分ずつ描けばどれも起きない
- **組を 1 つの辺として配置する**（layout の段階で 1 辺として扱う）: card が動き、`examples/` の 4 ファイルで配置が変わる。交差も 70 か所で、今の配置のまま 1 本にする方が少なかった
- **hub の edge を薄くする、または card に件数を出す**: hub の判定に閾値が要り、edge を 1 本足しただけで 7 本以上が一度に薄くなる（ADR-3022、ADR-2394 が却下した形）。閾値が canvas の大きさに依存し、同じ「ほかの 3/4 以上が依存」の規則は Dify の `DifyDB` canvas で hub を 1 つも見つけない。中心の entity への edge はその canvas の主な情報でもある。hub の扱いは #2728 で database canvas の問題として決める
- **何もしない**（node focus に任せる）: hover する前の canvas は 41 本・157 か所の交差のまま。hover の無い端末では最初に見えるものがこれになる
- **ラベルの向きの手がかりを位置だけにする / hover の強調だけにする**: hover の強調は元から効くが、hover しないと分からない。位置だけでは上の理由で足りない
- **組を表す属性を SVG に足す / `marker-start` で描く**: 読む側が無い。テストは `LayoutEdge` で組を確かめる。各 edge が自分の target 側の矢印を描けば `marker-start` は要らない
- **AT-3057 のタッチのテストで touch adjustment を止める**: Chromium の headless shell にはそのスイッチが無く、半径 0.5 の低レベルのタッチ入力でも補正がかかった。当たり判定の circle を大きくしても候補に入らなかった。ボタンに hover のスタイルを持たせると、補正がボタンを候補に入れる

## 結果

- 同じ種別・同じ見た目の両方向の組を持つ図では、組の 2 本が 1 本の線になる。`.krs` の解釈は変わらない
- `examples/` の図は変わらない。両方向の組を描く 6 ファイル・8 組のうち、2 組は sync と async の組（`getting-started/index.krs` の en / ja）、残る 6 組は戻りの edge が `delivers`（組み込みの style で色と破線が違う）で、見た目の鍵が揃わない
- Group-by の canvas では、別の band にある組は片方が `groupBackward` になるので 2 本のまま残る。trunk に入った組も 2 本のまま。仕様であって不具合ではない
- 時間: Dify の `DifyDB` canvas（296 本、hop 約 5,800）で `layout()` は組ありで 83 ms、組なしで 95 ms（5 回の中央値）だった。繰り返しは組の候補がある canvas でしか走らない
- `docs/concepts.ja.md` / `docs/concepts.md` の「集約」節に 1 文を足し、TPL-3027 と双方向に結んだ

## 未解決の問い / 決めないこと

- **1 本にしない style property。** 今は作らない。2 本で描きたい writer は、片方の色を変えれば 2 本に戻る
- **空いた port と lane を詰めるか。** 1 本にした後に port の分散や lane の予約をやり直すと経路が変わり、交差が増えうる。やっていない
- **hub の扱い。** #2728 で決める
- **hover で矢印が倍の大きさになる**（#3495）。hover は線の太さを 3 にし、marker が線の太さに比例する。本件の前からある
