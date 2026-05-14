---
type: feature
---

# AT-1385: same-id `database` / `queue` / `storage` blocks merge across files

- **日付**: 2026-05-14
- **関連 Issue**: [#1385](https://github.com/kompiro/karasu/issues/1385)
- **対象ファイル**:
  - `packages/core/src/types/ast.ts`（`DiagnosticSeverity` に `"info"` 追加 + `infra-redeclared-across-files` 診断追加）
  - `packages/core/src/fs/import-resolver.ts`（`mergeInfraBody` / `mergeTopLevelInfra` 追加、system-nested children の error → info 格下げ）
  - `packages/core/src/parser/diagnostic-legacy-format.ts` / `packages/app/src/i18n/{types,en,ja,format-diagnostic}.ts`（新診断の wiring）
  - `packages/lsp/src/server.ts`（LSP `Information` への severity マッピング）
  - `packages/app/src/components/PreviewPane.tsx` / `packages/app/src/styles/app.css`（info を表示、warning より控えめなスタイル）
  - `docs/spec/syntax.md` / `docs/spec/syntax.ja.md` §「Multi-file import semantics」に **S4.5** 追加
- **Spec**: `docs/spec/syntax.md` §「Multi-file import semantics」 S4.5
- **TPL**: [TPL-20260514-07](../test-perspectives/TPL-20260514-07-infra-redeclared-across-files.md)
- **ADR**: [ADR-20260514-01](../adr/20260514-01-multi-file-import-semantics.md)（系列）

## 受け入れ条件

- [ ] AT-A: 複数ファイルで同名 `database` を宣言したら、`duplicate-node-in-system` error ではなく `infra-redeclared-across-files` (severity: `info`) が 1 件だけ発火する
  > ✅ Automated — `import-resolver.test.ts` `"S4.5: same-id 'database' declared in multiple files merges with an info diagnostic"`

- [ ] AT-B: DAG 経由（A → infra, index → infra）で同じ infra を 2 経路から到達しても info 診断は発火しない（同一インスタンス dedup）
  > ✅ Automated — `import-resolver.test.ts` `"S4.5: same 'database' declaration reached via DAG re-arrival does not emit an info"`

- [ ] AT-C: ファイル root（top-level）で同名 `database` を 2 ファイルが宣言した場合も union merge + info 診断（system-nested と同じ shape）
  > ✅ Automated — `import-resolver.test.ts` `"S4.5: same-id at file-root (top-level 'database') also merges + info"`

- [ ] AT-D: `queue` / `storage` についても同じルールが適用される（観点としては code path 共通 — `mergeInfraBody` が kind-agnostic）
  > 🧑 Manual — `database` を `queue` / `storage` に置換した同等 fixture でメッセージ内容と merge 結果を目視確認

- [ ] AT-E: App / VS Code 拡張で同名 `database` を宣言した複数ファイルを開いて、`info` 診断が `warning` より控えめに描画される（color / opacity）
  > 🧑 Manual — App / Editor で目視

## 関連

- 設計 Doc: `docs/design/karasu-position-on-style-prescriptions.md` (`info` severity 採用の経緯、#1388)
- フォローアップ Issue: [#1386](https://github.com/kompiro/karasu/issues/1386) — 既存 `domain-dispersal` warning を info に再分類するか
