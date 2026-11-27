# 実装セッションとレビューセッションが直接やりとりする

- **日付**: 2026-11-27
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3920](https://github.com/kompiro/karasu/issues/3920)
  - 関連 Issue: [#3896](https://github.com/kompiro/karasu/issues/3896)（Design PR #3914。kompiro に届く問いを減らす側）
  - 関連 TPL: [TPL-3920](../test-perspectives/TPL-3920-session-message-is-a-wake-up-not-a-record.md)（この PR で起こす proactive TPL）、[TPL-3385](../test-perspectives/TPL-3385-consumer-of-a-signal-the-producer-stops-emitting.md)、[TPL-2909](../test-perspectives/TPL-2909-pending-items-need-stable-ids-not-a-moving-window.md)
  - コード: `.claude/skills/pr-verify/SKILL.md`、`.claude/skills/coderabbit-converge/SKILL.md`、`docs/process/review.md`

## 背景・課題

`/pr-verify` は、PR に実装セッションの作業が残っていると分かったとき（手順 1 の `fix`、6b で kompiro が変更を
選んだとき、kompiro が NO と言って直す点を挙げたとき）、実装セッションに貼れる英語の依頼文を kompiro に渡して
終わる。kompiro はその文を実装セッションに貼り、直し終わるのを待って、レビューセッションで `/pr-verify` を
もう一度実行する。

この往復で kompiro がしているのは、同じマシンの 2 つの Claude Code セッションのあいだで文を運ぶことだけである。
判断は何もしていない。PR 1 本につき差し戻しが 1〜2 回あると、kompiro は 2 つのセッションを行き来して待つことに
なる。

Claude Code には、同じマシンのセッション同士がメッセージを送り合う仕組み（`ListAgents` / `SendMessage`）がある。
これを使えば、文を運ぶ部分はセッション同士で済ませられる。

## 現状（インベントリ）

### 文を kompiro に渡している箇所

| 場所                                              | 何を渡すか                                                              |
| ------------------------------------------------- | ----------------------------------------------------------------------- |
| `pr-verify` 手順 1 `fix`                          | gate の `reasons` と根拠のリンクをまとめた英語の依頼文                  |
| `pr-verify` 6b の 3（マージ済みで変更が選ばれた） | マージ後の追いかけの PR を頼む依頼文                                    |
| `pr-verify` 6b の 4（変更が 1 つでも選ばれた）    | 手順 1 の `fix` と同じ形の依頼文。kompiro が選んだ変更を含む            |
| `pr-verify`「kompiro が NO と言ったとき」         | kompiro が挙げた直す点の依頼文                                          |
| `coderabbit-converge`「終わり方」                 | 収束したことを PushNotification と最後のメッセージで kompiro に知らせる |

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
  （TPL-3920）。
- **相手が見つからないときは今と同じに戻る。** 宛先のセッションが一覧に無い、送信が失敗した、などのときは
  依頼文を kompiro に渡して終わる。メッセージが使えないことで、今より悪くはならない。
- **権限を回避させない。** レビューセッションで拒否された操作を、実装セッションに頼まない（Claude Code 自体の
  決まり）。依頼の中身は今の依頼文と同じで、PR の修正だけである。
- **同じマシンに限る。** 別のマシンやクラウドのセッションは out of scope（Remote Control が要り、返事が届く
  保証も無い）。
- hane（`/hane:start-dev` など）への展開は out of scope。karasu の 2 つの skill と `docs/process/review.md` で試す。

## 選択肢

### 宛先をどう決めるか

**案 A: レビューセッションに決まった名前を付け、実装セッションから声をかける（採用）**

kompiro は `/pr-verify` に使うセッションに 1 回だけ `/rename karasu-review` で名前を付ける。実装セッションは
PR を kompiro に渡す時点で `karasu-review` にメッセージを送る。レビューセッションはそのメッセージの `from` に
返事を送る。

- PR とセッションの対応を、どこにも持たなくてよい。メッセージが運ぶ
- 名前を付けるのはレビューセッションの 1 本だけで、kompiro の手間は 1 回
- `karasu-review` が一覧に無ければ、実装セッションは今と同じく kompiro に通知する

**案 B: 実装セッションの名前を PR に書いておく（却下）**

実装セッションが自分の名前を PR の本文かコメントに書き、レビューセッションはそれを読んで送る。
kompiro が `/pr-verify` を直接実行したときにも宛先が分かる利点がある。却下の理由:

- 自動の名前は一覧の表示用で、再開や再起動で同じになる保証が無い。PR に古い名前が残り、別のセッション
  （同じ名前を後から付けられたもの）に届くおそれがある
- PR に、セッションという PR と関係の無い情報が残る

ただし、kompiro が `/pr-verify` を直接実行したとき（実装セッションからのメッセージが無いとき）は宛先が
分からない。このときは今と同じく依頼文を kompiro に渡す。

**案 C: 実装セッションの名前をブランチ名に揃える（却下）**

`/rename` は利用者が打つコマンドで、Claude が自分のセッションに名前を付ける方法はドキュメントに無い。
kompiro がセッションを作るたびに名前を付けることになり、手間が減らない。

### 往復の合図に何を使うか

**合図は明示的なメッセージにする（採用）。** 実装セッションは直して push し、必要なラウンド（High なら
`/coderabbit-converge`）を終えてから「PR #N を `/pr-verify` できる、HEAD は `<sha>`」とレビューセッションに
送る。これは最初に PR を渡すときのメッセージと同じものである。

**`notify_when_idle` を合図にする案は却下した。** 実装セッションが待機状態になるのは、直し終えたときだけでは
ない。kompiro に質問して止まったとき、rate limit を待つために一度ターンを終えたときも待機状態になる。待機の通知を
「直し終えた」と読むと、TPL-3385 の失敗（合図の形が変わったのに待つ側が気づかない）と同じことが起きる。
`notify_when_idle` は使わない。

### 差し戻しの記録をどこに置くか

**PR のコメントに置く（採用）。** `pr-verify` は依頼をメッセージで送る前に、同じ内容を PR に英語のコメントで残す。
1 行目は `Hand-back by /pr-verify head=<headSha>:` とする。メッセージにはそのコメントの URL を入れ、依頼の
本文は入れない。実装セッションはコメントを読んで直す。

- 何を直すように言われたかが PR に残る。実装セッションが終わっていても、別のセッションが引き継げる
- 往復の回数を、このコメントの数で数えられる（TPL-2909: 数えるものはメッセージやセッションの記憶でなく、
  PR に残る安定したものにする）

## 決定（案）

### レビューセッション（`pr-verify`）

1. **準備:** このセッションに `karasu-review` という名前が付いているかを `ListAgents` の 1 行目で確かめる。
   付いていなければ、メッセージを受けられないことを一言伝え、今の手順で進める。
2. **起動のされ方:** 実装セッションからのメッセージ（`<cross-session-message from="...">`）で `/pr-verify <pr>` を
   始めたときは、`from` を「実装セッション」として控える。kompiro が直接打ったときは控えない。
3. **差し戻し:** 依頼文を渡す 4 か所（インベントリの表）で、実装セッションを控えていて、それが `ListAgents` に
   あるときは次のようにする。それ以外は今と同じく kompiro に渡す。
   1. 依頼の本文を PR に `Hand-back by /pr-verify head=<headSha>:` のコメントで残す
   2. 実装セッションに、PR 番号とコメントの URL だけを送る
   3. kompiro には、送ったことと理由を 1〜2 行で伝えて終わる
4. **往復の上限:** PR の `Hand-back by /pr-verify` のコメントが 3 件あれば、4 回目は送らずに kompiro に渡す。
   同じ指摘が直らないまま往復していないかを kompiro が見るためである。
5. **手順 3 での読み方:** `Hand-back by /pr-verify` のコメントは `Decisions by kompiro` ではないので、
   For Reviewers の答えとしては読まない。

### 実装セッション

1. **PR を渡すとき:** `coderabbit-converge` の「終わり方」で、PushNotification の前に `karasu-review` へ
   「PR #N を `/pr-verify` できる、HEAD は `<sha>`」を送る。`karasu-review` が一覧に無ければ送らず、今と同じく
   通知だけする。High 以外の PR（ラウンドの無い Medium と Design）では、Review tier の走り直しを終えて kompiro に
   渡す時点で同じように送る（`docs/process/review.md`「High の PR で人間が読むもの」の直後に書く）。
2. **差し戻しを受けたとき:** メッセージにある PR のコメントを読み、そこにある点を直す。直し方は通常の流れと
   同じ（`docs/process/review.md` のレビュー、High ならラウンド）。メッセージの文ではなくコメントの内容に従う
   （コメントの作者が kompiro のアカウントであることも確かめる）。終わったら 1 と同じメッセージを `from` に返す。
3. **直せないとき:** 直せない理由（記録済みの決定と食い違う、など）を PR にコメントで残し、kompiro に通知する。
   レビューセッションには送らない。

### 前提として kompiro が設定するもの

- レビューセッションに `/rename karasu-review` を打つ
- 2 つのセッションをどちらも auto mode で動かす（`bypassPermissions` にしない）
- `crossSessionInbound` を `accept` にしておく（既定値は実装時に確かめる）

## 却下した案

- **PR のコメントだけでやりとりする（GitHub を経由する）。** 記録が残り、マシンを選ばない。ただし両方のセッションが
  コメントをポーリングすることになり、待ち時間が長くなる。コメントは記録として採用し、起こす合図だけメッセージにした。
- **レビューを実装セッションの subagent で済ませる。** `branch-review` はすでにそうしている。`pr-verify` は kompiro の
  答えを受け取り、マージする skill なので、kompiro が見ているセッションで動く必要がある。
- 案 B・案 C と `notify_when_idle` は上の「選択肢」のとおり。

## 実装方針

1 本の PR で次を変える。`Closes #3920`。

- `.claude/skills/pr-verify/SKILL.md`: 到達状態に「実装セッションに送った」を足す。準備、手順 1 の `fix`、
  6b の 3 と 4、「kompiro が NO と言ったとき」に上の決定を書く。手順 3 の読み方に `Hand-back` のコメントを足す
- `.claude/skills/coderabbit-converge/SKILL.md`: 「終わり方」にメッセージを足す
- `docs/process/review.md`: 「レビューセッションとのやりとり」の節を足す（受け取り側の手順、往復の上限、
  前提の設定）。`docs/process.md` は 12 バイトしか残っていないので触らない
- TPL-3920 の `known_consumers` に `pr-verify` と `coderabbit-converge` を足す

### 受け入れテスト

実装 PR 自身を対象に、マージ前に確かめる。

- [ ] 実装セッションから `karasu-review` にメッセージを送ると、待機中のレビューセッションが `/pr-verify` を始める
- [ ] `fix` の判定で、PR に `Hand-back by /pr-verify` のコメントが付き、実装セッションに URL が届く
- [ ] 実装セッションが直して返したメッセージで、レビューセッションが `/pr-verify` をやり直す
- [ ] `karasu-review` の名前が無いとき、実装セッションは送らず通知だけする（今と同じ）
- [ ] kompiro が `/pr-verify` を直接打ったとき、差し戻しは今と同じく依頼文を kompiro に渡す

## 未解決の問い

1. **レビューセッションは、メッセージを受けたら自動で `/pr-verify` を始めてよいか。** 始めると preview での確認
   （Playwright）まで進み、未決事項があれば kompiro にダイアログで聞く。kompiro がほかの作業をしているあいだに
   ダイアログが出ることになる。案: 始める（kompiro がやりたいのは文を運ばないことなので）。
2. **往復の上限を 3 回にするか。** 案: 3 回。#3914 の記録を見ると、1 本の PR の差し戻しは多くて 2 回である。
3. **#3914 との順序。** #3914 は `pr-verify` 手順 6 の問いを減らし、この設計は同じ手順 6b の 4 を変える。どちらが
   先にマージされても、後の PR が取り込んで合わせる。
