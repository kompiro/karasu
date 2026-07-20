---
id: TPL-20260510-02
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

# TPL-20260510-02: コードを変換する機能では parse(format(x)) ≡ parse(x) の round-trip を保証する

## 観点

`.krs` テキストを書き換える機能（formatter / translator / refactoring など）は、変換前後で AST のセマンティクスを保存しなければならない。**「テキストとして整形した結果を再度 parse したとき、元の AST と構造的に等価になる」**ことを round-trip 保証と呼ぶ。

formatter が引用符の有無を判定する `BARE_ID_PATTERN`（`packages/core/src/formatter/quote-id.ts:14`）のような **トークン化に関わるルール** は、parser のレキサ仕様と完全に一致していなければならない。レキサが受理する形と formatter が「裸で出してよい」と判断する形がズレると、round-trip が破れる。

#1101 では `resource ECommerce.ProductDB` のようなドット記法 ID が formatter によって `resource "ECommerce.ProductDB"` に引用符化され、parse 後のセマンティクス（dot-notation の親子参照）が変わってしまった。#1058 ではスペースや特殊文字を含む ID で逆方向の崩壊が起きた。

### 網羅性も round-trip の一部（#2076）

round-trip が破れるのは値の変換ミスだけではない。**構文が出力から丸ごと抜け落ちる**のも同じ違反であり、被害はむしろ大きい（変質ではなく消失）。

#2076 では formatter の top-level 出力リスト（`printFile` が `KrsFile` の配列プロパティを手で列挙している箇所）が 11 個中 5 個しか列挙しておらず、parser が受理する `boundary` / `legend` / `client` / `database` / `queue` / `storage` の 6 構文が `karasu fmt` で無言のうちに削除されていた。top-level infra だけで構成されたファイル（`karasu translate --from db` が生成する形 — ADR-20260422-05）は **ファイル全体が空になった**。

この種の欠落は「既存の構文を 1 つ選んでテストする」書き方では絶対に捕まらない。テストが列挙する構文の集合と、実装が列挙する構文の集合が、同じ人間の同じ思い込みから生まれるからである。**期待集合を型・スキーマ側から機械的に導出する**こと（下記「既知の対処パターン」）。

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
- [ ] 新しい top-level 構文 / AST プロパティを足したとき、変換層に配線し忘れると **テストか typecheck が落ちる**か
- [ ] その網羅性ガード自体が**空振りしていない**ことを負のテストで確認したか（わざと構文を 1 つ落として落ちるか / 型にダミーキーを足して `tsc` が落ちるか）

## 既知の対処パターン

- formatter の判定ルール（例: `BARE_ID_PATTERN`）を parser のレキサ仕様と **同じ正規表現定数** から導出する、もしくはレキサが直接公開する判定関数を呼ぶ
- ドット記法のような構造を持つ ID は AST 上で分解して保持し（例: `resource` の `ref.parent` / `ref.child`）、formatter は分解された各セグメントを個別に `quoteId()` してから join する（`formatter.ts:203` 周辺の現在の実装）
- round-trip テストを golden 形式ではなく AST 構造比較で書く（テキスト比較だと表記揺れで誤検知する）
- **網羅性は列挙せず導出する**。「構文 → fixture」の対応表を持ち、その **キー集合が型・スキーマ側と一致すること自体をアサートする**。#2076 の対処では
  - 実行時: `createEmptyKrsFile()` の配列プロパティを `Object.keys` で走査し、fixture 表のキー集合と `toEqual` で突き合わせる
  - 型: fixture 表に `satisfies Record<ArrayKeys<KrsFile>, string>` を付け、キー欠落を `tsc` で落とす

  の二重にした。どちらも「新しい構文を足した人が formatter を触り忘れる」瞬間に落ちる（ADR-20260720-02）
- **ガードが空振りしていないことを負のテストで確かめる**。#2076 の型ガードは初版が `const FIXTURES: Record<string, string>` という注釈で、index signature のせいで**恒真**（何も検査していない）だった。ダミーのキーを型に足して `tsc` が落ちることを確認して初めてガードとして成立する。実行時ガードも同様に、修正を部分 revert して落ちることを確認する

## 関連テスト

- `packages/core/src/formatter/formatter.test.ts`
- `packages/core/src/formatter/formatter-top-level-coverage.test.ts`（top-level 構文の網羅性ガード）
- `packages/core/src/formatter/quote-id.test.ts`
- `packages/cli/src/fmt.test.ts`（`--write` がファイルを破壊しないこと）
