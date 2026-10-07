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

### Security update（GHSA 起因の即時 PR）

Dependabot security update は alert 検知時に即時起票され、`schedule` も `cooldown` も `updates:` の設定も参照しない。月曜以外に Dependabot PR が出ていたら、まず security update かどうかを確認する。

**pnpm workspace で同一 advisory に対して PR が複数起票された場合の処理:**

1. `pnpm-lock.yaml` を含む root スコープの PR を merge する。
2. `packages/<name>/package.json` のみを書き換える PR は close する。

`packages/*` 単独 PR は workspace ルートの lockfile を更新できず `pnpm install --frozen-lockfile` で必ず落ちる。`@dependabot recreate` でも `dependabot.yml` でも回避できない。同様の事象が再発した場合は ADR を増やさず、本ルールに従って処理する。

### エージェントによる下ごしらえ

トリアージの下ごしらえは 2 本の agentic workflow（gh-aw）が回す。どちらも所見を書くだけで、マージ・close・push はしない。

| workflow | 起動 | 出力 |
| --- | --- | --- |
| `.github/workflows/dependabot-triage.md` | dispatch のみ（週次の cron は停止中、[ADR-2839](adr/2839-pause-dependabot-triage-schedule.md)） | 各 PR への upstream 追跡コメント（1 実行あたり 10 件まで）と、バッチのサマリ Issue |
| `.github/workflows/security-alert-sweep.md` | dispatch のみ（cron はコメントアウト） | `[security-alert]` のトラッキング Issue |

判定（採用 / 保留 / 却下）とマージは人が行う（[ADR-2658](adr/2658-gh-aw-dependency-automation.md)）。security alert sweep に cron が無いのは、gh-aw の MCP gateway が Dependabot alert を private 扱いにし、public リポジトリの safe output へ流さないためである。frontmatter を編集したら `gh aw compile` で `.lock.yml` を再生成する（本文だけの編集なら再生成は要らない。実行時に読み込まれる）。

## リリース運用

npm への公開は **changesets** で管理し、認証は **npm Trusted Publishing（GitHub OIDC）** で行う（token レス）。

### 対象パッケージ

npm 公開対象は `karasu`（CLI、`packages/cli`）と `@karasu-tools/core`（ライブラリ）と `karasu-skills`（agent 向け skill を収めた Claude Code plugin、`packages/skills`）。CLI は esbuild で `@karasu-tools/core` を内包した単一 ESM バンドルとしてビルドする（`packages/cli` の `build` スクリプト。公開 core への依存には切り替えない）。`@karasu-tools/app` / `@karasu-tools/lsp` / `@karasu-tools/e2e` / `@karasu-tools/vscode-e2e` は `.changeset/config.json` の `ignore` に入っており版管理・公開とも対象外。

`karasu-vscode`（VS Code 拡張）も changesets の**版管理対象**（`ignore` から除外）。ただし `private: true` のため `changeset publish` は npm へ publish せず（自動スキップ）、配布は Marketplace 経由で手動（後述「VS Code 拡張のリリース」）。changesets は version bump と `packages/vscode/CHANGELOG.md` 生成のみを担う。 `@changesets/cli` 3 は private パッケージを既定で版管理しない（`privatePackages` の既定が `{ version: false }`）ため、`.changeset/config.json` に `privatePackages: { "version": true, "tag": false }` を明示してこの扱いを保っている（[ADR-2877](adr/2877-dependabot-triage-2026-09-22.md)）。

> **`@karasu-tools/core` は v0.x（TS API、無保証）**。`.krs` / `.krs.style` 言語は v1.0 だが、TS API は minor で破壊的変更を許す（[ADR-1314](adr/1314-krs-spec-v1-freeze.md)）。`exports` は公開先に `dist` を指し、`development` 条件で repo 内は TS ソースを解決するため `pnpm typecheck` は build 非依存。

> **`karasu`（CLI）の version floor は 0.6.0**。npm の `karasu` 名は旧 incarnation が `〜0.5.2` まで公開済みで、それ以下は `E400 Cannot publish over previously published version` になる。`@karasu-tools/core` は履歴がクリーンなため独立して 0.x（independent versioning）。

`karasu-skills` は `prepack` で、その時点の CLI の版（`packages/cli/package.json`）を各 SKILL.md の `metadata.karasu-version` と本文 Step 0 に刻み、`postpack` で元に戻す（刻むのは「この版以降の CLI 向け」という下限）。利用者はルートの `.claude-plugin/marketplace.json` を marketplace として追加し、npm の `karasu-skills` を plugin として入れる（`/plugin marketplace add kompiro/karasu` → `/plugin install karasu@karasu`）。設計は [ADR-2901](adr/2901-karasu-authoring-skill.md)（#2932）。

