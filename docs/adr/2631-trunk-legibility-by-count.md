---
id: ADR-2631
title: トランクの合流と分岐を本数で読ませ、交差マークを装飾で潰さない
status: accepted
date: 2026-09-27
topic: renderer
refines: [ADR-1859]
related_to: [ADR-2598, ADR-1185, ADR-1184, ADR-1061, ADR-2048, ADR-2330]
scope:
  packages:
    - core
assumptions:
  - "symbol: packages/core/src/renderer/crossing-marks.ts :: trunkBandHalfWidth"
  - "symbol: packages/core/src/renderer/crossing-marks.ts :: JUNCTION_CHIP_RADIUS"
  - "grep: packages/core/src/renderer/crossing-marks.ts :: HOP_RADIUS = 6"
  - "symbol: packages/core/src/renderer/edge-routing.ts :: ownLabelSegment"
  - "symbol: packages/core/src/renderer/edge-routing-groups.ts :: aggregateGroupSourceTrunks"
  - "symbol: packages/core/src/renderer/layout-types.ts :: outTrunkId"
  - "symbol: packages/core/src/renderer/layout-types.ts :: TrunkBand"
---

# ADR-2631: トランクの合流と分岐を本数で読ませ、交差マークを装飾で潰さない

- **日付**: 2026-09-27
- **ステータス**: 決定済み
- **関連**:
  - Issue #2631（起点。親 #2598 の slice E）、スライス #2883 / #2884 / #2885
  - 実装 PR: #2887（A: fan-in の可読性）、#2890（B: アーチ半径 4 → 6）、#2897（C: fan-out トランク）
  - 設計（本 ADR に集約し削除）: `docs/design/trunk-aggregation-legibility.md`
  - [ADR-1859](1859-system-view-p2c-grouped-edge-routing-and-marks.md)（P2c: ガター / 集約トランク / 交差マーク。本 ADR はその AC-2 の表現を具体化する）、[ADR-2598](2598-edge-routing-channel-capacity.md)（本判断を slice E に残した ADR）、[ADR-1185](1185-parallel-edge-bundling.md)（束ねても edge identity は保つ）、[ADR-1184](1184-edge-label-position-offset.md)（ラベル既定位置。trunk エッジに限り狭める）、[ADR-1061](1061-resource-rw-edges.md)（線幅は read / write を表す）、[ADR-2048](2048-edge-label-collision-avoidance.md)（ラベル衝突回避）、[ADR-2330](2330-ungrouped-routing-parity.md)（計測柵）
  - TPL: [TPL-2631](../test-perspectives/TPL-2631-decoration-must-not-hide-a-crossing-mark.md)（本設計時に起こした proactive TPL）、[TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md)、[TPL-2385](../test-perspectives/TPL-2385-attachment-follows-drawn-outline.md)、[TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)、[TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md)
  - AT: `docs/acceptance/2883-trunk-count-legibility.md`、`docs/acceptance/2884-hop-arc-radius.md`、`docs/acceptance/2885-fan-out-trunk.md`
  - コード: `packages/core/src/renderer/crossing-marks.ts`、`edge-routing-groups.ts`、`edge-routing.ts`、`label-placement.ts`、`svg-renderer.ts`、`layout-edges.ts`、`routing-parity.test.ts`

## 背景

#2631 は「boundary 軸で 2 本のエッジが 1 本に見える」という bug として起票された。計測すると、main に残る共線ペアは**すべて trunk 兄弟**（ADR-1859 P2c-B の集約トランク）で、spine と target entry を設計どおり共有しているものだった（reverse-engineered dify の root view で team 4 / 4、boundary 1 / 2。ungrouped は 0）。

つまり #2631 の AC-1「corridor か port を分ける」は、ADR-1859 AC-2「同一 target への複数エッジを 1 トランク + junction dot に束ねる」と正面から衝突する。トランクを廃する案と spine を数 px ずつ離す案を実装して比べると、**どちらも junction dot が 1 つも描かれなくなった**。合流マークは「spine がその点より先へ伸びる T 字」にだけ打つ設計なので、spine を分けた時点で T 字が消え、集約であるという情報が図から落ちる。

そこで集約は残すと決め、dot だけでは読めない 2 点を潰すことにした。

