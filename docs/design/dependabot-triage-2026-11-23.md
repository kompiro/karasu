# Dependabot トリアージ 2026-11-23

- **日付**: 2026-11-24
- **ステータス**: 検討中
- **関連**:
  - 対象 Dependabot PR: [#3897](https://github.com/kompiro/karasu/pull/3897) 〜 [#3913](https://github.com/kompiro/karasu/pull/3913)（17 件）
  - 前回トリアージ: [ADR-3870](../adr/3870-dependabot-triage-2026-11-16.md)（同じ base の lock を続けてマージして main の lock を壊した記録を含む）
  - VS Code floor の方針: [ADR-2562](../adr/2562-dependabot-triage-2026-08-17.md)（`@types/vscode` と `engines.vscode` を同値に固定）、[ADR-2782](../adr/2782-vscode-floor-capped-by-extester.md)（ExTester の `vscode-max` を上限にする）、追随方針の見直し: [#3070](https://github.com/kompiro/karasu/issues/3070)
  - `@types/vscode` を close した前例: ADR-3870・[ADR-3751](../adr/3751-dependabot-triage-2026-11-09.md)・[ADR-3069](../adr/3069-dependabot-triage-2026-10-05.md)
  - `@babel/parser` を使う import の柵: [#3799](https://github.com/kompiro/karasu/issues/3799)（PR #3824、ADR は PR #3885 で記録中）
  - `dompurify` の override の経緯: [ADR-2115](../adr/2115-dependabot-security-2026-07-22-second-batch.md)、[ADR-2404](../adr/2404-dependabot-security-2026-08-08.md)
  - SDK の assumptions: [ADR-2671](../adr/2671-dependabot-triage-2026-08-31.md)（`^1.`）
  - 判定語彙: [ADR-2474](../adr/2474-dependabot-replacement-pr-vocabulary.md)

## 背景・課題

2026-11-23（月）21:45–21:55 UTC に週次の Dependabot PR が 17 件起票された（すべて npm）。security update の起票は無い。
open な security alert は前回と同じ #104（`glob`）と #106（`minimatch`）の 2 件で、今回の bump では解消しない。

15 件は CI green。red は 2 件:

- #3900（`@types/vscode` 1.140.0 → 1.146.0）: Validate / Check / ExTester。前回の #3852 と同じ VS Code floor の柵で、
  `scripts/ci/vscode-version-policy.test.ts` が `engines.vscode`（`^1.140.0`）と `@types/vscode`（`^1.146.0`）のずれを止めた
- #3912（`@babel/parser` 7.29.9 → 8.1.2、major）: Check と Validate。Check は typecheck で、`scripts/review/function-imports.ts:45`
  が指定する parser plugin `deprecatedImportAssert` が Babel 8 で消えた（`TS2322`）。typecheck で止まるので、Check の後続の
  step（app などのテスト、build）はこの PR では走っていない。Validate は `test:scripts` で、`function-imports.test.ts` の
  2 件が `TSImportType` の AST の変更で落ちた（下記「#3912」）

rollup に並ぶ「Review tier」の `CANCELLED` は、前回と同じく同じ head に対する重複の run である。17 件すべてで、同じ head に
success の run が 1 本あり、`gh pr checks` の「Review tier」は pass と表示される。rerun は要らない。

## リスク分析の方法

bump 種別を問わず 17 件すべてで、次を確かめた。17 件の merge-base はすべて `3c602c01` で、そこから現在の main までの間に
`pnpm-lock.yaml` / `pnpm-workspace.yaml` / 各 `package.json` は動いていない。

- **依存エッジ**: lock の snapshot を peer suffix を落として merge-base と各 PR ヘッドで突き合わせた（`security-alert` skill の
  edges 手順）。加えて `packages:` のキーを `名前@版` で比べ、main の lock に無かった版を全部書き出した。全 PR の和で
  109 版（うち platform binding が 63 版: `@oxlint/binding-*` / `@oxfmt/binding-*` / `@rolldown/binding-*`（wasm32 版を
  含む）/ `@vscode/vsce-sign-*`）。main の lock に無い**パッケージ名**が新しく入るのは 3 件:
  - `@astrojs/runtime` / `@astrojs/vite-plugin-astro`（#3903 `astro`）: astro の monorepo（`withastro/astro` の
    `packages/runtime` / `packages/vite-plugin-astro`）から provenance 付きで出ており、astro 本体のコードを切り出したもの。
    例として `@astrojs/runtime` の `dist/internal/core/encryption.js` は astro 7.4.8 の `dist/core/encryption.js` と import 文以外が
    一致する。`eval(` に見えた 1 件は `devalue.uneval()` で、astro 7.4.8 にもある呼び出し
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
- **コード差分**: platform binding と型定義（`@types/vscode`）を除く 43 版は from / to の 2 版、新しい名前の 3 版
  （`@astrojs/runtime`、`@astrojs/vite-plugin-astro`、`@rolldown/binding-wasm32-wasi`）は to 版だけ、tarball を
  `npm pack --ignore-scripts` で取った。
  `child_process` / `eval(` / `new Function` / `process.env` / `fetch(` / `atob(` / `base64` / `fromCharCode` / `spawn(` /
  `exec(` / `execSync` / `writeFileSync` / `homedir` / URL を tarball 全体で数えて比べ、新しく現れる URL のホストも出した。
  - 43 組のうち 19 組は全パターン同数で、新しいホストもゼロ
  - 増えた組は該当する追加行を読んだ。`@anthropic-ai/sdk` の `spawn(` は agent toolset の grep tool（`rg`）と skill の展開で、
    1.9.0 のリリースノートの tools の修正（ripgrep の設定を無視、60 秒の上限、展開したファイルの mode の正規化）に当たる。
    karasu の app は SDK の `messages.create` しか呼ばず、agent toolset は使わない。`knip` の `child_process` は Node の
    組み込みモジュール名の一覧への追加、`marked` / `oxfmt` の `exec(` は正規表現の `.exec()`、`lucide-react` の `base64` と
    URL は追加アイコンの JSDoc プレビュー（差分はアイコンのファイルだけ）。`@emnapi/*` 2.0.0-beta.2 の `atob(` /
    `writeFileSync` は wasm の base64 展開と、同梱された `rollup.config.js` / api-extractor の設定で、上記のとおり install されない
  - 新しいホストは `@anthropic-ai/sdk`（`example.com`、webhook の JSDoc の例）、`astro`（`https://host`、
    `security.allowedDomains` のコメント）、`graceful-fs`（`blueoakcouncil.org`、ライセンス）、`postcss-selector-parser`
    （`www.w3.org`、仕様の参照）、`@kompiro/adr-tools`（`claude.com`、README）で、どれもコメントか文書中の参照
- **既知 advisory**: 上の 46 版と `@types/vscode@1.146.0` の 47 版で、GitHub Advisory API（`affects=`）の該当はゼロ。クエリが
  効いていることは `astro@7.4.5` で 1 件返ることで確かめた。ただし `dompurify` には GitHub の global DB にまだ載って
  いない upstream の advisory が 2 件ある（下記「#3899」）
- **公開からの経過**: すべて起票時点で 7 日を越えている。最も新しいのは `marked` 18.2.1（11-16 17:22 公開、起票まで約
  7 日と 4 時間半）
- **`pnpm-workspace.yaml` の `overrides:`**: 衝突なし。新しく解決される版のうち override の対象は `vite` 8.3.8
  （`vite@8: ^8.3.3`）、`undici` 8.12.4（`undici@8: ^8.12.2`）、`dompurify` 3.4.18（`^3.4.16`）、`brace-expansion` 5.0.13
  （`brace-expansion@5: ^5.0.12`）、`postcss` 8.5.33（`^8.5.18`）、`tinypool` 2.2.0（`^2.1.2`）で、どれも floor を満たす
- **docs-site のビルドと見た目**: bot PR では「Deploy Docs Preview」の job ごとスキップされ、`astro build` が CI で走らない。
  #3903（astro）と #3909（starlight）の head を detached worktree に取り、`pnpm install --frozen-lockfile` と
  `pnpm --filter @karasu-tools/docs-site... run build` を実行した。どちらも 81 ページを出力して成功。WARN 2 件（collection
  `i18n` が空、`404` の entry が無い）は main の build でも同じく出る。#3909 は starlight の BREAKING を含むので、
  main と #3909 の build をそれぞれ `/karasu/` の下に置き、Playwright で 6 ページ（`/`、`/guide/`、`/ja/`、`/tools/`、
  `/concepts/`、`/retrospective/`）× light / dark の全ページのスクリーンショットを撮って比べた。外部画像（Cloudflare の
  badge）を隠した上で、12 枚すべてがピクセル単位で一致した

### publisher が変わった `graceful-fs` 4.2.11 → 4.2.12

#3904（`@vscode/vsce`）で transitive に動く。4.2.11（2023-03）は `isaacs` が手元から publish した版で、4.2.12（2026-11-12）は
GitHub Actions + provenance。attestation の workflow は `isaacs/node-graceful-fs` の `.github/workflows/release.yml`
（`refs/tags/v4.2.12`）を指す。tarball の差分は `package.json` の `license`（`ISC` → `BlueOak-1.0.0`）と publish 用の
scripts、`LICENSE` → `LICENSE.md` の改名だけで、コードは同一。配布経路が強くなった方向の変化で、**リスクは low と判断する。**
ライセンスの変更は、`graceful-fs` が `@vscode/vsce`（開発時のパッケージングツール）経由でしか入らず、拡張の bundle にも
app にも入らないので、配布物の notice には影響しない。

### publish の workflow が変わった `playwright` / `playwright-core` / `@playwright/test` 1.65.0 → 1.65.1

1.65.0 は `publish_release.yml`（`refs/tags/v1.65.0`）、1.65.1 は `publish_manual.yml`（`refs/heads/release-1.65`）から出て
いる。どちらも `microsoft/playwright` の workflow で、`publish_manual.yml` は 11-13 に Playwright の maintainer（`dgozman`）が
「patch release 用」として追加した（microsoft/playwright#44077）。この workflow は release branch で版を上げる commit を
自分で作ってから publish する。attestation の commit `cb1c1d0e` の 1 つ後が、`microsoft-playwright-automation[bot]` の
「chore: mark v1.65.1」（tag `v1.65.1` の commit `bbd94834`）であることを compare で確かめた。GitHub の release `v1.65.1` も
同じ日に作られている。tarball の差分でパターンの出現数は同数。**リスクは low と判断する。**

## 一覧

| PR    | 依存                          | from → to         | 種別      | 対象                       | CI      | リスク | 推奨                    |
| ----- | ----------------------------- | ----------------- | --------- | -------------------------- | ------- | ------ | ----------------------- |
| #3897 | `@kompiro/adr-tools`          | 0.0.13 → 0.0.14   | patch     | root（dev）                | green   | low    | 採用                    |
| #3898 | `jsdom`                       | 31.0.0 → 31.0.1   | patch     | app（dev）                 | green   | low    | 採用                    |
| #3899 | `dompurify`                   | 3.4.17 → 3.4.18   | patch     | app（runtime）             | green   | low    | **採用（差し替え PR）** |
| #3900 | `@types/vscode`               | 1.140.0 → 1.146.0 | minor     | vscode / vscode-e2e（dev） | **red** | low    | **却下（close）**       |
| #3901 | `@anthropic-ai/sdk`           | 1.7.0 → 1.9.0     | minor     | app（runtime）             | green   | low    | 採用                    |
| #3902 | `@playwright/test`            | 1.65.0 → 1.65.1   | patch     | root / e2e（dev）          | green   | low    | 採用                    |
| #3903 | `astro`                       | 7.4.8 → 7.4.12    | patch     | docs-site（dev）           | green   | low    | 採用                    |
| #3904 | `@vscode/vsce`                | 4.1.0 → 4.1.1     | patch     | vscode / vscode-e2e（dev） | green   | low    | 採用                    |
| #3905 | `knip`                        | 6.44.2 → 6.45.1   | minor     | root（dev）                | green   | low    | 採用                    |
| #3906 | `vite`                        | 8.3.7 → 8.3.8     | patch     | app（dev）                 | green   | low    | 採用                    |
| #3907 | `@testing-library/user-event` | 14.6.8 → 14.6.12  | patch     | app（dev）                 | green   | low    | 採用                    |
| #3908 | `oxlint`                      | 1.93.0 → 1.94.0   | minor     | root（dev）                | green   | low    | 採用                    |
| #3909 | `@astrojs/starlight`          | 0.42.10 → 0.43.1  | minor     | docs-site（dev）           | green   | low    | 採用                    |
| #3910 | `marked`                      | 18.1.3 → 18.2.1   | minor     | app（runtime）             | green   | low    | 採用                    |
| #3911 | `oxfmt`                       | 0.78.0 → 0.79.0   | minor     | root（dev）                | green   | low    | 採用                    |
| #3912 | `@babel/parser`               | 7.29.9 → 8.1.2    | **major** | root（dev）                | **red** | low    | **採用（差し替え PR）** |
| #3913 | `lucide-react`                | 1.70.0 → 1.73.0   | minor     | app（runtime）             | green   | low    | 採用                    |

## PR ごとの分析

### #3912 `@babel/parser` 7.29.9 → 8.1.2（差し替え PR での採用を推奨）

`@babel/parser` を使うのは、#3824 で入った Pages Functions の import の柵（`scripts/review/function-imports.ts`）だけで、
ルートの devDependency である。供給側の懸念は無い。`babel/babel` の `release.yml` からの provenance 付きで、8.x は `main`
branch から、7.x は `7.x` branch から出る。`@babel/types` / `@babel/helper-string-parser` /
`@babel/helper-validator-identifier` が 8 系に動く。`engines.node` は `^22.18.0 || >=24.11.0` で、CI の Node 24 と手元の
v24.18.0 は満たす。

Babel 8 で、この柵に当たる変更は 2 つある。#3912 の head を手元に取って確かめた:

1. **`deprecatedImportAssert` plugin の削除**: import の `assert { type: "json" }` 構文の parse ができなくなった。Check の
   typecheck が落ちたのはこの 1 行（実行時は「Babel 8 で削除された」という警告だけで、parse は続く）。指定を外すと
   typecheck は通る
2. **`TSImportType` の AST の変更**: `typeof import("./x.js")` の文字列が、Babel 7 の `argument`（`TSLiteralType` で包む）から
   Babel 8 の `source`（`StringLiteral`）に移った。Validate の `test:scripts` で `scripts/review/function-imports.test.ts` の
   2 件（`reads an import() type` と `typeof import("../other/x.js")` の型 export）が `TypeError` で落ちたのはこれで、1 を
   直しても残る。`node.source` を先に読むように直すと、
   `function-imports.test.ts` と `tier.test.ts` の 570 件が通った

1 の結果、Function が `import x from "./y.json" assert { type: "json" }` と書くと柵の parse が失敗する。柵は parse の失敗を
「does not parse」として報告するので、黙って通すのではなく止める側に倒れる。`functions/**` に `assert` の import は無く、
標準の書き方（`with { type: "json" }`）は Babel 8 でも読める。

正しい変更は「bump + 柵の 2 か所の修正」で、bot が作れる diff には収まらない。**#3912 を close し、同じ bump と
`function-imports.ts` の修正を 1 本の差し替え PR で入れる**ことを推奨する。判定は採用なので `@dependabot ignore` は
設定しない。差し替え PR では、上の 2 か所に加えて、plugin の一覧の前にあるコメント（「`assert` on an import」）も
直す。bot PR の Check は typecheck で止まっているので、app などのテストと build は差し替え PR の CI で初めて確かめる
ことになる。

**保留を選ばない理由**: 修正は 1 ファイル 3 行程度で、柵のテストがその正しさを直接確かめる。Babel 7 は 7.x branch で
保守が続いているが、待っても bot の diff は直らず、毎週同じ PR が出る。

### #3900 `@types/vscode` 1.140.0 → 1.146.0（却下を推奨）

供給側の懸念は無い（DefinitelyTyped の `types` account、差分は型定義だけ）。止まっている理由は前回の #3852 と同じ:

- ADR-2562 は `@types/vscode` と `engines.vscode` を同値に保つ。Dependabot は `engines.vscode` を書き換えないので、
  bot PR は構造的に片側だけの移動になる
- `engines.vscode` も上げる差し替え PR は ADR-2782 の上限に当たる。karasu が使う `vscode-extension-tester` 8.28.1 の
  `vscode-max` は 1.140.0

ADR-3870 と同じ形で、**bot PR を close する**。`@dependabot ignore` は設定しない。

状況は動き始めている。`vscode-extension-tester` 8.29.0（11-19 公開）で `vscode-max` が 1.147.0、`vscode-min` が
1.145.3 になった。8.29.0 は今回の cooldown（7 日）の内側なので、この週の bump には入っていない。来週以降に Dependabot が
8.29.0 を出せば、floor を 1.146 まで上げられる。ただし `vscode-min` が 1.145.3 なので、ExTester を 8.29 に上げると
floor 1.140 での ExTester 実行ができなくなる可能性がある。floor を動かす判断は #3070 で行う。

### #3899 `dompurify` 3.4.17 → 3.4.18（差し替え PR での採用を推奨）

app の runtime 依存で、`ChatPane` / `NodeDetailPanel` / `EdgeDetailPanel` が `marked` の出力を
`DOMPurify.sanitize(raw)`（既定の設定）で通す。3.4.18 は `SAFE_FOR_TEMPLATES` の bypass の修正、SVG の許可リストから要素で
ない名前を外す変更、clobbering check の修正、hook で広げた許可リストが残る問題の修正など。

**upstream の advisory が 2 件あるが、GitHub の global DB にはまだ載っていない**ので、Dependabot alert にはなっていない:

| advisory            | 公開  | 深刻度 | 脆弱範囲 → 修正版   | 内容                                                                   |
| ------------------- | ----- | ------ | ------------------- | ---------------------------------------------------------------------- |
| GHSA-qm7q-q8h9-jg8q | 11-14 | medium | `< 3.4.18` → 3.4.18 | `SAFE_FOR_TEMPLATES` の bypass（入れ子の `<form>` と孤立した終了タグ） |
| GHSA-hrxw-jjj6-2g2j | 11-23 | low    | `< 3.5.0` → 3.5.0   | `SAFE_FOR_TEMPLATES` の bypass（入れ子の `<form>`）                    |

どちらも `SAFE_FOR_TEMPLATES` を有効にしたときだけの問題で、karasu はこの option を使っていない（`packages/app/src` に
該当なし）。3.4.18 で 1 件目が直る。2 件目の修正版 3.5.0 は 11-22 公開で cooldown の内側なので、来週の bump を待つ。

`.claude/rules/dependabot.md`「Security alert 時は advisory の脆弱範囲を override / 宣言レンジと突き合わせる」は alert を
処理したときの規則で、今回は alert が無い。それでも同じ突き合わせをした:

| 確認                                  | 結果                                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `pnpm-workspace.yaml` の `overrides:` | `dompurify: ^3.4.16`。2 件とも脆弱範囲と交差する                                                          |
| 宣言（`packages/*/package.json`）     | `packages/app` の `"dompurify": "^3.4.17"`。#3899 で `^3.4.18` に上がる                                   |
| #3899 の head の lock                 | `packages/app` の importer は `specifier: ^3.4.16`、`version: 3.4.18`。`dompurify@` は 3.4.18 の 1 版だけ |

**override が宣言を置き換えるので、#3899 だけでは実効のレンジは `^3.4.16` のまま変わらない。** lock の importer の
`specifier` が override の値になっていることがその証拠で、宣言を `^3.4.18` に上げても 1 件目の脆弱範囲（`< 3.4.18`）との
交差は解けない。今の解決は 3.4.18 で、pnpm の既定の解決（highest）なら lock を作り直しても下がらないが、override のレンジ自体は
脆弱版を許したままになる。規則の手順 3（交差するレンジは patched 版へ上げ、override だけ・宣言だけを据え置かない。ADR-2404「却下した案」）に
従い、**override の floor も `^3.4.18` に上げる**ことを推奨する。

Dependabot は `overrides:` を書き換えないので、bot の diff では floor が動かない。**#3899 を close し、宣言と
override の floor を `^3.4.18` に上げる bump を 1 本の差し替え PR で入れる**（ADR-2115 と同じ形）。判定は採用なので
`@dependabot ignore` は設定しない。2 件目（`< 3.5.0`）とは floor を上げても交差したままだが、修正版 3.5.0 は cooldown の
内側にある。3.5.0 は来週以降の bump で入れ、そのときに floor を `^3.5.0` に上げる。

### #3909 `@astrojs/starlight` 0.42.10 → 0.43.1

0.43.0 には BREAKING が 1 つと「potentially breaking」が 2 つある:

- **scoped style の既定が `"where"` から Astro の既定（`"attribute"`）に変わった**。docs-site は `Footer` を override して
  scoped `<style>` を持つ（`packages/docs-site/src/components/Footer.astro`）が、class を子コンポーネントへ渡していないので、
  移行ガイドの「`class` を渡す」の注意には当たらない。上記のとおり 12 枚のスクリーンショットがピクセル単位で一致した
- **`ThemeSelect` の内部 API の削除**: docs-site は `ThemeSelect` を override していない
- **`i18next` 27 への更新**: starlight の翻訳 API を直接使っていない。karasu 自身は `i18next` に依存していない

0.43.1 は `<Aside>` のアイコンの大きさの regression の修正。transitive では `@astrojs/mdx` 8.1.6、`@astrojs/sitemap`
3.7.5 → `sitemap` 10.0.0（major。`engines.node` `>=22.22.1`、同じ publisher）、`i18next` 27.1.3 などが動く。#3903 と同じく
`packages/docs-site` と lock を触る。

### #3903 `astro` 7.4.8 → 7.4.12

修正だけ（`getStaticPaths()` の `%` / `\` を含む param、CSP の `strictDynamic`、`X-Forwarded-*` の検証、dev server の不正な
percent-encoding を 400 に、build のメモリ削減、`@astrojs/*` 依存の pin を外す、など）。上記の `@astrojs/runtime` /
`@astrojs/vite-plugin-astro` の切り出しを含む。transitive に `vite` 8.3.8 と `rolldown` 1.2.19 を連れてくるので、#3906 と
lock が重なる。docs-site のビルドを手元で確かめた。

### #3898 `jsdom` 31.0.0 → 31.0.1

computed style や selector 照合の性能改善と、`tabIndex` / CSS `ident()` / `max-lines` の直列化の修正。前回 #3874 で
直した `PreviewPane.test.tsx` を含む app のテストが green。`undici` 8.12.4 は override の `undici@8: ^8.12.2` を満たす。

### #3901 `@anthropic-ai/sdk` 1.7.0 → 1.9.0

API の型の追加（RBAC Role、Claude Tag の Bundle と metrics など）と修正。streaming の tool input で JSON でない文字を
拒否するようになったが、karasu の app は `client.messages.create` を streaming なしで呼ぶ（`useChatSession.ts`）。
agent toolset の修正は上記のとおり karasu の経路に無い。ADR-2671 の assumption は `^1.` なので 1.9.0 で成立する。
transitive は `@babel/runtime` 7.29.14 だけ。

### #3913 `lucide-react` 1.70.0 → 1.73.0

アイコンの追加（`trap`、`graph-ring`、`layout-grid-plus`、`mound-shovel`、`text-pen`、`route-arrow-right`）と、1.72.0 の
`route` アイコンの左右反転。karasu は `Route` を import していない。tarball の差分はアイコンのファイルだけ。

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

## 対象外の観測

- open な alert #104（`glob`）と #106（`minimatch`）は今回の bump では解消しない。引き続き `/hane:security-alert` で扱う
- `dompurify` 3.5.0 と `vscode-extension-tester` 8.29.0 は cooldown の内側にあり、来週以降の bump になる

## 現時点の方針

**16 件を採用し、#3900 を却下（close）する。** 採用のうち 14 件は bot PR をそのままマージし、#3899 と #3912 は
差し替え PR で入れる。

マージの手順（ADR-3870 の lock の事故を繰り返さないための手順を含む）:

1. bot PR 14 本と差し替え PR 2 本はすべて `pnpm-lock.yaml` を触るので、1 本ずつマージする。各マージの直前に
   `git fetch` し、PR の merge-base がその時点の `origin/main` と一致することを確かめる。一致しなければ bot PR は
   `@dependabot rebase` を頼み、差し替え PR は `origin/main` を merge して lock を作り直し、新しい head の CI を待つ。
   GitHub の MERGEABLE は文字列の衝突しか見ないので、それだけを根拠にしない
2. head を `--match-head-commit` で固定してマージする。`--match-head-commit` は PR の head しか固定しないので、確かめて
   からマージするまでのあいだに別の PR が main の lock を変えていないことを、マージの直前にもう一度 `git fetch` して
   確かめる（このバッチの作業中は、lock を触るほかの PR をマージしない）。rebase で lock の対象版が繰り上がったら、
   同じ手順で確かめ直す
3. #3900 は ADR-3870 と #3070 を引いてコメントし、close する（ignore は設定しない）。コメントには ExTester 8.29.0 の
   `vscode-max` 1.147.0 も書く
4. #3899 は close し、`packages/app` の宣言と `pnpm-workspace.yaml` の override の floor を `^3.4.18` に上げる差し替え PR を
   出す。lock の `packages/app` の importer が `specifier: ^3.4.18` になり、`dompurify@` が 3.4.18 の 1 版だけであることを
   確かめる
5. #3912 は close し、`@babel/parser` 8.1.2 の bump と `function-imports.ts` の修正を 1 本の差し替え PR で出す
6. 差し替え PR を含む全部をマージしたら、main で `pnpm install --frozen-lockfile` を実行し、lock が壊れていないこと
   （重複した key が無いこと）を確かめる
7. 結果を ADR に昇格させ、本 Design Doc を削除する

## Reviewer に判断を仰ぎたい点

1. **#3912（Babel 8）を差し替え PR で入れるか、保留するか。** 推奨は差し替え PR。Babel 8 では `assert` 付きの import を
   柵が読めなくなる（読めなければ止める側に倒れる）ので、それを受け入れてよいか
2. **#3899（`dompurify`）で override の floor を `^3.4.18` に上げるか。** 推奨は上げる（差し替え PR）。override が宣言を
   置き換えるので、bot PR だけでは実効のレンジが脆弱範囲と交差したまま残る。karasu は `SAFE_FOR_TEMPLATES` を使わないので
   当たらない advisory だが、規則の手順どおりに floor を合わせておくか、3.5.0 を入れる来週まで floor の変更を待つか
