# VS Code 拡張の週次 pre-release

- **日付**: 2026-10-13
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2940](https://github.com/kompiro/karasu/issues/2940)（[#2922](https://github.com/kompiro/karasu/issues/2922) から分離）
  - 関連 Design Doc: [monthly-release-train.md](monthly-release-train.md)（月次トレイン。ADR 昇格待ち）
  - 関連 ADR: [ADR-1316](../adr/1316-vscode-marketplace-publish.md)（Marketplace publish と Entra ID 認証）、[ADR-1758](../adr/1758-vscode-changeset-versioning.md)（拡張の版は changesets が持つ）、[ADR-2939](../adr/2939-release-record-tags-and-github-release.md)（パッケージのタグと GitHub Release。pre-release のタグは #2940 に委ねた）
  - 関連 TPL: [TPL-2786](../test-perspectives/TPL-2786-guard-failure-must-fail-the-run.md)（判定不能は失敗として扱う）、[TPL-2804](../test-perspectives/TPL-2804-guard-scan-set-fails-loud-on-the-unknown.md)（走査集合は未知の要素が大声で落ちる側に定義する）
  - コード: `.github/workflows/vscode-release.yml`, `scripts/release/train.mts`, `scripts/release/github-release.mts`

## 背景・課題

stable のリリースは月 1 回（月の最終日曜に Prepare が発車する。#2922）になった。拡張の変更が利用者に届くまで最長で 1 か月かかる。早く試したい利用者には、Marketplace の pre-release チャネルで毎週届けたい。

Issue が挙げた制約は 3 つある。

- Marketplace は semver の pre-release 接尾辞（`0.3.0-next.1`）を受け付けない。版は `major.minor.patch` だけで、同じ版番号を stable と pre-release の両方には使えない。
- VS Code はチャネルを問わず**一番高い版**に更新する。pre-release を選んだ利用者でも、それより高い stable が出ればそちらに移る。
- `packages/vscode/package.json` の版は changesets が持ち、月次トレインでだけ上がる。pre-release は changeset を消費せずに `main` から作る必要がある。

決めることは 3 つ（#2940）。pre-release の版の付け方、週次の起動と変更が無い週の扱い、pre-release にタグや GitHub Release を付けるか。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| `vscode-release.yml` | `workflow_dispatch` と `workflow_call`（`release.yml` から）。`pre_release` input を持つ。ビルド元は「拡張の現在の版を設定したコミット」（リリースコミット）で、版は `package.json` の値そのまま |
| `pre_release: true` で dispatch したとき | リリースコミットを stable と**同じ版番号**で `--pre-release` 公開する。その版がまだ stable に無ければ、以後その番号を stable で出せなくなる（Marketplace は版番号をチャネルをまたいで 1 回しか取らない）。今は使われていないが、押せば月次トレインを壊せる |
| stable 側のガード | 「同じ版が pre-release にしか無い」なら失敗する（`train.mts marketplace-status`）。pre-release の版が stable と重ならない前提の違反を知らせる柵 |
| `record` ジョブ | stable の公開が成功したときだけ `karasu-vscode@X.Y.Z` を打ち、`release-YYYY-MM-DD` の Release に拡張の節を足す。pre-release は対象外 |
| タグの解釈 | `github-release.mts` の `parsePackageTag` は `<RELEASED_PACKAGES の名前>@<x.y.z>` をパッケージのタグとして読む。`release.yml` はマージコミットの `@` を含むタグを集めて push する |
| Marketplace の現在 | stable のみ: 0.1.0, 0.1.2, 0.1.3, 0.2.0, 0.3.0（pre-release は 0 件） |
| 拡張の engine | `vscode: ^1.137.0`（pre-release は 1.63 以降で使える） |

### 他の拡張の版の付け方（Marketplace で観測、2026-10-13）

| 拡張 | stable | pre-release | stable を pre-release より低い版で出しているか |
| --- | --- | --- | --- |
| `ms-python.python` | 偶数 minor（`2026.8.0`） | 奇数 minor + 日時の patch（`2026.9.2026100801`） | 出している（`2026.6.0` を `2026.7.2026092501` の後に公開） |
| `ms-toolsai.jupyter` | `2025.9.1` | `2025.10.2025101002` | 出している（`2025.9.1` を `2025.10.x` の後に公開） |
| `rust-lang.rust-analyzer` | `0.3.<build>` | `0.4.<build>` | 出している（`0.3.3081` を `0.4.3080` の後に公開） |

Marketplace は、既にある pre-release より**低い**版の stable を受け付ける。公式ドキュメントが求めるのは「stable と pre-release で版が異なること」だけで、単調増加は求めていない。以下の案はこの観測を前提にする。

## 制約・前提

- changesets の挙動は変えない。stable の bump は従来どおり changeset の semver 指定で決まる（minor を偶数に寄せるような細工を入れない）。
- pre-release は changeset を消費しない。`main` にコミットもしない（main ruleset は直 push 不可。版は runner の作業ツリー上でだけ書き換える）。
- 認証は既存の Entra ID federated credential（subject `repo:kompiro/karasu:ref:refs/heads/main`）を使う。スケジュール起動は default branch で走るので subject は変わらない。
- 判定できないときは公開もスキップもせず失敗させる（TPL-2786）。
- out of scope: pre-release 利用者向けの CHANGELOG（未リリースの changeset を載せる）。「未解決の問い」に残す。

## 検討した選択肢

### A. 版の付け方

#### A1: stable と同じ `major.minor` に日付と通し番号の patch を付ける（採用）

pre-release の版を `<main の major>.<main の minor>.<YYYYMMDDNN>` にする。`YYYYMMDD` は起動した日（UTC）、`NN` はその日の通し番号で `01` から始める。`main` の `package.json` が `0.3.0` なら、2026-10-14 の pre-release は `0.3.2026101401` になる。

`NN` は Marketplace の版一覧から決める。同じ `major.minor` と同じ日付の版が既にあれば、その最大の `NN` に 1 を足す（`0.3.2026101401` があれば `0.3.2026101402`）。同じ日に何度起動しても版は衝突しない。中身が前回と同じ再実行は、版を決める前に B1 の判定で公開を飛ばす。1 日 99 本を超えたら失敗させる。

- **stable と重ならない**: stable の patch は changesets が 1 ずつ上げるので、10 桁の patch に届かない。pre-release の版は月次トレインの版と衝突しない。
- **現在の stable より必ず高い**: patch が日付から始まる 10 桁なので、同じ minor の stable より高い。pre-release を選んだ利用者に毎週届く。
- **stable の minor（または major）が上がると、stable が pre-release を追い越す**: トレインが `0.4.0` を出すと、`0.3.2026...` にいる利用者は `0.4.0` に更新される。次の週の pre-release は `0.4.<日付>` から始まる。
- **stable の patch は追い越さない**: トレインが `0.3.1` を出しても、pre-release の利用者は `0.3.2026...` に留まる。その pre-release は `0.3.1` を出したリリースコミットより前の `main` から作られていることがあるが、次の週の pre-release は `0.3.1` の内容を含む `main` から作られる。遅れは最長 1 週間。

Marketplace が低い版の stable を受け付けること（上の観測）が前提。

- メリット: changesets に手を入れない。版から「どの stable の系列で、いつ作ったか」が読める。他の大きな拡張（Python、Jupyter）と同じ `YYYYMMDDNN` の patch（Python は同じ日の 2 本目を `2026.7.2026093002` としている）。
- デメリット: stable の patch リリースが pre-release 利用者に直接届かない（翌週の pre-release で届く）。

#### A2: 偶数 minor = stable、奇数 minor = pre-release

VS Code ドキュメントが勧める方式。stable の minor を偶数に限る必要があり、changesets の bump と噛み合わない（今の stable は `0.3.0` で奇数）。minor bump のたびに 2 つ進めるような版の後処理を Prepare に入れることになり、`CHANGELOG.md` の見出しと利用者が見る版の対応が崩れる。不採用。

#### A3: 「次の stable」の minor に日付の patch を付ける

`0.3.0` が stable のとき `0.4.<日付>` にする案。次の stable が `0.4.0` だと pre-release より低く、利用者は stable に移らない。次の stable が `0.3.1` でも同じ。A1 より stable が pre-release を追い越す場面が減るだけで、得るものが無い。不採用。

#### A4: patch に `github.run_number` を使う

run 番号は 1 から始まるので、stable の patch（`0.3.1` など）と衝突しうる。不採用。

### B. 起動と、変更が無い週の扱い

#### B1: 週 1 回の cron。前回の公開物と中身が同じなら公開しない（採用）

- 起動: **毎週水曜 00:00 UTC（09:00 JST）**。月次トレインの Prepare（日曜 00:00 UTC）と曜日を分け、週末の作業を数日 `main` で寝かせてから出す。`workflow_dispatch` からも同じ経路で出せる（臨時の pre-release）。
- 変更の有無は**出来上がった `.vsix` の中身**で判定する。比べる相手は Marketplace で一番高い版（pre-release を選んだ利用者が今使っている版）。Marketplace の公開 API から `.vsix` を取得し、`extension/` 配下のファイルを比べる。`extension/package.json` の `version` だけは比較の前に揃える。
  - 全部同じなら「変更なし」で公開を飛ばす（ジョブは成功、notice を出す）。
  - 1 つでも違えば公開する。
  - `.vsix` を取得できない、展開できないなど、比べられなかったときは失敗させる（TPL-2786）。
- この判定は「拡張に関係するパス」の集合を持たない。拡張が新しいワークスペースパッケージや依存を取り込んでも、出来上がるファイルが変われば公開される（TPL-2804 の、集合を定義しない形）。
- ビルドが非決定的だった場合は、毎週「変更あり」になって公開される。誤りが出るのは公開しすぎる側で、利用者に変更が届かない側ではない。実装時に、同じコミットを 2 回ビルドして `out/*.js` が一致することを確かめる。

#### B2: パスの差分で判定する

前回の pre-release のコミットから `packages/{core,i18n,lsp,vscode}` と `pnpm-lock.yaml` に差分があるかで判定する案。前回のコミットを知るためにタグが必須になり、パスの集合は拡張が取り込むものが増えたときに黙って取りこぼす（TPL-2804）。ワークスペースの依存グラフから集合を導いても、ルートの設定ファイルなどグラフに出ない入力が残る。B1 は成果物そのものを比べるので、この集合を持たずに済む。不採用。

#### B3: 変更の有無にかかわらず毎週出す

判定が要らず最も簡単。ただし変更の無い週も利用者に更新が届き、Marketplace の版一覧も無意味な版で埋まる。不採用。

### C. タグと GitHub Release

#### C1: タグは打つ。名前空間を stable と分ける。GitHub Release は作らない（採用）

- 公開に成功した pre-release のビルド元コミットに **`karasu-vscode-pre/<版>`**（例 `karasu-vscode-pre/0.3.2026101401`）を打つ。pre-release の利用者から不具合が届いたとき、どのコミットから作った版かを辿るため。
- 名前に `@` を含めない。`release.yml` の「マージコミットにある `@` を含むタグを集める」処理と、`github-release.mts` の `parsePackageTag`（`karasu-vscode@0.3.2026101401` は `karasu-vscode` の版として読めてしまう）に拾われないようにする。pre-release のビルド元がたまたまリリースのマージコミットと同じでも、`release-YYYY-MM-DD` の Release に pre-release が混ざらない。
- GitHub Release は作らない。pre-release には `CHANGELOG.md` の節が無く、Release の本文を組めない。毎週の Release は月次の `release-YYYY-MM-DD` を一覧で埋もれさせる。pre-release の利用者が見るのは Marketplace のページである。

#### C2: タグも Release も作らない（ADR-2939 の現状どおり）

最も変更が少ない。B1 は判定にタグを使わないので成立する。ただしビルド元のコミットが記録されず、不具合報告の版からソースへ戻れない。不採用。

#### C3: GitHub の pre-release（Release の prerelease フラグ）を作る

本文に使える `CHANGELOG.md` の節が無く、週 1 本ずつ Release が増える。C1 の理由で不採用。

### D. ワークフローの形

#### D1: `vscode-release.yml` に pre-release の経路を持たせる（採用）

`vscode-release.yml` に `schedule`（水曜 00:00 UTC）を足し、「pre-release で動くか」を `github.event_name == 'schedule' || inputs.pre_release` で決める。既存の `pre_release` input の意味を「pre-release の版を付けて `main` の先頭から出す」に変える。現状の「リリースコミットを stable の版番号で pre-release に出す」経路はなくす（月次トレインを壊せる経路なので残さない）。

pre-release のときだけ変わるステップ:

1. ビルド元: リリースコミットではなく、起動したコミット（`main` の先頭）。
2. 判定: package の後に、Marketplace の一番高い版の `.vsix` と比べる（B1）。比較は `version` を揃えて行うので、この時点の `package.json` の版は stable のままでよい。同じなら以降を飛ばす。
3. 版: 違うときだけ、`train.mts` 相当のスクリプトで `<major>.<minor>.<YYYYMMDDNN>` を作り（`NN` は A1 のとおり版一覧から）、runner の作業ツリーの `packages/vscode/package.json` に書いて（コミットしない）もう一度 `vsce package` する。作った版が Marketplace の一番高い版より高いことを確かめ、そうでなければ失敗する（`NN` を版一覧から取るので、時計が戻るなど前提が崩れたときだけ落ちる柵）。
4. 公開: `vsce publish --pre-release`。
5. 記録: 公開に成功したら `karasu-vscode-pre/<版>` を push する（C1）。Release は触らない。

stable の経路（`release.yml` からの `workflow_call`、`pre_release: false`）は変えない。同じファイルにあるので、ビルド・認証・publish のステップを二重に持たない。concurrency グループ `vscode-release` で stable と pre-release は直列になる。

#### D2: `vscode-pre-release.yml` を別に作る

経路ごとにファイルが分かれて読みやすいが、checkout・install・build・package・Azure login・publish の各ステップを複製することになる。複製した publish 手順はどちらかだけ直される。concurrency グループを共有しないと stable と pre-release が同時に走る。不採用。

## 現時点の方針

**A1 + B1 + C1 + D1 を採用する。** 版は `<stable の major>.<stable の minor>.<YYYYMMDDNN>` にして changesets に手を入れず、stable との衝突を patch の桁で避ける。毎週水曜に `main` の先頭から作り、Marketplace の一番高い版と `.vsix` の中身が同じなら出さない。公開したらビルド元に `karasu-vscode-pre/<版>` を打ち、GitHub Release は作らない。経路は既存の `vscode-release.yml` に足す。

### 実装の指針

1. `scripts/release/`（`train.mts` に足すか、`pre-release.mts` を新設）に判定を置き、vitest で確かめる。
   - `preReleaseVersion(stableVersion, now, existingVersions)`: `0.3.0` と 2026-10-14 → `0.3.2026101401`。同じ日の `0.3.2026101401` が既にあれば `0.3.2026101402`。`NN` が 99 を超えるなら失敗。
   - `highestVersion(vsceShow)`: チャネルを問わず一番高い版（数値として比べる。`0.3.2026101401` > `0.3.1`）。
   - 作った版が一番高い版以下なら失敗する。
   - `.vsix` 2 つの `extension/` 配下を比べる関数。`extension/package.json` の `version` を揃えてから比べる。片方にしか無いファイルは差分。
2. `vscode-release.yml`
   - `on.schedule: - cron: "0 0 * * 3"` を足す。
   - pre-release かどうかを 1 か所で決め、上の D1 の 5 ステップをその出力で分岐させる。
   - `.vsix` の取得: `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/karasu-tools/vsextensions/karasu-vscode/<版>/vspackage`（未認証で取れることを 0.3.0 で確認済み）。
   - pre-release の記録ジョブは `contents: write` を持ち、タグの push だけを行う。publish ジョブは `contents: read` のまま（ADR-2939 と同じ分け方）。
   - header コメントを書き換える（`pre_release` input の意味、スケジュール、タグ）。
3. `docs/release.md` の「VS Code 拡張のリリース」に pre-release の節を足す（起動・版の付け方・変更が無い週・タグ・利用者が pre-release に切り替える方法）。#2940 への参照を置き換える。
4. 柵: stable 側の「同じ版が pre-release にしか無いなら失敗」は残す。A1 では起きないはずの状態で、起きたら版の付け方の前提が崩れたことを知らせる。
5. TPL: 既存の TPL-2786（取得・比較できないときは失敗）と TPL-2804（集合を持たない判定）を PR description で引用する。spec / concepts に節を足さないので proactive TPL の義務は無い。
6. AT: マージ前に確かめられる人手の項目は無い（判定はスクリプトの unit test、ワークフローは CI と dispatch で確かめる）。本番の Marketplace でしか確かめられない項目は、実装 PR を作る前に別の Issue に起こす（ADR-3271）:
   - 最初の水曜のスケジュール起動で pre-release が公開され、`karasu-vscode-pre/<版>` が打たれる。
   - 次の週、`main` に拡張の変更が無ければ「変更なし」で公開を飛ばす。
   - pre-release を選んだ VS Code に更新が届く。次の月次トレインで minor が上がった stable が出たとき、その利用者が stable に移る。
7. ADR 昇格: 実装完了後に `docs/adr/2940-vscode-pre-release-channel.md` として昇格し、本 Design Doc は同 PR で削除する。ADR-2939 の「pre-release はタグを打たない（#2940）」を本件で具体化したこと、ADR-1316 の `inputs.pre_release`（将来用）の意味を変えたことを frontmatter（`related_to`）と本文に書く。

### 影響範囲・マイグレーション

- 利用者への影響: stable を使う利用者には何も変わらない。Marketplace の拡張ページで「Switch to Pre-Release Version」を選んだ利用者に、毎週（変更がある週だけ）更新が届く。
- メンテナの作業: 増えない。臨時の pre-release は `vscode-release.yml` を `pre_release: true` で dispatch する。
- 月次トレインへの影響: なし。stable の版と pre-release の版は重ならない。
- ドキュメント更新: `docs/release.md`、`vscode-release.yml` の header コメント、`packages/vscode/README.md` に pre-release の案内を足すかは実装 PR で判断する。

## 未解決の問い / 決めないこと

- **pre-release 利用者向けの CHANGELOG**: pre-release の `.vsix` に入る `CHANGELOG.md` は前回の stable までしか載っていない。runner 上で `changeset version` を走らせて未リリースの changeset を載せる案はあるが、見出しの版が次の stable（`0.4.0`）になり pre-release の版と食い違う。利用者の反応を見てから別 Issue で扱う。
- **Open VSX**: 拡張は Marketplace にしか出していない。pre-release も同じ。
