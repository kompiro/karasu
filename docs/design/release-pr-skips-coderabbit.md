# リリース PR を CodeRabbit のレビューから外す

- **日付**: 2026-10-25
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3350](https://github.com/kompiro/karasu/issues/3350)
  - 観測した PR: [#3349](https://github.com/kompiro/karasu/pull/3349)（2026-10-25 のトレイン。rate limit でレビューされず、`CodeRabbit` のステータスは pass）
  - 関連 ADR: [ADR-2922](../adr/2922-monthly-release-train.md)（月次トレイン）、[ADR-1370](../adr/1370-release-flow-actions-driven.md)（リリース PR は人が開き、CHANGELOG を読んでマージする）、[ADR-3117](../adr/3117-coderabbit-ignore-command-for-skip.md)（外すのは本文の ignore コマンド、理由はラベルで記録）、[ADR-3011](../adr/3011-skip-coderabbit-label.md)（`skip-coderabbit` の判定基準）、[ADR-2949](../adr/2949-coderabbit-skips-adr-auto-merge.md)（`adr-auto-merge` で外す）、[ADR-2640](../adr/2640-coderabbit-pr-review.md)（`ignore_usernames` で bot の PR を外す）
  - 関連 TPL: [TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md)（レビューを省く判定は最終の差分で行う）、[TPL-2643](../test-perspectives/TPL-2643-skip-reports-success-without-running.md)（走らずに success を報告する gate）
  - コード: `scripts/release/train.mts`, `.github/workflows/release-prepare.yml`, `.coderabbit.yaml`

## 背景・課題

月次トレインのリリース PR（head `chore/release-YYYY-MM-DD`）にも CodeRabbit の自動レビューが走る。ところがリリース PR の差分には、CodeRabbit が見るべきものがない。

- 差分は `changeset version` が作ったもの（版の更新、`CHANGELOG.md` の追記、消費した `.changeset/*.md` の削除、lockfile）だけである。
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

- [TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md): 外す判定はリンクを作った時点の差分で決まり、そのあとのコミットを見ない。リリースブランチに生成物以外のコミットが足されたら外れたままになる。下の「最終の差分を確かめる」で扱う。
- [TPL-2643](../test-perspectives/TPL-2643-skip-reports-success-without-running.md): rate limit のときの「走らずに pass」の形。リリース PR では外すことで起きなくなる。

## 現時点の方針

**案1 を採用する。** リンクから開くだけで 1 回目のレビューから外れ、外した理由がラベルに残る。ADR-3117 の形をそのまま使うので、新しい仕組みを足さない。

### 最終の差分を確かめる（TPL-3286）

外す根拠は「差分が `changeset version` の生成物だけ」なので、それをマージの直前まで確かめる。CI に、head が `chore/release-*` の PR だけで走るチェックを足す。`git diff --name-status origin/main...HEAD` の全行が次のどれかでなければ失敗させる。

- `.changeset/*.md` の削除
- `packages/*/CHANGELOG.md` の追加・変更
- `packages/*/package.json` の変更
- `pnpm-lock.yaml` の変更

失敗したときのメッセージで、本文の行とラベルを残したまま full review を頼む手順（docs/process.md の「CodeRabbit を外す小さな PR」と同じ）を案内する。`package.json` は version 以外の行も変えうるが、ファイル単位で見る。`changeset version` が package.json で変えるのは version と内部依存の版だけで、行単位の判定は過剰と判断した。

### 実装の指針

1. `scripts/release/train.mts`
   - `composeReleasePrBody({ issue, bumps, date })` を足す。最後の行が ignore コマンドの本文を返す。
   - `composeTrainIssueBody` が compare リンクに `title` / `body` / `labels` を URL エンコードして付ける。Issue 番号を受け取る引数を足す。
   - 生成物かどうかを判定する純粋関数（`isReleaseArtifactChange` など）を足し、上のチェックから呼ぶ。
   - `scripts/release/train.test.ts` で、リンクのパラメータと判定を固める。
2. `.github/workflows/release-prepare.yml`: Issue を作ったあと、番号を入れた本文で `gh issue edit` する。
3. 最終の差分のチェック: `ci.yml` に、head が `chore/release-*` のときだけ走るジョブを足す（required にはしない）。
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
