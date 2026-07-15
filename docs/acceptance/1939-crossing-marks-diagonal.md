# AT-1939-A: Group by team — crossing marks cover diagonal crossings (oriented hops)

- **日付**: 2026-07-14
- **Issue**: #1939（親 #1859 / Epic #1817 comprehension）— Part 1
- **PR**: (#1939-A — generalise computeCrossingMarks)
- **設計**: [docs/design/system-view-grouping.md](../design/system-view-grouping.md) § 「P2c カバレッジ拡張（#1939）」Part 1（案C）
- **Related TPLs**: [TPL-20260711-02](../test-perspectives/TPL-20260711-02-routing-measures-crossings-and-penetrations.md)（交差数と貫通数を両方測る／交差は「全交差 marked」を assert）
- **対象**: `packages/core/src/renderer/crossing-marks.ts`（`computeCrossingMarks` を一般線分交差へ拡張・`HopMark.angle` 追加） / `layout-types.ts` / `svg-renderer.ts`（`renderCrossingMarks` を回転アーク対応）

## 概要

#1926（P2c-C）で marks は **軸整列（直角）交差**のみを対象とし、`routeGroupedEdges` が直線のまま残す「素通り可能な帯内エッジ」が斜めのとき、その交差は未印だった。本 slice（#1939 Part 1・**案C = routing 不変**）は `computeCrossingMarks` を **任意の strict-interior 線分交差**へ一般化し、hop を**より水平なセグメントに沿った向き**で描く。軸整列交差は `angle = 0` で **#1939 以前と byte-identical**。

## 受け入れ条件

### AC-1: 斜め交差の検出と向き（core）

> ✅ Automated by `packages/core/src/renderer/crossing-marks.test.ts` (suite-wide)

- [x] 異なるエッジの任意の 2 セグメントが strict-interior で交差する点に hop を 1 つ記録する（軸整列に限らない）
- [x] hop は **より水平なセグメント**（|ux| 大）に乗り、`angle` はそのセグメントの向き（度）。同点は edge index 小で決定（決定論）
- [x] 端点合流（トランク join・折れ角）は strict-interior 除外で hop にならない（既存規約の一般化）
- [x] クラスタ化は「同一 host セグメント上で近接する交差を 1 幅広 hop に統合」へ一般化
- [x] 座標は float ノイズ除去のため丸める（決定論・snapshot 安定）

### AC-2: 軸整列の回帰なし（core, 回帰）

> ✅ Automated by `packages/core/src/renderer/group-by-render.test.ts` (suite-wide)

- [x] 水平 host は `angle = 0` で、hop の `<path>` が #1926 と同一文字列（renderer の回転アークは angle 0 で従来形に一致）
- [x] 既存 core スイート全通過（grouped SVG snapshot に差分なし＝byte-identical）

### AC-3: 描画（core）

> ✅ Automated by `packages/core/src/renderer/group-by-render.test.ts` (suite-wide)

- [x] grouped view で斜め交差が **回転アーク**（`<path>` の x-axis-rotation が非ゼロ）で描かれる
- [x] 各 mark は所有エッジの色/線幅で描く（#1926 の挙動を維持）

## 手動検証

- [ ] **AC-manual**: app で、同一帯内に斜めの clear エッジが別エッジと交差する grouped モデル（`index.krs`）を Group by → Team で開く。斜めの交差箇所に**線に沿った向きの跨ぎアーク（hop）**が描かれ、「非接続」が明示されることを目視確認する。
