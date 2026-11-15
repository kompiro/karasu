---
id: ADR-3240
title: npm の公開を staged publishing にし、OIDC のトークンを持つジョブで外のコードを動かさない
status: accepted
date: 2026-11-15
topic: build
related_to:
  - ADR-1315
  - ADR-9020
  - ADR-1370
  - ADR-2922
  - ADR-1758
  - ADR-2939
  - ADR-2901
  - ADR-2397
  - ADR-3271
scope:
  packages: [cli, core, skills]
  concerns: [ci, deployment, security]
assumptions:
  - "file: scripts/release/stage.mts"
  - "file: scripts/release/approve.mts"
  - "file: scripts/release/confirm.mts"
  - "file: scripts/release/tarball.mts"
  - "file: scripts/release/release-state.mts"
  - "file: .github/workflows/release-confirm.yml"
  - "grep: package.json :: \"release:approve\": \"node scripts/release/approve.mts\""
  - "grep: .github/workflows/release.yml :: environment: npm"
  - "symbol: scripts/release/stage.mts :: firstGroup"
  - "symbol: scripts/release/stage.mts :: tagFor"
  - "symbol: scripts/release/stage.mts :: tarballManifest"
  - "symbol: scripts/release/tarball.mts :: readTarballStrict"
  - "symbol: scripts/release/tarball.mts :: readTarballWithNodeTar"
  - "symbol: scripts/release/tarball.mts :: sameNoticesAcrossPlatforms"
  - "symbol: scripts/release/confirm.mts :: taggable"
  - "symbol: scripts/release/approve.mts :: outOfPlan"
  - "file: docs/test-perspectives/TPL-3240-exact-pinned-dependency-installable-after-its-target.md"
  - "Trusted Publisher の接続は stage だけを許可し、environment `npm` を条件にする（#3685 の段階 B で設定する）"
  - "GitHub の environment `npm` の deployment branch は `main` だけ（#3685 の段階 B で設定する）"
---

# ADR-3240: npm の公開を staged publishing にし、OIDC のトークンを持つジョブで外のコードを動かさない

