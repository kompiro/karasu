---
name: pr-verify
description: >
  Check a PR for kompiro before kompiro merges it, and report in Japanese: stop
  early and hand back to the implementing session when CodeRabbit left an unresolved
  finding, a required check failed, or the PR conflicts with main; otherwise translate
  the Summary and For Reviewers sections, point out what needs kompiro's decision,
  summarise the local review record, drive the PR's Cloudflare preview with Playwright
  for its acceptance items (screenshots, and video of the e2e specs the PR adds or
  changes) into an Artifact report, give a merge opinion in a summary file opened in an
  editor tab beside the chat (or an Artifact page when no editor can open it), ask
  kompiro every open question the PR leaves (For Reviewers and the like) before asking
  about the merge, and on kompiro's OK tick the verified checklist items and
  squash-merge. Run it with a PR number. Trigger when the
  user says: "PR を検証して", "マージしていいか見て", "マージ前チェック", "PR #N を確認",
  "pr-verify", "verify PR", "is this PR ready to merge", or names a PR and asks whether
  to merge it, even without saying "verify".
---

# PR Verify

kompiro がマージする前に PR を確かめ、判断材料を日本語で渡す。PR 番号を 1 つ受け取る
（`/pr-verify 3721`）。番号が無ければ聞く。

## 到達状態

終わったとき、次のどれかが成り立っている。

- **差し戻した:** 手順 1 で直すべき点が見つかり、kompiro に日本語で理由を伝え、実装セッションに
  貼れる英語の依頼文を渡した。手順 2 以降には進んでいない
- **置き換え先を案内した:** 別の open PR がこの PR を置き換えていたので、直させずに置き換え先を伝えた
- **判断を渡した:** 手順 2〜4 の日本語の要約、手順 5 の検証レポート（対象の PR のみ。Artifact の
  リンク）、手順 6 のマージ意見を 1 つの検証サマリにまとめ、チャットの横（エディタのタブ、開けなければ
  ブラウザの Artifact）に開いた。未決事項はすべて kompiro に聞いて答えを PR に記録した。draft でも
  `risk: low` でもない PR ではそのあとでマージするかを聞き（`risk: low` は Low PR merger に任せる）、
  kompiro が OK と言った場合に限り、確かめたチェックリスト項目にチェックを入れ、squash でマージした
- **未決事項の答えで差し戻した:** kompiro の答えが PR の変更を求めたので、マージするかは聞かず、
  実装セッションに貼れる英語の依頼文を渡した
- **未決事項を残して止めた:** kompiro が答えなかった（ダイアログを閉じた、「後で決める」、
  「preview の再デプロイを待つ」）問いがあるので、マージするかは聞かず、決まったら `/pr-verify` をもう一度実行するよう伝えた

差し戻すとき、下の「実装セッションへの差し戻し」で宛先の実装セッションが決まれば、依頼文を kompiro に渡す代わりに、
依頼を PR のコメントに残してその実装セッションに送った（kompiro には送ったことを伝えた）。

マージは kompiro がこのセッションで明示的に OK したときだけ行う。意見が「マージしてよい」でも、
返事を待たずに `gh pr merge` を実行しない。kompiro は未決事項が決まるまでマージしないので、
**マージするかの質問は、未決事項がすべて答えられたあとにだけ出す。**

## 準備

スクリプトはすべて `.claude/skills/pr-verify/scripts/` にあり、リポジトリの checkout（依存が
入っているもの）から実行する。以下 `S=.claude/skills/pr-verify/scripts`、
`OUT=$PWD/reports/pr-verify/<pr>`（gitignore された置き場。`reports/README.md`）とする。

手順 2〜5 で書く日本語の文章はチャットに流さず、手順 6 で検証サマリのファイルにまとめる。チャットには
各手順の進み具合を 1 行ずつ書くだけにする。手順 1 で終わるとき（差し戻し・置き換え先の案内・
クローズ済み）は、これまでどおりチャットに書く。

kompiro への文章は日本語で書き、em dash（—）は使わない（読点・コロン・括弧で代える）。
「人間のレビュー」ではなく「kompiro の判断」のように名前で書く。

## 実装セッションへの差し戻し

**実装セッションに貼る依頼文を kompiro に渡して終わるところ（手順 1 の `fix`、手順 6 の冒頭と 6b の 3 で gate が
`fix`、6b の 4 で変更が選ばれた、OK のあとに gate が `fix`、NO で直す点を言われた）では、どこでも本節に従う。**
宛先が決まらなければ、今までどおり依頼文を kompiro に渡す。規則の大枠は `docs/process/review.md`「セッション同士の
やりとり」にあり、本節は `pr-verify` の側の細部を持つ。

宛先が決まるのは、次がすべて成り立つときだけである。

1. `ListAgents` の 1 行目で、このセッションの名前が `verify-<N>`（`N` は数字）である（deferred なら `ToolSearch` の
   `select:ListAgents,SendMessage` で読み込む）。kompiro がこのセッションで `/pr-verify` を直接打ったときも同じ
