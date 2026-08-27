---
id: ADR-2593
title: キャンバスの空き空間を目的関数にして行幅予算を選ぶ
status: accepted
date: 2026-08-27
topic: renderer
related_to: [ADR-1737, ADR-1000, ADR-2521, ADR-649]
scope:
  packages: [core]
assumptions:
  - "symbol: packages/core/src/renderer/aspect-search.ts :: searchWidthBudget"
  - "symbol: packages/core/src/renderer/aspect-search.ts :: withinAspectBand"
  - "symbol: packages/core/src/renderer/aspect-search.ts :: candidateWidthBudgets"
  - "symbol: packages/core/src/renderer/layer-layout-logics.ts :: placeNodesInLayers"
  - "symbol: packages/core/src/renderer/deploy-layout.ts :: layoutDeploy"
  - "file: docs/acceptance/2593-canvas-space-objective.md"
  - "file: docs/test-perspectives/TPL-2593-layout-feedback-is-floor-first-and-monotone.md"
---

# ADR-2593: キャンバスの空き空間を目的関数にして行幅予算を選ぶ

- **日付**: 2026-08-27
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2593](https://github.com/kompiro/karasu/issues/2593)、設計 PR [#2599](https://github.com/kompiro/karasu/pull/2599)、実装 PR [#2624](https://github.com/kompiro/karasu/pull/2624)
  - [ADR-1737](./1737-balanced-grid-sibling-layout.md)（兄弟軸の balanced grid。本 ADR はその規則を deploy コンテナの内側へ広げる）
  - [ADR-1000](./1000-icon-mode-layout-gap-tuning.md)（icon mode 専用の密グリッドパッキングを却下）
  - [ADR-2521](./2521-multi-system-pipeline-convergence.md)（共有ヘルパーに寸法フラグを足さない）
  - [ADR-649](./649-drawio-export.md)（draw.io export が「自動レイアウト最適化はしない」の escape hatch）
  - TPL: [TPL-2593](../test-perspectives/TPL-2593-layout-feedback-is-floor-first-and-monotone.md)（本件で起こした proactive TPL）, [TPL-1223](../test-perspectives/TPL-1223-scoped-glance-drill-down.md), [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)
  - AT: [AT-2593](../acceptance/2593-canvas-space-objective.md)、[AT-0049](../acceptance/0049-deploy-layer-wrap.md)（deploy の幅基準を更新）
  - コード: `packages/core/src/renderer/aspect-search.ts`, `layout.ts`, `layer-layout-logics.ts`, `deploy-layout.ts`

## 背景

レイアウトは**兄弟の軸だけを二重に縛り、レイヤーの軸を縛っていなかった**。幅は
`GRID_COLUMN_CAP`（5）と `MAX_LAYER_WIDTH`（1200 / icon 1040）の早い方で止まるのに、
高さは層内の折り返しも層の積み上げも下へ伸ばすだけで上限が無い。しかも**出来上がった
バウンディングボックスを読み返す経路がパイプラインに 1 つも無かった**。

結果、カードがわずかに太いだけで 1 行 3 枚が入らず 2 枚に折り返され、以降ひたすら下へ伸びる。
reverse-engineer した dify モデル（10,093 行 / 41 view）では deploy view が
`1274 × 3686`（比率 0.35）、`service/ApiBackend` が `1173 × 1858`（0.63）で、
zoom-to-fit すると横幅の 9〜35% しか使わない。[ADR-1737](./1737-balanced-grid-sibling-layout.md)
が兄弟軸に対して解いた scoped glance の問題が、レイヤー軸で再発していた。

## 決定

**帯（縦 16:9 〜 横 16:9）に収まる候補のうち、キャンバス面積が最小になる行幅予算を選ぶ。**
配置は純関数なので、候補となる行幅予算の固定リストで配置をやり直し、勝った回を採用する。

- **目的は面積、比率は制約**。中身の面積は候補によらず一定なので、面積最小 = 空き最小。
- **floor-first**: 最初の候補は各表示モード自身の `MAX_LAYER_WIDTH`。**厳密に小さい面積**の
  ときだけ置き換える。同面積の候補は同じキャンバスを並べ替えただけなので勝たせない。
- **採点は最終キャンバス**（`width` / `height`）。外部ノードの側面カラムやコンテナ余白は
  レイヤー content box の外側にあり、content box で採点すると横に行き過ぎる。
- **打ち切りは `exhausted` のみ**。予算が配置に届く経路は行幅上限ただ 1 つなので、
  「行が幅で切られなかった」回は以降の候補と同一になることが証明できる。
- 適用は共有 choke point の 2 箇所（`layout()` と `layoutDeploy()`）。選ばれた予算は
  `LayoutResult.widthBudget` として**出力**する（入力にはしない — ADR-2521）。
- **deploy コンテナ内の unit** も、4 個以上のときだけ `ceil(sqrt(n))` 列（最大 5）に畳む。

## 理由

- **読者が見ているのは比率ではなく空白**。目的関数を実測で比較した（dify 40 view、予算固定）:

  | 目的 | 面積合計 | 帯から外れる view |
  | --- | --- | --- |
  | 現行定数（下限） | 158.1 Mpx | 0 |
  | 正方形に最も近い | 155.0 Mpx（−2%） | 0 |
  | 面積最小 | 115.8 Mpx（−27%） | **10** |
  | **帯 + 面積最小** | **130.7 Mpx（−17%）** | **0** |

  正方形狙いは空きをほとんど減らさず、deploy では比率 0.98 の候補が比率 0.75 の候補より
  18% 大きい。一方、面積だけを見ると棚詰めは横長ほど得なので比率 8〜9 倍のリボンが選ばれる。
  **帯は目的ではなく、その退化を止める制約**として要る。16:9 は画面形状という外形的な根拠を持ち、
  log 空間で対称なので縦横どちらも贔屓しない。
- **決定性を死守**。候補列はモデルとレイアウト定数だけから決まり、viewport を読まない
  （CLI は headless でレンダリングする）。乱数も焼きなましも収束ループも無い。
- **floor-first が churn を消す**。下限が先頭で厳密改善のみが勝つので、収まっている図は
  1 バイトも変わらない。束ねられた examples 104 view（system 84 / deploy 20）は無変化。
- **deploy の unit grid に閾値が要る**のは実測から。3 個以下まで grid 化すると小さいコンテナが
  横に広がり、行とキャンバスまで広がって**既存の deploy 図が 6 件すべて大きくなった**（最大 +29%、
  1 件は帯の外）。閾値を「4 個以上」に置くと既存 20 view が完全に不変のまま、
  dify の `VectorStore`（十数個の互換ベクタ DB イメージが 1 列 = `380 × 2094` の帯）は捕まえられる。

### non-goal「自動レイアウト最適化はしない」との線引き

`docs/concepts.md` の当該 non-goal（escape hatch は [ADR-649](./649-drawio-export.md) の
draw.io export）に対し、[ADR-1737](./1737-balanced-grid-sibling-layout.md) は
「決定的で**数ベース**の既定レイアウト規則は抵触しない」と線を引いた。本決定はそこから一歩動き、
**測定ジオメトリ（キャンバスの幅・高さ）を配置判断にフィードバックする**。

新しい線は次のとおり: **候補の列挙と採点が入力だけで決まり、既定候補が先頭で、
厳密改善のみが勝つなら、フィードバックがあっても既定レイアウト規則の側に留まる。**
禁じられているのは「見た目を pixel-perfect にいい感じへ自動調整するエンジン」であって、
反復・収束判定・viewport 依存・乱数がそれに当たる。著者は `grid-columns` と draw.io export の
両方で最終制御を保持する。この線は proactive TPL
[TPL-2593](../test-perspectives/TPL-2593-layout-feedback-is-floor-first-and-monotone.md) が守る。

## 実装で設計を覆した点

Design Doc の段階では気付かず、実装とコードレビューで判明して方針を変えた点を残す。

1. **配置は予算に対して単調ではない。** 「予算を広げると幅は減らず高さは増えない」を根拠に、
   帯の上端を超えた時点で探索を打ち切っていた。行の高さはその行の最も高いカードで決まるため、
   高さの異なるカードを再折り返しすると**総高が増えうる**（実測: 不揃いカード 7 枚で
   1430 → 1492）。打ち切りは削除し、健全な `exhausted` のみ残した。単調性を固定したはずの
   テストも、定数高のカードしか作らず、しかも探索が見る最終キャンバスではなく content box を
   assert していたため検出できなかった。現在は**反例を柵として固定**している。
2. **同面積のタイブレークを入れてはいけない。** 同面積なら squareness で選ぶ実装にしていたが、
   これは floor の配置を無償で奪うので floor-first と矛盾する。削除した。
3. **deploy の unit grid には閾値が要る**（上記「理由」参照）。当初は 2 個以上で畳んでいた。

## 却下した案

- **反復修復ループ**（配置 → 配線 → 衝突があればノードを調整 → 収束まで繰り返す）:
  収束保証が無く、停止条件を回数上限にすると結果が上限に依存する。エッジ 1 本の追加で
  レイアウト全体が組み替わり、差分の局所性（`docs/concepts.md` Goals）と compare/diff を壊す。
- **目標アスペクト比に最も近い候補**: 空きが 2% しか減らず、deploy では正方形に寄せたぶん
  かえって面積が増える。
- **面積のみ（帯なし）**: 40 view 中 10 view が帯の外へ出る（比率 8〜9 倍のリボン）。
- **面積から閉形式で予算を求める** (`sqrt(総面積 × 目標比 / 充填率)`): 充填率は実測で 0.63〜0.85 と
  ばらつき、外しても気付けない。候補を実際に配置して測れば仮定が要らない。
- **[ADR-1000](./1000-icon-mode-layout-gap-tuning.md) 案2 の再導入**（icon mode 専用の密グリッド
  パッキング）: 同 ADR が「新コードパスが増えて routing の恩恵を再実装するか片肺になる」
  「mode 切替で配置が大きく変わり差分が読みづらい」として却下済み。本決定はパッキング規則を変えず、
  共有 choke point で予算の選び方だけを変えるので抵触しない。探索の下限を各モード自身の定数に
  することで後者の懸念にも応える。
- **行幅予算を公開 API の入力にする**: [ADR-2521](./2521-multi-system-pipeline-convergence.md) が
  「共有ヘルパーに寸法の両対応フラグを足さない」として却下した形。選ばれた予算は出力として
  `LayoutResult.widthBudget` に載せ、テストと調査はそれを読む。

## 残る限界

- **1 ノードだけの層が縦に連なるモデルには効かない**。行を広げても吸収するものが無い。
  `user → service` 10 連鎖は `320 × 2099`（0.15）のまま。#2593 の案 B（レイヤー列を横に折り畳む）
  か案 C（連鎖 run を横置き）が要る。
- **レイヤー帯をまたぐ 2 次元パッキングはしない**。deploy に残る空白はコンテナ 1 個の
  レイヤーが 1 行を占有することによるもので、埋めるには依存 DAG の「1 レイヤー = 1 行」という
  読み方を変える必要がある。
- **帯の内側にいる縦長キャンバスは改善されない**。比率 0.62 のような図は帯の内側なので、
  1〜4% 面積の大きい正方形候補があっても選ばれない。目的関数の定義どおりの挙動だが、
  「縦長を直す」という当初の動機からは残件になる。
- **multi-system root では効きにくい**。system を横に並べる経路では下限がすでに最小のことが多い。