1. **どのラベルがどのエッジか読めない。** 既定の「最長セグメントの中点」（ADR-1184）は最長である共有 spine に落ち、N 本のラベルが誰のものでもない線の脇に並ぶ。
2. **合流後の 1 本が何本ぶんか読めない。** dot は合流が起きたことだけを示し、その先の線が 2 本ぶんか 7 本ぶんかは示さない。

併せて、同じ語彙を**出ていく側**にも当てられることが spike で分かった。同じ source から出るガター経路はそれぞれ固有の lane と固有の fan port を取っており、1 つのカード辺から 8 本出る dify の `ApiBackend` ではカード際で互いに交差していた。

## 決定

**トランクは集約の表現として残し、その束が何本ぶんかを数字と太さで読ませる。束は fan-in（同じ target へ入る）と fan-out（同じ source から出る）の両方に作る。装飾は交差マークを覆ってはならない。**

1. **#2631 の AC-1 を却下する。** trunk 兄弟が spine 1 本と entry 1 点を共有するのは ADR-1859 AC-2 のとおり正しい。柵は兄弟を肯定的に固定し、それ以外の共線ペアを 0 とする。
2. **trunk エッジのラベルはそのエッジだけが持つセグメントに置く。** fan-in では最初のセグメント（自分の stub）、fan-out では最後のセグメント（自分の target への枝）。ADR-1184 の既定をこの 2 種のエッジに限って狭める。author が `label-position` / `label-offset` を書いた場合は author が勝つ。`renderEdge` と衝突回避（ADR-2048）の両方に同じ指定を渡す。
3. **合流マーク（dot）を本数チップにする。** 数字は「その点と共有端の間を spine が運ぶ本数」。fan-in では共有端が target 側なので合流後の本数（下るほど 2, 3, …, N）、fan-out では共有端が source 側なので分岐点までに届いた本数（source に近い分岐から N, N-1, …, 2）。規則は 1 つで、spine の端（最も遠い elbow、ただの L 字）には置かない。
4. **spine を本数ぶんの帯として描く。** 幅は `2 + min(本数 - 1, 8) × 3` px で本数だけから決め、色はエッジから借りる（線幅は ADR-1061 で read / write を表すので借りない）。帯はエッジの下に敷き、共有端から相手ノードまでの run と 1 本のポリラインにして角を接合にする。
5. **交差アーチの既定半径を 4px から 6px にする。** 帯に載るアーチは帯の半幅 + 3px まで広げ、高くして帯の外へ出す。チップが交差点を覆うときはチップが自分の spine の範囲内で動き、交差は動かさない。アーチの高さは描画に実際に渡す（`HopMark.ry` を SVG の `ry` に使う）。
6. **fan-out トランクを足す。** 同じ source から出るガター経路のうち、付け替えた経路が clear なものが 2 本以上あれば 1 本の spine にまとめ、各 target の行で枝を落とす（`LayoutEdge.outTrunkId`）。fan-in パスの後に走り、共有 target を持つエッジは fan-in が先に取る（共有 target のほうが強い主張）。grouped ビューのみ。lane は全 fan-in spine より外側から採番し、spine の範囲が短いものほど内側に置く。`fanOutGutterPorts` は source 側を 1 スロットに併合する。
7. **spine の端（head）は共有端をはさんだ腕ごとに取る。** 「y が最小の stub」ではなく「共有端から最も遠い elbow」を腕ごとに head とする。下向きの fan-in では従来と同じ出力になる。

出口を共有すること（この node からまとめて出る）は、ADR-1859 AC-2 が扱う入口の共有とは別の主張である。本 ADR はそれを明示的に採る。

## 理由

