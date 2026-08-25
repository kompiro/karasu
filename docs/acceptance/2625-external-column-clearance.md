---
type: product
---

# AT: サイド列のカードが重ならない（#2625）

- **日付**: 2026-08-25
- **関連 Issue**: [#2625](https://github.com/kompiro/karasu/issues/2625)
- **Related TPLs**: [TPL-1761](../test-perspectives/TPL-1761-external-side-placement-invariant.md)（サイド配置の不変条件。観点 9「固定の広がりを N 等分しない」を本件で追加）
- **対象ファイル**:
  - `packages/core/src/renderer/external-columns.ts`（`place` とコンテナ拡張）

> サイド列はコンテンツの縦スパンを `count + 1` 等分してカードを載せていた。固定の広がりを N 等分する形は N が増えると静かに壊れ、刻み幅がカード高を下回るとカードが重なる（dify のルートビューで external 14 件が 25px ずつ重なった）。等分は入りきる限りの答えとして残し、隣接ペアが最小クリアランスを割るならクリアランスで積み直す。

## 受け入れ条件

### AC-1: 重ならない

- [x] AT-A: 列の件数を変えても隣接カードが重ならず、最小クリアランスを保つ

  > ✅ Automated — `packages/core/src/renderer/external-columns.test.ts` › `placeExternalServicesOnSides > vertical clearance (#2593 follow-up)` › `never overlaps two cards, however many the column holds`（4 / 8 / 14 / 20 件）

- [x] AT-B: `layout()` を通した図でも、列のカードが canvas の内側に収まる

  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `layout > side columns keep vertical clearance (#2593 follow-up)` › `keeps every card inside the canvas it reports`

### AC-2: はみ出した分をフレームが追う

- [x] AT-C: 帯より高くなった列を system フレームが包む

  > ✅ Automated — `packages/core/src/renderer/external-columns.test.ts` › `placeExternalServicesOnSides > vertical clearance (#2593 follow-up)` › `grows the system frame to wrap a column that outgrew the content`

- [x] AT-D: すでに収まっている列ではフレームが動かない

  > ✅ Automated — `packages/core/src/renderer/external-columns.test.ts` › `placeExternalServicesOnSides > vertical clearance (#2593 follow-up)` › `leaves a column with room to spare on the equal-step spread`

### AC-3: 既存の図と決定性

- [x] AT-E: 余裕のある列は従来どおりの等分配置のまま

  > ✅ Automated — 同上（`leaves a column with room to spare on the equal-step spread`）; `packages/core/src/renderer/layout.test.ts` › `leaves a column that already had clearance exactly where it was`

- [x] AT-F: 同じ入力で座標が一致する

  > ✅ Automated — `packages/core/src/renderer/external-columns.test.ts` › `placeExternalServicesOnSides > vertical clearance (#2593 follow-up)` › `is deterministic`

- [x] AT-G: 既存の描画テストが通る（examples 84 view のうち変化するのは payment-platform の 2 件のみ。いずれも 9〜18px だったギャップが 24px に揃うもので、canvas 寸法は不変）

  > ✅ Automated — `pnpm --filter @karasu-tools/core test`（3,903 件）

## 手動確認

- [ ] 🧑 Manual: external を多数持つモデルのシステムビューで、サイド列のカードが重ならず読めること（到達先: `https://karasu.kompiro.dev/`）
