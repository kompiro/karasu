# Dependabot トリアージ 2026-09-22

- **日付**: 2026-09-22
- **ステータス**: 検討中
- **関連**:
  - 対象 Dependabot PR: [#2867](https://github.com/kompiro/karasu/pull/2867) / [#2868](https://github.com/kompiro/karasu/pull/2868) / [#2869](https://github.com/kompiro/karasu/pull/2869) / [#2870](https://github.com/kompiro/karasu/pull/2870) / [#2871](https://github.com/kompiro/karasu/pull/2871) / [#2872](https://github.com/kompiro/karasu/pull/2872) / [#2873](https://github.com/kompiro/karasu/pull/2873) / [#2874](https://github.com/kompiro/karasu/pull/2874) / [#2875](https://github.com/kompiro/karasu/pull/2875) / [#2876](https://github.com/kompiro/karasu/pull/2876)
  - changesets 採用と release script: [ADR-1315](../adr/1315-release-automation-changesets.md)
  - release-prepare workflow（`changeset version` を Actions で回す）: [ADR-1370](../adr/1370-release-flow-actions-driven.md)
  - gh-aw の `.lock.yml` は再生成で上げる: [ADR-2753](../adr/2753-dependabot-triage-2026-09-07.md)
  - major は差し替え PR で入れた前例: [ADR-2836](../adr/2836-dependabot-triage-2026-09-14.md)
  - `dompurify` の override と宣言レンジ: [ADR-2404](../adr/2404-dependabot-security-2026-08-08.md)
  - cooldown 7 日: [ADR-784](../adr/784-update-dependencies-20260421.md)
  - 週次 workflow の schedule 停止: [ADR-2839](../adr/2839-pause-dependabot-triage-schedule.md)
  - 関連 TPL: [TPL-2786](../test-perspectives/TPL-2786-guard-failure-must-fail-the-run.md)（release-prepare の exit code 対応で「判定不能を通過に寄せない」形を選ぶ根拠）
  - 運用ルール: `.claude/rules/dependabot.md`, `docs/release.md`「Dependabot 運用ルール」

## 背景

2026-09-21（月）の weekly バッチ。npm 8 件と github-actions 2 件の計 10 件。
`security` ラベルはゼロ、`dependabot/alerts` の open も 0 件で、純粋な version update バッチである。

週次 workflow は ADR-2839 で schedule を止めており、今回は所見 Issue も PR コメントも無い。
そのため upstream の追跡を最初から本 Doc で行った。

**供給側（配布主体・改ざん）の懸念はゼロだった。**

- cooldown 7 日: 全件充足。最も近いのは `github/gh-aw-actions` v0.89.15（2026-09-14 17:47 公開、PR 起票まで 7 日 4 時間）と
  `@changesets/cli` 3.0.3（2026-09-14 15:31 公開、7 日 6 時間）
- publisher: from 版と to 版で変化なし。`marked` / `lefthook` / `react` / `react-dom` / `vite` / `@testing-library/user-event` /
  `@changesets/cli` は GitHub Actions の OIDC trusted publishing で provenance 付き。`dompurify` は `cure53`、
  `@types/*` は `types`、`vscode-extension-tester` は `rhdevelopers-ci` で、いずれも従来から provenance なしのまま
- lifecycle script（`preinstall` / `install` / `postinstall` / `prepare`）: 新規追加ゼロ。`lefthook` の `postinstall` は
  from / to とも存在し、中身が 1 箇所変わる（後述）。`dompurify` の `prepare=husky` は registry からの install では走らない
- 既知 advisory: GitHub Advisory Database で to 版 9 件と from 版の `dompurify` / `marked` を照会し、該当ゼロ
- github-actions 2 件: PR が pin した SHA が upstream タグの commit と一致

CI が red なのは #2867 の 1 件だけで、原因は bump ではなく repo 側の `gh-aw-lock-consistency.test.ts` が
意図どおり捕まえたもの（ADR-2753 の再現）。

一方で、**CI が green でも採用できない PR が 1 件ある**。#2871（`@changesets/cli` 2 → 3）は CI が
`changeset version` を実行しないため green だが、ローカルで回すと現在の pending changeset で失敗する。

## 一覧

| PR | 依存 | from → to | 種別 | CI | リスク | 推奨 |
| --- | --- | --- | --- | --- | --- | --- |
| [#2868](https://github.com/kompiro/karasu/pull/2868) | `azure/login` | v3.0.2 → v3.1.0 | minor | green | low | 採用（そのままマージ） |
| [#2870](https://github.com/kompiro/karasu/pull/2870) | `@testing-library/user-event` | 14.6.6 → 14.6.7 | patch | green | low | 採用（そのままマージ） |
| [#2874](https://github.com/kompiro/karasu/pull/2874) | `dompurify` | 3.4.13 → 3.4.15 | patch ×2 | green | low | 採用（そのままマージ） |
| [#2876](https://github.com/kompiro/karasu/pull/2876) | `marked` | 18.0.9 → 18.0.13 | patch ×4 | green | low | 採用（そのままマージ） |
| [#2875](https://github.com/kompiro/karasu/pull/2875) | `lefthook` | 2.1.12 → 2.1.14 | patch ×2 | green | low | 採用（そのままマージ） |
| [#2869](https://github.com/kompiro/karasu/pull/2869) | `react` / `react-dom` / `@types/react` / `@types/react-dom`（react group） | 19.2.8 → 19.3.0 ほか | minor | green | low | 採用（そのままマージ） |
| [#2873](https://github.com/kompiro/karasu/pull/2873) | `vite` | 8.2.2 → 8.3.0 | minor | green | low | 採用（そのままマージ） |
| [#2872](https://github.com/kompiro/karasu/pull/2872) | `vscode-extension-tester` | 8.24.0 → 8.27.0 | minor ×3 | green | low | 採用（そのままマージ） |
| [#2871](https://github.com/kompiro/karasu/pull/2871) | `@changesets/cli` | 2.31.0 → 3.0.3 | **major** | green（`changeset version` は CI が回さない） | medium | 採用（**差し替え PR**、bot PR は close） |
| [#2867](https://github.com/kompiro/karasu/pull/2867) | `github/gh-aw-actions/setup` | 0.88.7 → 0.89.15 | minor | Check red | n/a | **却下**（`gh aw compile` の再生成 PR で入れる） |

`@dependabot ignore` はどこにも設定しない。#2867 の却下は「その版を入れない」ではなく
「bot PR の形では入れない」で、ADR-2753 と同じ扱いである。

## PR ごとの分析

依存エッジは `pnpm-lock.yaml` の snapshot を peer suffix を落として base（`b2812c38`、全 PR で共通）と
PR ヘッドで突き合わせた（`security-alert` skill の edges 手順）。「新規パッケージ名」は
lock の `packages:` に base で存在しなかった名前を指す。

`pnpm-workspace.yaml` の `overrides:`（23 件）に今回動く解決が掛かるのは `dompurify: ^3.4.13`（#2874、解決 3.4.15）、
`vite@8: ^8.0.16`（#2873、解決 8.3.0）、`nanoid: ^3.3.18`（#2873、解決 3.3.19）、`postcss: ^8.5.18`（#2873、解決 8.5.28）の
4 件で、いずれも floor を満たす。他の override 対象は動かない。

### #2871 `@changesets/cli` 2.31.0 → 3.0.3（major）

**判定: medium / 採用（差し替え PR）。bot PR のままでは release flow が壊れる。**

3.0.0 の major change のうち本 repo に当たるものは 3 つ。

1. **private パッケージは既定で版管理されなくなった**（changesets#2186）。`privatePackages` の既定が
   `{ version: false, tag: false }` になり、`private: true` の `karasu-vscode` は「ignored」扱いになる。
   本 repo は `karasu-vscode` を changesets の版管理対象にしており（`docs/release.md`「VS Code 拡張のリリース」、
   `ignore` から除外）、しかも pending changeset `clever-eyes-shake` が `@karasu-tools/core` / `karasu` /
   `karasu-vscode` を 1 枚に書いている。v3 はこれを mixed changeset として拒否する。
2. **`changeset version` は未リリースの changeset が無いとき exit 1 になる**（changesets#1860）。
   `release-prepare.yml` は `pnpm version-packages` を無条件に実行し、その後で tree が clean なら
   「nothing to release」で正常終了する設計（ADR-1370）。v3 では bash の `-e` で `changeset version` の
   exit 1 が先に job を落とし、正常系のはずの「pending なし」が失敗として報告される。
3. **`prettier` オプションが `format` に置き換わった**。本 repo は `prettier` を書いていないので、
   `format: "auto"` の自動検出に乗る。

bot ブランチを throwaway worktree に checkout し、`pnpm install --frozen-lockfile` の上で確かめた。

| 状態 | `changeset status` | `changeset version` |
| --- | --- | --- |
| bot PR そのまま（config 不変） | **exit 1**: `Found mixed changeset clever-eyes-shake … Mixed changesets that contain both ignored and not ignored packages are not allowed` | 同じエラーで **exit 1** |
| `privatePackages: { version: true, tag: false }` を追加 | exit 0: core / karasu / karasu-vscode を minor と表示 | exit 0: `karasu` 0.6.0 → 0.7.0、`@karasu-tools/core` 0.2.0 → 0.3.0、`karasu-vscode` 0.1.3 → 0.2.0。CHANGELOG 3 本を生成、changeset 158 枚を消費 |
| 上の状態で pending を全部消費した後 | **exit 1** | （version 側は changesets#1860 のとおり exit 1） |

`privatePackages: { version: true, tag: false }` は v2 の既定値そのものなので、これを明示すれば
`karasu-vscode` の扱いは今までと同じになる。tag を false にするのは ADR-1315 / `docs/release.md` の
「`karasu-vscode` は npm に publish せず Marketplace 手動」を変えないため。生成された CHANGELOG は
`changelog.cjs`（CJS のまま）の書式で出ており、ESM 化した v3 からも読めている。`format: "auto"` による
既存 CHANGELOG の整形ノイズは無かった（diff は新規エントリの追加のみ）。

その他の major change は当たらない: `changeset tag` → `git-tag` の改名（本 repo は tag を使わない）、
`--sinceMaster` の削除（`--since=main` を使っている）、Node `^22.11 || ^24 || >=26`（Node 24、ADR-2397）、
pnpm `>=10.0.0`（pnpm 11.20、ADR-2401）、Yarn Classic / Bolt サポート削除。ADR-1315 の assumption
`"release": "pnpm build && changeset publish"` は不変。`changeset publish` が `pnpm publish` に委譲する経路
（`docs/release.md`）も 3.0.3 の「pnpm 10 と npm 12 の互換修正」で改善方向。

依存ツリーは大きく入れ替わる。lock から 58 エントリが消え 27 が入る。新しいパッケージ名は 8 件:

| パッケージ | 出所 | 初回公開 | publisher / provenance |
| --- | --- | --- | --- |
| `@changesets/format` 0.1.2 | changesets/format（changesets org） | 2026-05 | GitHub Actions / あり |
| `@manypkg/tools` 2.1.2 | Thinkmill/manypkg（`@manypkg/get-packages` 1 → 3 に伴う分割） | 2023-01 | GitHub Actions / あり |
| `@pnpm/deps.graph-sequencer` 1100.0.1 | pnpm/pnpm monorepo | 2023-10 | `pnpmuser` / あり |
| `cac` 7.0.0 | cacjs/cac（`mri` の置き換え） | 2016 | GitHub Actions / あり |
| `launch-editor` 2.14.1 | vitejs/launch-editor（`@inquirer/external-editor` の置き換え） | 2018 | GitHub Actions / あり |
| `import-meta-resolve` 4.2.0 | wooorm | 2020 | `wooorm` / なし |
| `shell-quote` 1.10.0 | ljharb（`launch-editor` 経由） | 2012 | `ljharb` / なし |
| `jju` 1.4.0 | rlidwka（`@manypkg/tools` 経由） | 2013、この版は 2018 | `rlidwka` / なし |

いずれも長期に公開されている既知のパッケージで、install 時に走る script は無い。`@clack/prompts`（`enquirer` の
置き換え）は base の lock に別版が既にある。消える側には `prettier@2.8.8` / `fs-extra@7` / `@types/node@12` など
古い版が含まれ、ツリーは軽くなる方向。

**差し替え PR の中身**（1 コミット）:

- `package.json`: `@changesets/cli` `^2.31.0` → `^3.0.3` と lock（bot PR の lock と追加・削除集合が一致することを確認する）
- `.changeset/config.json`: `privatePackages: { "version": true, "tag": false }` を追加、`$schema` を
  `@changesets/config@4.0.1` に更新
- `.github/workflows/release-prepare.yml`: `pnpm version-packages` の前に pending changeset の有無を見て、無ければ
  notice を出して exit 0 する。`|| true` で exit 1 を握るのではなく、「pending なし」を先に判定して分岐する
  （TPL-2786: 判定不能や本物の失敗を通過に寄せない）。判定は `.changeset/*.md`（`README.md` 以外）の有無で行う
- `docs/release.md`: `changeset version` が pending なしで exit 1 になる旨と `privatePackages` の明示を 1 行ずつ追記

bot ブランチに人手で config を足しても `@dependabot recreate` で消えるので、ADR-2836 と同じく差し替え PR にする。
判定は「採用」なので `@dependabot ignore` は設定しない。

### #2867 `github/gh-aw-actions/setup` 0.88.7 → 0.89.15

**判定: 却下（再生成 PR で入れる）。** `.claude/rules/dependabot.md`「gh-aw の `.lock.yml` は bot PR ではなく再生成で上げる」
のとおり。PR は `dependabot-triage.lock.yml` / `security-alert-sweep.lock.yml` の `uses:` 行 12 箇所だけを書き換え、
同じファイルの `gh-aw-manifest` と `.github/aw/actions-lock.json`（v0.88.7 のまま）を据え置く。
`scripts/ci/gh-aw-lock-consistency.test.ts` が 2 テストで落ちており、これが red の全てである。

- PR タイトルは「from 0.88.8」だが、repo の 12 箇所と `actions-lock.json` はすべて v0.88.7（`5e508589`）。Dependabot が
  from 版を読み違えているだけで、対象ファイルの内容は正しく v0.88.7 起点である
- 再生成に使う版: gh-aw 本体の release では v0.89.x 系は v0.89.15 まで prerelease で、stable は
  **v0.89.17**（2026-09-19 公開）。Dependabot の要求版 v0.89.15 ではなく v0.89.17 を pin する。公開から 7 日を待つなら
  2026-09-26 以降に再生成する（cooldown は Dependabot の設定だが、根拠は同じ supply-chain 対策なので揃える）
- 再生成の手順と検証（`gh extension install --pin`、2 回コンパイルで idempotent、`gh-aw-lock-consistency` と
  `agentic-workflow-safety` の 2 テスト、`permissions:` / `GH_AW_INFO_ALLOWED_DOMAINS` / `ghcr.io` イメージ版の目視）は
  ルールの snippet どおりに別 PR で行う

### #2868 `azure/login` v3.0.2 → v3.1.0

- リリース: 2026-09-10。annotated tag `v3.1.0` の参照先 commit `a641126d` と、PR が 2 workflow
  （`azure-identity-bootstrap.yml` / `vscode-release.yml`）に書いた SHA が一致。tagger は `github-actions[bot]`
  で、これは同リリースに含まれる「deploy key によるタグ付け自動化」（Azure/login#638）の結果
- 差分: `action.yml` は入力 2 つの追加のみ（`max-context-population`、`mask-client-id` 既定 `true`）。既存入力の
  既定は変わらない。本 repo は `client-id` / `tenant-id` / `allow-no-subscriptions` だけを渡しており、新入力は使わない
- `src/common/LoginConfig.ts` 21 行と PowerShell 経路 8 行の変更。`lib/` のバンドルが再生成され、同梱の
  `js-yaml` 3.14.2 → 3.15.2 / `browserslist` が上がる。upstream 自身の workflow を full SHA pin に変えた変更が大半
- 判定: low / 採用

### #2869 `react` / `react-dom` / `@types/react` / `@types/react-dom`（react group）

- `react` / `react-dom` 19.2.8 → 19.3.0、`@types/react` 19.2.18 → 19.3.0、`@types/react-dom` 19.2.7 → 19.3.0。
  4 つを同時に動かすので peer（`react-dom` → `react ^19.3.0`、`@types/react-dom` → `@types/react ^19.3.0`）は揃う
- 19.3.0 は `<ViewTransition />` / `addTransitionType` の追加と、Trusted Types 統合、「transition を entangle せず
  独立に render する」挙動変更、`use()` の条件呼び出しに対する DEV 警告。削除・非推奨なし
- 依存: `react-dom` の `scheduler` ^0.27.0 → ^0.28.0（同じ facebook/react、provenance あり）。エッジ差分は
  radix-ui 系 / `@monaco-editor/react` / `@floating-ui/react-dom` などの peer 参照の付け替えのみで、新しい名前なし
- Check（typecheck を含む）/ Playwright / VS Code WebView / extension host のすべてが green
- 判定: low / 採用

### #2870 `@testing-library/user-event` 14.6.6 → 14.6.7

- 2 commit。`DataTransfer` の format alias 正規化（#1326）と、iframe 内への `user.keyboard` 入力対応（#1275）。
  変更は `src/utils/dataTransfer/DataTransfer.ts` と `getActiveElement.ts` の 2 ファイル
- 依存なし。エッジ差分は自身の 1 行のみ
- 判定: low / 採用

### #2872 `vscode-extension-tester` 8.24.0 → 8.27.0

- 8.25.0 / 8.26.0 / 8.26.1 / 8.27.0 の 4 リリース、99 commit。8.26.0 の「⚠️ Breaking」は wiki の削除で、パッケージの API ではない。
  中身は download / session lifecycle の CI 向け強化、workbench 既定設定の追加、page-objects の stale-element 対策
- 8.26.0 で `extract-zip` を落として `unzipper` に戻す（CVE-2026-56876 対応）、8.25.0 で `targz` を `tar` に置き換え。
  `got` 15 → 16、`js-yaml` の bump
- 新しいパッケージ名は 3 件で、いずれも `tar` 7.5.22 の取り込みによる: `tar`、`minizlib` 3.1.0、`@isaacs/fs-minipass` 4.0.1。
  publisher はすべて `isaacs`（npm CLI の作者、`node-tar` の維持者）で長期公開。`prepare` script を持つが registry からの
  install では走らない。`jszip` は 3.10.1 → 3.10.2（`selenium-webdriver` 経由。2026-09-08 に `jonkoops` が Stuk/jszip で
  リリースし、npm 側は 2010 年からのアカウント `jkoops`）
- 消える側は `targz` / `bl@1` / `tar-stream@1` / `mkdirp@0.5` など古い版で、ツリーは新しくなる方向
- arm64 devcontainer では ExTester を回せない（`project_arm64_no_local_extester`）ので、判断は CI の
  VS Code WebView (ExTester) job に依る。green
- 判定: low / 採用

### #2873 `vite` 8.2.2 → 8.3.0

- 8.3.0-beta.0 / beta.1 / 8.3.0。機能追加（preload 依存の settle 省略、devtools の dev server 統合）、修正
  （CRLF の code frame、`node_modules` パスセグメントの判定）、性能改善。Breaking の節は無し。beta.0 の
  Code Refactoring は未使用 `esbuildPlugin` の削除など内部のみ
- 依存: `rolldown` ~1.2.4 → ~1.2.6（解決 1.2.8、16 の binding も同時）、`postcss` ^8.5.28、`picomatch` ^4.0.7。
  peer の `@vitejs/devtools` は `^0.7.1` に上がるが本 repo は使っていない
- **lock からは何も消えない。** `packages/app` だけが 8.3.0 に上がり、`vitest` / `@vitest/mocker` / `astro` /
  `vitefu` は 8.2.2 を指したまま残る（`vite@8.2.2` と `vite@8.3.0` が並存）。Dependabot は直接依存だけを動かすので
  想定内で、ADR-2836 の `undici` と同じ形。次に `vitest` / `astro` が動いたときに畳まれる
- 判定: low / 採用

### #2874 `dompurify` 3.4.13 → 3.4.15

- 3.4.14: 「risky tag を allow-list したときの bypass」修正、mixed document context の edge case、SVG の
  `pointer-events` / `vector-effect` を allow-list に追加、リファクタリング。3.4.15: XML を含む clobbering への
  hardening。`src/purify.ts` が 652 行動く（2 commit）。advisory は無い
- 本 repo の呼び出しは `DOMPurify.sanitize(raw)` の既定設定のみ（`ChatPane` / `EdgeDetailPanel` / `NodeDetailPanel`）で、
  allow-list を広げていない。修正の恩恵は受け、挙動が変わる側には当たらない
- override `dompurify: ^3.4.13` の floor を 3.4.15 は満たし、宣言 `^3.4.13` もそのまま。CI が green なので
  `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`（ADR-2115 の失敗モード）は起きていない。ADR-2404 の assumption
  （`pnpm-workspace.yaml` と `packages/app/package.json` に `dompurify`）も不変
- 判定: low / 採用

### #2875 `lefthook` 2.1.12 → 2.1.14

- 2.1.13 は npm にも GitHub release にも無く（commit のみ）、2.1.14 が 2.1.13 の内容を含む。tarball の diff は
  `package.json` の版、README、`postinstall.js` の 1 行
- **`postinstall.js` の変更**: `lefthook install -f` → `lefthook install`（#1510「npm postinstall から force-install
  しない」）。既存の hook が lefthook 管理でないとき上書きしなくなる。本 repo の `.git/hooks` は lefthook 管理なので
  挙動は変わらず、新規 clone でも `install` は hook を書く
- その他: `--job` / `--command` が何にも一致しないときエラー、non-TTY での tty 処理の無効化、色の強制、
  `file_types` の解決を repo root 基準に
- 10 個の platform binary は全部 2.1.14 に揃って動く。新しい名前なし
- 判定: low / 採用

### #2876 `marked` 18.0.9 → 18.0.13

- 4 リリース、40 commit。すべて CommonMark 準拠の修正（tab の扱い、reference link の case fold、hard break 後の
  空白、list item を閉じる html block 条件）と `reflinkSearch` の O(n²) 回避。`src/` の 7 ファイル
- 依存なし。`packages/app` と `packages/vscode` の 2 manifest が動き、lock は自身の 1 行
- 判定: low / 採用

## マージ順（ステップ 6 で実施）

main は最新 base を必須にしていないので、テキストで衝突しなければ rebase なしで順にマージできる。
ADR-2836 と同じく、マージ順に bot ブランチを main へ重ね、各時点で `pnpm install --lockfile-only` が
lock に差分を出さないことを確かめてから進める。

1. #2868（Actions、lock に触れない）
2. #2875（root `package.json` / lock の `.` importer）
3. #2872（`packages/vscode-e2e`）
4. #2876（`packages/app` + `packages/vscode`）
5. #2874 / #2873 / #2870 / #2869（`packages/app` の隣接行。衝突したものは `@dependabot rebase` を 1 回ずつ）
6. #2871 の差し替え PR（root `package.json` / lock、上記が全部入った main の上で作る）
7. #2867 を close し、再生成 PR を別途出す

## 却下した案

- **#2871 を bot PR のままマージする**: CI は green だが `changeset version` を回していない。現在の pending changeset で
  `status` も `version` も exit 1 になり、次の `release-prepare.yml` の実行が失敗する
- **#2871 を保留し、先に main の `config.json` だけ直す**: `privatePackages` は v2 でも受け付けるので技術的には可能だが、
  release-prepare の exit code 対応は v3 でしか意味を持たず、2 PR に分けると片方だけ入った中間状態が生まれる。
  bump と config と workflow を 1 コミットにする
- **`karasu-vscode` を `ignore` に入れて v3 の既定に合わせる**: `karasu-vscode` の版と CHANGELOG を changesets に
  任せる設計（`docs/release.md`）を変えることになる。今回の bump の範囲ではない
- **release-prepare で `pnpm version-packages || true`**: 本物の失敗（config エラー、mixed changeset）も握って
  「nothing to release」に見せてしまう（TPL-2786）
- **#2867 を再生成なしで v0.89.15 にする、または bot PR に `actions-lock.json` の修正を足す**: `.lock.yml` の
  `gh-aw-manifest` はコンパイラ出力なので、コンパイラを通さずに整合させられない（ADR-2753）

## 未解決の問い

- #2867 の再生成を v0.89.17 の公開 7 日後（2026-09-26）まで待つか、今すぐ行うか
