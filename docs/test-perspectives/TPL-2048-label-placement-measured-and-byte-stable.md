---
id: TPL-2048
title: "エッジラベルの配置（衝突回避）は label↔label / label↔node の overlap を数値で計測して assert する。衝突が無い図は byte-stable に保ち、author 指定ラベルは動かさない"
status: active
date: 2026-07-21
applicable_to:
  - "エッジラベル（またはノード外の付随テキスト）の配置を自動で決める／衝突回避する機能"
  - "ラベル位置を『重ならないように』調整するパスを追加・変更する変更"
known_consumers:
  - renderer
discovered_from:
  - root_cause_adr: "ADR-2048"
  - root_cause_file: "packages/core/src/renderer/label-placement.ts"
  - issue: "#2048"
  - issue: "#2360"
related_to:
  - TPL-1927
  - TPL-1954
topic: renderer
scope:
  packages:
    - core
---

# TPL-2048: ラベル配置は overlap を数値で計測して assert し、衝突が無い図は byte-stable に保つ

## 観点

エッジルーティングの可読性を「交差数だけでなく貫通数も数値で測る」（[TPL-1927](TPL-1927-routing-measures-crossings-and-penetrations.md)）のと同型に、**エッジラベルの配置（衝突回避）も目視ではなく数値で計測して assert する**。ラベルは「線」ではなく「箱（bounding box）」なので、計測軸はエッジ幾何とは別に 3 つある:

1. **label↔node 貫通** — ラベルの箱がノードカードの矩形と正の面積で重なる（ラベルが枠に食い込んで読めない）。
2. **label↔label オーバーラップ** — 相異なるラベルの箱同士が正の面積で重なる（2 つのラベルが 1 つに潰れて読めない）。
3. **label↔line 貫通** — ラベルの箱を**他エッジ**の polyline が横切る（ストロークが文字を貫いて読めない）。**自分のエッジの線は数えない** — ラベルはその線を指すために置かれているので、乗っているのが正しい。

**3 軸は必ず同時に測る。** 逃がし先を 1 つの軸だけで評価すると、読めなさを別の読めなさと交換して「直った」と誤認する（#2360 はまさにこれ — カードから逃がしたラベルが線の上に着地していた）。

ラベル配置は本質的に **best-effort**（幅がすべての空きより大きいラベルは完全には逃がせない）である点がエッジルーティングと違う。したがって柵は「常に 0」ではなく **「pass が衝突を増やさない」＋「clear できる位置が探索範囲内にあれば 0 にする」** を数値で assert する。加えて 3 つの不変条件を守る:

- **衝突が無い図は byte-stable**: default 位置で衝突していないラベルは 1px も動かさない（override 空）。既存 snapshot が無変更 green であることが柵。ADR-1184 が守った「default 経路の byte-stability」を「衝突が無い限り」に条件付きで維持する。
- **author 指定は不可侵**: `label-position` / `label-offset` を非 default に設定したラベルは auto で動かさない（obstacle としては効く）。author intent が勝つ（ADR-1184 precedence）。
- **決定論**: `Date.now()` / `Math.random()` 不使用。候補は固定順、ラベルは index 昇順で処理し、同じ入力 → 同じ配置。

## 想定される失敗モード

- ラベル配置 pass を追加/変更した PR が、**「図を見て重なってなさそう」だけを根拠**に可読性改善を主張し、label↔node 貫通 / label↔label オーバーラップ / label↔line 貫通の**数値**を測らない。実サンプルの密なクラスタで残った衝突を見逃す。
- **障害物集合の取りこぼし**: 逃がす先の候補は 2 軸で網羅的に探すのに、避けるべき対象を数え上げそこねる。#2360 の実例 —— 障害物がノード矩形と配置済みラベルだけで**エッジの線が入っていなかった**ため、(a) カードから逃がしたラベルが線の上に着地し、(b) そもそもカードと衝突しないラベルは検討対象にすらならなかった。**新しい障害物クラスを足すときは、探索ではなく集合を疑う。**
- **自分の線まで避けてしまう**: 線を障害物に足すときに own-edge の除外を忘れると、全ラベルが必ず移動対象になり byte-stability が消え、ラベルが自分のエッジから離れて対応が読めなくなる。
- **byte-stability の退行**: 衝突していないラベルまで動かしてしまい、無関係な図の snapshot が大量に churn する（＝ default 経路を壊した）。「override は衝突時のみ非空」を assert しないと気づけない。
- **author 指定ラベルを勝手に動かす**: auto pass が eligibility（`label-position === default && label-offset === 0`）を判定せず、明示配置を上書きする。逆に author ラベルを**障害物に含め忘れ**、auto ラベルが author ラベルに重なる。
- **合成 fixture だけで満足**: 手で作った 2 ラベルケースは 0 を通すが、**実サンプル**（実レイアウトが生む幅広ラベル・密なノード配置）で貫通が残る（[TPL-1954](TPL-1954-new-route-shape-participates-in-overlap-passes.md) と同じ「実サンプルを柵に」）。
- **探索上限の silent truncation**: best-effort の探索ステップ上限を超えたラベルを黙って放置し、「貫通 0」と誤認する。best-effort であることと上限を明示しない。

