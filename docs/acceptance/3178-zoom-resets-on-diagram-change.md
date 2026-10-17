---
type: product
---

# AT: 別の図へ移ると、プレビューのズームとパンが初期値に戻る（#3178）

- **日付**: 2026-10-17
- **関連 Issue**: [#3178](https://github.com/kompiro/karasu/issues/3178)
- **Related TPLs**: [TPL-2800](../test-perspectives/TPL-2800-diagram-pane-shared-viewer-affordances.md)
- **対象ファイル**: `packages/app/src/components/PreviewPane.tsx`（`diagramKey`）、`packages/app/src/components/PreviewColumn.tsx`

> プレビューのズームとパンは、表示する図が変わっても残っていた。12 の domain を見るために縮小したままドリルダウンすると、24 の usecase を持つ domain が前の図のための倍率と位置で開き、小さすぎるか一部が画面外になった。図が変わったら初期値に戻し、編集で同じ図を描き直すときは残す。

## 受け入れ条件

### AC-1: 別の図へ移ると初期値に戻る

- [x] AT-A: ホイールで縮小したあとにドリルダウンすると、新しい図は `translate(0px, 0px) scale(1)` で表示される

  > ✅ Automated — `packages/e2e/tests/at-3178-zoom-resets-on-diagram-change.spec.ts` › `AT-3178 zoom and pan reset for another diagram` › `a drill-down starts the new diagram at the initial zoom (AT-A)`

- [x] AT-B: ホイールで縮小したあとに別のタブ（Deploy）へ切り替えると、その図は初期値で表示される

  > ✅ Automated — `packages/e2e/tests/at-3178-zoom-resets-on-diagram-change.spec.ts` › `AT-3178 zoom and pan reset for another diagram` › `switching the view tab starts it at the initial zoom (AT-B)`

### AC-2: 同じ図の描き直しではズームが残る

- [x] AT-C: 縮小したあとに `.krs` を編集して同じ図が描き直されても、ズームとパンは変わらない

  > ✅ Automated — `packages/e2e/tests/at-3178-zoom-resets-on-diagram-change.spec.ts` › `AT-3178 zoom and pan reset for another diagram` › `an edit that re-renders the same diagram keeps the zoom (AT-C)`
  >
  > ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › `wheel zoom (#1537)` › `keeps the zoom when the same diagram re-renders, and resets it for another diagram`

## 手動確認

N/A — 自動テストですべて覆っている
