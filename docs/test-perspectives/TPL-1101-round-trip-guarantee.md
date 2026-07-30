---
id: TPL-1101
title: "コードを変換する機能では parse(format(x)) ≡ parse(x) の round-trip を保証する"
status: active
date: 2026-05-10
applicable_to:
  - "AST を入力に取り `.krs` テキストを生成する機能"
  - "parser のレキサ仕様とトークン化ルールを共有する必要がある変換層"
known_consumers:
  - formatter
  - translator
discovered_from:
  - issue: "#1101"
  - issue: "#1058"
  - issue: "#2076"
  - issue: "#2087"
  - root_cause_file: "packages/core/src/formatter/formatter.ts:203"
  - root_cause_file: "packages/core/src/formatter/quote-id.ts:14"
  - root_cause_file: "packages/core/src/formatter/formatter.ts:124"
related_to: []
topic: parser
scope:
  packages:
    - core
    - cli
---

# TPL-1101: コードを変換する機能では parse(format(x)) ≡ parse(x) の round-trip を保証する

## 観点

`.krs` テキストを書き換える機能（formatter / translator / refactoring など）は、変換前後で AST のセマンティクスを保存しなければならない。**「テキストとして整形した結果を再度 parse したとき、元の AST と構造的に等価になる」**ことを round-trip 保証と呼ぶ。

formatter が引用符の有無を判定する `BARE_ID_PATTERN`（`packages/core/src/formatter/quote-id.ts:14`）のような **トークン化に関わるルール** は、parser のレキサ仕様と完全に一致していなければならない。レキサが受理する形と formatter が「裸で出してよい」と判断する形がズレると、round-trip が破れる。

#1101 では `resource ECommerce.ProductDB` のようなドット記法 ID が formatter によって `resource "ECommerce.ProductDB"` に引用符化され、parse 後のセマンティクス（dot-notation の親子参照）が変わってしまった。#1058 ではスペースや特殊文字を含む ID で逆方向の崩壊が起きた。

### 網羅性も round-trip の一部（#2076）

round-trip が破れるのは値の変換ミスだけではない。**構文が出力から丸ごと抜け落ちる**のも同じ違反であり、被害はむしろ大きい（変質ではなく消失）。

#2076 では formatter の top-level 出力リスト（`printFile` が `KrsFile` の配列プロパティを手で列挙している箇所）が 11 個中 5 個しか列挙しておらず、parser が受理する `boundary` / `legend` / `client` / `database` / `queue` / `storage` の 6 構文が `karasu fmt` で無言のうちに削除されていた。top-level infra だけで構成されたファイル（`karasu translate --from db` が生成する形 — ADR-702）は **ファイル全体が空になった**。

この種の欠落は「既存の構文を 1 つ選んでテストする」書き方では絶対に捕まらない。テストが列挙する構文の集合と、実装が列挙する構文の集合が、同じ人間の同じ思い込みから生まれるからである。**期待集合を型・スキーマ側から機械的に導出する**こと（下記「既知の対処パターン」）。

### ID だけでなく「値」も escape する（#2087）

#1058 / #1101 で固めたのは **ID 側**の引用符・エスケープ（`quoteId()`）だけだった。`label` / `description` / `link` の URL / legend の title といった**値**は、`` `label "${node.label}"` `` のように生のテンプレート補間で出力されており、値に `"` や `\` が含まれると出力が parse 不能になっていた。ID 側が正しいことで「エスケープは対処済み」に見えていたのが発見を遅らせた。

被害が大きいのは **translate** 側である。formatter の入力は人間が書いた `.krs`（`"` を含む label は稀）だが、translate の入力は外部ファイルの自由テキストで、たとえば OpenAPI の `summary` は散文である。`summary` に `"""` が含まれると `karasu translate --from openapi` の出力が **parse error 11 件**になった。TPL の `known_consumers` に translator が載っているのは、まさにこの非対称のためである。

