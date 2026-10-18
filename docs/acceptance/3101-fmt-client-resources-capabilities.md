---
type: product
---

# AT: フォーマットしても client の `resource` と `capability` が消えない（#3101）

- **日付**: 2026-10-17
- **関連 Issue**: [#3101](https://github.com/kompiro/karasu/issues/3101)
- **Related TPLs**: [TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md)
- **対象ファイル**: `packages/core/src/formatter/formatter.ts`（`renderProperties` / `renderCapability`）

> formatter が client の `resource` と `capability` を出力していなかったため、`karasu fmt` と保存時のフォーマットがそれらの行をすべて削除していた。両方を出力し、ノードのプロパティすべてに round-trip の fixture があることを型で固定する。

## 受け入れ条件

### AC-1: client の `resource` と `capability` が round-trip する

- [x] AT-A: `resource <kind> "<name>"` を 2 行持つ client をフォーマットしても、再 parse した `resources` が元と一致し、2 回目のフォーマットで差分が出ない

  > ✅ Automated — `packages/core/src/formatter/formatter-property-coverage.test.ts` › `formatter node-property coverage` › `round-trips the %s property through format()`

- [x] AT-B: 1 行の形（`capability camera`、kebab-case の `capability p2p-2`）とブロックの形（`label` と `description`、`description` だけ）の `capability` がフォーマット後も残り、再 parse した `capabilities` が元と一致する

  > ✅ Automated — `packages/core/src/formatter/formatter-property-coverage.test.ts` › `formatter node-property coverage` › `round-trips the %s property through format()`

### AC-2: ノードのプロパティを formatter に配線し忘れると落ちる

- [x] AT-C: 全 `KrsNode` の `properties` のキー集合に fixture 表が `satisfies` で一致し、各 fixture がそのプロパティを実際に持つ。型にキーを足して fixture を足さないと `tsc` が落ちる

  > ✅ Automated — `packages/core/src/formatter/formatter-property-coverage.test.ts` › `formatter node-property coverage` › `round-trips the %s property through format()`

## 手動確認

N/A — 自動テストですべて覆っている
