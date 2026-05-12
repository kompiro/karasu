---
type: product
---

# AT-1335: Reference single source — Phase 3 (sampleKrs sourced from examples/)

- **日付**: 2026-05-12
- **関連 Issue**: [#1335](https://github.com/kompiro/karasu/issues/1335)（親 [#1328](https://github.com/kompiro/karasu/issues/1328) / [#1296](https://github.com/kompiro/karasu/issues/1296)）
- **対象ファイル**:
  - `packages/core/src/builtins/reference.ts`（inline `SAMPLE_KRS_JA` / `SAMPLE_KRS_EN` / `SAMPLE_KRS` を削除、`getReference().sampleKrs` を `GETTING_STARTED_PROJECT` / `GETTING_STARTED_PROJECT_EN` の `index.krs` から取得）
  - `packages/core/src/builtins/reference.test.ts`（getting-started の内容に合わせて `sampleKrs` 系 assertion を調整）
- **設計**: [docs/design/reference-from-spec.md](../design/reference-from-spec.md)

## 受け入れ条件

- [ ] AT-A: `getReference("en").sampleKrs` が `examples/getting-started-en/index.krs` の内容（= `GETTING_STARTED_PROJECT_EN.files[index.krs]`）と一致し、`getReference("ja").sampleKrs` が `examples/getting-started/index.krs` の内容と一致する
  > ✅ Automated — `packages/core/src/builtins/reference.test.ts`（`sample KRS demonstrates the user → client → service access path` / `includes sampleKrs with system, deploy, and organization blocks` / `includes a legend block with ref entries` / 各ロケールの `label` チェックが getting-started の内容を確認）

- [ ] AT-B: `getReference(locale).sampleKrs` が両ロケールでパースエラーなく解析できる
  > ✅ Automated — `packages/core/src/builtins/reference.test.ts` › `sampleKrs parses without errors for both locales`

- [ ] AT-C: `reference.ts` から `SAMPLE_KRS_*` のインライン定義が消え、`examples/getting-started/` が `sampleKrs` の唯一の真実の源になっている（重複コピーの除去）
  > ✅ Automated — knip / typecheck（`SAMPLE_KRS` への参照が残っていればビルドが壊れる）。`examples/ ↔ examples.ts` の同期は既存の `.claude/rules/examples-sync.md` と `/update-examples` スキルが担保

- [ ] AT-D（manual）: アプリ（`pnpm dev`）で Reference パネル → Samples タブを開き、現行の Getting Started サンプル（`@import "default.krs.style"` 行・`operations` CRUD・`capability` 等を含む）が表示されること、コピーボタンが動くこと、locale を `ja` / `en` で切り替えて内容が切り替わることを目視確認する
  > 🧑 Manual — Samples タブの表示内容の目視確認。リファクタ前の古い SAMPLE_KRS から現行 getting-started に内容が変わっている点に注意（= staleness 解消）
