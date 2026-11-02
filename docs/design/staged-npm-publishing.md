# npm の公開を staged publishing にし、Trusted Publisher を stage 専用にする

- **日付**: 2026-11-01
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3240](https://github.com/kompiro/karasu/issues/3240)
  - 関連 ADR: [ADR-9020](../adr/9020-npm-trusted-publishing-oidc.md)（OIDC Trusted Publishing）、[ADR-1315](../adr/1315-release-automation-changesets.md)（changesets）、[ADR-1370](../adr/1370-release-flow-actions-driven.md)（Prepare → release PR → マージで publish）、[ADR-2922](../adr/2922-monthly-release-train.md)（月次トレイン）、[ADR-2939](../adr/2939-release-record-tags-and-github-release.md)（タグと GitHub Release）、[ADR-2901](../adr/2901-karasu-authoring-skill.md)（CLI が `karasu-skills` に完全一致で依存する）、[ADR-2397](../adr/2397-node-24-baseline.md)（Node 24 と npm の版）
  - 関連 TPL: [TPL-1681](../test-perspectives/TPL-1681-publishable-tarball-completeness.md)、[TPL-2804](../test-perspectives/TPL-2804-guard-scan-set-fails-loud-on-the-unknown.md)、[TPL-2446](../test-perspectives/TPL-2446-gate-side-check-runs-over-the-whole-set.md)、[TPL-3240](../test-perspectives/TPL-3240-exact-pinned-dependency-installable-after-its-target.md)（本 PR で起こす proactive TPL）
  - コード: `.github/workflows/release.yml`、`scripts/release/`、`docs/release.md`

## 背景・課題

いまの npm の公開は、リリース PR のマージで走る `release.yml` が `changeset publish` → `pnpm publish` → `npm publish` で直接 `latest` に出している。認証は OIDC の Trusted Publishing で、人が介在する段階は無い。

Trusted Publisher の照合条件は「repo `kompiro/karasu` の workflow ファイル `release.yml`」だけで、GitHub の environment は設定していない。したがって `id-token: write` を持つ `release.yml` の run を起こせれば、それが乗っ取られた依存でも、書き換えた `release.yml` を別のブランチで `workflow_dispatch` したものでも、インストール可能な版を npm に置ける。

npm は 2026-05 に staged publishing を GA にした。`npm stage publish` で出した版は stage のキューに入り、メンテナが 2FA 付きで承認するまでインストールできない。Trusted Publisher は stage 専用に絞れる。

2026-10-15 のトレイン（#3238）では、`karasu-skills` の Trusted Publisher を登録し直したときに既定の「stage のみ許可」に当たり、`npm publish` が `E403 ... OIDC permission denied for this action` で拒否された。トレインを出すために「Allow `npm publish`」を有効にしたので、3 パッケージとも直接 publish できる状態に戻っている。

本 Design Doc は、3 パッケージ（`karasu`、`@karasu-tools/core`、`karasu-skills`）を staged publishing に移し、Trusted Publisher を stage 専用にするまでの手順を決める。Issue が挙げた 6 つの論点に答え、加えて「承認する tarball が正しいものか」を論点 7 として扱う。stage 専用にしても、乗っ取られた run が先に偽の tarball を stage すれば、人が承認するのはその tarball になるからである。

## 現状（インベントリ）

| 段階              | 今の実装                                                                                                                                                                                  | stage 化で変わること                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 公開              | `release.yml` の `pnpm run release`（`pnpm build && changeset publish`）。npm に無い版だけを、依存の順に公開する                                                                          | `changeset publish` に stage モードが無いので置き換える（論点 1）     |
| タグ              | `changeset publish` が runner 上で注釈付きタグを作る。「Collect the tags」が `scripts/release/published-packages.mts` で必要なタグを洗い出し、欠けていれば失敗する（#2982）               | job の終わりに版はまだ npm に無い。タグを打つ時点を決め直す（論点 2） |
| 記録              | `record` ジョブ（`contents: write`）がタグを push し、`scripts/release/github-release.mts` で `release-YYYY-MM-DD` を作る                                                                 | 同上                                                                  |
| VS Code           | `vscode` ジョブが `vscode-release.yml` を呼ぶ。npm の結果に関係なく走り、自前の `record` で同じ Release に節を足す（Release が無ければ作る）                                              | 変えない（論点 5）                                                    |
| トレインの Issue  | `close-train` が全ジョブ成功で Issue を閉じる。失敗なら run のリンクをコメントして開いたままにする。開いているあいだ、`release-prepare.yml` は次のトレインを出さない                      | 承認が済むまで閉じない（論点 4）                                      |
| Trusted Publisher | 3 パッケージとも「Allow `npm publish`」が有効。`karasu-skills` は「Allow `npm stage publish`」も有効。`karasu` と `@karasu-tools/core` は 2026-09-03 より前の設定で、stage の許可は未確認 | 最後に「Allow `npm publish`」を外す（論点 6）                         |

依存関係: `karasu` は `dependencies` に `karasu-skills: workspace:*` を持ち、tarball では完全一致の版になる（ADR-2901）。`@karasu-tools/core` は `karasu` の `devDependencies` でバンドルに入るので、公開の順序には関わらない。`karasu-skills` と `@karasu-tools/core` は workspace パッケージに依存しない。

## 制約・前提

npm の staged publishing について、npm 11.16.0 の `npm help stage` / `npm help trust` と npm CLI のソース（`lib/commands/stage/*.js`、`lib/commands/publish.js`、`lib/utils/oidc.js`、`lib/utils/key-values.js`）で確かめたこと:

- `npm stage publish` は `npm publish` の派生クラスで、`stage: true` を付けて同じ経路を通る。引数は `<package-spec>` なので tarball のパスを渡せる。OIDC の交換（`oidc()`）と provenance の自動有効化も同じ経路で行われる。`--json` で stage id を出力する。
- stage 済みの版は公開済みの版と同じ版番号の一意制約を共有する。stage 済みの版と同じ版は stage も publish もできない。
- `npm stage reject` は stage 済みの版を完全に消す。消したあとは同じ版を stage し直せる（`--tag` を変えるときの手順として man page に書かれている）。
- `approve` と `reject` は 2FA を求める。`publish` / `list` / `view` / `download` は求めない。
- Trusted Publishing の短命トークンで実行できるのは `npm stage publish` と `npm publish` だけで、`npm stage` のほかのサブコマンドは実行できない。CI からは stage のキュー（`list` / `view`）を見られない。
- `npm stage list --json` の各項目は、id、パッケージ名、版、tag、stage した日時、stage した主体（`actor` / `actorType`）、`shasum` を持つ。
- npm は `workspace:` プロトコルを書き換えない。パッケージのディレクトリで `npm stage publish` を実行すると、tarball に `workspace:*` が残る。
- tag は stage 時に決まり、後から変えられない。指定しなければ `latest`。prerelease は `--tag` が必須。
- `npm trust github` は `--allow-publish` と `--allow-stage-publish` で許可する操作を設定する。
- 要件は npm >= 11.15.0（GitHub の changelog）と Node >= 22.14.0（docs.npmjs.com の staged publishing のページ）。`release.yml` のコメントは「Node 24 は npm 11.17 以上を同梱する」としているが、devcontainer の Node 24.18.0 が同梱するのは npm 11.16.0 だった。どちらでも 11.15.0 は満たす。ADR-2397 の方針どおり npm を別途上げず、リハーサルのログに `npm --version` を出して確かめる。

changesets 3.0.3 について確かめたこと:

- `changeset pack --out-dir <dir>` は、npm に無い版のパッケージだけを pnpm で pack し、`<dir>/publish-plan.json` に計画を書く。計画は依存の順に並んだグループの列で、各項目は名前、版、tag、tarball のパスと sha256 の integrity を持つ。依存の順は `devDependencies` を数えない（`sortReleases` の `ignoreDevDependencies: true`）。npm に問い合わせて予期しない応答を受けたときは失敗する。
- いまの `changeset publish` もこの計画の順に公開している。

`pnpm pack` について確かめたこと: `packages/skills` で `pnpm pack` すると `prepack` / `postpack`（`scripts/stamp-version.mjs`）が走り、SKILL.md に CLI の版（`karasu-version: "0.10.0"`）が刻まれる。作業ツリーは元に戻る。公開済みの `karasu-skills@0.2.1` の tarball と比べて、ファイルの一覧、`package.json`、刻まれた版は一致した（本文の差は 0.2.1 の公開後に reference の文書が更新された分）。tarball を指定して公開すると `prepublishOnly` / `publish` / `postpublish` は走らないが、3 パッケージともこれらを持たない。

そのほかの前提:

- npm の公開の権限を持つ `release` ジョブは `contents: read` のままにする（ADR-2939 決定 2）。例外として、`release.yml` の `vscode` ジョブは Marketplace への OIDC のために `id-token: write` と `contents: write` を持つ。このジョブの OIDC トークンを npm が `release.yml` の Trusted Publisher として受け入れるかは確かめていない。いまもある状態で本設計では変えないが、stage 専用にすれば、受け入れられたとしても stage しかできない。
- リリースの起点（Prepare → release PR → マージ、ADR-1370 / ADR-2922）は変えない。
- 次のトレインが発車するのは、前のトレインの Issue が閉じてから（ADR-2922）。そのため承認待ちのあいだ、`main` の `packages/*/package.json` の版は stage した版のまま変わらない。
- ADR の本文は書き換えない（`.claude/rules/adr.md`）。CI の `adr check-assumptions` は ADR-1315 と ADR-9020 の `"release": "pnpm build && changeset publish"`（`package.json`）と、ADR-2939 の `group: release-record`（`release.yml`）を検査している。
- repo は public なので、トレインの Issue には誰でもコメントできる。判定の材料に Issue のコメントを使わない。
- npm は 1 つのパッケージについて複数の版を同時に stage できる。
- 対象外: Trusted Publisher に GitHub の environment を条件として足す変更（直接 publish の穴を別の方向から塞ぐ。stage 専用にしたあとで要否を判断する）。VS Code 拡張（Marketplace、Entra ID OIDC）。別 repo の `@kompiro/adr-tools` / `@kompiro/tpl-tools`。

## 検討した選択肢

### 論点 1: `changeset publish` を何で置き換えるか

#### 案 1A: パッケージごとに `pnpm pack` し、`npm stage publish <tarball>` に渡す

自前のスクリプトが、npm に無い版の選び方（`npm view`）、依存の順、tag の決め方を `changeset publish` から書き写す。動くが、changesets がすでに持つ判定を作り直すことになる。

#### 案 1B: 各パッケージのディレクトリで `npm stage publish` を実行する

npm は `workspace:` を書き換えないので、`karasu` の tarball に `"karasu-skills": "workspace:*"` が残り、`npm i karasu` が壊れる。却下。

#### 案 1C: changesets / pnpm が stage に対応するのを待つ

`changeset publish` も `pnpm publish` も stage モードを持たない。pnpm 11 で `pnpm publish` が npm に委譲しなくなっても（#2401）、stage には対応しない。待つ根拠が無い。却下。

#### 案 1D: `changeset pack` の計画に従って `npm stage publish <tarball>` する

`changeset pack --out-dir` が版の選び方、依存の順、tag、pack を受け持つ。新しいスクリプト `scripts/release/stage.mts` は計画を読み、グループの順に `npm stage publish <tarball> --tag <tag> --json` を実行して、stage id と tarball の integrity を出力するだけにする。

- `workspace:*` の置き換えと `prepack` の刻印は pnpm が行う（上の確認）。
- 計画の tag は、changesets の pre モード（`pre.json`）を使わないかぎり `latest` で、`changeset pack` に `--tag` は無い。`--tag` を明示すると npm の「prerelease には `--tag` が要る」という検査が働かなくなるので、`stage.mts` は prerelease の版に `latest` を付けようとしたら止める。リハーサルの `--tag rehearsal` は spike だけの上書きにする。
- `stage.mts` は、実行しているコミット（CI では `GITHUB_SHA`、手元では `HEAD`）がリリースのコミット（`chore/release-*` のブランチをマージした PR のマージコミット。`close-train` と同じ `commits/<sha>/pulls` の API で判定する）でなければ何も stage しない。CI ではこのために `release` ジョブに `pull-requests: read` と `GH_TOKEN` を渡す。リリースを取りやめた版が `package.json` に残ったまま、`CHANGELOG.md` に触れる後の push や手動の `workflow_dispatch` で stage し直されるのを防ぐ。spike のリハーサルでだけこの判定を外す。
- 再実行では、前の試行で stage 済みの版が一意制約で拒否される。CI は stage のキューを見られないので、拒否の応答を見て「stage 済み」と判断するしかない。応答の形（HTTP status と `code`）はリハーサルで確かめ、知っている形だけを stage 済みとして扱う。知らない失敗は失敗として止める（TPL-2804）。stage 済みとして扱った版は「この run が stage したものではない」と出力に明示する。論点 7 の照合が、その tarball を誰が作ったかを確かめる。

- stage する集合は changesets が決める（`private` でも `ignore` でもない全パッケージ）。タグと Release が扱う集合は `RELEASED_PACKAGES`（`scripts/release/github-release.mts` の手書きの一覧）である。新しい公開パッケージを足したのに一覧へ入れ忘れると、stage と承認はされるのにタグが打たれない。`stage.mts` は、計画に `RELEASED_PACKAGES` に無いパッケージがあれば止める。

**案 1D を採る。** 案 1A と同じ結果を、changesets の判定をそのまま使って得られる。

### 論点 2: タグと GitHub Release をいつ作るか

#### 案 2A: stage した時点で作る

Release には、まだインストールできず、reject されうる版が並ぶ。ADR-2939 決定 2 の「公開に成功した版にだけタグを付ける」に反する。却下。

#### 案 2B: 承認のあとに別の workflow で作る

新しい workflow `release-confirm.yml` が、リリースコミットで版を上げた npm パッケージ（論点 4 の定義）について、その版が npm に載ったことを確かめ、載った版にタグを打って Release を作る。版を上げなかったパッケージは、前のリリースのタグが別のコミットにあるので触らない。リリースコミットは、開いているトレインの Issue が名指すブランチ（`scripts/release/train.mts issue-branch`）から、そのブランチをマージした PR のマージコミットとして求める。`main` が先に進んでいても同じコミットに着く。

- この workflow は `id-token: write` を持たない。Trusted Publisher は `release.yml` に紐づくので、記録の workflow からは npm に何も出せない。
- いまの `record` ジョブの処理（タグの push、`github-release.mts --commit`）をそのまま移せる。
- タグは自前で打つので、`changeset publish` のタグ付けの失敗を検出していた「Collect the tags」（#2982）は要らなくなる。
- 「npm に載ったか」は `npm view <name>@<version> --json` で判定する。版が無いときの `E404` だけを「まだ無い」とし、ほかの失敗は失敗として止める（TPL-2804）。一時的なレジストリの失敗を「まだ無い」や順序の違反と取り違えないためである。

#### 起動のしかた

`release-confirm.yml` は 2 通りで起動する。

- 承認のスクリプト（論点 3）が最後に `gh workflow run release-confirm.yml` で起動する。
- 毎日 1 回の `schedule`。npmjs.com の画面で承認したときは、スクリプトが走らないので、これで拾う。開いているトレインの Issue が無いとき、また Issue はあるがリリース PR がまだマージされていない（Prepare から人がマージするまでのあいだ）ときは、最初のステップで notice を出して何もせずに終わる。Issue にはコメントしない。

定期実行だけに頼る案は、承認から記録まで最大 1 日遅れるので主な経路にはしない。スクリプトの起動を主、定期実行を画面での承認の受け皿とする。

**案 2B を採る。**

### 論点 3: `karasu-skills` → `karasu` の承認順をどう守るか

#### 案 3A: `docs/release.md` に順序を書くだけ

承認を npmjs.com の画面で行うと、順序はメンテナの注意に頼ることになる。

#### 案 3B: 承認のスクリプトが順序を固定し、記録の workflow が順序の違反を検出する

`scripts/release/approve.mts`（`pnpm release:approve`）を kompiro が手元で実行する。

1. リリースコミットを `release-confirm.yml` と同じ方法で求める（`--commit <sha>` で指定もできる）。
2. そのコミットを手元の一時的な worktree に取り出してビルドし、`changeset pack` を実行する。出てきた `publish-plan.json` の順で承認する。計画は依存の順に並んでいて、`karasu-skills` が `karasu` より先に来る。順序は手で並べた表ではなく、この計画から取る（TPL-3240）。tarball は論点 7 の照合に使う。`changeset publish-plan` の JSON 出力は experimental なので使わない。
3. 計画の各版について、`npm stage list <name> --json` から stage 済みの項目を探し、論点 7 の照合を行う。tag が計画と違えば照合に落とす。
4. 照合の結果（パッケージ、版、tag、stage id、stage した主体と日時、照合の結果）を表示して確認を取る。3 パッケージの stage のキューに計画に無い項目（ほかの版）があれば、それも表示して reject を勧める。乗っ取られた run が別の版（たとえば `latest` の付いたより高い版）を stage していた場合に、画面で誤って承認されないようにするためである。
5. 計画の順に `npm stage approve <id>` を実行する。2FA はそのたびに npm が求める。最初の失敗で止まる。
6. 最後に `gh workflow run release-confirm.yml` で記録の workflow を起動する。

`--dry-run` は 2 から 4 だけを行い、承認も起動もしない。`--expect-tag <tag>` は照合する tag を計画の tag の代わりに使う（リハーサルの `rehearsal` 用）。どちらもリハーサルで使う。

`release-confirm.yml` は、`karasu` が npm にあるのに、その tarball が完全一致で指す `karasu-skills` の版が npm に無いとき、失敗してトレインの Issue にコメントする。画面で承認して順序を誤った場合も、毎日の定期実行で見つかる。

**案 3B を採る。** `docs/release.md` は `pnpm release:approve` を正の手順とし、npmjs.com の画面での承認は禁止しない（kompiro の判断、2026-11-02）。画面で順序を誤ると、`release-confirm.yml` が検出するまでのあいだ（最大 1 日）`npm i karasu` が壊れうる。手順書にはそのことと、画面で承認するなら `karasu-skills` を先にすることを書く。

### 論点 4: トレインの Issue をいつ閉じるか

閉じる条件を次の 2 つにまとめる。判定は `scripts/release/train.mts` に置き、`release.yml` の `close-train` と `release-confirm.yml` の両方から呼ぶ。

- **npm**: リリースコミットで版が変わった npm パッケージ（そのコミットと、その first parent とで `package.json` の版が違うもの）のタグが、すべてリリースコミットを指している。版が変わらなかったパッケージは対象にしない。「どこかにタグがある」では判定しない。版を上げたのに別のコミットにタグが打たれた場合を通さないためである。
- **VS Code**: いまの `close-train` と同じく、`vscode` ジョブの結果で判定する（`AZURE_CLIENT_ID` が無くて公開を飛ばした成功も含む）。`release-confirm.yml` は、リリースコミットで走った `release.yml` の最新の run を Actions の API（`head_sha` で絞る）で引き、その `vscode` ジョブの結果を読む。`vscode` は reusable workflow を呼ぶジョブなので、API には `VS Code extension / <呼ばれたジョブ>` の名前で並ぶ。それらがすべて成功か skip なら成功とみなす。Issue のコメントは誰でも書けるので材料にしない。

動き:

- `release.yml` の `close-train` は、npm の条件が満たされていなければ閉じない。stage した版の一覧と `pnpm release:approve` の案内をコメントし、成功で終わる（承認待ちは失敗ではない）。版を上げた npm パッケージが無ければ、いまと同じく VS Code の結果だけで閉じる。
- `release-confirm.yml` が最後に同じ判定を行い、満たせば Release のリンクを付けて閉じる。
- `close-train` も `release-record` の concurrency グループに入れ、`release-confirm.yml` と同時に判定やコメントをしないようにする。

トレインの Issue のチェックリスト（`train.mts` が生成する）に「Approve the staged npm versions (`pnpm release:approve`)」を足す。

#### reject したとき

reject は承認を拒む操作で、この設計が守りたいものの 1 つである。reject した版のタグは現れないので、トレインの Issue は閉じない。`release-prepare.yml` は開いているトレインの Issue があると次のトレインを出さない。reject の理由で次の手が分かれる。

- **stage された tarball が正しくなかった**（論点 7 の照合に落ちた）: reject して版を空け、正しい tarball を stage し直す。`release` ジョブは「stage 済み」を成功として終えているので、**Re-run failed jobs** では走らない。`release.yml` のその run を **Re-run all jobs** で再実行する（再実行は元の run と同じリリースコミットで走る。`vscode` ジョブは公開済みの版を飛ばす）。照合に落ちたということは CI か依存が乗っ取られている疑いがあるので、再実行の前に原因を調べる。乗っ取った側は reject のあとに同じ版をまた stage しうるので、再実行のあとも照合をやり直す。原因を取り除けないあいだは、下の「CI の経路が使えないとき」に従って手元から stage する。
- **リリースそのものを出さないと決めた**（stage した版に不具合があった）: 残りの stage 済みの版も reject し、トレインの Issue に理由を書いて手で閉じる。直した変更は次のトレイン（または `release-prepare.yml` の手動実行）で、次の版として出す。reject した版番号は使われないまま飛ぶ。取りやめた版は次のトレインまで `main` の `package.json` に残るが、`stage.mts` はリリースのコミットでしか stage しない（論点 1）ので、後の push や `main` での手動の dispatch では stage されない。
  - すでに承認した版があれば、それは npm に残る（unpublish はしない）。Issue を閉じる前に `release-confirm.yml` を手で起動し、承認済みの版のタグと Release を作る。
  - 依存元（`karasu`）がすでに承認されていたら、その完全一致の依存先（`karasu-skills`）は reject しない。reject すると `npm i karasu` がその版で壊れたままになる（TPL-3240）。依存先の不具合が理由なら、依存先も承認したうえで、両方に `npm deprecate` を付けて次の版を早く出す。

この 2 つを `docs/release.md` に書く。

#### CI の経路が使えないとき

`stage.mts` は stage の認証を npm に任せていて、OIDC でなくても動く。npm のセッショントークンでも stage はできる（`npm help stage` の Token Behavior）。CI の stage の経路が本番で失敗したら、kompiro がリリースコミットを手元に取り出してビルドし、`npm login` したうえで `node scripts/release/stage.mts` を実行する。stage したあとは承認から記録までいつもの流れに乗る。

- リリースコミットの中身をそのまま出せる。実装の PR を revert して `release.yml` を再実行する方法では戻せない。再実行は元の run と同じリリースコミット（実装を含む）で走り、`main` での `workflow_dispatch` はリリースより後の変更を含みうるからである。
- 手元から stage した版には provenance が付かない（ADR-9020 の手動公開と同じ）。`karasu` と `@karasu-tools/core` は `publishConfig.provenance: true` を持ち、npm は tarball の公開でもこれを読む。CI の外で provenance を求めると npm は `Automatic provenance generation not supported for provider: null` で止まるので、`stage.mts` は GitHub Actions の外では `--provenance=false` を付ける。
- 手元でもリリースコミットを取り出して実行するので、`stage.mts` のリリースのコミットの判定はそのまま通る。
- すでに承認した版があっても手順は変わらない。`changeset pack` は npm にある版を計画に入れないので、残りの版だけが stage される。

この手順を `docs/release.md` に書く。直接 publish の許可（Trusted Publisher の「Allow `npm publish`」）に戻る経路を残さなくてよくなるので、段階 B を本番のトレインより前に進められる（「切り替えの段階」）。

### 論点 5: VS Code 拡張は npm の承認を待つか

待たない。拡張はいまも npm の結果に関係なく公開していて、Release への追記は後から節を足す形で動いている。承認待ちのあいだは、拡張の節だけを持つ Release が先にできる。`release-confirm.yml` がタグから作り直すときに npm の節が加わる（ADR-2939 決定 3）。

### 論点 6: どの順で切り替えるか

3 パッケージを同時に stage 専用にする。1 つでも「Allow `npm publish`」が残れば、そのパッケージは直接 publish できる。

切り替えるのは、実装の PR がマージされた直後で、本番のトレインより前とする。stage の経路が本番で失敗しても、手元から stage すれば戻れる（論点 4「CI の経路が使えないとき」）。CI から直接 publish する経路を予備として残す必要は無く、残すあいだは今の穴も残る。

同じときに、3 パッケージの package access を「Require two-factor authentication and disallow tokens」にする（`npm help stage` の Best Practices 2）。この設定で Trusted Publishing の stage が通るかは、切り替えたあとに確かめる（通らなければ設定を戻し、別の Issue にする）。

手順は「現時点の方針」の「切り替えの段階」に書く。

### 論点 7: 承認する tarball が正しいものかをどう確かめるか

stage 済みの版と同じ版は stage できない。乗っ取られた run が正規の run より先に次の版を stage すると、正規の run は「stage 済み」として進み、人はその偽の tarball を承認しうる。

#### 案 7A: stage した主体と日時を表示して、人が見る

`npm stage list` の `actor` / `actorType` と日時を表示する。乗っ取られた `release.yml` の run も同じ Trusted Publisher として stage するので、主体では見分けられない。単独では足りない。

#### 案 7B: CI の run が出した integrity と照合する

`stage.mts` が出力した integrity を、承認のスクリプトが stage 済みの tarball と照合する。CI の出力は同じ workflow を乗っ取った側も書けるので、照合の相手として信用できない。単独では足りない。

#### 案 7C: 手元で同じコミットから pack した tarball と中身を照合する

承認のスクリプトが、リリースコミットを手元の一時的な worktree に取り出してビルドし、`changeset pack` で tarball を作る。`npm stage download <id>` で取り出した tarball と、展開したファイルの一覧と各ファイルの中身を比べる。違えば承認せずに止め、差分を表示する。

- 照合の相手が kompiro の手元にあるので、CI を乗っ取っても偽れない。
- バイト単位では比べない。gzip や tar のメタデータが環境で違いうるためである。ファイルの中身が同じことを確かめる。
- ビルドに数分かかる。トレインは月 1 回なので許容する。
- ビルドが環境によって違う出力を出すなら照合が落ちる。分かっているものが 1 つある。`karasu` の tarball に入る `dist/app/THIRD_PARTY_NOTICES.md` は、ビルドした環境のプラットフォーム固有のパッケージ（`@esbuild/linux-arm64` など）を列挙するので、aarch64 や macOS で pack すると x64 の CI と必ず違う（`docs/release.md` が `.vsix` で同じ差を記録している）。照合では、notices の節のうち `os` / `cpu` を宣言するパッケージの節を両方から除いて比べる。ほかに環境で変わるファイルが無いかは、リハーサルで手元（aarch64）と CI（x64）の tarball を比べて確かめ、見つかったものは同じ形で規則にする。規則にできないものが出たら、照合を CI と同じ x64 の環境で pack する形に改める。

**案 7C を採り、7A の表示も添える。** 7B は採らない。

## 比較

| 論点                 | 採る案                                                 | 主な理由                                                                                 |
| -------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 1 公開の置き換え     | 1D `changeset pack` の計画で `npm stage publish`       | 版の選び方・依存の順・tag を changesets から受け取れる                                   |
| 2 タグと Release     | 2B 承認後に `release-confirm.yml`（スクリプト + 毎日） | 「公開に成功した版にだけタグ」（ADR-2939）を保つ。記録の workflow が公開の権限を持たない |
| 3 承認順             | 3B 計画の順で承認し、記録の workflow で違反を検出      | 順序を注意に頼らない。画面で承認した場合も見つかる                                       |
| 4 Issue を閉じる時点 | 版を上げた npm パッケージのタグ + VS Code の結果       | 2 つの workflow が同じ条件で判定できる                                                   |
| 5 VS Code            | 待たない                                               | 既存の構成のまま動く                                                                     |
| 6 切り替え           | 3 パッケージ同時、実装の PR のマージ直後               | 失敗しても手元からの stage で戻れる。直接 publish の穴を早く塞ぐ                         |
| 7 tarball の照合     | 7C 手元で pack した tarball と中身を照合               | 照合の相手を CI の外に置く                                                               |

## Related TPLs

- [TPL-1681](../test-perspectives/TPL-1681-publishable-tarball-completeness.md): tarball の作り方が `pnpm publish` から `changeset pack`（pnpm の pack）に変わる。中身は「ソースに何があるか」ではなく tarball で確かめる。リハーサルで各パッケージの tarball の Tarball Contents を、前回の公開と比べる。
- [TPL-2804](../test-perspectives/TPL-2804-guard-scan-set-fails-loud-on-the-unknown.md): 再実行で受ける拒否のうち知っている形（stage 済み）だけを飛ばし、`npm view` の失敗のうち `E404` だけを「まだ無い」とする。知らない失敗は止める。
- [TPL-2446](../test-perspectives/TPL-2446-gate-side-check-runs-over-the-whole-set.md): stage と承認の順序は changesets の計画から、記録と Issue を閉じる判定は `RELEASED_PACKAGES` と各 `package.json` から導き、スクリプトの中でパッケージ名を並べない。`RELEASED_PACKAGES` は手書きの一覧なので、changesets の集合とずれたら `stage.mts` が止める（論点 1）。
- [TPL-3240](../test-perspectives/TPL-3240-exact-pinned-dependency-installable-after-its-target.md)（proactive、本 PR で起こす）: 完全一致で依存するパッケージは、依存先がインストールできるようになってからインストールできるようにする。

## 現時点の方針

**論点 1〜7 とも上の「比較」の案を採る。** 公開の経路を stage に変える実装をリハーサルで確かめてからマージし、マージの直後に直接 publish の許可を外す。最初の本番のトレインは stage 専用の状態で出す。

### 切り替えの段階

実装の PR は 1 本で、#3240 はその PR で閉じる。B と C はマージ後にしか進められないので、実装の PR を作る前に追跡用の Issue を 1 つ起こし、PR の本文から番号を示す（ADR-3271）。

| 段階                                                                                                            | 前提 | 途中で止めても困らない理由                                               |
| --------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------ |
| **0** Trusted Publisher の設定確認（kompiro が npmjs.com で行う）                                               | なし | 設定の追加だけで、いまの公開に影響しない                                 |
| **A** stage の経路の実装と、リハーサル（実装の PR）                                                             | 0    | マージ前のリハーサルで CI の stage の経路を確かめる                      |
| **B** 3 パッケージの「Allow `npm publish`」を外し、package access を「disallow tokens」にする（追跡用の Issue） | A    | 公開の経路はすでに stage だけを使う。失敗しても手元からの stage で戻れる |
| **C** 2026-11-29 のトレインを stage で出す（追跡用の Issue）                                                    | B    | 同上                                                                     |

- **0**: `karasu` と `@karasu-tools/core` の Trusted Publisher で「Allow `npm stage publish`」が有効かを確かめ、無ければ有効にする。`karasu-skills` は有効。
- **A のリハーサル**: Trusted Publisher は environment を条件にしていないので、`spike/3240-stage-publish-rehearsal` で `release.yml` を `workflow_dispatch` すれば本番と同じ OIDC の経路を通る。3 パッケージの版を prerelease（`X.Y.Z-rehearsal.0`、`--tag rehearsal`）にして stage し、次を確かめたら kompiro が reject する（2FA を 3 回入力する。この形で行うことは kompiro が 2026-11-02 に了承した）。spike は実装のブランチから切り、版の書き換え、`--tag rehearsal`、`stage.mts` のリリースのコミットの判定を外すことは spike だけに入れる。`vscode` ジョブは、spike では拡張の版を上げないので公開はしない（Entra の federated credential も `main` しか信頼しない）が、要らないので spike の `release.yml` から外す。
  - 3 パッケージとも OIDC で stage できる。ログに `npm --version` を出す
  - 同じ版をもう一度 stage したときの拒否の形（HTTP status と `code`）。`stage.mts` はこの形だけを stage 済みとして扱う
  - `npm stage download` で取り出した tarball の中身（TPL-1681）。`karasu` の `dependencies` が完全一致の版になっていること
  - `npm stage view` に provenance が付いているか
  - `pnpm release:approve --dry-run --commit <spike の sha> --expect-tag rehearsal` が stage id を見つけ、計画の順に並べ、手元で pack した tarball と中身が一致すること（論点 7）。一致しないファイルがあれば、環境で変わるものかを調べる
- **B のあと**に確かめること: 3 パッケージの Trusted Publisher が stage だけを許可していること。package access を「disallow tokens」にしても Trusted Publishing の stage が通ること（C の最初の stage で分かる）。
- **C のあと**に確かめること: 承認した版に provenance（`npm view <name>@<version> dist.attestations`）があること、Release に 3 パッケージと拡張の節が揃っていること、トレインの Issue が `release-confirm.yml` で閉じたこと。追跡用の Issue に書く。

### 実装の指針

1. `scripts/release/stage.mts`: リリースのコミットでなければ何もしない。`changeset pack --out-dir` の計画を読み、グループの順に `npm stage publish <tarball> --tag <tag> --json` を実行する。prerelease に `latest` を付けようとしたら、また計画に `RELEASED_PACKAGES` に無いパッケージがあれば止める。GitHub Actions の外では `--provenance=false` を付ける。stage 済みの拒否だけを飛ばし、そのことを出力に明示する。stage した `name@version`、stage id、integrity を出力する。
2. `release.yml`:
   - `pnpm run release` の中身を `pnpm build && node scripts/release/stage.mts` に変える。`release` ジョブに `pull-requests: read` と `GH_TOKEN` を足す（リリースのコミットの判定）。
   - 「Set a git identity」「Collect the tags」と `record` ジョブを削除する。
   - `close-train` を論点 4 の判定に変え、`release-record` の concurrency グループに入れる。
   - ヘッダーのコメントを stage に合わせて書き直す。
3. `.github/workflows/release-confirm.yml`: `workflow_dispatch` と毎日の `schedule`。権限は `contents: write`、`issues: write`、`pull-requests: read`、`actions: read`（`release.yml` の run の結果を読む）。`id-token` は持たない。リリースコミットを求め、版を上げた npm パッケージのうち npm に載った版のタグを打ち、Release を作り、順序の違反を検出し、論点 4 の判定で Issue を閉じる。concurrency は `release-record` グループに入れる。
4. `scripts/release/approve.mts` と、ルートの `package.json` の `release:approve`。論点 3 の手順、論点 7 の照合、notices のプラットフォーム固有の節を除く規則、計画に無い stage 済みの項目の表示、`--dry-run`、`--commit`、`--expect-tag`。
5. `scripts/release/train.mts`: チェックリストに承認の行を足し、Issue 本文の文言（いまの「`release.yml` が閉じる」など）を直す。Issue を閉じる判定を足す。
6. テスト: 既存の `scripts/release/*.test.ts` に倣う。計画の読み方、拒否の分類、`npm view` の `E404` とほかの失敗の区別、リリースコミットの求め方、順序の違反の検出、閉じる判定、tarball の中身の照合。`release-workflow.test.ts` はいま「Set a git identity」「Collect the tags」と `record` ジョブを検査しているので、書き直す。`release.yml` の `release` ジョブが `contents: read` と `pull-requests: read` だけを足した権限であること、`id-token: write` を持つのが `release` と `vscode` だけであること、`release-confirm.yml` が `id-token` を持たないことを確かめる。
7. `published-packages.mts` は「Collect the tags」が無くなると使われない。コードで使っているのは `release.yml` と自身のテストだけで、ほかに `release-workflow.test.ts` と `docs/release.md` が名指している（6 と 8 で書き直す）。テストごと削除し、knip で残りが無いことを確かめる。
8. 文書とコメント: `docs/release.md` の「リリースの流れ」（手順 4〜8 の公開の経路・タグ・閉じ方）に、承認、`release-confirm.yml`、reject したとき、CI の経路が使えないときを足す。前提の節は、stage だけを許可する Trusted Publisher の設定、登録から使うまでに失効しうること（いまの記述を stage に合わせて残す）、package access の設定に書き換える（段階 B の操作と同じ内容なので、実装の PR で書く）。`vscode-release.yml` の冒頭と `record` のコメント（`changeset publish` や「Release は `release.yml` が作る」）を直す。
9. ADR の assumptions: ADR-1315 と ADR-9020 の `"release": "pnpm build && changeset publish"` は、実装の PR で成り立たなくなる。ADR-2939 の `release.yml` の `group: release-record` は、`close-train` を同じグループに入れるので残る。成り立たなくなる行は、実装の PR で frontmatter から外す（本文は変えない）。
10. AT は作らない。確かめられるのは本番のトレインだけなので、A のリハーサルの結果は PR の本文に、C のあとの確認は追跡用の Issue に置く（ADR-3169）。
11. ADR 昇格: 実装の PR がマージされたら `docs/adr/3240-staged-npm-publishing.md` に昇格し、本 Design Doc を削除する。新しい ADR は、ADR-1315（`changeset publish` で公開する）、ADR-9020（`release.yml` が OIDC で直接公開する）、ADR-2939 決定 2（`release.yml` の `record` ジョブ）、ADR-2922 の `close-train` の閉じる条件を、どこまで置き換えるかを本文に書き、`related_to` で結ぶ。どれも決定の一部だけを変えるので `supersedes` にはしない。旧 ADR の本文は変えない。段階 B で「Allow `npm publish`」を外すことと package access の設定も、この ADR の決定に含める。

### 影響範囲・マイグレーション

- 利用者への影響: なし。公開される tarball の中身は変わらない。公開されるまでの時間が、承認を待つ分だけ延びる。
- メンテナの作業: トレインごとに `pnpm release:approve` を 1 回実行する（ビルドに数分、2FA を 3 回入力する）。
- ドキュメント: `docs/release.md`（実装の PR でまとめて書き換える）。
- テスト: `scripts/release/` のテストを追加・書き直す。`published-packages.test.ts` は削除する。