2. PR 本文に `Closes #<N>` か `Refs #<N>` があり、`#<N>` の直後が数字でない（`N` が 3920 なら `#39201` は数えない）
3. 一覧に `impl-<N>` の行がちょうど 1 つある
4. PR がマージされていない（6b の 3 でマージ済みの PR に変更が選ばれたときの追いかけの PR は、新しい PR なので
   この往復に入れない）
5. 往復の上限に達していない: PR のコメントのうち、作者が kompiro の login（`gh api user --jq .login`）で 1 行目が
   `Hand-back by /pr-verify` のものが 3 件未満。HEAD が変わらない差し戻し（スレッドへの返信だけ、rate limit が
   明けたあとのレビューの頼み直しだけ）も 1 件と数える

決まったら、次の順で行う。

1. 依頼文（今までどおりの英語の依頼文）を PR に英語のコメントで残す（`gh pr comment <pr> --body-file <ファイル>`）。
   1 行目は `Hand-back by /pr-verify head=<headSha>:` にする。`<headSha>` は、`fix` を出した gate の実行（手順 1、
   手順 6 の冒頭、6b の 3、OK のあと）の `headSha`、6b の 4 と NO からなら手順 1 で控えた `headSha` にする（実装
   セッションは、これが PR の今の head と違う差し戻しを古いとみなして断る）。kompiro が選んだ変更（6b の変更、NO で挙げた点）の行には、
   `Decisions by kompiro` と同じく末尾に `[change]` を付ける（やり直しの手順 3 が、差分で確かめる項目をこの印で選ぶ）。
   前の `Hand-back` のコメントの `[change]` の行は、手順 3 で変更済みと確かめたものと、そのコメントのあとの
   `Decisions by kompiro` で取り下げたもの以外をすべて写す。まだ直っていなかったものに加え、手順 1 の `fix` で手順 3 に
   進まなかったときのように、まだ確かめていないものも写す（手順 3 はいちばん新しいコメントしか読まないので、写さないと
   確かめられなくなる）。取り下げたものは写さない（写すと取り下げが新しいコメントより前になり、手順 3 がまた確かめる
   項目にしてしまう）。写す行には、その行を確かめる差分の起点を
   `(from <sha>)` として `[change]` の前に書く（もとの行に `(from <sha>)` があればその SHA、無ければもとのコメントの
   `head=`）。新しいコメントの `head=` から確かめると、それより前に入った修正が差分に現れないため。コメントは kompiro のアカウントで書かれ、ほかの処理が
   読むので、CodeRabbit の指摘はスレッドかコメントの URL で書き、`cr-comment:v1:` で始まる文字列（CodeRabbit の
   指摘が答え済みに数えられる）も `@coderabbitai`（CodeRabbit がレビューを始める）も書かない
2. `impl-<N>` に、1 行目を `hand-back PR #<pr> <コメントの URL>` にして送る（`SendMessage`）。メッセージには PR 番号と
   URL だけを入れ、依頼の中身はコメントに置く
3. kompiro には、送ったことと送り先、理由、PR へのリンクを 1〜2 行で伝えて終わる。送信が失敗したら、コメントの
   1 行目を `Hand-back (not delivered) by /pr-verify head=<headSha>:` に書き換え（`gh api -X PATCH
   repos/{owner}/{repo}/issues/comments/<id> -f body=<本文>`。往復の数と手順 3 の読み方がこのコメントを数えないように）、
   依頼文を今までどおり kompiro に渡す

## 手順 1: 差し戻すべきか

```bash
$S/gate.sh <pr>
```

1 行の JSON が出る。`verdict` で分ける。

- **`closed`**: PR はすでにマージ済みかクローズ済み。そう伝えて終わる。マージ済み（`gh pr view <pr>
  --json state` が `MERGED`）で、PR の `Decisions by kompiro` のコメント（手順 3 の読み方で読む）に
  「一緒に close する」と答えた Issue があれば、終わる前に `gh issue close` する（Low PR merger が
  マージした PR など）。close するのは PR の本文が参照している Issue に限る
- **`superseded`**: 別の open PR（`supersededBy`）の本文が、この PR を置き換えると書いている。この PR を
  直させても無駄になるので、実装セッションへの依頼文は出さない。置き換え先の PR の本文から、この PR を
  いつ閉じる段取りか（例: 置き換え先のマージ後）を読んで伝え、置き換え先を `/pr-verify` するよう勧めて
  終わる。`reasons` にほかの問題（コンフリクトなど）があっても、置き換え先で解消済みかどうかを書くに留める
- **`fix`**: 実装セッションの作業が残っている。`reasons` と、その根拠（`unresolvedThreads` の各指摘、
  `coderabbit.bodyFindingIds` / `threadReplyUrls`、`failedChecks` の名前とリンク、コンフリクト、
  CodeRabbit の rate limit が明けてレビューを頼み直す必要があること）を
  kompiro に日本語で短く伝える。失敗した check はリンク先のログ（`gh run view <run-id> --log-failed`）
  から失敗の要点を 1〜2 行で添える。続けて、実装セッションへそのまま貼れる英語の依頼文を
  コードブロックで渡す（PR 番号、直すもの、各リンク）。宛先の実装セッションが決まれば、渡す代わりに上の
  「実装セッションへの差し戻し」で送る。**ここで終わる。** 手順 2 以降は行わない。
  実装セッションが直したあとに `/pr-verify` をもう一度実行すればよいことを一言添える
