---
id: TPL-2509
title: "kebab-case 名を受けるポジションは 1 つの字句規則を共有し、追加時は全ポジションで検証する"
status: active
date: 2026-08-16
applicable_to:
  - "open vocabulary の名前（tag / annotation / capability / legend ref / 将来の名前ポジション）を受理する parser コードを追加・変更するとき"
  - "lexer が識別子文字に含めない文字（`-` 等）を含む名前規約を spec が約束しているとき"
  - "同じ名前が `.krs` と `.krs.style` の両面から書かれる語彙を扱うとき"
discovered_from:
  - issue: "#2509"
  - root_cause_file: "packages/core/src/parser/parser.ts"
related_to:
  - TPL-1415
  - TPL-1503
  - TPL-2133
topic: parser
scope:
  packages: [core]
---

# TPL-2509: kebab-case 名を受けるポジションは 1 つの字句規則を共有し、追加時は全ポジションで検証する

## 観点

`.krs` の lexer は `->` / `-->` を字句解釈するため `-` を識別子文字に含めず、
kebab-case 名は `<word> - <word>` のトークン列として parser に届く。名前を
受理するポジションはこの列を 1 つの名前に縫合する必要があり、その縫合は
**共有ヘルパー 1 箇所**（`packages/core/src/parser/kebab-name.ts`）で行う。

検証すべきこと:

1. **新しい名前ポジションを足したら、kebab-case 名のテストを同時に足す。**
   縫合をポジションごとに手書きすると、あるポジションだけ適用漏れになり、
   名前が診断なしで複数断片に分裂する（#2509 の実例: `capability` には
   縫合があり、tag / annotation / legend ref にはなかった。
   `[my-team-internal-tag]` が 7 タグに分裂し、警告は断片名について出た）。
2. **`.krs` 側と `.krs.style` 側が同じ綴りで同じ名前に着地する**ことを、
   両パーサーを通す統合テストで固定する。style-lexer はハイフンを識別子に
   natively 含める（`font-family` のため）ので、`.krs` 側が縫合しないと
   同じ綴りのタグとセレクタが永遠にマッチしない（TPL-1415 の drift が
   字句レイヤーで起きる）。
3. **spec が約束した名前規約（kebab-case）を parser が受理する**ことを
   テストで固定する（TPL-2133）。断片が個別に受理されると、受理はされる
   （TPL-1503 の禁じる 4 状態にはならない）が、診断が author の書いた
   名前に言及せず、修正可能性が失われる。

## 想定される失敗モード

- 新しい名前ポジション（新しい ref 構文、新しい宣言）が縫合ヘルパーを
  通さず、kebab-case 名がそのポジションでだけ分裂する。
- keyword トークン（`system`, `table` 等）を断片として扱わず、
  `[legacy-system]` のような語彙が keyword 境界で切れる。
- `.krs` 側だけ・`.krs.style` 側だけをテストし、両面の一致
  （タグ ↔ セレクタ、annotation ↔ セレクタ）を通しで検証しない。

## テストの書き方

- parser test: 対象ポジションに `my-team-internal-tag` 形の名前を与え、
  **1 つの名前**として AST に載ることを assert する。keyword 断片
  （`legacy-system`）も 1 ケース含める。
- resolver test: `.krs` の kebab-case タグに `.krs.style` の同綴り
  セレクタが適用されることを assert する
  （`packages/core/src/resolver/warnings.test.ts` の #2509 ブロック参照）。

## 派生元 spec

- `docs/spec/tags-annotations.md` §Tags — 名前の字句規則（kebab-case が
  1 つの名前として lex される）の規定。本 TPL はその規定が新しい名前
  ポジションで破られたときに検出する観点。
