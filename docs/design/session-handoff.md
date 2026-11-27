# 実装セッションとレビューセッションが直接やりとりする

- **日付**: 2026-11-27
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3920](https://github.com/kompiro/karasu/issues/3920)
  - 関連 Issue: [#3896](https://github.com/kompiro/karasu/issues/3896)（Design PR #3914。kompiro に届く問いを減らす側）
  - 関連 ADR: [ADR-3286](../adr/3286-risk-based-review-tiers.md)（判断の根拠を PR に残す）
  - 関連 TPL: [TPL-3920](../test-perspectives/TPL-3920-session-message-is-a-wake-up-not-a-record.md)（この PR で起こす proactive TPL）、[TPL-3385](../test-perspectives/TPL-3385-consumer-of-a-signal-the-producer-stops-emitting.md)、[TPL-2909](../test-perspectives/TPL-2909-pending-items-need-stable-ids-not-a-moving-window.md)
  - コード: `.claude/skills/pr-verify/SKILL.md`、`.claude/skills/coderabbit-converge/SKILL.md`、`docs/process/review.md`、`scripts/coderabbit/review-state.ts`

## 背景・課題

`/pr-verify` は、PR に実装セッションの作業が残っていると分かったとき、実装セッションに貼れる英語の依頼文を
kompiro に渡して終わる。kompiro はその文を実装セッションに貼り、直し終わるのを待って、レビューセッションで
`/pr-verify` をもう一度実行する。

この往復で kompiro がしているのは、同じマシンの 2 つの Claude Code セッションのあいだで文を運ぶことだけである。
判断は何もしていない。PR 1 本につき差し戻しが 1〜2 回あると、kompiro は 2 つのセッションを行き来して待つことに
なる。

Claude Code には、同じマシンのセッション同士がメッセージを送り合う仕組み（`ListAgents` / `SendMessage`）がある。
これを使えば、文を運ぶ部分はセッション同士で済ませられる。

## 現状（インベントリ）

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
  止まっているときは、質問済みのスレッドが未解決で残るので、`gate.sh` は `fix` を返す
- Medium と Design: CodeRabbit のラウンドが無い。`docs/process.md` 手順 12（CI の通過）と 13
  （`status: in-review`）のあとに kompiro に渡る
- Low: Low PR merger がマージするので、`/pr-verify` は要らない

### PR のコメントを読むもの

- `scripts/coderabbit/review-state.ts` の `bodyFindingIds` は、CodeRabbit 以外のコメントに
  `cr-comment:v1:<id>` があれば、その指摘を答え済みと数える（`ANSWERED_FINDING_ID`）。`gh` は kompiro の
  アカウントで書くので、差し戻しのコメントにこの形の文字列があると、gate の `fix` の理由から指摘が消える
- `pr-verify` 手順 3 は、kompiro の login のコメントを For Reviewers の答えとして読む
- ほかに PR のコメントを読むもの（`low-pr-merger.ts`、Review tier）は、新しい種類のコメントを読まない

### セッション間メッセージで分かっていること

Claude Code のドキュメント（Message your other Claude Code sessions、Manage sessions）から:

- 送り先はセッションの名前で指す。名前は `/rename` か `--name` で付けられる。付けていないセッションには
  `karasu-08` のような名前が自動で付く。自動の名前は一覧の表示用で、再開には使えない
- 受け取ったメッセージには送り手の名前（`from`）が付く。返事は `from` を宛先にすれば届く
- 待機中のセッションにメッセージが届くと、新しいターンが自動で始まる。作業中なら次のツール呼び出しのときに届く
- 送り手と受け手の権限モードの組み合わせで、メッセージが承認待ちになる。default・auto・`acceptEdits`・
  `dontAsk` 同士なら届く。片方が `bypassPermissions`（と、bypass を使える端末での plan mode）だと承認待ちに
  なり、5 分（`dialogExpiry`）で消える
- 受け取りは設定 `crossSessionInbound`（`accept` / `hold` / `refuse`）で変えられる
- `SendMessage` の `notify_when_idle: true` で、相手が次に待機状態になったとき（か終了したとき）に通知が 1 回届く
- 自分の名前は `ListAgents` の 1 行目で分かる。名前を変えたときに、ほかのセッションが使っている宛先が変わるかは
  ドキュメントに書かれていない。再起動後に宛先が残るかも書かれていない

## 制約・前提

- **判断は kompiro に残す。** 未決事項（For Reviewers など）への答えとマージの OK は、今と同じく kompiro が
  レビューセッションで答える。自動にするのは「直す → 確かめ直す」の往復だけ。
- **メッセージは記録にならない。** 後から読み返せず、セッションが終われば消える。差し戻しの理由は PR に残す
  （ADR-3286、TPL-3920）。
- **相手が見つからないときは今と同じに戻る。** 宛先のセッションが一覧に無い、送信が失敗した、などのときは
  依頼文を kompiro に渡して終わる。メッセージが使えないことで、今より悪くはならない。
- **権限を回避させない。** レビューセッションで拒否された操作を、実装セッションに頼まない（Claude Code 自体の
  決まり）。依頼の中身は今の依頼文と同じで、PR の修正だけである。
- **同じマシンに限る。** 別のマシンやクラウドのセッションは out of scope（Remote Control が要り、返事が届く
  保証も無い）。
- hane（`/hane:start-dev` など）への展開は out of scope。karasu の 2 つの skill と `docs/process/review.md` で試す。

## 検討した選択肢

### 案1: レビューセッションに決まった名前を付け、実装セッションから声をかける

kompiro は `/pr-verify` に使うセッションに 1 回だけ `/rename karasu-review` で名前を付ける。実装セッションは
PR を kompiro に渡す時点で `karasu-review` にメッセージを送る。レビューセッションはそのメッセージの `from` に
返事を送る。

- PR とセッションの対応を、どこにも持たなくてよい。メッセージが運ぶ
- 名前を付けるのはレビューセッションの 1 本だけで、kompiro の手間は 1 回
- kompiro が `/pr-verify` を直接実行したとき（メッセージで始まっていないとき）は宛先が分からないので、今と
  同じく依頼文を kompiro に渡す

### 案2: 実装セッションの名前を PR に書いておく

実装セッションが自分の名前を PR の本文かコメントに書き、レビューセッションはそれを読んで送る。kompiro が
`/pr-verify` を直接実行したときにも宛先が分かる。

- 自動の名前は一覧の表示用で、再開や再起動で同じになる保証が無い。PR に古い名前が残り、別のセッション
  （同じ名前を後から付けられたもの）に届くおそれがある
- PR に、セッションという PR と関係の無い情報が残る

### 案3: 実装セッションの名前をブランチ名に揃える

`/rename` は利用者が打つコマンドで、Claude が自分のセッションに名前を付ける方法はドキュメントに無い。
kompiro がセッションを作るたびに名前を付けることになり、手間が減らない。

### 案4: PR のコメントだけでやりとりする

両方のセッションが PR のコメントをポーリングする。記録が残り、マシンを選ばない。ただし待ち時間が長くなり、
ポーリングのループを両方で回し続けることになる。

### 案5: レビューを実装セッションの subagent で済ませる

`branch-review` はすでにそうしている。`pr-verify` は kompiro の答えを受け取り、マージする skill なので、
kompiro が見ているセッションで動く必要がある。

## 比較

| 観点                             | 案1          | 案2              | 案3    | 案4        | 案5      |
| -------------------------------- | ------------ | ---------------- | ------ | ---------- | -------- |
| kompiro の手間                   | 名前を 1 回  | なし             | 毎回   | なし       | なし     |
| 誤った宛先に届くおそれ           | 無い（from） | ある（古い名前） | 少ない | 無い       | 無い     |
| `/pr-verify` を直接打ったとき    | 今と同じ     | 送れる           | 送れる | 送れる     | 対象外   |
| 待ち時間                         | すぐ         | すぐ             | すぐ   | ポーリング | すぐ     |
| kompiro が判断できる場所に残るか | 残る         | 残る             | 残る   | 残る       | 残らない |

案1 を採る。記録は案4 と同じく PR のコメントに置き、メッセージは起こす合図にだけ使う。

## 現時点の方針

### 合図と記録

- **合図は明示的なメッセージにする。** 「PR #N を `/pr-verify` できる、HEAD は `<sha>`」の 1 種類だけを使う。
  最初に PR を渡すときも、直して返すときも同じメッセージである。
- **`notify_when_idle` は使わない。** 実装セッションが待機状態になるのは、直し終えたときだけではない。kompiro に
  質問して止まったとき、rate limit を待つためにターンを終えたときも待機状態になる。待機の通知を「直し終えた」と
  読むと、TPL-3385 の失敗（待つ側が合図の意味の違いに気づかない）と同じことが起きる。
- **差し戻しの中身は PR のコメントに置く。** `pr-verify` は送る前に、依頼の本文を PR に英語のコメントで残す。
  1 行目は `Hand-back by /pr-verify head=<headSha>:` とする。メッセージには PR 番号とそのコメントの URL だけを
  入れる。コメントには CodeRabbit の指摘をスレッドかコメントの URL で書き、`cr-comment:v1:` で始まる文字列を
  書かない（`review-state.ts` が答え済みと数えるため）。

### レビューセッション（`pr-verify`）

1. **準備:** このセッションの名前が `karasu-review` かを `ListAgents` の 1 行目で確かめる。違えば、メッセージを
   受けられないことを一言伝え、今の手順で進める。
2. **起動のされ方:** 実装セッションからのメッセージ（`<cross-session-message from="...">`）で `/pr-verify <pr>` を
   始めたときは、`from` を実装セッションとして控える。kompiro が直接打ったときは控えない。
3. **差し戻し:** 依頼文を kompiro に渡して終わるところでは、実装セッションを控えていて、それが `ListAgents` に
   あり、往復の上限に達していなければ、次のようにする。それ以外は今と同じく kompiro に渡す。
   1. 依頼の本文を PR に `Hand-back by /pr-verify` のコメントで残す
   2. 実装セッションに、PR 番号とコメントの URL を送る
   3. kompiro には、送ったことと理由を 1〜2 行で伝えて終わる
4. **往復の上限:** 作者が kompiro の login の `Hand-back by /pr-verify` のコメントを、`head=` の SHA ごとに 1 回と
   数える。3 回に達していれば送らずに kompiro に渡す。同じ HEAD への差し戻し（rate limit が明けるのを待って
   レビューを頼み直すだけのもの）は回数を増やさない。
5. **手順 3 での読み方:** `Hand-back by /pr-verify` のコメントは `Decisions by kompiro` ではないので、
   For Reviewers の答えとしては読まない。

### 実装セッション

1. **PR を渡すとき:** 次の時点で `karasu-review` にメッセージを送る。`karasu-review` が一覧に無ければ送らず、
   今と同じく kompiro に通知する。
   - High: `coderabbit-converge` が「人間に渡せる」で終わったとき。「人間の判断待ちで止まっている」ときは
     送らない（kompiro の判断が要るので、差し戻されても実装セッションは直せない）
   - Medium と Design: `docs/process.md` 手順 13（`status: in-review`）にしたとき
   - Low: 送らない
2. **差し戻しを受けたとき:** メッセージにあるコメントを読み、作者が kompiro の login であることを確かめてから、
   そこにある点を直す。メッセージの文ではなくコメントの内容に従う。直し方は通常の流れと同じ
   （`docs/process/review.md` のレビュー、High ならラウンド）。終わったら 1 の時点で、`from` にメッセージを返す。
3. **直せないとき:** 直せない理由（記録済みの決定と食い違う、など）を PR にコメントで残し、kompiro に通知する。
   レビューセッションには送らない。

### 前提として kompiro が設定するもの

- レビューセッションに `/rename karasu-review` を打つ
- 2 つのセッションをどちらも auto mode で動かす（`bypassPermissions` にしない）
- `crossSessionInbound` を `accept` にしておく（既定値は実装時に確かめる）

### 実装の指針

1 本の PR で次を変える。`Closes #3920`。

- `.claude/skills/pr-verify/SKILL.md`: 到達状態に「実装セッションに送った」を足す。準備に名前の確認を足す。
  「依頼文を kompiro に渡して終わる」ところで送る手順を 1 か所にまとめて書き、各箇所からそこを指す。手順 3 の
  読み方に `Hand-back` のコメントを足す
- `.claude/skills/coderabbit-converge/SKILL.md`: 「終わり方」の「人間に渡せる」のときだけメッセージを送る
- `docs/process/review.md`: 「レビューセッションとのやりとり」の節を足す（送る時点、受け取ったときの手順、
  往復の上限、前提の設定）。`docs/process.md` は 12 バイトしか残っていないので触らない
- TPL-3920 の `known_consumers` に `pr-verify` と `coderabbit-converge` を足す

`docs/process/review.md` の文面は、未解決の問いの答えで変わるので、この Design Doc に `### 仕様の変更` の
ブロックは置かない。実装 PR では `review.md` の差分を kompiro が読む。

#### 受け入れテスト

実装 PR 自身を対象に、マージ前に確かめる。

- [ ] 実装セッションから `karasu-review` にメッセージを送ると、待機中のレビューセッションが `/pr-verify` を始める
- [ ] `fix` の判定で、PR に `Hand-back by /pr-verify` のコメントが付き、実装セッションに URL が届く
- [ ] 差し戻しのコメントのあとも、`gate.sh` の `coderabbit.bodyFindingIds` が変わらない
- [ ] 実装セッションが直して返したメッセージで、レビューセッションが `/pr-verify` をやり直す
- [ ] `karasu-review` の名前が無いとき、実装セッションは送らず通知だけする（今と同じ）
- [ ] kompiro が `/pr-verify` を直接打ったとき、差し戻しは今と同じく依頼文を kompiro に渡す

## 未解決の問い / 決めないこと

1. **レビューセッションは、メッセージを受けたら自動で `/pr-verify` を始めてよいか。** 始めると preview での確認
   （Playwright）まで進み、未決事項があれば kompiro にダイアログで聞く。kompiro がほかの作業をしているあいだに
   ダイアログが出ることになる。案: 始める（kompiro がやりたいのは文を運ばないことなので）。
2. **往復の上限を 3 回にするか。** 案: 3 回（HEAD ごとに数える）。
3. **#3914 との順序。** #3914 は `pr-verify` 手順 6 の問いを減らし、この設計は同じ手順の終わり方を変える。どちらが
   先にマージされても、後の PR が取り込んで合わせる。
