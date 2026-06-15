# AT: 共有 infra fan-in を info 診断として通知する

- **日付**: 2026-06-15
- **関連 Issue**: [#1570](https://github.com/kompiro/karasu/issues/1570)
- **関連 ADR**: [ADR-20260514-02](../adr/20260514-02-style-prescription-stance.md)（流派が smell と呼ぶ構造は info 通知）
- **関連 TPL**: [TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md), [TPL-20260514-07](../test-perspectives/TPL-20260514-07-infra-redeclared-across-files.md)
- **対象ファイル**: `packages/core/src/resolver/warnings.ts`,
  `packages/core/src/types/warnings.ts`,
  `packages/i18n/src/{en,ja,types,render-warning}.ts`,
  `packages/lsp/src/diagnostics.ts`,
  `docs/concepts.md` / `.ja.md`, `docs/guide/02-onboarding.md` / `.ja.md`

## 受け入れ条件（自動）

### detector — `packages/core/src/resolver/warnings.test.ts`

- [x] 単一ファイルで 1 つの `database` を 2 service が参照すると `shared-infra-fan-in` が 1 件出る。params は `infraId` / `infraKind` / `services`。同ファイルなので `infra-redeclared-across-files` は出ない

  > ✅ Automated — `warnings.test.ts` › `warns when one database is shared by two services in a single file (#1570)`

- [x] severity は `info` で render をブロックしない（error 0 件・SVG 生成あり）

  > ✅ Automated — `warnings.test.ts` › `is registered as info and does not block rendering (ADR-20260514-02)`

- [x] 1 service しか依存しない場合・同一 service が複数 usecase から参照する場合は出ない（閾値 ≥2 service）

  > ✅ Automated — `warnings.test.ts` › `does not warn when only one service depends on the store` / `counts a service that references the store from multiple usecases only once`

- [x] `[external]` ストアは集計から除外する

  > ✅ Automated — `warnings.test.ts` › `excludes [external] stores — sharing a managed third-party store is not the smell`

- [x] `database` だけでなく `queue` / `storage` の共有も検出する

  > ✅ Automated — `warnings.test.ts` › `detects shared queue and storage, not just database`

- [x] system 境界はまたがない（cross-system 共有は意図的）

  > ✅ Automated — `warnings.test.ts` › `does not warn across system boundaries (cross-system sharing is intentional)`

- [x] system でラップされていないトップレベルの store（`file.databases` 等）を 2 つのトップレベル service が共有する場合も検出する

  > ✅ Automated — `warnings.test.ts` › `detects fan-in for a top-level (system-less) store shared by top-level services`

- [x] severity register は `info`（`Record<WarningKind, WarningSeverity>` のフェンスで kind 追加時に明示を強制）

  > ✅ Automated — `warnings.test.ts` › `EXPECTED_SEVERITY`

### i18n — `packages/i18n/src/render-warning.test.ts`

- [x] en / ja 両 locale でメッセージに infraKind・infraId が含まれ、placeholder が残らず、ja が en と異なる

  > ✅ Automated — `render-warning.test.ts` › 網羅テスト（`Record<WarningKind, …>` により kind 追加時に強制）

### LSP — `packages/lsp/src/diagnostics.test.ts`

- [x] 単一ドキュメントで共有 DB の fan-in が Information 重要度で surface され、store 宣言に anchor する

  > ✅ Automated — `diagnostics.test.ts` › `surfaces shared-infra-fan-in at Information severity (#1570)`

## 受け入れ条件（手動）

- [ ] app のプレビューで、1 つの `database` を 2 つの service が参照する `index.krs` を開くと、WarningPanel に ℹ（info）アイコンで `database "..." is shared by 2 services`（ja locale では `database "..." は 2 個の service から参照されています`）が表示され、details に参照元 service 名が並ぶ
- [ ] 同じ内容で VS Code 拡張（LSP）の Problems パネルに Information 重要度の診断が出て、ジャンプ先が `database` 宣言行になる
