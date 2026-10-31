---
id: ADR-2940
title: VS Code 拡張の main を毎週 Marketplace の pre-release チャネルに出す
status: accepted
date: 2026-10-31
topic: build
related_to:
  - ADR-1316
  - ADR-1758
  - ADR-2922
  - ADR-2939
scope:
  packages: [vscode]
  concerns: [ci, deployment]
assumptions:
  - "file: scripts/release/pre-release.mts"
  - "symbol: scripts/release/pre-release.mts :: preReleaseVersion"
  - "symbol: scripts/release/pre-release.mts :: diffExtensionDirs"
  - "grep: .github/workflows/vscode-release.yml :: karasu-vscode-pre/"
  - "grep: .github/workflows/vscode-release.yml :: cron: \"0 0 \\* \\* 3\""
  - "grep: .github/workflows/vscode-release.yml :: cancel-in-progress: false\\n  queue: max"
---

# ADR-2940: VS Code 拡張の main を毎週 Marketplace の pre-release チャネルに出す

- **日付**: 2026-10-31
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2940](https://github.com/kompiro/karasu/issues/2940)（[#2922](https://github.com/kompiro/karasu/issues/2922) から分離）、Design Doc PR [#3173](https://github.com/kompiro/karasu/pull/3173)、実装 PR [#3407](https://github.com/kompiro/karasu/pull/3407)
  - 本番での確認: Issue [#3403](https://github.com/kompiro/karasu/issues/3403)
  - [ADR-2922](2922-monthly-release-train.md)（月次トレイン）
  - [ADR-1316](1316-vscode-marketplace-publish.md)（Marketplace publish と Entra ID 認証。`inputs.pre_release` を将来用として置いた）
  - [ADR-1758](1758-vscode-changeset-versioning.md)（拡張の版は changesets が持つ）
  - [ADR-2939](2939-release-record-tags-and-github-release.md)（パッケージのタグと GitHub Release。pre-release のタグは #2940 に委ねた）
  - [TPL-2786](../test-perspectives/TPL-2786-guard-failure-must-fail-the-run.md)（判定できないときは失敗させる）、[TPL-2804](../test-perspectives/TPL-2804-guard-scan-set-fails-loud-on-the-unknown.md)（走査集合を手で持たない）
  - コード: `.github/workflows/vscode-release.yml`、`scripts/release/pre-release.mts`

## 背景

stable のリリースは月 1 回（月の最終日曜に Prepare が発車する。ADR-2922）になり、拡張の変更が利用者に届くまで最長で 1 か月かかる。早く試したい利用者には、Marketplace の pre-release チャネルで毎週届けたい。

制約は 3 つある。

- Marketplace は semver の pre-release 接尾辞（`0.3.0-next.1`）を受け付けない。版は `major.minor.patch` だけで、同じ版番号を stable と pre-release の両方には使えない。
- VS Code はチャネルを問わず一番高い版に更新する。pre-release を選んだ利用者でも、それより高い stable が出ればそちらに移る。
- `packages/vscode/package.json` の版は changesets が持ち、月次トレインでだけ上がる（ADR-1758）。pre-release は changeset を消費せずに `main` から作る必要がある。

それまでの `vscode-release.yml` の `pre_release: true`（ADR-1316 が将来用に置いた input）は、リリースコミットを stable と同じ版番号で pre-release に出していた。その版がまだ stable に無ければ、以後その番号を stable で出せなくなる。使われていなかったが、押せば月次トレインを壊せる経路だった。

Marketplace は既にある pre-release より低い版の stable を受け付ける。`ms-python.python`、`ms-toolsai.jupyter`、`rust-lang.rust-analyzer` がいずれもそうしていることを 2026-10-13 に `vsce show` で確かめた。公式ドキュメントが求めるのも「stable と pre-release で版が異なること」だけで、単調増加は求めていない。本 ADR はこの観測を前提にする。

## 決定

毎週水曜 00:00 UTC に `main` の先頭から拡張を作り、版を `<stable の major>.<stable の minor>.<YYYYMMDDNN>` にして Marketplace の pre-release チャネルに出す。出来上がった `.vsix` の `extension/` 配下が Marketplace で一番高い版と同じなら出さない。公開したらビルド元に `karasu-vscode-pre/<版>` のタグを打ち、GitHub Release は作らない。経路は既存の `vscode-release.yml` に持たせる。

## 理由

### 版の付け方

- `YYYYMMDD` は起動した日（UTC）、`NN` はその日の通し番号で `01` から。`NN` は Marketplace の版一覧から決めるので、同じ日に何度起動しても衝突しない。1 日 99 本を超えたら失敗する。
- **stable と重ならない。** stable の patch は changesets が 1 ずつ上げるので、10 桁の patch に届かない。changesets の挙動に手を入れずに済む。
- **同じ minor の stable より必ず高い。** pre-release を選んだ利用者に毎週届く。トレインが minor を上げた stable（`0.4.0`）を出すと、その利用者は stable に移り、次の週の pre-release は `0.4.<日付>` から始まる。
- トレインが patch だけ上げた stable（`0.3.1`）は pre-release を追い越さない。次の週の pre-release が `0.3.1` の内容を含む `main` から作られるので、遅れは最長 1 週間。
- 作った版が Marketplace の一番高い版以下なら失敗する。`NN` を版一覧から取るので、時計が戻るなど前提が崩れたときだけ落ちる柵である。
- 版は runner の作業ツリーの `package.json` にだけ書く。`main` にはコミットしない（main ruleset は直 push 不可）。

### 変更が無い週の扱い

- 比べるのは出来上がった `.vsix` で、相手は Marketplace で一番高い版（pre-release を選んだ利用者が今使っている版）。Marketplace の公開 API から `.vsix` を取得して展開し、`extension/` 配下のファイルを比べる。`extension/package.json` は `version` を除いた JSON として比べる（書式の違いも無視する。前の週の pre-release の `package.json` は `jq` で書き直されている）。`.vsix` の manifest は `package.json` から作られて版を含むので比べない。
- 「拡張に関係するパス」の集合を持たない。拡張が新しいワークスペースパッケージや依存を取り込んでも、出来上がるファイルが変われば公開される（TPL-2804）。
- `.vsix` を取得できない、展開できない、比較の結果が `same` / `changed` のどちらでもない、のいずれでも失敗させる（TPL-2786）。取得には接続と転送の時間の上限を付け、Marketplace が応答しないときに実行が `vscode-release` グループを握り続けないようにした。
- ビルドが非決定的だと毎週「変更あり」になる。誤るのは公開しすぎる側で、利用者に変更が届かない側ではない。0.5.0 のリリースコミットを手元で `vsce package` した `.vsix` は、`THIRD_PARTY_NOTICES.md` を除いて Marketplace の 0.5.0 と一致した（違いは arm64 と x64 の platform バイナリの差で、CI は毎回同じ platform で作る）。

### タグと GitHub Release

- 公開に成功したら `record-pre-release` ジョブがビルド元のコミットに `karasu-vscode-pre/<版>` を push する。pre-release の利用者から不具合が届いたとき、版からソースへ戻るため。publish するジョブは `contents: read` のままで、タグを打つジョブだけが `contents: write` を持つ（ADR-2939 と同じ分け方）。
- 名前に `@` を含めない。`release.yml` の「マージコミットにある `@` を含むタグを集める」処理と `github-release.mts` の `parsePackageTag` に拾われず、`release-YYYY-MM-DD` の Release に pre-release が混ざらない。
- GitHub Release は作らない。pre-release には `CHANGELOG.md` の節が無く本文を組めず、毎週の Release は月次の Release を一覧で埋もれさせる。

### ワークフローの形

- 起動は毎週水曜 00:00 UTC（09:00 JST）。月次トレインの Prepare（日曜 00:00 UTC）と曜日を分け、週末の作業を数日 `main` で寝かせてから出す。`workflow_dispatch` からも同じ経路で臨時の pre-release を出せる。
- `vscode-release.yml` に `schedule` を足し、pre-release で動くかを 1 か所（「Choose the channel」ステップ）で決める。条件は `schedule` で起動したか、`inputs.pre_release` が真か。
- ADR-1316 の `inputs.pre_release` の意味を「pre-release の版を付けて `main` の先頭から出す」に変えた。リリースコミットを stable の版番号で出す経路はなくした。
- `schedule` はこのファイル自身の cron で起動したときだけ数える（`github.workflow_ref` が `vscode-release.yml` を指すとき）。`workflow_call` で呼ばれた側は呼んだ側の `event_name` を見るので、将来スケジュールで動く workflow が呼んでも pre-release にならない。
- pre-release は `refs/heads/main` 以外で起動したら失敗する。Entra の federated credential が信頼するのは main だけで、pre-release は main を運ぶものだからである。
- concurrency グループ `vscode-release` を stable と共有し、`queue: max` で待機中の実行を全部並べる。既定では 3 本目の到着が待機中の 1 本を置き換えるので、それがトレインの stable の `workflow_call` だと stable が消える。
- 版を書いた後に `vsce package` をやり直さず、`vsce publish --pre-release` に作り直させる。拡張に `vscode:prepublish` が無いので、publish は比較に使った `out/` と同じものを包む。Design Doc は package のやり直しを書いていたが、結果は同じである。
- stable 側の「同じ版が pre-release にしか無いなら失敗」は残す。この版の付け方では起きない状態で、起きたら前提が崩れたことを知らせる。
- ビルド・認証・publish のステップを二重に持たない。

## 却下した案

### 版の付け方

- **偶数 minor を stable、奇数 minor を pre-release にする**（VS Code ドキュメントが勧める方式）: stable の minor を偶数に限る必要があり、changesets の bump と噛み合わない（当時の stable は `0.3.0` で奇数）。Prepare に版の後処理を入れることになり、`CHANGELOG.md` の見出しと利用者が見る版の対応が崩れる。
- **「次の stable」の minor に日付の patch を付ける**（`0.3.0` が stable のとき `0.4.<日付>`）: 次の stable が `0.4.0` でも `0.3.1` でも pre-release より低く、利用者は stable に移らない。採用案より stable が pre-release を追い越す場面が減るだけで、得るものが無い。
- **patch に `github.run_number` を使う**: run 番号は 1 から始まり、stable の patch と衝突しうる。

### 変更が無い週の扱い

- **パスの差分で判定する**（前回の pre-release のコミットから `packages/{core,i18n,lsp,vscode}` と `pnpm-lock.yaml` に差分があるか）: 前回のコミットを知るためにタグが必須になり、パスの集合は拡張が取り込むものが増えたときに黙って取りこぼす（TPL-2804）。依存グラフから集合を導いても、ルートの設定ファイルなどグラフに出ない入力が残る。
- **変更の有無にかかわらず毎週出す**: 変更の無い週も利用者に更新が届き、Marketplace の版一覧が無意味な版で埋まる。

### タグと GitHub Release

- **タグも Release も作らない**（ADR-2939 の当時の状態）: 判定にタグは要らないので成立するが、ビルド元のコミットが記録されず、不具合報告の版からソースへ戻れない。
- **GitHub の pre-release（Release の prerelease フラグ）を作る**: 本文に使える `CHANGELOG.md` の節が無く、週 1 本ずつ Release が増える。

### ワークフローの形

- **`vscode-pre-release.yml` を別に作る**: checkout・install・build・package・Azure login・publish の各ステップを複製することになり、複製した publish 手順はどちらかだけ直される。concurrency グループを共有しないと stable と pre-release が同時に走る。

## 決めないこと

- **pre-release 利用者向けの CHANGELOG**: pre-release の `.vsix` に入る `CHANGELOG.md` は前回の stable までしか載っていない。runner 上で `changeset version` を走らせる案は、見出しの版が次の stable になり pre-release の版と食い違う。利用者の反応を見てから別 Issue で扱う。
- **Open VSX**: 拡張は Marketplace にしか出していない。pre-release も同じ。
