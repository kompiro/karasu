# Dependabot トリアージ 2026-10-19

- **日付**: 2026-10-19
- **ステータス**: 検討中
- **関連**:
  - 対象 Dependabot PR: [#3291](https://github.com/kompiro/karasu/pull/3291) / [#3292](https://github.com/kompiro/karasu/pull/3292) / [#3293](https://github.com/kompiro/karasu/pull/3293) / [#3294](https://github.com/kompiro/karasu/pull/3294) / [#3295](https://github.com/kompiro/karasu/pull/3295) / [#3296](https://github.com/kompiro/karasu/pull/3296) / [#3297](https://github.com/kompiro/karasu/pull/3297) / [#3298](https://github.com/kompiro/karasu/pull/3298) / [#3299](https://github.com/kompiro/karasu/pull/3299) / [#3300](https://github.com/kompiro/karasu/pull/3300) / [#3301](https://github.com/kompiro/karasu/pull/3301) / [#3302](https://github.com/kompiro/karasu/pull/3302)
  - 前回トリアージ: [ADR-3242](../adr/3242-dependabot-triage-2026-10-15.md)（gh-aw は 10-21 以降に再生成と決めた）
  - gh-aw の再生成規則: [ADR-2753](../adr/2753-dependabot-triage-2026-09-07.md)、`.claude/rules/dependabot.md`
  - 判定語彙: [ADR-2474](../adr/2474-dependabot-replacement-pr-vocabulary.md)、cooldown 7 日: [ADR-784](../adr/784-update-dependencies-20260421.md)

## 背景・課題

2026-10-19（月）21:44–21:49 UTC に週次の Dependabot PR が 12 件起票された（github-actions 1 件、npm 11 件）。
security update ではない（`security` ラベル無し、open な Dependabot alert は 0 件）。

npm 11 件はすべて CI green で、どれも main（`b99daf5d`）を base にしている。gh-aw の 1 件は
`gh-aw-lock-consistency.test.ts` で Check が落ちている。

## 一覧

| PR | 依存 | from → to | bump | CI | リスク | 推奨 |
| --- | --- | --- | --- | --- | --- | --- |
| #3292 | `vitest` / `@vitest/coverage-v8`（全 package、dev） | 5.0.3 → 5.0.4 | patch | green | low | 採用（そのままマージ） |
| #3293 | radix group（`react-dialog` / `react-dropdown-menu` / `react-tabs` / `react-tooltip`、app） | 1.2.0 → 1.3.1 ほか | minor | green | low | 採用（そのままマージ） |
| #3294 | `@anthropic-ai/sdk`（app） | 0.132.1 → 0.133.0 | minor (0.x) | green | low | 採用（そのままマージ） |
| #3295 | `knip`（root、dev） | 6.40.0 → 6.41.0 | minor | green | low | 採用（そのままマージ） |
| #3296 | `@astrojs/starlight`（docs-site、dev） | 0.42.5 → 0.42.6 | patch | green | low | 採用（そのままマージ） |
| #3297 | `marked`（app / vscode） | 18.1.0 → 18.1.1 | patch | green | low | 採用（そのままマージ） |
| #3298 | `dompurify`（app） | 3.4.16 → 3.4.17 | patch | green | low | 採用（そのままマージ） |
| #3299 | `@types/node`（全 package、dev） | 26.6.4 → 26.6.5 | patch | green | low | 採用（そのままマージ） |
| #3300 | `lucide-react`（app） | 1.53.0 → 1.55.0 | minor | green | low | 採用（そのままマージ） |
| #3301 | `lefthook`（root、dev） | 2.2.0 → 2.2.1 | patch | green | low（2.2.2 になった場合は medium） | 採用（そのままマージ、rebase 前に先にマージ） |
| #3302 | `smol-toml`（core） | 1.9.0 → 1.9.1 | patch | green | low | 採用（そのままマージ） |
| #3291 | `github/gh-aw-actions/setup` | 0.89.21 → 0.91.9 | minor | Check red | 対象外 | 却下（10-21 以降に再生成） |

## 全件に共通する確認結果

**供給側（配布主体・改ざん）の懸念は、#3301 が rebase で 2.2.2 に上がった場合の 1 点を除いて見つからなかった。**

- **publisher / maintainer**: to 版の publisher の種類は from 版と同じ。GitHub Actions OIDC + provenance でないのは
  `knip` / `unbash`（個人アカウント `webpro`）、`dompurify`（`cure53`）、`i18next`（`adrai`）、`@types/node`（`types`）で、
  いずれも過去の版から同じ。maintainer 一覧の変化は無い
- **lifecycle script**: to 版で追加・変更されたものはゼロ。既存は `lefthook` の `postinstall: node postinstall.js`
  （`pnpm-workspace.yaml` の `allowBuilds` で `lefthook: true`、前後で `postinstall.js` は不変）と、registry install では
  走らない `prepare: husky`（`formatly` / `i18next` / `dompurify`）だけ
- **コード差分**: `npm diff` で from…to の tarball を比べ、追加行を `child_process` / `eval` / `new Function` /
  `process.env` / `fetch(` / base64 decode / 外部 URL で grep し、該当箇所を読んだ。`vitest` は chunk のハッシュ名が
  変わるため追加行が 6 万行出るが、パッケージ全体での各パターンの出現数は 5.0.3 と 5.0.4 で同じだった（URL だけ +2：
  CACHEDIR.TAG の仕様ページと pnpm の issue）。`formatly` 0.11.4 の `child_process` 増加は dprint 用 formatter の追加で、
  knip の `--format` でしか呼ばれない（karasu は使っていない）
- **既知 advisory**: to 版すべてで該当ゼロ
- **公開からの経過**: すべての to 版と、transitive で新しく入る版が起票時点で cooldown 7 日を越えている。最も際どいのは
  radix の 1.3.1 系（10-12 21:02–21:04 UTC 公開、起票の 45 分前に 7 日経過）と `postcss` 8.5.30（10-12 20:38 UTC）
- **依存エッジ**: lock の snapshot を peer suffix を落として merge-base と各 PR ヘッドで突き合わせた（bump 対象自身の
  行も含めた）。main の lock に無いパッケージ名が新しく入る PR は 0 件

## PR ごとの分析

### #3292 vitest group（5.0.3 → 5.0.4）

新しく入る版: `@vitest/*` 5.0.4、`@vitest/istanbul-lib-*` 1.0.2、`ast-v8-to-istanbul` 1.0.7、`tinybench` 6.2.2、
`tinyrainbow` 3.2.0。`obug` 3.0.0 への乗り換えがあるが、3.0.0 は既に lock にある版。すべて vitest org の OIDC + provenance。
変更は experimental 機能（trace viewer、`--changed`、依存キャッシュ）と修正。

### #3293 radix group

`react-dialog` 1.2.0 → 1.3.1、`react-dropdown-menu` 2.1.25 → 2.2.1、`react-tabs` → 1.2.1、`react-tooltip` → 1.4.1。
1.3.0 / 2.2.0 系は `exactOptionalPropertyTypes` 対応で optional prop に明示 `undefined` を許す型変更、1.3.1 / 2.2.1 系は
その型の regression 修正。lock の新しい版は 21 件で、すべて `@radix-ui/*`。bump 後も **各 primitive は 1 版だけ**で、
#3199（primitive set の揃え）の状態を崩さない（lock の `@radix-ui/*` key を名前ごとに数えて重複 0 を確認）。

### #3294 `@anthropic-ai/sdk`（0.132.1 → 0.133.0）

追加のみ（Managed Agents と analytics の型）。karasu が使うのは `client.messages.create` だけ。依存エッジの変化なし。

### #3295 knip（6.40.0 → 6.41.0）

knip 自身に加え、`unbash` 4.0.12 → 5.1.0（major、knip と同じ作者 `webpro`）、`formatly` 0.7.1 → 0.11.4、
`oxc-parser` 0.150.0 → 0.153.0（binding 19 件）、`smol-toml` 1.9.1、`zod` 4.6.7 が knip の部分木で動く。knip 6.41.0 の
changelog に「Migrate shell script parsing to unbash v5」「Handle updated Formatly result types」があり、upstream が
意図して上げたもの。`fdir` への依存が外れた。CI の knip ジョブは green（ADR-3242 で外した entry 以外の hint は出ていない）。

### #3296 `@astrojs/starlight`（0.42.5 → 0.42.6）

docs-site の部分木で `i18next` 26.4.4、`postcss` 8.5.30、`zod` 4.6.7、`@types/node` 24.19.2 / 26.6.5 にも再解決される
（どれも修正版、`postcss` の差分は source map の 1 行）。**CI は docs-site をビルドしない**ので、ローカルで merge-base と
PR ヘッドの両方を `pnpm --filter ./packages/docs-site build` し、`_astro/` のハッシュ・Astro / Starlight の版文字列・
Astro の scope class（`astro-xxxxxxxx`）を正規化して比べた。**73 ページの HTML がすべて一致**し、WARN も main と
同じ 2 件だった。CSS（`anchor-links.css` / `asides.css`）は starlight 側の微修正で変わる。

### #3297 marked（18.1.0 → 18.1.1）

CommonMark 準拠の修正 9 件と `walkTokens` の線形化。app では markdown を `DOMPurify.sanitize` に通してから描画している
（`ChatPane` / `NodeDetailPanel` / `EdgeDetailPanel`）ので、パース結果の変化はサニタイズの手前に留まる。vsce 経由の
`marked` も同じ版に揃う。

### #3298 dompurify（3.4.16 → 3.4.17）

`IN_PLACE` モードと namespace 判定の hardening（instance の own property を経由せず `Element.prototype` の getter で
`namespaceURI` / `tagName` を読む。GHSA-x4vx-rjvf-j5p4 と同根）と、SMIL `attributeName` の修正。karasu は `IN_PLACE` を
使っていない。`dependencies` に `@types/trusted-types` が追加された（以前は `optionalDependencies` のみ。型定義だけの
パッケージで、lock 上の版は 2.0.7 のまま）。

`pnpm-workspace.yaml` の `dompurify: ^3.4.16` は今回 advisory が無いので据え置く（lock は 3.4.17 に解決する）。

### #3299 `@types/node`（26.6.4 → 26.6.5）

`util.styleText` の型に hex 色の配列を許す 1 か所だけ。

### #3300 lucide-react（1.53.0 → 1.55.0）

アイコンの追加のみで、削除されたファイルは 0。karasu が import する `ChevronRight` / `X` は残る。

### #3301 lefthook（2.2.0 → 2.2.1）

2.2.1 は OIDC + provenance。wrapper の差分は版文字列だけ。

**rebase すると 2.2.2 になりうる。** 2.2.2 は 10-20 09:47 UTC に cooldown を越える。そして **2.2.2 の wrapper
（`lefthook` パッケージ）だけが、maintainer `mrexox` の個人アカウントから provenance なしで publish されている**
（2.2.0 / 2.2.1 は GitHub Actions）。調べた結果:

- upstream の release workflow（run 38374933526）の `publish-npm` ジョブが失敗している。再実行の時点で
  `npm error You cannot publish over the previously published versions: 2.2.2` になっており、wrapper は手で publish された
- platform binary の 10 パッケージ（`lefthook-linux-x64` など）は 2.2.2 でも GitHub Actions OIDC + provenance
- wrapper の tarball は 2.2.1 との差分が `package.json` の版（自身と binary 10 件）と README だけで、`postinstall.js` は不変
- 2.1.15 も同じ形（wrapper だけ `mrexox` の手動 publish）で、その前後は OIDC に戻っている

実際に実行されるバイナリは provenance 付きで、wrapper の中身も 2.2.1 と同一なので、2.2.2 になっても改ざんの兆候は無い。
ただし「publisher の種類が変わった版」なので、推奨は **#3301 を最初に（rebase 不要なうちに）マージして 2.2.1 で入れる**。
rebase が必要になって 2.2.2 になった場合は、上の確認結果をもって採用してよいかを判断してほしい（下の「判断してほしいこと」）。

### #3302 smol-toml（1.9.0 → 1.9.1）

数値リテラルの指数部の符号（`1e+5`）の扱いを直す 1 か所。`packages/core/src/translate/wrangler.ts` が使う。
`pnpm-workspace.yaml` の `smol-toml: ^1.9.0` はそのままで lock は 1.9.1 に解決する（knip 経由の分は #3295 で 1.9.1 になる）。

### #3291 gh-aw-actions（0.89.21 → 0.91.9）: 却下

ADR-2753 の規則どおり却下する。bot は 2 つの `.lock.yml` の `uses:` 行だけを書き換えるので
`gh-aw-lock-consistency.test.ts` が 2 件落ちている（sha / 版と `actions-lock.json` の不一致、`compiler_version` の不一致）。
0.91.9 は github/gh-aw の prerelease。ADR-3242 で決めたとおり、非 prerelease の v0.91.12 が cooldown を越える
**10-21 以降に再生成**する（その時点で v0.92.0 も 10-22 に越えるので、作業日に応じて新しい方を選ぶ）。

## 現時点の方針

- npm 11 件は **採用（そのままマージ）**。差し替え PR が必要な件は無い（override の floor が脆弱範囲に入る件も、設定ファイルを
  同時に動かす必要がある件も無い）
- #3291 は **却下**（close。`@dependabot ignore` は付けない。再生成で入れる）

### マージの手順

11 件とも `pnpm-lock.yaml` を書き換えるので、1 本マージするごとに残りは `@dependabot rebase` が要る。

1. **#3301（lefthook）を最初に**マージする。今は main と同じ base なので rebase 不要で、2.2.1 のまま入る
2. 残りは 1 本ずつ `@dependabot rebase` → CI green → squash merge。マージ前に毎回、PR タイトルの版と、rebase 後の
   lock の依存エッジを main と比べる
3. rebase の時点で cooldown を越えている新しい版（rebase で版が上がりうるもの）:

| 依存 | 上がりうる版 | cooldown を越える日時（UTC） | 事前確認 |
| --- | --- | --- | --- |
| `lefthook` | 2.2.2 | 10-20 09:47 | 上記。wrapper は手動 publish、binary は provenance あり |
| `lucide-react` | 1.56.0 / 1.57.0 | 10-20 06:15 / 10-21 06:11 | OIDC + provenance、削除ファイル 0、疑わしい追加行 0 |
| `@anthropic-ai/sdk` | 0.134.0 | 10-21 17:17 | OIDC + provenance、疑わしい追加行 0（`dependencies` が 2 → 3 件、rebase 時に中身を確認） |
| `vitest` group | 5.0.5 | 10-22 14:29 | 未確認（rebase で上がったら確認） |
| `knip` | 6.42.0 | 10-25 13:44 | 対象外（その前にマージする想定） |

## 判断してほしいこと

1. npm 11 件をそのまま採用してよいか
2. **#3301 が rebase で lefthook 2.2.2 になった場合**の扱い:
   - (a) そのまま採用する（推奨。binary は provenance あり、wrapper は 2.2.1 と同一内容、upstream の publish 失敗で説明がつく）
   - (b) 2.2.1 に戻す差し替え PR にする
   - (c) 2.2.2 を `@dependabot ignore` して次の OIDC 版を待つ
3. #3291 を却下し、gh-aw の再生成は 10-21 以降に別 PR で行うことでよいか
