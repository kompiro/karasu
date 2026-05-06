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

- [x] AT-A: 同一 layer の sibling ノード間の edge に `direction: right` を付けると、source が target の **直右** に並び替えられる
  > ✅ Automated — `packages/core/src/renderer/layer-layout-logics.test.ts` › `applyEdgeDirectionWithinLayer › places source directly to the right of the target for direction:right`

- [x] AT-B: `direction: left` で source が target の **直左** に並び替えられる
  > ✅ Automated — `packages/core/src/renderer/layer-layout-logics.test.ts` › `... > places source directly to the left of the target for direction:left`

- [x] AT-C: source / target が異なる layer にいるとき、`direction: left/right` は no-op（auto 扱い）。`ordered` の入力配列がそのまま返る
  > ✅ Automated — `packages/core/src/renderer/layer-layout-logics.test.ts` › `... > falls through to no-op when source and target sit in different layers`

- [x] AT-D: ノード A に `column: right` を、エッジ A -> C に `direction: right` を付けたとき、edge hint が node hint を上書きして A は C の右に並ぶ（precedence ルール）
  > ✅ Automated — `packages/core/src/renderer/layer-layout-logics.test.ts` › `... > overrides bucketByColumn placement for the source endpoint (precedence rule)`

- [x] AT-E: 同じ source に対する複数の矛盾する `left/right` ヒントは declaration 順で **後勝ち**（last-wins）。最後に適用された hint の隣接関係が結果に残る
  > ✅ Automated — `packages/core/src/renderer/layer-layout-logics.test.ts` › `... > resolves multiple horizontal hints with last-wins`

- [x] AT-F: end-to-end で `compile()` が `direction: right` を SVG x 座標に反映する（drill-down + cycle で同一 layer に揃えたシナリオ）
  > ✅ Automated — `packages/core/src/index.test.ts` › `compile — edge direction hint reaches the layered layout > \`direction: right\` places the source to the right of the target within the same layer`

- [ ] AT-G（manual）: 実際の Preview で同一 row に並ぶ 2 ノード間の edge を右クリック → Direction ▸ Right を選び、source ノードが target の右に並び替わることを確認する
  > 🧑 Manual — `pnpm --filter @karasu-tools/app dev` で Preview を起動。同 kind tier 上にある sibling 同士の edge で操作し、x 座標が変化することを目視

- [ ] AT-H（manual）: cross-layer の edge（user → service など）に `direction: right` を付けても layout が変わらないことを目視確認（仕様の no-op 部分）
  > 🧑 Manual — Preview で cross-layer edge に対して操作し、変化が起きないことを確認

## 補足

- **適用スコープ**: `bucketByColumn` が動く forced kind-based system view のみ（spec に明記）。drill-down view では `bucketByColumn` 自体が走らないが、新パスは layer 割当後の within-layer 順序に対しても同様に動くため、cycle 経由で同一 layer に並んだ場合は drill-down でも honor される（AT-F で確認済み）
- **ADR 整合**: 既存 ADR-20260429-04（column hint）の "bucket 内並び保持" は edge hint が無い場合の挙動として引き続き成立。edge hint 適用時は precedence ルール上、bucket 境界を越え得ることが Design Doc に明記されている
- **last-wins**: ADR-20260430-04 の cascade 規約に揃える形で、矛盾する horizontal hint は後発勝ち。GUI 編集器（#1129）の append 流に整合
- **deploy / org view**: 引き続き column hint と同様に horizontal direction も無視される（warning は出さない — edge プロパティなので column の non-system warning とは別系統）
