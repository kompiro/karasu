---
id: ADR-3751
title: Dependabot トリアージ 2026-11-09：npm 14 件を採用し、@types/vscode 1.144 は ExTester の上限で floor を動かせないので close する
status: accepted
date: 2026-11-10
topic: build
related_to:
  - ADR-3575
  - ADR-3069
  - ADR-2562
  - ADR-2782
  - ADR-2671
  - ADR-2474
  - ADR-1316
scope:
  packages: [app, cli, core, docs-site, lsp, vscode, vscode-e2e]
  concerns: [ci, dependencies, security]
---

# ADR-3751: Dependabot トリアージ 2026-11-09：npm 14 件を採用し、@types/vscode 1.144 は ExTester の上限で floor を動かせないので close する

- **日付**: 2026-11-10
- **ステータス**: 決定済み
- **関連**:
  - Design Doc PR: [#3751](https://github.com/kompiro/karasu/pull/3751)（本 ADR に昇格し削除）
  - 対象 Dependabot PR: [#3734](https://github.com/kompiro/karasu/pull/3734) 〜 [#3748](https://github.com/kompiro/karasu/pull/3748)（15 件）
  - 前回トリアージ: [ADR-3575](./3575-dependabot-triage-2026-11-02.md)
  - VS Code floor の方針: [ADR-2562](./2562-dependabot-triage-2026-08-17.md)（`@types/vscode` と `engines.vscode` を同値に固定）、[ADR-2782](./2782-vscode-floor-capped-by-extester.md)（ExTester の `vscode-max` を上限にする）
  - `@types/vscode` を close した前例: [ADR-3069](./3069-dependabot-triage-2026-10-05.md)、追随方針の見直し: [#3070](https://github.com/kompiro/karasu/issues/3070)
  - SDK の assumptions: [ADR-2671](./2671-dependabot-triage-2026-08-31.md)（`^1.`、ADR-3575 で更新）
  - 判定語彙: [ADR-2474](./2474-dependabot-replacement-pr-vocabulary.md)

## 背景

2026-11-09（月）21:45–21:51 UTC に週次の Dependabot PR が npm から 15 件起票された。security update ではない
（`security` ラベル無し。open な Dependabot alert は #104 `glob` と #106 `minimatch` の 2 件で、どちらも今回の PR が
bump するパッケージではない。後述「対象外の観測」）。

14 件は CI green。#3739（`@types/vscode` 1.140.0 → 1.144.0）だけが Check / Validate / ExTester で落ちていた。
落ちた理由はテストではなく VS Code の floor の柵で、`scripts/ci/vscode-version-policy.test.ts` が
`engines.vscode`（`^1.140.0`）と `@types/vscode`（`^1.144.0`）のずれを止めた。

**供給側（配布主体・改ざん）の懸念は見つからなかった。** bump 種別を問わず 15 件すべてで確かめたこと:

- **依存エッジ**: lock の snapshot を peer suffix を落として merge-base と各 PR ヘッドで突き合わせた
  （`security-alert` skill の edges 手順）。15 件を通して、main の lock に無い**パッケージ名**が新しく入るものはゼロ。
  動くのはすべて既存パッケージの版
- **publisher / provenance**: 直接 bump の 15 件と、版が動く主な transitive 依存 19 件（pagefind / i18next / shiki /
  lightningcss / enhanced-resolve / rolldown / `@opentelemetry/api` / unbash / tslib / parse5 / semver / `@astrojs/mdx` /
  mdast-util-directive / hastscript / `@ctrl/tinycolor` / tinybench / `@astrojs/telemetry` / hast-util-to-html /
  `@vitest/istanbul-lib-report`）を registry で比べた。GitHub Actions OIDC + provenance のものは to 版も同じ。
  provenance なしは従来どおりで、`@vscode/vsce`（`microsoft1es`）、`@types/*`（`types`）、`knip` / `unbash`（`webpro`）、
  unified 系（`wooorm`）、`i18next`（`adrai`）、`lightningcss`（`devongovett`）、`parse5`（`43081j`）。
  publisher が変わったのは `tslib` 1 件だけ（下記）
- **lifecycle script**: to 版で追加・変更されたものはゼロ。既存の `prepare` を持つのは `i18next` / `enhanced-resolve`
  （`husky`）、`lightningcss`（`patch-package`）、`@ctrl/tinycolor`（`node --run build`）で、registry install では走らない
- **コード差分**: `npm diff` で from…to の tarball を比べ、追加行を `child_process` / `eval(` / `new Function` /
  `process.env` / `fetch(` / `atob(` / base64 decode / `fromCharCode` / `spawn` / `exec` / `writeFileSync` /
  `homedir` / 外部 URL で grep し、該当行を読んだ。
  - 追加行が数千行を超えるもの（`vitest` / `lucide-react` / `oxfmt`）と、minify された再ビルドで該当行が出た
    `oxlint` / `marked` / `tailwindcss`、および `tslib` / `@opentelemetry/api` は、tarball 全体で各パターンの出現数を
    数えた。8 件とも from と to で全パターン同数で、新しく現れる URL のホストもゼロ
  - `@vscode/vsce` の `process.env` 2 行は 4.1.0 の新機能「Marketplace へのリクエストに `X-Market-CI-Provider` を送る」の
    CI 判定（`detectCIProvider` / `isGitHubActions`）
  - `astro` の `fetch(` は server island の既存コードの書き換え、`exec(` は正規表現の `.exec`
  - `knip` / `@anthropic-ai/sdk` の URL は docs・CHANGELOG・バッジだけ
  - `@types/vscode` は追加 7 行で、該当なし
- **既知 advisory**: 直接 bump の 15 版と、上の transitive 19 件の新版、`magic-string@1.4.5` / `entities@9.0.0` で
  該当ゼロ（GitHub Advisory API の `affects=`。クエリが効いていることは `undici@7.30.0` で 8 件返ることで確かめた）
- **公開からの経過**: すべて起票時点で 7 日を越えている。最も新しいのは `@tailwindcss/vite` / `tailwindcss` 4.3.4
  （11-02 21:30 公開、起票まで 7 日と約 20 分）
- **`pnpm-workspace.yaml` の `overrides:`**: 衝突なし。15 件で新しく解決される版に、`overrides:` の対象パッケージは
  含まれない（依存エッジの差分で新しく参照される `<名前>@<版>` と `overrides:` のキーを突き合わせた）
- **docs-site のビルド**: bot PR では「Deploy Docs Preview」の job ごとスキップされ、`astro build` が CI で走らない。
  #3743（astro）と #3736（starlight）の head を detached worktree に取り、`pnpm install --frozen-lockfile` と
  `pnpm --filter @karasu-tools/docs-site... run build` を実行した。どちらも 79 ページを出力して成功

### publisher が変わった `tslib` 2.8.1 → 2.9.1

`knip` と `@astrojs/starlight` の PR で、transitive の `tslib` が 2.8.1 → 2.9.1 に動く（`@emnapi/*` 経由。wasm の
fallback binding が使う）。publisher が `typescript-bot` から `microsoft1es` に、maintainers も一部入れ替わった。

これは upstream の公開経路の変更と整合する。`microsoft/tslib` の v2.8.1…v2.9.1 の compare では、
`.github/workflows/publish.yaml` が削除され `build/azure-pipelines/release.yml` が追加されている。`microsoft1es` は
`@vscode/vsce` も公開している Microsoft の 1ES（Azure Pipelines）の account である。GitHub の release v2.9.1 も
同日に `typescript-automation[bot]` が作っている。

コードの変更は `__rewriteRelativeImportExtension` に引数 2 つ（`extraExtensions` / `ignoreCase`）を足すだけで、
`tslib.js` の差分は 10 行程度。tarball 全体でパターンの出現数は同数だった。リスクは low と判断した。

### maintainers が増えた `@opentelemetry/api` 1.9.1 → 1.10.0

`@anthropic-ai/sdk` の PR で transitive に動く（vitest も同じ版を共有する）。maintainers に `martinkuba` と
`overbalance` が加わったが、公開は従来どおり GitHub Actions OIDC + provenance で、GitHub の release
`api/v1.10.0` は既存 maintainer の `pichlermarc` が作っている。リスクは low と判断した。

## 決定

**14 件を採用し、#3739（`@types/vscode` 1.144.0）を却下して close した。** 14 件はすべて bot PR をそのままマージし、
差し替え PR は使っていない。#3739 には `@dependabot ignore` を設定していない。

| PR    | 依存                                               | from → to           | 種別  | 対象                       | リスク | 判断 | 反映                                  |
| ----- | -------------------------------------------------- | ------------------- | ----- | -------------------------- | ------ | ---- | ------------------------------------- |
| #3745 | `marked`                                           | 18.1.2 → 18.1.3     | patch | app（runtime）             | low    | 採用 | そのままマージ                        |
| #3740 | `lucide-react`                                     | 1.62.0 → **1.67.0** | minor | app（runtime）             | low    | 採用 | そのままマージ（rebase で繰り上がり） |
| #3741 | `@anthropic-ai/sdk`                                | 1.3.0 → 1.4.0       | minor | app（runtime）             | low    | 採用 | そのままマージ                        |
| #3744 | `@vitejs/plugin-react`                             | 6.1.2 → 6.2.1       | minor | app（dev）                 | low    | 採用 | そのままマージ                        |
| #3746 | `@tailwindcss/vite`                                | 4.3.3 → 4.3.4       | patch | app（runtime 宣言）        | low    | 採用 | そのままマージ（#3737 と続けて）      |
| #3737 | `tailwindcss`                                      | 4.3.3 → 4.3.4       | patch | app（dev）                 | low    | 採用 | そのままマージ                        |
| #3738 | `@vscode/vsce`                                     | 4.0.0 → 4.1.0       | minor | vscode / vscode-e2e（dev） | low    | 採用 | そのままマージ                        |
| #3747 | `@types/node`                                      | 26.6.5 → 26.6.6     | patch | 全 package（dev）          | low    | 採用 | そのままマージ                        |
| #3734 | `vitest` group（`vitest` / `@vitest/coverage-v8`） | 5.0.5 → 5.1.0       | minor | 全 package（dev）          | low    | 採用 | そのままマージ                        |
| #3735 | `oxlint`                                           | 1.89.0 → 1.90.0     | minor | root（dev）                | low    | 採用 | そのままマージ                        |
| #3748 | `oxfmt`                                            | 0.74.0 → **0.76.0** | minor | root（dev）                | low    | 採用 | そのままマージ（rebase で繰り上がり） |
| #3742 | `knip`                                             | 6.43.0 → 6.44.1     | minor | root（dev）                | low    | 採用 | そのままマージ                        |
| #3743 | `astro`                                            | 7.4.2 → 7.4.5       | patch | docs-site（dev）           | low    | 採用 | そのままマージ                        |
| #3736 | `@astrojs/starlight`                               | 0.42.7 → 0.42.8     | patch | docs-site（dev）           | low    | 採用 | そのままマージ                        |
| #3739 | `@types/vscode`                                    | 1.140.0 → 1.144.0   | minor | vscode / vscode-e2e（dev） | low    | 却下 | close（ignore なし）                  |

表はマージした順に並べた。

## 理由（PR ごとの分析）

### #3739 `@types/vscode` 1.140.0 → 1.144.0（却下）

供給側の懸念は無い（DefinitelyTyped の `types` account、差分は型定義だけ）。入れられない理由は floor の方針である。

- ADR-2562 は `@types/vscode` と `engines.vscode` を同値に保つ。Dependabot は `engines.vscode` を書き換えないので、
  bot PR は構造的に片側だけの移動になり、`vscode-version-policy.test.ts` と `vsce` の検査
  （`@types/vscode ^1.144.0 greater than engines.vscode ^1.140.0`）で落ちる
- では `engines.vscode` も 1.144 に上げる差し替え PR で入れられるかというと、それも ADR-2782 の上限に当たる。
  lock の `vscode-extension-tester@8.28.1` は `vscode-max` が 1.140.0 で、npm の最新も 8.28.1（10-05 公開）のまま。
  floor 1.140 はすでに上限にいる
- 1.140 → 1.144 で使いたい API があるわけでもない

ADR-3069 で #2973（1.138）を close したのと同じ形で、bot PR を close した。ExTester が `vscode-max` を上げたら、
#3070 の提案（ExTester の bump と floor の移動を 1 本の差し替え PR にする）の流れで floor を動かす。Dependabot は
次の `@types/vscode` が出ればまた PR を開くが、#3070 が決まるまでは同じ扱いになる。

### #3734 `vitest` group 5.0.5 → 5.1.0

5.1.0 は機能追加（`--last-failed`、`--since-last-run`、fake timers の `node:timers` 対応、browser の trace view など）で、
breaking change の記載は無い。vitest が持つ `@vitest/istanbul-lib-report` / `@vitest/istanbul-lib-coverage` が
1.0.2 → 2.1.0 に動くが、どちらも vitest の monorepo から provenance 付きで出ている vitest 内部の fork である。
CI の全テストと coverage が green。

### #3735 `oxlint` 1.89.0 → 1.90.0 / #3748 `oxfmt` 0.74.0 → 0.76.0

どちらも oxc の monorepo から provenance 付き。oxlint は規則の追加（`no-unsafe-enum-assignment`）と誤検知の修正で、
karasu の Check（lint）が green。peer の `oxlint-tsgolint` の最小版が上がったが、karasu は `oxlint-tsgolint` を使っていない。
oxfmt は peer `@astrojs/compiler-rs` が `^0.5.0` に狭まったが、lock は 0.5.2 で満たす。0.76.0（rebase で繰り上がった版、
後述「結果」）は `parser:html` のファイルを新しい HTML formatter で整形する BREAKING を含むが、rebase 後の head で
`format:check` を含む Check が green なので、karasu のファイルの整形結果は変わっていない。

### #3736 `@astrojs/starlight` 0.42.7 → 0.42.8 / #3743 `astro` 7.4.2 → 7.4.5

どちらも patch で、修正だけ。starlight は sidebar の自動生成や last-updated の修正、astro は `import.meta.env` の `$`
の扱い、CSP の hash、invalid percent-encoding の 400 化、文字列タグ名の厳格化など。starlight の PR では transitive に
`pagefind` 1.5.2 → 1.6.0、`i18next` 26.5.11 → 26.7.1、`shiki` 4.5.0 → 4.6.0、`@astrojs/mdx` 8.1.1 → 8.1.2 などが、
astro の PR では `rolldown` 1.2.15 → 1.2.16、`shiki` 4.6.0 が動く。上記のとおり docs-site のビルドを手元で確かめた。

### #3737 `tailwindcss` / #3746 `@tailwindcss/vite` 4.3.3 → 4.3.4

同じリリースの 2 パッケージで、`@tailwindcss/vite` 4.3.4 は `tailwindcss` 4.3.4 を exact で依存する。片方だけの
状態では `packages/app` の直接宣言と plugin 側の解決が別の版になるので、2 本を続けてマージした。4.3.4 は修正が中心で、
`@tailwindcss/oxide-wasm32-wasi` が全 platform に install されるようになった（native binding が無いときだけ読む）。
そのため transitive に `lightningcss` 1.32.0 → 1.33.0、`enhanced-resolve` 5.24.5 → 5.26.0 が動き、
`@tailwindcss/node` 経由の `magic-string` が 0.30.21 から既存の 1.4.5 に寄る。app の build・E2E が green。

### #3738 `@vscode/vsce` 4.0.0 → 4.1.0

OIDC publish の help 表示、npm の minimum release age 設定、Marketplace へのリクエストへの `X-Market-CI-Provider` ヘッダー、
OIDC token exchange の Marketplace 契約への整合など。publish 経路（ADR-1316 の Entra ID + OIDC）に触れる変更だが、
ヘッダーの追加と token exchange の整合で、karasu 側の設定変更は不要。transitive に `parse5` 8.0.1 → 8.1.0（`entities`
^9 へ）、`semver` 7.8.6、`marked` 18.1.3 が動く。VS Code の ExTester / extension host が green。実際の Marketplace
publish はリリース時まで確かめられない。

### #3740 `lucide-react` 1.62.0 → 1.67.0

アイコンの追加と一部アイコンの形の変更で、karasu が使うアイコンの削除・改名があれば typecheck で落ちるが green。
起票時の対象は 1.66.0 で、rebase で 1.67.0 に繰り上がった（後述「結果」）。

### #3741 `@anthropic-ai/sdk` 1.3.0 → 1.4.0

API の型の追加（analytics / spend limits / RBAC など）と修正で、karasu が使う Messages API に変更は無い。ADR-2671 の
assumptions は `^1.` なので 1.4.0 で成立し、Validate が green。transitive の `@opentelemetry/api` は上記。

### #3742 `knip` 6.43.0 → 6.44.1

plugin の追加・設定ファイル探索の拡張と修正。`unbash` 6.0.1 → 6.0.3（同じ作者）と `tslib` 2.9.1 が動く。CI の knip が green。

### #3744 `@vitejs/plugin-react` 6.1.2 → 6.2.1

`refreshInclude` / `refreshExclude` の追加と、その修正。peer の `oxc-transform-react` と `@rolldown/plugin-babel` は
範囲が広がっただけで、karasu はどちらも入れていない。lock の依存エッジは plugin 自身の版以外動かない。

### #3745 `marked` 18.1.2 → 18.1.3

CommonMark / GFM の解釈の修正 15 件と、性能の修正 2 件（閉じない強調区切りの二次時間の走査、pedantic html の
バックトラック）。`Object.prototype` と extension 名の分離も入る。app が runtime で使うので、取り込む価値が高い。

### #3747 `@types/node` 26.6.5 → 26.6.6

型定義の patch。差分 755 行は型だけ。

## 結果

全 PR が `pnpm-lock.yaml` を触るので、1 本ずつ直列にマージした。マージの前提は、その PR の head で required check
（Check / Validate / Reference docs / Playwright / verify）が green で、Review tier の最新の run が success であること。
head を `--match-head-commit` で固定してマージした。

1. #3745 → #3740 → #3741 → #3744 → #3746 → #3737 → #3738 → #3747 → #3734 → #3735 → #3748 → #3742 → #3743 → #3736 の順に
   マージした。#3740 / #3734 / #3748 / #3736 はマージの順番が来たときに conflict していたので、`@dependabot rebase` を
   頼み、新しい head の CI を待ってからマージした。#3747 は CI を待っているあいだに Dependabot が自分で rebase し、
   head が変わってマージが拒まれたので、新しい head で確かめ直してマージした
2. 残りの 9 本は conflict せず、rebase なしでマージした。全 14 本をマージした後の main（`2880d11b`）で
   `pnpm install --frozen-lockfile` が通ることを確かめた

**rebase で対象版が 2 件繰り上がった。** #3740 は `lucide-react` 1.66.0 → **1.67.0**、#3748 は `oxfmt` 0.75.0 →
**0.76.0** になった（[ADR-3575](./3575-dependabot-triage-2026-11-02.md) で lucide-react が繰り上がったのと同じ形）。
どちらも同じ手順で確かめ、採用を続けた。

- `lucide-react@1.67.0`: 11-03 06:12 公開で、マージの時点で 7 日を越えている。publisher は GitHub Actions OIDC +
  provenance のまま。lifecycle script と dependencies の変化はゼロ、advisory もゼロ、tarball 全体でパターンの出現数は
  1.66.0 と同数。中身はアイコンの追加と、`chef-hat` などの形の変更
- `oxfmt@0.76.0`: 11-03 10:26 公開で 7 日を越えている。publisher・provenance・lifecycle script・dependencies は
  0.75.0 と同じで、optionalDependencies の platform binding が版を合わせて動くだけ。advisory ゼロ、tarball 全体の
  パターンの出現数も同数。HTML 整形の BREAKING は上記のとおり karasu に当たらない
- rebase した他の 2 本（#3734 / #3736）は、マージのコミットの依存エッジの差分が、トリアージで確かめた集合と同じだった

**Design Doc の手順 1（Review tier を rerun する）は、ほとんどの PR で要らなかった。** 起票直後の rollup に並んでいた
Review tier の `CANCELLED` は、同じ head に対して同時に起動した重複の run で、最新の run は success だった。古い run を
rerun すると新しい run が cancel されるので、rerun したのは最新の run が cancelled だった #3747 の 1 回だけである。
判定は「同じ head の Review tier の run を作成時刻順に並べ、最後の run の conclusion を見る」で行った。

## 却下した案

### `engines.vscode` も 1.144 に上げる差し替え PR で #3739 を入れる

**却下**。ADR-2782 の上限（ExTester の `vscode-max` 1.140.0）を越えるので、`vscode-version-policy.test.ts` と
ExTester の install で落ちる。上限を外すのは ADR-2782 を覆すことで、#3070 で扱う。

### #3739 を保留として open のまま残す

**却下**。ExTester の上限が動くまで CI は red のままで、動いたときには `@types/vscode` もさらに先に進んでいる
（ADR-3069 が書いた競争）。開いておいても入る見込みが無い。

### #3739 に `@dependabot ignore` を設定する

**却下**。floor の扱いは #3070 で決める途中で、ignore は Dependabot の設定に残らない形で次の版も止めてしまう。
#3070 が `.github/dependabot.yml` の `ignore` を提案しているので、止めるならそちらで設定に残す。

## 対象外の観測

- open な alert #106（`minimatch`、`>= 7.0.0, < 11.0.1`）: `@vscode/vsce` 4.1.0 も `minimatch` 10.2.6 に依存したままで、
  今回の bump では解消しない。#104（`glob`）とあわせて `/hane:security-alert` で扱う
