---
type: product
---

# AT: CLI の診断に、人には短い ID、機械には JSON のコードが届く（#3654）

- **日付**: 2026-11-09
- **関連 Issue**: [#3654](https://github.com/kompiro/karasu/issues/3654)（発端 [#3640](https://github.com/kompiro/karasu/issues/3640)、VS Code と app は [#3712](https://github.com/kompiro/karasu/issues/3712)）
- **設計 (ADR)**: [ADR-3654](../adr/3654-cli-diagnostic-codes.md)
- **Related TPLs**: [TPL-3654](../test-perspectives/TPL-3654-cli-diagnostics-carry-stable-code.md), [TPL-1417](../test-perspectives/TPL-1417-single-renderer-for-structured-messages.md), [TPL-1623](../test-perspectives/TPL-1623-diagnostics-catalog-completeness.md)
- **対象ファイル**: `packages/core/src/types/diagnostic-ids.ts`、`packages/cli/src/i18n.ts`、`packages/cli/src/report-diagnostics.ts`、`packages/cli/src/check.ts`、`packages/skills/skills/reverse-architecture/SKILL.md`

> CLI の診断の行はコードを出さず、メッセージは locale に従っていた。そのため skill はコードを grep しても常に空で、
> 壊れたモデルでも停止条件を通っていた（#3640）。人は行の頭の `KRS` の ID でカタログを引き、機械は
> `karasu check --format json` の `code` で判定する。

## 受け入れ条件

### AC-1: 診断の行の頭に、locale によらず同じ ID が付く

- [x] AT-A: `karasu check` の警告とエラーの行が、重大度の語の直後に ID を持つ（`Warning[KRS041]: index.krs:3:3: ...`）

  > ✅ Automated — `packages/cli/src/diagnostic-output.test.ts` › `diagnostic lines carry the code's ID (#3654)` › `puts the ID right after the severity word in check's lines`

- [x] AT-B: `ja` の locale でも同じ ID が付く

  > ✅ Automated — `packages/cli/src/diagnostic-output.test.ts` › `diagnostic lines carry the code's ID (#3654)` › `keeps the same ID under the ja locale`

- [x] AT-C: 面によって重大度が変わるコードは、`lint-style` の error と `check` の warning で同じ ID を出す

  > ✅ Automated — `packages/cli/src/diagnostic-output.test.ts` › `diagnostic lines carry the code's ID (#3654)` › `shows one ID for a code whose severity depends on the surface`

### AC-2: 機械は `--format json` の `code` で判定できる

- [x] AT-D: `unresolved-edge-endpoint` を出すモデルで、`ja` の locale でも `--format json` の `id`・`code`・`params` が `en` と同じになる

  > ✅ Automated — `packages/cli/src/diagnostic-output.test.ts` › `karasu check --format json (#3654)` › `returns the same id, code and params under the ja locale`

- [x] AT-E: モデルに error があるとき、`--format json` は読める JSON を出して 1 で終わる

  > ✅ Automated — `packages/cli/src/diagnostic-output.test.ts` › `karasu check --format json (#3654)` › `prints readable JSON and exits 1 when the model has an error`

- [x] AT-F: ファイルが無いとき、stdout に何も出さず 0 以外で終わる

  > ✅ Automated — `packages/cli/src/diagnostic-output.test.ts` › `karasu check --format json (#3654)` › `prints nothing on stdout and fails when the file does not exist`

### AC-3: ID は登録簿・カタログ・公開済みの版で食い違わない

- [x] AT-G: 1 つの ID は 1 つのコードを指し、番号は 001 から空きなく並ぶ

  > ✅ Automated — `packages/core/src/types/diagnostic-ids.test.ts` › `diagnostic ID registry` › `gives each ID to one code`
  >
  > ✅ Automated — `packages/core/src/types/diagnostic-ids.test.ts` › `diagnostic ID registry` › `numbers active and retired IDs from 001 without a gap`

- [x] AT-H: カタログの `ID` 列が登録簿と一致する

  > ✅ Automated — `packages/core/src/types/diagnostics-catalog.test.ts` › `diagnostics catalog completeness (TPL-1623)` › `gives every row the registry's ID in docs/spec/diagnostics.md`

- [x] AT-I: 公開済みの版の ID を別のコードに付け替えると、履歴の検査が落ちる

  > ✅ Automated — `scripts/lint/diagnostic-ids-history.test.ts` › `compareRegistries` › `fails when a retired code's ID is given to a new code`

### AC-4: skill はコードで判定し、ID を書かない

- [x] AT-J: `reverse-architecture` が `` `code:<kebab>` `` で書いたコードはすべて core が出すコードで、どの skill も ID を書いていない

  > ✅ Automated — `scripts/lint/skill-diagnostic-codes.test.ts` › `the published skills` › `judge only by codes core emits, and name no ID`

## 手動確認

N/A — 自動テストですべて覆っている
