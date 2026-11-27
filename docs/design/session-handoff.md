# 実装・レビュー・検証のセッションが直接やりとりする

- **日付**: 2026-11-27
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3920](https://github.com/kompiro/karasu/issues/3920)
  - 関連 Issue: [#3896](https://github.com/kompiro/karasu/issues/3896)（Design PR #3914。kompiro に届く問いを減らす側）
  - 関連 ADR: [ADR-3286](../adr/3286-risk-based-review-tiers.md)（判断の根拠を PR に残す）、[ADR-3342](../adr/3342-ready-gate-local-review.md)（CLI のレビューが済んでいない PR を ready にさせない）
  - 関連 TPL: [TPL-3920](../test-perspectives/TPL-3920-session-message-is-a-wake-up-not-a-record.md)（この PR で起こす proactive TPL）、[TPL-3385](../test-perspectives/TPL-3385-consumer-of-a-signal-the-producer-stops-emitting.md)、[TPL-2909](../test-perspectives/TPL-2909-pending-items-need-stable-ids-not-a-moving-window.md)
  - コード: `.claude/skills/pr-verify/SKILL.md`、`.claude/skills/coderabbit-converge/SKILL.md`、`docs/process/review.md`、`scripts/coderabbit/review-state.ts`、`scripts/coderabbit/ready-gate.sh`、`scripts/review/local-review-record.ts`、`.claude/settings.json`（UserPromptSubmit の hook）

## 背景・課題

`/pr-verify` は、PR に実装セッションの作業が残っていると分かったとき、実装セッションに貼れる英語の依頼文を
kompiro に渡して終わる。kompiro はその文を実装セッションに貼り、直し終わるのを待って、`/pr-verify` を
もう一度実行する。

この往復で kompiro がしているのは、同じマシンの Claude Code セッションのあいだで文を運ぶことだけである。
判断は何もしていない。PR 1 本につき差し戻しが 1〜2 回あると、kompiro はセッションを行き来して待つことに
なる。

kompiro は、1 つの Issue を 3 つのセッションで進めたい。

| 役割     | 名前             | すること                                                         |
| -------- | ---------------- | ---------------------------------------------------------------- |
| 実装     | `impl-<Issue>`   | 実装、コミット、PR の作成、CodeRabbit のラウンド（High）         |
| レビュー | `review-<Issue>` | PR を作る前のローカルレビュー（`docs/process.md` 手順 8・9）     |
| 検証     | `verify-<Issue>` | `/pr-verify`（マージ前の確認と、kompiro の答えを受けてのマージ） |

Claude Code には、同じマシンのセッション同士がメッセージを送り合う仕組み（`ListAgents` / `SendMessage`）がある。
名前に Issue 番号が入っていれば、どの PR がどのセッションのものかが名前から分かり、文を運ぶ部分を
セッション同士で済ませられる。

## 現状（インベントリ）

### PR を作る前のローカルレビュー

- `docs/process.md` 手順 8: base との差分に、実装の文脈を持たない新しい subagent で `/engineering:code-review` を
  当てる。直したら修正で触れたファイル全体にもう一度当てる（3 回まで）
- 手順 9: 同じ差分に CodeRabbit CLI を 1 回だけ当てる。直したあとに回し直さない
- どちらも今は実装セッションが自分の subagent と Bash で行う。指摘への対応（直す・理由を返して却下する・Issue に
  回す）は実装セッションが決め、手順 10 で PR 本文のローカルレビューの記録に書く
- `gh pr ready` のゲート（ADR-3342）は、CLI が `~/.coderabbit/reviews/` に残したレビューのうち、レビューした
  コミットが PR の head の祖先で base にまだ無いものを探す。どのセッションが CLI を走らせたかは見ないので、
  同じマシンの別のセッションが同じブランチに当てたレビューも「済み」と数える

### 依頼文を kompiro に渡して終わる箇所（`pr-verify`）

| 場所                                                         | 依頼文の中身                                      |
| ------------------------------------------------------------ | ------------------------------------------------- |
| 手順 1 `fix`                                                 | gate の `reasons` と根拠のリンク                  |
| 手順 6 の冒頭で gate をやり直して `fix` になったとき         | 手順 1 `fix` と同じ                               |
| 6b の 3（gate が `fix`）                                     | gate の `reasons` と、kompiro が選んだ変更        |
| 6b の 3（マージ済みで変更が選ばれた）                        | マージ後の追いかけの PR を頼む依頼                |
| 6b の 4（変更が 1 つでも選ばれた）                           | 手順 1 `fix` と同じ形。kompiro が選んだ変更を含む |
| 「kompiro が OK したとき」の 1・3（gate をやり直して `fix`） | 手順 1 `fix` と同じ                               |
| 「kompiro が NO と言ったとき」                               | kompiro が挙げた直す点                            |

これらに共通するのは「依頼文を kompiro に渡して終わる」ことなので、設計はこの 1 つの条件で書き、箇所を
数え上げない。

### 実装セッションが PR を kompiro に渡す時点

- High: `coderabbit-converge` の到達状態は「人間に渡せる」と「人間の判断待ちで止まっている」の 2 つ。
  止まったときの `gate.sh` の判定は理由で変わる。スレッドで質問したなら未解決のスレッドが残って `fix`、
  CLI の指摘への質問はトップレベルのコメントなので判定を変えない、CodeRabbit のレビューが一度も無ければ
  `wait`。どれでも kompiro の判断が要ることは同じである。「人間に渡せる」で終わる直前に、converge は Review tier を
  走り直させる
- Medium: CodeRabbit のラウンドが無い。`docs/process/review.md` が kompiro に渡す直前の Review tier の走り直しを
  求めるのは、裏付けの Design Doc の文面で Medium になった PR だけである
- Design: CodeRabbit がレビューする。`gate.sh` は High と同じく、レビューが 1 つも無いあいだは `wait`、未解決の
  スレッドがあれば `fix` を返す。走り直しは求められていない
- Low: Low PR merger がマージするので、`/pr-verify` は要らない

### PR のコメントを読むもの

- `scripts/coderabbit/review-state.ts` の `bodyFindingIds` は、CodeRabbit 以外のコメントに
  `cr-comment:v1:<id>` があれば、その指摘を答え済みと数える（`ANSWERED_FINDING_ID`）。`gh` は kompiro の
  アカウントで書くので、差し戻しのコメントにこの形の文字列があると、gate の `fix` の理由から指摘が消える
- `pr-verify` 手順 3 は、kompiro の login のコメントを For Reviewers の答えとして読む
- ほかに PR のコメントを読むもの（`low-pr-merger.ts`、Review tier）は、新しい種類のコメントを読まない

### セッション間メッセージで分かっていること

Claude Code のドキュメント（Message your other Claude Code sessions、Manage sessions、CLI reference）と、
`SendMessage` / `ListAgents` の説明から:

- 送り先はセッションの名前で指す。ドキュメントにある名前の付け方は `/rename`、起動時の `--name`（`-n`）、
  セッション一覧での `Ctrl+R`、VS Code 拡張の「Rename Session Tab」で、どれも利用者の操作である
- 付けていないセッションには `karasu-9b` のような名前（ディレクトリ名と 2 文字）が自動で付き、それも宛先に
  なる。自分の名前は `ListAgents` の 1 行目で分かる
- 同じ名前のセッションが 2 つあると、名前だけでは送れない。一覧の各行には `[1c58dd]` のような ref が付くが、
  使えるのは直前に一覧かエラーで読んだ ref だけである
- 受け取ったメッセージには送り手の名前（`from`）が付く
- 待機中のセッションにメッセージが届くと、新しいターンが自動で始まる。作業中なら次のツール呼び出しのときに届く
- 送り手と受け手の権限モードの組み合わせで、メッセージが承認待ちになる。default・auto・`acceptEdits`・
  `dontAsk` 同士なら届く。片方が `bypassPermissions`（と、bypass を使える端末での plan mode）だと承認待ちに
  なり、5 分（`dialogExpiry`）で消える
- 受け取りは設定 `crossSessionInbound`（`accept` / `hold` / `refuse`）で変えられる
- `SendMessage` の `notify_when_idle: true` で、相手が次に待機状態になったとき（か終了したとき）に通知が 1 回届く

ドキュメントに無く、手元の Claude Code 2.1.329 で確かめたこと:

- UserPromptSubmit の hook が `{"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "sessionTitle": "<名前>"}}`
  を返すと、`--name` と同じ処理（名前が重なったときの扱いを含む）でセッションの名前が変わる。`--settings` で
  この hook だけを入れ、prompt `/impl 77777` で一時ディレクトリのプロジェクトのスキル `impl` を呼んだ `claude -p` で、
  `ListAgents` の 1 行目が「ほかのセッションがこのセッションに送るときの名前」として `impl-77777` を示した
- hook が付けた名前は、そのセッションを `--resume` で再開しても残る（hook を入れずに再開して確かめた）。ref は
  再開で変わる
- 組み込みの `/code-review` は `review` を別名に持つ。`/review <N>` は組み込みのレビューを始めうるので、起動
  スキルの名前に使えない。`impl` と `verify` は組み込みの名前にも別名にも無い
- `claude --bg -n <名前> "<prompt>"` で、名前を付けたセッションをバックグラウンドで起動できる（`claude attach` で
  開く）
- VS Code 拡張の設定（`claudeCode.*`）に、名前の付け方を変える項目は無い

## 制約・前提

- **判断は kompiro に残す。** 未決事項（For Reviewers など）への答えとマージの OK は、今と同じく kompiro が
  検証セッションで答える。自動にするのは、レビューの依頼と、「直す → 確かめ直す」の往復だけ。
- **メッセージは記録にならない。** 後から読み返せず、セッションが終われば消える。差し戻しの理由は PR に残す
  （TPL-3920）。レビューの指摘と対応を PR の本文に残すと決めた ADR-3286 と同じ扱いにする。
- **承認待ちで消えたメッセージには気づけない。** 受け手が承認待ちにしたメッセージは 5 分で消え、送り手には
  知らせが来ない。前提の設定（下）で承認待ちにならないようにし、送ったセッションは毎回 kompiro に 1〜2 行で
  「何をどこに送ったか」を知らせる。返事が来なければ kompiro が気づける。
- **相手が見つからないときは今と同じに戻る。** 宛先の名前が一覧に無い、同じ名前が 2 つある、送信が失敗した、
  などのときは今の手順（実装セッションが自分でレビューする、依頼文を kompiro に渡す）で進める。メッセージが
  使えないことで、今より悪くはならない。
- **権限を回避させない。** あるセッションで拒否された操作を、別のセッションに頼まない（Claude Code 自体の
  決まり）。依頼の中身は今と同じで、レビューと PR の修正だけである。
- **ドキュメントに無い振る舞いに頼りすぎない。** hook の `sessionTitle` はドキュメントに無いので、版が変わると
  効かなくなりうる。効かなければ自動の名前のままになり、規約の外のセッションとして今の手順で動く。起動スキルは
  名前が付いたかを自分で確かめ、付いていなければ kompiro に `/rename` を頼む。
- **同じマシンに限る。** 別のマシンやクラウドのセッションは out of scope（Remote Control が要り、返事が届く
  保証も無い）。
- hane（`/hane:start-dev` など）への展開は out of scope。karasu の skill・hook と `docs/process/review.md` で試す。

## 検討した選択肢

名前の付け方（A〜C）と、宛先の決め方（案1〜6）を分けて比べる。

### 名前の付け方

- **A: 起動スキルを打つと hook が名前を付ける（採用）。** kompiro は新しいセッションで `/impl 3920`・
  `/local-review 3920`・`/verify 3920` のどれかを打つ。UserPromptSubmit の hook がその prompt を読んで
  `sessionTitle` を返し、スキルがその役割の手順を始める。VS Code のセッションでも端末でも同じに動く。kompiro が
  打つのはスキルだけで、名前を別に付ける手間は無い
- **B: kompiro が `/rename` か `claude -n` で付ける。** ドキュメントにある方法だけで済むが、Issue ごとに 3 回
  名前を打つことになる。A が効かないときの戻り先として残す
- **C: 実装セッションがほかのセッションを `claude --bg -n` で起動する。** kompiro がセッションを開く手間も
  無くなるが、起動したセッションは VS Code のパネルに出ず、`claude attach` で開くまで kompiro から見えない。
  kompiro に問いを出す検証セッションには向かない。レビューセッションだけをこの形にするかは未解決の問い 4

### 案1: 役割と Issue 番号でセッションの名前を決める

セッションの名前を `impl-<N>`・`review-<N>`・`verify-<N>`（`N` は作業の Issue 番号）にし、宛先を名前の規約から
決める。

- 実装セッションは自分の名前から `N` を知り、`review-<N>` と `verify-<N>` に送る
- レビューセッションと検証セッションは自分の名前から `N` を知り、`impl-<N>` に返す。kompiro が `/pr-verify` を
  直接打ったときも宛先が分かる
- 名前は役割と Issue で決まるので、自動の名前のように別のセッションへ使い回されない。同じ Issue の Design PR と
  実装 PR は同じ `impl-<N>` が順に作るので、受け手は届いた依頼が今の作業ブランチのものかを確かめる

### 案2: 実装セッションの名前を PR に書いておく

実装セッションが自分の名前を PR の本文かコメントに書き、検証セッションはそれを読んで送る。

- 自動の名前は再開や再起動で同じになる保証が無く、2 文字で区別されるので後から別のセッションに付く。PR に古い
  名前が残り、関係の無いセッションに届くおそれがある
- PR に、セッションという PR と関係の無い情報が残る

### 案3: 検証セッションが自分の名前を手元のファイルに残す

検証セッションが `/pr-verify` を始めるたびに、自動の名前を git の共通ディレクトリのファイルに書き、実装
セッションがそれを読んで送る。

- `.git` の中への書き込みは Claude Code が守るパスに当たり、auto mode でも承認を求められうる。kompiro が
  いないあいだに始まった `/pr-verify` がそこで止まる
- 届くのは検証セッションへの向きだけで、検証セッションから実装セッションへの宛先は、届いたメッセージの `from` に
  頼る。kompiro が `/pr-verify` を直接打ったときは返せない
- 自動の名前は 2 文字で区別されるので、ファイルが古いと関係の無いセッションに届く

### 案4: 検証セッションだけに `/rename karasu-review` で決まった名前を付ける

この Design Doc の最初の版の案。実装セッションは `karasu-review` に送り、検証セッションは `from` に返す。
案3 と同じく、kompiro が `/pr-verify` を直接打ったときは返せず、レビューのセッションを分けることもできない。

### 案5: PR のコメントだけでやりとりする

すべてのセッションが PR のコメントをポーリングする。記録が残り、マシンを選ばない。ただし待ち時間が長くなり、
ポーリングのループを回し続けることになる。PR を作る前のローカルレビューには使えない。

### 案6: レビューも検証も実装セッションの subagent で済ませる

ローカルレビューは今そうしている。`pr-verify` は kompiro の答えを受け取り、マージする skill なので、
kompiro が見ているセッションで動く必要がある。

## 比較

| 観点                                        | 案1                        | 案2                     | 案3                    | 案4                         | 案5         | 案6      |
| ------------------------------------------- | -------------------------- | ----------------------- | ---------------------- | --------------------------- | ----------- | -------- |
| kompiro の手間                              | 起動スキルを打つ（A）      | なし                    | なし                   | セッションを作るたびに 1 回 | なし        | なし     |
| 誤った宛先に届くおそれ                      | 少ない（受け手が確かめる） | ある（PR に残り続ける） | ある（ファイルが古い） | 少ない                      | 無い        | 無い     |
| `/pr-verify` を直接打ったとき               | 返せる                     | 返せる                  | 今と同じ               | 今と同じ                    | 返せる      | 対象外   |
| レビューを別のセッションにできるか          | できる                     | できない                | できない               | できない                    | PR の後だけ | できない |
| `.git` への書き込みで承認を求められるおそれ | 無い                       | 無い                    | ある                   | 無い                        | 無い        | 無い     |
| 待ち時間                                    | すぐ                       | すぐ                    | すぐ                   | すぐ                        | ポーリング  | すぐ     |

## 現時点の方針

**名前は A、宛先は案1 を採用する。** kompiro は役割ごとに起動スキルを打つだけで名前が付き、3 つの役割の
どの向きにも宛先が名前の規約だけで決まる。kompiro が `/pr-verify` を直接打ったときも差し戻せる。名前が
付いていなければ今の手順に戻るだけである。記録は PR に置き、メッセージは起こす合図にだけ使う。

### 名前の規約と起動スキル

- 名前は `<役割>-<Issue 番号>`。役割は `impl`・`review`・`verify` の 3 つ。区切りはハイフンで、空白を入れない
  （`claude -n impl-3920` で引用符が要らず、一覧の行で名前の境目がはっきりする）
- Issue 番号は、作業の起点の Issue（ブランチと PR が `Closes` / `Refs` で指す Issue）
- 起動スキルは `/impl <N>`・`/local-review <N>`・`/verify <N>` の 3 つ（karasu の `.claude/skills/`）。レビューの
  スキルだけ名前が役割と違うのは、`/review` が組み込みの `/code-review` の別名だからである
- hook（`.claude/settings.json` の UserPromptSubmit）は、prompt の前後の空白と改行を除いた全体が
  `/(impl|local-review|verify) #?<数字>` のときだけ、`impl-<数字>`・`review-<数字>`・`verify-<数字>` を
  `sessionTitle` で返す。それ以外の prompt では何も返さない。hook はネットワークを使わない。今の名前が
  すでに別の役割の規約の名前なら（`impl-3920` のセッションで `/verify 3920` を打った、など）、名前を変えずに何も
  返さない。hook の入力（ドキュメントにあるのは `session_id`・`transcript_path`・`cwd`・`permission_mode`・
  `hook_event_name`・`prompt`）に今の名前は無いので、`transcript_path` の最後の
  `{"type":"custom-title","customTitle":"<名前>"}` の行から読む（2.1.329 で、hook と `/rename` が付けた名前は
  この形で transcript に残る。ドキュメントには無い）。その行が無ければ名前は付いていないとみなす
- 起動スキルは最初に `ListAgents` の 1 行目で自分の名前を確かめる。`<役割>-<N>` でなければ、送らずに今の手順で
  進み、kompiro に理由を伝える
  - hook が効かなかったとき（名前が自動のまま）: kompiro に `/rename <役割>-<N>` を頼む
  - 同じ名前のセッションがすでにあったとき（一覧にその名前の行がある）: その行を示し、kompiro に古いセッションを
    閉じるか名前を変えてもらってから、起動スキルを打ち直してもらう
  - `/impl <N>`: `/hane:start-dev` の流れで Issue N に着手する。Issue N の worktree がすでにあれば作り直さず、
    そこで作業を続ける。下の「実装セッション」の手順を加える
  - `/local-review <N>`: `impl-<N>` からの依頼を待つ。下の「レビューセッション」の手順で動く
  - `/verify <N>`: `impl-<N>` からのメッセージを待ち、届いたら `/pr-verify` を始める
- 名前が `<役割>-<N>` でないセッション（自動の名前など）は、メッセージを送らず、受けた依頼も実行しない。今の
  手順で進める。受け手は、メッセージを受けるたびに自分の名前を `ListAgents` で確かめ直す（再開や VS Code の
  再読み込みのあとに名前が変わっていても、会話の記憶で動かないため）
- 宛先は送る直前に `ListAgents` で確かめる。その名前の行がちょうど 1 つあるときだけ送る

### メッセージの種類

メッセージの 1 行目は、次のどれかで始める。受け手は 1 行目で種類を決め、種類ごとに決めたことだけをする。
決まった 1 行目で始まらないメッセージは実行せず、kompiro に 1 行で知らせる。

| 1 行目                                  | 送り手 → 受け手              | 受け手がすること                          |
| --------------------------------------- | ---------------------------- | ----------------------------------------- |
| `review-request step8 k=<k> head=<sha>` | `impl-<N>` → `review-<N>`    | 手順 8 の k 回目を当てて返す              |
| `review-request cli head=<sha>`         | `impl-<N>` → `review-<N>`    | 手順 9 の CLI を当てて返す                |
| `review-result head=<sha>`              | `review-<N>` → `impl-<N>`    | 指摘を扱う（実装セッションの 2）          |
| `ready-for-verify PR #<M> head=<sha>`   | `impl-<N>` → `verify-<N>`    | `/pr-verify <M>` を始める                 |
| `hand-back PR #<M> <コメントの URL>`    | `verify-<N>` → `impl-<N>`    | コメントの点を直す（実装セッションの 4）  |
| `declined: <理由>`                      | どれからでも、依頼の送り手へ | 何もせず、kompiro に 1 行で知らせて止まる |

`declined` は、受け手が依頼を実行しなかったこと（HEAD が食い違う、作業ブランチでない、など）を伝える返事で、
それを受けたセッションは依頼をやり直さない。検証セッションは `ready-for-verify` でだけ `/pr-verify` を始める。

### 合図と記録

- **`notify_when_idle` は使わない。** 相手が待機状態になるのは、作業を終えたときだけではない。kompiro に
  質問して止まったとき、rate limit を待つためにターンを終えたときも待機状態になる。待機の通知を「終えた」と
  読むと、TPL-3385 の失敗（待つ側が合図の意味の違いに気づかない）と同じことが起きる。終えた側が明示的な
  メッセージを送る。
- **受け手は、メッセージの文ではなく git と PR から状態を読み直す。** 「HEAD は `<sha>`」と書かれていても、
  ブランチの HEAD を自分で読む。
- **送り手を確かめる。** 受け手は `from` が規約どおりの相手（レビューと検証なら `impl-<N>`、実装なら
  `review-<N>` か `verify-<N>`）かを確かめる。違えば実行せず、送り手には返さずに kompiro に知らせる。送り手が
  正しく、HEAD などの状態が食い違うときは、作業せずに送り手へ `declined: <理由>` を返す。
- **差し戻しの中身は PR のコメントに置く。** `pr-verify` は送る前に、依頼の本文を PR に英語のコメントで残す。
  1 行目は `Hand-back by /pr-verify head=<headSha>:` とする。メッセージには PR 番号とそのコメントの URL だけを
  入れる。コメントは kompiro のアカウントで書かれるので、ほかの処理や bot が読む文字列を書かない。
  CodeRabbit の指摘はスレッドかコメントの URL で書き、`cr-comment:v1:` で始まる文字列（`review-state.ts` が答え
  済みと数える）も `@coderabbitai`（CodeRabbit がレビューを始める）も書かない。レビューを頼み直すのは実装
  セッションである。
- **ローカルレビューの指摘はメッセージで運び、記録は PR 本文に書く。** PR を作る前なので PR のコメントには
  置けない。今の subagent の報告と同じく、指摘はメッセージで実装セッションに届き、実装セッションが対応を
  決めて手順 10 でローカルレビューの記録に書く。メッセージには、`local-review-record.ts` が読む形
  （`{reviewer, sev, where, finding}`）の配列、レビューしたコミット、その回で CLI を当てたか（当てなかったなら
  理由）を入れる。

### 実装セッション（`impl-<N>`）

1. **ローカルレビューを頼む:** 依頼は 2 種類で、どちらも「ブランチ `<branch>`（worktree `<path>`）の HEAD
   `<sha>` に」と書く。送ったら kompiro に「`review-<N>` に何を頼んだか」を 1 行で知らせてターンを終える。待つ
   あいだはブランチにコミットしない（レビューは同じ worktree を読む）。`review-<N>` が一覧に無ければ、今と同じく
   自分の subagent と CLI で手順 8・9 を行う。
   - **手順 8 の k 回目:** `docs/process.md` 手順 7 を終えたら 1 回目を頼む。2 回目と 3 回目は、修正で触れた
     ファイルを添える
   - **手順 9 の CLI:** 手順 8 が終わったと実装セッションが決めたとき（指摘が無くなった、残りを却下した、3 回目の
     指摘を直した）に 1 回だけ頼む。こうすると今と同じく、手順 8 の修正を含む差分に CLI が当たる
2. **指摘を受けたとき:** 今の subagent の報告と同じに扱う（`docs/process/review.md`「指摘の重大度と対応」）。
   手順 8 の回の指摘を直したら、1 に戻って次の回か CLI を頼む。CLI の指摘を直したあとは、手順 9 と同じく回し
   直さずに手順 10 に進む。返事に CLI を当てられなかった理由があれば、記録の `Reviewers:` にそれを書き、
   `gh pr ready` は `KARASU_LOCAL_REVIEW_SKIPPED=<理由>` を付けて実行する（ADR-3342）。Design Doc との照合
   （`review.md`「Design Doc との照合」）と、`securityReview` が true のときの `/security-review` は、今と同じく
   実装セッションが自分の subagent で行う
3. **PR を渡すとき:** 次の時点で `verify-<N>` に「PR #M を `/pr-verify` できる、HEAD は `<sha>`」と送り、kompiro に
   「`verify-<N>` に渡した」と PR へのリンクを添えて知らせる。`verify-<N>` が一覧に無ければ送らず、今と同じく
   kompiro に通知する。
   判定は 1 つ、**実装セッションの作業が残っていない状態で、kompiro に PR を渡すとき**である。送る直前に
   Review tier を走り直させ、終わるのを待ってから送る（converge の終わり方と同じ。今の `review.md` が求めて
   いない段階でも、新しい節で求める）。走っている check があると、検証セッションの gate は `wait` になる。
   - High: `coderabbit-converge` が「人間に渡せる」で終わるとき（終わり方で走り直す）。「人間の判断待ちで
     止まっている」ときは送らない（kompiro の判断が要るので、差し戻されても実装セッションは直せない）
   - Medium: `docs/process.md` 手順 12（CI）と 14（手動検証）を終えたとき
   - Design: 手順 12 と 14 を終え、CodeRabbit のレビューに答え終えたとき
   - Low: 送らない
4. **差し戻しを受けたとき:** メッセージにあるコメントを読み、作者が kompiro の login であること、PR の head の
   リポジトリが `kompiro/karasu` で、head のブランチが自分の作業ブランチであることを確かめてから、そこにある点を
   直す（fork からの PR は実装セッションが持たないので対象外になる）。どれかが違えば直さず、送り手に
   `declined: <理由>` を返して kompiro に通知する。メッセージの文ではなくコメントの内容に従う。直し方は通常の流れと同じで、足したコミットへの
   手順 8 の確認（`review.md`「記録の後にコミットを足したら」）は、`review-<N>` があればそこに修正で触れた
   ファイルを頼む（CLI は当てない）。High ならラウンドを回す。終わったら 3 の時点で、`verify-<N>` に送る。
5. **直せないとき:** 直せない理由（記録済みの決定と食い違う、など）を PR にコメントで残し、kompiro に通知する。
   検証セッションには送らない。

### レビューセッション（`review-<N>`）

1. **頼まれたとき:** `from` が `impl-<N>` でなければ、レビューせず、返さずに kompiro に知らせる。メッセージの
   worktree のブランチの HEAD がメッセージの SHA と違えば、レビューせずに `impl-<N>` に `declined: <理由>` を返し、
   kompiro に 1 行で知らせる。
2. **レビュー:** 依頼の種類に従い、その worktree で行う。
   - 手順 8 の回: `git diff origin/main...HEAD` に、毎回新しい subagent で `/engineering:code-review`。2 回目と
     3 回目は修正で触れたファイル全体。PR を作ったあとの確認の依頼もこの形で、CLI は当てない
   - 手順 9 の CLI: 同じ差分に `coderabbit review --agent --deep --base origin/main --committed` を 1 回。CLI の
     レビューは `~/.coderabbit/reviews/` に残り、実装セッションの `gh pr ready` のゲートもそれを「済み」と数える
3. **返す:** 指摘の配列、レビューしたコミット、CLI の依頼なら当てられたか（当てられなかったなら理由）を
   `review-result` で `impl-<N>` に送り、kompiro に「`impl-<N>` に何件返したか」を 1 行で知らせる。
   ファイルは書き換えず、指摘への対応も決めない。回数の上限（3 回）は、今と同じく頼む側の実装セッションが守る。

### 検証セッション（`verify-<N>`、`pr-verify`）

1. **起動のされ方:** `impl-<N>` からの `ready-for-verify` で `/pr-verify <pr>` を始めてよい（未解決の問い 1）。
   `declined` を受けたら、`/pr-verify` を始めず、kompiro に 1 行で知らせて止まる。ほかの PR の
   `/pr-verify` の途中で別の PR のメッセージが届いたら、今の PR を終えてから順に始める。1 回の `/pr-verify` は
   1 つの PR だけを扱う。
2. **宛先:** 自分の名前の `N` を使い、PR 本文に `Closes #N` か `Refs #N`（`#N` の直後が数字でない。`N` が 3920
   なら `#39201` は数えない）があり、`impl-<N>` の行が一覧に
   ちょうど 1 つあるときだけ、`impl-<N>` をその PR の実装セッションとする。kompiro が `/pr-verify` を直接
   打ったときも同じに決める。ほかの Issue の PR を確かめているときは、今と同じく kompiro に渡す。
3. **差し戻し:** 依頼文を kompiro に渡して終わるところでは、2 で実装セッションが決まり、往復の上限に達して
   おらず、PR がマージされていなければ、次のようにする。それ以外は今と同じく kompiro に渡す（6b の 3 で
   マージ済みの PR に変更が選ばれたときの追いかけの PR は、新しい PR なのでこの往復に入れない）。
   1. 依頼の本文を PR に `Hand-back by /pr-verify` のコメントで残す
   2. 実装セッションに、PR 番号とコメントの URL を送る
   3. kompiro には、送ったことと送り先、理由、PR へのリンクを 1〜2 行で伝えて終わる
4. **往復の上限:** PR にある、作者が kompiro の login の `Hand-back by /pr-verify` のコメントを数える。3 件に
   達していれば送らずに kompiro に渡す。HEAD が変わらない差し戻し（スレッドへの返信だけ、rate limit が明けた
   あとのレビューの頼み直しだけ）も 1 件と数える。どの往復も上限を持つようにするためで、上限に達しても
   今の手順に戻るだけである。
5. **手順 3 での読み方:** `Hand-back by /pr-verify` のコメントは `Decisions by kompiro` ではないので、
   For Reviewers の答えとしては読まない。やり直しの `/pr-verify` では、最新の `Hand-back` のコメントに挙げた点が
   直っているかを、`[change]` の答えと同じく確かめる（NO のときに kompiro が挙げた点も、ここで確かめる）。

### 前提として kompiro が設定するもの

- Issue に着手するとき、新しいセッションで `/impl <N>`・`/local-review <N>`・`/verify <N>` を打つ。3 つ全部でなくてよい。
  起動していない役割は、今の手順（実装セッションが自分でレビューする、kompiro が依頼文を運ぶ）で動く
- セッションをどれも auto mode で動かす（`bypassPermissions` にしない）
- `crossSessionInbound` を `accept` にしておく（既定値は実装時に確かめる）

### 実装の指針

1 本の PR で次を変える。`Closes #3920`。

- hook: prompt から名前を返すスクリプト（`scripts/` の下に新しく `session` のディレクトリを作って置き、prompt と名前の対応を vitest で固める）と、
  `.claude/settings.json` の UserPromptSubmit への登録
- 起動スキル: `.claude/skills/impl/`・`local-review/`・`verify/` の `SKILL.md`。最初に名前を確かめ、上の各セッションの
  手順を書く（手順の本文は `docs/process/review.md` の新しい節に置き、スキルはそこを指す）
- `.claude/skills/pr-verify/SKILL.md`: 到達状態に「実装セッションに送った」を足す。宛先の決め方（自分の名前の
  `N` と PR 本文）を足す。「依頼文を kompiro に渡して終わる」ところで送る手順を 1 か所にまとめて書き、
  各箇所からそこを指す。手順 3 の読み方に `Hand-back` のコメントを足す
- `.claude/skills/coderabbit-converge/SKILL.md`: 「終わり方」の「人間に渡せる」のときだけ `verify-<N>` に送る
- `docs/process/review.md`: 「セッション同士のやりとり」の節を足す（名前の規約と起動スキル、ローカルレビューの
  頼み方と返し方、送る時点、受け取ったときの手順、往復の上限、前提の設定）。同じ節で、Medium と Design の PR
  にも、送る直前の Review tier の走り直しを求める
- `docs/process.md` は触らない（12 バイトしか残っていない）。手順 8・9 は誰が subagent と CLI を走らせるかを
  書いていない。CLI は手順 8 が終わってから頼むので、順番も今と同じである
- TPL-3920 の `known_consumers` に機能名（`session-naming-hook`・`pr-verify`・`coderabbit-converge`・
  `session-start-skills`）を足し、`scope.paths` に hook のスクリプトと起動スキルのディレクトリを足す
  （`pnpm tpl:changed` が実装 PR で TPL-3920 を出すように。`pnpm tpl:validate` は今あるファイルに当たらない glob を
  通さないので、この Design PR では `.claude/settings.json` だけを足してある）
- 受け入れテスト: 下の項目を `docs/acceptance/session-handoff.md` に起こす

実装 PR がマージされたら、この Design Doc を ADR-3920 に昇格させる（`.claude/rules/adr.md`）。

`docs/process/review.md` の文面は、未解決の問いの答えで変わるので、この Design Doc に `### 仕様の変更` の
ブロックは置かない。実装 PR では `review.md` の差分を kompiro が読む。

### 影響範囲・マイグレーション

- 足すコードは hook のスクリプトだけで、`gate.sh`・`review-state.ts`・`ready-gate.sh`・Review tier の判定は
  変えない。hook は 3 つの起動スキルの prompt 以外では何も返さないので、ほかのセッションの名前は変わらない
- 起動スキルで始めていないセッションは、今と同じ動きのまま
- 実装 PR のマージ前から動いているセッションは古い skill と `review.md` を読んでいるので、送らない。そのぶんは
  今と同じく kompiro が運ぶ

#### 受け入れテスト

実装 PR 自身を対象に、マージ前に確かめる。実装 PR の Issue を `N` として、VS Code で 3 つのセッションを起動
スキルから始めて行う。マージ前は hook・`.claude/settings.json`・起動スキルが実装 PR のブランチにしか無いので、
3 つのセッションは実装 PR の worktree をプロジェクトのディレクトリとして開く（ルートのチェックアウトで開くと
`main` の設定を読む）。順番は、実装 PR を開く前にローカルレビューの項目を行い、そのあと PR を開いて残りを行う。

- ローカルレビューの項目は、このブランチに CLI のレビューがまだ無い状態で始める。CLI のゲートが通ったことに
  加え、ゲートを通したレビューの `git.json` の `head` が、`review-<N>` が返したコミットであることを確かめる
- 実装 PR の上の差し戻しの項目は、実装 PR の往復の上限を最大 2 件使う
- 上限と別ブランチの項目は、使い捨ての draft PR（本文に `Refs #N` を書く。`/pr-verify` が `fix` を出すように、
  未解決のスレッドを 1 つ置くか、kompiro が NO で直す点を挙げる）に対して行い、終わったら閉じる。別ブランチの
  項目を先に行い、そのあと `Hand-back` を 3 件にして上限の項目を行う

- [ ] VS Code の新しいセッションで `/impl <N>`・`/local-review <N>`・`/verify <N>` を打つと、それぞれの `ListAgents` の 1 行目が `impl-<N>`・`review-<N>`・`verify-<N>` になり、`/local-review` で始まるのが組み込みの `/code-review` ではなくプロジェクトのスキルである
- [ ] `impl-<N>` が手順 8 の回を頼むと、待機中の `review-<N>` が指摘を返す。手順 8 を終えて CLI を頼むと `review-<N>` が CLI を当てて返し、`impl-<N>` の `gh pr ready` が、`review-<N>` の CLI のレビュー（`git.json` の `head` が返されたコミット）で CLI のゲートを通る
- [ ] `impl-<N>` のセッションで `/verify <N>` を打っても、名前は `impl-<N>` のまま変わらない
- [ ] 待機中の `review-<N>` を閉じて `--resume` で開き直しても、名前が `review-<N>` のままで、次の依頼を受けられる
- [ ] `review-<N>` は、ブランチの HEAD が依頼の SHA と違うとき、レビューせずに `impl-<N>` にそう返す
- [ ] `impl-<N>` が PR を渡すと、待機中の `verify-<N>` が `/pr-verify` を始める
- [ ] `fix` の判定で、PR に `Hand-back by /pr-verify` のコメントが付き、`impl-<N>` に URL が届く
- [ ] 差し戻しのコメントのあとも、`gate.sh` の `coderabbit.bodyFindingIds` が変わらない
- [ ] `impl-<N>` が直して返したメッセージで、`verify-<N>` が `/pr-verify` をやり直し、`Hand-back` に挙げた点を確かめる
- [ ] kompiro が `verify-<N>` で `/pr-verify` を直接打っても、差し戻しが `impl-<N>` に届く
- [ ] 使い捨ての draft PR に `Hand-back` のコメントが 3 件あるとき、`verify-<N>` は送らずに依頼文を kompiro に渡す
- [ ] 差し戻しのコメントが使い捨ての draft PR（`impl-<N>` の作業ブランチでないブランチ）を指すとき、`impl-<N>` は直さずに `declined` を返して kompiro に知らせ、`verify-<N>` は `declined` を受けても `/pr-verify` を始めない
- [ ] `review-<N>` が無いとき、`impl-<N>` は今と同じく自分でレビューする。`impl-<N>` が無いとき、差し戻しは今と同じく依頼文を kompiro に渡す
- [ ] `from` が規約の相手でないメッセージ（自動の名前のセッションから送る）を、受け手は実行せず kompiro に知らせる

## 未解決の問い / 決めないこと

1. **検証セッションは、メッセージを受けたら自動で `/pr-verify` を始めてよいか。** 始めると preview での確認
   （Playwright）まで進み、未決事項があれば kompiro にダイアログで聞く。kompiro がほかの作業をしているあいだに
   ダイアログが出ることになる。案: 始める（kompiro がやりたいのは文を運ばないことなので）。レビューセッションは
   kompiro に問いを出さないので、頼まれたら始める。
2. **往復の上限を 3 回にするか。** 案: 3 回（PR ごとに、HEAD が変わらない差し戻しも数える）。ローカルレビューは
   今の手順 8 と同じ 3 回まで。
3. **#3914 との順序。** #3914 は `pr-verify` 手順 6 の問いを減らし、この設計は同じ手順の終わり方を変える。どちらが
   先にマージされても、後の PR が取り込んで合わせる。
4. **レビューセッションを実装セッションが起動してよいか（名前の付け方 C）。** `review-<N>` は kompiro に問いを
   出さないので、`impl-<N>` が `claude --bg -n review-<N> --permission-mode auto "/local-review <N>"` で起動すれば、
   kompiro が開くセッションは 2 つで済む。ただし VS Code のパネルに出ず、kompiro が見るには `claude attach` が
   要る。案: 最初は kompiro が開き、慣れてから C を試す。
