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
| Trusted Publisher | 3 パッケージとも「Allow `npm publish`」が有効。`karasu-skills` は「Allow `npm stage publish`」も有効。`karasu` と `@karasu-tools/core` は 2026-09-03 より前の設定で、stage の許可は未確認 | 「Allow `npm publish`」を外して stage だけを許可する（論点 6）        |

依存関係: `karasu` は `dependencies` に `karasu-skills: workspace:*` を持ち、tarball では完全一致の版になる（ADR-2901）。`@karasu-tools/core` は `karasu` の `devDependencies` でバンドルに入るので、公開の順序には関わらない。`karasu-skills` と `@karasu-tools/core` は workspace パッケージに依存しない。

## 制約・前提

npm の staged publishing について、npm 11.16.0 の `npm help stage` / `npm help trust` と npm CLI のソース（`lib/commands/stage/*.js`、`lib/commands/publish.js`、`lib/utils/oidc.js`、`lib/utils/key-values.js`）で確かめたこと:

- `npm stage publish` は `npm publish` の派生クラスで、`stage: true` を付けて同じ経路を通る。引数は `<package-spec>` なので tarball のパスを渡せる。OIDC の交換（`oidc()`）と provenance の自動有効化も同じ経路で行われる。`--json` で stage id を出力する。
- stage 済みの版は公開済みの版と同じ版番号の一意制約を共有する。stage 済みの版と同じ版は stage も publish もできない。
- `npm stage reject` は stage 済みの版を完全に消す。消したあとは同じ版を stage し直せる（`--tag` を変えるときの手順として man page に書かれている）。
- `approve` と `reject` は 2FA を求める。`publish` / `list` / `view` / `download` は求めない。
- Trusted Publishing の短命トークンで `npm stage` のサブコマンドのうち実行できるのは `npm stage publish` だけで、CI からは stage のキュー（`list` / `view`）を見られない。ほかには `npm publish` を実行でき、[文書](https://docs.npmjs.com/trusted-publishers/)によると npm >= 11.21 では「Allow `npm dist-tag`」を有効にした接続で `npm dist-tag` も実行できる（既定は無効）。
- `npm stage list --json` の各項目は、id、パッケージ名、版、tag、stage した日時、stage した主体（`actor` / `actorType`）、`shasum` を持つ。
- `npm stage view` / `npm stage list` は版のメタデータ（manifest）を見せない。返すのは id、パッケージ名、版、tag、日時、主体、access、shasum、状態だけである（A のリハーサルで確認）。npm は版のメタデータを、publish の要求の中で tarball とは別に受け取る。`npm install` は、依存の解決とインストール時のスクリプトにこのメタデータを使う。npm の CLI に tarball を渡したときは、tarball の中身からメタデータを作る。npm 11.16.0 の `lib/commands/publish.js` の `#getManifest` は、tarball の spec に `pacote.manifest(spec, { fullMetadata: true, fullReadJson: true })` を使う。結果は `package.json` に `bin` や readme などの正規化と `publishConfig` の反映を加えたもので、tarball の中身だけで決まる。runner の npm は Node 24.x の同梱なので版は変わりうる（A のリハーサルでは 11.19.1）。
- npm は `workspace:` プロトコルを書き換えない。パッケージのディレクトリで `npm stage publish` を実行すると、tarball に `workspace:*` が残る。
- tag は stage 時に決まり、後から変えられない。指定しなければ `latest`。prerelease は `--tag` が必須。
- `npm trust github` は `--allow-publish` と `--allow-stage-publish` で許可する操作を設定する。既存の設定を変えるサブコマンドは無く、man page は `npm trust revoke` してから作り直す手順を示している。
- [Trusted Publisher の文書](https://docs.npmjs.com/trusted-publishers/)は「Multiple trusted publishers」と「Single trusted publisher」のタブに分かれていて、既存の接続を変えられるかの書き方が違う。Multiple のタブは「既存の接続は変更できない。変えるには削除して作り直す」とする。その注記が対象を明記しているのは provider と必須の項目で、Allowed actions には触れていない（タブの末尾の制限の節は、対象を限らずに変更できないと書く）。一方で同じタブは、失効した接続は「使うことも編集もできない」と書く。タブの外にある dist-tag の節は、「Allow `npm dist-tag`」を有効にも無効にもできると書く。このタブでは `npm stage publish` は常に許可され、選ぶのは `npm publish` などを足すかどうかである。Single のタブは「接続はいつでも編集できる」とし、Allowed actions は `npm publish` と `npm stage publish` から選ぶ。この repo の接続がどちらに当たるかは文書からは分からない。
- #3238 の「Allow `npm publish`」は、kompiro の記憶では npm の画面で切り替えた（2026-11-07 に確認。当時の記録は無い）。切り替えた相手は作ったばかりで未検証の接続で、検証済みの接続を切り替えたときに検証済みの状態が保たれるかは、どちらのタブにも書かれていない。本設計の切り替え（論点 6）は、まず画面で切り替え、検証済みの状態が保たれなければ削除と作成に移る。
- Multiple のタブによると、新しく作った接続は 2 日以内に最初の publish が成功しないと失効する（Single のタブに失効の記述は無い）。失効すると `E404` になる（#3238 で `karasu-skills` が当たった）。`npm stage publish` の成功がこの 1 回に数えられるのか、承認まで要るのかは書かれていない。
- 文書の範囲では、npmjs.com の画面での承認を止める設定は無い。
- 要件は npm >= 11.15.0（GitHub の changelog）と Node >= 22.14.0（docs.npmjs.com の staged publishing のページ）。`release.yml` のコメントは「Node 24 は npm 11.17 以上を同梱する」としているが、devcontainer の Node 24.18.0 が同梱するのは npm 11.16.0 だった。どちらでも 11.15.0 は満たす。ADR-2397 の方針どおり npm を別途上げず、リハーサルのログに `npm --version` を出して確かめる。

changesets 3.0.3 について確かめたこと:

- `changeset pack --out-dir <dir>` は、npm に無い版のパッケージだけを pnpm で pack し、`<dir>/publish-plan.json` に計画を書く。計画は依存の順に並んだグループの列で、各項目は名前、版、tag、tarball のパスと sha256 の integrity を持つ。依存の順は `devDependencies` を数えない（`sortReleases` の `ignoreDevDependencies: true`）。npm に問い合わせて予期しない応答を受けたときは失敗する。
- いまの `changeset publish` もこの計画の順に公開している。

`pnpm pack` について確かめたこと: `packages/skills` で `pnpm pack` すると `prepack` / `postpack`（`packages/skills/scripts/stamp-version.mjs`）が走り、SKILL.md に CLI の版（`karasu-version: "0.10.0"`）が刻まれる。作業ツリーは元に戻る。公開済みの `karasu-skills@0.2.1` の tarball と比べて、ファイルの一覧、`package.json`、刻まれた版は一致した（本文の差は 0.2.1 の公開後に reference の文書が更新された分）。tarball を指定して公開すると `prepublishOnly` / `publish` / `postpublish` は走らないが、3 パッケージともこれらを持たない。

そのほかの前提:

- npm の公開の権限（`id-token: write`）を持つ `stage` ジョブは `contents: read` のままにし、依存を入れない（ADR-2939 決定 2、論点 7 の案 7E）。例外として、`release.yml` の `vscode` ジョブは Marketplace への OIDC のために `id-token: write` と `contents: write` を持つ。このジョブの OIDC トークンを npm が `release.yml` の Trusted Publisher として受け入れるかは確かめていない。受け入れるなら、依存を入れるこのジョブからも stage できる。案 7E は Trusted Publisher に environment の条件を足して、`stage` ジョブ以外のトークンを npm が受け入れないようにする。
- リリースの起点（Prepare → release PR → マージ、ADR-1370 / ADR-2922）は変えない。
- 次のトレインが発車するのは、前のトレインの Issue が閉じてから（ADR-2922）。そのため承認待ちのあいだ、`main` の `packages/*/package.json` の版は stage した版のまま変わらない。
- ADR の本文は書き換えない（`.claude/rules/adr.md`）。CI の `adr check-assumptions` は ADR-1315 と ADR-9020 の `"release": "pnpm build && changeset publish"`（`package.json`）と、ADR-2939 の `group: release-record`（`release.yml`）を検査している。
- repo は public なので、トレインの Issue には誰でもコメントできる。判定の材料に Issue のコメントを使わない。
- npm は 1 つのパッケージについて複数の版を同時に stage できる。
- Trusted Publisher に GitHub の environment を条件として足す変更（#3704）は、案 7E に含める。
- 対象外: VS Code 拡張（Marketplace、Entra ID OIDC）。別 repo の `@kompiro/adr-tools` / `@kompiro/tpl-tools`。

## 検討した選択肢

### 論点 1: `changeset publish` を何で置き換えるか

#### 案 1A: パッケージごとに `pnpm pack` し、`npm stage publish <tarball>` に渡す

自前のスクリプトが、npm に無い版の選び方（`npm view`）、依存の順、tag の決め方を `changeset publish` から書き写す。動くが、changesets がすでに持つ判定を作り直すことになる。

#### 案 1B: 各パッケージのディレクトリで `npm stage publish` を実行する

npm は `workspace:` を書き換えないので、`karasu` の tarball に `"karasu-skills": "workspace:*"` が残り、`npm i karasu` が壊れる。却下。

#### 案 1C: changesets / pnpm が stage に対応するのを待つ

`changeset publish` も `pnpm publish` も stage モードを持たない。pnpm 11 で `pnpm publish` が npm に委譲しなくなっても（#2401）、stage には対応しない。待つ根拠が無い。却下。

#### 案 1D: `changeset pack` の計画に従って `npm stage publish <tarball>` する

<!-- absent-path-next-line: a file this design doc intends to create (#3240) -->
`changeset pack --out-dir` が版の選び方、依存の順、tag、pack を受け持つ。新しいスクリプト `scripts/release/stage.mts` は計画を読み、**計画の先頭のグループだけ**を `npm stage publish <tarball> --tag <tag> --json` で stage して、stage id と tarball の integrity を出力する。

`stage.mts` は 2 つのサブコマンドに分かれる。`pack` は計画を作って検査し、先頭のグループの tarball と計画を出す。`publish` はそれを受け取って `npm stage publish` を実行する。2 つは別のジョブで動く（案 7E）。

- 計画には npm にまだ無い版だけが入るので、先頭のグループは「依存先がすべて npm に載っている」パッケージの集まりになる。`karasu-skills` と `karasu` を両方上げたリリースでは、1 回目の run が `karasu-skills`（と `@karasu-tools/core`）だけを stage する。`karasu` は `karasu-skills` が承認されて npm に載ったあとの run で、はじめて先頭のグループになり stage される。依存元は依存先がインストールできるようになるまで stage のキューに入らないので、npmjs.com の画面から承認しても順序は崩れない（TPL-3240）。
- 先頭のグループがまだ承認されていない（stage 済み）ときに走った run は、それを stage 済みとして飛ばし、次のグループには進まない。

- `workspace:*` の置き換えと `prepack` の刻印は pnpm が行う（上の確認）。
- 計画の tag は、changesets の pre モード（`pre.json`）を使わないかぎり `latest` で、`changeset pack` に `--tag` は無い。`--tag` を明示すると npm の「prerelease には `--tag` が要る」という検査が働かなくなるので、`stage.mts` は prerelease の版に `latest` を付けようとしたら止める。リハーサルの `--tag rehearsal` は spike だけの上書きにする。
- `stage.mts` は、実行しているコミット（CI では `GITHUB_SHA`、手元では `HEAD`）がリリースのコミット（`chore/release-*` のブランチをマージした PR のマージコミット。`close-train` と同じ `commits/<sha>/pulls` の API で判定する）でなければ何も stage しない。CI ではこのために `pack` と `stage` の両方のジョブに `pull-requests: read` と `GH_TOKEN` を渡す（`stage` は案 7E で判定し直す）。リリースを取りやめた版が `package.json` に残ったまま、`CHANGELOG.md` に触れる後の push や手動の `workflow_dispatch` で stage し直されるのを防ぐ。spike のリハーサルでだけこの判定を外す。
- 再実行では、前の試行で stage 済みの版が一意制約で拒否される。CI は stage のキューを見られないので、拒否の応答を見て「stage 済み」と判断するしかない。応答の形（HTTP status と `code`）はリハーサルで確かめ、知っている形だけを stage 済みとして扱う。知らない失敗は失敗として止める（TPL-2804）。stage 済みとして扱った版は「この run が stage したものではない」と出力に明示する。論点 7 の照合が、その tarball を誰が作ったかを確かめる。

- stage する集合は changesets が決める（`private` でも `ignore` でもない全パッケージ）。タグと Release が扱う集合は `RELEASED_PACKAGES`（`scripts/release/github-release.mts` の手書きの一覧）である。新しい公開パッケージを足したのに一覧へ入れ忘れると、stage と承認はされるのにタグが打たれない。`stage.mts` は、計画に `RELEASED_PACKAGES` に無いパッケージがあれば止める。
- 計画に、リリースコミットで版を上げていないパッケージがあれば、`stage.mts` は何も stage せずに止める。取りやめたリリースの版は npm に無いまま `package.json` に残るので、次のリリースでそのパッケージを上げないと `changeset pack` が計画に入れる。そのまま stage して承認すると、版を上げたパッケージ（論点 4 の定義）に数えられないのでタグが打たれず、リリースコミットの版なので計画外の版（案 7D）にも当たらない。判定は論点 4 と同じ first parent との比較で行う。止まったときの手順は論点 4「reject したとき」に書く。

**案 1D を採る。** 案 1A と同じ結果を、changesets の判定をそのまま使って得られる。

### 論点 2: タグと GitHub Release をいつ作るか

#### 案 2A: stage した時点で作る

Release には、まだインストールできず、reject されうる版が並ぶ。ADR-2939 決定 2 の「公開に成功した版にだけタグを付ける」に反する。却下。

#### 案 2B: 承認のあとに別の workflow で作る

新しい workflow `release-confirm.yml` が、リリースコミットで版を上げた npm パッケージ（論点 4 の定義）について、その版が npm に載ったことを確かめ、載った版にタグを打って Release を作る。版を上げなかったパッケージは、前のリリースのタグが別のコミットにあるので触らない。リリースコミットは、開いているトレインの Issue が名指すブランチ（`scripts/release/train.mts issue-branch`）から、そのブランチをマージした PR のマージコミットとして求める。`main` が先に進んでいても同じコミットに着く。

- この workflow は `id-token: write` を持たない。Trusted Publisher は `release.yml` に紐づくので、記録の workflow からは npm に何も出せない。
- いまの `record` ジョブの処理（タグの push、`github-release.mts --commit`）をそのまま移せる。
- タグは自前で打つので、`changeset publish` のタグ付けの失敗を検出していた「Collect the tags」（#2982）は要らなくなる。
- タグを打つ前に、論点 7 の公開後の照合（案 7D）を通す。照合に通らなかった版には、タグも Release も作らない。
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

#### 案 3B: 依存先が npm に載るまで依存元を stage せず、承認のスクリプトがその段を進める

<!-- absent-path-next-line: a file this design doc intends to create (#3240) -->
`scripts/release/approve.mts`（`pnpm release:approve`）を kompiro が手元で実行する。

1. リリースコミットを `release-confirm.yml` と同じ方法で求める（`--commit <sha>` で指定もできる）。
2. そのコミットを手元の一時的な worktree に取り出してビルドし、`changeset pack` を実行する。出てきた `publish-plan.json` の順で承認する。計画は依存の順に並んでいて、`karasu-skills` が `karasu` より先に来る。順序は手で並べた表ではなく、この計画から取る（TPL-3240）。tarball は論点 7 の照合に使う。`changeset publish-plan` の JSON 出力は experimental なので使わない。
3. 計画の各版について、`npm stage list <name> --json` から stage 済みの項目を探し、論点 7 の照合を行う。tag が計画と違えば照合に落とす。
4. 照合の結果（パッケージ、版、tag、stage id、stage した主体と日時、照合の結果）を表示して確認を取る。3 パッケージの stage のキューに計画に無い項目（ほかの版）があれば、それも表示して reject を勧める。乗っ取られた run が別の版（たとえば `latest` の付いたより高い版）を stage していた場合に、画面で誤って承認されないようにするためである。
5. stage 済みの項目（計画の先頭のグループ）を `npm stage approve <id>` で承認する。2FA はそのたびに npm が求める。最初の失敗で止まる。承認した版が npm に載るのを待ち、メタデータのうちインストールに効く項目（依存、`bin`、`scripts`、`os` / `cpu` など）を手元の pack の `package.json` と比べる。違えば `release-confirm.yml` を起動して報告させ、次のグループに進まずに止まる（案 7E の前提が崩れたときに気づくため）。
6. 計画にまだ次のグループがあれば、リリースコミットで走った `release.yml` の run を `gh run rerun` で再実行させ、次のグループが stage されるのを待って 2 に戻る（手元の pack から次のグループが計画の先頭になる）。
7. 最後に `gh workflow run release-confirm.yml` で記録の workflow を起動する。

`--dry-run` は 2 から 4 だけを行い、承認も起動もしない。`--expect-tag <tag>` は照合する tag を計画の tag の代わりに使う（リハーサルの `rehearsal` 用）。どちらもリハーサルで使う。

画面で先頭のグループを承認したときは、次のグループを stage する run が起きない。`release-confirm.yml` は、版を上げた npm パッケージの一部だけが npm に載っている状態を見つけたら、「次のグループを stage するために `pnpm release:approve` を実行する（または `release.yml` の run を再実行する）」とトレインの Issue にコメントする。

順序の違反（`karasu` が npm にあるのに、その tarball の `dependencies` / `optionalDependencies` / `peerDependencies` が完全一致で指す `karasu-skills` の版が npm に無い。`devDependencies` は数えない）は、上の stage の段で起きないはずだが、`release-confirm.yml` は念のためこれを検出したら失敗し、トレインの Issue にコメントする。

**案 3B を採る。** `docs/release.md` は `pnpm release:approve` を正の手順とし、kompiro が npmjs.com の画面で承認することは禁止しない（kompiro の判断、2026-11-02。案 7D の限界を踏まえて 2026-11-07 に再度確認した）。依存元は依存先が npm に載るまで stage されないので、画面で承認しても順序は崩れない。tarball の中身は、画面で承認した版も論点 7 の案 7D で照合する。画面で承認するときは、先に `pnpm release:approve --dry-run` を実行すれば公開の前に照合できる（`docs/release.md` にこの手順を書く）。段を分けて stage する形は、CodeRabbit CLI の指摘を受けて kompiro が 2026-11-02 に選んだ（それまでは画面で順序を誤ると、検出までのあいだ `npm i karasu` が壊れうる設計だった）。承認のあいだに `release.yml` の再実行が 1 回入り、その分（数分）待つ。

逆向きの依存もある。skill は CLI を呼ぶが、`karasu-skills` は npm の依存を持たない。この依存は ADR-2901 の版の下限で扱っている。pack のときに CLI の版が各 SKILL.md に刻まれ、エージェントは Step 0 で `karasu --version` が刻まれた版より古ければ更新を案内して止まる。`karasu-skills` を先に承認すると、刻まれた版の CLI がまだ npm に無い期間ができる。Claude Code の marketplace は版を固定しないので、その期間に skill を更新した利用者は、存在しない版への更新を案内されて止まる。順序を逆にすると `npm i karasu` が壊れるので、順序は変えない。`pnpm release:approve` は `karasu-skills` のあとに続けて `karasu` を承認するので、期間はふつう `release.yml` の再実行を待つ数分である。ただし `karasu` が照合に落ちたときや reject したときは、原因を調べて次の `karasu` が出るまで続く（論点 4「reject したとき」）。画面で承認するときも、`karasu-skills` を承認したら間を空けずに `karasu` まで進める（`docs/release.md` に書く）。

### 論点 4: トレインの Issue をいつ閉じるか

閉じる条件を次の 2 つにまとめる。判定は `scripts/release/train.mts` に置き、`release.yml` の `close-train` と `release-confirm.yml` の両方から呼ぶ。

- **npm**: リリースコミットで版が変わった npm パッケージ（そのコミットと、その first parent とで `package.json` の版が違うもの）のタグが、すべてリリースコミットを指している。版が変わらなかったパッケージは対象にしない。「どこかにタグがある」では判定しない。版を上げたのに別のコミットにタグが打たれた場合を通さないためである。タグは照合を通った版にしか打たれないので（案 7D）、照合に落ちた版があれば Issue は閉じない。
- **VS Code**: いまの `close-train` と同じく、`vscode` ジョブの結果で判定する（`AZURE_CLIENT_ID` が無くて公開を飛ばした成功も含む）。`release-confirm.yml` は、リリースコミットで走った `release.yml` の最新の run を Actions の API（`head_sha` で絞る）で引き、その `vscode` ジョブの結果を読む。`vscode` は reusable workflow を呼ぶジョブなので、API には `VS Code extension / <呼ばれたジョブ>` の名前で並ぶ。それらがすべて成功か skip なら成功とみなす。Issue のコメントは誰でも書けるので材料にしない。

動き:

- `release.yml` の `close-train` は、npm の条件が満たされていなければ閉じない。stage した版の一覧と `pnpm release:approve` の案内をコメントし、成功で終わる（承認待ちは失敗ではない）。版を上げた npm パッケージが無ければ、いまと同じく VS Code の結果だけで閉じる。
- `release-confirm.yml` が最後に同じ判定を行い、満たせば Release のリンクを付けて閉じる。
- `close-train` も `release-record` の concurrency グループに入れ、`release-confirm.yml` と同時に判定やコメントをしないようにする。

トレインの Issue のチェックリスト（`train.mts` が生成する）に「Approve the staged npm versions (`pnpm release:approve`)」を足す。

#### reject したとき

reject は承認を拒む操作で、この設計が守りたいものの 1 つである。reject した版のタグは現れないので、トレインの Issue は閉じない。`release-prepare.yml` は開いているトレインの Issue があると次のトレインを出さない。reject の理由で次の手が分かれる。

- **stage された tarball が正しくなかった**（論点 7 の照合に落ちた）: reject して版を空け、正しい tarball を stage し直す。`stage` ジョブは「stage 済み」を成功として終えているので、**Re-run failed jobs** では走らない。`release.yml` のその run を **Re-run all jobs** で再実行する（再実行は元の run と同じリリースコミットで走る。`vscode` ジョブは公開済みの版を飛ばす）。照合に落ちたということは CI か依存が乗っ取られている疑いがあるので、再実行の前に原因を調べる。乗っ取った側は reject のあとに同じ版をまた stage しうるので、再実行のあとも照合をやり直す。原因を取り除けないあいだは、下の「CI の経路が使えないとき」に従って手元から stage する。
- **リリースそのものを出さないと決めた**（stage した版に不具合があった）: 残りの stage 済みの版も reject し、reject した版のパッケージごとに patch の changeset を足す PR をマージしてから、トレインの Issue に理由を書いて手で閉じる。次のリリースでそのパッケージの版が上がり、reject した版番号は使われないまま飛ぶ。直した変更は次のトレイン（または `release-prepare.yml` の手動実行）で、次の版として出す。取りやめた版は次のトレインまで `main` の `package.json` に残るが、`stage.mts` はリリースのコミットでしか stage しない（論点 1）ので、後の push や `main` での手動の dispatch では stage されない。
  - changeset を足し忘れて次のリリースで `stage.mts` が止まったら（論点 1）、そのリリースでは何も stage されていない。計画に載っているパッケージごとに patch の changeset を足す PR をマージし、そのトレインの Issue を手で閉じて、`release-prepare.yml` を手動で実行する。
  - すでに承認した版があれば、それは npm に残る（unpublish はしない）。Issue を閉じる前に `release-confirm.yml` を手で起動し、承認済みの版のタグと Release を作る。
  - 依存元（`karasu`）は依存先（`karasu-skills`）が npm に載ってから stage されるので、依存元だけが承認済みで依存先を reject する、という状態にはならない（論点 3）。依存先を承認したあとで依存元の stage を reject すると、`npm i karasu` は壊れないが、承認した `karasu-skills` の skill は、刻まれた版の CLI が出ないので止まったままになる（論点 3 の逆向きの依存）。刻まれた版より新しい CLI が出れば解ける。そこで上の手順どおり changeset の PR をマージし、承認済みの版を記録してトレインの Issue を閉じたら、月次のトレインを待たずに `release-prepare.yml` を手動で実行して、次の版の `karasu` を出す。不具合の直しに時間がかかるなら、取りやめた変更を戻した状態で出してよいが、承認した skill が使う CLI の変更（新しいコマンドやフラグ）は戻さない。戻すと skill は Step 0 の版の照合を通ったあとで、途中で失敗する。

この 2 つを `docs/release.md` に書く。

#### 公開後の照合に落ちたとき

案 7D の照合に落ちた版は、すでにインストールできる。`release-confirm.yml` は失敗して、落ちた版とファイルの一覧をトレインの Issue にコメントする。タグも Release も作らないので、Issue は開いたままで次のトレインも出ない。kompiro が差分を調べ、結果で次の手が分かれる。

- **環境で変わるファイルだった**（誤検出）: 照合の規則を直す PR をマージし、`release-confirm.yml` を起動し直す。
- **tarball が正しくなかった**: 侵害として扱う。3 パッケージの Trusted Publisher の接続を削除して CI からの stage を止め、その版を取り下げる（npm の unpublish の条件を満たせば unpublish、満たさなければ deprecate）。原因を取り除いてから次の版を出す。取り下げた版番号は飛ばし、タグも Release も作らない。Issue に経緯を書いて手で閉じる。

この手順も `docs/release.md` に書く。

#### CI の経路が使えないとき

`stage.mts` は stage の認証を npm に任せていて、OIDC でなくても動く。npm のセッショントークンでも stage はできる（`npm help stage` の Token Behavior）。CI の stage の経路が本番で失敗したら、kompiro がリリースコミットを手元に取り出してビルドし、`npm login` したうえで `node scripts/release/stage.mts pack` と `node scripts/release/stage.mts publish` を続けて実行する。stage したあとは承認から記録までいつもの流れに乗る。

- リリースコミットの中身をそのまま出せる。実装の PR を revert して `release.yml` を再実行する方法では戻せない。再実行は元の run と同じリリースコミット（実装を含む）で走り、`main` での `workflow_dispatch` はリリースより後の変更を含みうるからである。
- 手元から stage した版には provenance が付かない（ADR-9020 の手動公開と同じ）。`karasu` と `@karasu-tools/core` は `publishConfig.provenance: true` を持ち、npm は tarball の公開でもこれを読む。CI の外で provenance を求めると npm は `Automatic provenance generation not supported for provider: null` で止まるので、`stage.mts` は GitHub Actions の外では `--provenance=false` を付ける。
- 手元でもリリースコミットを取り出して実行するので、`stage.mts` のリリースのコミットの判定はそのまま通る。
- すでに承認した版があっても手順は変わらない。`changeset pack` は npm にある版を計画に入れないので、残りの版だけが stage される。
- 案 6B で接続を削除したパッケージの版を、接続を作る前に出すときも、この手順を使える。

この手順を `docs/release.md` に書く。直接 publish の許可（Trusted Publisher の「Allow `npm publish`」）に戻る経路を残さなくてよくなるので、段階 B を本番のトレインより前に進められる（「切り替えの段階」）。

### 論点 5: VS Code 拡張は npm の承認を待つか

待たない。拡張はいまも npm の結果に関係なく公開していて、Release への追記は後から節を足す形で動いている。承認待ちのあいだは、拡張の節だけを持つ Release が先にできる。`release-confirm.yml` がタグから作り直すときに npm の節が加わる（ADR-2939 決定 3）。

### 論点 6: どの順で切り替えるか

3 パッケージを同時に切り替える。1 つでも「Allow `npm publish`」が残れば、そのパッケージは直接 publish できる。

#### 案 6A: マージ直後に「Allow `npm publish`」を外す（1 回の操作）

実装の PR がマージされた直後に、3 パッケージの接続で「Allow `npm publish`」のチェックを外し、stage だけを許可する形にする。同じ編集で environment `npm` の条件を足す（案 7E）。environment の項目が編集できるか、編集で検証済みの状態が保たれるかも Allowed actions と同じく文書からは分からないので、同じ扱いにする。接続は消さないので、検証済みの状態が保たれれば 2 日の期限は始まらず、以後のトレインは接続に触らずに stage で出せる。

- 外したら、3 パッケージとも画面で「not yet validated」が出ていないことと、「Allow `npm publish`」と「Allow `npm dist-tag`」が外れていることを確かめる（dist-tag を許可すると、乗っ取られた run が `latest` を動かせる）。状態が画面で分からなければ、未検証として扱う（その場合は 3 パッケージとも案 6B になる）。
- 未検証に戻ったパッケージと、チェックを外せないか environment の条件を足せず、削除と作成しかできないパッケージは、接続を削除して案 6B に移る。案 6B もマージ直後に削除するので、やり直す作業は無い。
- 受け入れるリスク: マージから最初のトレインまで、版を上げないパッケージも含めて CI から stage できる経路が開いている（論点 7 の、先に stage する攻撃）。stage した版は承認するまでインストールできず、`pnpm release:approve` は照合に落ちた版を承認せず、計画に無い項目は reject を勧める（案 7C）。画面で承認したときも、公開後の照合がタグと Release を止める（案 7D）。案 6B でも版を上げたパッケージの接続は残るので、差はパッケージごとに、次に版を上げるまでの期間である。版を上げないパッケージは、そのあいだ先に stage されうる。`pnpm release:approve` は 3 パッケージの stage のキューを表示するので、気づくのは次のトレインの承認のときである。

#### 案 6B: マージ直後に接続を削除し、リリース PR の直前に作る（2 回の操作）

1. 実装の PR がマージされた直後に、3 パッケージの接続を削除する。
2. 版を上げるリリース PR をマージする直前に、そのリリースで版を上げるパッケージの接続を、stage だけを許可し environment `npm` を条件にした形で作る。版を上げないパッケージの接続は、次に版を上げるときまで作らない。作ってから 2 日以内に承認まで終える。

最初のトレインまで CI から npm へ出す経路が無く、編集で検証済みの状態が保たれるかという npm の挙動を前提にしない。ただし作るたびに 2 日の期限が始まる（「制約・前提」）。マージ直後に作れば次のトレインまでに失効し、リリース PR の直前に作るなら、作り忘れや承認の遅れで失効しうる。#3238 の `karasu-skills` が当たったのはこの失敗である。

作った直後に spike から stage して接続を検証する案は採らない。stage が検証に数えられるかが分からず、数えられなくても失効に気づくのは本番のトレインになる。

**案 6A を採り、外せなかったパッケージだけ案 6B で進める**（kompiro の判断、2026-11-08）。2026-11-07 にはいったん案 6B を了承したが、2 日の期限による失敗が実際に起きていることと、開いたままになる経路は stage だけで承認と照合を通らないと公開されないことから改めた。段階 0 で `karasu` か `@karasu-tools/core` に stage の許可を足すことになれば、編集で検証済みの状態が保たれるかの材料になるが、確証にはならない。stage を足す操作と `npm publish` を外す操作は別で、`karasu-skills` は接続を作った時期も違うからである。確かめるのは B で外したときである。

CI から直接 publish する経路を予備として残す必要は無い。stage の経路が本番で失敗しても、案 6B で接続が無いあいだも、手元から stage すれば版を出せる（論点 4「CI の経路が使えないとき」）。接続が失効していたら stage が `E404` で止まるので、作り直して `release.yml` の run を再実行する。

「Allow `npm publish`」を外すのと同じときに、3 パッケージの package access を「Require two-factor authentication and disallow tokens」にする（`npm help stage` の Best Practices 2）。文書は Trusted Publisher に影響しないとしているが、この設定で Trusted Publishing の stage が通るかは最初の本番の stage で確かめる（通らなければ設定を戻し、別の Issue にする）。

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

#### 案 7D: 公開された版を、`release-confirm.yml` がリリースコミットの pack と照合する

案 7C は `pnpm release:approve` の経路でしか働かない。画面で承認すると照合を通らずに公開され、`npm view` は版の存在しか見ないので、そのままタグ、Release、Issue のクローズまで進む。`release-confirm.yml` は承認の経路を知ることができないので、経路を問わず、npm に載っていてタグがまだ無い版のすべてを照合する。

- `verify` ジョブ（`contents: read`、`id-token` なし）がリリースコミットを取り出してビルドし、各パッケージのディレクトリで `pnpm pack` する。公開済みの版は `changeset pack` の計画に入らないので、ここでは pack を直接呼ぶ。pack の処理は `changeset pack` と同じ pnpm の pack である。
- 公開された tarball を `npm pack <name>@<version> --ignore-scripts` で取り出し、案 7C と同じ処理で中身を比べる。npm はレジストリのメタデータで依存を解決するので、メタデータのうちインストールに効く項目も pack の `package.json` と比べる。tarball は信用できない入力なので、展開するときに中のパスをそのまま使わない。
- `record` ジョブ（`contents: write`）は、`verify` が通した版にだけタグを打つ。依存のスクリプトが走るビルドを、タグを push できる権限と同じジョブに置かないためである。`record` はいまと同じく依存を入れずに動く。
- `verify` は、計画に無い版が公開されていれば失敗する。画面で承認された計画外の版は、`--tag next` のように `latest` を動かさないものも含めて、版ごとの照合には現れないためである。判定はパッケージごとに `npm view <name> time versions --json` で行う。タグのある最新の版の公開時刻より後に公開された版のうち、リリースコミットの版でないものを計画外とする。以前からある版は基準より前なので対象にならず、トレインの合間に承認された版も次の照合で見つかる。取り下げ済みの版（`versions` に無いものと deprecate したもの）は除く。
- ビルドや `npm` の取得の失敗は、不一致と区別して失敗にする（TPL-2804）。Issue に「照合に落ちた」と書くのは、中身を比べて違ったときと計画外の版を見つけたときだけである。
- 案 7B と違い、`stage.mts` の出力を信用せず、別の run でビルドし直して比べる。書き換えた `release.yml` を別のブランチから動かして stage したものは、これで見つかる。

限界が 2 つある。照合は公開の後なので、公開そのものは止められない。止められるのはタグ、Release、Issue のクローズで、公開された版は取り下げることになる（論点 4「公開後の照合に落ちたとき」）。また、乗っ取られた依存が両方のビルドに同じ偽物を入れると見抜けず、`verify` の結果も偽られる。公開の前に CI の外で照合できるのは案 7C だけなので、`pnpm release:approve` を正の手順とする判断は変わらない。

画面での承認を禁止する案は採らない。止める設定が無いので禁止は文書の上にとどまり、禁止を破って承認された版を止めるには結局 7D と同じ確認が要る。

#### 案 7E: OIDC のトークンを持つジョブで、外のコードを動かさない

7C が承認前に比べられるのは tarball のファイルだけである。stage のキューは版のメタデータを見せないので（「制約・前提」）、tarball は本物のままメタデータだけを偽った版は、承認前の照合を通る。いまの `release` ジョブは OIDC のトークンを持ったまま `pnpm install` と `pnpm build` を実行するので、乗っ取られた依存はそのトークンで、tarball と違うメタデータを付けて stage できる。`vscode` ジョブも `id-token: write` を持ち、`vscode-release.yml` で依存を入れる。そのトークンを npm が受け入れるなら、同じことができる（「そのほかの前提」）。

`release.yml` の stage を 2 つのジョブに分け、npm がトークンを受け入れるジョブを `stage` だけにする。

- `pack` ジョブ（`contents: read`、`pull-requests: read`、`id-token` なし）: 依存を入れてビルドし、`stage.mts pack` で計画を作って検査する。先頭のグループの tarball を artifact にする。
- `stage` ジョブ（`contents: read`、`pull-requests: read`、`id-token: write`、GitHub の environment `npm`）: リリースコミットを `fetch-depth: 0` で取り出すが、依存を入れず、cache も復元しない（`setup-node` に `package-manager-cache: false`。乗っ取られた `pack` ジョブが cache を汚しうる）。Node に同梱の npm と、Node の組み込みだけを使う `stage.mts publish` を実行する（tarball からは `package/package.json` だけを、`zlib` と tar のヘッダーの読み取りで取り出す）。`pack` ジョブの出力を `${{ }}` の式で受け取らない。
- artifact は乗っ取られた `pack` ジョブも書けるので、`publish` は artifact から tarball のファイルだけを受け取り、何を stage するかを自分で決め直す。リリースコミットであること、そのコミットで版を上げたパッケージであること（first parent との比較）、`RELEASED_PACKAGES` にあること、版が npm にまだ無いこと（`npm view`）、先頭のグループであること（リリースコミットの `package.json` の `dependencies` / `optionalDependencies` / `peerDependencies` が `workspace:` で指す `RELEASED_PACKAGES` のパッケージについて、リリースコミットでのその版が npm にある。tarball の中の依存は信用できない入力なので、順序の判定には使わない。changesets と同じく `devDependencies` は数えない。`karasu` の `devDependencies` の `@karasu-tools/core` は pack で完全一致の版になるが、バンドルに入るので順序に関わらない）を、リリースコミットと npm から確かめる。tag は計画から取らず版から決める（prerelease でなければ `latest`。changesets の pre モードでは `.changeset/pre.json` の tag。prerelease なのに `pre.json` が無ければ止める。リハーサルの `--tag rehearsal` の上書きは `publish` に渡す）。tarball はダウンロードしたディレクトリの中のファイルだけを、展開後の大きさに上限を付けて読み、中の `package.json` の名前と版がリリースコミットの `package.json` と一致することを確かめる。npm は tarball の `publishConfig` を publish の設定に取り込むので、`publishConfig` もリリースコミットの `package.json` と一致し、キーが `access` と `provenance` だけであることを確かめる（乗っ取られた `pack` ジョブが registry、proxy、TLS の設定を入れると、OIDC の交換の通信が攻撃者に向きうる）。registry はコマンドラインで `https://registry.npmjs.org/` に固定する。どれかが合わなければ何も stage せずに止める。合えば `npm stage publish <tarball> --ignore-scripts` する。
- Trusted Publisher の接続に environment `npm` を条件として足す（#3704）。この environment を名乗るのは `stage` ジョブだけなので、`vscode` ジョブのトークンも、environment の無い run のトークンも npm は受け入れない。environment の deployment branch を `main` に限るので、別のブランチで書き換えた `release.yml` を動かす run も、environment を名乗れずに止まる。
- 効果: npm の CLI は tarball の中身からメタデータを作るので（「制約・前提」）、stage される版のメタデータは tarball で決まる。tarball は 7C で承認前に照合するので（画面で承認した版は 7D で公開後に照合する）、インストールに効く項目も同じ時点で確かめたことになる。`pack` ジョブが乗っ取られても、変えられるのは tarball の中身だけで、それは 7C で見つかる。何を、どの順に、どの tag で stage するかは `stage` ジョブが決める。
- 残る経路: `main` の `release.yml` や `stage.mts` そのものの書き換え（PR のマージが要る）と、`stage` ジョブが動かす action（`actions/checkout`、`actions/setup-node`、`actions/download-artifact`。`.github/workflows/actions.lock` が commit を固定し、Verify Actions Lockfile が検査する）、Node、npm の CLI の乗っ取り。
- 承認の直後に `pnpm release:approve` がインストールに効く項目を比べる確認（案 3B）と、7D の確認は残す。7E の前提（メタデータは tarball から作られる）が崩れたときに気づくためである。
- 手元から stage する経路（論点 4「CI の経路が使えないとき」）では、ビルドと stage が同じ手元で動くので、7E の効果は無い。そこでは承認の直後の確認で受ける。

**案 7C、7D、7E を採り、7A の表示も添える。** 7B は採らない。

## 比較

| 論点                 | 採る案                                                 | 主な理由                                                                                 |
| -------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 1 公開の置き換え     | 1D `changeset pack` の計画で `npm stage publish`       | 版の選び方・依存の順・tag を changesets から受け取れる                                   |
| 2 タグと Release     | 2B 承認後に `release-confirm.yml`（スクリプト + 毎日） | 「公開に成功した版にだけタグ」（ADR-2939）を保つ。記録の workflow が公開の権限を持たない |
| 3 承認順             | 3B 依存先が npm に載るまで依存元を stage しない        | 順序を注意に頼らない。画面で承認しても崩れない                                           |
| 4 Issue を閉じる時点 | 版を上げた npm パッケージのタグ + VS Code の結果       | 2 つの workflow が同じ条件で判定できる                                                   |
| 5 VS Code            | 待たない                                               | 既存の構成のまま動く                                                                     |
| 6 切り替え           | 6A マージ直後に「Allow `npm publish`」を外す（外せなければ 6B） | 直接 publish の穴を早く塞ぐ。編集で検証済みが保たれれば、2 日の期限が始まらない           |
| 7 tarball の照合     | 7C 手元での照合 + 7D 公開後に CI で照合 + 7E stage のジョブで外のコードを動かさない | 7C は照合の相手を CI の外に置く。7D は承認の経路を問わずタグの前に照合する。7E はメタデータを tarball と一致させ、7C の照合を承認前に効かせる |

## Related TPLs

- [TPL-1681](../test-perspectives/TPL-1681-publishable-tarball-completeness.md): tarball の作り方が `pnpm publish` から `changeset pack`（pnpm の pack）に変わる。中身は「ソースに何があるか」ではなく tarball で確かめる。リハーサルで各パッケージの tarball の Tarball Contents を、前回の公開と比べる。
- [TPL-2804](../test-perspectives/TPL-2804-guard-scan-set-fails-loud-on-the-unknown.md): 再実行で受ける拒否のうち知っている形（stage 済み）だけを飛ばし、`npm view` の失敗のうち `E404` だけを「まだ無い」とする。知らない失敗は止める。
- [TPL-2446](../test-perspectives/TPL-2446-gate-side-check-runs-over-the-whole-set.md): stage と承認の順序は changesets の計画から、記録と Issue を閉じる判定は `RELEASED_PACKAGES` と各 `package.json` から導き、スクリプトの中でパッケージ名を並べない。`RELEASED_PACKAGES` は手書きの一覧なので、changesets の集合とずれたら `stage.mts` が止める（論点 1）。公開後の照合も、承認の経路で対象を絞らず、タグの無い版のすべてに当てる（案 7D）。
- [TPL-3240](../test-perspectives/TPL-3240-exact-pinned-dependency-installable-after-its-target.md)（proactive、本 PR で起こす）: 完全一致で依存するパッケージは、依存先がインストールできるようになってからインストールできるようにする。

## 現時点の方針

**論点 1〜7 とも上の「比較」の案を採る。** 公開の経路を stage に変える実装をリハーサルで確かめてからマージし、マージの直後に「Allow `npm publish`」を外して直接 publish の経路を閉じ、最初の本番のトレインから stage で出す。

### 切り替えの段階

実装の PR は 1 本で、#3240 はその PR で閉じる。B と C はマージ後にしか進められないので、実装の PR を作る前に追跡用の Issue を 1 つ起こし、PR の本文から番号を示す（ADR-3271）。

| 段階                                                                                                        | 前提 | 途中で止めても困らない理由                                                 |
| ----------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------- |
| **0** Trusted Publisher の設定確認。必要なら作り直す（kompiro が A のリハーサルの直前に npmjs.com で行う）  | なし | 公開が走るのはリリース PR のマージのときだけ。失効しても作り直せば戻る     |
| **A** stage の経路の実装と、リハーサル（実装の PR）                                                         | 0    | マージ前のリハーサルで CI の stage の経路を確かめる                        |
| **B** マージ直後に 3 パッケージの「Allow `npm publish`」を外して environment `npm` の条件を足し（できなければ接続を削除し）、package access を「disallow tokens」にする（追跡用の Issue） | A    | CI からは stage しかできなくなるだけで、接続を削除したパッケージも手元から stage できる |
| **C** 2026-11-29 のトレインを stage で出す。B で接続を削除したパッケージは、版を上げるならリリース PR の直前に作る（追跡用の Issue） | B    | 同上                                                                       |

- **0**: `karasu` と `@karasu-tools/core` の Trusted Publisher で stage が許可されているかを確かめる。`karasu-skills` は許可されているので変えない。許可されていなければ、リハーサルの spike をすぐ動かせる状態にしてから、「Allow `npm publish`」は外さずに、まず画面で stage の許可を足す（kompiro の記憶では #3238 で切り替えられた）。足したら接続の状態を画面で見る。状態が画面で分からなければ、未検証として扱う。
  - 検証済みのままなら、そのままリハーサルに進む（論点 6 の案 6A の材料になる）。
  - 未検証に戻ったら、作り直したときと同じく 2 日以内にリハーサルを行う（下の 3 も同じ）。
  - 切り替えられなければ、次の順で作り直す。
    1. 削除から作成までのあいだ、その接続の OIDC の publish と stage は通らない。削除の前に、リリース PR が開いていないことと `release.yml` が走っていないこと（`gh run list --workflow release.yml --status in_progress`）を確かめる。
    2. 接続を削除し、stage と「Allow `npm publish`」の両方を許可して作り直す。実装がマージされるまでは、いまの公開の経路がまだ `npm publish` を使うからである。2 日以内にリハーサルを行う。
    3. リハーサルを終える前に失効したら（`E404`）、接続を削除して作り直し、リハーサルを続ける。リハーサルを終えたあとの失効では作り直さず、B でその接続を削除して案 6B で進める（stage が検証に数えられなければ、リハーサルのあとも失効する）。実装より先にトレインを出すことになったら、`docs/release.md` の前提どおりリリース PR のマージ直前に作り直す。
- **A のリハーサル**: Trusted Publisher は environment を条件にしていないので、`spike/3240-stage-publish-rehearsal` で `release.yml` を `workflow_dispatch` すれば本番と同じ OIDC の経路を通る。3 パッケージの版を prerelease（`X.Y.Z-rehearsal.0`、`--tag rehearsal`）にして stage し、次を確かめたら kompiro が reject する（2FA を 3 回入力する。この形で行うことは kompiro が 2026-11-02 に了承した）。リハーサルでは承認しないので、1 回目の run は `karasu-skills` と `@karasu-tools/core` だけを stage する（段の分け方の確認になる）。`karasu` は、spike の版の書き換えを `karasu` だけにした 2 回目の run で stage する（`karasu-skills` の現在の版は npm にあるので、`karasu` が先頭のグループになる）。spike は実装のブランチから切り、版の書き換え、`publish` への `--tag rehearsal`、`stage.mts` の `pack` と `publish` の両方でリリースのコミットと版を上げたパッケージの判定を外すことは spike だけに入れる。`vscode` ジョブは、spike では拡張の版を上げないので公開はしない（Entra の federated credential も `main` しか信頼しない）が、要らないので spike の `release.yml` から外す。
  - 3 パッケージとも OIDC で stage できる。ログに `npm --version` を出す
  - 同じ版をもう一度 stage したときの拒否の形（HTTP status と `code`）。`stage.mts` はこの形だけを stage 済みとして扱う
  - `npm stage download` で取り出した tarball の中身（TPL-1681）。`karasu` の `dependencies` が完全一致の版になっていること
  - `npm stage view` に provenance が付いているか
  - `pnpm release:approve --dry-run --commit <spike の sha> --expect-tag rehearsal` が stage id を見つけ、計画の先頭のグループとして並べ、手元で pack した tarball と中身が一致すること（論点 7）。1 回目と 2 回目の run のそれぞれで行う。一致しないファイルがあれば、環境で変わるものかを調べる
  - 案 7D の `verify` が、前回のリリースコミットで pack した tarball と、公開済みの版の中身を一致と判定すること。リハーサルでは承認しないので、公開された版が無いと確かめられないためである。前回の版にはすでにタグがあり、そのままでは照合の対象にならないので、spike では対象をその版に固定し、`record` ジョブを外す（spike からタグや Release を作らないため）。`release-confirm.yml` はまだ `main` に無く `workflow_dispatch` できないので、spike だけ push の trigger を足して動かす
  - 案 7E の形で、`stage` ジョブが依存を入れずに OIDC で stage できること。spike で 1 回 run し、kompiro が 1 回 reject する（2FA を 1 回足す）。`stage` ジョブのログに `npm --version` を出し、再実行したときの拒否の形、`pnpm release:approve --dry-run` での照合、`npm stage view` を 1 回目と同じく確かめる。environment は repo に 1 つなので、kompiro がリハーサルの前に environment `npm` を作り、deployment branch を `main` と spike のブランチにする（作らずに参照すると、branch の制限の無い environment が自動で作られる）。Trusted Publisher の environment の条件は B で足すので、条件そのものは B のあとと C で確かめる
  - 0 で接続を作り直した、または未検証に戻ったパッケージがあれば、stage のあとに npmjs.com の表示で検証済みになったか。stage が 2 日の期限の 1 回に数えられるかがここで分かる。数えられなくても、案 6B で作る接続は承認まで 2 日以内に終えるので変わらない
- **B** では、GitHub の environment `npm` の deployment branch から spike のブランチを外して `main` だけにし、3 パッケージの接続に environment `npm` の条件を足す（案 7E）。接続を編集して足せなければ、その接続は削除して案 6B で作る（作るときに environment の条件を入れる）。
- **B のあと**に確かめること: 接続を残したパッケージは「Allow `npm publish`」と「Allow `npm dist-tag`」が外れ、environment の条件が入り、検証済みのままであること（論点 6 の案 6A）。environment `npm` の deployment branch が `main` だけであること。environment を名乗らないジョブのトークンが拒否されること: `main` 以外のブランチの `release.yml` に置いた、environment を持たないジョブから、npm にまだ無い prerelease の版（`--tag envcheck`）を `--loglevel verbose` で stage しようとする（別の workflow ファイルでは、workflow の名前が違うだけで拒否されるので確かめたことにならない。公開済みの版では、OIDC の交換に成功しても npm の CLI が版の重複で止まるので区別できない）。合格は、verbose のログで OIDC の交換が拒否されたと読めたときだけで、ほかの失敗（通信や版の検査）は合格にしない。ログと出たコードを追跡用の Issue に書く。万一 stage されたら条件が効いていないので、kompiro が reject して（2FA を 1 回）原因を調べる。条件が効いていれば stage のキューに何も入らず、2FA も要らない。接続を削除したパッケージは、接続が残っていないこと。
- **C の直前**に行うこと: トレインの Issue の表で版を上げるパッケージを確かめる。そのうち B で接続を削除したものは、リリース PR をマージする直前に接続を environment `npm` の条件付きで作り、「Allow `npm publish`」と「Allow `npm dist-tag`」が外れていることを画面で確かめる。作ってから 2 日以内に承認まで終える。接続を残したパッケージは何もしない。
- **C のあと**に確かめること: environment の条件を足した接続で `stage` ジョブの stage が通ったこと、package access を「disallow tokens」にしても Trusted Publishing の stage が通ったこと、承認した版に provenance（`npm view <name>@<version> dist.attestations`）があること、Release に 3 パッケージと拡張の節が揃っていること、トレインの Issue が `release-confirm.yml` で閉じたこと。追跡用の Issue に書く。

### 実装の指針

<!-- absent-path-next-line: a file this design doc intends to create (#3240) -->
1. `scripts/release/stage.mts`: `pack` と `publish` のサブコマンドに分ける（案 7E）。`pack` は、リリースのコミットでなければ何もしない。`changeset pack --out-dir` の計画を読み、計画に `RELEASED_PACKAGES` に無いパッケージやリリースコミットで版を上げていないパッケージがあれば止める。tag は決めない。先頭のグループの tarball を出力する。`publish` は案 7E のとおり、何を stage するかと tag をリリースコミットと npm から決め直し（prerelease に `latest` を付けようとしたら止める）、先頭のグループだけを `npm stage publish <tarball> --tag <tag> --json --ignore-scripts` で stage する。GitHub Actions の外では `--provenance=false` を付ける。stage 済みの拒否だけを飛ばし、そのことを出力に明示する。stage した `name@version`、stage id、integrity を出力する。
2. `release.yml`:
   - `release` ジョブを `pack` と `stage` に分ける（案 7E）。`pack` は依存を入れてビルドし、`stage.mts pack` の出力を artifact にする。`pull-requests: read` と `GH_TOKEN` は、リリースのコミットを判定する `pack` と `stage` の両方に渡す。`stage` は `id-token: write` と environment `npm` を持ち、依存を入れず、pnpm の setup も cache も使わずに `stage.mts publish` を実行する。`vscode` ジョブの `needs` を `stage` に変え、`close-train` は `pack` と `stage` の両方の結果を読む（`pack` が落ちて `stage` が飛ばされた run を成功と読まないため）。
   - 「Set a git identity」「Collect the tags」と `record` ジョブを削除する。
   - `close-train` を論点 4 の判定に変え、`release-record` の concurrency グループに入れる。
   - ヘッダーのコメントを stage に合わせて書き直す。
3. `.github/workflows/release-confirm.yml`: `workflow_dispatch` と毎日の `schedule`。どのジョブも `id-token` を持たない。ジョブを 2 つに分ける。
   - `verify`（`contents: read`、`issues: read`、`pull-requests: read`）: リリースコミットを求め、npm に載っていてタグがまだ無い版を案 7D のとおり照合する。その版が無い日はビルドしない。計画外の版の検出はビルドが要らないので毎回行う。
   - `record`（`contents: write`、`issues: write`、`pull-requests: read`、`actions: read`。`actions: read` は `release.yml` の run の結果を読むため）: `verify` が通した版のタグを打ち、Release を作り、順序の違反を検出し、論点 4 の判定で Issue を閉じる。`verify` が落ちたら、落ちた版とファイルの一覧を Issue にコメントする。依存を入れない。concurrency は `release-record` グループに入れる。

<!-- absent-path-next-line: a file this design doc intends to create (#3240) -->
4. `scripts/release/approve.mts` と、ルートの `package.json` の `release:approve`。論点 3 の手順（段ごとの承認と `release.yml` の再実行）、論点 7 の照合、承認の直後のインストールに効く項目の照合、notices のプラットフォーム固有の節を除く規則、計画に無い stage 済みの項目の表示、`--dry-run`、`--commit`、`--expect-tag`。照合の処理は `release-confirm.yml` の `verify` と共有する。
5. `scripts/release/train.mts`: チェックリストに承認の行と、「版を上げる npm パッケージに、失効していない stage 専用で environment `npm` を条件にした接続があるか。無ければマージの直前に作る」の行を足し、Issue 本文の文言（いまの「`release.yml` が閉じる」など）を直す。Issue を閉じる判定を足す。
6. テスト: 既存の `scripts/release/*.test.ts` に倣う。計画の読み方、版を上げていないパッケージで止まること、拒否の分類、`npm view` の `E404` とほかの失敗の区別、リリースコミットの求め方、順序の違反の検出、閉じる判定、tarball の中身の照合、照合に落ちた版にタグを打たないこと、計画外の版の検出（`latest` 以外のタグ、以前からある版、取り下げ済みの版）。`release-workflow.test.ts` はいま「Set a git identity」「Collect the tags」と `record` ジョブを検査しているので、書き直す。`release.yml` の `pack` ジョブが `id-token` を持たないこと、`stage` ジョブが `contents: read`、`pull-requests: read`、`id-token: write` だけを持ち、`pnpm install`・pnpm の setup・cache を持たないこと、`id-token: write` を持つのが `stage` と `vscode` だけであること、`stage` ジョブが environment `npm` を持ち `setup-node` の cache を切っていること、`publish` が artifact の tarball の食い違い（リリースコミットで上げていない版、npm にある版、先頭でないグループ、名前や版の違う tarball、ディレクトリの外のパス）で止まること、tag を版から決めること、`release-confirm.yml` が `id-token` を持たないこと、`verify` が `contents: write` を持たず、`record` が依存を入れないことを確かめる。
7. `published-packages.mts` は「Collect the tags」が無くなると使われない。コードで使っているのは `release.yml` と自身のテストだけで、ほかに `release-workflow.test.ts` と `docs/release.md` が名指している（6 と 8 で書き直す）。テストごと削除し、knip で残りが無いことを確かめる。
8. 文書とコメント: `docs/release.md` の「リリースの流れ」（手順 4〜8 の公開の経路・タグ・閉じ方）に、承認、画面で承認する前の `--dry-run`、`release-confirm.yml`、reject したとき、公開後の照合に落ちたとき、CI の経路が使えないときを足す。前提の節は、stage だけを許可する Trusted Publisher の設定、接続が無いパッケージは版を上げるリリース PR のマージ直前に作ること、登録から使うまでに失効しうること（いまの記述を stage に合わせて残す）、package access の設定に書き換える（段階 B と C の操作と同じ内容なので、実装の PR で書く）。`vscode-release.yml` の冒頭と `record` のコメント（`changeset publish` や「Release は `release.yml` が作る」）を直す。
9. ADR の assumptions: ADR-1315 と ADR-9020 の `"release": "pnpm build && changeset publish"` は、実装の PR で成り立たなくなる。ADR-2939 の `release.yml` の `group: release-record` は、`close-train` を同じグループに入れるので残る。成り立たなくなる行は、実装の PR で frontmatter から外す（本文は変えない）。
10. AT は作らない。確かめられるのは本番のトレインだけなので、A のリハーサルの結果は PR の本文に、C のあとの確認は追跡用の Issue に置く（ADR-3169）。
11. ADR 昇格: 実装の PR がマージされたら `docs/adr/3240-staged-npm-publishing.md` に昇格し、本 Design Doc を削除する。新しい ADR は、ADR-1315（`changeset publish` で公開する）、ADR-9020（`release.yml` が OIDC で直接公開する）、ADR-2939 決定 2（`release.yml` の `record` ジョブ）、ADR-2922 の `close-train` の閉じる条件を、どこまで置き換えるかを本文に書き、`related_to` で結ぶ。どれも決定の一部だけを変えるので `supersedes` にはしない（`supersedes` は旧 ADR 全体を superseded にし、まだ有効な決定、たとえば ADR-1315 の changesets による版管理や ADR-2939 のタグと Release の形まで有効でないと読ませる）。決定の一部だけを改訂するときの前例は ADR-2922 で、ADR-1758 の決定 3 を改訂し、`related_to` で結んでいる。旧 ADR の本文は変えない。段階 B で接続を stage 専用にすること（案 6A、外せなければ案 6B）と package access の設定も、この ADR の決定に含める。

### 影響範囲・マイグレーション

- 利用者への影響: なし。公開される tarball の中身は変わらない。公開されるまでの時間が、承認を待つ分だけ延びる。
- メンテナの作業: トレインごとに `pnpm release:approve` を 1 回実行する（ビルドに数分、2FA を 3 回入力する。`karasu-skills` と `karasu` を両方上げたトレインでは、あいだに `release.yml` の再実行を待つ）。案 6B で接続を削除したパッケージの版を上げるときは、リリース PR のマージ直前に接続を作る。文書が定める失効は検証前の接続だけなので、作るのはパッケージごとに最初の 1 回の想定である。
- ドキュメント: `docs/release.md`（実装の PR でまとめて書き換える）。
- テスト: `scripts/release/` のテストを追加・書き直す。`published-packages.test.ts` は削除する。
