---
type: product
---

# AT: deep link を開いても history に途中の entry が積まれない（#3284）

- **日付**: 2026-10-22
- **関連 Issue**: [#3284](https://github.com/kompiro/karasu/issues/3284)
- **Related TPLs**: [TPL-1842](../test-perspectives/TPL-1842-restore-state-survive-later-reset.md)
- **対象ファイル**: `packages/app/src/hooks/useHistoryNavigation.ts`（effect ② / effect ③）

> deep link（`#krs-deploy` / `#krs-org-root` / `#krs-system-<id>` / `:<highlight>` 付き）で app を cold boot すると、hash を書く effect が復元前の state（mount 直後の `system` root、seed の reset、再適用の直前の commit）を `pushState` していた。Back はそれらを経由してからリンク元に戻っていた。hash が名指す値がすべて state に commit されるまで、書き込みを replace にする。

## 受け入れ条件

### AC-1: 復元が終わるまで history に entry を足さない

- [x] AT-A: 実 reducer で deploy / drill 先 node / highlight の hash から cold boot し、seed の `SELECT_FILE` と index の充填を経ても `pushState` が 0 回で、hash がリンクの状態を指している。index が seed と同じ render で埋まる場合と、1 render 遅れる場合の両方

  > ✅ Automated — `packages/app/src/hooks/useHistoryNavigation.test.ts` › `a cold boot on a deep link adds no history entry (#3284)` › `%s (index fills in the seed's render: %s)`

- [x] AT-B: 実アプリで deep link を開くと `history.length` が 1 だけ増え、Back でリンク元のページに戻る（`#krs-deploy` / `#krs-org-root` / `#krs-system-OrderService` / `#krs-system-root:OrderService`）

  > ✅ Automated — `packages/e2e/tests/at-3284-deep-link-cold-boot-history.spec.ts` › `a cold boot at ${hash} adds one history entry, and Back leaves it (AT-B)`

### AC-2: 復元が終わった後のユーザー操作は history に積まれる

- [x] AT-C: 復元の後でタブを切り替えると `pushState` が 1 回呼ばれる

  > ✅ Automated — `packages/app/src/hooks/useHistoryNavigation.test.ts` › `a cold boot on a deep link adds no history entry (#3284)` › `%s (index fills in the seed's render: %s)`

- [x] AT-D: index が mount 時点で埋まっている場合（Memory / Serve mode）も、file が入った時点で復元が終わり、次の drill が push される

  > ✅ Automated — `packages/app/src/hooks/useHistoryNavigation.test.ts` › `a cold boot on a deep link adds no history entry (#3284)` › `pushes the first navigation after a boot with the index ready at mount`

- [x] AT-E: 再適用する値が state にすでにある場合（model に無い node を指す drill hash が root に解決される）も、復元が開いたまま残らず、次の操作が push される

  > ✅ Automated — `packages/app/src/hooks/useHistoryNavigation.test.ts` › `a cold boot on a deep link adds no history entry (#3284)` › `pushes the first navigation when the restored value was already in the state`

## 手動確認

N/A — 自動テストですべて覆っている
