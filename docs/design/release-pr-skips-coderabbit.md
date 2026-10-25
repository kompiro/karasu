# リリース PR を CodeRabbit のレビューから外す

- **日付**: 2026-10-25
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3350](https://github.com/kompiro/karasu/issues/3350)
  - PR: [#3354](https://github.com/kompiro/karasu/pull/3354)
  - 観測した PR: [#3349](https://github.com/kompiro/karasu/pull/3349)（2026-10-25 のトレイン。rate limit でレビューされず、`CodeRabbit` のステータスは pass）
  - 関連 ADR: [ADR-2922](../adr/2922-monthly-release-train.md)（月次トレイン）、[ADR-1370](../adr/1370-release-flow-actions-driven.md)（リリース PR は人が開き、CHANGELOG を読んでマージする）、[ADR-3117](../adr/3117-coderabbit-ignore-command-for-skip.md)（外すのは本文の ignore コマンド、理由はラベルで記録）、[ADR-3011](../adr/3011-skip-coderabbit-label.md)（`skip-coderabbit` の判定基準）、[ADR-2949](../adr/2949-coderabbit-skips-adr-auto-merge.md)（`adr-auto-merge` で外す）、[ADR-2640](../adr/2640-coderabbit-pr-review.md)（`ignore_usernames` で bot の PR を外す）
  - 関連 TPL: [TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md)（レビューを省く判定は最終の差分で行う）、[TPL-2643](../test-perspectives/TPL-2643-skip-reports-success-without-running.md)（走らずに success を報告する gate）、[TPL-2786](../test-perspectives/TPL-2786-guard-failure-must-fail-the-run.md)（判定できないときは通過ではなく失敗にする）
  - コード: `scripts/release/train.mts`, `.github/workflows/release-prepare.yml`, `.coderabbit.yaml`

## 背景・課題

月次トレインのリリース PR（head `chore/release-YYYY-MM-DD`）にも CodeRabbit の自動レビューが走る。ところがリリース PR の差分には、CodeRabbit が見るべきものがない。

- 差分は `pnpm version-packages`（`changeset version` と `pnpm install --lockfile-only`）が作ったもの（版の更新、`CHANGELOG.md` の追記、消費した `.changeset/*.md` の削除）だけである。lockfile も更新の対象だが、直近 5 本のリリース PR（#3349・#3239・#2981・#2921・#1781）では一度も変わっていない。
- `CHANGELOG.md` の各項目は、その changeset を足した PR ですでにレビューを通っている。
- リリース PR のレビューは、人が版と CHANGELOG を読んでからマージすること（ADR-1370）で、自動レビューではない。

それでもレビューは CodeRabbit の枠（1 時間に 1 回）を使う。#3349 ではレビューが rate limit に当たって走らなかったのに、`CodeRabbit` のステータスは pass になり、レビュー済みに見えた（TPL-2643 の形）。リリース PR からレビューを外せば、枠を使わず、「pass だがレビューされていない」状態も生まれない。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| リリース PR を開く人 | メンテナ。Actions は PR を作れない（#1370）。トラッキング Issue の compare リンク（`compare/main...chore/release-<date>?expand=1`）から開く（`composeTrainIssueBody`） |
| リリース PR の本文とラベル | 開く人が毎回手で書く。決まった形は無い（#3239 と #3349 は Claude が書いた） |
| CodeRabbit を外す手段 | 本文の ignore コマンド（ADR-3117）。理由はラベルで記録する（`adr-auto-merge` / `skip-coderabbit`）。`.coderabbit.yaml` の `auto_review.labels` のラベル除外は、本文に書き忘れたときの後ろ盾 |
| bot の PR | `ignore_usernames`（Dependabot / Renovate）で外す。リリース PR は人が開くので当たらない（ADR-2640） |
| `release` ラベル | トラッキング Issue 用。Prepare の C1 と `close-train` は `gh issue list --label release` で Issue を探す |

## 制約・前提

- **PR は人が開く。** Actions の PR 作成は OFF のまま（ADR-1370）。外す仕組みは、人がリンクから開いたときに効く必要がある。
- **外すのは PR を開いた時点で効く手段にする。** ラベルの除外は、PR を開いた時点の 1 回目のレビューを止められない（ADR-3117）。本文の ignore コマンドは PR の作成と同時に存在するので、1 回目から止まる。
- **場所で判定しない。** タイトルのキーワードで外す案は ADR-2949 と ADR-3117 が却下した。判定は差分の性質で行う（ADR-2331）。
- **判定は最終の差分で行う（TPL-3286）。** 開いた時点で外しても、そのあとリリースブランチに `changeset version` の出力でないコミットが足されたら、外す根拠が崩れる。
- **ignore コマンドの文字列は、外す PR の本文以外に書かない**（#3012）。この Design Doc の PR の本文にも書かない。
- out of scope: rate limit に当たったのに `CodeRabbit` のステータスが pass になる件そのもの（CodeRabbit 側の挙動）。外せばリリース PR では起きなくなるが、他の PR では残る。

## 検討した選択肢

### 案1: compare リンクに本文とラベルを入れておく（推奨）

GitHub の compare ページは、クエリパラメータ `title` / `body` / `labels` を PR 作成フォームの初期値にする。Prepare がトラッキング Issue に載せる compare リンクに、次を入れておく。

- `title`: `chore(release): release train YYYY-MM-DD`
- `body`: 版の表、`Refs #<トラッキング Issue>`、マージで何が走るか、最後の行に ignore コマンド
- `labels`: 外した理由を記録するラベル（新設の `release-pr`）

`.coderabbit.yaml` の `auto_review.labels` に `!release-pr` を足し、本文の行を消して開いたときの後ろ盾にする。ADR-3117 と同じ「本文で外し、ラベルで記録し、ラベル除外を後ろ盾にする」形になる。

本文に Issue 番号を入れるため、Prepare は Issue を作ってから、その番号を入れた compare リンクで Issue の本文を書き直す（`gh issue create` → `gh issue edit --body-file`）。

**メリット**

- リンクから開くだけで外れる。人が覚えておくことが増えない。
- PR の本文とタイトルが毎回同じ形になる。版の表と Issue へのリンクを手で写さずに済む。
- 外した PR を `gh pr list --label release-pr --state all` で一覧できる。

**デメリット**

- 開く人が本文を消したり、リンクを使わずに開いたりすると、1 回目のレビューは止まらない（ラベルも付かないので後ろ盾も効かない）。docs/release.md に「Issue のリンクから開く」と書いて補う。
- `labels` パラメータは、ラベルを付ける権限がある人にだけ効く。メンテナには権限がある。

### 案2: タイトルのキーワードで外す（`ignore_title_keywords`）

`chore(release): release train` をキーワードにする。手順は何も変わらない。

ADR-2949 と ADR-3117 が却下した形そのもの。タイトルは場所であって差分の性質ではなく、同じタイトルで別の中身の PR を開けば一緒に外れる。不採用。

### 案3: 生成物のパスを `path_filters` で外す

`packages/*/CHANGELOG.md` と `.changeset/*.md` をレビューの対象から外す。

全ての PR からこれらのファイルが見えなくなる。changeset の文面は、利用者向けの説明としてレビューしてほしいもの（`.claude/rules/changesets.md`）なので、外すと困る。不採用。

### 案4: 開く人が手で ignore コマンドを書く

チェックリストに「本文の最後に ignore コマンドを書く」と足すだけ。

毎月の手作業で、忘れると 1 回目のレビューが走る。案1 なら同じことをリンクがやる。不採用。

## 比較

| 観点 | 案1 | 案2 | 案3 | 案4 |
| --- | --- | --- | --- | --- |
| 1 回目のレビューを止める | 止まる | 止まる | 一部（package.json と lockfile は残る） | 書き忘れると止まらない |
| 判定の根拠 | リンクが生成物の PR を開く | タイトル（場所） | パス（全 PR に効く） | 人の記憶 |
| 過去の決定 | ADR-3117 と同じ形 | ADR-2949 / 3117 が却下 | changeset のレビューを失う | ADR-3117 と同じ形 |
| 変更量 | `train.mts`・workflow・yaml・docs | yaml 1 行 | yaml 2 行 | docs のみ |

## Related TPLs

- [TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md): 外す判定はリンクを作った時点の差分で決まり、そのあとのコミットを見ない。リリースブランチに生成物以外のコミットが足されたら外れたままになる。下の「最終の差分を確かめる」で、マージ直前の差分を required なチェックで確かめ、どの規則にも当たらない変更を失敗に倒す。
- [TPL-2786](../test-perspectives/TPL-2786-guard-failure-must-fail-the-run.md): チェックの job が途中で落ちたら commit status が `pending` のまま残ってマージが止まるようにする。Prepare が Issue の本文を更新できなかったときもジョブを失敗させる。
- [TPL-2643](../test-perspectives/TPL-2643-skip-reports-success-without-running.md): rate limit のときの「走らずに pass」の形。リリース PR では外すことで起きなくなる。また、外した状態を解いた（ラベルや本文の行を外した）ときに最終差分のチェックが再実行されるよう、workflow の types に `labeled` / `unlabeled` / `edited` を入れる。

## 現時点の方針

**案1 を採用する。** リンクから開くだけで 1 回目のレビューから外れ、外した理由がラベルに残る。ADR-3117 の形をそのまま使うので、新しい仕組みを足さない。

### 最終の差分を確かめる（TPL-3286）

外す根拠は「差分が `changeset version` の生成物だけ」なので、それをマージの直前まで確かめる。チェックは全ての PR で走り、次の 2 つで失敗させる。それ以外の PR では何もせずに通す。

1. `release-pr` ラベルが付いているのに、head が `chore/release-*` でない。ラベルはリリース PR を外した記録なので、別の PR に付けば、最終差分のチェックを通らないまま外れてしまう。本文に ignore コマンドの文字列を含むだけではここで失敗させない。`adr-auto-merge` と `skip-coderabbit` の PR も同じ行を持ち、それぞれの判定（ADR-2331・ADR-3011）で外しているため。
2. head が `chore/release-*` で、レビューから外れている（本文のどこかに ignore コマンドの文字列を含むか、`release-pr` ラベルが付いている）のに、PR の差分が次の規則にすべて当たらない。差分は、イベントの `pull_request.base.sha` と `pull_request.head.sha` の merge-base と head の差分（三点の `base...head`。GitHub の PR の差分と同じ範囲）で取る。checkout は `fetch-depth: 0` にして、merge-base の計算に要る祖先の履歴をすべて取る。既定の浅い checkout では共通の祖先が無く、`git merge-base` が判定の前に失敗するため。全履歴を取るのは 2 の対象の PR だけで、対象かどうか（ラベル・本文・head のブランチ名）はイベントの payload だけで先に決めるので、ほかの PR では checkout もしない。ローカルの `origin/main` には頼らない。どの規則にも当たらない変更は失敗に倒す（TPL-3286）。

本文は「最後の行が ignore コマンドか」ではなく「本文のどこかにその文字列を含むか」で判定する。CodeRabbit は文脈を区別せず、引用や説明として書かれた文字列でも PR を外す（#3012）。行で判定すると、行の途中に書かれた PR はレビューから外れたままチェックの対象にならない。

差分は `git diff --name-status` の種類（追加 `A`・変更 `M`・削除 `D`）ごとに、次の規則のどれかに当たるかを見る。rename・copy・type change（`R` / `C` / `T`）は、どの規則にも当たらないので失敗にする。

- `.changeset/<name>.md` の削除（`D`）。`.changeset/README.md` は除く。`.changeset/config.json` と `.changeset/changelog.cjs` の変更も規則に当たらないので失敗にする
- `packages/*/CHANGELOG.md` の追加・変更（`A` / `M`）
- `packages/*/package.json` の変更（`M`）のうち、`version` の値だけが変わったもの。前後の JSON を比べ、ほかのキーの値の変更や、キーの追加・削除は失敗にする（`scripts` や `exports`、依存の追加を見逃さないため）。workspace 内の依存はすべて `workspace:*` で書いてあり、`changeset version` は書き換えない（#3349 の差分でも、package.json で変わったのは `version` だけだった）
- `pnpm-lock.yaml` は変わらないこと（どの種類の差分も失敗）。workspace 内の依存は `link:` で解決されるので、`changeset version` の後の `pnpm install --lockfile-only` で lockfile は通常変わらない（背景に挙げた 5 本でも変わっていない）。変わった場合は失敗にして、失敗のメッセージで「正当な変化なら、変わった範囲を確かめて規則を広げる」と案内する。規則に当たらない入力を通す側に倒さないため（TPL-3286）

チェックそのものは PR から書き換えられない revision で走らせる。PR の head にある判定のコードを使うと、リリースブランチに足したコミットが `scripts/release/train.mts` を弱めて、生成物でない差分を通せてしまう。

- trigger は `pull_request_target` にする。GitHub は workflow の定義を base ブランチから読むので、PR が workflow を書き換えてもその PR のチェックには効かない。
- 結果は、PR の head のコミット（`pull_request.head.sha`）に commit status として付ける。`pull_request_target` の run は base ブランチのコミットで走るので、job の check run が head のコミットに付く保証が無く、required として満たされないおそれがある（このリポジトリに前例が無く、確証が取れなかった）。job の最初に status を `pending` で付け、判定のあとで `success` か `failure` に更新する。job が途中で落ちたときは `pending` が残り、マージは止まる側に倒れる（TPL-2786）。required にするのはこの status の context（例 `Release PR scope`）で、名前は固定する。
- `permissions` は `contents: read`・`pull-requests: read`・`statuses: write` だけにし、secret は使わない。
- 判定のスクリプト（`scripts/release/train.mts`）は `pull_request.base.sha` を checkout して使う。PR の head は `git fetch origin refs/pull/<n>/head` で取り込み（fork の PR でも同じ ref で取れる）、差分と `package.json` の前後の中身をデータとして読むだけにする。head のコードは実行しない（`pull_request_target` で head を checkout して実行しない、という GitHub の注意に沿う）。依存のインストールも要らない（`train.mts` は Node の type stripping で動き、node の builtin だけを import する）。Node は `release-prepare.yml` と同じく `actions/setup-node` で `node-version: "24"` に固定する。type stripping はフラグなしで有効になる版なので、`--experimental-strip-types` は付けない。
- head のリポジトリが base と同じであることも 2 の条件に含める。fork の PR はブランチ名を `chore/release-*` にでき、本文に ignore コマンドの行も書けるので、レビューから外れている fork の PR はブランチ名にかかわらず失敗させる。
- workflow と `scripts/release/` の変更そのものは、通常の PR として CodeRabbit とメンテナのレビューを通る（それらはリリース PR の生成物ではないので、リリース PR に入れば 2 で失敗する）。CODEOWNERS は置いていない（メンテナが 1 人で全てのマージを見る）。

失敗したときのメッセージで、本文の行とラベルを外して通常のレビューに戻す手順（本文の行とラベルを残したまま full review を頼み、届いてから外す。docs/process.md の「CodeRabbit を外す小さな PR」と同じ）を案内する。外した後はチェックの対象から外れるので通る。

このチェックは required にする。失敗してもマージできるなら、外したまま生成物でない変更がマージされうるからである。required の status は全ての PR で報告される必要があるので、専用の軽い workflow にして全ての PR で走らせ、対象でない PR では何もせずに通す。既存の required な `Check`（`ci.yml`）に入れない理由は 2 つある。`ci.yml` は md だけの PR では動かない（`paths-ignore`）。そして types に `labeled` / `unlabeled` / `edited` が無いので、ラベルや本文の行を外しても再実行されず、失敗が残る（TPL-2643）。専用の workflow の types には `opened` / `synchronize` / `reopened` / `edited` / `labeled` / `unlabeled` を入れる。

### 実装の指針

1. `scripts/release/train.mts`
   - `composeReleasePrBody({ issue, bumps, date })` を足す。最後の行を ignore コマンドにした本文を返す。
   - `composeTrainIssueBody` が compare リンクに `title` / `body` / `labels` を付ける。エンコードは `encodeURIComponent` で行う（`URLSearchParams` は空白を `+` にし、本文の `+` と区別できない）。Issue 番号を受け取る引数を足す。
   - 生成物かどうかを判定する純粋関数（`isReleaseArtifactChange` など）を足し、上のチェックから呼ぶ。
   - `scripts/release/train.test.ts` で、リンクのパラメータと判定を固める。
2. `.github/workflows/release-prepare.yml`: Issue を作ったあと、番号を入れた本文で `gh issue edit` する。本文の更新に失敗したら、リンクの無い Issue が残るのでジョブを失敗させる（TPL-2786）。
3. 最終の差分のチェック: 専用の workflow（例 `release-pr-scope.yml`、`pull_request_target`）を足し、全ての PR で走らせる。判定は `scripts/release/train.mts` の純粋関数で行う。workflow のマージ後に、main ruleset の required status checks へ足す（先に足すと、この workflow が無い PR がマージできなくなる。順序は #1866 の E2E の required 化と同じ）。足す前に、試しの PR で status が head のコミットに付き、PR の checks に出ることを確かめる。
4. `.coderabbit.yaml`: `auto_review.labels` に `!release-pr` を足し、コメントで理由と ADR を指す。
5. `release-pr` ラベルを作る（`gh label create release-pr`）。
6. ドキュメント:
   - `docs/release.md` の「リリースの流れ」: Issue のリンクから開くと、本文とラベルが入って CodeRabbit から外れる。リリースブランチに手でコミットを足したら full review を頼む。
   - `docs/process.md` の「CodeRabbit を外す小さな PR」: 外す理由のラベルに `release-pr` を加える（判定はリンクが行い、人の承認は要らない）。
7. マージ後の確認は別 Issue にする（ADR-3271）: 2026-11-29 のトレインで、リンクから開いた PR に CodeRabbit のレビューが走らず、ラベルが付き、最終の差分のチェックが通ること。
8. ADR 昇格: 実装の完了後、`docs/adr/3350-release-pr-skips-coderabbit.md` として昇格し、本 Design Doc は同じ PR で削除する。ADR-3117 と ADR-2922 への関係を frontmatter に書く。

### 影響範囲・マイグレーション

- メンテナの作業: 変わらない（Issue のリンクから PR を開き、CHANGELOG を読んでマージする）。本文を書く手間が減る。
- 臨時のリリース（`workflow_dispatch`）も同じ Issue とリンクを作るので、同じく外れる。
- ドキュメント更新: `docs/release.md`、`docs/process.md`、`.coderabbit.yaml` のコメント。
