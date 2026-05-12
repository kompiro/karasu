---
type: product
---

# AT-1344: `examples/feature-samples/` を built-in ProjectMode example として同梱

- **日付**: 2026-05-12
- **関連 Issue**: [#1344](https://github.com/kompiro/karasu/issues/1344)
- **対象ファイル**:
  - `examples/feature-samples/index.krs`（新規 — 14 サンプルへの索引コメント + 最小の `system FeatureSamples`）
  - `packages/core/src/builtins/examples.ts`（`FEATURE_SAMPLES_PROJECT: ExampleProject` 追加）
  - `packages/core/src/index.ts`（`FEATURE_SAMPLES_PROJECT` re-export）
  - `packages/app/src/hooks/useProjectInitialization.ts`（初回シードに追加）
  - `packages/app/src/hooks/useProjectInitialization.test.ts` / `packages/core/src/examples.test.ts`（テスト更新・drift ガード追加）
  - `.claude/rules/examples-sync.md` / `.claude/skills/update-examples/SKILL.md`（同期ルール・スキル対象に `feature-samples/` 追加）
- **ADR**: [ADR-20260512-02](../adr/20260512-02-feature-samples-builtin-project.md)

## 受け入れ条件

- [ ] AT-A: `FEATURE_SAMPLES_PROJECT.files` が `index.krs` + `examples/feature-samples/` 配下の全 `.krs`（14 件）を過不足なく登録し、各 `content` がディスク上のファイルと byte 単位で一致する
  > ✅ Automated — `packages/core/src/examples.test.ts` › `feature-samples: bundled examples.ts content matches examples/feature-samples/`

- [ ] AT-B: `index.krs` を含む `examples/feature-samples/` の全ファイルが parse エラーなしで読める
  > ✅ Automated — `packages/core/src/examples.test.ts` › `feature-samples: all files parse without errors`

- [ ] AT-C: ProjectMode 初回起動時、`getting-started` → `ec-platform`（7件）→ `client-mcp` → `feature-samples` の順でプロジェクトがシードされ、`feature-samples` が末尾に来る
  > ✅ Automated — `packages/app/src/hooks/useProjectInitialization.test.ts` › `seeds the Japanese Getting Started + ec-platform when locale is 'ja'`

- [ ] AT-D（manual）: アプリを OPFS が空の状態で初回起動し、ProjectMode のプロジェクトセレクタに `feature-samples` が表示されること、選択すると `index.krs` のカタログがプレビューに表示されること、サイドバーのファイルツリーから `legend.krs` / `crud-matrix.krs` / `deploy-all.krs` など他のサンプルを開くと正常にレンダリングされることを目視確認する
  > 🧑 Manual — ProjectMode のセレクタ表示・初回プレビュー・ファイルツリーからのサンプル切替を目視確認する
