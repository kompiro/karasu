---
id: TPL-20260624-03
title: "エッジの端点で引くセレクタ / lookup は、ビューが格納する端点 id 形（bare / dot-notation）で比較する"
status: active
date: 2026-06-24
applicable_to:
  - "`.krs.style` のエッジセレクタや renderer が、エッジを `from` / `to` の端点 id でフィルタ・lookup するとき"
  - "新しいエッジ由来の selector / 集計（color-by-source、端点ハイライト等）を足すとき"
  - "usecase→resource など合成エッジを含むビューで端点 id を比較するとき"
discovered_from:
  - issue: "#1755"
  - root_cause_file: "packages/core/src/resolver/style-resolver.ts"
related_to:
  - TPL-20260618-01
  - TPL-20260618-03
topic: styling
scope:
  packages:
    - core
---

# TPL-20260624-03: エッジの端点で引くセレクタ / lookup は、ビューが格納する端点 id 形（bare / dot-notation）で比較する

## 観点

エッジを **端点（`from` / `to`）の id** で選ぶ仕組み（`edge[from=X]` / `edge[to=X]`
selector、将来の端点ハイライトや集計）は、セレクタが持つ id 文字列を
`KrsEdge.from` / `KrsEdge.to` と突き合わせる。ここで効いてくるのが
**端点 id には複数の形がある**こと:

- 通常ノードは **bare id**（`ApiGateway`）。
- usecase→resource 合成エッジの端点は **dot-notation**（`OrderDB.OrderTable`）。
  これは `edge#<from>-><to>` の canonical base id を組み立てるのに使う形と同じ。

セレクタ側が一方の形しか受理・比較しないと、**書いたのに効かない**（dot-notation
端点が拾えない）か、逆に **bare しか書けない**（合成エッジを指せない）という
silent な取りこぼしになる。これは TPL-20260618-01（ノード style/metadata の lookup
は layout が使う id 形をすべて試す）のエッジ端点版であり、根は同じ「同じ実体を
複数の id 形で持つ」構造。

`?? default`（マッチ無し = 既定スタイル）は不一致を例外でなく見た目の degrade に
変えるため、機能テストでも気づきにくい点も TPL-20260618-01 と共通。

## 想定される失敗モード

- lexer / parser が端点値のドットを食わず、`edge[to=OrderDB.OrderTable]` が
  `OrderDB` までしか読めず合成エッジに一致しない。
- resolver が `edge.to` の dot-notation 形を考慮せず、bare id とだけ比較して
  合成エッジを取りこぼす（指定したのに既定色のまま）。
- 端点セレクタの specificity を `edge[tag]` と揃え忘れ、カスケード順が崩れて
  `edge[from=X]` が `edge[tag]` に負ける / 勝ちすぎる。

## チェックリスト

エッジを端点 id で選ぶ / 引くコードを書く・触るとき:

- [ ] セレクタ値の lexer / parser が **dot-notation 端点**（`A.B`）を 1 つの id として
      読めるか（`edge#<from>-><to>` の base id と同じ字句規則に揃っているか）
- [ ] 比較対象が、ビューが実際に格納している端点 id 形（合成エッジは dot-notation、
      通常は bare）と一致するか。片方の形しか比較していないなら silent な
      取りこぼしになる
- [ ] マッチ無しで `?? default` に落ちたケースが「意図した既定」か「id 形不一致の
      取りこぼし」かを区別できるテストがあるか（合成エッジ・dot-notation 端点を
      明示的に含むケースを置く）
- [ ] 端点述語の specificity が意図した tier（`edge[from=X]` は `edge[tag]` と同格の
      11）になっているか — `computeSpecificity` の lock テストで縛れているか

## 既知の対処パターン

- `edge[from=X]` / `edge[to=X]` の値は lexer の `readIdentifier` が
  dot-notation をそのまま 1 トークンに畳む（`edge#<base>` と共通の規則）。
  resolver の `edgeSelectorMatches` は `edge.from` / `edge.to` と直接比較する
  ので、bare / dot-notation のどちらも自動的に正しい形で当たる（#1755）。

## 関連テスト

- `packages/core/src/parser/style-parser.test.ts` — `edge[from=<id>] / edge[to=<id>] selector`
  （dot-notation 端点・タグ併用・unknown 属性診断・specificity 11）。
- `packages/core/src/resolver/style-resolver.test.ts` — `edge[from=<id>] / edge[to=<id>] selector`
  （ハブ全 fan-out を一括着色 / 非該当エッジは不変 / dot-notation 端点一致）。
- `packages/core/src/index.test.ts` — `compile — edge#<id> style selector (end-to-end)`
  の `colors a hub's whole fan-out with one edge[from=<id>] rule`。

## 派生元 spec

- `docs/spec/style.md` §「Source/target edge selectors (`edge[from=<id>]` /
  `edge[to=<id>]`)」（日本語版 `docs/spec/style.ja.md` §「始点 / 終点エッジ
  セレクタ」）。`<id>` が dot-notation 端点を取りうること・specificity 11 を規定
  しており、本 TPL のチェックリストがその回帰を検出する（#1755）。
