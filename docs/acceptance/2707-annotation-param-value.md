---
type: product
---

# AT: 引用符なしのアノテーションパラメータ値を壊さずに拒否する（#2707）

- **日付**: 2026-09-15
- **関連 Issue**: [#2707](https://github.com/kompiro/karasu/issues/2707)
- **Related TPLs**: [TPL-2707](../test-perspectives/TPL-2707-lexer-must-not-drop-what-the-parser-must-refuse.md)（lexer は parser が拒否すべき入力を黙って捨ててはならない）、[TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md)（round-trip 保証）、[TPL-2509](../test-perspectives/TPL-2509-kebab-name-positions-share-one-lexical-rule.md)（kebab 名ポジションは縫合を共有する）
- **対象ファイル**:
  - `packages/core/src/lexer/lexer.ts`（数字始まりの語を `Number` トークンにする、`isBareWord`）
  - `packages/core/src/parser/parser.ts`（`parseAnnotations` / `readAnnotationParamValue`）
  - `packages/core/src/parser/kebab-name.ts`（`Number` を先頭以外の断片として縫合する）
  - `docs/spec/tags-annotations.md` / `.ja.md`、`docs/spec/diagnostics.md` / `.ja.md`

> lexer が数字を黙って捨てていたため、`@deprecated(until: 2026-12-31)` は `-` `-` として parser に届き、`until: "-"` が記録された。`karasu fmt` はそれを著者のファイルに書き戻した。同じ根から、`until: 2026abc` は `"abc"` になり、`A -> 2B` は実在する `B` へのエッジになり、`[team-1]` は `team` と `-` の 2 タグに割れていた。同名アノテーションを繰り返すと、後の値が前の値を上書きし、`fmt` がそれを両方に書いた。

## 受け入れ条件

### AC-1: 引用符なしの値が別の値として記録されない

- [x] AT-A: `until: 2026-12-31` は `annotation-param-value-unreadable`（error）を 1 件だけ出し、何も記録しない。`-` を未対応キーとして名指しする警告は出ない

  > ✅ Automated — `packages/core/src/parser/annotation-params.test.ts` › `annotation parameter values that are not one token (#2707)` › `reports @deprecated(until: 2026-12-31) as one unreadable-value error and records nothing`

- [x] AT-B: 数字始まりの語・キーワード・ハイフンやドットでつながった並び・値の欠落が、すべて同じエラーになり何も記録しない（`2026` / `2026-Q3` / `2026abc` / `system` / `Legacy-Monolith` / `Shop.Legacy` / 空）

  > ✅ Automated — 同上 › `reports @deprecated(until: 2026abc) as one unreadable-value error and records nothing` ほか、同じ describe の各入力のケース

- [x] AT-C: エラーの範囲が、著者が書いた値全体を覆う

  > ✅ Automated — 同上 › `ranges the error over the whole value the author wrote`

- [x] AT-D: エラーが示す引用符つきの綴り（`until: "2026-12-31"` / `from: "Shop.Legacy"`）は診断なしで読まれ、`fmt` を通しても round-trip する

  > ✅ Automated — 同上 › `reads the quoted spelling the error points to`、および `packages/core/src/formatter/annotation-params-round-trip.test.ts` › `annotation parameter values keep their meaning` › `round-trips the quoted spelling of a value that cannot be written bare`

- [x] AT-E: 読めない値の後ろのペアは通常どおり読まれる

  > ✅ Automated — `packages/core/src/parser/annotation-params.test.ts` › `annotation parameter values that are not one token (#2707)` › `still reads the pair after a hyphenated value`

### AC-2: `fmt --write` が著者のファイルを書き換えない

- [x] AT-F: 読めない値を含むファイルに `karasu fmt` をかけると、ファイルが 1 バイトも変わらず、終了コード 2 で終わる

  > ✅ Automated — `packages/cli/src/fmt.test.ts` › `fmt() with explicit files` › `leaves the file untouched when a parameter value cannot be kept (#2707)`

- [x] AT-G: 同名アノテーションが同じパラメータに異なる値を与えるファイルも、同じく書き換えずに終了コード 2 で終わる

  > ✅ Automated — 同上

- [x] AT-H: formatter が裸で出力する参照値は、すべて同じ値として読み戻せる（裸で出せない値は引用符つきで出力され、やはり読み戻せる）

  > ✅ Automated — `packages/core/src/formatter/annotation-params-round-trip.test.ts` › `annotation parameter values keep their meaning` › `reads back every reference it prints bare (#2707)`

### AC-3: 同名アノテーションと値の衝突が報告される

- [x] AT-I: 同じアノテーションを 1 つの要素に 2 回書くと `duplicate-annotation`（warning）が出て、名前は両方残る

  > ✅ Automated — `packages/core/src/parser/annotation-params.test.ts` › `repeated annotations and parameters (#2707)` › `warns on an annotation written twice and keeps both names`

- [x] AT-J: 同じパラメータに異なる 2 つの値を与えると `annotation-param-conflict`（error）が出て、最初の値が残る。1 つのアノテーションの中で繰り返しても同じ

  > ✅ Automated — 同上 › `rejects a second, different value for the same parameter and keeps the first`、`treats a repeated key inside one annotation the same way`

- [x] AT-K: 同じ値を 2 回与えるのは衝突にならない

  > ✅ Automated — 同上 › `accepts the same value given twice`

### AC-4: 数字を含む語が消えない

- [x] AT-L: `A -> 2B` が実在する `B` へのエッジにならず、エラーが出る

  > ✅ Automated — `packages/core/src/parser/parser.test.ts` › `digit-led words outside vocabulary positions (#2707)` › `does not retarget an edge to the node its digits were dropped from`

- [x] AT-M: `[team-1]` / `@phase-2` / `capability p2p-2` がそれぞれ 1 つの名前になり、parse 診断が出ない

  > ✅ Automated — `packages/core/src/parser/parser.test.ts` › `kebab-case vocabulary names stitch into one name (#2509)` › `stitches a fragment that starts with a digit`

- [x] AT-N: `.krs` の `[team-1]` に `.krs.style` の同綴りセレクタが当たる

  > ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › `hyphenated tag names warn once with the full name (#2509)` › `matches a .krs.style selector when a fragment starts with a digit (#2707)`

- [x] AT-O: `[2026]` が消えずにタグとして残り、`tag-not-builtin` が出る

  > ✅ Automated — 同上 › `warns on a tag that starts with a digit instead of losing it (#2707)`

### AC-5: lexer が捨てる文字の集合が固定されている

- [x] AT-P: lexer が捨てる文字の集合が完全一致で固定され、数字はそこに含まれない

  > ✅ Automated — `packages/core/src/lexer/lexer-discard.test.ts` › `characters the lexer drops (#2707)` › `drops exactly the documented set`。負のテスト実施済み（lexer の数字の分岐を外すと、このテストと `keeps every digit of a hyphenated date` が fail し、復帰で pass）

- [x] AT-Q: コミット済みの `.krs`（examples と docs の `krs` fence）が頼っている捨てる文字は `=` と `;` だけである

  > ✅ Automated — 同上 › `is relied on by committed .krs only for "=" and ";"`

## 手動確認

N/A — 自動テストですべて覆っている