- **日付**: 2026-11-15
- **ステータス**: 決定済み
- **関連**:
  - Issue #3240（起点）。Design PR #3547、#3763（案 7E を足した改訂）。実装 PR #3765（#3705 を置き換えた）
  - 追跡 Issue #3685（マージ後の段階 B と C。ADR-3271）
  - kompiro の決定: [#3765 のコメント](https://github.com/kompiro/karasu/pull/3765#issuecomment-6887452947)（Design Doc とのずれ 2 つと、却下した指摘 2 件）
  - [ADR-1315](1315-release-automation-changesets.md)（changesets）、[ADR-9020](9020-npm-trusted-publishing-oidc.md)（OIDC Trusted Publishing）、[ADR-1370](1370-release-flow-actions-driven.md)（Prepare → release PR → マージ）、[ADR-2922](2922-monthly-release-train.md)（月次トレイン）、[ADR-2939](2939-release-record-tags-and-github-release.md)（タグと GitHub Release）、[ADR-2901](2901-karasu-authoring-skill.md)（CLI が `karasu-skills` に完全一致で依存する）、[ADR-2397](2397-node-24-baseline.md)（Node 24 と npm の版）
  - TPL: [TPL-3240](../test-perspectives/TPL-3240-exact-pinned-dependency-installable-after-its-target.md)（proactive）、[TPL-2804](../test-perspectives/TPL-2804-guard-scan-set-fails-loud-on-the-unknown.md)、[TPL-2446](../test-perspectives/TPL-2446-gate-side-check-runs-over-the-whole-set.md)、[TPL-1681](../test-perspectives/TPL-1681-publishable-tarball-completeness.md)、[TPL-2786](../test-perspectives/TPL-2786-guard-failure-must-fail-the-run.md)
  - コード: `.github/workflows/release.yml`、`.github/workflows/release-confirm.yml`、`scripts/release/`、`docs/release.md`

## 背景

それまでの npm の公開は、リリース PR のマージで走る `release.yml` が `changeset publish` で直接 `latest` に出していた。認証は OIDC の Trusted Publishing で、照合条件は「repo `kompiro/karasu` の workflow ファイル `release.yml`」だけだった。`id-token: write` を持つ `release.yml` の run を起こせれば、それが乗っ取られた依存でも、書き換えた `release.yml` を別のブランチで `workflow_dispatch` したものでも、インストールできる版を npm に置けた。

npm は 2026-05 に staged publishing を GA にした。`npm stage publish` で出した版は stage のキューに入り、メンテナが 2FA 付きで承認するまでインストールできない。Trusted Publisher は stage 専用に絞れる。2026-10-15 のトレイン（#3238）では `karasu-skills` の接続の既定の「stage のみ許可」に当たり、トレインを出すために「Allow `npm publish`」を有効にしたので、3 パッケージ（`karasu`、`@karasu-tools/core`、`karasu-skills`）とも直接 publish できる状態に戻っていた。

stage 専用にするだけでは足りない点が 2 つあった。乗っ取られた run が正規の run より先に偽の tarball を stage すれば、人が承認するのはその tarball になる。また stage のキューは版のメタデータ（manifest）を見せないので、tarball は本物のままメタデータだけを偽った版は、承認前に tarball を比べても見つからない。当初の設計（#3547）は後者を扱っておらず、#3705 のセキュリティレビューで見つかった。#3705 は承認の直後のメタデータの確認で受けたが、それでは公開を止められないので、案 7E（#3763）を足した。

## 決定

npm の 3 パッケージを `npm stage publish` で stage し、kompiro が 2FA で承認してから公開する。OIDC のトークンを持つ `stage` ジョブは依存を入れずに何を stage するかを自分で決め直し、承認の前に手元の pack と照合し、公開後にも CI で照合してからタグと Release を作る。

## 決定の内容

### 公開の経路（論点 1・7E）

- `release.yml` の `release` ジョブを 2 つに分けた。
  - `pack`（`contents: read`、`pull-requests: read`、`id-token` なし）: 依存を入れてビルドし、`stage.mts pack` が `changeset pack --out-dir` の計画（`publish-plan.json`）を読んで検査する。計画の先頭のグループの tarball を artifact `stage-tarballs` にする。
  - `stage`（`contents: read`、`pull-requests: read`、`id-token: write`、environment `npm`）: 依存を入れず、pnpm を使わず、cache を復元しない（`setup-node` に `package-manager-cache: false`）。`persist-credentials: false`。artifact からは tarball のファイルだけを受け取り、`stage.mts publish` を runner の Node 同梱の npm で実行する。
- `stage.mts` は、実行しているコミットがリリースのコミット（`chore/release-*` のブランチをマージした PR のマージコミット）でなければ何も stage しない。計画に `RELEASED_PACKAGES` に無いパッケージ、またはリリースコミットで版を上げていないパッケージがあれば止まる。
- `publish` は何を stage するかを artifact から読まず、リリースコミットと npm から決め直す。対象は、リリースコミットで版を上げたこと（first parent との比較）、`RELEASED_PACKAGES` にあること、版が npm にまだ無いこと、先頭のグループであること（`dependencies` / `optionalDependencies` / `peerDependencies` が `workspace:` で指すパッケージの版が npm にある。`devDependencies` は数えない）を満たすパッケージである。
- tag は計画から取らず版から決める。prerelease でなければ `latest`、pre モードなら `.changeset/pre.json` の tag で、prerelease なのに `pre.json` が無ければ止まる。
- tarball は、ダウンロードしたディレクトリの中の通常の `.tgz` だけを、展開後の大きさに上限を付けて読む。中の `package.json` の名前と版がリリースコミットと一致すること、`publishConfig` がリリースコミットと一致し、キーが `access` と `provenance` だけであることを確かめる（乗っ取られた `pack` ジョブが registry や proxy を入れると、OIDC の交換が攻撃者に向きうる）。余分な tarball、重複、欠けがあれば止まる。
- `npm stage publish <tarball> --json --ignore-scripts --registry https://registry.npmjs.org/` で stage する。再実行で受ける npm の「stage 済み」の拒否（`E409 ... Cannot stage previously published version`）の形だけを飛ばし、知らない失敗は止める（TPL-2804）。
- GitHub Actions の外では `--provenance=false` を付ける。CI の経路が使えないとき、kompiro はリリースコミットを手元に取り出して `stage.mts pack` と `stage.mts publish` を実行できる。

### 承認（論点 3・7C）

- `pnpm release:approve`（`scripts/release/approve.mts`）を正の手順にする。リリースコミットを一時的な worktree でビルドし、`changeset pack` の計画の順で、stage された各 tarball を `npm stage download` で取り出して手元の pack とファイルの中身で比べる。tag は、`stage` ジョブと同じ規則（`tagFor`）でリリースコミットから決まる tag と違えば落とす（changesets の計画の tag とは pre モードで食い違うため）。3 パッケージの stage のキューにある計画外の項目は表示して reject を勧める。
- 承認はグループごとで、承認したら版が npm に載るのを待ち、インストールに効くメタデータを手元の pack の `package.json` と比べる。次のグループがあれば `release.yml` の run を再実行して次の stage を待つ。最後に `release-confirm.yml` を起動する。`--dry-run` は承認せずに照合だけ行う。
- 依存元（`karasu`）は依存先（`karasu-skills`）が npm に載るまで stage されないので、npmjs.com の画面で承認しても順序は崩れない（TPL-3240）。画面での承認は禁止しない（kompiro の判断、2026-11-02 と 2026-11-07）。画面で承認するときは先に `--dry-run` で照合する。
- `dist/app/THIRD_PARTY_NOTICES.md` はビルドした環境のプラットフォームのパッケージを列挙する（CI は x64、手元は arm64）。照合は節を除かず、節の数が同じで、同じ位置の節の本文が同じであることを求め、見出しの違いだけを、両方の見出しがプラットフォームのパッケージを名指すときに許す。

### 記録と Issue のクローズ（論点 2・4・7D）

- タグと Release は、承認のあとに新しい workflow `release-confirm.yml` が作る。`pnpm release:approve` が起動し、画面での承認のために毎日 1 回の `schedule` でも走る。どのジョブも `id-token` を持たない。
- `verify`（読み取りだけ、資格情報を残さない）は、リリースコミットで版を上げた npm パッケージのうち、npm に載っていてタグがまだ無い版を、別のディレクトリでビルドしたリリースコミットの pack と照合する。承認の経路を問わない。ファイルの中身に加えて、インストールに効くメタデータ（依存、`bin`、`scripts`、`os` / `cpu` など）もレジストリから取って pack の `package.json` と比べる（7E の前提が崩れたときに気づくため）。計画外の版（タグのある最新の版より後に公開された、リリースコミットの版でない版。取り下げた版と deprecate した版は除く）も報告する。
- `record`（`contents: write`、依存を入れない）は、照合を通った版にタグを打ち、`release-YYYY-MM-DD` の Release を作る。完全一致の依存先が npm に無い版（順序の違反）も検出する。
- トレインの Issue は、リリースコミットで版を上げた npm パッケージのタグがすべてリリースコミットを指し、`vscode` ジョブが成功したときに `record` が閉じる。照合に落ちた版、計画外の版、順序の違反があるとき、または `verify` が報告を書く前に落ちたときは閉じない。`release.yml` の `close-train` は承認待ちを失敗にせず、案内をコメントして終わる。npm の版を上げなかったトレインは、いままでどおり `close-train` が VS Code の結果だけで閉じる。
- VS Code 拡張は npm の承認を待たない（論点 5）。

### 切り替え（論点 6）

- 実装のマージ直後に、3 パッケージの接続で「Allow `npm publish`」を外し（「Allow `npm dist-tag`」も外れていることを確かめる）、environment `npm` を条件に足す（案 6A）。外せない、条件を足せない、または未検証に戻った接続は削除し、そのパッケージの版を上げるリリース PR のマージ直前に、stage 専用で environment の条件付きの接続を作る（案 6B）。
- 同じときに、3 パッケージの package access を「Require two-factor authentication and disallow tokens」にする。
- environment `npm` の deployment branch は `main` だけにする。この environment を名乗るのは `stage` ジョブだけなので、`vscode` ジョブのトークンも、別のブランチで書き換えた `release.yml` の run のトークンも、npm は受け入れなくなる。
- この操作と 2026-11-29 のトレインでの確認は #3685 で追う。

### Design Doc から変えたこと

実装の PR（#3765）で Design Doc とずれた点のうち、1 と 2 は PR で kompiro に確かめ、どちらも実装のままにすると決まった（#3765 のコメント）。3 と 4 は、実装のレビューで照合を直したもので、PR の差分としてマージされた（PR で個別には確かめていない）。

1. **`stage` ジョブは tarball を、上限付きの厳格な読み取りに加えて npm が同梱する node-tar でも読み、両方が同じファイルを見たときだけ `package.json` を使う。** Design Doc は「展開後の大きさに上限を付けて読む」とだけ書き、Node の組み込みと tar のヘッダーの読み取りで `package/package.json` を取り出す形を想定していた。npm は stage するとき tarball を node-tar（pacote）で展開してメタデータを作るので、2 つの読み手で読み方が変わる tarball（同じ名前のエントリの重複、pax ヘッダーの細工）を作られると、照合は正しい `package.json` を見て通り、npm は別の `package.json` で stage しうる。照合に使う読み手を npm と揃えるために足した。node-tar はリポジトリの依存ではなく、runner の npm のインストールから読み込む。直後の `npm stage publish` が同じ node-tar で同じ tarball を展開するので、新しく信用する対象は増えない。`verify` と `pnpm release:approve` も同じ 2 つの読み手で読む。
2. **公開後の照合に一部の版が落ちても、同じリリースで照合を通った版にはタグを打ち、Release を作る（あれば更新する）。** Design Doc は論点 2 で「照合に通らなかった版には、タグも Release も作らない」（版ごと）と書き、論点 4「公開後の照合に落ちたとき」で「タグも Release も作らないので、Issue は開いたままで次のトレインも出ない」（run 全体）と書いていて、パッケージが複数あるときに食い違っていた。実装は版ごとの読み方に揃えた。落ちた版にはタグを打たず Issue にコメントし、run は失敗し、トレインの Issue は開いたままで次のトレインは出ない。通った版はすでに npm にあり照合も済んでいるので、タグを打たないとビルド元のコミットを後から追えなくなる。`docs/release.md` は、落ちたときにどの版にタグがあるかと Release の中身を確かめてから次の手を決める、と書いている。
3. **notices の節は除かずに比べ、プラットフォームのパッケージを名指す見出しの違いだけを許す。** Design Doc（案 7C）は「`os` / `cpu` を宣言するパッケージの節を両方から除いて比べる」と書いていた。除く形では、片方にだけあるプラットフォームの節や、その本文の違いが照合をすり抜けるので、狭めた。
4. **`pnpm release:approve` が照合する tag は、changesets の計画の tag ではなく、`stage` ジョブと同じ規則（`tagFor`）で決まる tag にした。** Design Doc（論点 3）は「tag が計画と違えば照合に落とす」と書いていた。`stage` ジョブは tag を計画から取らずに決め直すので（案 7E）、pre モードで両者が食い違うと、正しく stage された版が照合に落ちる。

### 受け入れた限界

- `verify` は同じジョブでリリースコミットのビルドと照合を行うので、乗っ取られた依存がそのビルドに入れば `verify` の結果は偽られうる。また照合は公開の後なので、公開そのものは止められない（7D の限界）。公開の前に CI の外で照合できるのは `pnpm release:approve` だけなので、それを正の手順にしている（実装の PR のレビューで指摘され、kompiro が却下を了承した）。
- `stage` ジョブの先頭のグループの判定は、`workspace:` の指定だけを依存として数える。`workspace:` でない範囲指定でワークスペースのパッケージを指す依存は今は無く、食い違えば何も stage されずに止まる（同上）。
- 承認の後の経路（`npm stage approve` から `release-confirm.yml` の `record` まで）は、prerelease の版を npm に残さないためにリハーサルで通していない。最初に通るのは 2026-11-29 のトレインで、#3685 の段階 C で確かめる。
- 手元から stage する経路では、ビルドと stage が同じ手元で動くので 7E の効果は無く、承認の直後のメタデータの確認で受ける。
- `main` の `release.yml` や `stage.mts` そのものの書き換え（PR のマージが要る）と、`stage` ジョブが動かす action（`.github/workflows/actions.lock` が commit を固定する）、Node、npm の CLI の乗っ取りは残る。

### 関連 ADR のどこを置き換えるか

どれも決定の一部だけを変えるので `supersedes` にせず、`related_to` で結ぶ（ADR-2922 が ADR-1758 の決定 3 を改訂した前例に倣う）。旧 ADR の本文は変えない。

- ADR-1315: 版の管理は changesets のまま。公開の手段だけが `changeset publish` から、`changeset pack` の計画に従う `npm stage publish` に変わった。
- ADR-9020: OIDC の Trusted Publishing のまま。直接の `npm publish` が stage に変わり、接続は stage 専用で environment `npm` を条件にする。
- ADR-2939: タグと Release の形と「公開に成功した版にだけタグを付ける」は変わらない。タグと Release を作るのが `release.yml` の `record` ジョブから `release-confirm.yml` に移った。
- ADR-2922: トレインの Issue を閉じる条件が、版を上げた npm パッケージのタグと `vscode` ジョブの結果になった（承認が済むまで閉じない）。

## 理由

- stage 専用の接続と 2FA の承認で、乗っ取られた run だけではインストールできる版を置けなくなる。
- 承認する tarball の照合相手を kompiro の手元の pack に置くので、CI を乗っ取っても照合は偽れない（7C）。CI の出力した integrity と比べる案（7B）は、照合の相手を乗っ取った側も書ける。
- 7E で、メタデータが tarball から作られる経路を OIDC のトークンを持つジョブに限るので、承認前の tarball の照合がメタデータの照合にもなる。乗っ取られた `pack` ジョブが変えられるのは tarball の中身だけで、それは 7C で見つかる。
- 承認の経路を問わずタグの前に照合するので（7D）、画面での承認を許しても、照合を通らない版にタグと Release は作られない。
- 依存の順に段を分けて stage するので、承認の順序を人の注意に頼らない（TPL-3240）。
- `changeset pack` が版の選び方・依存の順・pack を受け持つので、changesets の判定を書き写さずに済む。

## 却下した案

- **各パッケージのディレクトリで `npm stage publish`（1B）**: npm は `workspace:` を書き換えず、`karasu` の tarball に `workspace:*` が残る。
- **changesets / pnpm の stage 対応を待つ（1C）**: どちらも stage モードを持たず、待つ根拠が無い。
- **stage した時点でタグと Release を作る（2A）**: まだインストールできず reject されうる版が Release に並び、ADR-2939 に反する。
- **順序を `docs/release.md` に書くだけ（3A）**: 画面で承認すると順序が人の注意に頼ることになる。
- **マージ直後に接続を削除し、リリース PR の直前に作る（6B を全パッケージに）**: 作るたびに 2 日の失効の期限が始まり、#3238 で実際に失効した。外せなかった接続にだけ使う。
- **stage した主体と日時を見る（7A）だけ**: 乗っ取られた `release.yml` の run も同じ主体として stage する。表示は添える。
- **画面での承認を禁止する**: 止める設定が無く禁止は文書の上にとどまり、破られたときに止めるには結局 7D が要る。
- **公開後の照合に一部が落ちたら、どの版にもタグを打たない（Design Doc の論点 4 の読み方）**: 通った版はすでに npm にあり、タグが無いとビルド元を追えなくなる（「Design Doc から変えたこと」の 2）。
- **`stage` ジョブで厳格な読み取りだけを使う（Design Doc どおり）**: npm と読み方が変わる tarball で照合をすり抜けられる（「Design Doc から変えたこと」の 1）。
