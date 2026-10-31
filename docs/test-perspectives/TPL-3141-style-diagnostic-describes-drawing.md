---
id: TPL-3141
title: "スタイル値の診断は描画を説明する: 範囲はスキーマ 1 か所、無効な宣言は cascade で 1 回捨てる"
status: active
date: 2026-10-30
applicable_to:
  - "スタイル値の許容範囲（min / max / 整数 / 単位 / キーワード）を追加・変更するとき"
  - "validator が拒否した値を、別の層（resolver / renderer）が自前の判定でもう一度読むとき"
  - "1 つの宣言に対する診断を、宣言ごとではなく適用先（ノード・エッジ）ごとに出す層を足すとき"
known_consumers:
  - property-schema
  - style-cascade
  - style-resolver
discovered_from:
  - issue: "#3141"
  - root_cause_file: "packages/core/src/resolver/style-resolver.ts:690"
related_to:
  - TPL-1503
topic: styling
scope:
  packages:
    - core
---

# TPL-3141: スタイル値の診断は描画を説明する: 範囲はスキーマ 1 か所、無効な宣言は cascade で 1 回捨てる

## 観点

著者が見る診断と、描かれるものが一致していること。「— ignored」と言った値は描かれず、
描かれる値には診断が出ない。

これは範囲が 1 か所にしか書かれていないときにだけ構造的に成り立つ。validator が
読む表（`PROPERTY_SCHEMAS`）と、resolver の手書きのガードの 2 か所に範囲があると、
どちらか一方だけを直す編集が必ず起き、両者の一致は誰も見ていない。

そのため、範囲の判定は表 1 か所で行い、拒否した宣言は cascade で 1 回だけ外す。
resolver は検査を通った宣言しか読まないので、範囲を持たない。診断は宣言の位置で
1 回だけ出し、適用先ごとに重ねない。

## 想定される失敗モード

- 範囲を表に足したのに resolver のガードを足し忘れ、範囲外の値が描かれる。#3130 は
  length に `min` を足したとき `opacity` のガードを漏らし、負の opacity でノードが
  消えたのに警告は「無視した」と言っていた
- 範囲外の扱いがプロパティごとに違う（`label-position` だけ clamp して描き、ほかは
  既定に戻す）。警告文はどちらも「— ignored」
- union の最初の枝の診断が出て、範囲が一度も示されない（`label-position: -0.5` が
  「start / middle / end ではない」と報告される）
- 1 つの宣言を validator が 1 回、resolver がノードごとに 1 回報告し、件数が適用先の
  数に比例する
- parser が値ノードを作れなかった宣言が validator を素通りし、resolver が文字列から
  読めた分だけ効く（`opacity: -0.5 0.2`）

## チェックリスト

スタイル値の範囲・型を追加・変更するとき:

- [ ] 範囲は `PROPERTY_SCHEMAS` だけに書いたか（resolver に min / max / clamp / 整数判定を足していないか）
- [ ] 範囲外の値は、宣言を書かなかったときと同じに描かれるか（弱いルールの値か既定）
- [ ] 診断は宣言ごとに 1 件で、ノードの数によらないか
- [ ] parser が値ノードを作れない形が残っていないか（残るなら、報告せずに捨てる経路になっていないか）
- [ ] karasu が同梱するシート（builtin / icon theme）は検査の対象外のままか

## 既知の対処パターン

- **無効な宣言は cascade で外す**: `flattenSheetsInCascadeOrder` が著者のシートの宣言を
  `satisfiesPropertySchema` に照らして外す。CSS と同じく、無効な宣言の後は弱いルールの
  値が効く。validator は同じ判定関数を使うので、捨てる宣言と報告する宣言が食い違わない
- **表から導出したテスト**: 表の範囲を持つ全プロパティについて、範囲外の値を機械的に
  生成し、診断が宣言ごとに 1 件であることと、描画が宣言なしと同一であることを確かめる。
  範囲を表に足せば、テストを書かなくても柵に入る

## 関連テスト

- `packages/core/src/style/schema-bounds.test.ts` — 表から導出した柵（範囲外の値の診断件数と描画の同一性）
- `packages/core/src/style/cascade.test.ts` — `flattenSheetsInCascadeOrder — invalid declarations (#3141)`
- `packages/core/src/style/value-validator.test.ts` — `values the schema reads one way (#3141)`、`sequence-of (label-offset)`
- `packages/core/src/parser/style-parser.test.ts` — `space-separated values (#3141)`、`refused values (#3141)`

## 派生元 spec

- `docs/spec/style.md` — Property list（「プロパティに合わない値を持つ宣言は、書かれなかったものとして扱う」）
- `docs/spec/diagnostics.md` — Style validation
