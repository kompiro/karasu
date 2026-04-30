# AT: Formatter preserves quotes around IDs that need them

- **日付**: 2026-04-30
- **関連 Issue**: [#1058](https://github.com/kompiro/karasu/issues/1058)
- **対象ファイル**:
  - `packages/core/src/formatter/quote-id.ts`（新規）
  - `packages/core/src/formatter/formatter.ts`
- **関連**: ADR-20260410-02（`.krs` フォーマッター — トークン列ベースでコメント保持）

## 受け入れ条件

- [x] `karasu fmt` がスペース・ハイフン・先頭数字・予約語コリジョン・埋め込みクォート等を含む ID から不正に quote を剥がさない（round-trip が parser を通る）
  > ✅ Automated — `packages/core/src/formatter/formatter.test.ts` › `preserves quotes around IDs that need them` 配下 9 ケース

- [x] node ID（system / service / domain / usecase / resource / capability / user / client / database / queue / storage / table / bucket）に対して quote を保持
  > ✅ Automated — `keeps quotes on system / service IDs containing spaces`, `keeps quotes on hyphenated IDs`, `keeps quotes on IDs starting with a digit`, `keeps quotes on IDs that collide with reserved keywords`

- [x] deploy block / deploy unit ID に対して quote を保持
  > ✅ Automated — `keeps quotes on deploy block / unit IDs`

- [x] organization / team / member ID に対して quote を保持
  > ✅ Automated — `keeps quotes on organization / team / member IDs`

- [x] edge `from` / `to`、`realizes`、`owns`、`delivers` の参照側 ID に対して quote を保持
  > ✅ Automated — `keeps quotes on edge from / to references`, `keeps quotes on realizes / owns / delivers references`

- [x] 不要な quote（bare-safe な ID に巻かれた quote）はフォーマット時に削除する（canonical 化）
  > ✅ Automated — `strips unnecessary quotes from bare-safe IDs`

- [x] 埋め込み `\` および `"` を含む ID は適切にエスケープして出力（`\\` / `\"`）
  > ✅ Automated — `escapes embedded double quotes and backslashes in IDs` および `packages/core/src/formatter/quote-id.test.ts`

- [x] `format(format(x)) === format(x)` が全ケースで成立（idempotency）
  > ✅ Automated — 各テストで `expectIdempotent(out)` を実行

- [x] `needsQuotes()` ヘルパーは lexer の identifier rule（`[\p{L}_][\p{L}\p{N}_]*`）と reserved keyword 集合を参照する
  > ✅ Automated — `packages/core/src/formatter/quote-id.test.ts`（bare-safe 7 ケース、unbare 8 ケース、reserved keyword 7 ケース）

- [ ] CLI で実ファイルに対する `karasu fmt --write` を実行しても元ファイルが parse 可能なまま残る
  > 🧑 Manual — quote 含み ID を持つ `.krs` を作成し `karasu fmt --write` を実行、`karasu render` または再 parse で確認する。

## 範囲外（follow-up）

- **import 文の中の quoted ID 参照**: `import { "my-id" } from "other.krs"` は現状 parser が受け付けない。formatter 側の対応はあるが parser 側で許容するかは別 Issue（必要なら）。
- **tag / annotation 値の quote**: `service A [foo-bar]` のような tag は現状 bare-only で、必要であれば別途扱う。
