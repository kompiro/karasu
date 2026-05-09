---
type: product
---

# AT-1184: Edge `label-position` / `label-offset` style properties

- **日付**: 2026-05-09
- **関連 Issue**: [#1184](https://github.com/kompiro/karasu/issues/1184)（親 #1071 — 既に close）
- **対象ファイル**:
  - `packages/core/src/types/style.ts`
  - `packages/core/src/resolver/style-resolver.ts`、`packages/core/src/resolver/style-resolver.test.ts`
  - `packages/core/src/renderer/edge-routing.ts`
  - `packages/core/src/index.test.ts`
  - `docs/spec/style.md`、`docs/spec/style.ja.md`

## 受け入れ条件

- [x] AT-A: `ResolvedEdgeStyle` に `labelPosition`（`[0, 1]` の数値）と `labelOffset`（数値、px）が必須フィールドとして追加され、デフォルトは `0.5` / `0`
  > ✅ Automated — `packages/core/src/resolver/style-resolver.test.ts` › `label-position / label-offset properties › defaults label-position to 0.5 (midpoint) and label-offset to 0`

- [x] AT-B: `label-position: start` / `middle` / `end` のキーワードがそれぞれ `0` / `0.5` / `1` に正規化される
  > ✅ Automated — `style-resolver.test.ts` › `... > translates the \`start\` keyword to 0` / `... translates the \`end\` keyword to 1`

- [x] AT-C: `label-position` に `0.25` のような fractional 値を書けて、そのまま反映される
  > ✅ Automated — `style-resolver.test.ts` › `... > accepts a fractional value`

- [x] AT-D: `[0, 1]` 範囲外の数値はクランプされる（`1.5` → `1`）
  > ✅ Automated — `style-resolver.test.ts` › `... > clamps fractional values outside [0, 1]`

- [x] AT-E: 認識できない値は `middle` にフォールバックする（warning なし silent）
  > ✅ Automated — `style-resolver.test.ts` › `... > falls back to the default for unrecognised keywords / non-numeric values`

- [x] AT-F: `label-offset` は `8px` も `8` も `-12` も同じく数値として parse され、`labelOffset` に格納される
  > ✅ Automated — `style-resolver.test.ts` › `... > parses a numeric label-offset, with or without the px suffix`

- [x] AT-G: `label-position: start` を edge に当てると、SVG 上の label `<text>` の y が baseline より小さくなる（source 端に寄る）
  > ✅ Automated — `packages/core/src/index.test.ts` › `compile — edge label-position and label-offset > \`label-position: start\` moves the label closer to the source end`

- [x] AT-H: `label-position: end` で y が baseline より大きくなる（target 端に寄る）
  > ✅ Automated — `index.test.ts` › `... > \`label-position: end\` moves the label closer to the target end`

- [x] AT-I: `label-offset: 12px` を当てると、下方向に流れる edge の label x が baseline より小さくなる（CCW perpendicular = leftward）
  > ✅ Automated — `index.test.ts` › `... > \`label-offset\` shifts the label perpendicular to the edge`

- [x] AT-J: 既存の `direction` 等のプロパティを設定しても、`label-position` / `label-offset` を触らなければ label の y は byte-stable のまま（互換性）
  > ✅ Automated — `index.test.ts` › `... > default label-position keeps the historical longest-segment heuristic byte-stable`

- [ ] AT-K（manual）: 実際の Preview で `.krs.style` に `edge#X { label-position: end; }` を追加し、target 端に label が寄ることを目視
  > 🧑 Manual — `pnpm --filter @karasu-tools/app dev` で Preview を起動。`examples/getting-started/index.krs` のいずれかの edge id を狙ってルールを追加し、変化を確認

## 補足

- **デフォルト保護**: `labelPosition === 0.5 && labelOffset === 0` のときは既存の "最長セグメント中点" ヒューリスティクスを維持。これにより既存図の SVG 出力が変わらないことを AT-J で担保
- **2 軸 offset は MVP 外**: Issue 本文の `<dx>px <dy>px` は 1 軸 perpendicular に差し戻し。spec に明記済み
- **GUI menu との統合**: `direction` 同様、Preview 右クリックメニューに `Label position ▸ Start / Middle / End` を追加するのは別 issue で扱う（本 PR は spec + renderer + resolver のみ）
