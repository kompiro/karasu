# Low の PR を main に固定した workflow がマージする

- **日付**: 2026-11-07
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3673](https://github.com/kompiro/karasu/issues/3673)
  - 関連 ADR: [ADR-3286](../adr/3286-risk-based-review-tiers.md)（リスク段階。Low の通す条件を本設計が変える）、[ADR-3416](../adr/3416-regenerate-adr-index-daily-pr.md)（`GITHUB_TOKEN` の auto-merge を却下。新しい鍵を足さないことを理由の 1 つにした）、[ADR-2331](../adr/2331-adr-automerge-scope.md)、[ADR-3504](../adr/3504-low-adr-pr-without-draft.md)、[ADR-3342](../adr/3342-ready-gate-local-review.md)、[ADR-1370](../adr/1370-release-flow-actions-driven.md)
  - 関連 Issue: [#3364](https://github.com/kompiro/karasu/issues/3364)（`Review tier` を required にする）、[#3363](https://github.com/kompiro/karasu/issues/3363)（`Review tier` を main に固定する）、[#3380](https://github.com/kompiro/karasu/issues/3380)（段階の導入 1 か月後の計測）
  - 関連 TPL: [TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md)、[TPL-2658](../test-perspectives/TPL-2658-agent-write-scope-is-declared-not-prompted.md)、[TPL-2786](../test-perspectives/TPL-2786-guard-failure-must-fail-the-run.md)、[TPL-1725](../test-perspectives/TPL-1725-gated-test-suite-detection-gap.md)、[TPL-2643](../test-perspectives/TPL-2643-skip-reports-success-without-running.md)、[TPL-3673](../test-perspectives/TPL-3673-privileged-workflow-treats-pr-as-data.md)（本 PR で起こす）
  - コード: `scripts/review/tier.ts`、`scripts/adr/regenerate-pr-flow.ts`、`.github/workflows/review-tier.yml`

## 背景・課題

PR の段階はすでに機械が決めている（`scripts/review/tier.ts`）。しかし Low の PR を実際にマージまで運ぶのは Claude のセッションで、次の 3 点がそこに残っている。

- **Claude が手順を読んで `gh pr merge --auto` を実行し、auto mode の分類器がそれを許す必要がある。** 手元の記録（この環境に残る transcript のみ）では、128 回のうち 3 回が拒否された。理由は `Merge Without Review` が 1 回、`Unrequested Commit in a Connected App` が 2 回である。#3529 は作成の 6 秒後に拒否され、マージまで約 7 時間かかった。
- **native の auto-merge は required check しか待たない。** `Review tier` はまだ required ではない（#3364）ので、この check を待たずにマージしうる。実際に #3386 は、最後の `Review tier` が失敗した 16 秒後にマージされた（失敗の理由は調べていない）。
- **`Review tier` は PR 側の workflow ファイルで動く**（#3363）。workflow を書き換えた PR は Low にならないので、Claude の手順ではこの経路に届かないが、守っているのは手順である。

ADR-3286 の導入後にマージした Low の PR は 39 本（うち routine の再生成が 7 本）で、作成からマージまでの中央値は 1.2 分である。10 分を超えたのは 4 本で、#3529 のほかに #3387・#3497 は draft を外すのが遅れ、#3425 は作成後にコミットを足している（遅れた理由までは調べていない）。ふだんの流れは速いので、解きたいのは速さではなく、マージがセッションの振る舞いに依存していることである。

**この設計で得られないもの。** workflow が保証するのは条件であって、変更の品質ではない。パスの分類・CI・記録の形式と鮮度は機械で確かめられるが、ローカルレビューの記録は自己申告のままである（ADR-3286）。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| Low の判定 | `tier.ts classify`（PR を作る前）と `tier.ts check --pr <n>`（`Review tier`、base 側の分類器） |
| 自動のマージ | 通常の Low は Claude が `gh pr merge --auto`。再生成の PR は routine が REST で head の SHA を固定してマージ（`regenerate-pr-flow.ts`） |
| 再利用できる判定 | `regenerate-pr-flow.ts` の `labelsAreLow`。`judgeChecks` は GitHub Actions が出した名前ごとの run をすべて見て、1 つでも失敗があれば fail にする（後の run に置き換えられた `cancelled` だけを除く）。`skipped` と `neutral` は通す。本設計の条件 4 にはそのまま使えない |
| `tier.ts check --pr` | SHA を受け取らず、`headRefOid` を自分で読む。規則違反も Issue を読めなかったことも同じ終了コード 1 になる。作業ツリーから読むのは `.coderabbit.yaml` だけで、ほかは SHA で読む |
| ruleset | required check は `Check`・`Validate`・`Reference docs`・`Playwright`・`verify`（`Review tier` は無い）。approval は 0、squash のみ、bypass actor なし、base に追いつくことは求めない |
| repo の設定 | `allow_auto_merge` が true。`squash_merge_commit_title` が `PR_TITLE` で、REST のマージも `<title> (#<n>)` になる |
| push で動く workflow | `deploy.yml`（すべての push）、`pages.yml`（`docs/**`）、`ci.yml`、`adr-validate.yml`、`at-check-coverage.yml`、`secret-scan.yml`、`verify-lockfile.yml` など |
| secret と environment | repository secret に `ADR_TOOLS_READ_TOKEN` など。environment は `github-pages`・`preview`。GitHub App のトークンを使う workflow はまだ無い |

## 制約・前提

- **`GITHUB_TOKEN` でマージすると push の workflow が起動しない。** ADR-3416 はこれを理由に「Actions が auto-merge を有効にする案」を却下した。Low でも `docs/guide/**` の変更がサイトに出なくなり（`pages.yml`）、`deploy.yml` も動かない。
- **新しい鍵を足すのは ADR-3416 の理由の 1 つを覆す。** ADR-3416 は「新しい鍵も bypass も足さない」を利点に挙げた。本設計は鍵を足すが、bypass は足さない。この点は kompiro の判断事項である（「未解決の問い」）。
- **repository secret は、同じ repo のブランチから動く `pull_request` の workflow でも読める。** workflow を書き換えて push するだけで読めるので、マージの鍵は branch を main に絞った environment に置く。
- **merge queue は使えない**（user 所有の repo。ADR-3416）。Actions の PR 作成は OFF のままで（ADR-1370）、本設計は PR を作らない。
- **GitHub の schedule は遅れることも飛ぶこともある。** 間隔は保証にならない。
- **分類器の確認が 1 つ減る。** Claude は `risk: low` を付けるだけになるので、分類器はマージの操作を見なくなる。分類器が見ていた文脈（そのマージを頼まれたか）は機械の条件に置き換わらない。Claude が Low の差分を作って PR を開けば、人が読まずに main に入る。これは今の auto-merge でも同じ経路だが、拒否されて止まる機会が無くなる。この経路の範囲は分類器の Low の規則で決まるので、Low の範囲を広げるときはこの点を再評価する。
- **範囲外。** Medium と High は従来どおり kompiro がマージする。Low の範囲を広げる話は扱わない（#3380）。

## 検討した選択肢

### マージの仕組み

#### 案1: workflow が条件を確かめ、REST で SHA を固定してマージする

main に固定した workflow が `risk: low` の open な PR を毎回すべて読み、条件がそろった PR を `PUT /pulls/{n}/merge` に `sha` を付けてマージする。

**メリット**

- 差分と記録の判定が main のコードで動き、PR がそれを書き換えられない。`Review tier` と同じ判定を merger が自分で実行するので、この workflow でのマージは #3363・#3364 を待たなくてよい
- 検査とマージのあいだに push があれば 409 で失敗する。確かめた差分だけがマージされる
- 再生成の PR ですでに動いている方式で（ADR-3416 が実環境で確かめた）、判定のコードを再利用できる

**デメリット**

- マージの名義に鍵が要る
- マージまでの待ちが GitHub の仕組みではなく、この workflow の起動に依存する

#### 案2: workflow が native の auto-merge を有効にする

条件を確かめて `gh pr merge --auto` を実行し、待つのは GitHub に任せる。

**メリット**

- 待つ処理を書かなくてよい。マージは required check の完了直後に走る

**デメリット**

- 判定は有効にした時点の 1 回だけで、マージの時点には走らない。GitHub がマージの時点で見るのは required check だけで、`Review tier` を required にしても（#3364）、その run は PR 側の workflow で動く（#3363）
- 有効にした後の push の扱いも GitHub 任せになる。今の手順が「push の前に auto-merge を解く」と書いているのはこのためである（TPL-3286）。`gh pr merge --match-head-commit` がマージの時点まで効くかは確かめていない
- 名義の問題は案1と同じで、なくならない

#### 案3: Claude の auto-merge を残し、#3364・#3363 を片付け、権限の allow ルールを足す

**メリット**

- 新しい workflow も鍵も要らない。#3364・#3363 はもともと予定している作業である

**デメリット**

- マージがセッションに依存したままで、セッションが途中で終われば止まる
- 分類器を通さないために `gh pr merge` を広く allow すると、Low 以外のマージも許すことになる。絞るには gh ラッパーに同じ判定を入れることになり、判定が 2 箇所に増える。allow ルールが auto mode の分類器より先に効くかも確かめていない

#### 案4: Claude の routine を短い周期で回してマージする

**メリット**

- 鍵を足さず、ユーザーの名義でマージできる（再生成の PR と同じ）

**デメリット**

- 解きたい問題である LLM の実行を経路に残す。定型の判定のために周期的に agent を動かすことになり、依存を install する無人の実行も増える（ADR-3416 の代償）

### マージの名義（案1を採る場合）

| | N1: GitHub App | N2: fine-grained PAT | N3: `GITHUB_TOKEN` + `workflow_dispatch` |
| --- | --- | --- | --- |
| push の workflow | 起動する | 起動する | 起動しない。merger が必要な workflow を列挙して起動する |
| 寿命 | トークンは 1 時間。鍵に期限なし | 期限の管理が要る | run の間だけ |
| 権限の幅 | Contents・Pull requests の write。`workflows` を渡さない | 同じ | job の `permissions` |
| マージの名義 | `<app>[bot]`。Low の経路を計測で分けられる（#3380） | kompiro。人のマージと見分けられない | `github-actions[bot]` |
| 準備 | kompiro が App を作り、install し、鍵を置く | kompiro が PAT を作って置く | なし |
| 主な弱み | 鍵の管理 | 期限切れで黙って止まる（失敗は run に出る） | push の workflow を足したときに列挙から漏れる。`deploy.yml` のような無条件の workflow の扱いも別に要る |

### 起動の仕方（案1を採る場合）

- **T1: 10 分ごとの cron だけ。** いちばん単純だが、今 1 分ほどのマージが平均でも 5 分以上になり、schedule の遅れがそのまま乗る。
- **T2: `workflow_run` を主にし、10 分ごとの cron を保険にする。** required check と `Review tier` の workflow の完了で起動する。`Review tier` は `labeled`・`edited`・`ready_for_review` でも走るので、ラベルの付与などは別のトリガーなしで拾える。対象の workflow の名前（skip の stub と、job 名が `Check` の `AT coverage check` を含む 11 個）を列挙するので、required check を足したときに書き忘れるとそこだけ cron に落ちるが、遅くなるだけで誤ってマージはしない。

## 比較

| 観点 | 案1 | 案2 | 案3 | 案4 |
| --- | --- | --- | --- | --- |
| マージが LLM に依存しない | はい | はい | いいえ | いいえ |
| 判定した差分とマージする差分が一致 | はい（SHA 固定） | 有効にした時点までは | required check に頼る | はい（SHA 固定） |
| マージの時点で記録と差分を判定する | はい | いいえ | #3364 が要る | はい |
| 判定のコードを PR が書き換えられない | はい | 有効にする時点は | #3363 が要る | はい |
| 新しい鍵 | 要る | 要る | 不要 | 不要 |
| 変更量 | 中 | 小〜中 | 小 | 中 |

## 現時点の方針

**案1 + N1（GitHub App）+ T2 を採用する。** 解きたいのはマージのセッション依存で、案3と案4はそれを残す。案2は待つ処理を省けるが、マージの時点の判定を手放す。名義は、期限切れで止まらず、鍵からトークンを 1 時間ごとに作るので漏れたトークンの寿命が短く、計測でも分けられる N1 を勧める。

### 動き

```
workflow_run（required check の完了）・10 分ごとの cron
  └→ judge job（読み取りだけの GITHUB_TOKEN。main を checkout し、PR の head は object として fetch するだけ）
       open な risk: low の PR をすべて読み、PR ごとに判定する
       出力: マージしてよい PR の number と sha / 拒否した PR の number と sha と理由コード
  └→ notify job（pull-requests: write の GITHUB_TOKEN。鍵なし、checkout なし）
       理由コードから決まった文面でコメントする。同じ head には重ねない
  └→ merge job（environment: main に絞る。App の鍵はここだけ。checkout なし）
       number と sha の形を検査し、ラベルを読み直して、sha を固定してマージ
```

イベントの中身は読まない。どのトリガーでも同じ走査をするので、起動の名前を PR が真似ても、走査が 1 回増えるだけである（TPL-3673）。`concurrency` で 1 本ずつ動かし、待ちは最新の 1 本だけにする。

再生成の PR（`isRegenerationPr` の 4 つの印）は走査から外す。routine が自分でマージするので、競合させない。印を偽っても外れるだけで、マージの側には倒れない。

### マージの条件（すべて満たすこと）

判定はすべて同じ head の SHA に対して行う。

1. PR が open で draft でなく、base が main で、head が同じ repo にある
2. `risk:` のラベルがちょうど `risk: low` の 1 つである
3. main の `tier.ts check --pr <n> --head <sha>` が通る。`--head` は新しく足すフラグで、PR の `headRefOid` が違えば、push が入っただけなので待ちとして扱う。差分が Low であること（base 側の分類器）、作成者が信頼リストにいること、記録が HEAD を覆っていることはここで確かめる。作業ツリーは main のままで、PR のファイルをディスクに置かず、実行もしない。`review-tier.yml` の「base に分類器が無ければ head のものを使う」fallback は持ち込まない
4. ruleset の required check が head の SHA で成功している。ruleset に required check が無ければ拒否する。`Review tier` は見ない（条件 3 が同じプログラムを main から実行する）。required でない check（preview など）も見ない。数え方は次のとおりで、`judgeChecks` を拡張するか別に書く
   - 同じ workflow の中では最新の結果だけを数え、workflow をまたぐとすべてを見る。`Check` は 3 つの workflow が出すので、最新だけでは本物の失敗を隠す。一方で全 run を見ると、同じ SHA でやり直して通った PR が止まったままになる
   - `skipped` と `neutral` は結果に数えない。draft のときの run は `skipped` で終わるので、これを通すと CI を走らせずにマージしうる（TPL-2643）。skip の stub は `success` を出すので影響しない。required check が `skipped` だけになる PR が実際に無いかはスライス A で確かめる
5. `mergeable` が true である。null なら待ち、false なら拒否する

条件 3 が見る記録は自己申告で、形式と鮮度しか確かめない。条件 4 は、workflow を書き換えられる書き込み権限の持ち主からは守れない（同じ repo のブランチの workflow は `checks: write` を要求して、別の commit に check run を作れる）。ruleset の required check も同じ前提で動いているので、本設計で弱くなるわけではない。

### 判定の 3 つの結果

| 結果 | 例 | 動き |
| --- | --- | --- |
| 待ち | check が走っている、`mergeable` が null、判定の途中で push が入った | 何もしない。run は成功 |
| 拒否 | check の失敗、差分が Low でない、記録が古い、ラベルが 2 つある、コンフリクト | 理由コードで PR に 1 回コメントする。run は成功 |
| 結論なし | GitHub の API の失敗、判定中の例外 | その PR をマージせず、残りの PR の判定は続け、最後に run を失敗にする（TPL-2786） |

このために `tier.ts` の `checkPr` を、規則違反と読めなかったことを分けて返す形に直す。今は `closes.unreadable` も規則違反と同じ扱いで、GitHub の一時的な失敗が誤った拒否のコメントになる。パスを読めない差分の節は、ADR-3286 のとおり High（拒否）のままにする。

マージの失敗は、409（head が変わった）なら次の run が判定し直すので失敗にしない。それ以外は残りの PR を処理してから run を失敗にする。

### 止め方

- **この PR を止める**: `risk: low` を外すか draft に戻す。merge job がラベルを読み直した後に外すと、そのマージは止まらない（`sha` が固定するのは head だけである）。
- **全体を止める**: `gh workflow disable` と、動いている run の `gh run cancel`。disable だけでは動いている run は止まらない。止めた後に、その間にマージされた PR が無いかを確かめる。Low の PR は open のまま残るだけで、何も壊れない。
- **コミットを足す**: `--disable-auto` の手順が要らなくなる。push で記録が HEAD を覆わなくなり、条件 3 が落ちる。push より先にマージされたら、差分は新しい PR で出す。

### 周りの変更

- **再生成の PR。** routine がマージを続ける（上の「動き」）。merger に任せるかはスライス D で判断する。任せるなら、`readiness()` の `pr.state` の判定、前日の PR のマージに失敗したときに `fetchMain()` を通らない経路、`paths.outputs` の変更を見て前日の PR をマージしない判定を先に直す必要がある。
- **Claude の手順。** `.claude/rules/adr.md`・`docs/process/review.md`・`docs/process.md` と、`kompiro/hane` の `start-dev` スキルから `gh pr merge --auto` と `--disable-auto` の手順を外す。`gh pr create --label "risk: low"` が「揃ったらマージしてよい」という依頼になる。ADR-3342 のゲートは変えない。`adr.md` が `Review tier` を required と書いている箇所も直す。
- **`allow_auto_merge` を切る。** 手順から外すだけでは、セッションや人が `--auto` を打てば条件 3 を通らずにマージできる（#3386 の経路）。スライス C の後に repo の設定で false にして、この経路を機械で閉じる。Medium と High は `Review tier` がすでに auto-merge を許していないので、影響するのは Low だけである。切った後は `Review tier` の auto-merge の規則と `tier.ts` のエラーの文面を片付ける。
- **#3364 と #3363。** #3364 は Medium と High の経路でも意味があるので、予定どおり進める。本設計の前提にはしない。#3363 は `allow_auto_merge` を切ると Low の経路で残る意味が無くなるので、スライス C の後に要否を見直す。

### スライス（実装ステップ）

| スライス | 前提 | 独立に出荷できる理由 |
| --- | --- | --- |
| **A** judge を dry-run で動かす。`tier.ts check` に `--head` と 3 つの結果を足し、条件 4 の数え方を書く | なし | 読み取りだけで、鍵もマージも無い。判定を job summary に出すだけで、Low の PR のマージの経路は変わらない |
| **B** App と environment を用意し、merge job と notify job を有効にする | A、kompiro の App の作成 | `--auto` は手順に残すので、merger が動かなければ今の経路でマージできる |
| **C** Claude の手順から `--auto` を外し、`allow_auto_merge` を切る | B | B で merger が単独でマージすることを確かめた後なので、外しても Low は止まらない |
| **D** 再生成の PR を merger に任せるかを判断する。#3363 の要否を見直す | C | routine のマージは独立に動き続けるので、急がない |

**native の auto-merge が先にマージするので、`--auto` を打つと A と B の確認ができない。** auto-merge は最後の required check の直後に走り（#3497 は `ready_for_review` の 3 秒後）、judge は `workflow_run` の後に open な PR だけを読むので、PR はふつう消えている。そこで A と B の間は、確認に使う Low の PR に次の順で `--auto` を遅らせる。

- A: PR を開き、judge の判定が job summary に出てから `--auto` を打つ。判定と自分の期待が食い違えば B に進まずに直す。5 本ほどで足りる
- B: `--auto` を打たずに PR を開き、merger のマージを待つ。30 分たっても入らなければ理由を見て `--auto` に戻す。下の「未確認」はこの間に確かめ、5 本続けて merger だけでマージできたら C に進む

### 実装の指針

1. 判定を `scripts/review/` に置き、GitHub と git を interface で渡して、ネットワークなしでテストする（`regenerate-pr-flow.ts` と同じ形）。条件ごとの拒否、結論を出せないときの失敗、required check が空のときの拒否、1 つの PR の失敗が残りの PR を止めないこと、同じ SHA でやり直して通った PR、`skipped` だけの required check をテストに持たせる（TPL-3286、TPL-2786、TPL-2643）。
2. workflow に path filter を付けない（TPL-1725）。judge job は依存を install しない。App の権限を workflow のコメントではなく App の設定として記録し、確かめ方を ADR に残す（TPL-2658）。
3. PR は `.github/workflows/**` に触れるので High で、`/security-review` を当てる。
4. `create-github-app-token` を足すときは `actions.lock` も更新する。
5. AT は作らない。挙動は vitest で固定し、実環境での確認（下の「未確認」）はスライス B の確認として Issue に書く（ADR-3271）。
6. ADR 昇格: スライス C の後に `docs/adr/3673-low-pr-merger-workflow.md` とする。ADR-3286 の Low の通す条件と ADR-3504 の手順を変え、ADR-3416 の「新しい鍵を足さない」を Low のマージについて覆すことを背景に書く。

### 未確認（スライス B で確かめる）

- **同じ repo のブランチの `pull_request` の workflow が、environment の鍵を読めないこと。** 鍵の置き場所の根拠そのものなので、最初に確かめる。読めるなら B に進まない
- environment の branch 制限が `workflow_run` と `schedule` の job を通すか
- App の名義のマージで `deploy.yml`・`pages.yml` などの push の workflow が起動するか
- App の名義のマージで `delete_branch_on_merge` が効くか（`adr.md` の後始末が頼っている）。squash の commit の author が誰になるか
- `require_extra_approval_for_unattributed_changes` が App のマージで approval を求めないか（ADR-3416 はユーザーの名義でだけ確かめた）
- `workflows` の権限を持たない App が、workflow を変える PR のマージを拒否されるか。拒否されるなら分類器が誤っても workflow の変更は入らない。されなくても、条件 3 で High として止まる
- コンフリクトした PR で `mergeable` が false と読め、REST のマージが何を返すか

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（repo の運用の変更）
- kompiro の作業: スライス B で App の作成・install・environment の作成と鍵の登録
- 計測: #3380 の Low の revert の計測に、App の名義のマージを使える

## Related TPLs

- [TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md): 条件 3 と SHA の固定。実装 PR で `known_consumers` に足す
- [TPL-2658](../test-perspectives/TPL-2658-agent-write-scope-is-declared-not-prompted.md): マージの権限を App と environment の宣言で絞る
- [TPL-2786](../test-perspectives/TPL-2786-guard-failure-must-fail-the-run.md): 結論を出せないときは失敗にする
- [TPL-1725](../test-perspectives/TPL-1725-gated-test-suite-detection-gap.md): docs だけの PR で merger が飛ばされないようにする
- [TPL-2643](../test-perspectives/TPL-2643-skip-reports-success-without-running.md): `skipped` を成功として数えない
- [TPL-3673](../test-perspectives/TPL-3673-privileged-workflow-treats-pr-as-data.md): 本 PR で起こす proactive TPL。judge と merge の job の分離、イベントの中身を読まないことの根拠

## 未解決の問い

1. **マージの名義と、新しい鍵を足すこと。** 案は N1（GitHub App）。ADR-3416 が避けた鍵を足す判断で、App の作成は kompiro の作業になる。kompiro の判断を待つ。
