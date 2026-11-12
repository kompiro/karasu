# karasu — リリース・依存更新の運用

> 発火するタイミングでだけ読むファイル。**リリースを出すとき**（npm / VS Code 拡張）と
> **Dependabot PR を処理するとき**の手順を持つ。日常の開発フローは `docs/process.md`。
>
> `docs/process.md` と同じ規律で書く — 「今どうするか」だけを書き、経緯は ADR / Issue に置く
> （[ADR-2351](adr/2351-process-md-holds-instructions.md)）。

## Dependabot 運用ルール

### 通常の version update

- スケジュールは weekly / Monday、cooldown は全 semver レベル 7 日（`.github/dependabot.yml`）。
- 月曜のバッチ起票後にレビュー → マージする。バッチ単位で取り込み判断を ADR に残すことがある。

### GitHub Actions の依存（actions.lock）

workflow が使う action は、直接・推移的なものを含めて `.github/workflows/actions.lock` に commit SHA で固定する（[#3412](https://github.com/kompiro/karasu/issues/3412)）。workflow 側の `uses:` は `owner/repo@vX.Y.Z` の完全なタグで書き、SHA は lockfile が持つ。

- workflow を追加・削除・改名したとき、または `uses:` を手で変えたときは、リポジトリのルートで `gh actions-lock` を実行して lockfile を commit する。`uses:` を持たない workflow も lockfile に載る必要がある。拡張は CI と同じ版を入れる（`gh extension install github/gh-actions-lock --pin v0.4.0`）。既に入っている版を替えるときは、`gh extension remove gh-actions-lock` を先に実行する（入っている拡張に `install` を重ねると失敗する）。版は `gh extension list` で確かめる。
- Dependabot の `github-actions` PR は、lockfile の差分が同じ PR に含まれているかを確かめる。含まれていなければ、その PR のブランチで `gh actions-lock` を実行して commit する。
- lockfile は手で編集しない。ずれていると `verify-lockfile.yml`（`gh actions-lock --verify`）が落ち、runner も job 開始時に `Invalid lockfile` で止まる。`verify-lockfile.yml` は PR ごとと週次で走る。lockfile に載っていない workflow はタグをそのまま解決するので、PR で落ちたまま main に入れない。
- 更新先のタグは、リリースノートと公開からの日数（cooldown と同じ 7 日）を確認してから採る。

### Security update（GHSA 起因の即時 PR）

Dependabot security update は alert 検知時に即時起票され、`schedule` も `cooldown` も `updates:` の設定も参照しない。月曜以外に Dependabot PR が出ていたら、まず security update かどうかを確認する。

**pnpm workspace で同一 advisory に対して PR が複数起票された場合の処理:**

1. `pnpm-lock.yaml` を含む root スコープの PR を merge する。
2. `packages/<name>/package.json` のみを書き換える PR は close する。

`packages/*` 単独 PR は workspace ルートの lockfile を更新できず `pnpm install --frozen-lockfile` で必ず落ちる。`@dependabot recreate` でも `dependabot.yml` でも回避できない。同様の事象が再発した場合は ADR を増やさず、本ルールに従って処理する。

### エージェントによる下ごしらえ

いまは無い。Dependabot PR と security alert のトリアージは、手元で `/hane:dependabot` と `/hane:security-alert` を使って行う。

以前は 2 本の agentic workflow（gh-aw の `dependabot-triage` と `security-alert-sweep`）が下ごしらえをしていたが、どちらも Copilot で推論し、その利用料が雇用先の組織が用意した Copilot seat に付くため外した（[ADR-3421](adr/3421-remove-copilot-gh-aw-workflows.md)）。Copilot で推論する workflow は `scripts/ci/copilot-inference-policy.test.ts` が落とす。個人の課金で動かせるようになったら戻す（[#3421](https://github.com/kompiro/karasu/issues/3421)）。

## リリース運用

npm への公開は **changesets** で管理し、認証は **npm Trusted Publishing（GitHub OIDC）** で行う（token レス）。

### 対象パッケージ

npm 公開対象は `karasu`（CLI、`packages/cli`）と `@karasu-tools/core`（ライブラリ）と `karasu-skills`（agent 向け skill を収めた Claude Code plugin、`packages/skills`）。CLI は esbuild で `@karasu-tools/core` を内包した単一 ESM バンドルとしてビルドする（`packages/cli` の `build` スクリプト。公開 core への依存には切り替えない）。`@karasu-tools/app` / `@karasu-tools/lsp` / `@karasu-tools/e2e` / `@karasu-tools/vscode-e2e` は `.changeset/config.json` の `ignore` に入っており版管理・公開とも対象外。

`karasu-vscode`（VS Code 拡張）も changesets の**版管理対象**（`ignore` から除外）。ただし `private: true` のため `changeset pack` の計画に入らず npm へは stage されない。配布は Marketplace 経由で手動（後述「VS Code 拡張のリリース」）。changesets は version bump と `packages/vscode/CHANGELOG.md` 生成のみを担う。 `@changesets/cli` 3 は private パッケージを既定で版管理しない（`privatePackages` の既定が `{ version: false }`）ため、`.changeset/config.json` に `privatePackages: { "version": true, "tag": false }` を明示してこの扱いを保っている（[ADR-2877](adr/2877-dependabot-triage-2026-09-22.md)）。

> **`@karasu-tools/core` は v0.x（TS API、無保証）**。`.krs` / `.krs.style` 言語は v1.0 だが、TS API は minor で破壊的変更を許す（[ADR-1314](adr/1314-krs-spec-v1-freeze.md)）。`exports` は公開先に `dist` を指し、`development` 条件で repo 内は TS ソースを解決するため `pnpm typecheck` は build 非依存。

> **`karasu`（CLI）の version floor は 0.6.0**。npm の `karasu` 名は旧 incarnation が `〜0.5.2` まで公開済みで、それ以下は `E400 Cannot publish over previously published version` になる。`@karasu-tools/core` は履歴がクリーンなため独立して 0.x（independent versioning）。

`karasu-skills` は `prepack` で、その時点の CLI の版（`packages/cli/package.json`）を各 SKILL.md の `metadata.karasu-version` と本文 Step 0 に刻み、`postpack` で元に戻す（刻むのは「この版以降の CLI 向け」という下限）。利用者はルートの `.claude-plugin/marketplace.json` を marketplace として追加し、npm の `karasu-skills` を plugin として入れる（`/plugin marketplace add kompiro/karasu` → `/plugin install karasu@karasu`）。設計は [ADR-2901](adr/2901-karasu-authoring-skill.md)（#2932）。

> **`karasu` は `karasu-skills` に依存する**（#2912）。`karasu skill install` が同梱の skill をコピーするため、CLI は `karasu-skills` を esbuild で内包せず実行時に解決する（ADR-1363 の「CLI は依存を内包する」の例外。中身は skill の文書だけ）。公開される `karasu` はその時点の `karasu-skills` の版を完全一致で指すので、`karasu-skills` が npm に無いと `npm i karasu` が解決できない。公開の計画は依存の順に並ぶので、`karasu` は `karasu-skills` が承認されて npm に載ってから stage される（下の「リリースの流れ」の手順 4）。

> **`karasu-skills` の初回 publish は手動**。npm の Trusted Publisher はパッケージが存在してからでないと登録できない（下の「前提」）。最初のリリース PR で版が確定したら、ローカルの `packages/skills` で `pnpm publish --access public`（OTP を求められる）を実行して一度だけ公開する。npmjs.com での Trusted Publisher（org `kompiro` / repo `karasu` / workflow `release.yml` / environment `npm`）の登録は、次に版を上げるリリース PR をマージする直前に行う（登録から 2 日以内に公開まで終えないと設定が失効する。下の「前提」）。以降は `release.yml` が OIDC で stage し、承認で公開される。`packages/skills/package.json` は `publishConfig.provenance` を持たない: provenance は Trusted Publishing で自動的に付き（`release.yml` の header）、ローカルからの初回 publish は provenance を作れないため。

> **`karasu-skills` をリリースしたら、インストール済みの plugin への届き方を確かめる**（#2932 の AT から移した項目）。新しい版を公開した後、前の版を入れた Claude Code で更新が自動で届くか、`/plugin` から手動で更新するかを確かめ、結果を `packages/skills/README.md` の「Install in Claude Code」に書く。書き終えたらこの注記を消す。

### 変更を加えるとき

公開・配布対象パッケージ（`karasu` / `@karasu-tools/core` / `karasu-vscode` / `karasu-skills`）に利用者から見える変更を入れる PR では、`pnpm changeset` を実行して `.changeset/<name>.md` を追加し、PR に含める。

- bump レベルは semver に従う（破壊的変更 = major、機能追加 = minor、修正 = patch）。各パッケージとも 0.x なので、当面は破壊的変更も minor で扱ってよい。
- **どのパッケージを名指すか**:
  - `packages/core` の利用者向け変更 → **`@karasu-tools/core` と `karasu` の両方**を名指す。core の bump は `karasu-vscode` へは自動 cascade するが、`karasu`（core を devDependency でバンドル）へはしないため。
  - `packages/cli` 固有の変更 → `karasu`
  - `packages/vscode` 固有の変更 → `karasu-vscode`
  - `packages/skills` の skill 本文・reference の変更 → `karasu-skills`（CLI が `karasu-skills` を dependency に持つため、`karasu` も patch で自動 cascade する）
  - skill が前提にする CLI の挙動（コマンド・フラグ・出力・診断）の変更 → `karasu` **と** `karasu-skills`（skill 本文も同じ PR で直す。名指さないと CLI だけが公開され、利用者の手元の skill は古い手順のまま残る）
- 内部リファクタ・テスト・ドキュメントのみ・公開対象外パッケージのみの変更では changeset 不要。
- `CHANGELOG.md` の文面は利用者向けに書く（コミット subject の流用ではなく）。
- **experimental notation に触れる変更は promotion gate を通す**: `docs/roadmap.md` の [§promotion gate](roadmap.md#promotion-gatenotation-評価の規律) に載る watch item（experimental notation）を stable 層へ昇格させる／挙動を変える changeset では、[ADR-1820](adr/1820-notation-promotion-gate.md) の gate を通す。昇格なら **載せる言語版（後方互換な追加 = 言語 v1.x / 既存構文の変更・再設計 = 言語 v2.0）を決め、changeset と `CHANGELOG.md` に言語版遷移を明記**する（パッケージの bump レベルは semver 規約で独立に決める — [ADR-2124](adr/2124-version-vocabulary.md)。語彙の正典は [roadmap §version vocabulary](roadmap.md#version-vocabulary版語彙の定義--正典)）。判断根拠（実利用証拠 = karasu-nest の共有 corpus）を PR に書く。据え置きが既定なので、証拠が無ければ experimental のままにする。

`pnpm changeset status` で「未リリースの変更があるか」を確認できる。

### リリースの流れ

リリースは **GitHub Actions 起動**で行う。ローカルで `changeset version` は実行しない。Actions に PR 作成権限を与えなくて済むよう、bot による "Version Packages" PR は使わない。

リリースは **月次のリリーストレイン**で出す（[#2922](https://github.com/kompiro/karasu/issues/2922)）。毎月の最終日曜 00:00 UTC（09:00 JST）に Prepare が自動で走り、人がやるのは「Issue のリンクから PR を開く → CHANGELOG を読む → マージする」だけになる。臨時のリリースは Prepare を `workflow_dispatch` で起動すればいつでも出せる。

リリース手順は以下のとおり:

1. **"Release — Prepare"**（`release-prepare.yml`）が毎週日曜に起動し、月の最終日曜だけ発車する（手動の `workflow_dispatch` は曜日を問わず発車する）。`changeset version`（版 bump + `CHANGELOG.md` 生成 + lockfile 更新）を実行し、`chore/release-YYYY-MM-DD` ブランチを push して、トラッキング Issue（ラベル `release`）を立てる。Issue には PR を開くリンク、版が上がるパッケージの一覧、チェックリストが載る。pending changeset が無ければブランチも Issue も作らない（`@changesets/cli` 3 の `changeset version` は pending なしで exit 1 になるので、workflow は `.changeset/*.md` の有無を先に見て分岐する）。
   - ブランチ名が版ではなく日付なのは、版がパッケージごとに独立していて CLI の版が上がらないリリースもあるため。
   - **前のトレインの Issue か、`chore/release-*` の PR が開いたままなら発車しない**（それにコメントして失敗する）。同じ未マージの changeset で 2 本目のリリース PR を作らないため。前のトレインをマージするか close してから、Prepare を `workflow_dispatch` で起動し直す。
2. Issue のリンクから **PR を開く**（Actions は PR を作れないので人が開く。人が開くことで必須チェックも走る）。
3. **マージ前に版番号と `CHANGELOG.md` を必ず読む**（main ruleset の必須承認数は 0 = self-merge 可。目視確認はこの運用ルールで担保する）。このとき、**experimental notation の stable 昇格や破壊的変更が CHANGELOG に含まれるなら、promotion gate（[ADR-1820](adr/1820-notation-promotion-gate.md)）が通っているか・言語版に触れる変更が changeset / CHANGELOG に言語版遷移として明記されているか（[ADR-2124](adr/2124-version-vocabulary.md)、表記は `.krs language vX.Y`）を確認**する。問題なければ **squash マージ**する。
4. マージで `main` の `packages/**/CHANGELOG.md` が変わり、`release.yml`（`paths` filter）が発火する。stage は 2 つのジョブで行う（[#3240](https://github.com/kompiro/karasu/issues/3240)）。stage した版は、承認するまでインストールできない。何を stage したかは `stage` ジョブの summary に表で出る。
   - `pack` ジョブは依存を入れてビルドし、`node scripts/release/stage.mts pack` が `changeset pack` で公開の計画と tarball を作って、計画の**先頭のグループ**の tarball を artifact にする。OIDC のトークンを持たない。
   - `stage` ジョブは OIDC のトークンを持ち、依存を入れず cache も使わない。`node scripts/release/stage.mts publish` が artifact から tarball のファイルだけを受け取り、何を、どの順に、どの tag で stage するかをリリースコミットと npm から決め直して、`npm stage publish <tarball>` で stage する。tarball の `package.json` の名前・版・`publishConfig` がリリースコミットと合わなければ何も stage しない。乗っ取られた依存が変えられるのは tarball の中身だけになり、それは下の承認の照合で見つかる。npm は版のメタデータを tarball の中身から作るので、インストールに効く項目も tarball で決まる。
   - 計画は依存の順に並ぶ。`karasu` は `karasu-skills` を完全一致の版で指すので、`karasu-skills` が承認されて npm に載るまで `karasu` は stage されない（[TPL-3240](test-perspectives/TPL-3240-exact-pinned-dependency-installable-after-its-target.md)）。
   - `stage.mts` はリリースのコミット（`chore/release-*` をマージしたコミット）でしか stage しない。計画に、このコミットで版を上げていないパッケージがあれば何も stage せずに止まる（下の「reject したとき」）。
   - tag は版から決まる。prerelease でなければ `latest`、prerelease は `.changeset/pre.json` の tag で、`pre.json` が無ければ止まる。
   - `workflow_dispatch` での手動再実行も可。
5. 認証は **GitHub OIDC（Trusted Publishing）**。`release.yml` の `stage` ジョブの `id-token: write` を npm が短命クレデンシャルに交換する。npm の Trusted Publisher は GitHub の environment `npm` を条件にしていて、その environment を名乗るのは `stage` ジョブだけなので、ほかのジョブ（依存を入れる `pack` や `vscode`）のトークンでは stage できない。`NPM_TOKEN` は不要（保持しない）。provenance は trusted publishing で**自動付与**される（`--provenance` 不要）。stage の要件は npm >= 11.15.0 / Node >= 22.14.0 で、`release.yml` が pin する Node 24 が同梱する npm が満たすため、npm を別途アップグレードするステップは持たない（[ADR-2397](adr/2397-node-24-baseline.md)）。
6. **kompiro が手元で `pnpm release:approve` を実行して承認する。** スクリプトはリリースコミットを一時的な worktree に取り出してビルドし、`changeset pack` の計画の順に、stage された tarball のファイルを手元の pack と比べる。一致すれば確認を求め、グループごとに `npm stage approve` する（npm が 2FA を求める）。次のグループがあれば `release.yml` の run を再実行して stage させ、終わるのを待って同じことを繰り返す。最後に `release-confirm.yml` を起動する。
   - 照合の相手を手元で作るのは、乗っ取られた CI の run が正規の run より先に偽の tarball を stage しても、比べる相手までは偽れないようにするため。
   - 承認の前に比べられるのはファイルだけである。npm は版のメタデータ（依存や `scripts` など、インストールに効く項目）を tarball とは別に受け取り、stage のキューはそれを見せない（`npm stage view` に manifest は無い）。`stage` ジョブは依存のコードを動かさずに tarball から stage するので、メタデータは tarball の中身で決まり、ファイルの照合がそのまま効く。それが崩れたときに気づくため、スクリプトは承認した版が npm に載るのを待ってすぐにインストールに効く項目を手元の pack と比べ、違えば `release-confirm.yml` を起動して Issue に報告させ、次のグループに進まずに止まる。止まったら「公開後の照合に落ちたとき」に従う。
   - この照合が防ぐのは、乗っ取られた CI の run と、main 以外のブランチからの run である。リリースコミットの依存そのものに毒が入っていれば、手元の `pnpm install` と `pnpm build` も同じ依存を実行するので、手元の pack や比べるスクリプトも書き換えられうる。`release-confirm.yml` の `verify` と同じ限界で、依存の更新は Dependabot のトリアージ（上）で防ぐ。
   - 計画に無い版（たとえばより高い版）が stage のキューにあれば表示する。承認せずに `npm stage reject <id>` で消す。
   - `karasu-skills` を承認したら、間を空けずに `karasu` まで進める。skill は刻まれた CLI の版より古い CLI では Step 0 で止まるので（[ADR-2901](adr/2901-karasu-authoring-skill.md)）、そのあいだに skill を更新した利用者が止まる。
   - npmjs.com の画面で承認してもよい。その前に `pnpm release:approve --dry-run` を実行すれば、承認せずに照合だけを行える。画面で承認したときは、次のグループの stage も `release.yml` の run の再実行も自分で行う。
7. **`release-confirm.yml`** が、リリースコミットで版を上げた npm パッケージのうち npm に載ってタグがまだ無い版を、承認の経路を問わず照合する。`verify` ジョブ（読み取りのみ）がリリースコミットをビルドして pack し、`npm pack <name>@<version>` で取り出した公開済みの tarball とファイルを比べる。npm はレジストリのメタデータから依存を解決するので、メタデータのうちインストールに効く項目（依存、`bin`、`scripts`、`os` / `cpu` など）も pack の `package.json` と比べる。`record` ジョブ（依存を入れない）が、一致した版にだけタグ（`karasu@X.Y.Z` / `@karasu-tools/core@X.Y.Z` / `karasu-skills@X.Y.Z`。対象は `scripts/release/github-release.mts` の `RELEASED_PACKAGES`）を打ってリリースコミットに push し、GitHub Release **`release-YYYY-MM-DD`**（リリースコミットの UTC 日付。同じ日の 2 回目以降は `-2`, `-3`）を作る。本文は各パッケージの `CHANGELOG.md` の該当版の節。
   - `pnpm release:approve` が最後に起動するほか、毎日 1 回の `schedule` でも走る（画面での承認を拾う）。開いているトレインが無いか、リリース PR がまだマージされていなければ何もしない。
   - 照合に落ちた版と、計画に無いのに公開された版（`latest` 以外の dist-tag のものも含む）があれば、Issue にコメントしてタグを打たない（下の「公開後の照合に落ちたとき」）。
   - 一部のパッケージだけが npm に載っていれば、次のグループの stage を促すコメントを付ける。`karasu` が npm にあるのに、それが指す `karasu-skills` の版が無ければ失敗してコメントする。
8. 同じ `release.yml` の run で VS Code 拡張も公開される（下の「VS Code 拡張のリリース」）。npm の承認を待たない。
9. **トラッキング Issue を閉じるのは**、リリースコミットで版を上げた npm パッケージのタグがすべてリリースコミットを指し、`release.yml` の VS Code のジョブが成功（公開を飛ばした成功を含む）したとき。`release-confirm.yml` が Release のリンクを付けて閉じる。npm の版を上げなかったトレインは `release.yml` の `close-train` が閉じる。
   - `close-train` は、承認待ちの版があれば一覧と `pnpm release:approve` の案内をコメントし、Issue を開いたままにする（承認待ちは失敗ではない）。
   - run が失敗すれば、失敗した run のリンクをコメントして Issue を開いたままにする（次のトレインはそれが閉じるまで発車しない）。直したら **Re-run failed jobs** で再実行する。

#### reject したとき

reject した版のタグは現れないので、トレインの Issue は閉じない。理由で次の手が分かれる。

- **stage された tarball が正しくなかった**（照合に落ちた）: reject して版を空け、正しい tarball を stage し直す。`stage` ジョブは成功で終わっているので、`release.yml` のその run を **Re-run all jobs** で再実行する。照合に落ちたということは CI か依存が乗っ取られている疑いがあるので、再実行の前に原因を調べ、再実行のあとも照合をやり直す。原因を取り除けないあいだは、下の「CI の経路が使えないとき」に従って手元から stage する。
- **リリースそのものを出さないと決めた**（stage した版に不具合があった）: 残りの stage 済みの版も reject する。リリースコミットで版を上げた npm パッケージ（`RELEASED_PACKAGES`。VS Code 拡張は含めない）のうち、版が npm に載っていないものごとに patch の changeset を足す PR をマージしてから、トレインの Issue に理由を書いて手で閉じる。判定は「その版が npm に載っていない」の 1 つで、reject した版も、後のグループでまだ stage されていない版（たとえば `karasu-skills` を承認して止めたときの `karasu`）も当たる。`pnpm release:approve --dry-run` を実行すれば、計画に残る版（後のグループは `Later:` の行）が分かる。次のリリースでそのパッケージの版が上がり、使わなかった版番号は飛ぶ。
  - 承認済みの版があれば npm に残る（unpublish はしない）。Issue を閉じる前に `release-confirm.yml` を手で起動し、タグと Release を作る。
  - `karasu-skills` を承認したあとで `karasu` を reject したか、stage する前に取りやめたら、skill は刻まれた版の CLI が出るまで止まる。changeset の PR をマージしてトレインの Issue を閉じたら、月次のトレインを待たずに `release-prepare.yml` を手動で実行して、次の `karasu` を出す。直しに時間がかかるなら、取りやめた変更を戻した状態で出してよいが、承認した skill が使う CLI の変更（新しいコマンドやフラグ）は戻さない。
  - changeset を足し忘れると、次のリリースで `stage.mts` が「版を上げていないパッケージ」で止まる。そのリリースでは何も stage されていないので、計画に載っているパッケージごとに patch の changeset を足す PR をマージし、そのトレインの Issue を手で閉じて、`release-prepare.yml` を手動で実行する。

#### 公開後の照合に落ちたとき

照合に落ちた版はすでにインストールできる。`pnpm release:approve` が承認の直後にインストールに効く項目の違いで止まったときも、ここに従う。`release-confirm.yml` はタグも Release も作らず、落ちた版とファイルの一覧をトレインの Issue にコメントする。tarball は npm が展開に使う node-tar と、別に書いた厳格な読み取りの両方で読み、両方が同じファイルを読んだときだけ比べる。どちらかが読めない tarball も、照合に落ちたものとして扱う。差分を調べて次の手を決める。

- **環境で変わるファイルだった**（誤検出）: 照合の規則（`scripts/release/tarball.mts`）を直す PR をマージし、`release-confirm.yml` を起動し直す。`pnpm release:approve` が承認の途中で止まっていて計画に次のグループが残るなら、先にリリースコミットの `release.yml` の run を再実行して stage させてから、`pnpm release:approve` を実行し直す（止まったときは次のグループがまだ stage されていない）。分かっている差は `THIRD_PARTY_NOTICES.md` のプラットフォーム固有のパッケージの節で、照合はこれを除いて比べる。
- **tarball が正しくなかった**: 侵害として扱う。3 パッケージの Trusted Publisher の接続を削除して CI からの stage を止める。取り下げる版には、その版を完全一致で指す公開済みの版も含める（`karasu-skills` が落ちたなら、それを指す `karasu`。画面で承認すると、照合の前に両方が公開されうる）。取り下げる前に、版ごとに `npm dist-tag ls <name>` でその版を指すタグを探し、`npm dist-tag add <name>@<照合を通った前の版> <tag>` で戻すか、戻す版が無ければ `npm dist-tag rm <name> <tag>` で外す（2FA。Trusted Publisher の dist-tag の許可は要らない）。unpublish はその版を指すタグを一緒に消し、`latest` を別の版に付け替えることもあるので、後からでは元のタグが分からない。そのあとで版を取り下げる（npm の unpublish の条件を満たせば unpublish、満たさなければ deprecate）。deprecate は警告を出すだけで、版はインストールできるまま残るので、npm のサポートに削除を依頼する。完全一致で指している利用者は、削除されるまでその版を入れられる。取り下げた版番号は飛ばす。取り下げた版のパッケージ（unpublish でも deprecate でも、正しい版で置き換えるため。unpublish した版番号は npm が二度と受け付けない）と、計画に残っていた版（後のグループでまだ stage されていない版）のパッケージごとに patch の changeset を足す PR をマージしてから、Issue に経緯を書いて手で閉じる。原因を取り除いてから、その changeset で次の版を出す。

#### CI の経路が使えないとき

`stage.mts` は stage の認証を npm に任せていて、OIDC でなくても動く。CI の stage が失敗したら、リリースコミットを手元に取り出し、`pnpm install --frozen-lockfile && pnpm build` のあと `npm login` して、次の 2 つを続けて実行する。stage したあとは承認から記録までいつもの流れに乗る。

```
node scripts/release/stage.mts pack --out-dir <dir>
node scripts/release/stage.mts publish --tarballs <dir>
```

- 手元ではビルドと stage が同じ場所で動くので、`stage` ジョブを分けた効果は無い。承認の直後のインストールに効く項目の照合（上の手順 6）が、メタデータの食い違いを受ける。
- 計画に次のグループがあると、`pnpm release:approve` は承認のあとで `release.yml` の run を再実行して stage させる。CI の経路が使えないあいだはこの再実行が失敗し、スクリプトはそこで止まる。止まったら、同じ手元のリリースコミットで上の 2 つをもう一度実行して次のグループを stage し、`pnpm release:approve` を実行し直す。承認済みのグループは npm に載って計画から外れているので、スクリプトは次のグループから照合する。グループが残るあいだ、これを繰り返す。
- 手元から stage した版には provenance が付かない（`stage.mts` は GitHub Actions の外では `--provenance=false` を付ける）。
- Trusted Publisher の接続が無いパッケージの版を、接続を作る前に出すときもこの手順を使える。
- 実装の PR を revert して `release.yml` を再実行する方法では戻せない。再実行は元の run と同じリリースコミットで走る。

> 前提: 公開対象パッケージごとに npmjs.com で **Trusted Publisher**（org `kompiro` / repo `karasu` / workflow `release.yml` / environment `npm`）を登録しておくこと。新規パッケージは登録前に一度存在している必要があるため、**初回だけローカルから手動 publish**（`pnpm publish`、provenance off + OTP）してから登録する。
>
> - **Allowed actions は stage だけを許可する**。「Allow `npm publish`」と「Allow `npm dist-tag`」は外す。前者が残ると CI から承認なしに公開でき、後者を許可すると乗っ取られた run が `latest` を動かせる。2026-09-03 以降に登録した設定は stage だけを許可する状態で始まる。
> - **environment `npm` を条件にする**。GitHub の repo の environment `npm` は deployment branch を `main` だけにする。`stage` ジョブだけがこの environment を名乗るので、依存を入れるジョブのトークンや、別のブランチで書き換えた `release.yml` の run のトークンを npm は受け入れない。
> - package access は「Require two-factor authentication and disallow tokens」にする。
> - **新しく登録するのは、そのパッケージの版を上げるリリース PR をマージする直前**。登録直後の設定は「not yet validated」で、登録から 2 日以内にその設定で公開が 1 回成功しないと失効する（[npm docs](https://docs.npmjs.com/trusted-publishers/)）。登録したら 2 日以内に承認まで終える。失効した設定では stage が `E404` になり、npmjs.com には「This trusted publisher configuration has expired」と出る。失効したら削除し、同じく次のリリース PR をマージする直前に登録し直す（2026-10-15 のトレインで `karasu-skills` が当たった。[#3238](https://github.com/kompiro/karasu/issues/3238)）。

### VS Code 拡張のリリース

`karasu-vscode` の**版 bump と `CHANGELOG.md` は上記 changesets フローで自動**化される（`changeset version` が `packages/vscode/package.json` の version を更新）。`private: true` なので `release.yml` は npm へ stage しない。Marketplace への stable の公開は、版が bump されたリリースの後に `release.yml` から自動で行う:

1. リリース PR のマージで走る `release.yml` が、npm の stage のあとに **"VS Code Extension Release"**（`vscode-release.yml`）を `workflow_call` で呼ぶ。手動で出すときは Actions タブから `workflow_dispatch` で起動する（`pre_release` input を付けると下の pre-release になる）。
2. `package.json` の version が **Marketplace に stable として既にあれば公開しない**（`vsce show` で確認）。拡張の版が上がらなかった月のトレインでは何も起きない。同じ版が pre-release にしか無ければ stable として出せないので失敗する。`vsce show` 自体が失敗したときも失敗する。
3. 認証は **Microsoft Entra ID via GitHub OIDC**（`AZURE_CLIENT_ID` / `AZURE_TENANT_ID` 変数。未設定時は build + package のみで publish はスキップ）。
4. ビルドは main の先頭ではなく、**拡張の現在の版を設定したコミット（リリース PR のマージコミット）** から行う。リリース後に main へ入った次回分の変更を拡張に混ぜないため。
5. Marketplace への公開が成功したら、`record` ジョブがそのコミットに `karasu-vscode@X.Y.Z` を打ち、同じコミットの GitHub Release に拡張の節を加える（Release が無ければ作る）。公開に失敗した版にはタグを打たない（[#2939](https://github.com/kompiro/karasu/issues/2939)）。

#### 週次の pre-release

stable とは別に、`main` の先頭を Marketplace の pre-release チャネルへ毎週出す（[#2940](https://github.com/kompiro/karasu/issues/2940)）。メンテナの作業は無い。

1. **起動**: `vscode-release.yml` が毎週水曜 00:00 UTC（09:00 JST）に走る。臨時に出すときは `workflow_dispatch` を `pre_release` 付きで起動する。`main` 以外の ref では失敗する。
2. **変更が無い週は出さない**: ビルドした `.vsix` の `extension/` 配下を、Marketplace で一番高い版（チャネルを問わない）の `.vsix` と比べる。`package.json` の `version` 以外が全部同じなら公開を飛ばす（notice が出る。ジョブは成功）。`.vsix` を取得・展開・比較できなかったときは失敗する。
3. **版**: `<main の stable の major>.<minor>.<YYYYMMDDNN>`（例: `0.5.0` の 2026-11-04 は `0.5.2026110401`）。`NN` はその日の通し番号で、Marketplace の版一覧から決める。版は runner の作業ツリーにだけ書き、`main` にはコミットしない。changeset も消費しない。
   - stable の patch（`0.5.1`）は pre-release（`0.5.2026...`）より低いので、pre-release の利用者には翌週の pre-release で届く。stable の minor が上がると（`0.6.0`）、pre-release の利用者も stable に移り、次の pre-release は `0.6.<日付>` から始まる。
   - Marketplace は既存の pre-release より低い版の stable を受け付ける（Python・Jupyter・rust-analyzer で観測）。この方式はその挙動を前提にする。
4. **タグ**: 公開に成功したら、ビルド元のコミットに `karasu-vscode-pre/<版>` を打つ。名前に `@` を含めないので、stable のタグ収集と `release-YYYY-MM-DD` の GitHub Release には入らない。pre-release の GitHub Release は作らない。タグの push だけが失敗したときは「Re-run failed jobs」でやり直す。「Re-run all jobs」は公開したばかりの版と比べて「変更なし」で止まり、タグを打たない。
5. **利用者の切り替え**: Extensions ビューで拡張のページを開き「Switch to Pre-Release Version」を選ぶ。

> 比較はビルドが決定的であることに依存する。`THIRD_PARTY_NOTICES.md` はインストールされたプラットフォーム別バイナリ（`@esbuild/linux-x64` など）を載せるので、runner のアーキテクチャを変えた最初の週は「変更あり」として公開される。手元（arm64）でビルドした `.vsix` も、この 1 ファイルだけ Marketplace のものと違う。

> **`packages/vscode/README.md` の画像は絶対 URL で書く**（`https://raw.githubusercontent.com/kompiro/karasu/main/packages/vscode/images/...`）。`vsce` は相対画像パスを repository-**root** の raw URL に書き換えるが `repository.directory` を考慮しないため、monorepo では Marketplace 上で 404 になる。

> 拡張は npm と同じトレインで出す（[#2922](https://github.com/kompiro/karasu/issues/2922)）。版はパッケージごとに独立なので、拡張の版が上がらないリリースもある。

### CLI の後方互換

`karasu` CLI のうち、skill やスクリプトが呼ぶ面（コマンド名、フラグ、終了コード、`karasu check --format json` などの機械向けの出力）は後方互換を保つ（[#2961](https://github.com/kompiro/karasu/issues/2961)、設計は [ADR-2901](adr/2901-karasu-authoring-skill.md) の「利用者の手元でのずれ」）。Claude Code はサードパーティ marketplace の plugin を自動更新しないので、新しい CLI と古い skill の組み合わせは利用者の手元で普通に起きる。その互換の責任を CLI が持つ。

- **名前を変える・廃止する**: 古い名前を消さず、`packages/cli/src/deprecations.ts` の `DEPRECATIONS` に 1 行足す（種別、古い名前、代わり、廃止した版、削除する版）。古い名前は `--help` に出ない別名として動き続け、呼ばれると stderr に 1 行出す: `karasu: deprecated: 'old' -> 'new' (since 0.8.0, removal 1.0.0)`。
- **別名を削除してよいのは major のリリースだけ**（0.x の間は 1.0.0 まで削除しない）。削除は CHANGELOG で予告する。削除した項目には `removed: true` を付け、**表から消さずに墓標として残す**。墓標の名前は「未知のコマンド」ではなく、同じ形式の `karasu: removed: ...` 行を出して終了コード 1 で失敗する。
- **人向けの行は約束に含めない**: 診断の行（`Warning[KRS041]: ...`）は人が読むためのもので、形はマイナーリリースで変えてよい。変えるときは CHANGELOG で知らせる。スクリプトと skill は `karasu check --format json` を読み、`code` で判定する（[#3654](https://github.com/kompiro/karasu/issues/3654)）。JSON はフィールドを足しても互換の範囲内で、消す・意味を変えるときは `schemaVersion` を上げる。形は [docs/spec/diagnostics.md](spec/diagnostics.md#how-the-cli-shows-a-diagnostic) に書いた。
- **問い合わせ**: `karasu capabilities --json` が CLI の版、登録済みのコマンドとフラグ、表の全項目を返す。形式は [docs/tools/cli.md](tools/cli.md#karasu-capabilities-what-this-cli-accepts) に書いた。

守られているかは CLI の vitest（`packages/cli/src/compat.test.ts`）が確かめる。

- `agent-surface.json` に記録したコマンドやフラグが、表に項目のないまま消えると失敗する。新しいコマンドやフラグを足したときも、`agent-surface.json` への追記を求めて失敗する（追記した名前が互換の約束に入る）。
- 表の各項目について、別名の代わりが今も登録された名前であること、削除する版が 1.0.0 以上の major であること、CLI の版が削除する版に達した項目に `removed: true` が付いていることを確かめる。
- repo 内の skill は常に最新の名前を使う。`pnpm lint:skill-cli-refs` は、`.claude/skills/**` が表にある名前を使っていたら失敗する。古い名前は、利用者の手元に残る古い skill のためだけにある。

### 未対応のフォローアップ

- **changeset-bot**（GitHub App）— PR に changeset の有無をコメントしてくれる。リポジトリを public 化したので有効化を検討する。