- **`wait`**: 直す点は無いが、まだ落ち着いていないものがある（check が走っている・cancel された・
  ready の PR で skip されたまま HEAD で走っていない、
  CodeRabbit がレビュー中か rate limit 中、CodeRabbit がまだ一度もレビューしていない、CodeRabbit の
  状態を読めなかった、GitHub がコンフリクトの有無をまだ出していない）。`reasons` を伝えて手順 2 へ進む。
  cancel や skip で走っていない check は最新の run を走り直せば済む（コードの修正は要らない）と添える。手順 6 の前に
  `gate.sh` をもう一度実行する
- **`proceed`**: 手順 2 へ進む

CodeRabbit がレビューするのは `risk: high`（または段階のラベルなし）と `risk: design` の PR だけなので、
それ以外では `coderabbit` は `null` になる。`coderabbitReviewedHead: false` は CodeRabbit の PR レビューが
HEAD を見ていないことを表すので、手順 4 で使う。`otherFailedChecks`（必須でない check の失敗）は判定を
変えないが、手順 6 の根拠で触れる。`isDraft: true` は差し戻しの理由にしないが、手順 6 で触れる。
次の 2 つも判定を変えないが、実装セッションでは片付けられないので手順 6 の「マージ前に決めてほしいこと」に
入れる。

- `otherUnresolvedThreads`: CodeRabbit 以外（kompiro 自身のインラインの依頼、Copilot など）が開いた
  未解決スレッド。各スレッドの `firstLine` と URL を挙げる
- `coderabbitUnmarkedBodyFindings` が 1 以上: CodeRabbit がレビュー本文で数えたが ID を付けなかった指摘。
  PR 上のコメントでは消せず、扱いは kompiro が決める
`headSha` は手順 6 でマージする commit と照らし合わせるので控えておく。

`gate.sh` が JSON を出さずに失敗したら、エラーを kompiro に伝えて終わる（判定できないまま先へ進まない）。

## 手順 2: PR の要約（日本語）

`gh pr view <pr> --json title,body,url,closingIssuesReferences,labels,files` で本文を読み、
`## Purpose` と `## Summary` から「何を・なぜ変えたか」を日本語の文章 3〜5 文にまとめる。閉じる Issue と
リスク段階（`risk: *` ラベルと `## Risk` の理由）も 1 行で添える。

変更点の一覧（`## Changes` の訳、ファイルごとの説明、関数名や識別子を並べた箇条書き）は書かない。
kompiro は変更の中身を PR の diff で見るので、本文の言い換えは読まれない。ユーザーに見える挙動の変化の
うち kompiro の判断が要るもの（意図した副作用、既存の挙動を変えたもの）は、要約に書き込まず手順 6 の
「マージ前に決めてほしいこと」に回す。

## 手順 3: For Reviewers（日本語）

`## For Reviewers` の各項目を日本語にし、項目ごとに次のどちらかを付ける。

- **判断が必要:** kompiro に決めてほしい問い（選択肢がある、「OK?」と聞いている、記録済みの決定を
  変える）。問い・選択肢・著者の推奨を短く書く。PR のコメントやスレッドで kompiro がすでに答えて
  いれば（`gh pr view <pr> --json comments,reviews` で確認。`--comments` は `--json` と併用できない。
  以前の `/pr-verify` が手順 6b で残した `Decisions by kompiro` のコメントも答えに数える）
  「回答済み: …」と書く。回答済みでないものが手順 6b で聞く未決事項になる
- **情報のみ:** 読んでおけばよい補足

`None` / `N/A` なら「判断が必要な項目はありません」と書く。本文にこの節が無ければそう伝える。

### `Decisions by kompiro` のコメントの読み方

手順 6b は kompiro の答えを、1 行目が `Decisions by kompiro (via /pr-verify) head=<sha>:` のコメントで
PR に残す。答えとして読むのは、作者が kompiro の login（`gh api user --jq .login`）のコメントだけにする
（fork の PR では誰でも同じ文面を書ける）。同じ問いに複数の答えがあれば、いちばん新しいコメントの
ものを使う。For Reviewers 以外の問い（Issue の close、却下した指摘など）の答えも持つので、手順 6 で
「マージ前に決めてほしいこと」を集めるときも、答えがある問いは聞き直さない。

1 行目が `Hand-back by /pr-verify` のコメント（上の「実装セッションへの差し戻し」が残したもの）は `Decisions by kompiro`
ではないので、答えとしては読まない。代わりに、作者が kompiro の login の `Hand-back` のコメントでいちばん新しいものの
うち、末尾に `[change]` の印がある
行（kompiro が 6b で選んだ変更と、NO のときに挙げた点）を、`[change]` の答えと同じく「変更を確かめる項目」にし、そのコメントの
`head=`（行に `(from <sha>)` があればその SHA）から今の HEAD までの差分で直っているかを確かめる。印の無い行（gate の `reasons` から来た未解決のスレッド、失敗した
check、コンフリクト、rate limit が明けたあとの頼み直し）は差分では確かめず、手順 1 の `gate.sh` が PR から読み直す（HEAD を
変えずに片付くものもあるので）。`Hand-back` のあとの `Decisions by kompiro` のコメントでその変更を取り下げていれば、その項目は
確かめない。1 行目が `Hand-back (not delivered)` のコメントは送れなかったもので、読まない。

