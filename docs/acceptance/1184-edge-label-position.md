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

- [x] AT-F1: `label-offset: 8px`（1 値）は y 軸のみのずらしとして解釈され、`labelOffsetX === 0`、`labelOffsetY === 8` になる
  > ✅ Automated — `style-resolver.test.ts` › `... > parses a single-token label-offset as y-only (x stays 0)`

- [x] AT-F2: `label-offset: 4px 8px`（2 値）は CSS shorthand と同じく `dx dy` として解釈される
  > ✅ Automated — `style-resolver.test.ts` › `... > parses a two-token label-offset as \`dx dy\``

- [x] AT-F3: 負の値も `dx` / `dy` どちらでも受理される
  > ✅ Automated — `style-resolver.test.ts` › `... > accepts negative offsets in either token`

- [x] AT-G: `label-position: start` を edge に当てると、SVG 上の label `<text>` の y が baseline より小さくなる（source 端に寄る）
  > ✅ Automated — `packages/core/src/index.test.ts` › `compile — edge label-position and label-offset > \`label-position: start\` moves the label closer to the source end`

- [x] AT-H: `label-position: end` で y が baseline より大きくなる（target 端に寄る）
  > ✅ Automated — `index.test.ts` › `... > \`label-position: end\` moves the label closer to the target end`

- [x] AT-I1: `label-offset: 8px`（1 値）を当てると、SVG 上の label `<text>` の y が baseline より大きくなる（下方向にずれる）。x は同じ
  > ✅ Automated — `index.test.ts` › `... > \`label-offset: 8px\` shifts the label downward (single-token = y axis)`

- [x] AT-I2: `label-offset: 4px 8px`（2 値）を当てると、x も y も baseline より大きくなる（右下にずれる）
  > ✅ Automated — `index.test.ts` › `... > \`label-offset: 4px 8px\` shifts the label both right and down`

- [x] AT-J: 既存の `direction` 等のプロパティを設定しても、`label-position` / `label-offset` を触らなければ label の y は byte-stable のまま（互換性）
  > ✅ Automated — `index.test.ts` › `... > default label-position keeps the historical longest-segment heuristic byte-stable`

- [ ] AT-K（manual）: 実際の Preview で `.krs.style` に `edge#X { label-position: end; }` を追加し、target 端に label が寄ることを目視
  > 🧑 Manual — `pnpm --filter @karasu-tools/app dev` で Preview を起動。`examples/getting-started/index.krs` のいずれかの edge id を狙ってルールを追加し、変化を確認

## 補足

- **デフォルト保護**: `labelPosition === 0.5 && labelOffset === 0` のときは既存の "最長セグメント中点" ヒューリスティクスを維持。これにより既存図の SVG 出力が変わらないことを AT-J で担保
- **screen-axis CSS shorthand を採用**: 1 値で y のみ、2 値で `dx dy`。`edge { label-offset: 0 8px }` のような全 edge 一律ルールが予測通りに動く（initial draft の 1 軸 perpendicular はレビューで即撤回 — 詳細は ADR-20260509-04）
- **GUI menu との統合**: `direction` 同様、Preview 右クリックメニューに `Label position ▸ Start / Middle / End` を追加するのは別 issue で扱う（本 PR は spec + renderer + resolver のみ）
