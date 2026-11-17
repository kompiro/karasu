# Dependabot トリアージ 2026-11-16

- **日付**: 2026-11-17
- **ステータス**: 検討中
- **関連**:
  - 対象 Dependabot PR: [#3850](https://github.com/kompiro/karasu/pull/3850) 〜 [#3865](https://github.com/kompiro/karasu/pull/3865)（16 件）と、security update の [#3821](https://github.com/kompiro/karasu/pull/3821)
  - 前回トリアージ: [ADR-3751](../adr/3751-dependabot-triage-2026-11-09.md)
  - VS Code floor の方針: [ADR-2562](../adr/2562-dependabot-triage-2026-08-17.md)（`@types/vscode` と `engines.vscode` を同値に固定）、[ADR-2782](../adr/2782-vscode-floor-capped-by-extester.md)（ExTester の `vscode-max` を上限にする）
  - `@types/vscode` を close した前例: [ADR-3751](../adr/3751-dependabot-triage-2026-11-09.md)・[ADR-3069](../adr/3069-dependabot-triage-2026-10-05.md)、追随方針の見直し: [#3070](https://github.com/kompiro/karasu/issues/3070)
  - SDK の assumptions: [ADR-2671](../adr/2671-dependabot-triage-2026-08-31.md)（`^1.`）
  - 判定語彙: [ADR-2474](../adr/2474-dependabot-replacement-pr-vocabulary.md)

## 背景・課題

2026-11-16（月）21:44–21:50 UTC に週次の Dependabot PR が 16 件起票された（npm 15 件、GitHub Actions 1 件）。
これとは別に、11-15（日）に security update の #3821（`astro` 7.4.5 → 7.4.7）が起票されている。

**security alert が 1 件増えた。** #107（`astro`、GHSA-r3h5-4585-7x3w、medium）で、脆弱範囲は `>= 5.14.3, <= 7.4.6`、
修正版は 7.4.7。`@astrojs/node` の image endpoint が、case-sensitive な filesystem で出力ディレクトリと大文字小文字だけ
違う隣のディレクトリを読めてしまう問題である。karasu の docs-site は静的出力で `@astrojs/node` を使っていないので
当たらないが、宣言 `^7.4.5` が脆弱範囲と交差している。週次の #3856（`astro` 7.4.5 → 7.4.8）が同じ修正を含み、
宣言を `^7.4.8` に上げる。突き合わせの結果は下記「#3856 / #3821 `astro`」に書く。

14 件は CI green。red は 2 件:

- #3852（`@types/vscode` 1.140.0 → 1.145.0）: Validate / Check / ExTester。前回の #3739 と同じ VS Code floor の柵で、
  `scripts/ci/vscode-version-policy.test.ts` が `engines.vscode`（`^1.140.0`）と `@types/vscode`（`^1.145.0`）のずれを止めた
- #3865（`jsdom` 30.1.3 → 31.0.0、major）: Check。`packages/app` の 148 ファイル中 1 ファイル 1 件が落ちた。
  ルートの `test:coverage` は最初の失敗で止まるので、app より後の package（cli / lsp / nest / vscode / docs-site）の
  テストと、Check の後続の step（build、`build:viewer`、`test:pack` など）はこの PR では走っていない
  `PreviewPane.test.tsx` が `style.transform` を文字列 `"translate(0px, 0px) scale(1)"` と比べており、jsdom 31 の新しい
  CSS 実装が `translate(0px) scale(1)` と短く直列化する

rollup に並ぶ「Review tier」の `CANCELLED` は、前回と同じく同じ head に対する重複の run である。14 件すべて、
同じ head の Review tier の run を作成時刻順に並べた最後の run が success だった。rerun は要らない。

## リスク分析の方法

bump 種別を問わず 17 件すべてで、次を確かめた。

- **依存エッジ**: lock の snapshot を peer suffix を落として merge-base（`83121ba6`）と各 PR ヘッドで突き合わせた
  （`security-alert` skill の edges 手順）。加えて `packages:` のキーを `名前@版` で比べ、main の lock に無かった版を
  全部書き出した。直接 bump 15 版、transitive 32 版、platform binding（`@oxfmt/binding-*` などの native binary）が動く。
  main の lock に無い**パッケージ名**が新しく入るのは 3 件:
  - `mri`（#3856 `astro`）: astro 7.4.8 の「CLI 引数の解析を更新」で、`yargs-parser` を `mri` に置き換えた
  - `parse5-parser-stream`（#3865 `jsdom`）: `parse5` と同じ monorepo、同じ publisher（下記）
  - `@bruits/satteri-android-arm64` / `@bruits/satteri-freebsd-x64`（#3856 / #3863）: 既存の `satteri` の platform binding が
    2 つ増えただけ
- **publisher / provenance**: 直接 bump の 15 版と transitive の 32 版を registry で from 版と比べた。GitHub Actions OIDC +
  provenance のものは to 版も同じ。主な repo（`jsdom` / `astro` / `@anthropic-ai/sdk` / `oxfmt`）は provenance の
  workflow が upstream の repo を指すことも attestation を開いて確かめた。provenance なしは従来どおりで、`knip` / `unbash`
  （`webpro`）、`commander`（`abetomo`）、`@types/vscode`（`types`）、`i18next`（`adrai`）、unified 系（`wooorm`）、
  `postcss-selector-parser`（`moox`）、`p-queue`（`sindresorhus`）。変化は 2 件（下記）
- **lifecycle script**: to 版で追加・変更されたものはゼロ。既存の `prepare` を持つのは `jsdom`（`wireit`）、`ci-info` /
  `enhanced-resolve` / `i18next`（`husky`）、`cookie`、`undici`、`@ctrl/tinycolor`、`postcss-selector-parser`、`whatwg-url` で、
  registry install では走らない
- **コード差分**: 44 組の from / to の tarball を `npm pack --ignore-scripts` で取り、`child_process` / `eval(` /
  `new Function` / `process.env` / `fetch(` / `atob(` / `base64` / `fromCharCode` / `spawn(` / `exec(` / `execSync` /
  `writeFileSync` / `homedir` / URL を tarball 全体で数えて比べ、新しく現れる URL のホストも出した。
  - 32 組は全パターン同数で、新しいホストもゼロ
  - 増えた組は該当する追加行を読んだ。`p-queue` の `fetch(` は README と JSDoc の例、`undici` は RFC 9111 のコメントと
    既存の `refetch()`、`playwright-core` の `process.env` はブラウザのデータディレクトリ解決（`XDG_*` / `LOCALAPPDATA`）の
    移動と `PWTEST_*` / `PLAYWRIGHT_*` のテスト用フラグ、`base64` は既存の typed array の直列化の移動、`lucide-react` の
    `base64` は追加アイコンの JSDoc プレビュー（data URI）、`astro` / `@anthropic-ai/sdk` の URL は GitHub issue と docs・
    CHANGELOG のリンク
  - 新しいホストは `jsdom`（WHATWG / W3C / CSS Houdini などの仕様書）、`ci-info`（判定する CI ベンダーの追加）、
    `@ctrl/tinycolor`（w3.org）、`postcss-selector-parser`（`mths.be`、`cssesc` を取り込んだもの）で、どれもコメント中の参照
  - 新しい名前の `mri@1.2.0`（2021 年公開、依存なし）と `parse5-parser-stream@8.1.1`（`parse5` の stream wrapper）は
    中身を開き、該当パターンが README の例だけであることを確かめた
- **既知 advisory**: 上の 47 版と `mri@1.2.0` / `parse5-parser-stream@8.1.1` / `commander@15.1.0` で該当ゼロ（GitHub
  Advisory API の `affects=`）。クエリが効いていることは `astro@7.4.5` で 1 件（#107 の advisory）返ることで確かめた
- **公開からの経過**: すべて起票時点で 7 日を越えている。最も新しいのは `@anthropic-ai/sdk` 1.7.0（11-09 18:56 公開、
  起票まで約 7 日と 3 時間）
- **`pnpm-workspace.yaml` の `overrides:`**: 衝突なし。新しく解決される版のうち override の対象は `vite` 8.3.7
  （`vite@8: ^8.3.3`）と `undici` 7.30.2（`^7.29.1`）で、どちらも floor を満たす
- **docs-site のビルド**: bot PR では「Deploy Docs Preview」の job ごとスキップされ、`astro build` が CI で走らない。
  #3856（astro）と #3863（starlight）の head を detached worktree に取り、`pnpm install --frozen-lockfile` と
  `pnpm --filter @karasu-tools/docs-site... run build` を実行した。どちらも 81 ページを出力して成功。出ている WARN 2 件
  （collection `i18n` が空、`404` の entry が無い）は main の build でも同じく出る

### publisher が変わった `parse5` 8.1.0 → 8.1.1

#3865（jsdom）で transitive に動く。8.1.0 は `43081j`、8.1.1 は `fb55` が publish した。どちらも `parse5` の既存の
maintainer（`fb55` / `43081j` / `rreverser` / `wooorm` / `inikulin`）で、GitHub の release `v8.1.1` も同じ日に `fb55` が
作っている。repository も同じ `inikulin/parse5`。tarball 全体でパターンの出現数は同数だった。**リスクは low と判断する。**

### provenance 付きになった `sisteransi` 1.0.5 → 2.0.0

#3856（astro）で `@clack/prompts` 経由で動く。1.0.5 は 2020 年に `terkelg` が手元から publish した版で、2.0.0
（2026-06-25 公開）は GitHub Actions OIDC + provenance。attestation の workflow は `terkelg/sisteransi` の
`.github/workflows/release.yml`（`refs/tags/v2.0.0`）を指す。差分 37 行で、パターンの出現数は同数。配布経路が
強くなった方向の変化で、**リスクは low と判断する。**

## 一覧

| PR    | 依存                   | from → to         | 種別      | 対象                       | CI      | リスク | 推奨                          |
| ----- | ---------------------- | ----------------- | --------- | -------------------------- | ------- | ------ | ----------------------------- |
| #3850 | `pnpm/action-setup`    | 6.1.0 → 6.1.1     | patch     | GitHub Actions（22 本）    | green   | low    | 採用                          |
| #3851 | `oxfmt`                | 0.76.0 → 0.78.0   | minor     | root（dev）                | green   | low    | 採用                          |
| #3852 | `@types/vscode`        | 1.140.0 → 1.145.0 | minor     | vscode / vscode-e2e（dev） | **red** | low    | **却下（close）**             |
| #3853 | `oxlint`               | 1.90.0 → 1.93.0   | minor     | root（dev）                | green   | low    | 採用                          |
| #3854 | `@anthropic-ai/sdk`    | 1.4.0 → 1.7.0     | minor     | app（runtime）             | green   | low    | 採用                          |
| #3855 | `knip`                 | 6.44.1 → 6.44.2   | patch     | root（dev）                | green   | low    | 採用                          |
| #3856 | `astro`                | 7.4.5 → 7.4.8     | patch     | docs-site（dev）           | green   | low    | 採用（alert #107 を解消）     |
| #3857 | `vite`                 | 8.3.5 → 8.3.7     | patch     | app（dev）                 | green   | low    | 採用                          |
| #3858 | `@vitejs/plugin-react` | 6.2.1 → 6.3.0     | minor     | app（dev）                 | green   | low    | 採用                          |
| #3859 | `@playwright/test`     | 1.64.1 → 1.65.0   | minor     | root / e2e（dev）          | green   | low    | 採用                          |
| #3860 | `lucide-react`         | 1.67.0 → 1.70.0   | minor     | app（runtime）             | green   | low    | 採用                          |
| #3861 | `commander`            | 15.0.0 → 15.1.0   | minor     | cli（runtime）             | green   | low    | 採用                          |
| #3862 | `tailwindcss`          | 4.3.4 → 4.3.5     | patch     | app（dev）                 | green   | low    | 採用（#3864 と対で）          |
| #3863 | `@astrojs/starlight`   | 0.42.8 → 0.42.10  | patch     | docs-site（dev）           | green   | low    | 採用                          |
| #3864 | `@tailwindcss/vite`    | 4.3.4 → 4.3.5     | patch     | app（runtime 宣言）        | green   | low    | 採用（#3862 と対で）          |
| #3865 | `jsdom`                | 30.1.3 → 31.0.0   | **major** | app（dev）                 | **red** | low    | **採用（差し替え PR）**       |
| #3821 | `astro`（security）    | 7.4.5 → 7.4.7     | patch     | docs-site（dev）           | green   | low    | 採用（#3856 で反映、close）   |

## PR ごとの分析

### #3865 `jsdom` 30.1.3 → 31.0.0（差し替え PR での採用を推奨）

供給側の懸念は無い。`jsdom/jsdom` の `publish.yml`（`refs/tags/v31.0.0`）からの provenance 付きで、`engines.node` は
30.1.3 と同じ（`^22.22.2 || ^24.15.0 || >=26.0.0`）。依存は `css-tree` / `@asamuzakjp/*` / `@csstools/*` など 11 名が
消え、`bcp-47` / `bcp-47-match`（既存）と `parse5-parser-stream`（上記）が入る。

31.0.0 の breaking change は 3 つ:

1. canvas の backend が `canvas` から `@napi-rs/canvas` に変わった。karasu はどちらも入れていない
2. CSS の解析・selector の照合・computed style を新しい統合実装に置き換えた。落ちた 1 件はこれ
3. HTML / XML の解析が blocking script で止まるようになった。karasu のテストは `JSDOM` を直接構築せず、vitest の
   jsdom 環境で React を描画するだけなので当たらない（app の他の 147 ファイルは green）

落ちたのは `packages/app/src/components/PreviewPane.test.tsx:974` の 1 行で、ドリルダウンで zoom が初期値に戻ることを
`expect(zoomLayer().style.transform).toBe("translate(0px, 0px) scale(1)")` で確かめている。本番コードは
`style.transform` を読み返さない（`packages/app/src` の非テストコードに読み出しは無い）ので、変わったのはテスト環境の
直列化だけで、アプリの振る舞いではない。

正しい変更は「bump + この assertion を直列化の形に依存しない比較にする」で、bot が作れる diff の形には収まらない。
bot ブランチに人手でコミットを足すと次の recreate で失われる。**#3865 を close し、同じ bump とテストの修正を 1 本の
差し替え PR で入れる**ことを推奨する。判定は採用なので `@dependabot ignore` は設定しない。

bot PR の CI は app のテストの失敗で止まり、後続の package のテストと build の step を走らせていない。`jsdom` を
宣言するのは `packages/app` だけなので影響する見込みは小さいが、それらは差し替え PR の CI で初めて確かめることになる。
差し替え PR の CI が app の 1 件以外で落ちたら、判定を見直す。

**保留を選ばない理由**: 修正はテスト 1 行で、upstream の regression ではなく仕様に沿った直列化の変更である（ADR-2983 で
30.1.0 を待ったのは upstream の regression だったから）。待っても bot の diff は直らない。

### #3852 `@types/vscode` 1.140.0 → 1.145.0（却下を推奨）

供給側の懸念は無い（DefinitelyTyped の `types` account、差分は型定義だけ）。止まっている理由は前回の #3739 と同じ:

- ADR-2562 は `@types/vscode` と `engines.vscode` を同値に保つ。Dependabot は `engines.vscode` を書き換えないので、
  bot PR は構造的に片側だけの移動になる
- `engines.vscode` も上げる差し替え PR は ADR-2782 の上限に当たる。`vscode-extension-tester` の npm の最新はまだ
  8.28.1（10-05 公開）で、`vscode-max` は 1.140.0。floor 1.140 はすでに上限にいる

ADR-3751 と同じ形で、**bot PR を close する**。`@dependabot ignore` は設定しない（floor の扱いは #3070 で決める途中）。

### #3856 `astro` 7.4.5 → 7.4.8 / #3821 `astro` 7.4.5 → 7.4.7（security）

7.4.6 は修正の束（i18n の fallback、`astro check` が `@astrojs/check` 不在で exit 0 になっていたのを 1 に、font と
public ファイルの更新時刻の保持など）、7.4.7 は alert #107 の修正、7.4.8 は CLI 引数の解析の更新（`yargs-parser` →
`mri`）。docs-site の scripts は `astro dev` / `astro build` / `astro preview` を引数なしで呼ぶだけ。transitive では
`rolldown` 1.2.18、`vite` 8.3.7、`undici` 7.30.2、`@clack/prompts` 1.9.0、`p-queue` 10.0.0（major。ESM 化と `EventTarget`
への移行で、`p-timeout` / `eventemitter3` が依存から消える）などが動く。上記のとおり docs-site のビルドを手元で確かめた。

alert #107 の突き合わせ（`.claude/rules/dependabot.md`「Security alert 時は advisory の脆弱範囲を override / 宣言レンジと
突き合わせる」）:

| 確認 | 結果 |
| --- | --- |
| advisory の脆弱範囲 | `>= 5.14.3, <= 7.4.6`（修正版 7.4.7） |
| `pnpm-workspace.yaml` の `overrides:` | `astro` の行は無い |
| 宣言（`packages/*/package.json`） | `packages/docs-site` の `"astro": "^7.4.5"` だけ。脆弱範囲と交差する |
| #3856 の head | 宣言が `^7.4.8` に上がり、交差しなくなる。lock の `astro@` は 7.4.8 の 1 版だけ（7.4.5 は 0 件） |

#3856 が #3821 の修正を包むので、**#3821 の判定は採用とし、反映は #3856 のマージで行う**。#3821 自体は close する
（#3856 のマージで Dependabot が自分で閉じなければ手で閉じる）。判定が採用なので `@dependabot ignore` は設定しない。

#3821 をそのままマージしない理由はもう 1 つある。security update は cooldown を参照しない
（`.claude/rules/dependabot.md`「Security update の即時起票」）ので、#3821 の lock は `rolldown` 1.3.2 / `vite` 8.3.8
（どちらも 11-11 公開、起票の約 4 日前）を連れてくる。7 日の cooldown が止めている版で、今回のリスク分析でも確かめていない。

### #3850 `pnpm/action-setup` 6.1.0 → 6.1.1

22 本の workflow の `uses:` と `.github/workflows/actions.lock` の pin を書き換える。v6.1.0…v6.1.1 は 5 commit で、
pnpm 11 の bootstrap を 11.25.0 → 11.28.10 に更新、cache の保存先が無いときに保存をスキップ、テストと README。
`v6.1.1` は署名検証済みの annotated tag で、指す commit `73e46992` は `actions.lock` の pin と一致する。bootstrap の
`pnpm@11.28.10` の integrity は registry と一致し、GitHub Actions OIDC + provenance で公開されている（10-30）。karasu の
`packageManager` は `pnpm@11.20.0` で、bootstrap の版は action の内部で使うだけ。CI 全体がこの action で green。

### #3851 `oxfmt` 0.76.0 → 0.78.0 / #3853 `oxlint` 1.90.0 → 1.93.0

どちらも oxc の monorepo から provenance 付き。oxfmt 0.77.0 の BREAKING は `parser:vue` のファイルを新しい formatter で
整形するもので、karasu に `.vue` ファイルは無い。0.78.0 は CSS / Less / JSDoc / TOML などの修正。`format:check` を含む
Check が green。oxlint は規則の修正と、`--fix` で使われていない `oxlint-disable` を消す機能の追加。Check（lint）が green。

### #3854 `@anthropic-ai/sdk` 1.4.0 → 1.7.0

API の型の追加（モデル ID、webhook event、usage report のフィルタ、error code など）と、失敗したレスポンスの本文を
debug log に含める修正。「一部の error detail の型を削除」があるが、karasu の typecheck は green。karasu が使う Messages
API に変更は無い。ADR-2671 の assumptions は `^1.` なので 1.7.0 で成立し、Validate が green。transitive は
`@babel/runtime` 7.29.13（provenance 付き、差分 3 行）だけ。

### #3855 `knip` 6.44.1 → 6.44.2

plugin の拡張（Babel / Stylelint の extends、Vitest の custom coverage provider など）と修正。`oxc-parser` 0.156.0、`unbash`
6.0.4（同じ作者）が動く。CI の knip が green。

### #3857 `vite` 8.3.5 → 8.3.7 / #3858 `@vitejs/plugin-react` 6.2.1 → 6.3.0

vite は修正だけ（rolldown 1.2.18 への更新、build の CSS 依存収集、bundled-dev、optimizer など）。override の
`vite@8: ^8.3.3` を満たす。plugin-react 6.3.0 は `reactCompilerPreset` を worker thread に送れるようにする変更で、
karasu は React Compiler を使っていない。lock で動くのは `@rolldown/pluginutils` 1.1.0 だけ。app の build・E2E が green。

### #3859 `@playwright/test` 1.64.1 → 1.65.0

Bun での実行、`failures` reporter、`-exclusive-` の test lock などの追加。breaking に当たりうる変更は
`test.skip()` / `test.fixme()` / `test.fail()` / `test.slow()` が説明の文字列だけを受け取るようになった点だが、karasu の
spec はこれらを呼んでいない（`packages/e2e/README.md` の文中に `test.fixme(...)` と `test.skip` が出てくるだけ）。ブラウザの版も上がるが、
Playwright（required）が green。

### #3860 `lucide-react` 1.67.0 → 1.70.0

アイコンの追加と、1.68.0 で `*-warning` / `*-alert` を `*-exclamation-point` に改名。karasu が `lucide-react` から import
している名前に `Alert` / `Warning` を含むものは無く、typecheck も green。

### #3861 `commander` 15.0.0 → 15.1.0

修正（負数引数の大文字 `E`、Unicode の variadic placeholder、`--inspect` の port、help option の group など）と、
`storeOptionsAsProperties()` / `combineFlagAndOptionalValue()` の deprecation。cli の vitest が green。tarball 全体で
パターンの出現数は同数で、新しいホストは RFC の参照 1 件。

### #3862 `tailwindcss` / #3864 `@tailwindcss/vite` 4.3.4 → 4.3.5

同じリリースの 2 パッケージで、`@tailwindcss/vite` は `tailwindcss` を exact で依存する。前回と同じく **2 本を続けて
マージする**（#3864 → rebase → #3862 の順）。4.3.5 は修正だけ（`color-mix()` の crash、wasm binding の hang、CSS 中の
`<!--` の扱いなど）。`@tailwindcss/node` / `@tailwindcss/oxide` 4.3.5 と `enhanced-resolve` 5.26.1 が動く。app の build・
E2E が green。

### #3863 `@astrojs/starlight` 0.42.8 → 0.42.10

修正（search 入力の contrast、CSP 下で search が読み込まれない問題、query string 付きの sidebar link など）と、内部の YAML
parser の置き換え（`js-yaml` → `yaml`、install サイズ削減）。transitive に `@astrojs/mdx` 8.1.3、`i18next` 26.7.2、
`satteri` 0.11.7 などが動く。上記のとおり docs-site のビルドを手元で確かめた。#3856 と同じく `packages/docs-site` と lock を
触るので、先にマージした方の後でもう一方は rebase になる。

## 対象外の観測

- open な alert #104（`glob`）と #106（`minimatch`）は今回の bump では解消しない。引き続き `/hane:security-alert` で扱う

## 現時点の方針

**15 件を採用し、#3852 を却下（close）する。** 採用のうち 14 件は bot PR をそのままマージし、#3865 だけ差し替え PR で
入れる。security update の #3821 も判定は採用で、#3856 のマージで反映して bot PR は close する。

マージの手順:

1. lock を共有するので 1 本ずつ、head を `--match-head-commit` で固定してマージする。コンフリクトしたら
   `@dependabot rebase` を頼み、新しい head の CI を待つ。rebase で対象版が繰り上がったら、同じ手順で確かめ直す
2. #3864 と #3862 は続けてマージする
3. #3856 をマージしたら alert #107 が閉じたことと、#3821 が閉じたこと（閉じていなければ手で close）を確かめる
4. #3852 は ADR-3751 と #3070 を引いてコメントし、close する（ignore は設定しない）
5. #3865 は close し、`jsdom` 31.0.0 の bump と `PreviewPane.test.tsx` の assertion の修正を 1 本の差し替え PR で出す
6. 結果を ADR に昇格させ、本 Design Doc を削除する