エスケープ規則を書くときは **lexer が実際にデコードする集合と一致**させる。karasu の lexer は `\"` / `\\` / `\n` の 3 種のみを解釈し、それ以外の `\<char>` は素の `<char>` を返す。したがって `\r` を `\\r` として出力すると、読み戻したときに文字 `r` になり**値が壊れる**。「安全側に倒して多めに escape」は誤りで、escape 集合は多くても少なくてもいけない。

### 表現できない値には fallback を用意する（#2087）

`"""` は verbatim Markdown のために raw（エスケープ機構なし）と決めた（ADR-9008）。その結果、`"""` を含む値は triple-quote 形式では**表現不能**であり、そのまま出力するとブロックが途中で終了する。この種の「その表現形式では書けない値」は、構文を拡張する（= spec 変更）か、別の表現形式に fallback するかの二択になる。#2087 では後者（`\n` escape 付きの単一行形式へ落とす）を選んだ。表現形式を複数持つプロパティを実装するときは、**各形式で表現できない値の集合**を洗い出し、fallback 経路をテストする。

## 想定される失敗モード

- **parser が受理する構文が出力に現れず、`fmt` が黙って削除する**（#2076。`--write` / pre-commit hook 経由だと author が気づく機会がない）
- `karasu fmt` を実行するたびに少しずつ AST が変質し、最終的に意味が変わる
- `--check` モードで idempotent でない（2回 format すると差分が出る）
- ユーザーが手書きで採用していた構文 variation（dot-notation / quoted / bare）が形を変えて出力され、PR diff が爆発する
- 変換結果は parse は通るが、resolver / renderer での挙動が変わる（最も発見が遅れる）

## チェックリスト

新機能の実装/修正時に、以下を確認する:

- [ ] 入力 `.krs` を parse → 変換 → format → 再 parse した AST が、元の AST と構造的に等価か（structural equality をテストで確認）
- [ ] AST に複数の表現フィールドがある場合（例: `resource` の `ref.parent` / `ref.child` と `id`）、formatter は適切なフィールドを参照しているか
- [ ] `--check` / dry-run モードで idempotent か（同じ入力に 2 回かけて差分が出ないか）
- [ ] 元のコードで使われていた構文の variations すべてに対して動作するか（quoted ID / bare ID / dot-notation / 特殊文字を含む ID / 予約語と衝突する ID）
- [ ] **parser が受理する構文を漏れなく出力するか**。変換層が AST のプロパティを手で列挙している箇所（`printFile` の top-level リストなど）は、期待集合を型・スキーマから導出したテストで網羅性を固定したか（#2076）
- [ ] **ネストされた構文も round-trip 対象か**。`KrsFile` の top-level 配列から導出したガードは**ノード内の構文を守らない** — スコープ内 `boundary`（#2036 slice A で `fmt` が黙って削除した実例）のように per-node に持つ構文は、ネスト位置ごとの round-trip テストを別途用意する
- [ ] 新しい top-level 構文 / AST プロパティを足したとき、変換層に配線し忘れると **テストか typecheck が落ちる**か
- [ ] その網羅性ガード自体が**空振りしていない**ことを負のテストで確認したか（わざと構文を 1 つ落として落ちるか / 型にダミーキーを足して `tsc` が落ちるか）
- [ ] ID だけでなく **値**（label / description / URL / title 等）も escape して出力しているか。生のテンプレート補間 `` `x "${value}"` `` が残っていないか（#2087）
- [ ] escape する文字集合が **lexer がデコードする集合と一致**しているか。lexer が解釈しない `\<char>` を出力していないか（多すぎる escape も値を壊す）
- [ ] 外部入力を取り込む経路（`translate --from ...`）について、自由テキストを含む hostile input で出力が parse できるか（#2087 は OpenAPI `summary` で顕在化）
- [ ] 複数の表現形式を持つプロパティで、**その形式では表現できない値**（`"""` を含む description 等）に fallback 経路があり、テストされているか

## 既知の対処パターン

