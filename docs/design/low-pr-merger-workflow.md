# Low の PR を main に固定した workflow がマージする

- **日付**: 2026-11-07
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3673](https://github.com/kompiro/karasu/issues/3673)
  - 関連 ADR: [ADR-3286](../adr/3286-risk-based-review-tiers.md)（リスク段階。Low の通す条件を本設計が変える）、[ADR-3416](../adr/3416-regenerate-adr-index-daily-pr.md)（`GITHUB_TOKEN` の auto-merge を却下。新しい鍵を足さないことを理由の 1 つにした）、[ADR-2331](../adr/2331-adr-automerge-scope.md)、[ADR-3504](../adr/3504-low-adr-pr-without-draft.md)、[ADR-3342](../adr/3342-ready-gate-local-review.md)、[ADR-1370](../adr/1370-release-flow-actions-driven.md)
  - 関連 Issue: [#3364](https://github.com/kompiro/karasu/issues/3364)（`Review tier` を required にする）、[#3363](https://github.com/kompiro/karasu/issues/3363)（`Review tier` を main に固定する）、[#3380](https://github.com/kompiro/karasu/issues/3380)（段階の導入 1 か月後の計測）
  - 関連 TPL: [TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md)、[TPL-2658](../test-perspectives/TPL-2658-agent-write-scope-is-declared-not-prompted.md)、[TPL-2786](../test-perspectives/TPL-2786-guard-failure-must-fail-the-run.md)、[TPL-1725](../test-perspectives/TPL-1725-gated-test-suite-detection-gap.md)、[TPL-3673](../test-perspectives/TPL-3673-privileged-workflow-treats-pr-as-data.md)（本 PR で起こす）
  - コード: `scripts/review/tier.ts`、`scripts/adr/regenerate-pr-flow.ts`、`.github/workflows/review-tier.yml`

## 背景・課題

PR の段階はすでに機械が決めている（`scripts/review/tier.ts`）。しかし Low の PR を実際にマージまで運ぶのは Claude のセッションで、次の 3 点がそこに残っている。

- **Claude が手順を読んで `gh pr merge --auto` を実行し、auto mode の分類器がそれを許す必要がある。** 手元の記録（この環境に残る transcript のみ）では、128 回のうち 3 回が拒否された。理由は `Merge Without Review` が 1 回、`Unrequested Commit in a Connected App` が 2 回である。#3529 は作成の 6 秒後に拒否され、マージまで約 7 時間かかった。
- **native の auto-merge は required check しか待たない。** `Review tier` はまだ required ではない（#3364）ので、この check を待たずにマージしうる。
- **`Review tier` は PR 側の workflow ファイルで動く**（#3363）。workflow を書き換えた PR は Low にならないので、Claude の手順ではこの経路に届かないが、守っているのは手順である。

ADR-3286 の導入後にマージした Low の PR は 39 本で、作成からマージまでの中央値は 1.2 分である。10 分を超えたのは 4 本で、#3529 のほかに #3387・#3497 は draft を外すのが遅れ、#3425 は作成後にコミットを足している（遅れた理由までは調べていない）。ふだんの流れは速いので、解きたいのは速さではなく、マージがセッションの振る舞いに依存していることである。

**この設計で得られないもの。** workflow が保証するのは条件であって、変更の品質ではない。パスの分類・CI・記録の形式と鮮度は機械で確かめられるが、ローカルレビューの記録は自己申告のままである（ADR-3286）。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| Low の判定 | `tier.ts classify`（PR を作る前）と `tier.ts check --pr <n>`（`Review tier`、base 側の分類器） |
| 自動のマージ | 通常の Low は Claude が `gh pr merge --auto`。再生成の PR は routine が REST で head の SHA を固定してマージ（`regenerate-pr-flow.ts`） |
| 再利用できる判定 | `regenerate-pr-flow.ts` の `labelsAreLow`・`judgeChecks`（ruleset の required check と `Review tier` を、GitHub Actions が出した名前ごとの最新の run で見る）。ruleset に required check が無ければマージを拒否する |
| ruleset | required check は `Check`・`Validate`・`Reference docs`・`Playwright`・`verify`。approval は 0、squash のみ、bypass actor なし、base に追いつくことは求めない |
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

- 判定が main のコードで動き、PR が判定を書き換えられない。Low の経路では #3363 の穴が塞がる
- `Review tier` の結果を merger が自分で確かめるので、#3364 を待たずに Low の経路が塞がる
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

- GitHub が待つのは required check だけで、有効にした後の push の扱いも GitHub 任せになる。今の手順が「push の前に auto-merge を解く」と書いているのはこのためで、判定した差分とマージされる差分がずれうる（TPL-3286）
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
| 権限の幅 | Contents・Pull requests の write。`workflows` を渡さない | Contents・Pull requests の write | job の `permissions` |
| マージの名義 | `<app>[bot]`。Low の経路を計測で分けられる（#3380） | kompiro。人のマージと見分けられない | `github-actions[bot]` |
| 準備 | kompiro が App を作り、install し、鍵を置く | kompiro が PAT を作って置く | なし |
| 主な弱み | 鍵の管理 | 期限切れで黙って止まる（失敗は run に出る） | push の workflow を足したときに列挙から漏れる。`deploy.yml` のような無条件の workflow の扱いも別に要る |

### 起動の仕方（案1を採る場合）

- **T1: 10 分ごとの cron だけ。** いちばん単純だが、今 1 分ほどのマージが平均でも 5 分以上になり、schedule の遅れがそのまま乗る。
- **T2: `workflow_run` を主にし、10 分ごとの cron を保険にする。** required check と `Review tier` の workflow の完了で起動する。`Review tier` は `labeled`・`edited`・`ready_for_review` でも走るので、ラベルの付与などは別のトリガーなしで拾える。対象の workflow の名前（skip の stub を含む 10 個）を列挙するので、required check を足したときに書き忘れるとそこだけ cron に落ちるが、遅くなるだけで誤ってマージはしない。

## 比較

| 観点 | 案1 | 案2 | 案3 | 案4 |
| --- | --- | --- | --- | --- |
| マージが LLM に依存しない | はい | はい | いいえ | いいえ |
| 判定した差分とマージする差分が一致 | はい（SHA 固定） | 有効にした時点までは | required check に頼る | はい（SHA 固定） |
| `Review tier` を待つ | merger が確かめる | #3364 が要る | #3364 が要る | 自分で確かめる |
| PR が判定を書き換えられない | はい | 判定の時点は | #3363 が要る | はい |
| 新しい鍵 | 要る | 要る | 不要 | 不要 |
| 変更量 | 中 | 小〜中 | 小 | 中 |

## 現時点の方針

**案1 + N1（GitHub App）+ T2 を採用する。** 解きたいのはマージのセッション依存で、案3と案4はそれを残す。案2は待つ処理を省けるが、判定した差分とマージする差分が一致することを手放す。名義は、期限切れで止まらず、`workflows` の権限を渡さないことで鍵の幅を今のユーザーのトークンより狭くでき、計測でも分けられる N1 を勧める。

### 動き

```
workflow_run（required check / Review tier の完了）・10 分ごとの cron
  └→ judge job（読み取りだけの GITHUB_TOKEN。main を checkout）
       open な risk: low の PR をすべて読み、条件を確かめる
       └→ 条件がそろった PR の number と sha だけを出力
  └→ merge job（environment: main に絞る。App の鍵はここだけ）
       number と sha の形を検査し、ラベルを読み直して、sha を固定してマージ
```

イベントの中身は読まない。どのトリガーでも同じ走査をするので、起動の名前を PR が真似ても、走査が 1 回増えるだけである（TPL-3673）。`concurrency` で 1 本ずつ動かし、待ちは最新の 1 本だけにする。

### マージの条件（すべて満たすこと）

1. PR が open で draft でなく、base が main で、head が同じ repo にある
2. `risk:` のラベルがちょうど `risk: low` の 1 つである
3. main の `tier.ts check --pr <n>` が PR の head の作業ツリーで通る。差分が Low であること（base 側の分類器）、作成者が信頼リストにいること、記録が HEAD を覆っていることはここで確かめる。PR のファイルはデータとして読むだけで実行しない
4. ruleset の required check と `Review tier` が、head の SHA で成功している。ruleset に required check が無ければ拒否する。required でない check（preview など）は見ない。これらは失敗してもマージの判断に関わらないと ruleset が決めている

判定が結論を出せないとき（API の失敗、差分を読めないなど）はマージせず、run を失敗にする（TPL-2786）。条件がそろっていないだけのときは run を失敗にしない。

### 止め方と、止まったときの見え方

- **この PR を止める**: `risk: low` を外すか draft に戻す。今の `--disable-auto` より見て分かりやすい。
- **全体を止める**: `gh workflow disable`。Low の PR は open のまま残るだけで、何も壊れない。
- **コミットを足す**: `--disable-auto` の手順が要らなくなる。push で記録が HEAD を覆わなくなり、checks も pending に戻るので、条件 3・4 が落ちる。push より先にマージされたら、差分は新しい PR で出す。
- **拒否の理由**: check の失敗や差分が Low でないなど、待っても通らない理由なら、PR に 1 回だけコメントする（同じ head には重ねない）。待っているだけのときは何もしない。

### 周りの変更

- **再生成の PR。** これも `risk: low` なので merger の対象になり、routine と競合する。routine のマージが失敗しても、同じ SHA でマージ済みなら成功として扱う。その後、routine がマージをやめて merger に任せられるかを別に判断する（スライス D）。
- **Claude の手順。** `.claude/rules/adr.md`・`docs/process/review.md`・`docs/process.md` から `gh pr merge --auto` と `--disable-auto` の手順を外す。`gh pr create --label "risk: low"` が「揃ったらマージしてよい」という依頼になる。ADR-3342 のゲートは変えない。
- **`Review tier` の「Low でないのに auto-merge が有効」の規則は残す。** 人が手で有効にする経路が残るため。
- **#3364 と #3363。** #3364 は Medium と High の経路でも意味があるので、予定どおり進める。本設計の前提にはしない。#3363 は Low の経路が塞がることで残る価値が小さくなるので、スライス C の後に要否を見直す。

### スライス（実装ステップ）

| スライス | 前提 | 独立に出荷できる理由 |
| --- | --- | --- |
| **A** judge を dry-run で動かす。判定を `regenerate-pr-flow.ts` と共有する形に切り出す | なし | 読み取りだけで、鍵もマージも無い。判定の結果を job summary に出し、実際の Low のマージと見比べられる |
| **B** App と environment を用意し、merge job を有効にする。routine が merger のマージを成功として扱う | A、kompiro の App の作成 | Claude の `--auto` が残っていても、先に来た方がマージするだけで結果は同じ |
| **C** Claude の手順から `--auto` を外す | B | B で merger が単独でマージすることを確かめた後なので、外しても Low は止まらない |
| **D** routine がマージをやめるかを判断する。#3363 の要否を見直す | C | routine のマージは B の後も動くので、急がない |

A は Low を 10 本ほど見るまで dry-run のままにする。判定が実際のマージと食い違えば、B に進まずに直す。

### 実装の指針

1. 判定を `scripts/review/` に置き、GitHub と git を interface で渡して、ネットワークなしでテストする（`regenerate-pr-flow.ts` と同じ形）。条件ごとの拒否、結論を出せないときの失敗、required check が空のときの拒否をテストに持たせる（TPL-3286、TPL-2786）。
2. workflow に path filter を付けない（TPL-1725）。judge job は依存を install しない。App の権限を workflow のコメントではなく App の設定として記録し、確かめ方を ADR に残す（TPL-2658）。
3. PR は `.github/workflows/**` に触れるので High で、`/security-review` を当てる。
4. `create-github-app-token` を足すときは `actions.lock` も更新する。
5. AT は作らない。挙動は vitest で固定し、実環境での確認（下の「未確認」）はマージ後の確認として別 Issue にする（ADR-3271）。
6. ADR 昇格: スライス C の後に `docs/adr/3673-low-pr-merger-workflow.md` とする。ADR-3286 の Low の通す条件と ADR-3504 の手順を変え、ADR-3416 の「新しい鍵を足さない」を Low のマージについて覆すことを背景に書く。

### 未確認（スライス B で確かめる）

- `workflows` の権限を持たない App が、workflow を変える PR のマージを拒否されるか。拒否されるなら分類器が誤っても workflow の変更は入らない。されなくても、条件 3 で High として止まる
- App の名義のマージで `deploy.yml`・`pages.yml` などの push の workflow が起動するか
- `require_extra_approval_for_unattributed_changes` が App のマージで approval を求めないか（ADR-3416 はユーザーの名義でだけ確かめた）
- environment の branch 制限が `workflow_run` と `schedule` の job を通すか
- REST の squash のコミットタイトルが今の形（`<title> (#<n>)`）になるか

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（repo の運用の変更）
- kompiro の作業: スライス B で App の作成・install・environment の作成と鍵の登録
- 計測: #3380 の Low の revert の計測に、App の名義のマージを使える

## Related TPLs

- [TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md): 条件 3 と SHA の固定。実装 PR で `known_consumers` に足す
- [TPL-2658](../test-perspectives/TPL-2658-agent-write-scope-is-declared-not-prompted.md): マージの権限を App と environment の宣言で絞る
- [TPL-2786](../test-perspectives/TPL-2786-guard-failure-must-fail-the-run.md): 結論を出せないときは失敗にする
- [TPL-1725](../test-perspectives/TPL-1725-gated-test-suite-detection-gap.md): docs だけの PR で merger が飛ばされないようにする
- [TPL-3673](../test-perspectives/TPL-3673-privileged-workflow-treats-pr-as-data.md): 本 PR で起こす proactive TPL。judge と merge の job の分離、イベントの中身を読まないことの根拠

## 未解決の問い

1. **マージの名義と、新しい鍵を足すこと。** 案は N1（GitHub App）。ADR-3416 が避けた鍵を足す判断で、App の作成は kompiro の作業になる。kompiro の判断を待つ。
