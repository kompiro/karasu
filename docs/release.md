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

## リリース運用

npm への公開は **changesets** で管理し、認証は **npm Trusted Publishing（GitHub OIDC）** で行う（token レス）。

### 対象パッケージ

npm 公開対象は `karasu`（CLI、`packages/cli`）と `@karasu-tools/core`（ライブラリ）。CLI は esbuild で `@karasu-tools/core` を内包した単一 ESM バンドルとしてビルドする（`packages/cli` の `build` スクリプト。公開 core への依存には切り替えない）。`@karasu-tools/app` / `@karasu-tools/lsp` / `@karasu-tools/e2e` / `@karasu-tools/vscode-e2e` は `.changeset/config.json` の `ignore` に入っており版管理・公開とも対象外。

`karasu-vscode`（VS Code 拡張）も changesets の**版管理対象**（`ignore` から除外）。ただし `private: true` のため `changeset publish` は npm へ publish せず（自動スキップ）、配布は Marketplace 経由で手動（後述「VS Code 拡張のリリース」）。changesets は version bump と `packages/vscode/CHANGELOG.md` 生成のみを担う。

> **`@karasu-tools/core` は v0.x（TS API、無保証）**。`.krs` / `.krs.style` 言語は v1.0 だが、TS API は minor で破壊的変更を許す（[ADR-1314](adr/1314-krs-spec-v1-freeze.md)）。`exports` は公開先に `dist` を指し、`development` 条件で repo 内は TS ソースを解決するため `pnpm typecheck` は build 非依存。

> **`karasu`（CLI）の version floor は 0.6.0**。npm の `karasu` 名は旧 incarnation が `〜0.5.2` まで公開済みで、それ以下は `E400 Cannot publish over previously published version` になる。`@karasu-tools/core` は履歴がクリーンなため独立して 0.x（independent versioning）。

### 変更を加えるとき

公開・配布対象パッケージ（`karasu` / `@karasu-tools/core` / `karasu-vscode`）に利用者から見える変更を入れる PR では、`pnpm changeset` を実行して `.changeset/<name>.md` を追加し、PR に含める。

- bump レベルは semver に従う（破壊的変更 = major、機能追加 = minor、修正 = patch）。各パッケージとも 0.x なので、当面は破壊的変更も minor で扱ってよい。
- **どのパッケージを名指すか**:
  - `packages/core` の利用者向け変更 → **`@karasu-tools/core` と `karasu` の両方**を名指す。core の bump は `karasu-vscode` へは自動 cascade するが、`karasu`（core を devDependency でバンドル）へはしないため。
  - `packages/cli` 固有の変更 → `karasu`
  - `packages/vscode` 固有の変更 → `karasu-vscode`
