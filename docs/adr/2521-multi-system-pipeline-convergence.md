---
id: ADR-2521
title: multi-system ルートビューは single-system パイプラインの計算に合わせる
status: accepted
date: 2026-08-16
topic: renderer
related_to: [ADR-1859, ADR-1724, ADR-2330]
scope:
  packages:
    - core
assumptions:
  - "symbol: packages/core/src/renderer/layer-layout-logics.ts :: placeNodesInLayers"
  - "symbol: packages/core/src/renderer/layout-geometry.ts :: computeTotalDimensions"
  - "grep: packages/core/src/renderer/layout.ts :: ports: portResolver\\(options\\)"
---

# ADR-2521: multi-system ルートビューは single-system パイプラインの計算に合わせる

- **日付**: 2026-08-16
- **ステータス**: 決定済み
- **関連**:
  - Issue #2521（統括）、#2513 / #2515 / #2514
  - 発見の経緯: Issue #2512（`renderer/layout.ts` 分割リファクタ）
  - [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)
  - `packages/core/src/renderer/layout.ts`（`layoutInner` / `layoutMultipleSystems`）

## 背景

`layoutInner`（単一システム）と `layoutMultipleSystems`（複数システムのルート
ビュー）は同じパイプラインの半身だが、共有すべき関心事 3 つで実装が分岐していた。
#2512 の分割リファクタは「挙動不変」を制約にしていたため、ピクセルが動くこれらは
意図的に手つかずで残し、個別 Issue に切り出してあった。

分岐は 3 点:

1. **キャンバス寸法** — multi はコンテナ矩形だけから幅・高さを出し、single は
   `computeTotalDimensions` でノード端とエッジ waypoint も畳み込む。#2363 で
   ルートビューにも routing chain が入った結果、トランクレーン
   （`maxRight + GUTTER_GAP + (lane+1)·TRUNK_LANE_GAP`）が最後のシステムの
   コンテナ矩形を越え、viewBox の外に出て切れる条件が生まれていた。
2. **shape ports** — multi は `PortResolver` を routing chain に渡しておらず、
   `seatPortsOnOutline` が一度も走らない。#2452 の輪郭シートがドリルダウン
   ビューにしか届いていなかった。
3. **配置ループ** — wrap 閾値が multi 側だけ `NODE_GAP` 1 個ぶん早く、
   barycenter（交差最小化）も multi 側だけが実行していた。

TPL-219 が言う parallel-function parity の drift であり、このペアは過去 2 回
（#2363, #2367）同じ形で壊れている。

## 決定

3 点とも **multi 側を single 側の計算に合わせ、共有ヘルパー 1 本に畳む**。
配置ループについては、single 側が持っていなかった barycenter を（forced layer
でないときに限り）**両者が持つ**方向で統一する。

## 理由

- **寸法**: single 側の `computeTotalDimensions` が上位互換で、multi 側の
  インライン版は routing が無かった時代の名残。片方だけが正しいので選択の余地が
  ない。
- **ports**: リゾルバはノード単位で id をキーにするため、1 インスタンスで全
  システムフレームを賄える。ルートビューだけ bbox アンカーのままにする理由が
  ない（TPL-1983: 同じ view state はどの surface でも同じに振る舞う）。
- **配置ループの wrap 閾値**: single 側の `wrapLayerIntoRows` は先頭ギャップを
  含まない幅で比較しており、こちらが意図どおり。multi 側は走行中の x に先頭
  ギャップが乗ったまま比較していた実装事故。
- **barycenter を両者が持つ方向にした**: single 側のコメント自体が
  「将来 barycenter を入れるなら `forcedLayers === null` で gate せよ」と、
  multi 側が実際にやっている形を指名していた。Q11（forced kind tier の中では
  宣言順を守る）は gate によって維持される。束ねられた examples で実測した
  ところ、変化した 6 描画すべてで交差が減り（hop arc は crud-matrix で
  21→12 / 9→6、getting-started で 1→0）、増えた例はゼロだった。

## 却下した案

- **barycenter を落として single 側に合わせる**: 統一はできるが、ドリルダウン
  ビューの交差が増える方向。計測上ルートビューの品質が落ちるだけで、得るものが
  「変更が小さい」ことしかない。
- **3 件を別々の PR に分ける**: それぞれが同じ rendered-diff レビューと同じ
  changeset を要求するため、レビュー体制を 3 回組む分だけ純粋に無駄。1 PR に
  コミットを分けて載せ、視覚変化をコミット単位で帰属させる形にした。
- **multi のキャンバス寸法にフラグを足して両対応**: 乖離を共有ヘルパーの契約に
  焼き込むことになり、ヘルパーの説明が嘘になる。
