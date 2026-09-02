---
type: product
---

# AT: 5 つのカンマ区切りプロパティが 1 つの文法で読まれる（#2551）

- **日付**: 2026-09-02
- **関連 Issue**: [#2551](https://github.com/kompiro/karasu/issues/2551)（起点は [#2167](https://github.com/kompiro/karasu/issues/2167) / PR #2542 のコードレビュー）
- **関連 ADR**: [ADR-2167](../adr/2167-realizes-comma-list.md)（reference list はカンマ列挙を受け、membership は 1 行 1 件）、[ADR-1046](../adr/1046-resource-crud-operations.md)（`operations` の CRUD 装飾と 1:N 継続規則）
- **関連 spec**: [`docs/spec/syntax.md`](../spec/syntax.md) §Comma-separated value lists（+ja）/ [`docs/spec/diagnostics.md`](../spec/diagnostics.md)（+ja）
- **関連 TPL**: [TPL-2542](../test-perspectives/TPL-2542-sugar-form-shares-one-ast-and-element-ranges.md)
- **対象ファイル**:
  - `packages/core/src/parser/parser.ts`（`commaSeparatedValues` / `readReferencePathElement` と、それに載せ替えた `parseFacetsList` / `delivers` / `parseHandlesList` / `parseOperationsList` / `parseRealizesList`）

> 同じ書き間違い（`delivers A,` と `realizes A,`）が、プロパティごとに別の診断コード・
> 別のアンカー位置・別の行またぎ挙動になっていた。5 つの手書きリーダが独立に育った
> 結果で、6 つ目を足すときに同じ判断をもう一度書き直すことになる。

## 受け入れ条件

### AC-1: 5 プロパティが同じ文法で読まれる

- [x] AT-A: `facets` / `delivers` / `handles` / `operations` / `realizes` のいずれも、カンマ列挙とキーワード行の繰り返しが同じ AST に落ちる

  > ✅ Automated — `packages/core/src/parser/comma-list-properties.test.ts` › reads a comma list, and reads it the same way as repeated lines

- [x] AT-B: 値を伴わないキーワードは `expected-id-after` を 1 件、キーワード自身の位置で報告する（`realizes` はこれまで `expected-property-value` を出していた）

  > ✅ Automated — `packages/core/src/parser/comma-list-properties.test.ts` › reports a value-less keyword once, anchored on the keyword

- [x] AT-C: 末尾のカンマは、次のトークンではなくそのカンマ自身の位置で報告され、そこまでに読めた要素は保持される

  > ✅ Automated — `packages/core/src/parser/comma-list-properties.test.ts` › reports a trailing comma on the comma itself and keeps what it read

- [x] AT-D: 先頭のカンマは 1 件だけ報告し、その後ろの要素は記録される

  > ✅ Automated — `packages/core/src/parser/comma-list-properties.test.ts` › reports a leading comma once and still records the element after it

### AC-2: リストはキーワードの行に閉じる

- [x] AT-E: 末尾のカンマは次の行を吸収しない。次の行の id はその位置で報告される

  > ✅ Automated — `packages/core/src/parser/comma-list-properties.test.ts` › does not let a trailing comma swallow the next line

- [x] AT-F: 次の行を開始するカンマもリストを伸ばさない（末尾カンマと対称）

  > ✅ Automated — `packages/core/src/parser/comma-list-properties.test.ts` › does not continue a list from a comma opening the next line

### AC-3: プロパティ固有の意味論は変わらない

- [x] AT-G: `realizes` の要素 range・混在累積・dangling dot の recovery は #2167 のまま

  > ✅ Automated — `packages/core/src/parser/parser.test.ts` › `comma-separated realizes (#2167)`、`packages/core/src/parser/node-reference-paths.test.ts` › a dangling dot underlines the dot, and a trailing comma after it is still reported

- [x] AT-H: `operations` の CRUD 装飾（`replace:create,delete` の 1:N 継続と `list:read` の verb 境界）は ADR-1046 のまま

  > ✅ Automated — `packages/core/src/parser/parser.test.ts` › `resource operations`（装飾・重複・未知動詞の既存スイート一式）

- [x] AT-I: `facets` の重複畳み込みと全 node kind での受理は変わらない

  > ✅ Automated — `packages/core/src/parser/facet.test.ts` › `facets is accepted on every node kind`

## 意図的に対象外

- **`owns` / `contains`**: membership プロパティは 1 行 1 件のまま（[ADR-2167](../adr/2167-realizes-comma-list.md) が判定基準を確定させている）。カンマを受理しないので共有文法の対象ではない
- **`facets` / `delivers` の要素単位 `loc`**: 共有リーダは要素トークンを渡すので取得できるが、AST を `string[]` から広げる必要のある利用者がまだいない

## 手動確認

N/A — 自動テストですべて覆っている。
