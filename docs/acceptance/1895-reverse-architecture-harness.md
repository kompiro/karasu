---
type: product
---

# AT-1895: Architecture reverse harness (coverage / subtree primitives + skill)

- **日付**: 2026-07-13
- **関連 Issue**: [#1895](https://github.com/kompiro/karasu/issues/1895)
- **対象ファイル**:
  - `packages/core/src/view/coverage-extract.ts`
  - `packages/core/src/view/coverage-extract.test.ts`
  - `packages/cli/src/coverage.ts`
  - `packages/cli/src/coverage.test.ts`
  - `packages/cli/src/subtree.ts`
  - `packages/cli/src/subtree.test.ts`
  - `packages/cli/src/index.ts`（`coverage` / `subtree` command 登録）
  - `.claude/skills/reverse-architecture/SKILL.md`
- **関連 ADR**: [ADR-20260714-01](../adr/20260714-01-reverse-architecture-harness.md)（元 Design Doc `reverse-architecture-skill.md` / `repo-reverse-engineer-harness.md` を集約）
- **関連 TPL**: [TPL-20260510-02](../test-perspectives/TPL-20260510-02-round-trip-guarantee.md)（round-trip）, [TPL-20260510-05](../test-perspectives/TPL-20260510-05-implicit-data-filtering.md)（暗黙フィルタ）, [TPL-20260510-20](../test-perspectives/TPL-20260510-20-id-not-label-for-identity.md)（id 同一性）

## 受け入れ条件

### `karasu coverage`

- [x] AT-A: `extractCoverage` が各 domain の usecase / entity / resourceRef / edge を集計し、`score` と `thin` を返す
  > ✅ Automated — `packages/core/src/view/coverage-extract.test.ts` › `reports every domain with per-domain counts`

- [x] AT-B: 相対的に薄い domain だけが `thin: true` になり、豊かな domain は `thin: false` になる
  > ✅ Automated — `coverage-extract.test.ts` › `flags the relatively thin domain, not the rich one`

- [x] AT-C: 空に近い domain も**行としては残る**（黙って落とさない）
  > ✅ Automated — `coverage-extract.test.ts` › `does not drop domains even when empty` / `coverage.test.ts` › `flags the thin domain in markdown`

- [x] AT-D: `--format json` が機械可読な domain 配列を出力する
  > ✅ Automated — `packages/cli/src/coverage.test.ts` › `emits machine-readable json`

### `karasu subtree`

- [x] AT-E: domain を指定すると、その interior が standalone の top-level ブロックとして出力され、sibling は落とされる
  > ✅ Automated — `packages/cli/src/subtree.test.ts` › `emits a domain's interior as a standalone top-level block`

- [x] AT-F: **round-trip** — subtree 出力を再コンパイルしても error が出ない
  > ✅ Automated — `subtree.test.ts` › `round-trips: subtree output re-compiles without errors`

- [x] AT-G: usecase を指定すると nearest domain で最小 wrap される。`--with-ancestors` で system → node の chain を保つ
  > ✅ Automated — `subtree.test.ts` › `wraps a usecase in its enclosing domain` / `keeps the system → node chain`

- [x] AT-H: 未知 id / 欠損ファイルは exit 1
  > ✅ Automated — `subtree.test.ts` › `exits 1 with a not-found message` / `coverage.test.ts` › `exits 1 for a missing file`

### Skill（reverse-architecture）— 手動確認

- [ ] AT-I: `.claude/skills/reverse-architecture/SKILL.md` が既存 repo（例: `examples/ja/hr-tool/system.krs` 相当の source、または小規模な実 repo）に対して 4-phase を回し、`karasu coverage` で薄い domain を検出 → 再 dive で解消できることを人間が確認する
  > ⏳ Manual — skill をトリガー（「アーキテクチャをリバース」）して、coverage レポートで薄い domain が surface し、subtree で slice を渡した再 dive 後に `thin: false` へ移ることを確認する。物理層が `translate` 由来で hallucination していないことも確認する。

## 手動検証メモ

CLI primitive の end-to-end は実 example で確認済み（`examples/ja/hr-tool/system.krs`）:

```
$ karasu coverage examples/ja/hr-tool/system.krs
| domain | service | usecases | entities | resources | edges | score | thin |
...
$ karasu subtree Timesheet examples/ja/hr-tool/system.krs   # → domain Timesheet { ... } のみ
$ karasu subtree Timesheet ... -o slice.krs && karasu coverage slice.krs   # round-trip OK
```