ただし答えは、そのコメントの `head=` の PR について出たものである。`head=` が今の HEAD と違えば、
その間の差分（下の compare）が問いの対象（選んだ選択肢を実装している箇所、確かめないまま進めた手動項目の
機能、却下した指摘の箇所など）に触れているかを見る。触れていれば答えを使わず、前の答えを添えて手順 6b で
聞き直す（後のコミットが別の選択肢に変えた、確かめる対象が変わった、など）。触れていなければ回答済みに
数える。`[change]` の答えはこの規則によらず、次の段落で確かめる（求めた変更が入れば差分は必ず対象に
触れるので）。

答えの行に `[change]` の印があるものは、PR の変更を求めた答えなので「変更を確かめる項目」にする。
コメントの `head=` から今の HEAD までの差分（`gh api repos/{owner}/{repo}/compare/<head=>...<headSha>`）に、
求めた変更が入っているかを確かめる。入っていれば「変更済み」として回答済みに数え、サマリにどのコミットで
入ったかを書く。入っていなければ未対応として手順 6 で扱う（6b を参照）。

compare が読めないとき、または読めても `status` が `ahead` / `identical` でないとき（force-push で
`head=` が今の HEAD の祖先でない、置き換え先の PR に写したコメント、など。三点の compare は merge base
からの差分なので、`head=` にあって後で消えたものが見えない）、`files` が 300 件に達しているとき（API が
変更ファイルの一覧を 300 件で切るので、問いの対象のファイルが漏れうる）は、どの答えも（`[change]` を含む）差分で
確かめたことにしない。
`gh pr diff` は base との差分なので、base に戻した箇所が見えず、確かめる根拠にならない。前の答えを添えて
手順 6b で聞き直す。
## 手順 4: Local review の傾向

本文の `<!-- local-review:v1 base=… head=… -->` から `<!-- /local-review -->` までの表を読み、
数字と所見で傾向を伝える。表を訳し直す必要はない。

- レビュアー別・重大度別の件数（例: engineering 26 件 / cli 1 件 / coderabbit 2 件、major 9・minor 15・trivial 4）
- 対応の内訳: `fixed in <sha>` / `declined: …` / `→ #<issue>`。fix のコミット数から何ラウンド回ったか
- **却下（declined）と先送り（→ #N）は全件、理由と一緒に日本語で挙げる。** kompiro の判断が
  入りうるのはここなので
- 指摘が集中した箇所や種類（例: 「設計書の節どうしの整合が多い」）
- 記録の `head=` が PR の HEAD と違えば、記録のあとに入ったコミットを `git log <head>..<PR head>`
  で見て、main の取り込みだけか、レビューされていない変更があるかを伝える
- 記録が HEAD を指していても、最後の指摘を直したコミットのあとに誰もレビューしていないことがある
  （High で CodeRabbit の PR レビューが最後に見たコミットが HEAD より古い、つまり手順 1 の
  `coderabbitReviewedHead` が `false` のとき、など）。そういうコミットが
  あれば、その diff を自分で読み、指摘が意図どおりに直っているか、新しい問題が入っていないかを
  所見として書く

記録が無い PR（High では任意）はそう書き、CodeRabbit のレビューとスレッドから同じ観点で傾向を伝える。

## 手順 5: 受け入れテストを preview で確かめる

**対象:** 変更ファイルに `docs/acceptance/*.md` か `packages/e2e/tests/*.spec.ts` が含まれ、かつ
app の preview がある PR。preview は次で調べる。

```bash
$S/preview-url.sh <pr>    # {"app":{"url","sha","matchesHead"}|null, "docs":…}
```

`app` が `null` なら（Preview workflow は `packages/app` / `packages/core` を変えた PR にしか
デプロイしない）この手順は行わず、「app の preview が無いため画面での確認は省いた」と書く。
`preview-url.sh` が JSON を出さずに失敗したら、preview が無いとは書かず、読み取りの失敗として
エラーを伝えて手順 5 を省く。
docs サイトだけの preview も対象外。`matchesHead: false` なら preview が PR の HEAD より古いので、
その旨をレポートの冒頭に書く。

### 5a. 何を確かめるか

PR が追加・変更した AT 記録を読み、確かめる項目を 2 種類に分ける。

- **手動項目:** AT の `## 手動確認` と、PR 本文 `## Manual Verification Checklist` の未チェック項目。
  AT の書き方の正本（`.claude/rules/acceptance.md`）では、手動項目は「マージ前に preview か
  ローカルで確かめられるもの」に限られ、入力（埋めた `.krs`、操作）と期待結果が書いてある
- **e2e spec:** PR が追加・変更した `packages/e2e/tests/*.spec.ts`（`✅ Automated` が指す spec のうち、
  この PR で変わったもの）

