---
type: product
---

# AT: root ビューの compare モードは、各 system フレームの子を system id で突き合わせて diff する（#3126）

- **日付**: 2026-10-14
- **関連 Issue**: [#3126](https://github.com/kompiro/karasu/issues/3126)
- **Related TPLs**: [TPL-3126](../test-perspectives/TPL-3126-compare-pairs-revisions-by-identity-not-position.md)（before と after を id で突き合わせる。AC-2）、[TPL-2756](../test-perspectives/TPL-2756-downstream-consumes-what-upstream-assembled.md)（レイアウトは diff が組み立てた子の集合を読む。AC-1）、[TPL-1583](../test-perspectives/TPL-1583-migration-priority-index-winner.md)（bare id は勝者。AC-3）、[TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)（backfill の key に system を含める。AC-4）
- **対象ファイル**:
  - `packages/core/src/diff/view-diff.ts`（`diffSystemViewSlices`）
  - `packages/core/src/compile/compile-diff.ts`（removed ノードの backfill、`unionRanking`）
  - `packages/app/src/components/PreviewPane.tsx`（詳細パネルの annotation 差分）

> 複数 system のルートビューを compare モードで開くと、ノードの diff 状態が付くのは最初の system の子だけで、他の system から消した子は描かれなかった。さらに before と after がそれぞれ自分の先頭の system を基準にしていたので、先頭の system を足す・消すと別の system の子どうしを突き合わせ、変わっていない子を `removed` / `added` として別の枠に描いていた。各フレームは、もう片方の同じ id の system の子と突き合わせる。

モデル（before）:

```krs
system Shop {
  service Api {}
  service Worker {}
  Api -> Worker
}
system Admin {
  service Console { description "admin" }
  service Jobs {}
  Console -> Jobs
}
```

## 受け入れ条件

### AC-1: 先頭以外の system の子が自分の diff 状態を持つ

- [x] AT-A: `Admin.Console` の description だけを変えると、`Admin.Console` が `changed` になり、他のカードは `unchanged`

  > ✅ Automated — `packages/core/src/renderer/multi-system-root-diff.test.ts` › root compare mode diffs every system frame by system id (#3126) › gives a changed child of a non-first system its own state

- [x] AT-B: `Admin` に足した子は `added`

  > ✅ Automated — `packages/core/src/renderer/multi-system-root-diff.test.ts` › root compare mode diffs every system frame by system id (#3126) › marks a child added to a non-first system as added

- [x] AT-C: `Admin` から消した子は `removed` で、`Admin` の枠の中に描かれる

  > ✅ Automated — `packages/core/src/renderer/multi-system-root-diff.test.ts` › root compare mode diffs every system frame by system id (#3126) › draws a child removed from a non-first system, inside that system's frame

- [x] AT-D: `Admin` を丸ごと消すと、その子はすべて `removed`

  > ✅ Automated — `packages/core/src/renderer/multi-system-root-diff.test.ts` › root compare mode diffs every system frame by system id (#3126) › draws every child of a removed non-first system as removed

### AC-2: 先頭の system を足す・消しても、他の system の子の状態は変わらない

- [x] AT-E: 先頭に `system Billing { service Pay {} }` を足すと、`Billing.Pay` だけが `added` で、`Shop` の子は `Shop` の枠の中で `unchanged`

  > ✅ Automated — `packages/core/src/renderer/multi-system-root-diff.test.ts` › root compare mode diffs every system frame by system id (#3126) › leaves the other systems unchanged when a system is added first

- [x] AT-F: 先頭の `Shop` を消すと、`Shop` の子だけが `Shop` の枠の中で `removed` になり、`Admin` の子は `unchanged`

  > ✅ Automated — `packages/core/src/renderer/multi-system-root-diff.test.ts` › root compare mode diffs every system frame by system id (#3126) › removes only the first system's children when the first system is removed

- [x] AT-G: モデルを空にすると、各 system の子がそれぞれ自分の枠の中で `removed`

  > ✅ Automated — `packages/core/src/renderer/multi-system-root-diff.test.ts` › root compare mode diffs every system frame by system id (#3126) › draws every system's children as removed in its own frame when the model is emptied

### AC-3: 同名ノードはそれぞれ自分の状態を持ち、bare id は勝者の状態を返す

- [x] AT-H: `Shop.Api` と `Admin.Api` があり `Admin.Api` だけを変えると、`Admin.Api` が `changed`、`Shop.Api` が `unchanged`。`nodeDiff.get("Api")` は `@migration_target` の付いた方の状態

  > ✅ Automated — `packages/core/src/renderer/multi-system-root-diff.test.ts` › root compare mode diffs every system frame by system id (#3126) › gives same-id cards their own states, and the bare id the winner's

- [x] AT-I: 詳細パネルの annotation 差分は、クリックしたカード自身のもの

  > ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › data-node-path resolves the clicked card (#2917) › shows the clicked card's own annotation diff, not the bare-id winner's (#3126)

### AC-4: 消した子は自分の team の帯に戻る

- [x] AT-J: group by team で、`Admin` から消した子は before で所属していた team の帯に描かれる（同じ id の子が `Shop` にあっても、その team を借りない）

  > ✅ Automated — `packages/core/src/renderer/multi-system-root-diff.test.ts` › root compare mode diffs every system frame by system id (#3126) › returns a child removed from a non-first system to its own team's band

### AC-5: app で compare モードを開いたときの見え方

- [ ] AT-K: 上のモデルを `index.krs` に保存し、`Admin.Console` の description を変え、`Admin` に `service Mail {}` を足した版を作る。file tree の `⇄ Paste` に元のモデルを貼って Compare すると、ルートビューで `Admin.Console` が changed、`Admin.Mail` が added の色で描かれる。貼る側に `Admin` の `service Mail {}` を足し、`index.krs` から消すと、`Admin.Mail` が `Admin` の枠の中に removed で描かれる

  > 🧑 Manual — https://karasu.kompiro.dev/ の compare モードで目視する（色の見え方と枠の中の配置）

## 手動確認

- AT-K: 差分の色と、消したカードが自分の system の枠に収まって見えるかは、app の画面で確かめる（自動テストは `data-diff-state` と矩形の包含までを見る）。
