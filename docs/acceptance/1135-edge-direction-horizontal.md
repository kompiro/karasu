---
type: product
---

# AT-1135: Edge `direction: left` / `direction: right` horizontal placement

- **日付**: 2026-05-06
- **関連 Issue**: [#1135](https://github.com/kompiro/karasu/issues/1135)（親 #1124 / #1076）
- **対象ファイル**:
  - `packages/core/src/renderer/layer-layout-logics.ts`（新関数 `applyEdgeDirectionWithinLayer`）
  - `packages/core/src/renderer/layout.ts`（forced layer の単一 / 多 system 経路にフック）
  - `packages/core/src/renderer/layer-layout-logics.test.ts`（新規）、`packages/core/src/index.test.ts`
  - `docs/spec/style.md`、`docs/spec/style.ja.md`
- **関連設計**: [`docs/design/edge-direction-horizontal.md`](../design/edge-direction-horizontal.md)
- **関連 ADR**: ADR-20260409-04（barycenter）、ADR-20260429-04（column hint）、ADR-20260430-04（last-wins）
- **依存**: AT-1124（`direction: up` 実装）、AT-1134（`direction: down` 実装）

## 受け入れ条件

- [x] AT-A: 同一 layer の sibling ノード間の edge に `direction: right` を付けると、矢印が **右方向** に流れる（= source は target の **左側** に並び替わる）。`up` / `down` と同じく値は矢印の流れる向きを表す
  > ✅ Automated — `packages/core/src/renderer/layer-layout-logics.test.ts` › `applyEdgeDirectionWithinLayer › places source to the left of the target for direction:right (arrow flows rightward)`

- [x] AT-B: `direction: left` で矢印が **左方向** に流れる（= source は target の **右側**）
  > ✅ Automated — `packages/core/src/renderer/layer-layout-logics.test.ts` › `... > places source to the right of the target for direction:left (arrow flows leftward)`

- [x] AT-C: source / target が異なる layer にいるとき、エンジンは source を target の layer に **引き寄せて** 横並びにする（service 同士の edge など典型ケース。`up` / `down` と同じ "source 局所変位" モデル）
  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `... > pulls source into target's layer for direction:left / direction:right (cross-layer hint)` & `packages/core/src/index.test.ts` › `... > \`direction: right\` pulls a service-to-service edge into the same layer ...`

- [x] AT-D: ノード A に `column: right` を、エッジ A -> C に `direction: right` を付けたとき、edge hint が node hint を上書きして A は C の右に並ぶ（precedence ルール）
  > ✅ Automated — `packages/core/src/renderer/layer-layout-logics.test.ts` › `... > overrides bucketByColumn placement for the source endpoint (precedence rule)`

- [x] AT-E: 同じ source に対する複数の矛盾する `left/right` ヒントは declaration 順で **後勝ち**（last-wins）。最後に適用された hint の隣接関係が結果に残る
  > ✅ Automated — `packages/core/src/renderer/layer-layout-logics.test.ts` › `... > resolves multiple horizontal hints with last-wins`

- [x] AT-F: end-to-end で `compile()` が同一 layer に並ぶ 2 ノード間の `direction: right` を SVG x 座標に反映する
  > ✅ Automated — `packages/core/src/index.test.ts` › `compile — edge direction hint reaches the layered layout > \`direction: right\` places the source to the right of the target within the same layer`

- [ ] AT-G（manual）: 実際の Preview で edge を右クリック → Direction ▸ Right を選び、source ノードが target の右に並び替わることを確認する。drill-down / forced kind system view どちらでも有効
  > 🧑 Manual — `pnpm --filter @karasu-tools/app dev` で Preview を起動。`service A -> service C` のような典型エッジで操作し、x 座標が変化することを目視

## 補足

- **適用スコープ**: forced kind-based system view（top-level および multi-system）と drill-down view（topological）の両方で動作する。layer 引き寄せ（案 A）採用により、source / target が自然な layout で別層になる典型ケース（service 同士の edge など）でも honor される
- **ADR 整合**: 既存 ADR-20260429-04（column hint）の "bucket 内並び保持" は edge hint が無い場合の挙動として引き続き成立。edge hint 適用時は precedence ルール上、bucket 境界を越え得ることが Design Doc に明記されている
- **値の意味**: `direction:` は `up` / `down` / `left` / `right` のすべてが「矢印の流れる向き」を表す。source は矢印と逆側に置かれる。GUI 編集器でも「Direction ▸ Right」を選ぶと矢印が右に流れる、と直感的に読める
- **last-wins**: ADR-20260430-04 の cascade 規約に揃える形で、矛盾する horizontal hint は後発勝ち。GUI 編集器（#1129）の append 流に整合
- **deploy / org view**: 引き続き column hint と同様に horizontal direction も無視される（warning は出さない — edge プロパティなので column の non-system warning とは別系統）
