# AT: ADR→karasu permalink の検証（`adr:check-permalinks`）

- **日付**: 2026-07-13
- **関連 Issue**: [#1830](https://github.com/kompiro/karasu/issues/1830)（permalink layer epic [#1826](https://github.com/kompiro/karasu/issues/1826) の子）
- **関連 ADR（決定記録）**: [ADR-20260713-01](../adr/20260713-01-adr-permalink-validation.md)（karasu 側 validator）
- **前提 ADR**: [ADR-20260702-01](../adr/20260702-01-adr-permalink-convention.md)（`permalink:` 規約）／ [ADR-20260630-01](../adr/20260630-01-permalink-deep-element.md)（アンカー文法）
- **関連 spec**: [`docs/spec/permalink.md`](../spec/permalink.md) § Stability caveat
- **関連 TPL**: [TPL-20260520-02](../test-perspectives/TPL-20260520-02-consistency-check-triggers-on-both-sides.md)（両側トリガ）
- **対象ファイル**:
  - `scripts/adr/check-permalinks.ts`（validator）／ `scripts/adr/check-permalinks.test.ts`（fixture テスト）
  - `.github/workflows/ci.yml`（Check job）／ `lefthook.yml`（pre-push）
  - `.claude/rules/adr.md` / `docs/spec/permalink.md`（+ `.ja`）（検証手段の記述更新）

> スコープは **`permalink:` frontmatter の機械検証**（必須 `source` 実在 + deep anchor 解決 +
> `view` / `short` の妥当性）。本文サマリ表の**生成**と `short` の**ネットワーク解決**は範囲外
> （前者は `@kompiro/adr-tools` follow-up、後者は将来の `--online`）。

## 受け入れ条件

- [x] AT-A: `permalink:` を持たない ADR は素通りする（既存の全 ADR が即 green）

  > ✅ Automated — `scripts/adr/check-permalinks.test.ts`「passes an ADR with no permalink block」＋ `pnpm adr:check-permalinks` が現行 repo で OK

- [x] AT-B: 正しい `source` + deep anchor（実在要素）は pass する

  > ✅ Automated — 同テスト「passes a valid source + deep anchor」（fixture `__fixtures__/sample.krs#krs-system-Payments`）

- [x] AT-C: `source` 欠落はエラー

  > ✅ Automated — 「fails a missing source」

- [x] AT-D: `source` の `.krs` が実在しないとエラー

  > ✅ Automated — 「fails a non-existent source file」

- [x] AT-E: rename / 削除で dangling した anchor はエラー（本 Issue の中核）

  > ✅ Automated — 「fails a dangling anchor — renamed/removed element」（`#krs-system-Gone`）

- [x] AT-F: 未知 view token（anchor 内・`view` フィールド）はエラー

  > ✅ Automated — 「fails an unknown view token in the anchor」「fails an unknown `view` field」

- [x] AT-G: `short` の形式不正（非 URL・`#s=` fragment 共有）はエラー、正しい `source` と併記しても各々報告

  > ✅ Automated — `validateShort` 群 ＋「surfaces a bad `short` alongside a valid source」「reports each entry independently」

- [ ] AT-H: 配線が両側で発火する（ADR 変更・`.krs` 変更のどちらの push でも実チェックが走る）

  > 🔍 レビュー確認 — `.github/workflows/ci.yml` の Check job（path filter 無し）と `lefthook.yml` の
  > `adr-check-permalinks`（glob 無し）に `pnpm run adr:check-permalinks` があること。TPL-20260520-02 に準拠

## 手動検証手順（AT-H）

1. `docs/adr/` の任意 ADR に `permalink: [{ source: examples/ja/hr-tool/system.krs#krs-system-Auth }]` を足す → `pnpm adr:check-permalinks` が pass。
2. `examples/ja/hr-tool/system.krs` の `service Auth` を `service Auth2` に rename（ADR には触れない）→ `pnpm adr:check-permalinks` が **fail**（dangling を検出）。CI では `.krs` だけを変える PR でも Check job が落ちることを確認。