- formatter の判定ルール（例: `BARE_ID_PATTERN`）を parser のレキサ仕様と **同じ正規表現定数** から導出する、もしくはレキサが直接公開する判定関数を呼ぶ
- ドット記法のような構造を持つ ID は AST 上で分解して保持し（例: `resource` の `ref.parent` / `ref.child`）、formatter は分解された各セグメントを個別に `quoteId()` してから join する（`formatter.ts:203` 周辺の現在の実装）
- round-trip テストを golden 形式ではなく AST 構造比較で書く（テキスト比較だと表記揺れで誤検知する）
- **網羅性は列挙せず導出する**。「構文 → fixture」の対応表を持ち、その **キー集合が型・スキーマ側と一致すること自体をアサートする**。#2076 の対処では
  - 実行時: `createEmptyKrsFile()` の配列プロパティを `Object.keys` で走査し、fixture 表のキー集合と `toEqual` で突き合わせる
  - 型: fixture 表に `satisfies Record<ArrayKeys<KrsFile>, string>` を付け、キー欠落を `tsc` で落とす

  の二重にした。どちらも「新しい構文を足した人が formatter を触り忘れる」瞬間に落ちる（ADR-2076）
- **「生の補間が 1 つも残っていない」ことをソースレベルでアサートする**。emit site を列挙するテストは #2076 と同じ理由でドリフトするので、#2087 では formatter のソースに `` `"${` `` パターンが 0 件であることを検査した（値はすべて `quoteString()` / `quoteId()` 経由になる）。次に追加される emit site を自動で捕まえられる
- **エスケープ規則は lexer のデコード規則と 1:1 で書き、両方向をテストする**。`escape(value)` の出力を lexer に食わせて元の値に戻るかを、hostile value 一覧（`"` / `\` / 末尾 `\` / 改行 / `"""` / CR / 空文字）で確認する
- **ガードが空振りしていないことを負のテストで確かめる**。#2076 の型ガードは初版が `const FIXTURES: Record<string, string>` という注釈で、index signature のせいで**恒真**（何も検査していない）だった。ダミーのキーを型に足して `tsc` が落ちることを確認して初めてガードとして成立する。実行時ガードも同様に、修正を部分 revert して落ちることを確認する

## 関連テスト

- `packages/core/src/formatter/formatter.test.ts`
- `packages/core/src/formatter/formatter-top-level-coverage.test.ts`（top-level 構文の網羅性ガード）
- `packages/core/src/formatter/quote-id.test.ts`
- `packages/core/src/formatter/quote-string.test.ts`（値のエスケープ規則 + 生補間の構造ガード）
- `packages/core/src/formatter/escape-round-trip.test.ts`（各構文の hostile value round-trip）
- `packages/core/src/translate/escape-hostile-input.test.ts`（translate の外部入力 round-trip）
- `packages/cli/src/fmt.test.ts`（`--write` がファイルを破壊しないこと）

## 派生元 spec

- [`docs/spec/syntax.md`](../spec/syntax.md) §「Grouping the system view (`boundary`)」/
  「Scoped declaration」— スコープ内 `boundary` はノード内に持つ構文であり round-trip 対象
  （#2036 slice A で `fmt` が黙って落とした実例）。同節末尾に本 TPL への `> Related TPLs:` back-ref あり。
- [`docs/spec/syntax.md`](../spec/syntax.md) § String values and escapes — 値の
  エスケープ規則（`\"` / `\\` / `\n` の 3 種のみ、それ以外の `\<char>` は素の文字、
  `"""` は raw）と「fmt / translate は emit 時にエスケープするので lexer が受理する
  値は round-trip する」規定。同節末尾に本 TPL への `> Related TPLs:` back-ref あり。
  規定が破られると #2087（値に `"` を含むと出力が parse 不能）が再発する。
- 設計経緯: [ADR-9008](../adr/9008-ast-restructure-discriminated-union.md)
  （`"""` を verbatim Markdown 用に採用 = エスケープ機構を持たない、という制約の出所）、
  [ADR-2087](../adr/2087-escape-emitted-string-values.md)（本件の決定）。
