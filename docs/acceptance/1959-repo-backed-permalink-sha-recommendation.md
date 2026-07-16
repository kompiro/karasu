# AT: repo-backed permalink の `@<sha>` pin 推奨（`adr:check-permalinks` の adopt）

- **日付**: 2026-07-15
- **関連 Issue**: [#1959](https://github.com/kompiro/karasu/issues/1959)（#1828 slice d、permalink layer epic [#1826](https://github.com/kompiro/karasu/issues/1826)）
- **設計**: `docs/design/repo-backed-permalink-sha-enforcement.md`（PR #1969）
- **実装（別 repo）**: [kompiro/adr-tools#23](https://github.com/kompiro/adr-tools/issues/23) / PR #24（`krs` kind に repo-backed host 検出 + `@<sha>` 推奨 `warn`、`0.0.9` release）
- **前提 ADR**: [ADR-20260713-02](../adr/20260713-02-adr-permalink-validation.md)（検証は adr-tools の `krs` kind）／ [ADR-20260702-01](../adr/20260702-01-adr-permalink-convention.md)（`permalink:` 規約）
- **関連 TPL**: [TPL-20260520-02](../test-perspectives/TPL-20260520-02-consistency-check-triggers-on-both-sides.md)（両側トリガ）
- **対象ファイル**:
  - `adr.config.json`（`permalink.repoBackedHosts: ["karasu.kompiro.dev", "karasu.pages.dev"]`）／ `package.json`（`@kompiro/adr-tools@^0.0.9`）
  - `.claude/rules/adr.md`（L2 規約）／ `docs/guide/adr-permalinks.md`（+ `.ja.md`、L1 guide）

> スコープは karasu 側の **adopt**（adr-tools bump + `repoBackedHosts` 配線 + docs 明文化）。
> 検出・`warn` 生成のロジック本体は `@kompiro/adr-tools@0.0.9` の `krs` kind（別 repo）。

## 受け入れ条件

- [x] AT-A: adr-tools を `^0.0.9` に bump ＋ `adr.config.json` の `permalink.repoBackedHosts` に nest host を配線し、現行 repo で `pnpm adr:check-permalinks` が pass する（既存 dogfood に repo-backed `short` は無く **0 recommendation**）。

  > ✅ Automated — ci.yml の Check job（`Build (core)` の後）。実装時に `1 OK, 0 failing, 0 recommendation(s)` を確認。

- [x] AT-B: 非-pin な repo-backed `short`（`https://karasu.kompiro.dev/r/o/repo@main`）を ADR に貼ると `warn`（recommendation）が出るが **CI は落ちない**（exit 0）。

  > 🟡 Partially automated — 検出・判定ロジックは adr-tools `test/permalink.test.ts` が担保。karasu 側は実装時に live 検証（dogfood ADR に一時 `@main` short を足すと `! … not pinned to a commit SHA …` を `1 recommendation(s)`・exit 0 で確認）。

- [x] AT-C: full 40-hex SHA で pin した repo-backed `short`（`…@<40-hex>`）は `ok`（warn なし）。

  > 🟡 Partially automated — adr-tools `test/permalink.test.ts`（40-hex は ok）。karasu 側 live 検証: `@main` を 40-hex SHA に差し替えると `✓ ok`・`0 recommendation(s)`。

- [ ] AT-D: `@<sha>` pin 推奨が L2（`.claude/rules/adr.md`）と L1（`docs/guide/adr-permalinks.md` + `.ja.md`）の両方に明文化される。

  > 🔍 レビュー確認 — 「検証」節に repo-backed `warn` の項、guide に「repo-backed permalinks — pin to a commit SHA」節。

## 手動検証手順（AT-B / AT-C）

1. 任意の ADR の `permalink[]` に一時的に `short: https://karasu.kompiro.dev/r/kompiro/karasu@main`
   を足す（`source` はそのまま）。
   → `pnpm --filter @karasu-tools/core build && pnpm adr:check-permalinks` が
   `! … repo-backed permalink is not pinned to a commit SHA …` を **1 recommendation** として出し、
   **exit 0**（CI は落ちない）。
2. その `short` の `@main` を full 40-hex SHA に差し替える → 同コマンドで **0 recommendation**（`ok`）。
3. 確認後、一時的な `short` は削除する。

> 注: `warn` は非-fatal。将来 hard-fail 化するなら adr-tools 側の config で opt-in する
> （現状の decision は「推奨」— 設計 doc / ADR-20260713-02 系）。
