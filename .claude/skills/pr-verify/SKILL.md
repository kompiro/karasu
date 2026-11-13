---
name: pr-verify
description: >
  Check a PR for kompiro before kompiro merges it, and report in Japanese: stop
  early and hand back to the implementing session when CodeRabbit left an unresolved
  finding, a required check failed, or the PR conflicts with main; otherwise translate
  the Summary and For Reviewers sections, point out what needs kompiro's decision,
  summarise the local review record, drive the PR's Cloudflare preview with Playwright
  for its acceptance items (screenshots, and video of the e2e specs the PR adds or
  changes) into an Artifact report, give a merge opinion, and on kompiro's OK tick the
  verified checklist items and squash-merge. Run it with a PR number. Trigger when the
  user says: "PR を検証して", "マージしていいか見て", "マージ前チェック", "PR #N を確認",
  "pr-verify", "verify PR", "is this PR ready to merge", or names a PR and asks whether
  to merge it, even without saying "verify".
---

# PR Verify

kompiro がマージする前に PR を確かめ、判断材料を日本語で渡す。PR 番号を 1 つ受け取る
（`/pr-verify 3721`）。番号が無ければ聞く。

## 到達状態

終わったとき、次のどちらかが成り立っている。

- **差し戻した:** 手順 1 で直すべき点が見つかり、kompiro に日本語で理由を伝え、実装セッションに
  貼れる英語の依頼文を渡した。手順 2 以降には進んでいない
- **置き換え先を案内した:** 別の open PR がこの PR を置き換えていたので、直させずに置き換え先を伝えた
- **判断を渡した:** 手順 2〜4 の日本語の要約、手順 5 の検証レポート（対象の PR のみ。Artifact の
  リンク）、手順 6 のマージ意見を伝えた。kompiro が OK と言った場合に限り、確かめた
  チェックリスト項目にチェックを入れ、squash でマージした

マージは kompiro がこのセッションで明示的に OK したときだけ行う。意見が「マージしてよい」でも、
返事を待たずに `gh pr merge` を実行しない。

## 準備

スクリプトはすべて `.claude/skills/pr-verify/scripts/` にあり、リポジトリの checkout（依存が
入っているもの）から実行する。以下 `S=.claude/skills/pr-verify/scripts` とする。

kompiro への文章は日本語で書き、em dash（—）は使わない（読点・コロン・括弧で代える）。
「人間のレビュー」ではなく「kompiro の判断」のように名前で書く。

## 手順 1: 差し戻すべきか

```bash
$S/gate.sh <pr>
```

1 行の JSON が出る。`verdict` で分ける。

- **`closed`**: PR はすでにマージ済みかクローズ済み。そう伝えて終わる
- **`superseded`**: 別の open PR（`supersededBy`）の本文が、この PR を置き換えると書いている。この PR を
  直させても無駄になるので、実装セッションへの依頼文は出さない。置き換え先の PR の本文から、この PR を
  いつ閉じる段取りか（例: 置き換え先のマージ後）を読んで伝え、置き換え先を `/pr-verify` するよう勧めて
  終わる。`reasons` にほかの問題（コンフリクトなど）があっても、置き換え先で解消済みかどうかを書くに留める
- **`fix`**: 実装セッションの作業が残っている。`reasons` と、その根拠（`unresolvedThreads` の各指摘、
  `coderabbit.bodyFindingIds` / `threadReplyUrls`、`failedChecks` の名前とリンク、コンフリクト、
  CodeRabbit の rate limit が明けてレビューを頼み直す必要があること）を
  kompiro に日本語で短く伝える。失敗した check はリンク先のログ（`gh run view <run-id> --log-failed`）
  から失敗の要点を 1〜2 行で添える。続けて、実装セッションへそのまま貼れる英語の依頼文を
  コードブロックで渡す（PR 番号、直すもの、各リンク）。**ここで終わる。** 手順 2 以降は行わない。
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
  いれば（`gh pr view <pr> --json comments,reviews` で確認。`--comments` は `--json` と併用できない）
  「回答済み: …」と書く
- **情報のみ:** 読んでおけばよい補足