app の画面で確かめられない項目（VS Code 拡張、CLI、本番環境、kompiro が文書を読むこと など）は
「Playwright では確かめられない」として kompiro に残す。

### 5b. PR の checkout を用意する

PR の spec と fixture はそのブランチにしか無いので、HEAD を一時 worktree に出す。この worktree では
PR のコード（lockfile の依存、`playwright.config.ts`、fixture）が手元で動く。手順 1 の
`isCrossRepository` が `true`（fork からの PR）なら、checkout の前に AskUserQuestion で kompiro に
実行してよいかを聞き、断られたら手順 5 を省いてその旨を書く。

```bash
D=$($S/checkout.sh <pr>)          # .claude/worktrees/pr-verify/<pr>
OUT=$PWD/reports/pr-verify/<pr>   # 準備で決めた置き場。Bash の呼び出しをまたいで変数は残らない
rm -rf "$OUT" && mkdir -p "$OUT/specs" "$OUT/shots"
CFG=$PWD/$S/playwright.preview.config.mts
```

`$OUT` は実行のたびに作り直す。前回の実行の spec やスクショが残っていると、PR から消えた項目の spec が
新しい preview に対して走ったり、古いスクショがレポートと一緒に公開されたりする。`checkout.sh` か
`$OUT` の作り直しが失敗したら、手順 5 の残りは行わず、エラーを伝えて「画面での確認はできなかった」と書く。
同じ PR の検証は checkout も `$OUT` も 1 つを共有するので、同じ PR に対して並行して実行しない。

### 5c. 手動項目を操作してスクショを撮る

項目ごとに使い捨ての spec を `$OUT/specs/` に書く。ファイル名は `*.spec.ts` にする（Playwright は
既定でその名前のファイルしか拾わない。例: `M1-share-link.spec.ts`）。fixture は PR の checkout から
絶対パスで import する（`@playwright/test` をそこから解決させるため）。

```ts
import { test, expect } from "<D>/packages/e2e/fixtures/opfs.ts";
import { bootMemoryApp } from "<D>/packages/e2e/fixtures/boot.ts";
const OUT = process.env.PR_VERIFY_OUT!;

test("M1: <AT の項目名>", async ({ page, opfs }) => {
  await bootMemoryApp(page, opfs, KRS);                       // AT に埋められた .krs
  await page.screenshot({ path: `${OUT}/shots/M1-1-loaded.png` });
  // AT の操作を 1 つずつ行い、確認点ごとに撮る
  await page.screenshot({ path: `${OUT}/shots/M1-2-<確認点>.png` });
  await expect(/* 期待結果のうち機械で言えるもの */).toBeVisible();
});
```

fixture の使い方は `<D>/packages/e2e/fixtures/README.md` と、同じ領域の既存 spec を読んで合わせる
（project モードが要るなら `bootProjectApp`、ドリルダウンは `drill.ts` など）。`.krs` は AT に
埋められたものをそのまま使い、自分で書くときは文法を `docs/spec/syntax.md` で確かめる。

```bash
PR_VERIFY_E2E_DIR=$D/packages/e2e PR_VERIFY_TEST_DIR=$OUT/specs \
PR_VERIFY_BASE_URL=<app url> PR_VERIFY_OUT=$OUT \
  pnpm --dir $D/packages/e2e exec playwright test -c $CFG
```

撮ったスクショは Read で自分の目でも見て、期待結果と合っているかを判定する。見た目の項目は
assert が通っただけで「確認できた」としない。結果は項目ごとに **確認できた / 期待と違う /
確かめられなかった（理由）** のどれかにする。spec が自分の書き方のせいで落ちたのか、PR の不具合
なのかを切り分け、前者なら直して流し直す。

### 5d. PR が足した・変えた e2e テストを動画付きで流す

spec ファイルは多くのテストを抱えているので（`at-3563-first-run-experience.spec.ts` だけで 30 本以上）、
流すのは **PR の差分が触れた `test(...)` だけ**にする。PR の base（`gh pr view <pr> --json baseRefName`。
stack した PR では `main` ではない）を `B` として、`git -C $D fetch -q origin $B` のあと
`git -C $D diff origin/$B...HEAD -U0 -- <spec>` の hunk の行番号から、それを含む `test(` の開始行を
見つけ、`<spec>:<line>` で指定する。
`test.describe` の中の共通処理（`beforeEach`、ヘルパー）だけが変わったなら、その describe のテストを流す。

```bash
PR_VERIFY_E2E_DIR=$D/packages/e2e PR_VERIFY_BASE_URL=<app url> PR_VERIFY_OUT=$OUT/e2e \
  pnpm --dir $D/packages/e2e exec playwright test -c $CFG tests/<spec>.spec.ts:<line> …
```

テストごとに `$OUT/e2e/test-results/<test>/video.webm` と最後の画面の PNG が残り、結果は
`$OUT/e2e/results.json` に出る。Playwright の WebM は Safari などで再生できないので、レポートに
載せる前に MP4（H.264）へ変換する。変換後のほうがファイルも小さい。

