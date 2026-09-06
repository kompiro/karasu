---
type: product
---

# AT-2635: Team dependency extraction — 1:N ownership, derivation, and CLI output

- **日付**: 2026-09-04
- **関連 Issue**: [#2635](https://github.com/kompiro/karasu/issues/2635)（slice A of [#2597](https://github.com/kompiro/karasu/issues/2597)）
- **対象ファイル**:
  - `packages/core/src/parser/reference-validation.ts` (`buildTeamOwnership`)
  - `packages/core/src/view/team-dependency-extract.ts`
  - `packages/core/src/view/team-dependency-extract.test.ts`
  - `packages/core/src/view/team-dependency-format.ts`
  - `packages/core/src/view/team-dependency-format.test.ts`
  - `packages/core/src/view/derivation-contracts.test.ts`
  - `packages/cli/src/team-dependencies.ts`
  - `packages/cli/src/team-dependencies.test.ts`
  - `packages/cli/src/compile-system-view.ts` (`resolveProjectOrExit`)
  - `docs/spec/syntax.md` / `docs/spec/syntax.ja.md` §「Ownership inheritance」
  - `docs/spec/glossary.md` / `docs/spec/glossary.ja.md`
- **関連 TPL**: [TPL-2635](../test-perspectives/TPL-2635-ownership-resolution-declares-its-walk.md)（本 PR で起票した proactive TPL）, [TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md), [TPL-510](../test-perspectives/TPL-510-derivation-tag-semantics.md), [TPL-2075](../test-perspectives/TPL-2075-parsed-construct-renders-or-warns.md)

## 受け入れ条件

- [x] AT-A: `owns` された 2 サービス間のエッジが、チーム対ごと・エッジ kind ごとに 1 本の依存として現れ、誘発した論理エッジを provenance として辿れる
  > ✅ Automated — `packages/core/src/view/team-dependency-extract.test.ts` › `derives one dependency per team pair per edge kind, with the inducing edges as provenance`

- [x] AT-B: 共同所有されたノードが端点になっても、出ていく側のチームが導出結果から消えない（TPL-2161 の contract）
  > ✅ Automated — `team-dependency-extract.test.ts` › `keeps every owner of a co-owned node, so the outgoing team survives a handoff (TPL-2161)`

- [x] AT-C: `owns` を持たない `domain` が親 `service` のチームに解決し、継承であることが provenance に残る
  > ✅ Automated — `team-dependency-extract.test.ts` › `resolves a domain with no \`owns\` of its own to its nearest owned ancestor's team`

- [x] AT-D: 端点が同一チームに解決するエッジは依存を生まない
  > ✅ Automated — `team-dependency-extract.test.ts` › `derives no dependency from an edge whose endpoints resolve to the same team`

- [x] AT-E: 一方が他方の org ツリー上の祖先である対が、通常の cross-team と区別される
  > ✅ Automated — `team-dependency-extract.test.ts` › `marks a pair where one team is nested inside the other as \`nested\``

- [x] AT-F: `user` 端点が未所有として数えられない（アクターは ownable ではない）
  > ✅ Automated — `team-dependency-extract.test.ts` › `does not count a \`user\` endpoint as unowned — an actor is not ownable`

- [x] AT-G: 所有に届かなかった端点が出力に残る（黙って落とさない）
  > ✅ Automated — `team-dependency-extract.test.ts` › `surfaces endpoints that resolve to no owning team`

- [x] AT-H: `organization` が複数ファイルにまたがる（S4 union）モデルでも導出が成立する
  > ✅ Automated — `team-dependency-extract.test.ts` › `derives across a multi-file model whose organization blocks are unioned (S4)`

- [x] AT-I: sync と async が 1 本に畳まれない
  > ✅ Automated — `team-dependency-extract.test.ts` › `keeps sync and async as separate dependencies for one team pair`

- [x] AT-J: `karasu team-dependencies` が md（team × team マトリクス + provenance + 未所有）を stdout に、csv を `-o` の先に書く
  > ✅ Automated — `packages/cli/src/team-dependencies.test.ts` › `writes the markdown matrix and provenance to stdout by default` / `writes csv to file when --format csv -o is given`

- [x] AT-K: 新規 derivation が `DERIVATION_CONTRACTS` に登録され、preserves（`kind` / provenance ラベル）と transforms（`fromTeam` / `toTeam` / `relation`）が固定される
  > ✅ Automated — `packages/core/src/view/derivation-contracts.test.ts` › `extractTeamDependencies: cross-service domain edge (async) aggregated to a team pair`

- [x] AT-L: 依存の導出が別 system の同名ノードに広がらず、1 本のエッジの provenance が 1 件のままである
  > ✅ Automated — `team-dependency-extract.test.ts` › `does not pair a bare endpoint with a same-named node in another system`

- [x] AT-M: 所有の単位でない対象（`system`）への `owns` が所有関係に入らず、継承で system 配下を丸ごと配らない
  > ✅ Automated — `team-dependency-extract.test.ts` › `ignores an \`owns\` naming a system, which the spec refuses as an ownership unit`

- [x] AT-N: 所有しえない kind（`user` / `system`）が未所有の数え上げに入らない
  > ✅ Automated — `team-dependency-extract.test.ts` › `does not count a \`user\` endpoint as unowned — an actor is not ownable` / `does not report a \`system\` endpoint as an ownership gap`

- [x] AT-O: 片端が解決しないエッジでも、解決した側の所有ギャップは残る
  > ✅ Automated — `team-dependency-extract.test.ts` › `still reports the resolvable end when the other endpoint names nothing`

- [x] AT-P: 空白を含む team id でもチーム対が衝突しない
  > ✅ Automated — `team-dependency-extract.test.ts` › `keeps two team pairs apart when a team id contains a space`

- [x] AT-Q: ラベル中の `|` が md テーブルの列構造を壊さない
  > ✅ Automated — `packages/core/src/view/team-dependency-format.test.ts` › `escapes a \`|\` in a label so the table keeps its column count`

- [x] AT-R: `organization` を持たないモデルでも md が未所有の残余を報告する（csv と食い違わない）
  > ✅ Automated — `team-dependency-format.test.ts` › `still reports the unowned remainder when the model declares no organization`

- [x] AT-S: モデルに error 診断があるとき、導出前に停止して stderr に報告する
  > ✅ Automated — `packages/cli/src/team-dependencies.test.ts` › `prints the model's errors and exits 1 without deriving anything`

## 手動確認

N/A — 自動テストですべて覆っている。本スライスは CLI とコアの導出のみで、app の描画面は
[#2636](https://github.com/kompiro/karasu/issues/2636)（slice B）が持つ。

## このスライスが**まだ**答えないこと

- 導出結果を図として見る手段（slice B [#2636](https://github.com/kompiro/karasu/issues/2636)）
- 囲みを跨ぐ所有（structural overlap。slice C [#2637](https://github.com/kompiro/karasu/issues/2637)）
- `entity` ブロック内の relation は導出対象外（概念上の関連であって呼び出しではない）