> **`karasu` は `karasu-skills` に依存する**（#2912）。`karasu skill install` が同梱の skill をコピーするため、CLI は `karasu-skills` を esbuild で内包せず実行時に解決する（ADR-1363 の「CLI は依存を内包する」の例外。中身は skill の文書だけ）。公開される `karasu` はその時点の `karasu-skills` の版を完全一致で指すので、同じトレインで `karasu-skills` の publish が失敗すると `npm i karasu` が解決できなくなる。`release.yml` の結果で両方が公開されたことを確かめる。

> **`karasu-skills` の初回 publish は手動**。npm の Trusted Publisher はパッケージが存在してからでないと登録できない（下の「前提」）。最初のリリース PR で版が確定したら、ローカルの `packages/skills` で `pnpm publish --access public`（OTP を求められる）を実行して一度だけ公開し、npmjs.com で Trusted Publisher（org `kompiro` / repo `karasu` / workflow `release.yml`）を登録する。以降は `release.yml` が OIDC で公開する。`packages/skills/package.json` は `publishConfig.provenance` を持たない: provenance は Trusted Publishing で自動的に付き（`release.yml` の header）、ローカルからの初回 publish は provenance を作れないため。

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
4. マージで `main` の `packages/**/CHANGELOG.md` が変わり、`release.yml`（`paths` filter）が発火 → `changeset publish` が bump 済みパッケージを npm に公開する（`workflow_dispatch` での手動再実行も可）。
5. 認証は **GitHub OIDC（Trusted Publishing）** — `release.yml` の `id-token: write` を npm が短命クレデンシャルに交換する。`NPM_TOKEN` は不要（保持しない）。provenance は trusted publishing で**自動付与**される（`--provenance` 不要）。要件は npm >= 11.5.1 / Node >= 22.14.0 で、`release.yml` が pin する Node 24（npm 11.17+ を同梱）が満たすため、npm を別途アップグレードするステップは持たない（[ADR-2397](adr/2397-node-24-baseline.md)）。publish の経路は `changeset publish` → `pnpm publish` → npm CLI（pnpm 10 が委譲する）。
6. 同じ run の `record` ジョブが、公開できたパッケージのタグ（`karasu@X.Y.Z` / `@karasu-tools/core@X.Y.Z` / `karasu-skills@X.Y.Z`。対象は `scripts/release/github-release.mts` の `RELEASED_PACKAGES`）をリリース PR のマージコミットに push し、GitHub Release **`release-YYYY-MM-DD`**（マージコミットの UTC 日付。同じ日の 2 回目以降は `-2`, `-3`）を作る。本文は各パッケージの `CHANGELOG.md` の該当版の節（`scripts/release/github-release.mts`）。公開に失敗したパッケージにはタグを打たない。タグは `changeset publish` が注釈付きタグとして作るので、release ジョブは publish の前に git の identity（`github-actions[bot]`）を設定する。changesets は `git tag` の失敗を無視し、完了メッセージにも npm パッケージのタグを出さないため、「Collect the tags」ステップが、このコミットに必要なタグ（この run が公開したもの＋npm に既にある各パッケージの現在の版。`scripts/release/published-packages.mts`）を洗い出し、タグの無いものがあればジョブを失敗させる。後者を含めるのは、再実行では `changeset publish` が公開済みの版を飛ばして何も出力しないため（[#2982](https://github.com/kompiro/karasu/issues/2982)。2026-09-28 のトレインはタグが 1 つも付かず、手で補正した）。**この失敗は再実行だけでは直らない**: エラーに出たタグをリリースのマージコミットに打って push してから再実行する（手順 8）。npm の公開権限を持つジョブは `contents: read` のまま、書き込みはこのジョブだけが持つ（[#2939](https://github.com/kompiro/karasu/issues/2939)）。
7. 同じ run で VS Code 拡張も公開される（下の「VS Code 拡張のリリース」）。npm の公開が一部失敗しても拡張の公開は走る。
8. 最後の `close-train` ジョブが、マージされた PR のブランチ名でトラッキング Issue を特定し、全部成功していれば Release のリンクを付けて閉じる。失敗があれば、失敗した run のリンクをコメントして Issue を開いたままにする（次のトレインはそれが閉じるまで発車しない）。直したら **Re-run failed jobs** で再実行する。main が先に進んでいなければ `workflow_dispatch` での再実行でも閉じる。

> 前提: 公開対象パッケージごとに npmjs.com で **Trusted Publisher**（org `kompiro` / repo `karasu` / workflow `release.yml`）を登録しておくこと。未登録のパッケージは OIDC publish が失敗する。新規パッケージは登録前に一度存在している必要があるため、**初回だけローカルから手動 publish**（`pnpm publish`、provenance off + OTP）してから登録する。

### VS Code 拡張のリリース

`karasu-vscode` の**版 bump と `CHANGELOG.md` は上記 changesets フローで自動**化される（`changeset version` が `packages/vscode/package.json` の version を更新）。`private: true` なので `changeset publish`（`release.yml`）は npm へ publish しない。**Marketplace への公開は手動**で、版が bump された後に行う:

1. リリース PR のマージで走る `release.yml` が、npm の公開のあとに **"VS Code Extension Release"**（`vscode-release.yml`）を `workflow_call` で呼ぶ。手動で出すときは Actions タブから `workflow_dispatch` で起動する（pre-release チャネルは `pre_release` input で選択。週次の pre-release は [#2940](https://github.com/kompiro/karasu/issues/2940)）。
2. `package.json` の version が **Marketplace に stable として既にあれば公開しない**（`vsce show` で確認）。拡張の版が上がらなかった月のトレインでは何も起きない。同じ版が pre-release にしか無ければ stable として出せないので失敗する。`vsce show` 自体が失敗したときも失敗する。
3. 認証は **Microsoft Entra ID via GitHub OIDC**（`AZURE_CLIENT_ID` / `AZURE_TENANT_ID` 変数。未設定時は build + package のみで publish はスキップ）。
4. ビルドは main の先頭ではなく、**拡張の現在の版を設定したコミット（リリース PR のマージコミット）** から行う。リリース後に main へ入った次回分の変更を拡張に混ぜないため。
5. Marketplace への公開が成功したら、`record` ジョブがそのコミットに `karasu-vscode@X.Y.Z` を打ち、同じコミットの GitHub Release に拡張の節を加える（Release が無ければ作る）。公開に失敗した版と pre-release にはタグを打たない（[#2939](https://github.com/kompiro/karasu/issues/2939)）。

> **`packages/vscode/README.md` の画像は絶対 URL で書く**（`https://raw.githubusercontent.com/kompiro/karasu/main/packages/vscode/images/...`）。`vsce` は相対画像パスを repository-**root** の raw URL に書き換えるが `repository.directory` を考慮しないため、monorepo では Marketplace 上で 404 になる。

> 拡張は npm と同じトレインで出す（[#2922](https://github.com/kompiro/karasu/issues/2922)）。版はパッケージごとに独立なので、拡張の版が上がらないリリースもある。

### CLI の後方互換

`karasu` CLI のうち、skill やスクリプトが呼ぶ面（コマンド名、フラグ、stdout / stderr の形式、終了コード）は後方互換を保つ（[#2961](https://github.com/kompiro/karasu/issues/2961)、設計は [ADR-2901](adr/2901-karasu-authoring-skill.md) の「利用者の手元でのずれ」）。Claude Code はサードパーティ marketplace の plugin を自動更新しないので、新しい CLI と古い skill の組み合わせは利用者の手元で普通に起きる。その互換の責任を CLI が持つ。

- **名前を変える・廃止する**: 古い名前を消さず、`packages/cli/src/deprecations.ts` の `DEPRECATIONS` に 1 行足す（種別、古い名前、代わり、廃止した版、削除する版）。古い名前は `--help` に出ない別名として動き続け、呼ばれると stderr に 1 行出す: `karasu: deprecated: 'old' -> 'new' (since 0.8.0, removal 1.0.0)`。
- **別名を削除してよいのは major のリリースだけ**（0.x の間は 1.0.0 まで削除しない）。削除は CHANGELOG で予告する。削除した項目には `removed: true` を付け、**表から消さずに墓標として残す**。墓標の名前は「未知のコマンド」ではなく、同じ形式の `karasu: removed: ...` 行を出して終了コード 1 で失敗する。
- **問い合わせ**: `karasu capabilities --json` が CLI の版、登録済みのコマンドとフラグ、表の全項目を返す。形式は [docs/tools/cli.md](tools/cli.md#karasu-capabilities-what-this-cli-accepts) に書いた。

守られているかは CLI の vitest（`packages/cli/src/compat.test.ts`）が確かめる。

- `agent-surface.json` に記録したコマンドやフラグが、表に項目のないまま消えると失敗する。新しいコマンドやフラグを足したときも、`agent-surface.json` への追記を求めて失敗する（追記した名前が互換の約束に入る）。
- 表の各項目について、別名の代わりが今も登録された名前であること、削除する版が 1.0.0 以上の major であること、CLI の版が削除する版に達した項目に `removed: true` が付いていることを確かめる。
- repo 内の skill は常に最新の名前を使う。`pnpm lint:skill-cli-refs` は、`.claude/skills/**` が表にある名前を使っていたら失敗する。古い名前は、利用者の手元に残る古い skill のためだけにある。

### 未対応のフォローアップ

- **changeset-bot**（GitHub App）— PR に changeset の有無をコメントしてくれる。リポジトリを public 化したので有効化を検討する。