`None` / `N/A` なら「判断が必要な項目はありません」と書く。本文にこの節が無ければそう伝える。

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
OUT=$PWD/reports/pr-verify/<pr>   # gitignore された置き場（reports/README.md）
rm -rf "$OUT" && mkdir -p "$OUT/specs" "$OUT/shots"
CFG=$PWD/$S/playwright.preview.config.mts
```

`$OUT` は実行のたびに作り直す。前回の実行の spec やスクショが残っていると、PR から消えた項目の spec が
新しい preview に対して走ったり、古いスクショがレポートと一緒に公開されたりする。

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
変わっていれば手順 1 の差し戻しに切り替える。`wait` のままなら、その理由を意見の根拠に入れる。
`headSha` が手順 1 と違えば、確かめたあとにコミットが足されたので、そのことを伝えて新しい HEAD で
やり直すかを kompiro に聞く。やり直すなら手順 1 から始め、`headSha` を控え直す（以下の「手順 1 で
控えた `headSha`」は控え直したものを指す）。

意見は **マージしてよい / 条件付き（kompiro の判断待ちの項目がある）/ マージしないほうがよい** の
どれかを最初に書き、根拠を 3〜5 点で添える。根拠には手順 1〜5 のうち判断に効いたもの（判断が必要な
For Reviewers の項目、却下・先送りした指摘、レビュー後の未レビュー変更、手順 5 の「期待と違う」、
残った手動項目、draft のまま、など）を挙げる。kompiro の判断が必要な項目は、意見とは別に
「マージ前に決めてほしいこと」として並べる。For Reviewers に書かれたものだけでなく、ほかの手順で
見つかった判断も集める。たとえば、却下・先送りした指摘をそのまま受け入れてよいか、この PR のマージで
役目を終える Issue（本文やルールから参照が消える、チェックリストが埋まっている など）を一緒に close するか、
Design Doc と実装のずれをどう扱うか。無ければ「特にありません」と書く。

`risk: low` の PR は GitHub App（Low PR merger）が自動でマージするので、その旨を添える。

draft の PR はマージできない（ready にすると CI と CodeRabbit が走るので、ready にするのは実装
セッションの手順）。draft なら意見までを伝え、マージは ready にしてから `/pr-verify` をもう一度
実行するよう添えて終わる。AskUserQuestion は出さない。

draft でなければ、最後に AskUserQuestion でマージするかを聞く（選択肢: マージする / マージしない）。

### kompiro が OK したとき

1. `$S/gate.sh <pr>` を実行し直す。`proceed` で、`headSha` が手順 1 で控えたものと同じなら次へ進む。
   それ以外ではマージしない。`closed` ならすでにマージかクローズされている（Low PR merger が
   マージした、など）のでそう伝えて終わる。`superseded` なら置き換え先を伝えて終わる。`fix` なら
   差し戻しに切り替える。`wait` なら理由を伝えて、待ってから実行し直すか kompiro に聞く。
   `headSha` が変わっていれば、確かめていないコミットが入っているのでそう伝えて終わる
2. 手順 5 で **確認できた** 項目だけ、PR 本文の `## Manual Verification Checklist` の対応する
   `- [ ]` を `- [x]` にする。本文を `gh pr view <pr> --json body --jq .body > $OUT/body.md` で
   取り出し、その行だけを変えて `gh pr edit <pr> --body-file $OUT/body.md` で戻す。ほかの行は
   変えない。確認できなかった項目が残るなら、マージ前に kompiro にそのまま進めてよいか確かめる
   （手順 5 を行わなかった PR はこの手順を飛ばす）。preview が `matchesHead: false` だったときは、
   確かめたのは HEAD より古いデプロイなのでチェックを入れず、「<preview の sha> で確認」と kompiro に
   伝えてそのまま進めてよいか確かめる
3. 本文を変えたら Review tier が本文を検査し直す。編集の直後は前の結果が残って見えるので、
   `gh pr checks <pr> --json name,bucket,startedAt` で Review tier の `startedAt` が編集より後に
   なったのを確かめてから `$S/gate.sh <pr>` をもう一度実行し、`proceed` になるまで待つ（`wait` の
   あいだは少し置いて実行し直す。ほかの判定なら 1 と同じ扱い）。本文を変えていなければ 1 の結果の
   ままでよい
4. `gh pr merge <pr> --squash --match-head-commit <headSha>` でマージする（リポジトリは squash のみ
   許可、ブランチは自動削除される）。`--match-head-commit` は、確かめたあとに push があれば
   マージを拒否させるために付ける
5. マージできたことを `gh pr view <pr> --json state,mergedAt` で確かめて伝える

### kompiro が NO と言ったとき

何もせずに終わる。直してほしい点を言われたら、手順 1 と同じ形で実装セッション向けの英語の依頼文を渡す。