```bash
$S/to-mp4.sh --dir $OUT/e2e     # 各 video.webm の隣に video.mp4 を書く
```
CI はローカルビルドに対して同じ spec をすべて流しているので、ここでは
「デプロイされた preview でも通るか」と「何が起きているかを動画で見せる」ことが目的になる。

### 5e. レポートを Artifact で公開する

Artifact を書く前に `artifact-design` スキルを読み込む。レポートは 1 枚の HTML ページで、日本語で書く。
ファイルの 1 行目には `<meta charset="utf-8">` を置く。公開時は Artifact が文書の骨組みを付けるので
無くても化けないが、`reports/pr-verify/<pr>/` の HTML を直接開いたときや、文字コードを伝えない
簡易サーバーで配信したときに日本語が化けるのを防ぐ。ページに載せる内容は次のとおり:

- 冒頭: PR 番号・タイトル・preview の URL と対象コミット（`matchesHead: false` ならその注意）、
  項目ごとの結果の一覧（確認できた / 期待と違う / 確かめられなかった / Playwright 対象外）
- 手動項目ごと: AT の項目文、行った操作、確認点ごとのスクショと所見
- e2e spec ごと: テスト名、結果、動画（`<video controls playsinline preload="metadata" poster="<最後の画面の PNG>"><source src="<….mp4>" type="video/mp4"></video>`。
  WebM は載せない。変換した MP4 は `ffprobe -show_entries stream=codec_name` でコーデックが `h264` であることを確かめる）
- 「期待と違う」があれば、何がどう違うかをスクショを指して書く

スクショと動画は `files` で一緒に公開し、HTML からは相対パスで参照する。ファイル 1 つあたり 15MB の
上限に注意する。公開したリンクを kompiro に渡す。

終わったら `$S/checkout.sh <pr> --remove` で worktree を消す（`reports/pr-verify/<pr>/` は残す）。

## 手順 6: マージしてよいかの意見

`wait` だった場合や手順に時間がかかった場合は、先に `$S/gate.sh <pr>` を実行し直す。`fix` に
変わっていれば手順 1 の差し戻しに、`closed` / `superseded` なら手順 1 のその判定の扱いに切り替える。
`wait` のままなら、その理由を意見の根拠に入れる。
`headSha` が手順 1 と違えば、確かめたあとにコミットが足されたので、チャットにそう 1 行書いて
手順 1 からやり直し、`headSha` を控え直す（以下の「手順 1 で控えた `headSha`」は控え直したものを
指す）。古い HEAD のまま先へ進んでも、OK のあとの手順 1 でマージを断ることになるので聞かない。

意見は **マージしてよい / 条件付き（kompiro の判断待ちの項目がある）/ マージしないほうがよい** の
どれかを最初に書き、根拠を 3〜5 点で添える。根拠には手順 1〜5 のうち判断に効いたもの（判断が必要な
For Reviewers の項目、却下・先送りした指摘、レビュー後の未レビュー変更、手順 5 の「期待と違う」、
残った手動項目、draft のまま、など）を挙げる。kompiro の判断が必要な項目は、意見とは別に
「マージ前に決めてほしいこと」として並べる。For Reviewers に書かれたものだけでなく、ほかの手順で
見つかった判断も集める。たとえば、却下・先送りした指摘をそのまま受け入れてよいか、この PR のマージで
役目を終える Issue（チェックリストが埋まっている など。PR の本文が参照している Issue に限る）を一緒に
close するか、Design Doc と実装のずれをどう扱うか、PR 本文の `## Manual Verification Checklist` の
未チェック項目のうち手順 5 で確認できなかったもの（手順 5 を行わなかった PR ではすべて。
`matchesHead: false` の preview でしか確かめていない項目を含む）を確かめないまま進めてよいか、
手順 5 で「期待と違う」だった項目を直させるか、手順 1 の `otherUnresolvedThreads`
と `coderabbitUnmarkedBodyFindings`。無ければ「特にありません」と書く。本文が参照していないが
役目を終えたように見える Issue（本文やルールから参照が消えた など）は、この skill では close しないので、
問いにせずサマリに「手で close を検討」として書く。

`risk: low` の PR は GitHub App（Low PR merger）が、draft でなく checks が通っていれば 10 分以内に自動で
マージする。この skill はそれを止めないので、未決事項がある Low の PR では「答える前にマージされることが
ある」と意見に添える。

### 6a. 検証サマリを開く

`mkdir -p "$OUT"` をしてから、手順 1〜6 の結果を `$OUT/summary.md` に日本語の Markdown で書く
（前回のファイルは上書きする。手順 5 を行わなかった PR では `$OUT` がまだ無い）。kompiro が最初に読むものから並べる:

1. 見出し: `PR #<pr> <タイトル>` と PR の URL、確かめた `headSha`
2. マージ意見と根拠
3. マージ前に決めてほしいこと（無ければ「特にありません」）
4. 手順 1 の判定と `reasons`（`proceed` 以外のとき）
5. 手順 2 の要約、手順 3 の For Reviewers、手順 4 の Local review の傾向
6. 手順 5 の検証レポートのリンクと項目ごとの結果（行わなかったならその理由）

エディタで Markdown のまま読むので、表は使わず見出しと箇条書きで書く。書いたら VS Code の CLI で
チャットの横のタブに開く:

