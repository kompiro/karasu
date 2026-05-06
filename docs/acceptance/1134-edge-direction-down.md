---
type: product
---

# AT-1134: Edge `direction: down` strict downward placement

- **日付**: 2026-05-06
- **関連 Issue**: [#1134](https://github.com/kompiro/karasu/issues/1134)（親 #1124 / #1076）
- **対象ファイル**:
  - `packages/core/src/renderer/layout.ts`（`applyDirectionHintsToForcedLayers` を `up`/`down` 一元処理に拡張）
  - `packages/core/src/renderer/layout.test.ts`、`packages/core/src/index.test.ts`
  - `docs/spec/style.md`、`docs/spec/style.ja.md`
- **関連**: [`docs/design/edge-direction-style.md`](../design/edge-direction-style.md)、AT-1124（`up` 実装）

## 受け入れ条件

- [x] AT-A: forced kind-based layout で source が target より下にあるエッジに `direction: down` を付けると、source が target の 1 段上に押し上げられる
  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `layout > edge direction hint > honors direction:down in the forced kind-based layout (mirror of up)`

- [x] AT-B: target が layer 0 のとき、`direction: down` は no-op（押し上げる余地がないため）。source の位置は元のまま
  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `layout > edge direction hint > treats direction:down as a no-op when the target is already at layer 0`

- [x] AT-C: `compile()` end-to-end で、`direction: down` の rule が SVG 出力に反映される（service → client back-edge シナリオ）
  > ✅ Automated — `packages/core/src/index.test.ts` › `compile — edge direction hint reaches the layered layout > \`direction: down\` pushes the source above the target under the forced kind-based layout`

- [ ] AT-D（manual）: 実際の Preview で service → client などの back-edge を右クリック → Direction ▸ Down を選び、service が client の上に移動して描画されることを確認する
  > 🧑 Manual — `pnpm --filter @karasu-tools/app dev` で Preview を起動。`examples/getting-started/index.krs` または同等の system view で操作し、`.krs.style` に rule が増え、配置が変わることを目視

## 補足

- 単純な drill-down view（forced layer なし）では自然な topological order が既に `down` を満たすので `down` と `auto` は観察上同じ。spec に明記
- `up` と同じく、`down` も target を動かさない局所的変位。これにより同 kind の他ノードへの影響を最小化
- `left` / `right` は引き続き未対応（→ #1135）
