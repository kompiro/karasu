# AT: 記録が名指すソースパスの存在ガード

- **日付**: 2026-08-30
- **関連 Issue**: [#2648](https://github.com/kompiro/karasu/issues/2648)
- **対象ファイル**: `scripts/lint/record-source-paths.ts`,
  `docs/test-perspectives/TPL-2254-durable-record-points-at-durable-address.md`,
  `.claude/rules/record-source-paths.md`

## 受け入れ条件

該当する観点は [TPL-2254](../test-perspectives/TPL-2254-durable-record-points-at-durable-address.md)（記録は記録より長生きするアドレスを指す）。

- [x] `docs/{acceptance,test-perspectives,design}` の記録が、実在しない `packages/**` / `scripts/**` のパスをコードスパンで名指ししていたら、ファイル・行・パスを挙げて落ちる

  > ✅ Automated — `scripts/lint/record-source-paths.test.ts` › `checkMarkdown` › `reports the file, line and path of a path that is not`

- [x] 実在するパスは通る。コードスパン外の散文、glob・プレースホルダ・シェル行、`packages/` / `scripts/` 以外のパスは検査しない

  > ✅ Automated — `scripts/lint/record-source-paths.test.ts` › `sourcePathsInLine`（5 ケース）

- [x] ビルド生成物（`dist/` `out/` `coverage/` 等、および `THIRD_PARTY_NOTICES.md`）は、クリーンチェックアウトに無いのが正常なので検査しない。セグメント単位で照合し、`distribution.ts` / `OutlineView.tsx` を巻き込まない

  > ✅ Automated — `scripts/lint/record-source-paths.test.ts` › `isGeneratedPath` › `matches on a whole segment, not a substring`

- [x] YAML frontmatter とコードフェンスは読まない（frontmatter の散文には TPL-1024 のように仮名のパスが出る）

  > ✅ Automated — `scripts/lint/record-source-paths.test.ts` › `checkMarkdown` › `does not read YAML frontmatter` / `does not read fenced code blocks`

- [x] 不在が正しい行は、直上の `<!-- absent-path-next-line: <理由> -->` で宣言すると通る

  > ✅ Automated — `scripts/lint/record-source-paths.test.ts` › `checkMarkdown` › `accepts an absent path declared by the marker on the line above`

- [x] 宣言は逆向きにも検査される — 理由が空、パスが全部実在する、直上にない、ファイル末尾にある、のいずれでも落ちる

  > ✅ Automated — `scripts/lint/record-source-paths.test.ts` › `checkMarkdown` › `rejects a marker with no reason` / `rejects a marker whose next line has no absent path` / `rejects a marker that is not immediately above the path` / `rejects a marker on the last line, which declares nothing`

- [x] `docs/adr/**` は走査対象に含まれない（本文は当時の記録 — ADR-706）

  > ✅ Automated — `scripts/lint/record-source-paths.test.ts` › `does not scan docs/adr, whose bodies are records of their time (ADR-706)`

- [x] 実リポジトリの記録が finding ゼロである

  > ✅ Automated — `scripts/lint/record-source-paths.test.ts` › `has no finding in any scanned directory`

## 手動確認

N/A — 自動テストですべて覆っている。
