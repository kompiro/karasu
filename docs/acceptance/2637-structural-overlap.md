---
type: product
---

# AT-2637: Structural overlap — ownership crossing containment

- **日付**: 2026-09-04
- **関連 Issue**: [#2637](https://github.com/kompiro/karasu/issues/2637)（slice C of [#2597](https://github.com/kompiro/karasu/issues/2597)）
- **対象ファイル**:
  - `packages/core/src/view/team-dependency-extract.ts` (`findStructuralOverlaps`)
  - `packages/core/src/view/team-dependency-extract.test.ts`
  - `packages/core/src/view/team-dependency-format.ts`
  - `packages/core/src/view/team-dependency-format.test.ts`
  - `packages/core/src/renderer/team-dependency-graph.ts`
  - `packages/core/src/renderer/team-dependency-graph.test.ts`
  - `packages/core/src/renderer/empty-state-labels.ts`
  - `packages/cli/src/team-dependencies.test.ts`
  - `packages/i18n/src/en.ts`, `packages/i18n/src/ja.ts`, `packages/i18n/src/types.ts`
  - `docs/spec/glossary.md`, `docs/spec/glossary.ja.md`
- **関連 TPL**: [TPL-2635](../test-perspectives/TPL-2635-ownership-resolution-declares-its-walk.md)（宣言と継承の区別）, [TPL-2075](../test-perspectives/TPL-2075-parsed-construct-renders-or-warns.md)

## 受け入れ条件

- [x] AT-A: team A が所有するノードが team B の所有するノードの内側にあるとき、1 件として報告される
  > ✅ Automated — `packages/core/src/view/team-dependency-extract.test.ts` › `reports a node owned by one team living inside another team's node, once`

- [x] AT-B: 親 team のノードの内側を子 team が持つ場合も報告される（org ツリー上の入れ子は免除にしない）
  > ✅ Automated — `team-dependency-extract.test.ts` › `reports a sub-team holding ground inside its parent team's node`

- [x] AT-C: 自身の owner が囲みの owner と一致するノードは報告されない
  > ✅ Automated — `team-dependency-extract.test.ts` › `does not report a node whose own owner matches its enclosing owner`

- [x] AT-D: 自身に `owns` を持たず継承しているだけのノードは overlap として報告されない
  > ✅ Automated — `team-dependency-extract.test.ts` › `does not report a node that only inherits its owner`

- [x] AT-E: 共同所有の途中でも、内側の team が外側の集合に含まれているなら報告しない
  > ✅ Automated — `team-dependency-extract.test.ts` › `reports the outgoing side of a handover that still holds ground inside`

- [x] AT-F: slice A が出す依存は本追加で一切変わらない（囲みから依存を作らない）
  > ✅ Automated — `team-dependency-extract.test.ts` › `leaves the edge-induced dependencies untouched`

- [x] AT-G: md では依存とは別セクションに、csv では専用の `relation` 値を持つ行として出る
  > ✅ Automated — `packages/core/src/view/team-dependency-format.test.ts` › `gets its own markdown section, not a row among the dependencies` / `is a csv row discriminated by its own relation value`

- [x] AT-H: `karasu team-dependencies` の出力に囲みを跨ぐ所有が現れる
  > ✅ Automated — `packages/cli/src/team-dependencies.test.ts` › `reports ownership crossing containment beside the dependencies`

- [x] AT-I: org タブの依存グラフは、描けない事実を黙殺せず件数をフッタに出す
  > ✅ Automated — `packages/core/src/renderer/team-dependency-graph.test.ts` › `counts ownership crossing containment in the footer` / `says nothing about overlap when none crosses`

## 手動確認

N/A — 自動テストですべて覆っている。

## このスライスが**まだ**答えないこと

- 診断（diagnostic）にはしない。`owns` を隅々まで書いていない既存モデルすべてに
  ノイズが出るため、ビュー出力に留める判断は [#2637](https://github.com/kompiro/karasu/issues/2637) の Out of scope のまま
- グラフ上では件数のみ。どのノードがどの囲みを跨いでいるかは md / csv 側で読む
