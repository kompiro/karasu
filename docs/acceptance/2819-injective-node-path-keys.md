---
type: product
---

# AT: node path と edge の identity キーが injective になる（#2819）

- **日付**: 2026-10-09
- **関連 Issue**: [#2819](https://github.com/kompiro/karasu/issues/2819)
- **Related TPLs**: [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)（キーのエンコードは injective に、キーを分解する読み手はエンコーダの逆関数で）
- **対象ファイル**:
  - `packages/core/src/parser/reference-validation.ts`（`buildOwnerIndex` / `buildTeamOwnership` / `buildBoundaryMembership` のキー）
  - `packages/core/src/renderer/layout-grouping.ts`（`projectPathIndexOntoCanvas`）
  - `packages/core/src/renderer/org-renderer.ts` / `packages/core/src/renderer/org-tree-renderer.ts`（owns ボタンの属性値と表示）
  - `packages/core/src/diff/org-view-diff.ts`（`ownsEdgeKey`）
  - `packages/core/src/diff/view-diff.ts`（`edgeKey`）/ `packages/core/src/diff/deploy-view-diff.ts`
  - `packages/core/src/view/team-dependency-extract.ts`（出力の `path` / `fromPath` / `toPath` / `insidePath`）
  - `packages/app/src/hooks/useCrossNavigation.ts`（`handleOwnedServiceClick`）

> 索引とキーのいくつかが、node path（または edge の両端）を区切り文字で 1 本の文字列に join し、その文字列を identity に使っていた。区切り join は injective ではないので、`Shop.Api`（`Shop` の中の `Api`）とトップレベルの `service "Shop.Api"` が 1 つのキーに落ちた。path キーは `nodePathRefId`（ADR-2714 のエンコード）に揃え、edge の diff キーは曖昧にする端点だけ引用符で囲む。`.`・`"`・`\`（edge キーではさらに `->`）を含まない id だけのモデルでは、キーも SVG 属性も変わらない。

## 受け入れ条件

### AC-1: 別々のノードの所有・所属が別々に保たれる

- [x] AT-A: `owns Shop.Api` と `owns "Shop.Api"` を別の team が書くと、`ownerIndex` に 2 つのエントリが残り、`duplicate-owner-assignment` は出ない

  > ✅ Automated — `packages/core/src/parser/node-reference-paths.test.ts` › path-keyed indices are injective (#2819) › keeps one owner per node and reports no false co-ownership

- [x] AT-B: `contains` でも同じく、`boundaryMembership` に 2 つのエントリが残り、`duplicate-boundary-assignment` は出ない

  > ✅ Automated — `packages/core/src/parser/node-reference-paths.test.ts` › path-keyed indices are injective (#2819) › keeps boundary membership per node and reports no false multi-membership

- [x] AT-C: `.`・`"`・`\` を含まない path のキーは今までどおり（`Shop.Api`）

  > ✅ Automated — `packages/core/src/parser/node-reference-paths.test.ts` › path-keyed indices are injective (#2819) › leaves the key of a path with no dot, quote or backslash unchanged

- [x] AT-D: `karasu team-dependencies` は 2 つのノードを別々の team に結び、出力の path は dotted id を引用符付きで書く

  > ✅ Automated — `packages/core/src/view/team-dependency-extract.test.ts` › extractTeamDependencies — dotted ids (#2819) › tells a nested node from a top-level node whose id carries the dot ／ … › reports a path through a dotted id in the injective form

### AC-2: id に `.` を含むノードが team / boundary の枠に入る

- [x] AT-E: `system Shop { service "a.b" {} }` の `a.b` は、`Shop` の canvas で自分の team の枠に入る

  > ✅ Automated — `packages/core/src/compile/injective-identity-keys.test.ts` › a node whose id carries a dot keeps its frame (#2819) › is framed on its system's canvas

- [x] AT-F: system の外に書いた `service "x.y"` も、root の canvas で自分の team の枠に入る

  > ✅ Automated — `packages/core/src/compile/injective-identity-keys.test.ts` › a node whose id carries a dot keeps its frame (#2819) › is framed on the root canvas when it is declared outside any system

### AC-3: org ビューの owns ボタン

- [x] AT-G: `owns Shop.Api` と `owns "Shop.Api"` は別々の属性値（`Shop.Api` / `"Shop.Api"`）と表示（`→ Shop.Api` / `→ "Shop.Api"`）のボタンになる

  > ✅ Automated — `packages/core/src/compile/injective-identity-keys.test.ts` › owns buttons name the node the author wrote (#2819) › renders one button per reference, each with its own id

- [x] AT-H: compare では 2 つの参照が別々の diff state を持つ。team id が `#owns#` を含んでも別の owns と衝突しない

  > ✅ Automated — `packages/core/src/compile/injective-identity-keys.test.ts` › owns buttons name the node the author wrote (#2819) › diffs the two references separately ／ `packages/core/src/diff/org-view-diff.test.ts` › ownsEdgeKey (#2819) › separates a team id that carries the separator from the ref it would swallow

- [x] AT-I: app で 2 つのボタンをそれぞれクリックすると、`→ Shop.Api` は `Shop` の中の `Api` へ、`→ "Shop.Api"` はトップレベルの service へ遷移する

  > ✅ Automated — `packages/e2e/tests/at-2819-owned-service-injective-ref.spec.ts` › AT-2819 owned-service buttons keep the reference the author wrote › → Shop.Api opens the node it names ／ … › → "Shop.Api" opens the node it names

- [x] AT-J: 参照が名指すノードと `nodePathIndex` の勝者が違うときは、別のノードへ遷移しない

  > ✅ Automated — `packages/app/src/hooks/useCrossNavigation.test.ts` › useCrossNavigation › handleOwnedServiceClick › does not navigate when the indexed node is not the one the reference names

### AC-4: `->` を含む id の edge が別々の diff state を持つ

- [x] AT-K: before の `a -> "b->c"` と after の `"a->b" -> c` は、system ビューの compare で removed と added の 2 本になる

  > ✅ Automated — `packages/core/src/compile/injective-identity-keys.test.ts` › an edge whose endpoint carries `->` keeps its own diff state (#2819) › in the system view

- [x] AT-L: deploy ビューの compare でも同じく 2 本になる

  > ✅ Automated — `packages/core/src/compile/injective-identity-keys.test.ts` › an edge whose endpoint carries `->` keeps its own diff state (#2819) › in the deploy view

- [x] AT-M: `->`・`"`・`\` を含まない端点の edge キーは今までどおり（`Catalog->Orders`）

  > ✅ Automated — `packages/core/src/diff/view-diff.test.ts` › edgeKey (#2819) › keeps the plain `${from}->${to}` form for ordinary ids

## 手動確認

N/A — 自動テストですべて覆っている。判定は索引の中身・SVG 属性・compare の diff state・遷移後に描かれたノードで、実機を要しない。

## 参考: 対象のモデル

```krs
system Shop {
  service Api {
    domain Inner {}
  }
}

service "Shop.Api" {
  domain Outer {}
}

organization Acme {
  team Core {
    owns Shop.Api
    owns "Shop.Api"
  }
}
```
