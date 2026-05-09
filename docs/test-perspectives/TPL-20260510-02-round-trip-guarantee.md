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
  - root_cause_file: "packages/core/src/formatter/formatter.ts:203"
  - root_cause_file: "packages/core/src/formatter/quote-id.ts:14"
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

## 想定される失敗モード

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

## 既知の対処パターン

- formatter の判定ルール（例: `BARE_ID_PATTERN`）を parser のレキサ仕様と **同じ正規表現定数** から導出する、もしくはレキサが直接公開する判定関数を呼ぶ
- ドット記法のような構造を持つ ID は AST 上で分解して保持し（例: `resource` の `ref.parent` / `ref.child`）、formatter は分解された各セグメントを個別に `quoteId()` してから join する（`formatter.ts:203` 周辺の現在の実装）
- round-trip テストを golden 形式ではなく AST 構造比較で書く（テキスト比較だと表記揺れで誤検知する）

## 関連テスト

- `packages/core/src/formatter/formatter.test.ts`
- `packages/core/src/formatter/quote-id.test.ts`
