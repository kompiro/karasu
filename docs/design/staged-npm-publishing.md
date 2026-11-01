# npm の公開を staged publishing にし、Trusted Publisher を stage 専用にする

- **日付**: 2026-11-01
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3240](https://github.com/kompiro/karasu/issues/3240)
  - 関連 ADR: [ADR-9020](../adr/9020-npm-trusted-publishing-oidc.md)（OIDC Trusted Publishing）、[ADR-1370](../adr/1370-release-flow-actions-driven.md)（Prepare → release PR → マージで publish）、[ADR-2922](../adr/2922-monthly-release-train.md)（月次トレイン）、[ADR-2939](../adr/2939-release-record-tags-and-github-release.md)（タグと GitHub Release）、[ADR-2397](../adr/2397-node-24-baseline.md)（Node 24 と npm の版）
  - 関連 TPL: [TPL-1681](../test-perspectives/TPL-1681-publishable-tarball-completeness.md)、[TPL-2804](../test-perspectives/TPL-2804-guard-scan-set-fails-loud-on-the-unknown.md)、[TPL-2446](../test-perspectives/TPL-2446-gate-side-check-runs-over-the-whole-set.md)、[TPL-3240](../test-perspectives/TPL-3240-exact-pinned-dependency-installable-after-its-target.md)（本 PR で起こす proactive TPL）
  - コード: `.github/workflows/release.yml`、`scripts/release/`、`docs/release.md`

## 背景・課題

いまの npm の公開は、リリース PR のマージで走る `release.yml` が `changeset publish` → `pnpm publish` → `npm publish` で直接 `latest` に出している。認証は OIDC の Trusted Publishing で、人が介在する段階は無い。

Trusted Publisher の照合条件は「repo `kompiro/karasu` の workflow ファイル `release.yml`」だけで、GitHub の environment は設定していない。したがって `id-token: write` を持つ `release.yml` の run を起こせれば、それが乗っ取られた依存でも、書き換えた `release.yml` を別のブランチで `workflow_dispatch` したものでも、インストール可能な版を npm に置ける。

npm は 2026-05 に staged publishing を GA にした。`npm stage publish` で出した版は stage のキューに入り、メンテナが 2FA 付きで承認するまでインストールできない。Trusted Publisher は stage 専用に絞れる。

2026-10-15 のトレイン（#3238）では、`karasu-skills` の Trusted Publisher を登録し直したときに既定の「stage のみ許可」に当たり、`npm publish` が `E403 ... OIDC permission denied for this action` で拒否された。トレインを出すために「Allow `npm publish`」を有効にしたので、3 パッケージとも直接 publish できる状態に戻っている。

本 Design Doc は、3 パッケージ（`karasu`、`@karasu-tools/core`、`karasu-skills`）を staged publishing に移し、Trusted Publisher を stage 専用にするまでの手順を決める。Issue が挙げた 6 つの論点に答える。

## 現状（インベントリ）

| 段階              | 今の実装                                                                                                                                                                                  | stage 化で変わること                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 公開              | `release.yml` の `pnpm run release`（`pnpm build && changeset publish`）。npm に無い版だけを公開する                                                                                      | `changeset publish` に stage モードが無いので置き換える（論点 1）     |
| タグ              | `changeset publish` が runner 上で注釈付きタグを作る。「Collect the tags」が `scripts/release/published-packages.mts` で必要なタグを洗い出し、欠けていれば失敗する（#2982）               | job の終わりに版はまだ npm に無い。タグを打つ時点を決め直す（論点 2） |
| 記録              | `record` ジョブ（`contents: write`）がタグを push し、`scripts/release/github-release.mts` で `release-YYYY-MM-DD` を作る                                                                 | 同上                                                                  |
| VS Code           | `vscode` ジョブが `vscode-release.yml` を呼ぶ。npm の結果に関係なく走り、自前の `record` で同じ Release に節を足す（Release が無ければ作る）                                              | 変えない（論点 5）                                                    |
| トレインの Issue  | `close-train` が全ジョブ成功で Issue を閉じる。失敗なら run のリンクをコメントして開いたままにする                                                                                        | 承認が済むまで閉じない（論点 4）                                      |
| Trusted Publisher | 3 パッケージとも「Allow `npm publish`」が有効。`karasu-skills` は「Allow `npm stage publish`」も有効。`karasu` と `@karasu-tools/core` は 2026-09-03 より前の設定で、stage の許可は未確認 | 最後に「Allow `npm publish`」を外す（論点 6）                         |

依存関係: `karasu` は `dependencies` に `karasu-skills: workspace:*` を持ち、tarball では完全一致の版になる（#2912）。`@karasu-tools/core` は `karasu` の `devDependencies` でバンドルに入るので、公開の順序には関わらない。`karasu-skills` と `@karasu-tools/core` は workspace パッケージに依存しない。

## 制約・前提

npm の staged publishing について、npm 11.16.0 の `npm help stage` / `npm help trust` と npm CLI のソース（`lib/commands/stage/*.js`、`lib/commands/publish.js`）で確かめたこと:

- `npm stage publish` は `npm publish` の派生クラスで、`stage: true` を付けて同じ経路を通る。引数は `<package-spec>` なので tarball のパスを渡せる。OIDC の交換（`oidc()`）と provenance の自動有効化も同じ経路で行われる。
- stage 済みの版は公開済みの版と同じ版番号の一意制約を共有する。stage 済みの版と同じ版は stage も publish もできない。
- `npm stage reject` は stage 済みの版を完全に消す。消したあとは同じ版を stage し直せる（`--tag` を変えるときの手順として man page に書かれている）。
- `approve` と `reject` は 2FA を求める。`publish` / `list` / `view` / `download` は求めない。
- Trusted Publishing の短命トークンで実行できるのは `npm stage publish` と `npm publish` だけで、`npm stage` のほかのサブコマンドは実行できない。CI からは stage のキュー（`list` / `view`）を見られない。
- `npm stage` は workspace を解釈しない。パッケージのディレクトリで実行しても `workspace:*` は解決されない。
- tag は stage 時に決まり、後から変えられない。指定しなければ `latest`。prerelease は `--tag` が必須。
- `npm trust github` は `--allow-publish` と `--allow-stage-publish` で許可する操作を設定する。
- 要件は npm >= 11.15.0、Node >= 22.14.0。`release.yml` の Node 24 は npm 11.17 以上を同梱するので満たす（ADR-2397 の方針どおり npm を別途上げない）。

`pnpm pack` について確かめたこと: `packages/skills` で `pnpm pack` すると `prepack` / `postpack`（`scripts/stamp-version.mjs`）が走り、SKILL.md に CLI の版（`karasu-version: "0.10.0"`）が刻まれる。作業ツリーは元に戻る。公開済みの `karasu-skills@0.2.1` の tarball と比べて、ファイルの一覧、`package.json`、刻まれた版は一致した（本文の差は 0.2.1 の公開後に reference の文書が更新された分）。

そのほかの前提:

- 公開の権限を持つジョブは `contents: read` のままにする（ADR-2939 決定 2）。
- リリースの起点（Prepare → release PR → マージ、ADR-1370 / ADR-2922）は変えない。
- 次のトレインが発車するのは、前のトレインの Issue が閉じてから（ADR-2922）。そのため承認待ちのあいだ、`main` の `packages/*/package.json` の版は stage した版のまま変わらない。
- 対象外: Trusted Publisher に GitHub の environment を条件として足す変更（直接 publish の穴を別の方向から塞ぐ。stage 専用にしたあとで要否を判断する）。VS Code 拡張（Marketplace、Entra ID OIDC）。別 repo の `@kompiro/adr-tools` / `@kompiro/tpl-tools`。

## 検討した選択肢

### 論点 1: `changeset publish` を何で置き換えるか

#### 案 1A: パッケージごとに `pnpm pack` し、`npm stage publish <tarball>` に渡す

新しいスクリプト `scripts/release/stage.mts` が、npm に出すパッケージ（`RELEASED_PACKAGES` のうち `private` でないもの）を順に見る。`package.json` の版が npm にあれば飛ばし、無ければ `pnpm pack` で tarball を作って `npm stage publish <tarball>` を実行する。

- `workspace:*` の置き換えと `prepack` の刻印は、いまと同じ pnpm に任せられる（上の確認）。
- 「npm に無い版だけ」という `changeset publish` の判定は `npm view <name>@<version> version` で再現できる。
- 再実行では、前の試行で stage 済みの版に `npm stage publish` が一意制約で拒否される。CI は stage のキューを見られないので、拒否の応答を見て「stage 済み」と判断するしかない。応答の形（HTTP status と `code`）はリハーサルで確かめ、知っている形だけを stage 済みとみなす。知らない失敗は失敗として止める（TPL-2804）。

#### 案 1B: 各パッケージのディレクトリで `npm stage publish` を実行する

`npm stage` は workspace を解釈しないので、`karasu` の tarball に `"karasu-skills": "workspace:*"` が残り、`npm i karasu` が壊れる。却下。

#### 案 1C: changesets / pnpm の対応を待つ

`changeset publish` も `pnpm publish` も stage モードを持たない。pnpm 11 で `pnpm publish` が npm に委譲しなくなっても（#2401）、stage には対応しない。待つ根拠が無い。却下。

### 論点 2: タグと GitHub Release をいつ作るか

#### 案 2A: stage した時点で作る

いまの構成をほぼ保てる。ただし Release には、まだインストールできず、reject されうる版が並ぶ。ADR-2939 決定 2 の「公開に成功した版にだけタグを付ける」に反する。却下。

#### 案 2B: 承認のあとに別の workflow で作る

新しい workflow `release-confirm.yml`（`workflow_dispatch`）が、リリースコミットの各パッケージの版が npm に載ったことを確かめ、載った版にタグを打って Release を作る。リリースコミットは、開いているトレインの Issue が名指すブランチ（`scripts/release/train.mts issue-branch`）から、そのブランチをマージした PR のマージコミットとして求める。入力は要らない。

- この workflow は `id-token: write` を持たない。Trusted Publisher は `release.yml` に紐づくので、記録の workflow からは npm に何も出せない。
- いまの `record` ジョブの処理（タグの push、`github-release.mts --commit`）をそのまま移せる。
- タグは自前で打つので、`changeset publish` のタグ付けの失敗を検出していた「Collect the tags」（#2982）は要らなくなる。

#### 案 2C: 定期実行で npm を見に行く

承認から記録まで最大 1 周期遅れる。トレインは月 1 回なので、ほとんどの run が空振りになる。承認のスクリプトが案 2B の workflow を起動すれば足りる（論点 3）。採らない。

### 論点 3: `karasu-skills` → `karasu` の承認順をどう守るか

#### 案 3A: `docs/release.md` に順序を書くだけ

承認を npmjs.com の画面で行うと、順序はメンテナの注意に頼ることになる。

#### 案 3B: 承認のスクリプトが順序を固定し、記録の workflow が順序の違反を検出する

`scripts/release/approve.mts`（`pnpm release:approve`）を kompiro が手元で実行する。

1. `npm stage list <name> --json` で、`main` の `package.json` の版に一致する stage 済みの版をパッケージごとに探す。
2. 見つかったもの（パッケージ、版、tag、stage id）を表示して確認を取る。
3. `karasu-skills` → `@karasu-tools/core` → `karasu` の順に `npm stage approve <id>` を実行する。2FA はそのたびに npm が求める。最初の失敗で止まる。
4. 最後に `gh workflow run release-confirm.yml` で記録の workflow を起動する。

順序は TPL-3240 の観点に従い、「完全一致で依存する側を、依存先がインストールできるようになってから承認する」で決める。表に書いた順を守るのではなく、各パッケージの `dependencies` から導く。`release-confirm.yml` は、`karasu` が npm にあるのに、その tarball が完全一致で指す `karasu-skills` の版が無いときに失敗し、トレインの Issue にコメントする。画面で承認して順序を誤った場合も、ここで見つかる。

案 3B を採る。案 3A の文書は、案 3B の手順を書く形で残す。

### 論点 4: トレインの Issue をいつ閉じるか

閉じる条件を「リリースコミットの各リリース対象パッケージ（`RELEASED_PACKAGES`）について、その版のタグがある」の 1 つにまとめる。npm の 3 パッケージのタグは `release-confirm.yml` が、VS Code 拡張のタグは `vscode-release.yml` の `record` が打つ。版を上げなかったパッケージは、前のリリースのタグが別のコミットにあれば満たしたとみなす。

- `release.yml` の `close-train` は、版を上げたパッケージが stage しただけの状態なら閉じない。stage した版の一覧と `pnpm release:approve` の案内をコメントする。
- `release-confirm.yml` が最後に同じ判定を行い、満たせば Release のリンクを付けて閉じる。
- 判定は `scripts/release/train.mts` に置き、両方の workflow から呼ぶ。

トレインの Issue のチェックリスト（`train.mts` が生成する）に「Approve the staged npm versions (`pnpm release:approve`)」を足す。

### 論点 5: VS Code 拡張は npm の承認を待つか

待たない。拡張はいまも npm の結果に関係なく公開していて、Release への追記は後から節を足す形で動いている。承認待ちのあいだは、拡張の節だけを持つ Release が先にできる。`release-confirm.yml` がタグから作り直すときに npm の節が加わる（ADR-2939 決定 3）。

### 論点 6: どの順で切り替えるか

3 パッケージを同時に stage 専用にする。1 つでも「Allow `npm publish`」が残れば、そのパッケージは直接 publish できる。手順は「現時点の方針」の「切り替えの段階」に書く。

## 比較

| 論点                 | 採る案                                              | 主な理由                                                                                 |
| -------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1 公開の置き換え     | 1A `pnpm pack` + `npm stage publish <tarball>`      | `workspace:*` と `prepack` を pnpm に任せられる。ほかの案は成り立たない                  |
| 2 タグと Release     | 2B 承認後に `release-confirm.yml`                   | 「公開に成功した版にだけタグ」（ADR-2939）を保つ。記録の workflow が公開の権限を持たない |
| 3 承認順             | 3B スクリプトで固定し、記録の workflow で検出       | 順序を注意に頼らない。画面で承認した場合も見つかる                                       |
| 4 Issue を閉じる時点 | タグの有無で判定                                    | 2 つの workflow が同じ条件で判定できる                                                   |
| 5 VS Code            | 待たない                                            | 既存の構成のまま動く                                                                     |
| 6 切り替え           | 3 パッケージ同時、本番のトレインで 1 回成功してから | 失敗しても直接 publish に戻せる                                                          |

## Related TPLs

- [TPL-1681](../test-perspectives/TPL-1681-publishable-tarball-completeness.md): tarball の作り方が `pnpm publish` から `pnpm pack` に変わる。中身は「ソースに何があるか」ではなく tarball で確かめる。リハーサルで各パッケージの tarball の Tarball Contents を、前回の公開と比べる。
- [TPL-2804](../test-perspectives/TPL-2804-guard-scan-set-fails-loud-on-the-unknown.md): 再実行で受ける拒否のうち、知っている形（stage 済み）だけを飛ばし、知らない失敗は止める。
- [TPL-2446](../test-perspectives/TPL-2446-gate-side-check-runs-over-the-whole-set.md): stage、承認、記録、Issue を閉じる判定は、どれもパッケージ名を手で並べず `RELEASED_PACKAGES` と各 `package.json` から導く。
- [TPL-3240](../test-perspectives/TPL-3240-exact-pinned-dependency-installable-after-its-target.md)（proactive、本 PR で起こす）: 完全一致で依存するパッケージは、依存先がインストールできるようになってからインストールできるようにする。

## 現時点の方針

**論点 1〜6 とも上の「比較」の案を採る。** 公開の経路を stage に変える実装と、直接 publish の許可を外す操作を分け、あいだに本番のトレインを 1 回挟む。stage の経路が本番で失敗しても、実装の PR を revert すれば、いまの直接 publish でトレインを出し直せる。

### 切り替えの段階

実装の PR は 1 本で、#3240 はその PR で閉じる。B と C はマージ後にしか進められないので、実装の PR を作る前に追跡用の Issue を 1 つ起こし、PR の本文から番号を示す（ADR-3271）。

| 段階                                                                                                                    | 前提 | 途中で止めても困らない理由                                           |
| ----------------------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------- |
| **0** Trusted Publisher の設定確認（kompiro が npmjs.com で行う）                                                       | なし | 設定の追加だけで、いまの公開に影響しない                             |
| **A** stage の経路の実装と、リハーサル（実装の PR）                                                                     | 0    | 「Allow `npm publish`」は残っているので、revert すれば元の経路に戻る |
| **B** 2026-11-29 のトレインを stage で出す（追跡用の Issue）                                                            | A    | 失敗したら A を revert して `release.yml` を再実行する               |
| **C** 3 パッケージの「Allow `npm publish`」を外し、`docs/release.md` の前提を書き換え、ADR に昇格する（追跡用の Issue） | B    | 公開の経路はすでに stage だけを使っている                            |

- **0**: `karasu` と `@karasu-tools/core` の Trusted Publisher で「Allow `npm stage publish`」が有効かを確かめ、無ければ有効にする。`karasu-skills` は有効。
- **A のリハーサル**: Trusted Publisher は environment を条件にしていないので、`spike/3240-stage-publish-rehearsal` で `release.yml` を `workflow_dispatch` すれば本番と同じ OIDC の経路を通る。3 パッケージの版を prerelease（`X.Y.Z-rehearsal.0`、`--tag rehearsal`）にして stage し、次を確かめたら reject する（reject は 2FA が要る）。
  - 3 パッケージとも OIDC で stage できる
  - 同じ版をもう一度 stage したときの拒否の形（HTTP status と `code`）。`stage.mts` はこの形だけを stage 済みとみなす
  - `npm stage download` で取り出した tarball の中身（TPL-1681）。`karasu` の `dependencies` が完全一致の版になっていること
  - `npm stage view` に provenance が付いているか
  - `approve.mts` が stage id を見つけ、順序どおりに並べること（承認はしない）
- **B のあと**に確かめること: 承認した版に provenance（`npm view <name>@<version> dist.attestations`）があること、Release に 3 パッケージと拡張の節が揃っていること、トレインの Issue が `release-confirm.yml` で閉じたこと。マージ後にしか確かめられないので、A の PR を作る前に別の Issue に起こす（ADR-3271）。

### 実装の指針

1. `scripts/release/stage.mts`: 公開するパッケージを `dependencies` から導いた順（依存先が先）に並べ、npm に無い版を `pnpm pack` → `npm stage publish <tarball>` する。stage 済みの拒否だけを飛ばす。stage した `name@version` の一覧を出力する。
2. `release.yml`:
   - `pnpm run release` の中身を `pnpm build && node scripts/release/stage.mts` に変える。
   - 「Set a git identity」「Collect the tags」と `record` ジョブを削除する。
   - `close-train` を論点 4 の判定に変える。
   - ヘッダーのコメントを stage に合わせて書き直す。
3. `.github/workflows/release-confirm.yml`: `workflow_dispatch`。権限は `contents: write`、`issues: write`、`pull-requests: read`。`id-token` は持たない。リリースコミットを求め、npm に載った版のタグを打ち、Release を作り、順序の違反を検出し、論点 4 の判定で Issue を閉じる。concurrency は既存の `release-record` グループに入れる。
4. `scripts/release/approve.mts` と、ルートの `package.json` の `release:approve`。
5. `scripts/release/train.mts`: チェックリストに承認の行を足す。Issue を閉じる判定を足す。
6. テスト: 既存の `scripts/release/*.test.ts` に倣う。stage する版の選び方と並べ方、拒否の分類、リリースコミットの求め方、順序の違反の検出、閉じる判定。`release-workflow.test.ts` で、`release.yml` の公開ジョブが `contents: read`、`release-confirm.yml` が `id-token` を持たないことを確かめる。
7. `published-packages.mts` は「Collect the tags」が無くなると使われない。削除し、knip で残りが無いことを確かめる。
8. `docs/release.md` の「リリースの流れ」に、承認と `release-confirm.yml` の段を足す。前提の節（「Allow `npm publish`」にチェックを入れる）は段階 C で書き換える。
9. AT は作らない。確かめられるのは本番のトレインだけなので、A のリハーサルの結果は PR の本文に、B のあとの確認は別の Issue に置く（ADR-3169）。
10. ADR 昇格: 段階 C の PR で `docs/adr/3240-staged-npm-publishing.md` に昇格し、本 Design Doc を削除する。ADR-9020 の「`release.yml` が OIDC で直接公開する」を改訂する。

### 影響範囲・マイグレーション

- 利用者への影響: なし。公開される tarball の中身は変わらない。公開されるまでの時間が、承認を待つ分だけ延びる。
- メンテナの作業: トレインごとに `pnpm release:approve` を 1 回実行する（2FA を 3 回入力する）。
- ドキュメント: `docs/release.md`（段階 A と段階 C）。
- テスト: `scripts/release/` のテストを追加・更新する。`published-packages.test.ts` は削除する。

## 未解決の問い

- リハーサルを spike ブランチの `workflow_dispatch` で行ってよいか。本番と同じ OIDC の経路を通るが、kompiro が 3 回 reject する（2FA）必要がある。
- 承認を `pnpm release:approve` だけに限るか、npmjs.com の画面での承認も認めるか。画面で承認しても、順序を誤れば `release-confirm.yml` が検出するが、検出までのあいだ `npm i karasu` が壊れる。
