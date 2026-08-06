---
id: TPL-2047
title: "ドキュメントに埋めた .krs は散文ではなく入力として parse する（手順は誰も実行しないので静かに文法から外れる）"
status: active
date: 2026-07-30
applicable_to:
  - "`docs/acceptance/*.md` に `.krs` を書いた手動 AT の手順を追加・改訂するとき"
  - "spec / guide / AT のいずれかに `.krs` スニペットを新しく埋めるとき"
  - "手動チェック項目を自動化しようとして「そもそも手順が動かない」と気づいたとき"
  - "意図的に不正な `.krs`（診断のデモ）をドキュメントに載せるとき"
known_consumers:
  - acceptance-docs
  - parser
related_to:
  - TPL-1680
  - TPL-1716
  - TPL-74
  - TPL-2075
discovered_from:
  - issue: "#2047"
  - root_cause_file: "docs/acceptance/0006-builtin-style-and-reference.md"
topic: testing
scope:
  packages:
    - core
---

# TPL-2047: ドキュメントに埋めた .krs は散文ではなく入力として parse する

## 観点

手動 AT の手順に書いた `.krs` は **誰も実行しない**。テストコードなら文法が変われば
赤くなるが、手順は文法から外れても永久に緑のままで、「未チェックの手動項目」として
何度も QA チェックリストに現れ続ける。#2047 の AT-0006 AC-1.2 は
`resource DB "DB" [table]` — parser が一度も受け付けたことのない形 — を読者に打ち込
ませようとしていた。自動化を試みた時点で初めて「この項目は長らく実行されていない」
と分かった。同じ PR で corpus 全体を parse したところ、**AT-0039 の
`description { … }`（正しくは `"""…"""`）と AT-0064 の `[mobile] [v2] [critical]`
（角括弧の繰り返しは parse error）** も同種の drift として出てきた。後者は
`docs/spec/syntax.md` の散文が「parseable」と嘘をついていたのが元だった。

到達状態: ドキュメントに埋まった `.krs` は **例外なく parser を通っている**。
通らないものは「抜粋」か「意図的に不正」かを fence 自身が宣言し、後者は
*いまも不正であること* が検証される。

検証:

```
pnpm at:check-coverage --strict     # docs/acceptance/*.md の ```krs を全件 parse
pnpm --filter @karasu-tools/core test -- spec-syntax   # docs/spec/syntax.md の ```krs
```

**主張を fence に書く。** 抜粋なら ` ```krs fragment `、診断のデモなら
` ```krs invalid `。無印の ` ```krs ` は「現行文法で通る完全なモデル」という主張で
あり、ガードはその主張だけを検証する。skip 自体は構わない — **黙って skip される**
のが #2047 を生んだ。

## 想定される失敗モード

- 文法を変えた PR が、その文法を使う AT の手順を更新せずに通る。テストは全部緑で、
  壊れたのは人間向けの手順だけなので誰も気づかない。
- 手動項目を自動化しようとして初めて手順が動かないと分かり、Issue の調査が
  「AC を書き直す」ところから始まる（#2047 がまさにこれ）。
- 意図的に不正な例（`top-level-declaration` のデモ等）が、文法の緩和で **正しく
  なってしまい**、例として成立しなくなる。片方向のガードだと検出できない。
- spec の散文が受理される形を誤って説明し、それを写した AT が丸ごと嘘になる
  （#2047 の `[mobile] [desktop]`）。fenced な例は `spec-syntax.test.ts` が守るが、
  **散文中のインラインコードは誰も守らない** — 文法の主張は fence に書く。
- 手順を「壊れているから」といって手動項目のまま放置する。未チェックの `- [ ]` は
  永久に QA チェックリストに載り続け、実行されない項目がノイズとして蓄積する。

## チェックリスト

`docs/acceptance/*.md`（および spec / guide）に `.krs` を書くときに確認する:

- [ ] スニペットは完全なモデルか。完全なら無印 ` ```krs `、抜粋なら
      ` ```krs fragment `、不正入力のデモなら ` ```krs invalid ` を宣言したか。
- [ ] `pnpm at:check-coverage --strict` が緑か（新しい fence が parse できるか）。
- [ ] 文法上の主張（「これは書ける」「これは書けない」）を**散文のインラインコード
      だけ**で書いていないか。書けるなら fence にして機械検証に載せたか。
- [ ] 手順が描画結果を見に行くものなら、その要素に **到達する経路が実際にあるか**
      確認したか（#2047 の後半: bare な `resource` はスタイル上シェイプが決まって
      いても usecase 図に昇格せず、永久に目視できなかった — silent drop 自体は [TPL-2075](TPL-2075-parsed-construct-renders-or-warns.md) の観点）。
- [ ] 自動化できた項目は `- [x]` + `> ✅ Automated — …` に畳み、目視でしか判定でき
      ない観点だけを `- [ ]` として残したか（[TPL-1680](TPL-1680-at-e2e-spec-linkage-no-drift.md)）。

## 既知の対処パターン

- **fence の情報文字列を主張として使う**: `scripts/acceptance/krs-fences.ts`。
  無印 = parse エラーゼロ、`fragment` = 検証しない、`invalid` = **いまも** parse
  エラーが出ること。`invalid` を逆向きに検証するのが要点で、文法が緩んで例が例で
  なくなる変化も拾える。
- **既存ゲートに相乗りする**: 新しい hook / workflow を足さず
  `at:check-coverage --strict` に finding を 1 種類足すだけにする。lefthook の
  glob（`docs/acceptance/**`）と CI（`at-check-coverage.yml`）が既に手順書の編集で
  発火するため、発火条件を作り直す必要がない。
- **corpus 全体で一度に棚卸しする**: 導入時に全 fence を parse し、drift（直す）と
  抜粋 / 意図的に不正（宣言する）に仕分ける。既存分を放置して新規だけ守ると、
  「一部は検証されている」という最も誤解を招く状態になる。
- **同じ観点の先行例**: `packages/core/src/spec-syntax.test.ts`（`docs/spec/syntax.md`）
  と `scripts/guide/gen-guide-diagrams.ts --check`（`docs/guide/**` の hero スニペット
  は実際にレンダリングされる）。ドキュメント中の `.krs` を実行可能な資産として
  扱う系譜。

## 派生元

- `.claude/rules/acceptance.md` §「埋める `.krs` スニペットは fence で主張を宣言する」
