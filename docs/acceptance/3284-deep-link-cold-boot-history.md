---
type: product
---

# AT: deep link を開いても history に途中の entry が積まれない（#3284）

- **日付**: 2026-10-22
- **関連 Issue**: [#3284](https://github.com/kompiro/karasu/issues/3284) / [#3598](https://github.com/kompiro/karasu/issues/3598)（`index.krs` 以外のファイルを指すリンク）
- **Related TPLs**: [TPL-1842](../test-perspectives/TPL-1842-restore-state-survive-later-reset.md)
- **対象ファイル**: `packages/app/src/hooks/useHistoryNavigation.ts`（effect ② / effect ③）、`packages/app/src/hooks/useProjectInitialization.ts`（起動時のファイル）、`packages/app/src/hooks/useFileSelection.ts`（同じファイルの選択の合流、読めないときの fallback）、`packages/app/src/hooks/useOrgView.ts`（index がどのファイルから作られたか）

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

### AC-3: `index.krs` 以外のファイルを指すリンクでも同じ（#3598）

- [x] AT-F: `?file=` が `index.krs` 以外を指す deep link で開いても `history.length` が 1 だけ増え、そのファイルとリンクのビューが開いて、Back でリンク元に戻る。実 reducer では、先に開いていた `index.krs` の index が揃っても復元を終えず、指すファイルが入ってからビュー・ドリルを当てて終える（index がそのファイルと同じ render で埋まる場合と、1 render 遅れる場合の両方。ファイルが何も開いていない起動からも同じ）。ドリルは指すファイル自身の index で解決し、前のファイルの index が残っているあいだは待つ。開いているプロジェクトの外のファイルを指すリンクは、そのファイルを開かない

  > ✅ Automated — `packages/e2e/tests/at-3284-deep-link-cold-boot-history.spec.ts` › `a cold boot on a link naming another file than index.krs adds one history entry (AT-F)`
  > ✅ Automated — `packages/app/src/hooks/useHistoryNavigation.test.ts` › `a deep link naming another file adds no history entry (#3598)` › `%s restores on the named file (index fills in its render: %s)`
  > ✅ Automated — `packages/app/src/hooks/useHistoryNavigation.test.ts` › `a deep link naming another file adds no history entry (#3598)` › `restores a boot from no file open on the named file (index in its render: %s)`
  > ✅ Automated — `packages/app/src/hooks/useHistoryNavigation.test.ts` › `a deep link naming another file adds no history entry (#3598)` › `resolves the drill against the named file's own index, not the one before it`
  > ✅ Automated — `packages/app/src/hooks/useHistoryNavigation.test.ts` › `a deep link naming another file adds no history entry (#3598)` › `does not open a named file outside the open project`
  > ✅ Automated — `packages/app/src/hooks/useProjectNavigation.test.ts` › `hands over no file when the hash names one outside the boot's project`

- [x] AT-G: プロジェクトに無いファイルを指す deep link でも復元が終わり、そのあとのファイルの切り替えは通常どおり history に積まれる。指すファイルが開けなかったときも、待ち続けずに復元を終える。指すファイルが開く前でも後でも、別のファイルへ移るか、タブやドリルを自分で動かせば復元を終え、その操作から history に積まれる（指すファイルの index が空のままでも、あとで埋まったときにリンクのビューを上書きしない）。存在するのに読めないファイルを指すときは `index.krs` を開く

  > ✅ Automated — `packages/e2e/tests/at-3284-deep-link-cold-boot-history.spec.ts` › `after a link naming a file the project does not have, a file switch is a new entry (AT-G)`
  > ✅ Automated — `packages/app/src/hooks/useHistoryNavigation.test.ts` › `a deep link naming another file adds no history entry (#3598)` › `stops waiting for the named file when it does not open`
  > ✅ Automated — `packages/app/src/hooks/useHistoryNavigation.test.ts` › `a deep link naming another file adds no history entry (#3598)` › `ends the restoration when the visitor leaves a named file whose index stays empty`
  > ✅ Automated — `packages/app/src/hooks/useHistoryNavigation.test.ts` › `a deep link naming another file adds no history entry (#3598)` › `ends the restoration when the visitor opens another file before the named one`
  > ✅ Automated — `packages/app/src/hooks/useHistoryNavigation.test.ts` › `a deep link naming another file adds no history entry (#3598)` › `ends the restoration on the visitor's own tab click or drill in the named file`
  > ✅ Automated — `packages/app/src/hooks/useFileSelection.test.ts` › `selects the fallback when the read of an existing file fails, unless a newer selection came`

## 手動確認

N/A — 自動テストですべて覆っている
