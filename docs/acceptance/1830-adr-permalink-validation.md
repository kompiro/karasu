# AT: ADR→karasu permalink の検証（`adr:check-permalinks` の adopt）

- **日付**: 2026-07-13
- **関連 Issue**: [#1830](https://github.com/kompiro/karasu/issues/1830)（permalink layer epic [#1826](https://github.com/kompiro/karasu/issues/1826) の子）
- **関連 ADR（決定記録）**: [ADR-20260713-02](../adr/20260713-02-adr-permalink-validation.md)（adr-tools の `krs` kind を adopt）／ 実装 = [kompiro/adr-tools ADR-17](https://github.com/kompiro/adr-tools/blob/main/docs/adr/17-permalink-krs-kind.md)
- **前提 ADR**: [ADR-20260702-01](../adr/20260702-01-adr-permalink-convention.md)（`permalink:` 規約）
- **関連 TPL**: [TPL-20260520-02](../test-perspectives/TPL-20260520-02-consistency-check-triggers-on-both-sides.md)（両側トリガ）
- **対象ファイル**:
  - `adr.config.json`（`permalink.kind: krs`）／ `package.json`（`@kompiro/adr-tools@^0.0.7` + `@karasu-tools/core` devDep + `adr:check-permalinks` script）
  - `.github/workflows/ci.yml`（`Build (core)` の後に check-permalinks）／ `knip.json`（core を ignore）
  - `docs/adr/20260702-01-adr-permalink-convention.md`（最初の dogfood `permalink:`）／ `.claude/rules/adr.md` / `docs/spec/permalink.md`（+ `.ja`）

> スコープは karasu 側の **adopt**（config + dep + CI 配線 + dogfood）。検証ロジック本体は
> `@kompiro/adr-tools` の `krs` kind（別 repo）。

## 受け入れ条件

- [x] AT-A: `pnpm adr:check-permalinks` が現行 repo で pass する（ADR-20260702-01 の dogfood `#krs-system-Gateway` が解決）

  > ✅ Automated — ci.yml の Check job（`Build (core)` の後）で実行

- [x] AT-B: dangling anchor で fail する（rename / 削除検出 — 本 Issue の中核）

  > ✅ Automated — `krs` resolver の dangling 検出（membership 検査）は `@kompiro/adr-tools` の `test/permalink.test.ts` が担保。実装時にも `#krs-system-Gateway`→`#krs-system-Nope` で `does not resolve`・exit 1 を確認

- [x] AT-C: `permalink.kind: krs` が `adr.config.json` に入り、`@kompiro/adr-tools@>=0.0.7` + `@karasu-tools/core`（optional peer 充足）が入っている

  > ✅ Automated — `pnpm install --frozen-lockfile` が peer variant を解決（CI）

- [ ] AT-D: 配線が両側で発火する（ADR 変更・`.krs` 変更のどちらの push でも実チェックが走る）

  > 🔍 レビュー確認 — ci.yml の check-permalinks step が path filter 無しの Check job にあり、`Build (core)` の後に置かれていること（`krs` resolver は built core を要する）。TPL-20260520-02

## 手動検証手順（AT-B / AT-D）

1. `examples/en/payment-platform/system.krs` の `service Gateway` を rename（ADR には触れない）
   → `pnpm --filter @karasu-tools/core build && pnpm adr:check-permalinks` が **fail**。
2. CI で `.krs` だけを変える PR でも Check job が落ちることを確認（両側トリガ）。

> 注: lefthook pre-push には入れていない（`krs` resolver が built core を要し、core 未 build の
> push で落ちるため）。both-sides の要件は unfiltered な CI step で満たす。
