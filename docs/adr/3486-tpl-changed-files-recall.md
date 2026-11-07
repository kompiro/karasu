---
id: ADR-3486
title: PR の変更ファイルから関係する TPL を引き、PR を作った直後に出す
status: accepted
date: 2026-11-07
topic: testing
authors: [kompiro]
related_to:
  - ADR-1192
  - ADR-1357
  - ADR-2810
  - ADR-3038
  - ADR-3359
  - ADR-2419
scope:
  packages: []
  concerns:
    - ci
assumptions:
  - "file: scripts/tpl/changed-files-reminder.sh"
  - "grep: .claude/settings.json :: scripts/tpl/changed-files-reminder.sh"
  - "grep: package.json :: \"tpl:changed\": \"tpl related --config tpl.config.json --base origin/main\""
  - "grep: tpl.config.json :: \"sourcePrefixes\": \\[\"packages\", \"scripts\", \"\\.github\"\\]"
  - "grep: .github/PULL_REQUEST_TEMPLATE.md :: pnpm tpl:changed"
  - "grep: docs/test-perspectives/README.md :: #### 変更ファイルから引く"
---

# ADR-3486: PR の変更ファイルから関係する TPL を引き、PR を作った直後に出す

- **日付**: 2026-11-07
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3486](https://github.com/kompiro/karasu/issues/3486)（`## Slice status` 表と測定の手順）、設計 PR [#3531](https://github.com/kompiro/karasu/pull/3531)
  - スライス: [kompiro/tpl-tools#41](https://github.com/kompiro/tpl-tools/issues/41)（照会と `scope.paths`）、[#3591](https://github.com/kompiro/karasu/issues/3591)（karasu での採用、PR [#3615](https://github.com/kompiro/karasu/pull/3615)）、[#3592](https://github.com/kompiro/karasu/issues/3592)（運用系の TPL に `scope.paths` を足す）
  - [ADR-1192](1192-test-perspective-library.md)（TPL の運用）、[ADR-1357](1357-tpl-tools-extraction.md)（照会と検査は `@kompiro/tpl-tools` が持つ）、[ADR-2810](2810-tpl-source-path-check-ownership.md)（本文のパスの検査は tpl-tools の CLI が持つ）、[ADR-3038](3038-tpl-enforcement-status.md)（D5 で本件を分けた）、[ADR-3359](3359-pr-before-after-screenshots.md)（`gh pr create` の後にフックで促す先例）、[ADR-2419](2419-poc-report-directory.md)（測定のスクリプトを main に入れない）
  - tpl-tools 側の実装判断: tpl-tools ADR-41（鍵・順位・glob の記法。`@kompiro/tpl-tools@0.0.14` で公開）、ADR-17（本文のパスの実在検査）
  - 関連 TPL: [TPL-1725](../test-perspectives/TPL-1725-gated-test-suite-detection-gap.md)（起動条件が対象を覆わないと検出が抜ける）、[TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)（手で持つ対応表は drift する）

## 背景

TPL のチェックリスト項目の多くはプログラムで判定できない。#3038 の分類（2026-10-02）では
804 項目のうち 222 項目が judgment（設計時の判断、または人が行為をしたかの問い）だった。
これらに対して決定論的にできるのは、判定ではなく「この変更にどの TPL を見せるか」である。
それまでは、作成者が正しい topic で `tpl related <topic>` を打つことを思い出すかどうかで決まっていた。

#3038 は `tpl related --changed-files` を提案したが、frontmatter に変更ファイルと TPL を結ぶ鍵が
無かったので、設計を分けた（ADR-3038 の D5）。

- `scope.packages` は粗すぎる。`packages/core` の下を変えると、`core` を持つ TPL がほぼ全部出る
- `known_consumers` は機能名で、パスではない

## 決定

TPL の本文が名指すファイル（実在検査の接頭辞の下）を鍵にし、それで引けない TPL だけが任意の
`scope.paths` に glob を足す。`gh pr create` の直後に Claude Code のフックが上位 10 件を出して
`## TPL impact` での引用を促し、人の作成者には同じ一覧を出す `pnpm tpl:changed` を用意する。
引用が無くても PR は止めない。

- **鍵:** 接頭辞は `tpl.config.json` の `sourcePrefixes`（`packages` `scripts` `.github`）で、
  `tpl validate` と `tpl related` が同じものを読む。テストファイルの名指しは対応するソースにも
  一致させる。ディレクトリを指すスパンは鍵にしない
- **件数:** 重みの順に上位 10 件。重みは「変更ファイルごとに、そのファイルを名指す TPL の数の
  逆数」の和で、11 件目以降は件数と全件を出すコマンドだけを示す
- **置き場所:** 照会とスキーマは tpl-tools（ADR-41）、karasu は設定・TPL 本文・フックだけを持つ（ADR-1357）
- **stacked PR:** 変更ファイルは PR の base から数える。フックは `gh pr view` の `baseRefName` を
  読み、手で引くときは `pnpm tpl:related --base origin/<base>` を使う
- **横断的な原則の TPL:** 鍵では引かない。今どおり設計時の `tpl related <topic>` で当てる

## 測定

直近にマージされた 120 PR（2026-10-22〜11-01）から、Dependabot の 12 PR と docs だけの 36 PR を
除いた 72 PR で、鍵の候補ごとに「PR の変更ファイルに当たる TPL が何件出るか」を数えた。
対象は当時の active 185 TPL（`main` 395b961f）で、手順は #3486 のコメントにある（スクリプトは
ADR-2419 に従い main に入れない）。

正解の代わりに、PR のタイトルと本文が引用した TPL を使う（48 PR に計 100 件）。各鍵がその何件を
拾うかを「再現率」、出した件数のうち引用された割合を「精度」とした。引用は不完全なので、精度は
下限、再現率は目安である。

鍵の候補は、K0 を除いて、本文のコードスパンが名指す実在するファイルから作った。glob とディレクトリは
含めず、frontmatter の `root_cause_file` も含めない（実在検査の対象ではなく、`:257` のような行番号付きの
ものもある）。テストファイルを名指していれば、対応するソースにも一致させた。

| 鍵 | 件数の中央値 | p90 | 最大 | 0 件の PR | 再現率 | 精度 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| K0 `scope.packages` | 66.5 | 124 | 155 | 27 / 72 | 70 / 100 | 2% |
| K1 `packages/` `scripts/` `.github/` `docs/` `examples/` の下 | 4 | 16 | 46 | 12 / 72 | 62 / 100 | 12% |
| K1v `packages/` `scripts/` の下 | 3 | 14 | 46 | 24 / 72 | 57 / 100 | 13% |
| K1g `packages/` `scripts/` `.github/` の下（採用） | 3.5 | 14 | 46 | 20 / 72 | 61 / 100 | 13% |

上位 N 件に切った場合の再現率:

| 上位 N | K1 | K1g |
| ---: | ---: | ---: |
| 5 | 44 | 44 |
| 10 | 59 | 59 |
| 15 | 61 | 60 |
| 全件 | 62 | 61 |

#3485 で本文の名指しを補った後に測り直すと、K1g は中央値 3.5・p90 19・再現率 62 / 100・精度 12%、
上位 10 件で 54 / 62 だった。名指しが増えると、上位 10 件に残る割合は 97% から 87% に下がる。

K1g の 0 件の PR 20 本のうち 18 本は運用系・ツール類の PR で、残り 2 本は `packages/vscode` と
`packages/e2e` のテストまわりだった。0 件は「当てる TPL が無い」ではなく「この鍵では分からない」
なので、フックはそう表示する。

#3485 後の K1g が拾えない引用 38 件の内訳と扱いは次のとおり。

| 種類 | 件数 | 扱い |
| --- | ---: | --- |
| 運用系の PR（workflow・`.claude/`・レビューやリリースのスクリプト）で引用された、仕組み全般の TPL | 15 | `scope.paths` で足す（#3592） |
| TPL が同じ領域の別のファイルを名指していて、触ったファイルを名指していない | 15 | PR で引用したのに出なかったら、その PR で `## 関連テスト` を足す |
| 特定のファイルに結びつかない横断的な原則 | 8 | 引かない。広い glob を書くとほぼ全 PR に出て、件数が K0 に戻る |

## 理由

- **本文のファイルが、件数と再現率の釣り合いがよい。** K1g は中央値 3.5 件で、精度は K0 の 6 倍に
  なる。K0 の中央値 66.5 件、精度 2% は読まれない
- **埋め戻しが要らない。** 新しい TPL は `## 関連テスト` を書いた時点で鍵を持つ。`scope.paths` を
  書くのは、取りこぼしが観測された TPL だけでよい
- **鍵の大半が実在検査を受ける。** 本文のパスは `tpl validate` と同じ走査で読むので、ファイルの移動や
  削除は報告され、鍵が黙って死なない。手で持つ対応表のように drift しない（TPL-1032）。例外は
  `absent-path-next-line` で宣言したパスと、テストから導く対応ソースで、どちらも実在を検査しない。
  一致するのはそのパスそのものを変えた PR だけなので、害は小さい
- **`.github` を接頭辞に入れ、`docs/` と `examples/` は入れない。** `.github` を外すと（K1v）運用系の
  一致を 4 件落とし、0 件の PR が 4 本増える。`docs/` と `examples/` を足しても（K1）再現率は 1 件しか
  増えず、`docs/spec/syntax.md`（46 TPL が名指す）のような文書が鍵に入る
- **上位 10 件は読める上限である。** K1g は p90 の PR でも 14 件（#3485 後は 19 件）で、10 件に切っても
  拾える引用の 87〜97% が残る。精度は 12〜13% で、10 件のうち引用されるのは 1 件程度になる。判定を
  求めない以上、これより多くは読まれない
- **同じターンで届き、結果が残る。** 一覧は Claude の文脈に入るので読みに行く手順が要らない。draft の
  あいだなら CodeRabbit も分単位の CI も走っておらず、本文やコードを直してから ready にできる。
  結果は PR 本文の引用として残る
- **止めない。** judgment は機械で確かめられない。引用が無いと失敗させたり、当てなかった TPL に
  理由を求めたりすると、「該当なし」と書くだけの定型文を育てる

## 実装で設計から変えたこと

- **存在しないパスも鍵に残す（tpl-tools ADR-41）。** 設計は実在するファイルだけを鍵にし、歴史として
  触れたパスは `absent-path-next-line` の宣言によって一致しないとしていた。その形だと、ファイルを
  削除・改名する PR に TPL が出ない。そうした PR こそ TPL を見せたい変更なので鍵に残す。宣言のない
  宙に浮いたパスは `tpl validate` が報告する。宣言したパスも鍵に入るので、歴史として触れただけの
  パスでも、そのパスを変えた PR には TPL が出る。上の測定は実在するファイルだけで数えている
- **stacked PR の手引きは `pnpm tpl:related --base origin/<base>` にする。** 設計は `pnpm tpl:changed` に
  base を渡すとしていたが、このスクリプトは `--base origin/main` を含む。2 つ目の `--base` は後勝ちで
  動くものの、tpl-tools が文書化していない挙動なので頼らない
- **0 件と判断するのは、tpl-tools が出す 0 件の文言を読んだときだけにする。** 一致なしの標準出力は
  空だが、古い tpl-tools は `--base` を topic と読んで同じく空・終了 0 を返す。標準出力だけで判断すると
  「当てる TPL が無い」と誤って伝える。標準エラーの `No active TPL names a changed file.` を見たときだけ
  0 件の案内を出し、変更ファイルが無いときや想定外の状態では何も出さない。この文言と出力の形は、
  インストール済みの `tpl` に当てる contract test が見張る

## フックの作り

`scripts/tpl/changed-files-reminder.sh` を PostToolUse と PostToolUseFailure の両方に置く
（ADR-3359 のフックと同じ）。`gh pr create` の出力の URL から PR を取り、`gh pr view` で
`headRefName` と `baseRefName` を読み、`git worktree list --porcelain` からそのブランチの worktree を
探して、そこで `tpl related --config tpl.config.json --base origin/<baseRefName>` を実行する。

- フックは `$CLAUDE_PROJECT_DIR`（main の checkout）から起動するので、そこで実行すると PR で足した
  `## 関連テスト` が見えない
- フックの入力の `cwd` は `cd X && gh pr create` のような呼び方で PR の worktree を指さないので使わない
- worktree が見つからないときや想定外の状態では、何も出さずに終わる

## 却下した案

### 鍵

- **`scope.paths` の glob を全 TPL に持たせる。** 185 TPL に誰かが書くことになり、書く基準が人に
  よって揺れる。粗く書けば K0 のように件数が膨らみ、本文の `## 関連テスト` と別の一覧を手で持つので
  drift する（TPL-1032）。任意の補完としてだけ残した
- **ディレクトリを指すスパンの前方一致。** `packages/core` のようなスパンが K0 と同じ件数を連れ戻す。
  ディレクトリ単位で引きたい TPL は `scope.paths` に glob を書く

### 届け方

- **PR へのコメント（CI）。** 人の作成者にも届くが、ジョブに `pull-requests: write` が要り、全 PR の
  通知が増える。Claude が作成者のときは、コメントを読みに行く手順が別に要る
- **pre-push フック。** push のたびに同じ一覧を見ることになり、出力はターミナルに流れて PR 本文に残らない
- **`.claude/rules` 風のトリガー。** TPL ごとに 185 ファイルを生成することになり、編集のたびに複数の
  TPL 本文が文脈に入って他のルールが効かなくなる（`.claude/rules/README.md`「どの層に書くか」）
- **引用が無ければ失敗させる。** 上の「止めない」のとおり

## 影響

- 人の作成者には自動では届かず、`pnpm tpl:changed` を思い出すことに頼る。背景の問題がその経路には残る。
  測定期間の人の作成者による 108 PR のうち 105 本は本文に Claude Code の署名があり、今の karasu では
  フックの経路がほぼ全体を覆う。人の作成者が増えたら PR へのコメントを足す
- `tpl:validate` のフラグは `tpl.config.json` に移った。ADR-2810 と ADR-3038 の assumption を設定のほうへ向け直した
- AT は作らない。ユーザーが観測する挙動は無く、検証は tpl-tools のユニットテスト、
  `scripts/tpl/changed-files-reminder.test.ts`、`pnpm tpl:validate` で行う

## 未解決の問い

- **フィードバックの仕組み:** 「引用したのに出なかった」TPL を機械で見つけて知らせるか。PR 本文の引用と
  一覧を突き合わせれば出せるが、引用自体が不完全なので、まずは人が気づいたときに足す運用で様子を見る
- **重みの見直し:** 逆数の和は単純な既定値である。名指しが増えるほど順位が効きにくくなるので、目立つ
  ようならファイル数での正規化などを tpl-tools 側で試す
- **`[guard: <path>]` の影響:** ADR-3038 の D1 が足す印もコードスパンなので鍵に入る。ガードかその対に
  なるソースを触った PR にしか一致しないので件数への影響は小さいと見込むが、#3488 で印が入った後
  （2026-11-07 時点で 34 TPL に 74 個）の件数はまだ測っていない
- **Design Doc の作成時:** まだ変更ファイルが無いので対象にしない。そこは今どおり `tpl related <topic>` を使う
