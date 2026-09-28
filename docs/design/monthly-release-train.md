# 月次リリーストレイン

- **日付**: 2026-09-27（2026-09-28 改訂: #2939 の完了と independent versioning の維持を反映）
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2922](https://github.com/kompiro/karasu/issues/2922)
  - 先行 Issue: [#2939](https://github.com/kompiro/karasu/issues/2939)（git tag / GitHub Release。完了、[ADR-2939](../adr/2939-release-record-tags-and-github-release.md)）
  - 分離した Issue: [#2940](https://github.com/kompiro/karasu/issues/2940)（拡張の週次 pre-release）
  - PR: [#2923](https://github.com/kompiro/karasu/pull/2923)
  - 直前のリリース: [#2921](https://github.com/kompiro/karasu/pull/2921)（karasu 0.7.0 / @karasu-tools/core 0.3.0 / karasu-vscode 0.2.0）
  - 関連 ADR: [ADR-1370](../adr/1370-release-flow-actions-driven.md)（Prepare → release PR → マージで publish）、[ADR-1316](../adr/1316-vscode-marketplace-publish.md)（Marketplace publish は手動 `workflow_dispatch`）、[ADR-1758](../adr/1758-vscode-changeset-versioning.md)（拡張を changesets の版管理に載せ、Marketplace publish の自動発火を却下）、[ADR-2939](../adr/2939-release-record-tags-and-github-release.md)（パッケージのタグと `release-YYYY-MM-DD` の GitHub Release）
  - 関連 TPL: [TPL-2786](../test-perspectives/TPL-2786-guard-failure-must-fail-the-run.md)（判定不能は通過ではなく失敗として扱う）
  - コード: `.github/workflows/release-prepare.yml`, `.github/workflows/release.yml`, `.github/workflows/vscode-release.yml`

## 背景・課題

リリースは、メンテナが **Release — Prepare** を思い出して起動したときにだけ出る。2026-06-25 の次のリリースは 2026-09-27 で、その間に changeset が約 150 件たまり、1 回のリリースに 3 か月分の変更が載った（#2921）。CHANGELOG を読んでからマージするというレビュー関門（ADR-1370）も、この分量では形だけになる。

加えて VS Code 拡張は別の手動起動（`vscode-release.yml`）が要り、npm を出したあとに拡張の公開を忘れる余地がある。

小さく、予測できる間隔でリリースしたい。メンテナの決定は次の 3 点（#2922）:

1. **毎月の最終日曜**に発車する。個人プロジェクトなので、週末に出して問題対応が遅れても構わない。
2. **準備まで自動化**する。スケジュールで Prepare を走らせ、トラッキング Issue を立てる。PR を開く・CHANGELOG を読む・マージするのは人。
3. **VS Code 拡張も同じトレインに載せる**。npm 公開のあと、拡張の版が上がっていれば Marketplace 公開も自動で続ける。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| `release-prepare.yml` | `workflow_dispatch` のみ。`changeset version` → `chore/release-<karasu version>` を push。pending changeset が無ければ no-op。`permissions: contents: write` |
| release PR | Actions は PR を作れない（#1370）。人が「Compare & pull request」で開く。人が開くことで必須チェックが走る |
| `release.yml` | `push: main` + `paths: packages/**/CHANGELOG.md` で発火し、`changeset publish` で npm に公開（OIDC）。続く `record` ジョブが公開できたパッケージのタグを push し、`release-YYYY-MM-DD` の GitHub Release を作る（ADR-2939） |
| `vscode-release.yml` | `workflow_dispatch` のみ（`pre_release` input）。拡張の現在の版を設定したコミット（リリースコミット）からビルドし、Marketplace へ publish（Entra ID + GitHub OIDC）。成功したら `record` ジョブが `karasu-vscode@X.Y.Z` を打ち、同じコミットの Release に拡張の節を加える（ADR-2939） |
| 月次 Issue の先例 | `tpl-review.yml` が `schedule` + `issues: write` + `gh issue create` で毎月 Issue を立てている |
| リリースの記録 | パッケージのタグ `<name>@<version>` と GitHub Release `release-YYYY-MM-DD` が公開の成功後に自動でできる。2 つの workflow の `record` ジョブは concurrency グループ `release-record` で直列。過去 6 回分も後付け済み（ADR-2939） |
| 版の管理 | パッケージごとに独立（ADR-1315 / ADR-1758 を維持。lockstep 化の [#2936](https://github.com/kompiro/karasu/issues/2936) は採らなかった）。リリースで CLI が上がるとは限らない |

## 制約・前提

- **main ruleset**: PR 必須・squash のみ・直 push 不可・bypass なし。自動化は main へ直接書けない。
- **Actions の PR 作成は OFF のまま**（#1370 / ADR-1370）。今回もこの設定は変えない。
- **マージは人が行う**。CHANGELOG を読んでからマージする関門を残す（promotion gate の確認もここで行う — ADR-1820）。
- **GitHub の cron は「最終日曜」を直接書けない**。さらに day-of-month と day-of-week を両方指定すると **OR** で評価される（`0 0 22-31 * 0` は「22〜31 日」**または**「日曜」になる）。
- **Marketplace の認証は federated credential の subject `repo:kompiro/karasu:ref:refs/heads/main` に依存する**（ADR-1316）。呼び出し方を変えても、この subject で OIDC トークンが出ることを確かめる必要がある。
- **リリースブランチ名に CLI の版を使えない**。今の Prepare は `chore/release-<karasu の版>` を作るが、版は独立しているので、CLI が上がらない月は前回と同じ名前になる（前回のブランチが残っていれば push が衝突する）。
- out of scope: リリースの**マージ**の自動化。拡張の pre-release チャネルは [#2940](https://github.com/kompiro/karasu/issues/2940) で扱う（「別 Issue で扱うこと」参照）。

## 検討した選択肢

### A. 発車のトリガ

#### A1: 毎週日曜の cron + 「最終日曜か」を判定するステップ（採用）

`cron: "0 0 * * 0"`（日曜 00:00 UTC = 09:00 JST）で毎週起動し、最初のステップで「7 日後が翌月か」を判定する。`workflow_dispatch` のときは判定を飛ばす（手動の臨時リリースは今までどおり出せる）。

判定のステップで `exit 0` しても止まるのはそのステップだけで、後続のステップは走る。そこで判定を出力にし、後続のすべてのステップ（C1 の確認、version と push、Issue の作成）をその出力で条件付ける。

```yaml
- name: Decide whether this run departs
  id: train
  run: |
    if [ "${{ github.event_name }}" = "schedule" ] &&
       [ "$(date -u -d '+7 days' +%m)" = "$(date -u +%m)" ]; then
      echo "::notice::Not the last Sunday of the month: skipping."
      echo "depart=false" >> "$GITHUB_OUTPUT"
    else
      echo "depart=true" >> "$GITHUB_OUTPUT"
    fi
# 以降の各ステップ: if: steps.train.outputs.depart == 'true'
```

- メリット: 暦のずれを考えずに済む。判定が 1 行で読める。月の最終日曜を取りこぼさない。
- デメリット: 月に 3〜4 回は空振りの実行が出る（数秒で終わる）。

#### A2: 日付範囲と曜日を併記した cron

`0 0 22-31 * 0` のように書く案。上記のとおり GitHub の cron は OR で評価するため、**毎週日曜と 22〜31 日の毎日**に発火してしまう。成立しない。

#### A3: 毎月 1 日など固定日に起動

実装は最も簡単だが、決定（最終日曜）と違う。却下。

### B. 準備後の人への引き渡し

#### B1: トラッキング Issue を立てる（採用）

Prepare がブランチを push したあと、同じジョブで Issue を立てる（`permissions` に `issues: write` を足す）。Issue には次を載せる:

- PR を開くための compare リンク（`https://github.com/kompiro/karasu/compare/main...chore/release-<date>?expand=1`）
- 各パッケージの版（前 → 後）。上がらないパッケージは載せない
- チェックリスト: PR を開く / 版と `CHANGELOG.md` を読む / promotion gate の確認 / squash マージ / npm と Marketplace に出たことを確認する

ラベルは新設の `release` を付ける。pending changeset が無い月は、ブランチも Issue も作らない（ノイズを増やさない）。

リリースブランチ名は `chore/release-YYYY-MM-DD`（Prepare を実行した日の UTC 日付）にする。Release のタグ `release-YYYY-MM-DD`（ADR-2939）と同じく日付で名付けるので、どのパッケージが上がっても同じ規則で付き、CLI が上がらない月に前回のブランチと衝突しない。同じ日に 2 回目の Prepare が走っても、前のトレインが open なら C1 で止まり、マージ済みならブランチは自動削除（`delete_branch_on_merge`）で消えている。マージせずに Issue だけ閉じてブランチが残っていた場合は push が衝突してジョブが失敗し、黙って上書きはしない。

トラッキング Issue は、そのトレインの公開と記録が済んだ時点で自動で閉じる。「open な `release` Issue がある = トレインが終わっていない」という C1 の判定と対になる。閉じる条件は次の 2 つ。

- **このトレインの PR がマージされた run であること。** `release.yml` は `workflow_dispatch` での手動実行や、CHANGELOG に触れる別の push でも走る。そこで、HEAD コミットを生んだ PR（`gh api repos/<repo>/commits/<sha>/pulls`）の head ブランチ名を取り、Issue に書いたブランチ名（`chore/release-YYYY-MM-DD`）と一致する Issue だけを対象にする。一致する Issue が無ければ何もしない。
- **公開と記録がすべて成功したこと。** npm の公開・npm の `record`・拡張の公開・拡張の `record` のどれかが失敗したら、閉じずに Issue へ失敗した run へのリンクをコメントする。トレインは終わっていないので、次のトレインは C1 で止まる。

成功したときは Release（`release-YYYY-MM-DD`）へのリンクをコメントして閉じる。

イベントの種類では区別しない。失敗したマージの run を直す手段は 2 つあり、どちらでも上の 2 条件を満たせば閉じる。

- **Re-run jobs**（Actions 画面の再実行）: 元の run をやり直すので、イベントは `push`、HEAD はマージコミットのまま。
- **`workflow_dispatch`**: main の先頭で新しい run を起こす。main の先頭がまだそのトレインのマージコミットなら PR の照合が一致して閉じる。main が先に進んでいれば照合が一致せず、何も閉じない。

どちらかで全ジョブが成功したならトレインは終わっている。ここで閉じないと、直したあとも次のトレインが C1 で止まったままになる。

#### B2: Actions に PR を作らせる

Issue を介さず PR まで自動で作る案。ADR-1370 が却下した `changesets/action` と同じく、#1370 で OFF にした設定を戻す必要がある。加えて GITHUB_TOKEN で作った PR には必須チェックが走らない。メンテナが B1 を選んだので不採用。

### C. 前月のトレインが残っているとき

前月のリリース PR がまだマージされていない状態で次のトレインが来た場合の扱い。

#### C1: 発車を止めて、残っている Issue にコメントする（採用）

Prepare の最初に、open な `release` ラベルの Issue と、head が `chore/release-*` の open な PR を探す。どちらかが見つかったら新しいブランチを作らず、その Issue（PR だけが残っているなら PR）に「今月の発車を見送った。先にこのトレインをマージするか close してほしい」とコメントしてジョブを **失敗**で終える。

PR も見るのは、Issue を閉じても対になるリリース PR は閉じないため。Issue だけを見ていると、PR が開いたまま次の Prepare が同じ未マージの changeset を 2 本目のリリース PR に載せてしまう。

- 残っているトレインを黙って上書きしない。放置が続けば毎月失敗の通知が来るので、気づける（TPL-2786 — 前提が崩れた状態を通過扱いにしない）。
- 前月のトレインを close すれば、翌月のトレインにその分の changeset も乗る（changeset は main に残ったままなので失われない）。

#### C2: 前月のブランチを force-push で作り直す

最新の changeset を含めて作り直す案。すでに開いている PR の中身が知らないうちに変わり、読んだ CHANGELOG とマージする中身がずれうる。レビュー関門を弱めるので不採用。

### D. VS Code 拡張の公開

#### D1: `vscode-release.yml` を reusable workflow にして `release.yml` から呼ぶ（採用）

- `vscode-release.yml` に `on: workflow_call`（`pre_release` input）を足す。`workflow_dispatch` は手動の再実行用に残す。呼ばれた側の 2 ジョブ（公開と `record`）がそのまま動く。リリースコミットからビルドする仕組み（ADR-2939）は、トレインでは HEAD がリリースコミットなので同じコミットを指す。
- `vscode-release.yml` の先頭に「**`package.json` の version が Marketplace に stable として既にあれば公開しない**」ガードを入れる（`vsce show karasu-tools.karasu-vscode --json`）。`changeset publish` が「npm に無い版だけ出す」のと同じ冪等性を持たせる。
  - 版の一致だけで判定しない。`vsce show` の各版の `properties` に `Microsoft.VisualStudio.Code.PreRelease` があれば pre-release の版である。
  - 同じ版が **pre-release にしかない**ときは、飛ばさずに失敗させる。Marketplace は同じ版番号をチャネルをまたいで再公開できないので、この状態では stable を出せない。pre-release の版の付け方（#2940）が stable と重ならないようにする前提の違反として知らせる。
  - **`vsce show` が失敗したら公開を飛ばすのではなくジョブを失敗させる**（TPL-2786）。
- `release.yml` に npm 公開ジョブのあとで走る `vscode` ジョブを足し、`uses: ./.github/workflows/vscode-release.yml` で呼ぶ。呼ばれた側の各ジョブが必要とする権限の上限（`contents: write`、`id-token: write`）を、呼び出し側のジョブに与える。
- npm の公開が一部失敗しても、拡張の公開は止めない（拡張は npm に依存しない）。失敗したジョブに `needs` で続くジョブは既定でスキップされるので、`vscode` ジョブには `if: ${{ !cancelled() }}` を付ける。npm の `record` と拡張の `record` は `release-record` で直列になり、同じ Release に集まる。

リリース PR のマージから npm → Marketplace が 1 回の run で順に走る。拡張の版が上がっていない月は、ガードで no-op になる。

- メリット: 手動の起動が 1 つ消える。npm と拡張の公開が同じ run のログに並ぶ。
- デメリット: OIDC の subject が呼び出し経由でも `ref:refs/heads/main` になることを実機で確かめる必要がある（実装の最初のリリースで確認）。

#### D2: `workflow_run` で Release 完了後に起動する

独立した run になり、成否が別画面に分かれる。`workflow_run` は default branch の定義で走るので subject は同じだが、D1 より追いにくい。不採用。

#### D3: `packages/vscode/CHANGELOG.md` の paths filter で `vscode-release.yml` を直接起動する

ADR-1758 が却下した案そのもの。npm 公開と順序付けできず、npm 失敗時にも拡張だけ出てしまう。不採用。

### ADR-1758 の却下理由との関係

ADR-1758 は Marketplace 公開の自動発火を「リリース PR マージのたびに走るのは過剰」「拡張は独自 cadence」という理由で却下した。月次トレインでは:

- リリース PR のマージは月 1 回になり、「マージのたびに重い公開が走る」前提が消える。
- 拡張を独自 cadence で出す方針は、メンテナが今回やめると決めた（#2922）。
- D3 の順序付けの問題は、D1 が npm 公開の後段ジョブとして呼ぶことで解消する。

よって ADR-1758 の却下理由は月次トレインでは成立しない。ADR 昇格時に、ADR-1758 の「CHANGELOG 変更で Marketplace publish を自動発火」の却下と、ADR-1316 決定 2（手動トリガ）を本件で更新したことを明記する。

## 現時点の方針

**A1 + B1 + C1 + D1 を採用する** — cron の制約の中で最終日曜を確実に拾い、Actions の PR 作成 OFF とマージ前のレビュー関門（ADR-1370）を保ったまま、人の作業を「Issue のリンクから PR を開き、CHANGELOG を読んでマージする」だけにする。拡張は npm の後段で冪等に公開し、手動起動をなくす。

### 実装の指針

1. `release-prepare.yml`
   - `on.schedule: - cron: "0 0 * * 0"` を足す（`workflow_dispatch` は残す）。
   - `github.event_name == 'schedule'` のときだけ最終日曜判定（A1）を行う。
   - open な `release` Issue か、head が `chore/release-*` の open な PR があれば、コメントしてジョブを失敗させる（C1）。`permissions` に `pull-requests: read`。
   - ブランチ名を `chore/release-YYYY-MM-DD` にし、commit subject も版ではなく上がったパッケージの一覧にする。
   - version → push の後、トラッキング Issue を作る（B1）。`permissions` に `issues: write`。
   - 版の一覧は、version 前後の各 `package.json` を比べて作る（上がったパッケージだけ）。
2. `vscode-release.yml`
   - `on.workflow_call`（`pre_release` input）を足す。
   - 「同じ版が stable にあれば skip、pre-release にしかなければ fail、`vsce show` 失敗なら fail」のガードを publish の前に入れる。
3. `release.yml`
   - npm 公開ジョブの後に `vscode` ジョブ（`uses: ./.github/workflows/vscode-release.yml`、`if: ${{ !cancelled() }}`、`permissions: contents: write, id-token: write`）を足す。
   - 最後に、トラッキング Issue を閉じるジョブを足す（`needs` に npm の公開・`record`・`vscode`、`if: ${{ !cancelled() }}`、`permissions: issues: write, pull-requests: read`。ジョブ単位の `permissions` は書かなかった権限を `none` にするので、コミットから PR を引く API のために `pull-requests: read` が要る）。HEAD コミットの PR の head ブランチ名で Issue を特定し、全ジョブが成功（`record` はスキップも可）なら Release のリンクを付けて閉じ、失敗があれば run のリンクをコメントして開いたままにする。
4. `release` ラベルを作る（`gh label create release`）。
5. `docs/release.md` の「リリースの流れ」「VS Code 拡張のリリース」を月次トレインの手順に書き換える。「拡張は CLI とは独立した cadence で出す」の注記を消す。各 workflow の header コメントも合わせる。
6. AT（人が確認するもの）:
   - 最初の最終日曜（2026-10-25）に、スケジュール起動でブランチとトラッキング Issue ができる。
   - その Issue のリンクから PR を開いてマージすると、npm 公開に続いて Marketplace 公開が同じ run で成功する（OIDC が reusable workflow 経由でも通る）。
   - 同じ run の最後に、`release-YYYY-MM-DD` の Release に全パッケージが載り、トラッキング Issue がそのリンク付きで閉じる。
   - 最終日曜でない日曜の実行が「skipping」で終わり、ブランチも Issue も作らない。
   - main が先に進んだあとで `release.yml` を `workflow_dispatch` しても、開いているトラッキング Issue は閉じない。
   - マージの run が途中で失敗すると Issue は失敗のコメント付きで開いたまま残り、Re-run jobs か `workflow_dispatch`（main の先頭がマージコミットのとき）で成功すると閉じる。
7. ADR 昇格: 実装完了後に `docs/adr/2922-monthly-release-train.md` として昇格し、本 Design Doc は同 PR で削除する。ADR-1370 / ADR-1316 / ADR-1758 / ADR-2939 への関係を frontmatter と本文に書く。

### 影響範囲・マイグレーション

- 利用者への影響: リリースが月 1 回の予測できる間隔になる。拡張の更新が npm と同じ日に届く。
- メンテナの作業: 最終日曜に Issue が立つので、リンクから PR を開き、CHANGELOG を読んでマージする。臨時リリースは従来どおり `workflow_dispatch` で出せる。
- ドキュメント更新: `docs/release.md`、各 workflow の header コメント、`.claude/rules/changesets.md` に拡張の cadence の記述があれば合わせる。

## 別 Issue で扱うこと

- **拡張の pre-release チャネル（[#2940](https://github.com/kompiro/karasu/issues/2940)）**: 月次トレインとは別に、週次で pre-release を出す。Marketplace は semver の pre-release 接尾辞を受け付けず、changesets が持つ stable の版との共存を別途設計する必要があるため、本件には含めない。`vscode-release.yml` の `pre_release` input は残す。