- **fan-in 側は幾何を 1px も動かさない。** 1 から 5 は装飾とラベルのアンカーだけを変えるので、面積・貫通・重なりのどれとも引き換えにならない。dify の team / boundary でキャンバスは完全に一致し、非兄弟の共線ペアと貫通は 0 のまま。
- **集約という情報がむしろ強まる。** 数字と太さは俯瞰で束だと分かる形である。#2631 を報告した読者は俯瞰で「1 本に見える」と読んでいたので、俯瞰で答えが出る形を採った。
- **fan-out は引き換えなしで図を良くする。** 回廊が 1 本にまとまるぶんキャンバスが縮み交差も減る。dify で team 7.34 → 7.10Mpx / hop 147 → 122、boundary 5.35 → 5.14Mpx / 156 → 123。examples では getting-started の描画 hop 5 → 3、team-ownership 2 → 0、boundary-clusters 2 → 1、いずれも幅 -24px。束が成立しないモデルは 1 バイトも変わらない。
- **数字の規則を 1 つにすると両向きが同じに読める。** 「その点と共有端の間」と定義すれば fan-in と fan-out で読み方が変わらず、数字はつねに隣の帯の幅と一致する。
- **lane は範囲で入れ子にする。** 枝は spine からカード側へ伸びるので、内側にあってその行を範囲に含む spine をすべて横切る。範囲が他に含まれる spine を外側に置くと、そのすべての枝が内側の spine を横切る。fan-in の lane 順（上端から）をそのまま使うと boundary-clusters は hop 2 → 3 に悪化した。fan-in の lane 順は幾何を変えない方針なので触らない。
- **head を腕ごとに取るのは fan-out に必須で、fan-in の潜在 bug も直す。** 旧判定は target が source より上にある fan-in で、ただの角に「1」を置き、target に最も近い合流を落としていた。fan-out は後退エッジで source の上にも枝を持ちうる。
- **アーチ 6px が上限。** 9px（チップと同寸）は grouped ビューで隣の平行線に届く（dify team で 36〜45 件）。拘束しているのは `LANE_PITCH` ではなく `fanOutGutterPorts` が 1 つのカード辺に並べる線の間隔で、それを広げるのは配置に返る変更になる。

## 却下した案

- **spine を数 px ずつ離して束に見せる**: 共線 0 になるが junction dot が 0 個になり、集約ではなく「近接した平行線」になる。幅も fan-in 8 で +17%。
- **トランクを廃して完全分離（#2631 の AC-1 を文字どおり満たす）**: dot が消えるうえ幅が fan-in 8 で +34%。ADR-1859 AC-2 を supersede する必要がある。
- **本数チップのみ（帯なし）**: 交差アーチの調整が要らず実装は小さいが、俯瞰で束だと分からない。
- **アーチ半径 9px**: 上記のとおり grouped ビューで隣の線に届く。通すにはポート扇の間隔に下限が要る。
- **帯の幅をエッジの線幅から取る**: 線幅は ADR-1061 で read / write を表しているので、太さが二重の意味を持つ。
- **fan-out の lane 順を fan-in と同じ「上端の source から」にする**: 範囲が入れ子になると外側の spine の全枝が内側を横切る（boundary-clusters で hop が増えた）。

## 補足: 正しさの柵

- `routing-parity.test.ts` に fan-in と fan-out の両方を飽和させる合成 fixture（`TRUNK_FIXTURE`）を置く。examples はどれも fan-in トランクを作らず fan-out も小さいので、足さない限りトランクの設計は柵の外にある（TPL-2598）。
- 兄弟の共有（spine 1 本、fan-in は entry 1 点、fan-out は exit 1 点）を肯定的に固定し、それ以外の共線ペアを 0 とする。
- 数字が隣の帯の本数と一致すること、fan-out で数字が降順に並ぶこと、ラベルが自分のセグメントに乗ること、端点がノードの輪郭に載り続けること（TPL-2385）、貫通 0 を assert する。
- 装飾が交差を隠さないこと（TPL-2631）: 帯に載るアーチは幅も高さも帯の半幅を超え、その高さが**描かれた SVG の `ry`** に現れること、チップが交差点を覆わないことを assert する。マーク上の値だけを見た assert は描画が値を無視していても通ったので（#2884 で実際に起きた）、描画から読む。
- アーチ半径の柵は grouped ビューの最も狭い回廊が 7px になる fixture で測り、上限に張り付いた状態で固定する。ungrouped は意図してコストを受け入れたので柵を置かない。
- 空間 prefilter の parity（#2760）は検出結果（どの交差と合流があるか）で比べ、帯由来の調整とは分離する。ランダム入力に fan-out エッジを含める。

## 残課題

- **stub が短いときのラベル。** fan-in の stub は dify で 112px、合成例で 69px。長いラベルはカードに被りうるので、ADR-2048 の衝突回避との噛み合わせは未検証のまま。
- **ungrouped の最混雑部。** 半径 6px で dify の ungrouped は「カードに重なる」が 0 → 4、「ポート際のギャップ」が増える。原因は 1 つのカード辺から 8 本が扇状に出るポート扇の間隔で、下限を設けるのは本 ADR の範囲外。