## チェックリスト

エッジラベル（ノード外テキスト）の自動配置・衝突回避を実装/変更する PR で確認する:

- [ ] label↔node 貫通数・label↔label オーバーラップ数・label↔line 貫通数を**数値で測るヘルパー**（`countLabelPenetrations` / `countLabelOverlaps` / `countLabelLinePenetrations`）を用意し、本体と test が**同じ箱推定**と**同じ strict-interior 線分判定**（`segmentCrossesAnyRect`）を共有する。
- [ ] 衝突する合成 fixture で pass 後に該当計測が **0（または削減）** になることを assert した。
- [ ] **自分のエッジの線の上に居るだけのラベルは動かない**（override が空）ことを assert した。
- [ ] 実サンプルの柵で **3 軸すべてを同時に 0** と assert した（1 つの読めなさを別の読めなさと交換していないことの担保）。
- [ ] **衝突が無い fixture で override が空（byte-stable）** であることを assert し、既存 renderer snapshot が無変更 green であることを確認した。
- [ ] **author 指定ラベル**（非 default position/offset）が override マップに現れないこと、かつ obstacle として auto ラベルを弾くことを assert した。
- [ ] **実サンプル**（実レイアウトを通した `.krs`）で default 配置では衝突が発生し、pass 後に 0 になることを柵にした（vacuous でないことを precondition で確認）。
- [ ] best-effort の探索上限を明示し、上限内で clear できないケースでも **throw せず・衝突を増やさない**ことを assert した（0 を保証できないことを AT の範囲外に明記）。
- [ ] 配置が決定論（同じ入力 → 同じ override）であることを assert した。

## 既知の対処パターン

- **箱推定の一元化**: `labelBox(anchor, width, fontSize)` を 1 つ用意し、描画（`renderEdge`）・計測・test が同じ箱を使う。実フォントメトリクスと厳密一致しなくても、描画と計測が同じ推定なら内部整合はとれる。
- **最小変位優先の貪欲配置**: 候補を `0, +1, -1, +2, -2, …` の順（default を最初）に試し、**最初に clear した候補で確定**する。default が clear なら動かさない（byte-stability）。エッジに垂直な方向へ nudge すると縦横どちらのエッジでも分離が効く。
- **障害物 = ノードカード ∪ 既確定ラベル ∪ 他エッジの polyline**: author 固定ラベルを先に placed に積み、auto ラベルはそれらとノード矩形と他エッジの線を避ける。除外は 2 つだけで、どちらも理由が異なる —— **自分のエッジの線**（ラベルが乗るべき場所。ADR-2360）と、**境界フレーム（container）**（ラベルが正当に内側に住む領域。入れると drill-down で親フレーム内ラベルを追い出す）。ghost / cyclic エッジは移動対象からも障害物からも外す（ADR-968）。
- **線コストはノード矩形と同じ重み**: 文字の上を走るストロークは背後のカードと同程度に読めなくする。線を弱いペナルティに落とすと「線に乗ったままが最小コスト」になって症状が残る。
- **best-effort の明示**: 探索上限を定数化し、上限内で 0 にできないラベルは最小コスト位置へ。author に `label-position` / `label-offset`（ADR-1184）で逃がす手段があることを doc/AT に残す。

## 関連テスト

- `packages/core/src/renderer/label-placement.test.ts`（合成 fixture での貫通 0 / オーバーラップ 0 / 線貫通 0 / own-line 除外 / byte-stable / author 不可侵 / 決定論、および `examples/en/ec-platform/01-system.krs`（#2048）と `examples/en/hr-tool/system.krs`（#2360）を実サンプル柵に）

## 派生元 spec / 設計

- `docs/adr/2048-edge-label-collision-avoidance.md`（ADR-2048）— auto label collision-avoidance（本観点の一次ソース、#2048）
- [ADR-2360](../adr/2360-label-placement-line-obstacles.md) — 障害物集合にエッジ polyline を追加（label↔line 軸の出所、#2360）
- [ADR-1184](../adr/1184-edge-label-position-offset.md) — 手動 `label-position` / `label-offset` lever（auto が尊重する author precedence の出所）
- [TPL-1927](TPL-1927-routing-measures-crossings-and-penetrations.md) — エッジルーティングの交差・貫通・共線オーバーラップの数値計測（本 TPL が「箱の overlap」へ拡張する先行観点）
