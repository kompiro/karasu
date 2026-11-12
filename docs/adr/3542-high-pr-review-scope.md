---
id: ADR-3542
title: High の PR で人間が読む範囲を、合意済みの Design Doc で絞り、仕様の文面が一致したファイルは Medium に数える
status: accepted
date: 2026-11-09
topic: build
authors: [kompiro]
refines:
  - ADR-3286
related_to:
  - ADR-3011
  - ADR-3271
  - ADR-3333
  - ADR-3340
scope:
  packages: []
  concerns:
    - ci
assumptions:
  - "symbol: scripts/review/tier.ts :: tierSummary"
  - "symbol: scripts/review/tier.ts :: backingDesignDoc"
  - "symbol: scripts/review/tier.ts :: designCheckGap"
  - "symbol: scripts/review/tier.ts :: specBlocks"
  - "symbol: scripts/review/tier.ts :: matchesAgreedText"
  - "symbol: scripts/review/tier.ts :: agreedSpecFiles"
  - "grep: scripts/review/local-review-record.ts :: no deviation"
  - "grep: docs/design/TEMPLATE.md :: ### 仕様の変更"
  - "grep: docs/process/review.md :: #### Design Doc に載せた仕様の文面"
  - "grep: docs/process/review.md :: #### Design Doc との照合"
---

# ADR-3542: High の PR で人間が読む範囲を、合意済みの Design Doc で絞り、仕様の文面が一致したファイルは Medium に数える

