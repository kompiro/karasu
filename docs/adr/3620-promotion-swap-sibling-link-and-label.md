---
id: ADR-3620
title: 昇格 PR の張り替えに、隣の Design Doc への参照・ラベル・番号での言い換えを含める
status: accepted
date: 2026-11-14
topic: adr-tooling
refines: [ADR-2331]
depends_on: [ADR-3286]
related_to: [ADR-3405, ADR-3038, ADR-2922]
assumptions:
  - "symbol: scripts/review/tier.ts :: isLinkSwap"
  - "symbol: scripts/review/tier.ts :: NOT_PROSE_LINE"
  - "symbol: scripts/review/tier.ts :: isNumberEdge"
  - "symbol: scripts/review/tier.ts :: ITEM_LABEL"
  - "grep: .claude/rules/adr.md :: `関連 Design Doc` を `関連 ADR` にすること"
  - "file: docs/test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md"
  - "file: docs/test-perspectives/TPL-2287-detector-near-misses-are-the-spec.md"
---

# ADR-3620: 昇格 PR の張り替えに、隣の Design Doc への参照・ラベル・番号での言い換えを含める

- **日付**: 2026-11-14
- **ステータス**: 決定済み
- **関連**:
  - Issue #3620（起点）。Design PR #3770、実装 PR #3781
  - kompiro の決定: [#3781 のコメント](https://github.com/kompiro/karasu/pull/3781#issuecomment-6870267466)（1 と 2）、[3 を改めた決定](https://github.com/kompiro/karasu/pull/3781#issuecomment-6871994540)、[ルール文の扱い](https://github.com/kompiro/karasu/pull/3781#issuecomment-6872209342)
  - [ADR-2331](2331-adr-automerge-scope.md)（昇格 PR の例外を差分の性質で判定する。本 ADR はその「張り替え」の形を広げる）、[ADR-3286](3286-risk-based-review-tiers.md)（段階の分類器）、[ADR-3405](3405-promotion-adds-adr-link.md)（許す形を文法で決め打ちにした前例）
  - TPL: [TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md)、[TPL-2287](../test-perspectives/TPL-2287-detector-near-misses-are-the-spec.md)
  - コード: `scripts/review/tier.ts`（`isLinkSwap`、その中の `normalize`、`fileTier`）

## 背景

Design Doc を ADR に昇格させる PR は、新しい ADR の追加・Design Doc の削除・その Design Doc を指していた参照の張り替えだけなら Low になり、auto-merge される（ADR-2331）。張り替えを判定する `isLinkSwap` は、リンク先と、リンクの文字列のうちファイル名・パス・`ADR-<n>` の言い換えしか許していなかった（ADR-3286）。

ADR-3038 の昇格 PR #3621 は、`docs/design/tpl-changed-files-recall.md` の 2 行のために Design になった。

```diff
-  - 関連 Design Doc: [`tpl-enforcement-status.md`](tpl-enforcement-status.md)（#3038。D5 で本件を分けた）
+  - 関連 ADR: [ADR-3038](../adr/3038-tpl-enforcement-status.md)（#3038。D5 で本件を分けた）
-TPL を結ぶ鍵が無いので、設計を分けた（`tpl-enforcement-status.md` の D5）。
+TPL を結ぶ鍵が無いので、設計を分けた（ADR-3038 の D5）。
```

外れた理由は 3 つあった。`docs/design/` の中のファイルは隣の Design Doc をディレクトリなしの名前で指すが、分類器はそれを参照と読まなかった。行の先頭のラベル `関連 Design Doc` を `関連 ADR` に直すことを許さなかった。コードスパンに入れた Design Doc の名前を、地の文の `ADR-<n>` に言い換えることを許さなかった。どの行も 2 つが同時に起きているので、1 つだけ直しても Low にならない。ADR-2922 の昇格 PR #3352 も同じ形の行を持つが、注記の文も書き換えているので、本 ADR でも Low にしない。

## 決定

**昇格で自然に起きる 3 つの言い換えを、形と位置を決め打ちにしたまま張り替えに数える。** どれも、削除行が削除された Design Doc を、追加行が新しい ADR を指す行に限り、ほかの文字はすべて一致しなければならない。

1. **D1: 隣への参照。** 変更されたファイルが `docs/design/` の直下にあるときだけ、削除された Design Doc の `<file>`・`./<file>`（anchor 付きも）を参照と読む。読むのは、markdown のリンク先の全体と、コードスパンの中身の全体だけで、地の文の語は読まない。コードスパンの中身は、行が D3 の地の文の行（下の 3）のときだけ読む。
2. **D2: ラベル。** 削除行の先頭が `関連 Design Doc`、追加行の同じ位置が `関連 ADR` のとき、その 2 語だけを同じものとして比べる（`ITEM_LABEL`）。字下げ・`- `・太字・コロンの種類は一致しなければならない。逆向きとほかの語の組は許さない。追加行に Design Doc への参照が残っていれば当たらない。この判定は外す方向にしか働かないので広く数え、`design/` を含む文字列は行のどこにあっても数える（`DESIGN_PATH`）。`docs/design/` のファイルでは、ディレクトリなしの `<name>.md` も、削除されたものに限らず行の生の文字列のどこにあっても数える（`BARE_MD_NAME`）。
3. **D3: 番号での呼び名。** 追加行の `ADR-<n>` を、削除行の同じ位置のコードスパンに入った参照と同じものとして比べる。`<n>` は、ファイル名の語幹が削除された Design Doc と同じ新しい ADR の番号に限る。前後の文字は Design Doc の境界（前が英数字・`.`・`/`・`:`・`-` でなく、後ろが英数字・`-`・`/` や `.` に続く英数字でない）に `_` を足したもので判定する（`isNumberEdge`）。
4. **D3 は行全体で判定する。** 削除行か追加行のどちらかが次の文字を含む行の組には、D3 を当てない（`NOT_PROSE_LINE`）。
   - ブラウザや GitHub が URL やその周りのマークアップと読むもの: `[` `]` `<` `>` `@` `://` `www.`、二重のバッククォート
   - 前の行から続くリンク先・リンクのタイトル・HTML 属性でありうるもの: ASCII の `(` `)` `"` `'` `=`、コードスパンだけの行
   - そのような行に元からある `ADR-<n>` は、置き換えずに行を Low から外す
5. **比べ方は Design Doc の記号の置き換えのまま。** 両方の行で、ラベル（D2）、リンク、参照だけのコードスパン（語幹を持つ記号 `` `⟦ref:<語幹>⟧` ``）、追加行だけの D3 の `ADR-<n>`、残りのディレクトリ付きのパスの順に置き換え、残りを比べる。

## 理由

- **観測した昇格の差分に合わせ、それより広げない。** 3 つの言い換えは、ADR を Design Doc と呼ぶラベルや、ADR をパスで呼ぶ本文を残さずに昇格するための最小の変更である。どれも決まった語を決まった位置でだけ同じものとして扱い、当たらない入力は厳しい側の段階に倒す（TPL-3286）。
- **逆向きの張り替えは Low でよい（kompiro の決定）。** 記号で比べると、ADR から消した Design Doc への張り戻しも一致する。ADR を指していた参照を消した Design Doc に戻す変更は revert でしか起きず、revert は意図して行うので auto-merge してよい。実装の途中では、参照を順に対にして向きまで確かめる形にしていたが、Design Doc の比べ方に戻した。
- **張り替える行に元からある `ADR-<n>` は Low から外す（kompiro の決定）。** 削除行の `ADR-<n>` は置き換えないので一致しない。ADR は Design Doc の後に作るので、昇格の前の行に同じ ADR の番号があることは起きない。日付で名付けた古い ADR（`20260715-01-x.md`）はコードスパンの語幹で対にしないが、新しい ADR は番号で名付けるのでそのままにする。
- **D3 はパーサーを使わず行全体で判定する（kompiro の決定）。** 語の境界の文字だけで決める形は、レビューのたびに語をまたぐ markdown の構造（複数語のリンクの文字列、脚注、autolink、二重のバッククォートのコードスパン）に穴が見つかった。一度は `marked` で地の文を見分ける形にしたが、Review tier と Low PR merger の workflow は依存をインストールせずに分類器を動かすので（ADR-3286）読み込めず、パーサーでも URL のホストを変える経路が 2 つ残った（見えない文字、前の行から続く HTML 属性）。kompiro は「行全体に戻し、ブラウザが URL と認識する形式は自動マージの対象から外す」と決めた。行の組は前の行から続く構造を見られないので、続きになりうる文字も外した。地の文の全角括弧（`（ADR-3038 の D5）`）は通る。
- **リンクや URL を足す変更は D3 では起きない。** D3 が書けるのは決まった `ADR-<n>` だけで、別のドメインへのリンクは作れない。Low の PR 全般で外のドメインへのリンクを人に回す検査は #3786 で扱う。
- **実例で確かめた。** この分類器で #3621 は Low、#3352 は Design になる。過去の昇格の 225 コミット（205 組の行）を流し直すと、判定が変わったのは 15 件で、12 件が今回の形で Low になり、3 件は厳しい側に変わった既知のものだった。

### Design Doc からずれた点

実装とレビューで、Design Doc より厳しくした点がある。どれも Low を狭める側である。

- D3 を行全体の文字で外す（上の 4）。Design Doc は `ADR-<n>` の前後の文字だけで判定していた
- `ADR-<n>` の隣の `_` も D3 を外す（CodeRabbit CLI の指摘。識別子の一部を番号と読まないため）
- D1 のコードスパンの中身を、地の文の行でだけ参照と読む（タイトル付きのリンクの文字列に入ったコードスパンを、リンクの外と読まないため）
- D2 の「Design Doc への参照が残っていないか」は追加行の生の文字列で見る。新しい ADR のリンクを除いてから見る形を試したが、隣の語が繋がる穴と、リンクをまたいで名前が分かれる穴が続けて見つかったので戻した。そのため、`docs/design/` のファイルで新しい ADR のリンクの文字列に `.md` の名前を書くと、ラベルの言い換えは当たらない
- 4 文字以上字下げした入れ子の項目も地の文として読む（行だけではコードブロックかどうかを決められず、今の書き方を変えないため）

### ルール文

`.claude/rules/adr.md` の適用条件は、Design Doc の「仕様の変更」の文面のまま、D3 を位置で判定する書き方になっている。分類器は行全体で判定するので、ルール文より厳しい。同じ行に別のリンクがある昇格 PR はルールどおりに書いても Low にならず、人のレビューに回る。ルール文を行全体の判定に揃えるのは、`docs/` の外に触れない昇格 PR とは別の PR で行う（kompiro の決定は「#3781 では変えず、昇格のときに揃える」。昇格 PR を Low に保つため PR を分けた）。

### 柵

- `scripts/review/tier.test.ts`「isLinkSwap: sibling names, the item label and ADR-<n> (#3620)」: D1・D2・D3 を受け入れる形と、境界の外側（長い名前、別のディレクトリ、地の文の名前、逆向きや別の語のラベル、語の一部や URL・パスの一部の番号、リンクやコードスパンの中の番号、`NOT_PROSE_LINE` の各文字を含む行、前の行から続く形）を拒むこと（TPL-2287）。`NOT_PROSE_LINE` の各部品と境界の各条件は、外すとどれかのテストが落ちることを確かめた。
- 同じファイルの「the promotions that motivated it」: #3621 の差分が Low、#3352 の差分が Design になること。

## 却下した案

### 隣への参照だけを認識する（Issue の Expected）

規則の文面を変えずに済むが、#3621 の 2 行はどちらも参照の認識のほかにもう 1 つ変更を含むので Low にならない。Low にするには、ADR を Design Doc と呼ぶラベルや、ADR をパスで呼ぶ本文を残すしかない。

### 張り替える行では、どんなラベルや言い換えも許す

`設計 (Design Doc)` のような別のラベルにも効くが、ラベルや呼び名の位置に任意の語を書ける。`- **承認済み**:` のように行の意味を変えるラベルも人を通らずに入る（ADR-3405 のレビューで問題になった形）。

### 書き方の規則で避ける

隣の Design Doc も `../design/<file>` で指し、昇格ではラベルや呼び名を変えない、と決める。分類器は変えずに済むが、ADR を Design Doc と呼ぶ行を残させ、規則が守られなかったときに例外が届かない（ADR-3405 の失敗モードと同じ）。

### D3 を markdown パーサーで判定する

地の文かどうかを位置で正しく決められ、同じ行に別のリンクがあっても D3 を当てられる。ただし分類器は依存をインストールせずに動く前提なので（ADR-3286）、パーサーを入れると Review tier と Low PR merger が動かなくなる。パーサーでも前の行から続く構造は見えない。

### 複数の Design Doc を同時に昇格させる PR の組み合わせに対応する

kompiro の運用では 1 度に 1 本の Design Doc しか昇格させないので、扱わない（#3779 は not planned で閉じた）。語幹で対にする規則は、2 本が同時に削除されても誤って対にしない側に倒れる。

## 影響

- #3621 の形の昇格 PR（隣の Design Doc へのリンク、ラベル、番号での呼び名）は、ほかに変更が無ければ Low になる。
- 同じ行に URL やマークアップの文字がある行で D3 を使った昇格 PR は、Design のまま人がレビューする。
- コードスパンの中身の全体がパスの参照を、語幹の違う ADR に張り替える変更は、Design Doc の記号が語幹を持つので Low でなくなった。昇格では ADR を Design Doc と同じ語幹で名付けるので、通常は起きない。
