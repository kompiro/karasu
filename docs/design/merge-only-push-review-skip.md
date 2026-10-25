# main の取り込みだけの push に CodeRabbit のレビューを使わない

- **日付**: 2026-10-25
- **ステータス**: 検討中
- **PR**: #3353
- **関連**:
  - 引き金 Issue: [#3341](https://github.com/kompiro/karasu/issues/3341)
  - 関連 ADR: [ADR-2898](../adr/2898-draft-first-code-review.md)（`auto_incremental_review: false` を一度却下している）、
    [ADR-2716](../adr/2716-coderabbit-request-changes-workflow.md)（approve までラウンドを回す到達状態）、
    [ADR-3340](../adr/3340-converge-fix-the-class.md)（ラウンドごとの修正の扱い）、
    [ADR-3011](../adr/3011-skip-coderabbit-label.md) / [ADR-3117](../adr/3117-coderabbit-ignore-command-for-skip.md)（PR ごと外す仕組み）
  - 関連 TPL: [TPL-2909](../test-perspectives/TPL-2909-pending-items-need-stable-ids-not-a-moving-window.md)、
    [TPL-3341](../test-perspectives/TPL-3341-carried-approval-needs-proof-nothing-new-to-review.md)（本 PR で起こす proactive TPL）
  - コード: `.coderabbit.yaml`、`scripts/coderabbit/review-state.ts`、`scripts/coderabbit/await-review.ts`、
    `.claude/skills/coderabbit-converge/SKILL.md`

## 背景・課題

並行する PR は、生成物で conflict しやすい。ADR の `docs/adr/effective.md` / `graph.md` / `graph/*.md`、
TPL の `README.md` は、ADR や TPL を足す PR のほぼすべてが触る。conflict すると、PR のブランチに main を
取り込み、生成物を作り直して push する。

いまの設定（`auto_incremental_review` は既定の `true`）では、この push のたびに CodeRabbit がレビューを
1 回走らせる。2026-10-24 には #3334 と #3336 がそれぞれこの 1 回を使い、#3334 は rate limit で 38 分待った。
どちらのレビューも指摘なしの approve だった。取り込みが正しいかどうかは、作り直して同じ中身になるかで
決まり、読んで判断するものではない。

あわせて、push が 5 回続くと CodeRabbit は自動レビューを止める（Reviews paused、
`auto_pause_after_reviewed_commits` の既定値 5）。止まった後は、push してもレビューは走らず、
`@coderabbitai review` で 1 回ずつ頼むしかない。待機スクリプト（`await-review.ts`）はこの状態を判定しないので、
来ないレビューをタイムアウト（30 分）まで待つ。#3336 と #3343 で実際に起きた。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| `.coderabbit.yaml` | `auto_review.enabled: true`、`drafts: false`。`auto_incremental_review` と `auto_pause_after_reviewed_commits` は既定（`true` / `5`） |
| ruleset（default branch） | `strict_required_status_checks_policy: false`（main に追いついている必要はない）、`dismiss_stale_reviews_on_push: true`（push で approve が取り消される）、approve は必須でない |
| 到達状態 | `docs/process.md`「人間のレビューは CodeRabbit が approve してから始める」: 最新の CodeRabbit のレビューが HEAD に対して `APPROVED`、未解決 thread 0 |
| 判定 | `review-state.ts` の `classify`: 最新のコミットレビューが HEAD に対する `APPROVED` なら `approved` |
| converge | 修正を push すると自動レビューを待つ。`limit_elapsed` のときだけ `@coderabbitai review` を投げる |
| main の取り込み | conflict が無ければ不要（strict でない）。ADR-2898 / 3052 / 3340 で、取り込みはラウンドの修正と同じ 1 回の push に含める |

## 制約・前提

- ready にした時点の初回レビューは、これまでどおり自動で走らせる（draft を外すことが合図、ADR-2898 / 3052）
- PR ごと CodeRabbit を外す仕組み（ignore コマンド、`skip-coderabbit` / `adr-auto-merge`）は変えない
- approve は required check ではなく、マージ許可でもない（ADR-2716）。変えるのは、自動化と人間が
  「レビューが収束した」とみなす到達状態の判定だけ
- 生成物以外のファイルで conflict した場合は、解消した中身が振る舞いに関わるので、レビューを求める
- **ADR-2898 が `auto_incremental_review: false` を却下している。** 理由は「converge はラウンドごとに
  `@coderabbitai review` を投げることになり、それも枠を使うので回数は減らず、手間だけ増える」。
  本 Doc はこの理由に答える必要がある（「検討した選択肢」の案 A）
- out of scope: 生成物そのものを conflict しにくくすること（行の並べ方や `.gitattributes` のマージドライバ）。
  別の Issue にする

## 検討した選択肢

### 案 A: `auto_incremental_review: false` にし、converge がレビューを明示的に頼む

- `.coderabbit.yaml` に `reviews.auto_review.auto_incremental_review: false` を置く。CodeRabbit が自動で
  レビューするのは、ready にした時点の初回だけになる
- converge は、修正を push したラウンドで `@coderabbitai review` を投げる（rate limit 中なら明けるまで待つ）。
  main の取り込みだけの push では投げない
- 到達状態の判定を広げる: 最後に approve されたコミット X から HEAD までが、base ブランチの取り込みだけで、
  取り込みで手を入れたのが作り直すと同じ中身になる生成物だけなら、X への approve を HEAD にも有効とみなす。
  push で approve は取り消される（`DISMISSED`）が、取り消された X への approve もこの判定では数える
- Reviews paused は起きなくなる（自動の再レビューそのものが無い）

ADR-2898 への答え: 却下の理由は「修正ラウンドの回数は減らない」で、それは今も正しい。修正ラウンドでは
自動でも手動でも 1 回使う。本案が減らすのは、レビューの要らない push（取り込みだけ）の 1 回で、これは
自動レビューを止めない限り減らせない。手間についても、push が 5 回続けば Reviews paused になり、実際には
すでに手で頼む運用になっている。converge が投げるなら、手間は人間に戻らない。

### 案 B: 取り込みの push の前後だけ、PR を CodeRabbit から一時的に外す

- 取り込みを push する前に `skip-coderabbit` ラベルを付け、push 後に外す
- `.coderabbit.yaml` のラベル除外が、PR を開いた後の push にも効くかは未確認。ADR-3117 は、ラベルだけでは
  PR を開いた時点の 1 回を止められなかったと記録している
- ラベルの付け外しが記録として紛らわしい（`skip-coderabbit` は「人間が承認して外した PR」の記録、ADR-3011）

### 案 C: 生成物を PR でコミットせず、main で生成する

- 生成物の conflict そのものが無くなる
- main での生成は bot のコミットになり、main への直接のコミットを禁じる運用（ADR-3335）や、
  pre-push の `adr-regenerate-check` と組み直しになる。変更の範囲が大きい
- 生成物以外の理由で main を取り込む場合（他のファイルの conflict）には効かない

### 案 D: 何もしない（取り込みの push ごとに 1 回使う）

- 2026-10-24 の 2 件のように、指摘なしの approve に 1 回と rate limit の待ちを使い続ける
- Reviews paused で来ないレビューを待つ問題は残る（待機スクリプトの判定を足せば別途直せる）

## 比較

| 観点 | A | B | C | D |
| --- | --- | --- | --- | --- |
| 取り込みだけの push の review 枠 | 使わない | 使わない（効けば） | conflict 自体が減る | 使う |
| Reviews paused の待ち | 起きない | 起きる | 起きる | 起きる |
| 生成物以外の conflict | converge が頼む | 人が判断して付け外し | 効かない | 自動でレビュー |
| 変更の範囲 | 設定 1 行・converge・判定 | 手順のみ | 生成の仕組みと運用 | なし |
| 機械的な判定 | merge-tree で可能 | 人の判断 | 不要 | 不要 |
| 確かめていないこと | 初回レビューが ready で走るか | ラベルが push に効くか | — | — |

## 現時点の方針

**案 A を採る。** 取り込みだけの push で枠を使わないことと、Reviews paused の待ちが無くなることの両方を、
設定 1 行と converge・判定の変更で得られる。B はラベルの効き方が未確認で、記録の意味も濁す。C は効果が
大きいが範囲も大きく、A と両立するので別に検討する。

### 「取り込みだけ」の判定（機械的に行う）

最後に approve されたコミットを X、HEAD を H とする。X から H までのコミットについて、次がすべて成り立てば
X への approve を H にも有効とみなす。

1. X は H の祖先で、X から H までの非マージのコミットが 1 つも無い（first-parent で辿ったコミットが
   すべて 2 親のマージ）
2. 各マージ M の 2 番目の親は base ブランチ（`origin/main`）の祖先である（main の取り込みである）
3. 各マージ M について、`git merge-tree --write-tree <M の 1 番目の親> <M の 2 番目の親>` が返す自動マージの
   結果の tree と M の tree の差分が、生成物のパスだけにある。conflict したファイルも生成物だけである
4. H で生成物を作り直すと、差分が出ない（`pnpm adr:regenerate` と TPL の索引の生成で `git status` が clean）
5. X への approve が取り消されている（`DISMISSED`）なら、取り消しは push による stale の取り消しである。
   PR の timeline の `ReviewDismissedEvent` で、取り消しが X から H までのどれかの push の時刻と一致し、
   人の手による取り消し（理由のメッセージ付き）でないことを確かめる。確かめられなければ持ち越さない（fail closed）

生成物のパスは、それを作る生成器と一緒に 1 か所に定義し、判定と再生成の両方がそこを参照する。

### 実装の手順（1 本の PR）

判定・設定・文言は互いに依存するので、Issue を分けずに 1 本の PR で入れる。

0. **CodeRabbit の挙動を確かめる（実装の前提）**: `auto_incremental_review: false` を入れた 1 本の PR で、
   (a) draft から ready にした時点で初回レビューが自動で走るか、(b) 修正の push の後に `@coderabbitai review` を
   投げるとレビューが走るかを確かめ、結果をこの Doc に書く。(b) が成り立たなければ案 A は採れないので、
   選択肢に戻る。(a) が成り立たないだけなら、converge の開始時に `@coderabbitai review` を投げて補う
1. **判定**: `review-state.ts` に「取り込みだけ」の判定と、`DISMISSED` になった X の approve を数える処理を足す。
   `classify` は X が approve され、X..H が取り込みだけなら `approved` を返す。git を使う部分は注入できる形にし、
   一時 repo の fixture でテストする
2. **converge と設定**: `.coderabbit.yaml` に `auto_incremental_review: false`。converge のラウンドは、
   修正を push したら `@coderabbitai review` を 1 回投げる（rate limit 中は明けるまで待つ）。取り込みだけの push では投げない
3. **到達状態の文言**: `docs/process.md` の到達状態に「取り込みだけの後の approve の持ち越し」を足す。決定は
   ADR-3341 に昇格し、ADR-2898 の却下理由への答えを残す

### 影響範囲・マイグレーション

- 設定を変えた時点で開いている PR は、次の修正の push から手動の依頼になる。converge が投げるので、人の作業は増えない
- 人間が手で push する PR（converge を使わない）では、修正の後に `@coderabbitai review` を投げる必要がある。
  `docs/process.md` に 1 文で書く

## 未解決の問い / 決めないこと

- **CodeRabbit の挙動（実装の手順 0 で確かめる）**: ready での初回レビューと、`@coderabbitai review` の
  受け付けの 2 つ。後者はこれまで「This command is applicable only when automatic reviews are paused」と
  応答していたので、incremental を切った PR で受け付けられるかが案 A の成否を決める
- **決めないこと**: 生成物を conflict しにくくする工夫（案 C や行の並べ方）は別の Issue にする
