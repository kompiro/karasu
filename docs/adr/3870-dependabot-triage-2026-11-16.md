---
id: ADR-3870
title: Dependabot トリアージ 2026-11-16：16 件を採用し jsdom 31 は差し替え PR で入れ、同じ base の lock を続けてマージして壊した main を直す
status: accepted
date: 2026-11-18
topic: build
related_to:
  - ADR-3751
  - ADR-3069
  - ADR-2983
  - ADR-2562
  - ADR-2782
  - ADR-2671
  - ADR-2474
  - ADR-1694
  - ADR-2985
scope:
  packages: [app, cli, docs-site, e2e, vscode, vscode-e2e]
  concerns: [ci, dependencies, security]
assumptions:
  # jsdom と unifont が使う undici 8 系に、advisory の外の floor を caret で置く（#3874）。
  # 版は日常の保守で動くので major で止める（ADR-2628）。
  - "grep: pnpm-workspace.yaml :: undici@8: \\^8\\."
---

# ADR-3870: Dependabot トリアージ 2026-11-16：16 件を採用し jsdom 31 は差し替え PR で入れ、同じ base の lock を続けてマージして壊した main を直す

- **日付**: 2026-11-18
- **ステータス**: 決定済み
- **関連**:
  - Design Doc PR: [#3870](https://github.com/kompiro/karasu/pull/3870)（本 ADR に昇格し削除）
  - 対象 Dependabot PR: [#3850](https://github.com/kompiro/karasu/pull/3850) 〜 [#3865](https://github.com/kompiro/karasu/pull/3865)（16 件）と、security update の [#3821](https://github.com/kompiro/karasu/pull/3821)
  - jsdom の差し替え PR: [#3874](https://github.com/kompiro/karasu/pull/3874)、main の lock の修正: [#3871](https://github.com/kompiro/karasu/pull/3871)
  - 前回トリアージ: [ADR-3751](./3751-dependabot-triage-2026-11-09.md)
  - `@types/vscode` を close した前例: ADR-3751・[ADR-3069](./3069-dependabot-triage-2026-10-05.md)
  - VS Code floor の方針: [ADR-2562](./2562-dependabot-triage-2026-08-17.md)、[ADR-2782](./2782-vscode-floor-capped-by-extester.md)、追随方針の見直し: [#3070](https://github.com/kompiro/karasu/issues/3070)
  - jsdom を待った前例: [ADR-2983](./2983-dependabot-triage-2026-09-29.md)
  - SDK の assumptions: [ADR-2671](./2671-dependabot-triage-2026-08-31.md)（`^1.`）
  - 判定語彙: [ADR-2474](./2474-dependabot-replacement-pr-vocabulary.md)
  - #3874 で一緒に直した問題: [#3872](https://github.com/kompiro/karasu/issues/3872)（`undici` の override、[ADR-1694](./1694-dependabot-security-2026-06-19.md)・[ADR-2985](./2985-dependabot-security-2026-09-29.md)）、[#3873](https://github.com/kompiro/karasu/issues/3873)（#3178 のテストの pan）

## 決定

**週次の 15 件と security update の #3821 の計 16 件を採用し、#3852（`@types/vscode` 1.145.0）を却下して close した。** 週次のうち 14 件は bot PR をそのままマージし、
#3865（`jsdom` 31.0.0）は差し替え PR #3874 で入れた。#3874 では、kompiro の判断で、レビューで見つけた 2 件（`undici` の override が
jsdom の `undici ^8` を 7 系に押し下げていたこと、#3178 のテストが pan を確かめていなかったこと）も一緒に直した。#3821 は #3856 のマージで反映して
bot PR は close した。#3852・#3865・#3821 のどれにも `@dependabot ignore` は設定していない。

| PR    | 依存                   | from → to          | 種別      | 対象                       | リスク | 判断 | 反映                                   |
| ----- | ---------------------- | ------------------ | --------- | -------------------------- | ------ | ---- | -------------------------------------- |
| #3850 | `pnpm/action-setup`    | 6.1.0 → 6.1.1      | patch     | GitHub Actions（21 本）    | low    | 採用 | そのままマージ                         |
| #3854 | `@anthropic-ai/sdk`    | 1.4.0 → 1.7.0      | minor     | app（runtime）             | low    | 採用 | そのままマージ                         |
| #3860 | `lucide-react`         | 1.67.0 → 1.70.0    | minor     | app（runtime）             | low    | 採用 | そのままマージ                         |
| #3861 | `commander`            | 15.0.0 → 15.1.0    | minor     | cli（runtime）             | low    | 採用 | そのままマージ                         |
| #3859 | `@playwright/test`     | 1.64.1 → 1.65.0    | minor     | root / e2e（dev）          | low    | 採用 | そのままマージ                         |
| #3858 | `@vitejs/plugin-react` | 6.2.1 → 6.3.0      | minor     | app（dev）                 | low    | 採用 | そのままマージ                         |
| #3864 | `@tailwindcss/vite`    | 4.3.4 → 4.3.5      | patch     | app（runtime 宣言）        | low    | 採用 | そのままマージ（#3862 と続けて）       |
| #3862 | `tailwindcss`          | 4.3.4 → 4.3.5      | patch     | app（dev）                 | low    | 採用 | そのままマージ                         |
| #3853 | `oxlint`               | 1.90.0 → 1.93.0    | minor     | root（dev）                | low    | 採用 | そのままマージ                         |
| #3855 | `knip`                 | 6.44.1 → 6.44.2    | patch     | root（dev）                | low    | 採用 | そのままマージ                         |
| #3856 | `astro`                | 7.4.5 → 7.4.8      | patch     | docs-site（dev）           | low    | 採用 | そのままマージ（alert #107 を解消）    |
| #3857 | `vite`                 | 8.3.5 → 8.3.7      | patch     | app（dev）                 | low    | 採用 | rebase 後にマージ                      |
| #3851 | `oxfmt`                | 0.76.0 → 0.78.0    | minor     | root（dev）                | low    | 採用 | rebase 後にマージ（lock を壊した）     |
| #3863 | `@astrojs/starlight`   | 0.42.8 → 0.42.10   | patch     | docs-site（dev）           | low    | 採用 | rebase 後にマージ（lock を壊した）     |
| #3865 | `jsdom`                | 30.1.3 → 31.0.0    | **major** | app（dev）                 | low    | 採用 | 差し替え PR #3874                      |
| #3821 | `astro`（security）    | 7.4.5 → 7.4.7      | patch     | docs-site（dev）           | low    | 採用 | #3856 で反映、bot PR は close          |
| #3852 | `@types/vscode`        | 1.140.0 → 1.145.0  | minor     | vscode / vscode-e2e（dev） | low    | 却下 | close（ignore なし）                   |

表はマージした順に並べた。

## 背景

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
  テストと、Check の後続の step（build、`build:viewer`、`test:pack` など）はこの PR では走っていない。
  `PreviewPane.test.tsx` が `style.transform` を文字列 `"translate(0px, 0px) scale(1)"` と比べており、jsdom 31 の新しい
  CSS 実装が `translate(0px) scale(1)` と短く直列化する

rollup に並ぶ「Review tier」の `CANCELLED` は、前回と同じく同じ head に対する重複の run である。14 件すべて、
同じ head の Review tier の run を作成時刻順に並べた最後の run が success だった。rerun は要らなかった。

### リスク分析の方法

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

#### publisher が変わった `parse5` 8.1.0 → 8.1.1

#3865（jsdom）で transitive に動く。8.1.0 は `43081j`、8.1.1 は `fb55` が publish した。どちらも `parse5` の既存の
maintainer（`fb55` / `43081j` / `rreverser` / `wooorm` / `inikulin`）で、GitHub の release `v8.1.1` も同じ日に `fb55` が
作っている。repository も同じ `inikulin/parse5`。tarball 全体でパターンの出現数は同数だった。**リスクは low と判断した。**

#### provenance 付きになった `sisteransi` 1.0.5 → 2.0.0

#3856（astro）で `@clack/prompts` 経由で動く。1.0.5 は 2020 年に `terkelg` が手元から publish した版で、2.0.0
（2026-06-25 公開）は GitHub Actions OIDC + provenance。attestation の workflow は `terkelg/sisteransi` の
`.github/workflows/release.yml`（`refs/tags/v2.0.0`）を指す。差分 37 行で、パターンの出現数は同数。配布経路が
強くなった方向の変化で、**リスクは low と判断した。**

## 理由（PR ごとの分析）

### #3865 `jsdom` 30.1.3 → 31.0.0（差し替え PR で採用）

供給側の懸念は無い。`jsdom/jsdom` の `publish.yml`（`refs/tags/v31.0.0`）からの provenance 付きで、`engines.node` は
30.1.3 と同じ（`^22.22.2 || ^24.15.0 || >=26.0.0`）。jsdom の依存から `css-tree` / `@asamuzakjp/*` / `@csstools/*` などが外れ、lock からは
`@asamuzakjp/*`・`@csstools/*`・`@bramus/specificity`・`bidi-js`・`require-from-string` の 11 名が消え（`css-tree` は unifont が使うので残る）、`bcp-47` / `bcp-47-match`（既存）と `parse5-parser-stream`（上記）が入る。

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
差し替え PR で入れた**（#3874）。判定は採用なので `@dependabot ignore` は設定しない。

bot PR の CI は app のテストの失敗で止まり、後続の package のテストと build の step を走らせていない。`jsdom` を
宣言するのは `packages/app` だけなので影響する見込みは小さいが、それらは差し替え PR の CI で初めて確かめた（後述「結果」）。

**保留を選ばない理由**: 修正はテスト 1 行で、upstream の regression ではなく仕様に沿った直列化の変更である（ADR-2983 で
30.1.0 を待ったのは upstream の regression だったから）。待っても bot の diff は直らない。

### #3852 `@types/vscode` 1.140.0 → 1.145.0（却下）

供給側の懸念は無い（DefinitelyTyped の `types` account、差分は型定義だけ）。止まっている理由は前回の #3739 と同じ:

- ADR-2562 は `@types/vscode` と `engines.vscode` を同値に保つ。Dependabot は `engines.vscode` を書き換えないので、
  bot PR は構造的に片側だけの移動になる
- `engines.vscode` も上げる差し替え PR は ADR-2782 の上限に当たる。`vscode-extension-tester` の npm の最新はまだ
  8.28.1（10-05 公開）で、`vscode-max` は 1.140.0。floor 1.140 はすでに上限にいる

ADR-3751 と同じ形で、**bot PR を close した**。`@dependabot ignore` は設定しない（floor の扱いは #3070 で決める途中）。

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

#3856 が #3821 の修正を包むので、**#3821 の判定は採用とし、反映は #3856 のマージで行った**。#3821 自体は close した
（#3856 のマージの後も Dependabot が閉じなかったので、手で閉じた）。判定が採用なので `@dependabot ignore` は設定しない。

#3821 をそのままマージしない理由はもう 1 つある。security update は cooldown を参照しない
（`.claude/rules/dependabot.md`「Security update の即時起票」）ので、#3821 の lock は `rolldown` 1.3.2 / `vite` 8.3.8
（どちらも 11-11 公開、起票の約 4 日前）を連れてくる。7 日の cooldown が止めている版で、今回のリスク分析でも確かめていない。

### #3850 `pnpm/action-setup` 6.1.0 → 6.1.1

21 本の workflow の `uses:` と `.github/workflows/actions.lock` の pin を書き換える。v6.1.0…v6.1.1 は 5 commit で、
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
マージした**（#3864 → #3862 の順。今回は rebase なしで続けて入った）。4.3.5 は修正だけ（`color-mix()` の crash、wasm binding の hang、CSS 中の
`<!--` の扱いなど）。`@tailwindcss/node` / `@tailwindcss/oxide` 4.3.5 と `enhanced-resolve` 5.26.1 が動く。app の build・
E2E が green。

### #3863 `@astrojs/starlight` 0.42.8 → 0.42.10

修正（search 入力の contrast、CSP 下で search が読み込まれない問題、query string 付きの sidebar link など）と、内部の YAML
parser の置き換え（`js-yaml` → `yaml`、install サイズ削減）。transitive に `@astrojs/mdx` 8.1.3、`i18next` 26.7.2、
`satteri` 0.11.7 などが動く。上記のとおり docs-site のビルドを手元で確かめた。rebase で transitive の版が繰り上がった（後述「結果」）。

## 結果

全 PR が `pnpm-lock.yaml` を触るので 1 本ずつマージした。マージの前提は、その PR の head で required check が green、
Review tier の最新の run が success、GitHub の mergeable が `MERGEABLE` であることで、head は `--match-head-commit` で
固定した。

1. #3850 → #3854 → #3860 → #3861 → #3859 → #3858 → #3864 → #3862 → #3853 → #3855 → #3856 の 11 本は、順番が来たときに
   conflict が無く、rebase なしでマージした
2. 同じ順番で回したとき、#3857・#3851・#3863 の 3 本は conflict していた。3 本に同時に `@dependabot rebase` を頼み、
   3 本とも 3208cd27（#3856 のマージ）の上に rebase された。新しい head の CI を待って #3857 → #3851 → #3863 の順に
   マージした
3. #3856 のマージで alert #107 は fixed になった。#3821 は Dependabot が閉じなかったので、コメントを添えて手で close した

**rebase で #3863 の transitive の版が 3 つ繰り上がった。** `@astrojs/internal-helpers` 0.13.1 → 0.13.2、
`@astrojs/markdown-satteri` 0.4.7 → 0.4.8、`@astrojs/mdx` 8.1.3 → 8.1.4 で、どれも 11-10 20:09–20:11 公開。マージの時点で
7 日を越えており、publisher・provenance・dependencies・lifecycle script は前の版と同じ、advisory ゼロ、tarball 全体の
パターンの出現数も同数だった。bot PR では docs-site のビルドが走らないので、rebase 後の head で手元のビルドをやり直した
（81 ページ、WARN は main と同じ 2 件）。

### 同じ base の 3 本を続けてマージして、main の lock を壊した

#3857・#3851・#3863 は同じ 3208cd27 の上にあり、3 本とも vite 8.3.7 用の同じ snapshot（`@vitest/mocker@5.1.0(vite@8.3.7…)`
と `vitest@5.1.0(…)(vite@8.3.7…)`）を lock に足していた。#3857 をマージした後、#3851 と #3863 の squash は行の位置がずれた
同じ block をもう一度挿入し、git の行単位のマージでは conflict にならなかった。GitHub の mergeable も `MERGEABLE` のままだった。

結果、main（54564883 から 712e177d）の lock は 2 つの key を 3 回ずつ持ち、`pnpm install --frozen-lockfile` が
`ERR_PNPM_BROKEN_LOCKFILE: duplicated mapping key` で落ちた。main の Pages の build が 712e177d で落ちて表に出た。

#3871 で、残す側と完全に同じ内容の重複 block だけを消して直した（66 行）。直した lock で frozen install が通り、
`pnpm install --lockfile-only` で解決し直しても lock が動かないこと（pnpm が自分で書く形と一致すること）を確かめた。

**次のトリアージから、lock を触る bot PR は、PR の merge-base が今の `origin/main` と同じときだけマージする。** 手元の
`origin/main` は fetch しないと動かないので、比べる直前に毎回 `git fetch origin main` する（GitHub でマージしても手元の ref は
古いままで、古い base と比べると同じ base の PR が通ってしまう）。違えば、mergeable が `MERGEABLE` でも `@dependabot rebase` を頼む。バッチを入れ終えたら、main で
`pnpm install --frozen-lockfile --lockfile-only` が通ることを確かめる。前回（ADR-3751）は 9 本を rebase なしで続けて
マージして壊れなかったが、それは同じ snapshot を足す PR が重ならなかっただけである。

### jsdom 31 の差し替え PR #3874

`packages/app/package.json` の宣言を `^31.0.0` にし、`PreviewPane.test.tsx` の #3178 の assertion を、直列化の 2 つの形
（`translate(0px, 0px) scale(1)` と `translate(0px) scale(1)`）を両方受け入れる先頭・末尾固定の正規表現にした。0 以外の
translate や 1 以外の scale は通らない。

**lock は 31.0.0 に留めた。** `^31.0.0` をそのまま解決すると 11-13 公開の 31.0.1 になり、7 日の cooldown の内側に入る。
トリアージで確かめた版も 31.0.0 である。宣言を一度 `"31.0.0"` にして `--lockfile-only` で解決し、`^31.0.0` に戻してもう一度
解決すると、ロック済みの 31.0.0 は範囲を満たすので動かない。main の lock と比べて新しく入る版は `jsdom@31.0.0`・
`parse5@8.1.1`・`parse5-parser-stream@8.1.1`・`whatwg-url@17.3.0` の 4 つだけで、jsdom 30 の CSS 系の依存
（`@asamuzakjp/*`・`@csstools/*`・`@bramus/specificity`・`bidi-js`・`require-from-string`）が消える。

#3874 の CI では、bot PR で走らなかった後続の package のテストと build の step も green だった。

#### `undici` の override を major ごとに分けた（#3872）

`pnpm-workspace.yaml` の無印の `undici: ^7.29.1` は tree のすべての `undici` に効き、利用元の jsdom 31（`^8.12.3`）と
unifont（`^8.0.0`）をどちらも 7.30.2 に押し下げていた（jsdom 30 の時点から。ADR-2985 はこの状態を承知のうえで key の形の
変更を範囲外にしていた）。ADR-1694 が無印 key を選んだ前提「tree に major 7 しか無い」が崩れていた。

override の役目は脆弱な `undici` を tree に入れないことなので、それを保ったまま key を major ごとに分けた。

- `undici@7: ^7.30.1`: 前の floor `^7.29.1` は、7.30.1 で直った 8 件の advisory（GHSA-4w7w-5xrc-9h26 など）の範囲の
  内側にあった。patched 版まで上げた。いま 7 系を求める依存は無いが、戻ってきたときの floor として残す
- `undici@8: ^8.12.2`: 8 系も同じ 8 件の advisory が 8.12.2 で直っている

両方の利用元は `undici@8.12.4` に解決した。11-05 公開で 7 日の cooldown の外、`nodejs/undici` の release workflow からの
OIDC + provenance、advisory ゼロ、lifecycle script は前と同じ `prepare` だけ。8.12.3 との tarball の差分も cache の
`refetch()` の修正と参照コメントだけだった。ADR-2985 の assumption は `undici@7` の key を grep するように frontmatter だけ
直し、本 ADR の assumption で `undici@8` の floor を守る。

限界: どちらの key も、将来 undici 6 以下を求める依存には効かない（無印 key は全部を 7 系へ寄せていた）。いま該当する
依存は無く、入ってきたら Dependabot alert が出る。

#### #3178 のテストで pan も確かめる（#3873）

wheel は scale だけを変えるので、zoom だけのテストでは assertion の translate 側に 0 以外の値が一度も現れていなかった。
(50, 30) だけ pan してから zoom し、同じ図の編集では `translate(50px, 30px) scale(0.9)` が残り、別の図に移ると両方が戻る
ことを確かめる形にした。リセットで scale だけを戻し pan を持ち越す変異を入れると、テストが落ちることも確かめた。

main と比べて新しく入る版は `jsdom@31.0.0`・`parse5@8.1.1`・`parse5-parser-stream@8.1.1`・`whatwg-url@17.3.0`・
`undici@8.12.4` で、`undici@7.30.2` と `whatwg-url@17.2.0` は tree から消えた。手元で `packages/app` は 151 ファイル・
2109 件すべて通り、docs-site のビルド（unifont を使う）も 81 ページを出力した。

## 却下した案

### lock を直すとき、`--config.minimum-release-age` で jsdom を 31.0.0 に留める

**却下**。7 日の release age を 1 回の解決にかけると、jsdom だけでなく、マージしたばかりの他の依存（starlight 系の
transitive、vite、rolldown）まで公開 7 日未満として古い版に戻した。差し替え PR の差分が jsdom の外に広がるので使わない。

### `undici` の override を消す

**却下**。いま 7 系の利用元は無いが、override は ADR-1694 / ADR-2985 で security alert に対して置いた floor である。
消すと、8 系の利用元が `^8.0.0` のような広い範囲のまま脆弱版に解決されうる。major ごとに分けて floor を残した。

### #3874 で parse5 を 1 版にそろえる

**却下**。bot PR #3865 の lock では jsdom 31.0.0 が自分では `parse5` 8.1.0 を、`parse5-parser-stream` 経由で 8.1.1 を
読み込んでいた。#3874 の lock では jsdom 側は 8.1.1 にそろい、8.1.0 を使うのは `@vscode/vsce` だけになった。
そろえると vsce の `parse5` も動き、差分が jsdom の外に出る。2 つは patch 違いで害は無い。

### jsdom 31 を upstream の修正まで保留する

**却下**。ADR-2983 で 30.1.0 を待ったのは upstream の regression だったからで、今回は仕様に沿った直列化の変更であり、
待っても bot の diff は直らない。

### #3852 を `engines.vscode` も上げる差し替え PR で入れる / open のまま残す / ignore を設定する

**却下**。ADR-3751 と同じ理由（ExTester の `vscode-max` 1.140.0 を越えられない、開いておいても入る見込みが無い、
floor の扱いは #3070 で決める途中）。

## 対象外の観測

- open な alert #104（`glob`）と #106（`minimatch`）は今回の bump では解消しない。引き続き `/hane:security-alert` で扱う