- 内部リファクタ・テスト・ドキュメントのみ・公開対象外パッケージのみの変更では changeset 不要。
- `CHANGELOG.md` の文面は利用者向けに書く（コミット subject の流用ではなく）。
- **experimental notation に触れる変更は promotion gate を通す**: `docs/roadmap.md` の [§promotion gate](roadmap.md#promotion-gatenotation-評価の規律) に載る watch item（experimental notation）を stable 層へ昇格させる／挙動を変える changeset では、[ADR-1820](adr/1820-notation-promotion-gate.md) の gate を通す。昇格なら **載せる言語版（後方互換な追加 = 言語 v1.x / 既存構文の変更・再設計 = 言語 v2.0）を決め、changeset と `CHANGELOG.md` に言語版遷移を明記**する（パッケージの bump レベルは semver 規約で独立に決める — [ADR-2124](adr/2124-version-vocabulary.md)。語彙の正典は [roadmap §version vocabulary](roadmap.md#version-vocabulary版語彙の定義--正典)）。判断根拠（実利用証拠 = karasu-nest の共有 corpus）を PR に書く。据え置きが既定なので、証拠が無ければ experimental のままにする。

`pnpm changeset status` で「未リリースの変更があるか」を確認できる。

### リリースの流れ

リリースは **GitHub Actions 起動**で行う。ローカルで `changeset version` は実行しない。Actions に PR 作成権限を与えなくて済むよう、bot による "Version Packages" PR は使わない。

リリース手順は以下のとおり:

1. **"Release — Prepare"**（`release-prepare.yml`）を Actions タブから `workflow_dispatch` で起動する。`changeset version`（版 bump + `CHANGELOG.md` 生成 + lockfile 更新）を実行し、`chore/release-<version>` ブランチを push する。pending changeset が無ければ何もせず終了する。
2. その push されたブランチから **PR を開く**（Actions は PR を作れないので「Compare & pull request」を 1 クリック。人が開くことで必須チェックも走る）。
3. **マージ前に版番号と `CHANGELOG.md` を必ず読む**（main ruleset の必須承認数は 0 = self-merge 可。目視確認はこの運用ルールで担保する）。このとき、**experimental notation の stable 昇格や破壊的変更が CHANGELOG に含まれるなら、promotion gate（[ADR-1820](adr/1820-notation-promotion-gate.md)）が通っているか・言語版に触れる変更が changeset / CHANGELOG に言語版遷移として明記されているか（[ADR-2124](adr/2124-version-vocabulary.md)、表記は `.krs language vX.Y`）を確認**する。問題なければ **squash マージ**する。
4. マージで `main` の `packages/**/CHANGELOG.md` が変わり、`release.yml`（`paths` filter）が発火 → `changeset publish` が bump 済みパッケージを npm に公開する（`workflow_dispatch` での手動再実行も可）。
5. 認証は **GitHub OIDC（Trusted Publishing）** — `release.yml` の `id-token: write` を npm が短命クレデンシャルに交換する。`NPM_TOKEN` は不要（保持しない）。provenance は trusted publishing で**自動付与**される（`--provenance` 不要）。要件は npm >= 11.5.1 / Node >= 22.14.0 で、workflow が `npm i -g npm@latest` で満たす。

> 前提: 公開対象パッケージごとに npmjs.com で **Trusted Publisher**（org `kompiro` / repo `karasu` / workflow `release.yml`）を登録しておくこと。未登録のパッケージは OIDC publish が失敗する。新規パッケージは登録前に一度存在している必要があるため、**初回だけローカルから手動 publish**（`pnpm publish`、provenance off + OTP）してから登録する。

### VS Code 拡張のリリース

`karasu-vscode` の**版 bump と `CHANGELOG.md` は上記 changesets フローで自動**化される（`changeset version` が `packages/vscode/package.json` の version を更新）。`private: true` なので `changeset publish`（`release.yml`）は npm へ publish しない。**Marketplace への公開は手動**で、版が bump された後に行う:

1. リリース PR（`changeset version` 済み）をマージし、`packages/vscode/package.json` の version が確定した状態にする。
2. **"VS Code Extension Release"**（`vscode-release.yml`）を Actions タブから `workflow_dispatch` で起動する。`package.json` の version をそのまま Marketplace（publisher `karasu-tools`）へ publish する（pre-release チャネルは `pre_release` input で選択）。
3. 認証は **Microsoft Entra ID via GitHub OIDC**（`AZURE_CLIENT_ID` / `AZURE_TENANT_ID` 変数。未設定時は build + package のみで publish はスキップ）。

> **`packages/vscode/README.md` の画像は絶対 URL で書く**（`https://raw.githubusercontent.com/kompiro/karasu/main/packages/vscode/images/...`）。`vsce` は相対画像パスを repository-**root** の raw URL に書き換えるが `repository.directory` を考慮しないため、monorepo では Marketplace 上で 404 になる。

> 拡張は CLI とは独立した cadence で出す（マージのたびに自動公開はしない）。

### 未対応のフォローアップ

- **changeset-bot**（GitHub App）— PR に changeset の有無をコメントしてくれる。リポジトリを public 化したので有効化を検討する。
