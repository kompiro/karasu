---
id: ADR-3915
title: Dependabot トリアージ 2026-11-23：16 件を採用し Babel 8 と dompurify は差し替え PR で入れ、rebase で版が繰り上がった 3 本は分析し直してマージする
status: accepted
date: 2026-11-26
topic: build
related_to:
  - ADR-3870
  - ADR-3751
  - ADR-3069
  - ADR-2562
  - ADR-2782
  - ADR-2115
  - ADR-2404
  - ADR-3002
  - ADR-2671
  - ADR-2474
scope:
  packages: [app, docs-site, e2e, vscode, vscode-e2e]
  concerns: [ci, dependencies, security]
assumptions:
  # Pages Functions の import の柵は Babel 8 の AST（`TSImportType.source`）を読む（#3916）。
  # 版は日常の保守で動くので major で止める（ADR-2628）。
  - "grep: package.json :: \"@babel/parser\": \"\\^8\\."
---

# ADR-3915: Dependabot トリアージ 2026-11-23：16 件を採用し Babel 8 と dompurify は差し替え PR で入れ、rebase で版が繰り上がった 3 本は分析し直してマージする

- **日付**: 2026-11-26
- **ステータス**: 決定済み
- **関連**:
  - Design Doc PR: [#3915](https://github.com/kompiro/karasu/pull/3915)（本 ADR に昇格し削除）
  - 対象 Dependabot PR: [#3897](https://github.com/kompiro/karasu/pull/3897) 〜 [#3913](https://github.com/kompiro/karasu/pull/3913)（17 件）
  - 差し替え PR: [#3916](https://github.com/kompiro/karasu/pull/3916)（`@babel/parser` 8）、[#3917](https://github.com/kompiro/karasu/pull/3917)（`dompurify` 3.4.18 と override の floor）
  - 前回トリアージ: [ADR-3870](./3870-dependabot-triage-2026-11-16.md)（同じ base の lock を続けてマージして main の lock を壊した記録を含む）
  - VS Code floor の方針: [ADR-2562](./2562-dependabot-triage-2026-08-17.md)（`@types/vscode` と `engines.vscode` を同値に固定）、[ADR-2782](./2782-vscode-floor-capped-by-extester.md)（ExTester の `vscode-max` を上限にする）、追随方針の見直し: [#3070](https://github.com/kompiro/karasu/issues/3070)
  - `@types/vscode` を close した前例: ADR-3870・[ADR-3751](./3751-dependabot-triage-2026-11-09.md)・[ADR-3069](./3069-dependabot-triage-2026-10-05.md)
  - `@babel/parser` を使う import の柵: [#3799](https://github.com/kompiro/karasu/issues/3799)（PR #3824）
  - `dompurify` の override の経緯: [ADR-2115](./2115-dependabot-security-2026-07-22-second-batch.md)、[ADR-2404](./2404-dependabot-security-2026-08-08.md)、[ADR-3002](./3002-dependabot-security-2026-09-30.md)
  - SDK の assumptions: [ADR-2671](./2671-dependabot-triage-2026-08-31.md)（`^1.`）
  - 判定語彙: [ADR-2474](./2474-dependabot-replacement-pr-vocabulary.md)

## 決定

**17 件のうち 16 件を採用し、#3900（`@types/vscode` 1.146.0）を却下して close した。** 採用のうち 14 件は bot PR を
そのままマージし、#3912（`@babel/parser` 8.1.2）は柵の修正と合わせた差し替え PR #3916 で、#3899（`dompurify` 3.4.18）は
override の floor も上げる差し替え PR #3917 で入れた。#3899・#3900・#3912 のどれにも `@dependabot ignore` は設定していない。

マージの途中で Dependabot の rebase が 3 本（#3903・#3909・#3913）の版を繰り上げた。繰り上がった版はトリアージと同じ手順で
分析し直し、kompiro の判断でそのままマージした（下記「結果」）。

| PR    | 依存                                | from → to           | 種別      | 対象                       | リスク | 判断 | 反映                                       |
| ----- | ----------------------------------- | ------------------- | --------- | -------------------------- | ------ | ---- | ------------------------------------------ |
| #3897 | `@kompiro/adr-tools`                | 0.0.13 → 0.0.14     | patch     | root（dev）                | low    | 採用 | そのままマージ                             |
| #3898 | `jsdom`                             | 31.0.0 → 31.0.1     | patch     | app（dev）                 | low    | 採用 | rebase 後にマージ                          |
| #3901 | `@anthropic-ai/sdk`                 | 1.7.0 → 1.9.0       | minor     | app（runtime）             | low    | 採用 | rebase 後にマージ                          |
| #3902 | `@playwright/test`                  | 1.65.0 → 1.65.1     | patch     | root / e2e（dev）          | low    | 採用 | rebase 後にマージ                          |
| #3905 | `knip`                              | 6.44.2 → 6.45.1     | minor     | root（dev）                | low    | 採用 | rebase 後にマージ                          |
| #3907 | `@testing-library/user-event`       | 14.6.8 → 14.6.12    | patch     | app（dev）                 | low    | 採用 | rebase 後にマージ                          |
| #3908 | `oxlint`                            | 1.93.0 → 1.94.0     | minor     | root（dev）                | low    | 採用 | rebase 後にマージ                          |
| #3911 | `oxfmt`                             | 0.78.0 → 0.79.0     | minor     | root（dev）                | low    | 採用 | rebase 後にマージ                          |
| #3910 | `marked`                            | 18.1.3 → 18.2.1     | minor     | app（runtime）             | low    | 採用 | rebase 後にマージ                          |
| #3904 | `@vscode/vsce`                      | 4.1.0 → 4.1.1       | patch     | vscode / vscode-e2e（dev） | low    | 採用 | rebase 後にマージ                          |
| #3906 | `vite`                              | 8.3.7 → 8.3.8       | patch     | app（dev）                 | low    | 採用 | rebase 後にマージ                          |
| #3903 | `astro`                             | 7.4.8 → 7.4.12      | patch     | docs-site（dev）           | low    | 採用 | rebase 後にマージ（`vitefu` が繰り上がり） |
| #3909 | `@astrojs/starlight`                | 0.42.10 → 0.43.1    | minor     | docs-site（dev）           | low    | 採用 | rebase 後にマージ（8 版が繰り上がり）      |
| #3913 | `lucide-react`                      | 1.70.0 → **1.76.0** | minor     | app（runtime）             | low    | 採用 | rebase 後にマージ（1.73.0 から繰り上がり） |
| #3917 | `dompurify`（#3899 の差し替え）     | 3.4.17 → 3.4.18     | patch     | app（runtime）             | low    | 採用 | 差し替え PR                                |
| #3916 | `@babel/parser`（#3912 の差し替え） | 7.29.9 → 8.1.2      | **major** | root（dev）                | low    | 採用 | 差し替え PR                                |
| #3900 | `@types/vscode`                     | 1.140.0 → 1.146.0   | minor     | vscode / vscode-e2e（dev） | low    | 却下 | close（ignore なし）                       |

表はマージした順に並べた。#3913 の to はトリアージ時点で 1.73.0、マージした版は 1.76.0。

## 背景

2026-11-23（月）21:45–21:55 UTC に週次の Dependabot PR が 17 件起票された（すべて npm）。security update の起票は無い。
open な security alert は前回と同じ #104（`glob`）と #106（`minimatch`）の 2 件で、今回の bump では解消しない。

15 件は CI green。red は 2 件:

- #3900（`@types/vscode` 1.140.0 → 1.146.0）: Validate / Check / ExTester。前回の #3852 と同じ VS Code floor の柵で、
  `scripts/ci/vscode-version-policy.test.ts` が `engines.vscode`（`^1.140.0`）と `@types/vscode`（`^1.146.0`）のずれを止めた
- #3912（`@babel/parser` 7.29.9 → 8.1.2、major）: Check と Validate。Check は typecheck で、`scripts/review/function-imports.ts`
  が指定する parser plugin `deprecatedImportAssert` が Babel 8 で消えた（`TS2322`）。typecheck で止まるので、Check の後続の
  step（app などのテスト、build）はこの PR では走っていない。Validate は `test:scripts` で、`function-imports.test.ts` の
  2 件が `TSImportType` の AST の変更で落ちた（下記「#3912」）

rollup に並ぶ「Review tier」の `CANCELLED` は、前回と同じく同じ head に対する重複の run である。17 件すべてで、同じ head に
success の run が 1 本あり、rerun は要らなかった。

### リスク分析の方法

bump 種別を問わず 17 件すべてで、次を確かめた。17 件の merge-base はすべて `3c602c01` だった。

- **依存エッジ**: lock の snapshot を peer suffix を落として merge-base と各 PR ヘッドで突き合わせた（`security-alert` skill の
  edges 手順）。加えて `packages:` のキーを `名前@版` で比べ、main の lock に無かった版を全部書き出した。全 PR の和で
  109 版（うち platform binding が 63 版: `@oxlint/binding-*` / `@oxfmt/binding-*` / `@rolldown/binding-*`（wasm32 版を
  含む）/ `@vscode/vsce-sign-*`）。main の lock に無い**パッケージ名**が新しく入るのは 3 件:
  - `@astrojs/runtime` / `@astrojs/vite-plugin-astro`（#3903 `astro`）: astro の monorepo（`withastro/astro`。
    package.json の `repository.directory` がそれぞれ runtime と vite-plugin-astro を指す）から provenance 付きで出ており、
    astro 本体のコードを切り出したもの。例として `@astrojs/runtime` の `dist/internal/core/encryption.js` は astro 7.4.8 の
    `dist/core/encryption.js` と import 文以外が一致する。`eval(` に見えた 1 件は `devalue.uneval()` で、astro 7.4.8 にもある呼び出し
  - `@rolldown/binding-wasm32-wasi`（#3903 / #3906）: rolldown 1.2.19 の wasm 版 binding。`cpu: [wasm32]` の optional
    dependency なので、CI（linux x64）と手元（linux arm64）には入らない。これに付いて `@emnapi/core` / `@emnapi/runtime`
    2.0.0-beta.2（prerelease）と `@napi-rs/wasm-runtime` 1.2.6 が lock に載るが、同じ理由で install されない。どれも
    `toyobayashi/emnapi` / `napi-rs/napi-rs` からの provenance 付き
- **publisher / provenance**: 直接 bump 17 版と transitive の版を registry で from 版と比べた。provenance 付きのものは、to 版の
  attestation が指す workflow の repo が from 版と同じであることを全件開いて確かめた（`anthropics/anthropic-sdk-typescript`、
  `withastro/astro`、`withastro/starlight`、`babel/babel`、`vitejs/vite`、`rolldown/rolldown`、`oxc-project/oxc`、`jsdom/jsdom`、
  `markedjs/marked`、`lucide-icons/lucide`、`testing-library/user-event`、`microsoft/playwright`、`kompiro/adr-tools` など）。
  provenance なしは従来どおりで、`knip`（`webpro`）、`dompurify`（`cure53`）、`@vscode/vsce` / `@vscode/vsce-sign*`
  （`microsoft1es`）、`@types/vscode`（`types`）、`i18next`（`adrai`）、`sitemap`（`derduher`）、`mdast-util-to-hast`
  （`wooorm`）、`postcss-selector-parser`（`moox`）、`brace-expansion`（`juliangruber`）、`@tybys/wasm-util`
  （`toyobayashi`）。変化は 2 件（下記）
- **lifecycle script**: to 版で追加・変更されたものはゼロ。`@vscode/vsce-sign` の `postinstall` は 2.1.0 と同じ
  `node ./src/postinstall.js` で、`pnpm-workspace.yaml` の `allowBuilds` で `false` にしてあるので走らない。既存の
  `prepare` を持つもの（`jsdom`、`dompurify`、`i18next`、`sitemap`、`brace-expansion` など）は registry install では走らない。
  `graceful-fs` 4.2.12 は逆に `postpublish` を消した
- **コード差分**: platform binding と型定義（`@types/vscode`）を除く 43 版は from / to の 2 版、新しい名前の 3 版は to 版だけ、
  tarball を `npm pack --ignore-scripts` で取った。`child_process` / `eval(` / `new Function` / `process.env` / `fetch(` /
  `atob(` / `base64` / `fromCharCode` / `spawn(` / `exec(` / `execSync` / `writeFileSync` / `homedir` / URL を tarball 全体で
  数えて比べ、新しく現れる URL のホストも出した。
  - 43 組のうち 19 組は全パターン同数で、新しいホストもゼロ
  - 増えた組は該当する追加行を読んだ。`@anthropic-ai/sdk` の `spawn(` は agent toolset の grep tool（`rg`）と skill の展開で、
    1.9.0 のリリースノートの tools の修正（ripgrep の設定を無視、60 秒の上限、展開したファイルの mode の正規化）に当たる。
    karasu の app は SDK の `messages.create` しか呼ばず、agent toolset は使わない。`knip` の `child_process` は Node の
    組み込みモジュール名の一覧への追加、`marked` / `oxfmt` の `exec(` は正規表現の `.exec()`、`lucide-react` の `base64` と
    URL は追加アイコンの JSDoc プレビュー。`@emnapi/*` 2.0.0-beta.2 の `atob(` / `writeFileSync` は wasm の base64 展開と、
    同梱された `rollup.config.js` / api-extractor の設定で、上記のとおり install されない
  - 新しいホストは `@anthropic-ai/sdk`（`example.com`、webhook の JSDoc の例）、`astro`（`host` という仮のホスト名、
    `security.allowedDomains` のコメント）、`graceful-fs`（`blueoakcouncil.org`、ライセンス）、`postcss-selector-parser`
    （W3C の仕様書への参照）、`@kompiro/adr-tools`（`claude.com`、README）で、どれもコメントか文書中の参照
- **既知 advisory**: 上の 46 版と `@types/vscode@1.146.0` の 47 版で、GitHub Advisory API（`affects=`）の該当はゼロ。クエリが
  効いていることは `astro@7.4.5` で 1 件返ることで確かめた。ただし `dompurify` には GitHub の global DB にまだ載って
  いない upstream の advisory が 2 件ある（下記「#3899」）
- **公開からの経過**: すべて起票時点で 7 日を越えている。最も新しいのは `marked` 18.2.1（11-16 17:22 公開、起票まで約
  7 日と 4 時間半）
- **`pnpm-workspace.yaml` の `overrides:`**: 新しく解決される版のうち override の対象は `vite` 8.3.8（`vite@8: ^8.3.3`）、
  `undici` 8.12.4（`undici@8: ^8.12.2`）、`dompurify` 3.4.18（`^3.4.16`）、`brace-expansion` 5.0.13（`brace-expansion@5: ^5.0.12`）、
  `postcss` 8.5.33（`^8.5.18`）、`tinypool` 2.2.0（`^2.1.2`）で、どれも floor を満たす。`dompurify` は override が宣言を
  置き換える問題があった（下記「#3899」）
- **docs-site のビルドと見た目**: bot PR では「Deploy Docs Preview」の job ごとスキップされ、`astro build` が CI で走らない。
  #3903（astro）と #3909（starlight）の head を detached worktree に取り、`pnpm install --frozen-lockfile` と
  `pnpm --filter @karasu-tools/docs-site... run build` を実行した。どちらも 81 ページを出力して成功。WARN 2 件（collection
  `i18n` が空、`404` の entry が無い）は main の build でも同じく出る。#3909 は starlight の BREAKING を含むので、
  main と #3909 の build をそれぞれ `/karasu/` の下に置き、Playwright で 6 ページ（`/`、`/guide/`、`/ja/`、`/tools/`、
  `/concepts/`、`/retrospective/`）× light / dark の全ページのスクリーンショットを撮って比べた。外部画像（Cloudflare の
  badge）を隠した上で、12 枚すべてがピクセル単位で一致した

#### publisher が変わった `graceful-fs` 4.2.11 → 4.2.12

#3904（`@vscode/vsce`）で transitive に動く。4.2.11（2023-03）は `isaacs` が手元から publish した版で、4.2.12（2026-11-12）は
GitHub Actions + provenance。attestation の workflow は `isaacs/node-graceful-fs` の `.github/workflows/release.yml`
（`refs/tags/v4.2.12`）を指す。tarball の差分は `package.json` の `license`（`ISC` → `BlueOak-1.0.0`）と publish 用の
scripts、`LICENSE` → `LICENSE.md` の改名だけで、コードは同一。配布経路が強くなった方向の変化で、**リスクは low と判断した。**
ライセンスの変更は、`graceful-fs` が `@vscode/vsce`（開発時のパッケージングツール）経由でしか入らず、拡張の bundle にも
app にも入らないので、配布物の notice には影響しない。

#### publish の workflow が変わった `playwright` / `playwright-core` / `@playwright/test` 1.65.0 → 1.65.1

1.65.0 は `publish_release.yml`（`refs/tags/v1.65.0`）、1.65.1 は `publish_manual.yml`（`refs/heads/release-1.65`）から出て
いる。どちらも `microsoft/playwright` の workflow で、`publish_manual.yml` は 11-13 に Playwright の maintainer（`dgozman`）が
「patch release 用」として追加した（microsoft/playwright#44077）。この workflow は release branch で版を上げる commit を
自分で作ってから publish する。attestation の commit `cb1c1d0e` の 1 つ後が、`microsoft-playwright-automation[bot]` の
「chore: mark v1.65.1」（tag `v1.65.1` の commit `bbd94834`）であることを compare で確かめた。GitHub の release `v1.65.1` も
同じ日に作られている。tarball の差分でパターンの出現数は同数。**リスクは low と判断した。**

## 理由（PR ごとの分析）

### #3912 `@babel/parser` 7.29.9 → 8.1.2（差し替え PR #3916 で採用）

`@babel/parser` を使うのは、#3824 で入った Pages Functions の import の柵（`scripts/review/function-imports.ts`）だけで、
ルートの devDependency である。供給側の懸念は無い。`babel/babel` の `release.yml` からの provenance 付きで、8.x は `main`
branch から、7.x は `7.x` branch から出る。`@babel/types` / `@babel/helper-string-parser` /
`@babel/helper-validator-identifier` が 8 系に動く。`engines.node` は `^22.18.0 || >=24.11.0` で、CI の Node 24 と手元の
v24.18.0 は満たす。

Babel 8 で、この柵に当たる変更は 2 つある。

1. **`deprecatedImportAssert` plugin の削除**: import の `assert { type: "json" }` 構文の parse ができなくなった。Check の
   typecheck が落ちたのはこの 1 行
2. **`TSImportType` の AST の変更**: `typeof import("./x.js")` の文字列が、Babel 7 の `argument`（`TSLiteralType` で包む）から
   Babel 8 の `source`（`StringLiteral`）に移った。Validate の `test:scripts` で 2 件が `TypeError` で落ちたのはこれ

1 の結果、Function が `import x from "./y.json" assert { type: "json" }` と書くと柵の parse が失敗する。柵は parse の失敗を
「does not parse」として報告するので、黙って通すのではなく止める側に倒れる。`functions/**` に `assert` の import は無く、
標準の書き方（`with { type: "json" }`）は Babel 8 でも読める。kompiro はこの挙動の変化を受け入れた（Design Doc の
「Reviewer に判断を仰ぎたい点」1）。

正しい変更は「bump + 柵の修正」で、bot が作れる diff には収まらないので、#3912 を close して差し替え PR #3916 で入れた。
判定は採用なので `@dependabot ignore` は設定していない。#3916 の内容:

- plugin の一覧から `deprecatedImportAssert` を外し、前のコメントを「Babel 8 は import の `assert` を読まない。そのファイルは
  does not parse になる」に直した
- `TSImportType` は `node.source` を読む
- Babel 8 では `import()` が常に `ImportExpression` になる（`createImportExpressions` の既定が true）ので、`CallExpression` の
  枝に残っていた `Import` callee の分岐を消した（到達しないコード）
- `function-imports.test.ts` に「`assert` 付きの import は does not parse で落ちる」テストを足し、上の挙動の変化を固定した

**#3916 の lock は #3912 の lock と同じ版に留めた。** `pnpm install --lockfile-only` で解決し直すと、11-20 公開の
`@babel/parser` 8.1.3 系が入り、7 日の cooldown の内側になる。トリアージで確かめた版も 8.1.2 である。bot の lock の差分
（`3c602c01..#3912`）を main の lock に `git apply --3way` で当て、conflict（main 側で `@babel/runtime` が 7.29.14 に上がって
いた）は main の版を残して解いた。main の lock と比べて新しく入る版は `@babel/parser@8.1.2`・`@babel/types@8.1.2`・
`@babel/helper-string-parser@8.1.2`・`@babel/helper-validator-identifier@8.0.6` の 4 つだけで、`--frozen-lockfile` が通り、
`--lockfile-only` で解決し直しても lock が動かないことを確かめた。

ready の前の CodeRabbit CLI は、上の 1 を Minor の指摘として挙げた（「esbuild がまだ受け付ける構文を柵が拒む」）。kompiro が
受け入れた挙動の変化そのものなので、直さずに PR の記録に却下として残した。

**保留を選ばない理由**: 修正は 1 ファイル数行で、柵のテストがその正しさを直接確かめる。Babel 7 は 7.x branch で保守が
続いているが、待っても bot の diff は直らず、毎週同じ PR が出る。

### #3899 `dompurify` 3.4.17 → 3.4.18（差し替え PR #3917 で採用）

app の runtime 依存で、`ChatPane` / `NodeDetailPanel` / `EdgeDetailPanel` が `marked` の出力を
`DOMPurify.sanitize(raw)`（既定の設定）で通す。3.4.18 は `SAFE_FOR_TEMPLATES` の bypass の修正、SVG の許可リストから要素で
ない名前を外す変更、clobbering check の修正、hook で広げた許可リストが残る問題の修正など。

**upstream の advisory が 2 件あるが、GitHub の global DB にはまだ載っていない**ので、Dependabot alert にはなっていない:

| advisory            | 公開  | 深刻度 | 脆弱範囲 → 修正版   | 内容                                                                   |
| ------------------- | ----- | ------ | ------------------- | ---------------------------------------------------------------------- |
| GHSA-qm7q-q8h9-jg8q | 11-14 | medium | `< 3.4.18` → 3.4.18 | `SAFE_FOR_TEMPLATES` の bypass（入れ子の `<form>` と孤立した終了タグ） |
| GHSA-hrxw-jjj6-2g2j | 11-23 | low    | `< 3.5.0` → 3.5.0   | `SAFE_FOR_TEMPLATES` の bypass（入れ子の `<form>`）                    |

どちらも `SAFE_FOR_TEMPLATES` を有効にしたときだけの問題で、karasu はこの option を使っていない（`packages/app/src` に
該当なし）。3.4.18 で 1 件目が直る。2 件目の修正版 3.5.0 は 11-22 公開で cooldown の内側なので、次回以降の bump を待つ。

`.claude/rules/dependabot.md`「Security alert 時は advisory の脆弱範囲を override / 宣言レンジと突き合わせる」は alert を
処理したときの規則で、今回は alert が無い。それでも同じ突き合わせをした:

| 確認                                  | 結果                                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `pnpm-workspace.yaml` の `overrides:` | `dompurify: ^3.4.16`。2 件とも脆弱範囲と交差する                                                          |
| 宣言（`packages/*/package.json`）     | `packages/app` の `"dompurify": "^3.4.17"`。#3899 で `^3.4.18` に上がる                                   |
| #3899 の head の lock                 | `packages/app` の importer は `specifier: ^3.4.16`、`version: 3.4.18`。`dompurify@` は 3.4.18 の 1 版だけ |

**override が宣言を置き換えるので、#3899 だけでは実効のレンジは `^3.4.16` のまま変わらない。** lock の importer の
`specifier` が override の値になっていることがその証拠で、宣言を `^3.4.18` に上げても 1 件目の脆弱範囲（`< 3.4.18`）との
交差は解けない。規則の手順 3（交差するレンジは patched 版へ上げ、override だけ・宣言だけを据え置かない。ADR-2404「却下した案」）に
従い、kompiro の判断で override の floor も `^3.4.18` に上げた（Design Doc の「Reviewer に判断を仰ぎたい点」2）。

Dependabot は `overrides:` を書き換えないので、#3899 を close し、宣言と override の floor を `^3.4.18` に上げる差し替え PR #3917 で
入れた（ADR-2115 と同じ形）。#3917 の lock は、`overrides:` の見出しと `packages/app` の importer の `specifier` が `^3.4.18`、
`dompurify@` は 3.4.18 の 1 版だけ（3.5.0 は入らない）であることを確かめた。ADR-2404 と ADR-3002 の assumptions
（`dompurify` の override と宣言があること、override が `^3.` であること）はそのまま成立する。2 件目（`< 3.5.0`）とは floor を
上げても交差したままで、3.5.0 を入れるときに floor を `^3.5.0` に上げる。

### #3900 `@types/vscode` 1.140.0 → 1.146.0（却下）

供給側の懸念は無い（DefinitelyTyped の `types` account、差分は型定義だけ）。止まっている理由は前回の #3852 と同じ:

- ADR-2562 は `@types/vscode` と `engines.vscode` を同値に保つ。Dependabot は `engines.vscode` を書き換えないので、
  bot PR は構造的に片側だけの移動になる
- `engines.vscode` も上げる差し替え PR は ADR-2782 の上限に当たる。karasu が使う `vscode-extension-tester` 8.28.1 の
  `vscode-max` は 1.140.0

ADR-3870 と同じ形で、ADR-3870 と #3070 を引いてコメントし、bot PR を close した。`@dependabot ignore` は設定していない。

状況は動き始めている。`vscode-extension-tester` 8.29.0（11-19 公開）で `vscode-max` が 1.147.0、`vscode-min` が
1.145.3 になった。8.29.0 は今回の cooldown（7 日）の内側だった。ExTester を 8.29 に上げれば floor を 1.146 まで上げられるが、
`vscode-min` が 1.145.3 なので floor 1.140 での ExTester 実行ができなくなる可能性がある。floor を動かす判断は #3070 で行う。

### #3909 `@astrojs/starlight` 0.42.10 → 0.43.1

0.43.0 には BREAKING が 1 つと「potentially breaking」が 2 つある:

- **scoped style の既定が `"where"` から Astro の既定（`"attribute"`）に変わった**。docs-site は `Footer` を override して
  scoped `<style>` を持つ（`packages/docs-site/src/components/Footer.astro`）が、class を子コンポーネントへ渡していないので、
  移行ガイドの「`class` を渡す」の注意には当たらない。上記のとおり 12 枚のスクリーンショットがピクセル単位で一致した
- **`ThemeSelect` の内部 API の削除**: docs-site は `ThemeSelect` を override していない
- **`i18next` 27 への更新**: starlight の翻訳 API を直接使っていない。karasu 自身は `i18next` に依存していない

0.43.1 は `<Aside>` のアイコンの大きさの regression の修正。transitive では `@astrojs/mdx` 8.1.6、`@astrojs/sitemap`
3.7.5 → `sitemap` 10.0.0（major。`engines.node` `>=22.22.1`、同じ publisher）、`i18next` 27 系などが動く。rebase で
繰り上がった版は下記「結果」。

### #3903 `astro` 7.4.8 → 7.4.12

修正だけ（`getStaticPaths()` の `%` / `\` を含む param、CSP の `strictDynamic`、`X-Forwarded-*` の検証、dev server の不正な
percent-encoding を 400 に、build のメモリ削減、`@astrojs/*` 依存の pin を外す、など）。上記の `@astrojs/runtime` /
`@astrojs/vite-plugin-astro` の切り出しを含む。transitive に `vite` 8.3.8 と `rolldown` 1.2.19 を連れてくるので、#3906 と
lock が重なる。

### #3898 `jsdom` 31.0.0 → 31.0.1

computed style や selector 照合の性能改善と、`tabIndex` / CSS `ident()` / `max-lines` の直列化の修正。前回 #3874 で
直した `PreviewPane.test.tsx` を含む app のテストが green。`undici` 8.12.4 は override の `undici@8: ^8.12.2` を満たす。

### #3901 `@anthropic-ai/sdk` 1.7.0 → 1.9.0

API の型の追加（RBAC Role、Claude Tag の Bundle と metrics など）と修正。streaming の tool input で JSON でない文字を
拒否するようになったが、karasu の app は `client.messages.create` を streaming なしで呼ぶ（`useChatSession.ts`）。
agent toolset の修正は上記のとおり karasu の経路に無い。ADR-2671 の assumption は `^1.` なので 1.9.0 で成立する。
transitive は `@babel/runtime` 7.29.14 だけ。

### #3913 `lucide-react` 1.70.0 → 1.73.0（マージしたのは 1.76.0）

トリアージ時点の 1.73.0 は、アイコンの追加（`trap`、`graph-ring`、`layout-grid-plus`、`mound-shovel`、`text-pen`、
`route-arrow-right`）と、1.72.0 の `route` アイコンの左右反転。karasu は `Route` を import していない。tarball の差分は
アイコンのファイルだけ。1.74.0・1.76.0 への繰り上がりは下記「結果」。

### #3910 `marked` 18.1.3 → 18.2.1

emphasis・画像の alt text の hard line break・tab を含む html block・block quote の lazy line の修正と、CLI の stdout の修正。
出力は上記の DOMPurify を通る。`@vscode/vsce` も `marked` に依存するので、#3904 と lock が重なる。

### #3904 `@vscode/vsce` 4.1.0 → 4.1.1

`@vscode/vsce-sign` 2.1.1 への更新（platform binary 2.0.6 → 2.0.8、同じ `microsoft1es`）と開発依存の更新だけ。
transitive に `marked` 18.2.1 と、上記の `graceful-fs` 4.2.12 が入る。`vsce-sign` の `postinstall` は `allowBuilds` で
止めてある。ExTester と Validate（拡張の package）が green。

### #3902 `@playwright/test` 1.65.0 → 1.65.1

regression の修正 2 件（`useDefineForClassFields: false` での static field 付き decorated class、Bun での位置ずれ）。ブラウザの
版は 1.65.0 と同じ。publish の workflow の変化は上記。Playwright（required）が green。

### #3906 `vite` 8.3.7 → 8.3.8

修正だけ（transform hook の meta、inline worker の asset、型だけの import での native loader 判定、
`cssCodeSplit: false` の CSS entry）。`rolldown` 1.2.19 に上がる。override の `vite@8: ^8.3.3` を満たす。app の build・
E2E が green。

### #3897 `@kompiro/adr-tools` 0.0.13 → 0.0.14

kompiro の repo（`kompiro/adr-tools`）の `publish.yml`（`refs/tags/v0.0.14`）から provenance 付き。CLI に `search` / `refs`
を追加し、README に Claude Code plugin の説明が増えた。宣言が `^0.0.13`（0.0.x の caret は版を固定する）なので bot が
宣言を書き換える。ADR の validator を含む Check が green。

### #3905 `knip` 6.45.1 / #3908 `oxlint` 1.94.0 / #3911 `oxfmt` 0.79.0 / #3907 `@testing-library/user-event` 14.6.12

- `knip`: Zod を手書きの検証に置き換え、plugin の追加（AWS CDK など）、enum member の使用判定の修正など。CI の knip が green
- `oxlint`: 規則の追加・修正と、oxc の規則を recommended に入れる変更。karasu は `oxlint` を exact で pin している。Check
  （lint）が green
- `oxfmt`: prettier 3.10.1 への更新と formatter の修正。`format:check` を含む Check が green
- `user-event`: number input の値、form の implicit submission、shadow DOM の input、tel の `maxlength` の修正。app の
  テストが green

## 結果

lock を触る PR が 16 本あるので、ADR-3870 の事故を繰り返さないよう、1 本ずつ次の条件でマージした。

- **マージの条件**: PR の merge-base と、その時点の `origin/main`（毎回 `git fetch` した後）とで、`pnpm-lock.yaml`・
  `pnpm-workspace.yaml`・ルートと `packages/*` の `package.json` が同一であること。同一なら、squash は PR の lock をそのまま
  main に置くので、分析した lock が main に入る。違えば `@dependabot rebase` を頼み、新しい head の CI を待った
- **版の照合**: 新しい head が main の lock に無い版を足すとき、それがトリアージで分析した 109 版の内側にあること。外側の版が
  あればマージを止めて分析し直した
- head は `--match-head-commit` で固定し、マージの直前にもう一度 fetch して上の条件を確かめ直した。required check が green で、
  mergeStateStatus が `CLEAN` であることも前提にした

Design Doc は「merge-base が `origin/main` と一致すること」を条件にしていた。マージで使った条件はそれより緩く、merge-base が
main より古くても、その間に lock と manifest が動いていなければマージする。squash の結果の lock は同じになるので安全性は
変わらず、lock に関係しない main の commit を追うだけの rebase を省ける。#3897 はこの条件で rebase なしに入り、
残りの 13 本は前の PR が lock を動かしたので rebase した。

#3916 と #3917 は bot PR を全部入れた後に `origin/main` を merge し、lock を作り直した（上記）。

### rebase で版が繰り上がった 3 本

Dependabot の rebase は、ブランチを main に載せ直すだけでなく、その時点の registry で版を解決し直す。11-24 から 11-26 に
かけて 7 日の cooldown を抜けた版が増え、3 本で分析した版の外側の版が入った。どれもトリアージと同じ手順（publisher /
provenance、lifecycle script、dependencies、maintainer、tarball の差分と upstream の compare、パターンの出現数）で分析し直し、
kompiro に判断を求めて、そのままマージした。

| PR    | 繰り上がった版                                                                   | 公開  | 分析の結論                                                                                                                                                                                                                                                                                                                                     |
| ----- | -------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #3913 | `lucide-react` 1.73.0 → 1.74.0                                                   | 11-17 | OIDC + provenance（`lucide-icons/lucide` の `ci.yml`、`refs/heads/main`）は同じ。差分はアイコンの追加、alias の改名、bundle の識別子の振り直しで、runtime の中核は版の banner だけ。karasu が使う 5 アイコンは変わらない                                                                                                                       |
| #3903 | `vitefu` 1.1.3 → 1.1.4（transitive）                                             | 11-17 | publisher は同じ `bluwy`、どちらも provenance なし。upstream の compare `v1.1.3...v1.1.4` は crawl の memo cache（`6bc4e2f0`、+31 −2）だけで tarball と一致する。maintainer から `dominik_g` が外れた（追加は無い）。docs-site の build だけに効く                                                                                             |
| #3909 | expressive-code 系 7 個 0.44.3 → 0.44.4、`i18next` 27.1.3 → 27.1.5（transitive） | 11-17 | expressive-code 系は OIDC + provenance で、tarball の差分は `package.json`（版と内部の依存レンジ）だけ。`i18next` は publisher が同じ `adrai`（どちらも provenance なし）で、差分は `off()` が `once()` の listener を外す修正と TS2590 を避ける型の修正だけ、upstream の compare と一致する。docs-site の build だけに効く                    |
| #3913 | `lucide-react` 1.74.0 → 1.76.0（版が動いた 2 回目の rebase）                     | 11-19 | provenance は同じ。アイコンの追加に加え、shared の utility の修正 4 件（`hasA11yProp` の null の扱い #5208、`toKebabCase` の連続した大文字 #5237、`mergeClasses` の token 単位の重複除去 #5240、`getClassNames` が配列を返す #5242）で、upstream の PR と一致する。karasu が使う 5 アイコンの module は同一で、生成される class 名も変わらない |

どれも lifecycle script・dependencies の追加は無く、追加行に `eval(` / `fetch(` / `child_process` などのパターンは現れなかった。

Dependabot が rebase の依頼に答えないことも 1 回あった（#3902、2 時間）。もう一度頼むと rebase された。

### 差し替え PR

bot PR 14 本の後に、#3917 → #3916 の順でマージした。どちらも High の段階で、ready の後の CodeRabbit のレビューは
コードへの指摘ゼロで収束した。出たのは PR の title の形式（scope に `deps` / `deps-dev` を使っていた）の警告だけで、title を
`chore(app): …` / `chore(review): …` に直した。#3917 はこれで警告が消えた。#3916 の `review` も `.coderabbit.yaml` の scope の
一覧（package 名か docs の領域）に無く、警告は残った。変更は `scripts/review/` だけで当てはまる scope が一覧に無く、警告の段階
（`mode: warning`）なので、そのまま受け入れた。kompiro の確認を得てマージした。

#3917 のマージで main の lock が動いたので、#3916 には `origin/main` をもう一度 merge した。conflict は無く、main の lock と
比べて新しく入る版は上記の Babel 8 の 4 版だけ、`--frozen-lockfile` が通り、`--lockfile-only` で lock が動かないことを
確かめてからマージした。

全部をマージした後の main（`c3042504`）で `pnpm install --frozen-lockfile` が通った（重複した key は無い）。rebase で
docs-site の transitive の版が動いたので、同じ main で docs-site のビルドもやり直し、81 ページを出力して成功した（WARN は
トリアージ時と同じ 2 件）。

## 却下した案

### #3912 を保留する

**却下**。上記「#3912」の保留を選ばない理由のとおり。

### #3899 を bot PR のままマージし、override の floor は 3.5.0 を入れるときに上げる

**却下**。override が宣言を置き換えるので、bot PR だけでは実効のレンジが 1 件目の advisory の脆弱範囲と交差したまま残る。
karasu には当たらない advisory だが、規則の手順どおりに floor を合わせた。

### #3916 の lock を `--lockfile-only` で解決し直す

**却下**。cooldown の内側の `@babel/parser` 8.1.3 系が入り、分析した版から外れる。bot の lock の差分を main の lock に当てた。

### rebase で繰り上がった版を、分析した版に戻す差し替え PR で入れる

**却下**。繰り上がった版はどれも cooldown を抜けており、分析し直した結果リスクは low だった。差し替え PR にすると、
`lucide-react` のように毎日 release される依存では版を固定する手間が増え、次の週にまた同じ bump が出る。

### #3900 を `engines.vscode` も上げる差し替え PR で入れる / open のまま残す / ignore を設定する

**却下**。ADR-3870・ADR-3751 と同じ理由（ExTester の `vscode-max` 1.140.0 を越えられない、開いておいても入る見込みが無い、
floor の扱いは #3070 で決める途中）。

## 対象外の観測

- open な alert #104（`glob`）と #106（`minimatch`）は今回の bump では解消しない。引き続き `/hane:security-alert` で扱う
- `dompurify` 3.5.0（GHSA-hrxw-jjj6-2g2j の修正版）と `vscode-extension-tester` 8.29.0 は cooldown の内側にあった。次回以降の bump になる
- Dependabot の rebase が版を解決し直すので、マージに時間がかかる週ほど分析した版から外れやすい。今回は 3 日にわたり、3 本が外れた