```bash
OUT=$PWD/reports/pr-verify/<pr>
mkdir -p "$OUT" && test -s "$OUT/summary.md" &&
  [ -n "${VSCODE_IPC_HOOK_CLI:-}" ] && command -v code >/dev/null && timeout 10 code -r "$OUT/summary.md"
```

終了コードが 0 でなければ（VS Code の外で動いている、CLI の接続が切れている など）、同じ内容を
Artifact で公開してブラウザで開く。`artifact-design` スキルを読み込んでから 1 枚の HTML ページにし
（1 行目に `<meta charset="utf-8">`）、手順 5 でレポートを公開していればそのページの冒頭に載せて
同じ URL に公開し直す。無ければ新しいページとして公開する。公開したら Artifact の `open` で開く。

チャットには、サマリをどこに開いたか（ファイルのパスか Artifact のリンク）と意見の 1 行だけを書く。
AskUserQuestion のダイアログが出ているあいだはチャットの文章が見えないことがあるので、判断の材料は
サマリの側に置く。

### 6b. 未決事項を聞く

先に、手順 3 で「変更を確かめる項目」が未対応だったもの（求めた変更が差分に入っていない）を、
下の未決事項と同じやり方で聞く。選択肢は「変更を待つ」（変更）/「変更を取り下げる」（継続）。
実装セッションが変更をできないと返した場合などに、kompiro が答えを変えられるようにするため。
取り下げた答えは下の 1 で新しいコメントに残すので、次の実行では新しいほうが使われる。

未決事項は、6a の「マージ前に決めてほしいこと」のうち kompiro がまだ答えていないもの（手順 3 で
「判断が必要」かつ「回答済み」でない For Reviewers の項目と、ほかの手順で見つかった判断）。1 つでも
あれば、マージするかを聞く前に AskUserQuestion で聞く。draft の PR でも聞く（答えは実装セッションの
材料になる）。

- 1 つの未決事項を 1 つの質問にする。1 回の AskUserQuestion には 4 問までなので、多ければ続けて呼ぶ
- 質問はダイアログだけを見て答えられるように書く: PR 番号、何についての問いか、PR が今どうして
  いるか。細部（コード片、比較）が要る問いは、サマリの該当箇所を見るよう質問文に書く
- 選択肢ごとに、PR をそのまま進めるもの（**継続**）、PR の変更を求めるもの（**変更**）、今は決めない
  もの（**保留**）のどれかを自分で控えておく。For Reviewers の問いは PR が挙げた選択肢を使い、PR が
  実装しているものが継続、ほかは変更。著者の推奨を先頭に置いて「（推奨）」を付ける。選択肢の無い
  「OK?」型は「PR のとおりでよい」（継続）/「変えてほしい」（変更。中身は Other で書いてもらう）
- ほかの手順で見つかった問いの例: 却下・先送りした指摘は「受け入れる」（継続）/「直してほしい」（変更）、
  未解決のスレッドは「対応不要で進める」（継続）/「直してほしい」（変更）、確かめられなかった手動項目は
  「確かめないまま進める」（継続）/「preview の再デプロイを待つ」（保留）、「期待と違う」だった項目は
「直してほしい」（変更）/「このまま進める」（継続）、Issue の close は
  「一緒に close する」/「残す」（どちらも継続。マージのあとに使う）
- ダイアログを閉じた、Other で継続とも変更とも読めない答え（「後で決める」など）も保留にする

答えを受け取ったら、まず `$S/gate.sh <pr>` を実行し直し、答え（保留を除く）を PR に残してから
判定で分ける。答えを残すのは、PR がマージされていても、HEAD が変わっていても同じ:

1. 答えた問いを PR に英語のコメントで残す。1 行目を `Decisions by kompiro (via /pr-verify) head=<手順 1 で控えた headSha>:`
   にし、問いごとに問いの要点と答えを 1 行ずつ、変更を選んだ行には末尾に `[change]` を付けて書く
   （`gh pr comment <pr> --body-file <ファイル>`）。保留の問いは書かない（次の実行でまた聞く）
2. サマリの「マージ前に決めてほしいこと」に答えを書き足す（6a で Artifact にしたなら公開し直す）
3. gate の判定で分ける。`closed` なら手順 1 の `closed` と同じ扱いにする。マージ済みで変更が選ばれて
   いれば、マージ後の追いかけの PR を頼む英語の依頼文も渡す。`fix` は手順 1 の `fix` の扱いにし、
   依頼文には gate の `reasons` に加えて、kompiro が選んだ変更も入れる。`superseded` は手順 1 の扱いに
   し、1 のコメントを置き換え先の PR にも同じ文面で残す（置き換え先の `/pr-verify` が読めるように）。`headSha` の変化は手順 6 の冒頭と同じ扱い（答えは 1 で残したので、やり直しでは手順 3 の読み方で読む。新しいコミットが問いの対象に触れていなければ聞き直さず、触れていれば聞き直す）