- **日付**: 2026-11-09
- **ステータス**: 決定済み
- **関連**:
  - 親 Issue [#3546](https://github.com/kompiro/karasu/issues/3546)
  - Issue [#3542](https://github.com/kompiro/karasu/issues/3542)（Design Doc で合意した内容を読み直さない）、[#3543](https://github.com/kompiro/karasu/issues/3543)（ファイルごとの段階と、判断してほしいことの節）
  - Design Doc の PR [#3549](https://github.com/kompiro/karasu/pull/3549)、実装の PR [#3700](https://github.com/kompiro/karasu/pull/3700)（B）、[#3707](https://github.com/kompiro/karasu/pull/3707)（A2）、[#3716](https://github.com/kompiro/karasu/pull/3716)（A1）
  - [ADR-3286](3286-risk-based-review-tiers.md): リスク段階。本 ADR はその規則と Review tier の出力を足す
  - [ADR-3011](3011-skip-coderabbit-label.md): 判断を含む基準を Claude だけで適用しない
  - [ADR-3271](3271-close-issue-with-pr.md): Design Doc の PR は `Refs #N`、実装の PR は `Closes #N`
  - [ADR-3333](3333-converge-after-ready-hook.md) / [ADR-3340](3340-converge-fix-the-class.md): `/coderabbit-converge` のラウンド
  - Issue [#3544](https://github.com/kompiro/karasu/issues/3544) / [#3545](https://github.com/kompiro/karasu/issues/3545)（仕組みの High と決定の High の区別、再レビューの上限の計測。本 ADR の範囲外）、[#3380](https://github.com/kompiro/karasu/issues/3380)（段階の 1 か月後の計測）
  - TPL: [TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md)、[TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)

## 背景

PR の段階は、変更したファイルの段階の最大値で決まる（ADR-3286）。`packages/core` の変更が spec の日英 2 ファイルを
一緒に変えると、PR 全体が High になり、kompiro は差分の全部を読み、CodeRabbit も差分の全部にラウンドを回す。

直近にマージした High の PR 24 本のうち、High のパスのファイルが一部だけだった PR が 9 本ほどあった。

| PR    | High のパスのファイル / 全ファイル | CodeRabbit のレビュー           | High になった原因                                                          |
| ----- | ---------------------------------- | ------------------------------- | -------------------------------------------------------------------------- |
| #3409 | 4 / 51                             | 7 回                            | `docs/spec/style*`・`diagnostics*`                                         |
| #3527 | 4 / 30                             | 4 回                            | `docs/spec/syntax*`・`diagnostics*`                                        |
| #3437 | 2 / 24                             | 2 回（再レビューの依頼は 6 回） | `docs/concepts*`                                                           |
| #3498 | 6 / 26                             | 4 回                            | `.claude/rules/**`・`.claude/skills/**`・`lefthook.yml`・`scripts/lint/**` |
| #3320 | 2 / 10                             | 2 回                            | `docs/spec/style*`                                                         |

こうした PR の仕様の変更は、ほとんどが Design Doc の段階で kompiro と検討して合意したものである。実装の PR で
spec の差分をもう一度読むのは、同じレビューを 2 回していることになる。kompiro が実装の PR で確かめたいのは、
合意した設計から実装がずれていないかと、自分が判断すべき論点だけである（#3546 の議論、2026-11-02）。

#3508 の規則（言語の挙動とセキュリティの境界を High にする）で同じ PR を数え直すと、spec の合意だけで段階が
下がるのは #3320・#3437 のように renderer・app・examples などの変更に spec や concepts が付いてくる PR である。
#3527・#3409 のように言語の挙動を変える PR は High のままだが、kompiro が読むものは絞れる。

## 決定

**Review tier はファイルごとの段階を job summary に出し、kompiro に判断してほしいことは PR 本文の
`## For Reviewers` 節に 3 件ずつ置く。合意済みの Design Doc が裏付け、Design Doc との照合が HEAD を覆う High の
PR では、kompiro が読むのを節と一部のファイルに絞る。決定のパスのファイルは、差分が裏付けの Design Doc の
`### 仕様の変更` に載せた文面とちょうど一致すれば Medium に数える。**

### ファイルごとの段階と `## For Reviewers` 節（#3543、#3700）

- `tier.ts classify` の JSON に `files`（ファイルごとの段階）を足し、`check` は段階ごとにまとめた表を job summary に
  書く。push のたびに HEAD から作り直すので、PR 本文には置かない（TPL-1032）
- kompiro に判断してほしいこと（Design Doc からのずれのうち kompiro に確かめるもの、CodeRabbit の指摘のうち記録済みの
  決定を変えるもの、ほかの論点）は PR 本文の `## For Reviewers` 節に置く。一度に出すのは 3 件までで、残りは
  答えの後に出す。答えによって残りの論点が消えたり変わったりするためである（kompiro の決定、2026-11-02）
- 裏付けの無い High の PR で kompiro が読むのは、High のファイルと `## For Reviewers` 節である
- 次の PR は差分の全部を読み、絞り込みもしない（summary がそう出す）。作成者が信頼リストにいない PR、High の
  ファイルが無くラベルで（ラベルが無いことも含む）High になった PR、パスを読めない差分の節がある PR、High の
  ファイルが表の行数（200 件）に収まらない PR
- Review tier の権限（read だけ）と性質（install なし、数秒）は変えない

### 裏付けの Design Doc と、読む範囲の絞り込み（#3542 A2、#3707）

- **裏付けの Design Doc**（`backingDesignDoc`）は、PR が閉じる Issue（GitHub の `closingIssuesReferences`）と
  git の履歴だけで決める。次をすべて満たす 1 本だけが裏付けになり、
  どれかが欠ければ裏付けは無い（厳しい側に倒れる。git が答えられないときも無い）
  - PR の base が `main` で、main との merge-base にある `docs/design/*.md`（TEMPLATE を除く）である。
    stacked PR の上の層は、下の層にしか無い Design Doc を根拠にできない
  - 「引き金 Issue」の行が、PR が `Closes` する Issue にリンクしている。そうした Design Doc がちょうど 1 本である。
    行の括弧書きの中のリンクは数えない。親 Issue は別の行に置く
  - PR がその Design Doc を変えていない
  - merge-base の blob が、検査した時点の `origin/main` の先頭の blob と同じである。違えば main を取り込めば
    判定し直せる
  - 履歴に rename が無く、作成から main の先頭まで、それを変えた first-parent のコミットがすべて Design の段階の
    変更である。squash マージだけなので、main のコミットは PR 1 本の最終の差分にあたる
- **Design Doc との照合**: ready の前のローカルレビューで、実装の文脈を持たない subagent に Design Doc と base との
  差分だけを渡し、「現時点の方針」「実装の指針」「制約・前提」から外れた点を列挙させる。実装が外れていれば実装を
  直し、Design Doc の方が実態に合わなければ直さずに `## For Reviewers` で kompiro に確かめる。結果は
  ローカルレビューの記録にレビュアー `design` として残し、ずれが無ければ `no deviation` の行を 1 行残す
  （`no deviation` は `design` の行にだけ使える）
- **読む範囲を絞る条件**（`designCheckGap`）: 裏付けがあり、本文に中身のある `## For Reviewers` 節があり、
  `design` の行を含むローカルレビューの記録が waive されずに HEAD を覆い、Medium の検査を通ること。`design` の
  行はどれも、場所の欄に裏付けの Design Doc をいまの blob で `<path>@<blob>`（7 桁以上）と書いていなければならない。
  古い blob と照合した行は数えない。照合の中身は確かめない（自己申告なので、段階には使わず読む範囲だけに使う）
- **絞ったときに読むもの**: `## For Reviewers` 節と、summary が「Files still read」に並べるファイル。並べるのは
  セキュリティの境界のファイル（テストも含む）と、決定のパス・言語の挙動のパスの外にある High のファイル
  （レビューと release の仕組み、lockfile、依存の変更）である。この一覧が 200 件を超えるときは絞らない
- CodeRabbit のラウンドは絞った PR にも回り、収束してから kompiro に渡す。ruleset は base に追いついていることを
  求めない（`strict_required_status_checks_policy: false`）ので、検査の後に main で Design Doc が変わると、公開された
  summary が古いまま絞った範囲を示す。そのため kompiro に渡す直前に Review tier を走り直させる。走り直した run は
  `main` の先頭の blob で判定し直し、違えば裏付けを外す。そのときは main を取り込む。裏付けの Design Doc は
  coderabbit-rounds.md の「記録済みの決定」に入る
- **マージは人間が行う。** High の auto-merge の例外は作らず、ADR-3286 のマージの決まりは変えない

### 仕様の文面の一致（#3542 A1、#3716）

- 決定のパスは `docs/spec/**`・`docs/concepts*.md`・`docs/process.md`・`docs/process/**`・`.claude/rules/**`
  である。workflow・lint・CI の仕組みは、文面が合意どおりでも挙動を確かめる必要があるので対象にしない
  （kompiro の決定、2026-11-02）
- Design Doc の `### 仕様の変更` 節（任意）に、行頭から始まる fence（情報文字列が `diff file=<path>`）で、
  ファイルごとの unified diff の hunk を置く。`@@` の行番号は書かなくてよい。入れ子の fence と HTML コメントの
  中のブロックは読まない。節は次の見出しで終わる。`### 仕様の変更` の見出しが 2 つある、または閉じていない
  fence か HTML コメントのある Design Doc からはどのブロックも読まない。同じパスのブロックが 2 つあるか、
  hunk でない行があるパスは使えない
- Review tier は、決定のパスの各ファイルについて、PR の差分の hunk がブロックの hunk と**ちょうど一致する**かを
  確かめる。差分は設定に左右されないよう `--no-renames --full-index -U3 --diff-algorithm=myers --indent-heuristic --inter-hunk-context=0`
  に固定する。比べるのは各行の符号・本文（行末のスペースとタブだけを除く）・hunk の並びで、ほかの hunk が
  あれば一致しない。各 hunk は空行・表の区切り・`---` 以外の行を変えていなければならず、文脈と削除行は base の
  ファイルにちょうど 1 か所で当てはまらなければならない。新しいファイルは base に無いときだけ一致し、削除・
  mode の変更・symlink・gitlink・binary は一致しない
- **一致は全部か無しかで判定する。** Design Doc の決定のパスのブロックがすべて一致したときだけ、それらの
  ファイルを Medium に数える。1 つでも一致しなければ、どのファイルも High のままである
- 下げるのは、決定のパスだけを理由に High のファイルに限る。セキュリティの境界、changelog、`package.json`、
  ほかの High のパスにも当たるファイルは一致しても High のままである。ほかに High のファイルが無ければ PR は
  Medium になり、CodeRabbit のラウンドは回らない
- 段階のラベルは分類器の段階より緩められないので、一致を使うには作者が `risk: medium` を付ける。Medium の PR を
  kompiro に渡す直前に Review tier を走り直させる。main がその後に Design Doc を改めていれば、裏付けが外れて
  ラベルとの食い違いで落ちるので、main を取り込む。渡した後に main で Design Doc が変わる場合は拾わない。
  そうした改訂は kompiro がマージした Design の PR なので、kompiro は改訂を知っている
- 実装の途中で文面を直すなら、Design Doc を先に直す（小さな Design の PR）か、High のまま通す
- Design の PR に日英のブロックを置いたら、ローカルレビューで subagent が日英のブロックの意味の食い違いを
  列挙し、レビュアー `design` の行として記録に残す
- `docs/design/TEMPLATE.md` に `### 仕様の変更` 節（任意）と、入れ子の fence に入れた書き方の例を置く

### 運用で決めたこと

#3707 と #3716 の `## For Reviewers` で挙げた論点は、kompiro が答えを書かずにマージしたので、推奨した側で
決まった。

- 絞ったときに読むものに、レビューの仕組み・lockfile・依存の変更を残す（Design Doc の方針の表は「節とセキュリティの
  境界のファイル」だったが、制約・前提の「仕組みは High のまま」を優先した）
- 渡す直前の blob の比較は、High でも Medium でも、手で比べる代わりに Review tier を走り直させる形にした。
  Medium の渡し方の分は、A1 の前には一致で Medium になる PR が無いので A1 に回した
- High か Medium の PR が一度でも変えた Design Doc は、以後どの PR も裏付けない。Design Doc は Design の PR でだけ
  変える。本 ADR の元の Design Doc も #3700（High）が見出しを直したため、#3716 は絞られなかった
- 一致は Design Doc の実装の指針が書いたファイルごとではなく、全部か無しかにした
- ブロックの読み方は、Design Doc が書いたよりも厳しい場合（見出しが 2 つ、閉じていない fence や HTML コメント、
  同じパスのブロックが 2 つ、意味のある行を変えない hunk）を足した形のまま残す

## 理由

- **段階を Claude の判断で下げない。** 合意済みとみなすのは、機械が確かめた文面の一致だけにした。宣言で検査が
  軽くなる規則は、宣言を裏付ける検査があるときだけ効かせる（ADR-3011）。subagent の照合は自己申告なので、
  段階には使わず、読む範囲だけに使う
- **合意の根拠を PR 側から読まない。** merge-base の Design Doc から読み、PR が変えていれば使わない。PR が自分で
  Design Doc を書き換えて差分と一致させることができない（TPL-3286）
- **main にあるだけでは合意ではない。** Design Doc は `packages/*` と一緒に Medium の PR で入ることがあり、Medium では
  人間が差分を読まない。最後の変更だけを見ると、Medium の PR が足したブロックを、後の Design の PR が無関係な行を
  直しただけで合意済みに変えてしまう。変えたコミットがすべて Design の段階なら、いまの中身の行はすべてどれかの
  Design の PR の差分にあったので、kompiro が読んでいる
- **ずれは High に戻るだけである。** 文面を 1 行でも変える、hunk を落とす、並べ替える、同じ箇所の spec が後で変わる、
  のどれでも一致しなくなり High に戻る。誤って Medium になる方向には倒れない
- **全部か無しかにするのは、日英のずれを残さないためである。** ファイルごとに判定すると、英語のブロックだけを
  入れて日本語を落とした PR の英語のファイルが Medium になり、日英が誰にも読まれないままずれていく
- **差分の形を固定するのは、手元と CI で hunk の切れ方を揃えるためである。** `diff.algorithm` や inter-hunk
  context の設定が違うと、同じ変更でも hunk が変わり、一致の判定が環境で変わる
- **導き出せる一覧は HEAD から作り直す場所に置く。** 本文に置いた一覧はコミットを足すと古くなる（TPL-1032）。
  `## For Reviewers` は Claude が書く判断の論点で、導き出せないので本文に置く
- **3 件ずつにするのは、答えが残りを変えるからである。** 先に全部を並べると、消えるはずの論点にも kompiro の
  時間を使わせる
- **セキュリティの境界は絞らない。** Design Doc があっても、境界に触れるファイルは kompiro が読む

## 却下した案

- **High の部分を別の小さな High の PR に分け、実装を Medium の PR で積む**: 仕様は Design Doc で読んでいるので、
  分けた High の PR でも同じ文面を読み直す。言語の挙動を変える PR は実装側も High なので、#3508 の後は分けても
  読む量が減らない。積む順によって main の spec と実装が一時的にずれる
- **AI の照合だけで合意済みとする**: Design Doc に文面を載せる手間は無いが、結果は自己申告で、段階を下げる
  根拠にできない（ADR-3011）
- **CodeRabbit に Design Doc を読ませる（`path_instructions`）**: 読む保証が無く、Medium には CodeRabbit が回らない
  ので届かない
- **ファイルの一覧を PR 本文に生成した節として置く**: コミットのたびに作り直しが要り、忘れると古い一覧が残る
- **論点を全部まとめて出す**: 上の「理由」のとおり
- **High のコミットも読まれたものとして数え、裏付けを保つ**: High の PR でも kompiro が Design の段階のファイルを
  読むことになり、読む範囲を絞る目的と逆になる
- **後の Design の PR が Design Doc を書き直せば、合意を取り直せるようにする**: どの行がどの PR で読まれたかを
  判定する仕組みが要り、履歴だけで決まる今の判定より弱くなる。Design Doc は Design の PR でだけ変えれば足りる

## 見直しの条件

- #3380 の計測（2026-11-26）で、合意済みで Medium になった PR と、そのマージ後 1 週間以内の fix PR を数える。
  一致で Medium になった PR の後に、その文面に起因する fix PR が続くなら、一致の条件を見直す
- 仕組みの High と決定の High の区別（#3544）と、再レビューの上限の計測（#3545）の結果が出たら、決定のパスの
  範囲と CodeRabbit のラウンドの扱いを見直す
