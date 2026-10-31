---
type: product
---

# AT: 交差のマークが、facet overlay と diff モードでもエッジと一緒に薄くなる（#3157）

- **日付**: 2026-10-18
- **関連 Issue**: [#3157](https://github.com/kompiro/karasu/issues/3157)
- **Related TPLs**: [TPL-3090](../test-perspectives/TPL-3090-edge-decoration-follows-edge-emphasis.md)
- **対象ファイル**: `packages/core/src/renderer/crossing-marks-svg.ts`（`followEdges` / `markDiffState`）

> facet overlay と diff モードはエッジを薄くするが、エッジに属する交差のマーク（hop・合流のチップ・トランク帯）は明るいまま残っていた。マークは、名指すエッジがすべて薄いときだけ一緒に薄くなる（#3090 の hover と同じ規則）。

## 受け入れ条件

### AC-1: facet overlay

- [x] AT-A: facet を選ぶと、薄いエッジだけに属するマークはエッジと同じ不透明度（0.28）になる。選ばれた facet のエッジを 1 本でも含むマークは明るいまま

  > ✅ Automated — `packages/core/src/renderer/svg-renderer.test.ts` › `crossing marks follow their edges' dim (#3157)` › `dims a mark under the facet overlay when every edge it names is dimmed`
  >
  > ✅ Automated — `packages/core/src/renderer/svg-renderer.test.ts` › `crossing marks follow their edges' dim (#3157)` › `keeps a mark bright when one of its edges is lit`

### AC-2: diff モード

- [x] AT-B: 属するエッジがすべて `unchanged` のマークは `data-diff-state="unchanged"` を持ち、diff モードの既存のスタイルでエッジと同じく薄くなる。added / removed / changed のエッジを 1 本でも含むマークは明るいまま

  > ✅ Automated — `packages/core/src/renderer/svg-renderer.test.ts` › `crossing marks follow their edges' dim (#3157)` › `marks a mark unchanged in compare mode only when every edge it names is`

### AC-3: どちらも無いときは変わらない

- [x] AT-C: facet を選ばず diff モードでもないときは、マークの出力が変わらない（TPL-2174）

  > ✅ Automated — `packages/core/src/renderer/svg-renderer.test.ts` › `crossing marks follow their edges' dim (#3157)` › `changes nothing with no facet selected and diff mode off (TPL-2174)`
  >
  > ✅ Automated — `pnpm --filter @karasu-tools/core test`（既存のスナップショットと routing の柵が無変更で通る）

## 手動確認

N/A — 自動テストですべて覆っている