4. それ以外では、次のうち最初に当てはまるもので終わり方を決める
   - 変更が 1 つでも選ばれた（「変更を待つ」を含む）: サマリの意見を「マージしないほうがよい」に
     書き換え（Artifact なら公開し直す）、手順 1 の `fix` と同じ形で、実装セッションに貼れる英語の
     依頼文を渡して終わる（宛先の実装セッションが決まれば、上の「実装セッションへの差し戻し」で送る）。
     マージするかは聞かない。直したら `/pr-verify` をもう一度実行するよう添える（手順 3 が変更を確かめる）
   - 保留が残った: サマリに未決として残し、決まったら `/pr-verify` をもう一度実行するよう伝えて終わる
   - すべて継続: 6c へ進む

### 6c. マージするかを聞く

draft の PR はマージできない（ready にすると CI と CodeRabbit が走るので、ready にするのは実装
セッションの手順）。draft なら（`risk: low` も含む）、マージは ready にしてから `/pr-verify` を
もう一度実行するよう添えて終わる。マージするかは聞かない。

draft でない `risk: low` の PR は Low PR merger がマージするので、マージするかは聞かない。
PR 本文のチェックリストにはチェックを入れない（Low PR merger がどの HEAD をマージするかはこの skill の
あとで決まるので、確かめた HEAD と結び付けられない）。手順 5 で確認できた項目は、確かめた `headSha` と
一緒にサマリに書いたままにし、checks が通れば Low PR merger がマージすると伝えて終わる。
「一緒に close する」と答えた Issue があれば、マージのあとに `/pr-verify` をもう一度実行すると手順 1 の
`closed` で close されることも伝える。

それ以外なら AskUserQuestion でマージするかを聞く（選択肢: マージする / マージしない）。質問文には
PR 番号、意見の 1 行、サマリの場所を入れる。

### kompiro が OK したとき

1. `$S/gate.sh <pr>` を実行し直す。`proceed` で、`headSha` が手順 1 で控えたものと同じなら次へ進む。
   それ以外ではマージしない。`closed` ならすでにマージかクローズされている（Low PR merger が
   マージした、など）ので、手順 1 の `closed` と同じ扱いにして終わる。`superseded` なら置き換え先を伝えて終わる。`fix` なら
   差し戻しに切り替える。`wait` なら理由を伝えて、待ってから実行し直すか kompiro に聞く。
   `headSha` が変わっていれば、確かめていないコミットが入っているのでそう伝えて終わる
2. 手順 5 で **確認できた** 項目だけ、PR 本文の `## Manual Verification Checklist` の対応する
   `- [ ]` を `- [x]` にする。本文を `gh pr view <pr> --json body --jq .body > $OUT/body.orig.md` で
   取り出して `$OUT/body.md` に写し、その行だけを変えて `gh pr edit <pr> --body-file $OUT/body.md` で戻す。ほかの行は
   変えない（手順 5 を行わなかった PR はこの手順を飛ばす）。preview が `matchesHead: false` だった
   ときは、確かめたのは HEAD より古いデプロイなのでチェックを入れない。確かめられなかった項目と
   古い preview で確かめた項目は、6b で kompiro が「確かめないまま進める」と答えているので、ここでは
   聞き直さない
3. 本文を変えたら Review tier が本文を検査し直す。編集の直後は前の結果が残って見えるので、
   `gh pr checks <pr> --json name,bucket,startedAt` で Review tier の `startedAt` が編集より後に
   なったのを確かめてから `$S/gate.sh <pr>` をもう一度実行し、`proceed` になるまで待つ（`wait` の
   あいだは少し置いて実行し直す。ほかの判定なら 1 と同じ扱い）。本文を変えていなければ 1 の結果の
   ままでよい。このときの `headSha` が控えたものと違えば、入れたチェックは古い HEAD を確かめた結果
   なので、チェックを取り消して（下の「チェックの取り消し」）そう伝えて終わる。`fix` など
   `proceed` 以外で終わるときも、2 でチェックを入れていれば取り消してから終わる
4. `gh pr merge <pr> --squash --match-head-commit <headSha>` でマージする（リポジトリは squash のみ
   許可、ブランチは自動削除される）。`--match-head-commit` は、確かめたあとに push があれば
   マージを拒否させるために付ける。拒否されたら、2 でチェックを入れていれば取り消してから、そう伝えて
   終わる
5. マージできたことを `gh pr view <pr> --json state,mergedAt` で確かめて伝える。kompiro が
   「一緒に close する」と答えた Issue（この実行の 6b か、以前の `Decisions by kompiro` のコメント）が
   あれば、ここで `gh issue close` する（PR の本文が参照している Issue に限る）

**チェックの取り消し:** 2 で入れたチェックを残したまま終わらない。`gh pr edit <pr> --body-file
$OUT/body.orig.md` で編集前の本文に戻す。編集のあとに本文が別の理由で変わっていれば（今の本文と
`$OUT/body.md` が違う）、戻さずに今の本文の、2 で変えた行だけを `- [ ]` に戻す。取り消したことを
kompiro に伝える。

### kompiro が NO と言ったとき

何もせずに終わる。直してほしい点を言われたら、手順 1 と同じ形で実装セッション向けの英語の依頼文を渡す（宛先の
実装セッションが決まれば、上の「実装セッションへの差し戻し」で送る）。
