# AT-2422: シェイプの port frame とチップ keep-out

- **日付**: 2026-08-12
- **Issue**: [#2422](https://github.com/kompiro/karasu/issues/2422)（親: [#2366](https://github.com/kompiro/karasu/issues/2366) スライス C。P10 の報告が起点）
- **設計**: [#2417](https://github.com/kompiro/karasu/pull/2417) の node chrome design（P10 案A。ADR 昇格は 3 スライス完了後）
- **関連 ADR**: [ADR-968](../adr/968-orthogonal-edge-routing-skip-layer.md)（直交ルーティングとポート配分）、[ADR-2330](../adr/2330-ungrouped-routing-parity.md)（候補列と計測柵）
- **Related TPLs**: [TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md)（新しい経路形は overlap パスに参加する）、[TPL-1927 系の計測柵](../adr/2330-ungrouped-routing-parity.md)
- **対象**: `packages/core/src/renderer/port-frame.ts`、`packages/core/src/renderer/shapes.ts`、`packages/core/src/renderer/edge-routing-ports.ts`、`packages/core/src/renderer/degraded-tabs.ts`、`packages/core/src/renderer/layout.ts`

## 概要

ポートは bounding box 上に置かれていた。長方形ならそれが輪郭だが、それ以外の
シェイプでは矢印がシェイプの無い場所で止まる — user カードではメダリオン脇の空間、
cylinder では上楕円の上。

シェイプが `portFrame(w, h)` で「各辺のどこを輪郭が覆っているか（spans）」と
「そこで輪郭がどれだけ内側にあるか（depth）」を宣言し、ポート配分がそれを消費する。
カード自身のクローム（#2420 のコーナーレーン、#2179 の縮退タブ帯）は keep-out。

**輪郭とクロームでは強さが違う。** 輪郭は事実なので、直線エッジが斜めになっても
そこへ寄せる。keep-out は選好なので、曲がりが吸収できるときだけ寄せる — 直角が
語彙の図で、チップ数 px のために線を斜めにはしない。

## 受け入れ条件

### AC-1: 区間の算術

> ✅ Automated by `packages/core/src/renderer/port-frame.test.ts` (suite-wide)

- [x] keep-out 矩形が辺の区間へ射影される（はみ出しはクランプ、辺に無関係なら null）
- [x] **反対側の辺には効かない** — 右上のチップが下辺のポートを動かさない
- [x] 区間の減算（分割・端の切り詰め・全消し・累積）
- [x] `t` の写像は区間長に比例し、順序と相対間隔を保つ（穴の中には決して落ちない）
- [x] keep-out で区間が空になるときはシェイプの区間へフォールバックする
- [x] depth は写像後の位置で評価される（曲線の輪郭が正しく追える）

### AC-2: 各 builtin シェイプの取り付け面が描画形状と一致する

> ✅ Automated by `packages/core/src/renderer/shape-port-frame.test.ts` (suite-wide)

- [x] `box` は宣言なし（bounding box がそのまま輪郭）
- [x] `user`: 上辺はカード枠線（深さ = メダリオン半径）で、メダリオン直下には取り付かない。左右はカード上端より下
- [x] `cylinder`: 上下はリム楕円に沿う（中央で箱に接し、端で ry 内側）。左右は 2 つのリムの間の直線部
- [x] `queue`: 上下は cap の間の平坦部、右は凸 cap、左は body へ食い込む凹弧
- [x] `hexagon`: 上下は斜辺を除いた平坦部、左右は頂点 1 点。全ポートが描画ポリゴン上に載る
- [x] `cloud`: 描画カーブを平坦化して光線と交差させ、輪郭の上に載せる（浮きも潜りもしない）。辺ごとの span は輪郭が一価になる中央部に限る

### AC-3: ルーティング後も輪郭に着地する

> ✅ Automated by `packages/core/src/renderer/port-seating.test.ts` (suite-wide)

- [x] cloud への矢印が bbox 上端ではなく blob の輪郭で終わる
- [x] cylinder への矢印がリム楕円の上（または内側）で終わる
- [x] user カードのメダリオン帯にポートが入らない
- [x] 長方形だけの図はポート座標が 1px も動かない（`shapeForNode` 有無で同一）

### AC-4: クロームの keep-out

> ✅ Automated by `packages/core/src/renderer/port-seating.test.ts` (suite-wide)

- [x] fan-in の 4 本すべてがコーナーレーンの外へ寄る
- [x] 単独の直線エッジは keep-out のために斜めにならない（曲がりが無いときは寄せない）

### AC-5: 縮退タブの実測を描画と共有する

> ✅ Automated by `packages/core/src/renderer/degraded-tabs.test.ts` (suite-wide)

- [x] タブは右詰めで左へ積まれ、ラベル実測幅でサイズが決まり、カード左端を越えない
- [x] 帯の union が keep-out として取り出せる（描画とポートが同じ数値を見る）

### AC-6: ルーティングの不変条件

> ✅ Automated by `packages/core/src/renderer/routing-parity.test.ts` (suite-wide)

- [x] 実サンプルに対し貫通 0 / collinear overlap 0（両モード）
- [x] 全交差に hop マークが付く
- [x] grouped の交差数 pin が変わらない（ungrouped の改善が grouped の退行を隠さない）

### AC-7: 手動確認（実機）

判定に実機が要るものだけを残す。座標の不変条件は AC-1〜AC-6 が判定済み。

- [ ] https://karasu.kompiro.dev/ で database / storage / queue / user を含むモデルを開き、矢印の先端が輪郭に接地して見える（浮きも潜りもない）
- [ ] 同じ図で、チップやタブの下に矢印の先端が隠れていない
- [ ] 直線で結ばれていたエッジが斜めになっていない
