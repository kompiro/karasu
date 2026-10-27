---
id: ADR-3381
title: Dependabot トリアージ 2026-10-26：npm 12 件をそのまま採用し、chokidar 6 は保留、gh-aw-actions は却下する
status: accepted
date: 2026-10-27
topic: build
related_to:
  - ADR-3304
  - ADR-3242
  - ADR-2753
  - ADR-2472
  - ADR-2397
  - ADR-2447
  - ADR-2474
  - ADR-784
scope:
  packages: [app, cli, docs-site, e2e]
  concerns: [ci, dependencies, security]
---

# ADR-3381: Dependabot トリアージ 2026-10-26：npm 12 件をそのまま採用し、chokidar 6 は保留、gh-aw-actions は却下する

- **日付**: 2026-10-27
- **ステータス**: 決定済み
- **関連**:
  - Design Doc PR: [#3381](https://github.com/kompiro/karasu/pull/3381)（本 ADR に昇格し削除）
  - 対象 Dependabot PR: [#3366](https://github.com/kompiro/karasu/pull/3366) / [#3367](https://github.com/kompiro/karasu/pull/3367) / [#3368](https://github.com/kompiro/karasu/pull/3368) / [#3369](https://github.com/kompiro/karasu/pull/3369) / [#3370](https://github.com/kompiro/karasu/pull/3370) / [#3371](https://github.com/kompiro/karasu/pull/3371) / [#3372](https://github.com/kompiro/karasu/pull/3372) / [#3373](https://github.com/kompiro/karasu/pull/3373) / [#3374](https://github.com/kompiro/karasu/pull/3374) / [#3375](https://github.com/kompiro/karasu/pull/3375) / [#3376](https://github.com/kompiro/karasu/pull/3376) / [#3377](https://github.com/kompiro/karasu/pull/3377) / [#3378](https://github.com/kompiro/karasu/pull/3378) / [#3379](https://github.com/kompiro/karasu/pull/3379)
  - gh-aw の再生成 PR: [#3384](https://github.com/kompiro/karasu/pull/3384)（v0.92.0）
  - 前回トリアージ: [ADR-3304](./3304-dependabot-triage-2026-10-19.md)（lefthook 2.2.2 の手動 publish を採用可と判断、gh-aw の再生成は持ち越し）
  - gh-aw の再生成規則: [ADR-2753](./2753-dependabot-triage-2026-09-07.md)、[ADR-3242](./3242-dependabot-triage-2026-10-15.md)、`.claude/rules/dependabot.md`
  - 公開パッケージの Node 下限: [ADR-2397](./2397-node-24-baseline.md)、[ADR-2472](./2472-dependabot-triage-2026-08-13.md)（commander 15 で 22.12 に上げた前例）
  - 判定語彙: [ADR-2474](./2474-dependabot-replacement-pr-vocabulary.md)、cooldown 7 日: [ADR-784](./784-update-dependencies-20260421.md)

## 背景

2026-10-26（月）21:45–21:51 UTC に週次の Dependabot PR が 14 件起票された（github-actions 1 件、npm 13 件）。
security update ではない（`security` ラベル無し。open な Dependabot alert は 7 件あったが、どれも今回の PR の対象パッケージではない。
後述「対象外の観測」）。npm 13 件は CI green、gh-aw の 1 件は `gh-aw-lock-consistency.test.ts` で Check が落ちていた。
`[dep-triage]` の Issue や workflow の所見コメントは無かった。

**供給側（配布主体・改ざん）の懸念は見つからなかった。** 確認したこと:

- **publisher / provenance**: lefthook を除き、to 版の publisher の種類は from 版と同じ。GitHub Actions OIDC + SLSA provenance
  でないのは `knip`（`webpro`）と、その部分木の `unbash` 6.0.0（`webpro`）、jsdom の部分木の `@asamuzakjp/dom-selector` 10.0.4
  （`asamuzakjp`）で、いずれも過去の版から同じ。`lefthook` 2.2.2 の wrapper だけは 2.2.1（GitHub Actions OIDC + provenance）から
  `mrexox` の手動 publish（provenance なし）に変わっているが、これは ADR-3304 が採用可と判断した版そのもの。
  加えて lefthook 2.2.2 で新しく加わったパッケージが 1 つあり、これも provenance を持たない（後述「lefthook」）
- **lifecycle script**: to 版で追加・変更されたものはゼロ。既存は `lefthook` の `postinstall: node postinstall.js`（前後で不変）だけ。
  jsdom の `prepare`（wireit）は registry install では走らない。新しく入る transitive パッケージにも install 系 script は無い
- **コード差分**: `npm diff` で from…to の tarball を比べ、追加行を `child_process` / `eval` / `new Function` / `process.env` /
  `fetch(` / `atob` / base64 decode / `spawn` / `writeFileSync` / `homedir` / 外部 URL で grep し、該当箇所を読んだ。
  `vitest` と `oxfmt` は chunk のファイル名が変わるため追加行が数万行出るが、tarball 全体での各パターンの出現数は from と to で同じだった。
  `@anthropic-ai/sdk` の該当 2 行は OpenTelemetry 用の環境変数（`ANTHROPIC_OPEN_TELEMETRY_TRACES_MAX_CONTENT_BYTES`）の読み取り。
  追加された URL のドメインは各プロジェクトの docs（`platform.claude.com` / `lucide.dev` / `docs.astro.build` / `react.dev` など）と `github.com` だけ
- **既知 advisory**: to 版すべてと、新しく入る transitive の版すべてで該当ゼロ（GitHub Advisory API の `affects=`。
  クエリが効いていることは `undici@7.30.0` で 3 件返ることで確かめた）
- **公開からの経過**: すべての to 版と、transitive で新しく入る版が起票時点で cooldown 7 日を越えていた。
  最も新しいのは `chokidar` 6.0.0（10-19 20:52 公開、起票まで 7 日と 56 分）、`knip` 6.42.1 / `oxfmt` 0.74.0 / `oxlint` 1.89.0 / `astro` 7.4.1（いずれも 10-19）
- **依存エッジ**: lock の snapshot を peer suffix を落として merge-base と各 PR ヘッドで突き合わせた
  （`security-alert` skill の edges 手順）。main の lock に無いパッケージ名が新しく入るのは 3 PR の 4 件だけ:
  #3376 の `lefthook-android-arm64`、#3377 の `@opentelemetry/api`、#3375 の `tinyps` と `fnv1a-64`。
  それ以外の PR は、bump 対象とその専属の部分木（native binding 一式など）が版を変えるだけだった

| PR | 依存 | from → to | 種別 | CI | リスク | 判定 |
| --- | --- | --- | --- | --- | --- | --- |
| #3379 | `@testing-library/user-event`（app、dev） | 14.6.7 → 14.6.8 | patch | green | low | 採用（そのままマージ） |
| #3378 | `oxlint`（root、dev） | 1.87.0 → 1.89.0 | minor | green | low | 採用（そのままマージ） |
| #3377 | `@anthropic-ai/sdk`（app） | 0.133.0 → 0.135.0 | minor (0.x) | green | low | 採用（そのままマージ） |
| #3376 | `lefthook`（root、dev） | 2.2.1 → 2.2.2 | patch | green | low | 採用（そのままマージ） |
| #3375 | `astro`（docs-site、dev） | 7.3.8 → 7.4.1 | minor | green | low | 採用（そのままマージ） |
| #3374 | `jsdom`（app、dev） | 30.1.2 → 30.1.3 | patch | green | low | 採用（そのままマージ） |
| #3373 | `chokidar`（cli、**dependencies**） | 5.0.0 → 6.0.0 | **major** | green | **medium** | **保留** |
| #3372 | `knip`（root、dev） | 6.41.0 → 6.42.1 | minor | green | low | 採用（そのままマージ） |
| #3371 | `oxfmt`（root、dev） | 0.72.0 → 0.74.0 | minor (0.x) | green | low | 採用（そのままマージ） |
| #3370 | `@playwright/test`（root / e2e、dev） | 1.64.0 → 1.64.1 | patch | green | low | 採用（そのままマージ） |
| #3369 | `lucide-react`（app） | 1.55.0 → 1.59.0 | minor | green | low | 採用（そのままマージ） |
| #3368 | vitest group（`vitest` / `@vitest/coverage-v8`、全 package、dev） | 5.0.4 → 5.0.5 | patch | green | low | 採用（そのままマージ） |
| #3367 | react group（`react` / `react-dom`、app） | 19.3.0 → 19.3.1 | patch | green | low | 採用（そのままマージ） |
| #3366 | `github/gh-aw-actions/setup` | 0.89.21 → 0.92.5 | minor | Check red | 対象外 | 却下（再生成で上げる） |

## 決定

**npm 12 件はそのままマージし、chokidar 6（#3373）は保留、gh-aw-actions の bot PR（#3366）は却下して v0.92.0 で再生成する。**
差し替え PR が必要な件は今回は無かった。chokidar 6 は将来、Node 下限の sweep を同梱した差し替え PR で採用する（後述）。

**lefthook 2.2.2 は ADR-3304 の判断を適用して採用する。ADR-3304 は覆さず、platform の範囲を限った判断として本 ADR に記録する。**
ADR-3304 は 2.2.2 の platform binary を「10 パッケージ」と書いたが、実際は 11 パッケージで、`lefthook-android-arm64` が 2.2.2 で
新しく加わっている。この 1 つだけは provenance を持たない（下記）。それでも採用してよいのは、本判断の対象 platform を
karasu の開発と CI が動く linux（devcontainer と GitHub Actions の runner）・macOS・Windows に限るからである。
この範囲では、実行されうる binary の出所はすべて provenance で確認でき、provenance を持たない新規パッケージはインストールされない。
将来 Android（Termux など）で開発する人が出たら、provenance のない binary が実行される環境になるので、改めて判断する。

### chokidar 5 → 6（#3373）: 保留

今回のバッチで唯一、公開パッケージ（`karasu` CLI）の**実行時依存**が major で動く。`packages/cli/src/watcher.ts` が
`karasu serve` のファイル監視に `watch(dir, { ignoreInitial: true, persistent: true })` と `change` / `add` / `unlink` だけを使う。
esbuild では `--external:chokidar` なので、利用者の環境に入るのは chokidar 6 そのものになる。

供給側は問題ない（GitHub Actions OIDC + provenance、`paulmillr` の承認つき trusted publishing。5.0.0 と同じ配布経路）。懸念は次の 2 点:

1. **Node の下限が食い違う。** chokidar 6.0.0 は `engines.node: ">= 22.22"` を宣言する（5.0.0 は `>= 20.19.0`）。
   karasu の公開パッケージは `engines.node: ">=22.12"`（ADR-2397 / ADR-2472、`scripts/ci/node-version-policy.test.ts` が全 workspace で
   一致を検査する）。bot PR のままマージすると、22.12〜22.21 の利用者に「動く」と約束しながら依存側は対象外と言っている状態になる。
   CI は Node 24 で回るので、この食い違いは green のまま残る（policy test は依存の `engines` までは見ない）
2. **6.0.0 は監視部分の書き直しで、公開から 1 週間で regression 報告が出ている。** release notes は「単一の観測パイプラインに書き直し、
   `fs.watch({ recursive: true })` を使う native backend を追加」と書く。10-22 に v6 起因の Issue が 3 件立ち（#1496 Electron の
   timer、#1497 `pollingInterval: 0`、#1498 Windows の `BigIntStats`）、修正 PR が open のまま 6.0.1 は未公開だった。
   karasu の使い方（既定 backend、`change` / `add` / `unlink` の path だけ読む）に直接当たるものは無いが、#1498 は Windows の
   初回スキャンの `add` に関わる

bot PR は open のまま残す。6.0.x の修正版が cooldown を越えて Dependabot が PR を更新したときに、ADR-2472 の commander 15 と
同じ形で採用する: Node 下限を `>=22.22` に上げる sweep（`packages/core` / `packages/cli` の `engines`、esbuild `--target` 2 箇所、
policy test の `ENGINES_FLOOR`、assumption で現在の下限を grep している ADR-2397（`packages/core/package.json`）と
ADR-2472（`ENGINES_FLOOR = "22.12"`）の frontmatter）を bump と同じ PR に入れる差し替え PR にする。sweep の取りこぼしは
`node-version-policy.test.ts` と `pnpm adr:check-assumptions` が検出する。
22.22 は Node 22（maintenance LTS、2027-04 まで）の中での絞り込みなので、ADR-2397 の「EOL したラインだけを落とす」原則には反しない。

### gh-aw-actions（#3366）: 却下

bot は 2 つの `.lock.yml` の `uses:` 行だけを書き換えるので `gh-aw-lock-consistency.test.ts` が 2 件落ちる（ADR-2753）。
加えて 0.92.5 は github/gh-aw の prerelease。`@dependabot ignore` は付けずに close した。

再生成は ADR-3242 から 2 回持ち越していたので、起票時点で cooldown を越えた非 prerelease の最新である **v0.92.0**（10-15 公開）で
今回のうちに再生成した（#3384）。次の v0.93 系は次の週次で同じ手順で上げる。

## 理由

- 12 件とも upstream の変更が修正・追加中心で、karasu の使い方に当たる破壊的変更が無かった:
  - **lefthook 2.2.2**: wrapper の tarball は 2.2.1 との差分が `package.json`（版と optionalDependencies）と README だけで、
    `postinstall.js` は不変。新しく加わった `lefthook-android-arm64` は 10-13 09:40 に `0.0.0-stage` で作成され、同日 09:42 に 2.2.1、
    09:44 に 2.2.2 が `mrexox` の個人アカウントから provenance なしで publish された（他の 10 binary は 2.2.2 でも OIDC + provenance）。
    upstream の経緯は説明がつく（lefthook PR #1591「packaging: add support for android」と、リリースコミット
    「2.2.2: … release android NPM package」）。npm の trusted publishing は既存パッケージにしか設定できないので、新規パッケージの
    初回は手で publish するしかない。`os: android` / `cpu: arm64` なので pnpm は linux / macOS / Windows では取得もしない
    （手元の linux arm64 の `node_modules/.pnpm` にある lefthook の binary は `lefthook-linux-arm64` だけだった）。
    lefthook は root の devDependency で公開物にも入らない
  - **`@anthropic-ai/sdk` 0.135.0**: 0.134.0 で OpenTelemetry tracing の native 対応が入り、`dependencies` に `@opentelemetry/api`
    （lock では 1.9.1、open-telemetry 公式・OIDC + provenance）が加わる。SDK が span を作るのはアプリがグローバルな tracer provider を
    登録したときだけで、karasu の app は登録していない（provider が無ければ no-op）。karasu が使うのは `client.messages.create` と `APIError` だけ
  - **astro 7.4.1**: 部分木の動きが今回で最も大きい（`unifont` 0.7.5 → 1.0.3、`devalue` 5 → 6、`@astrojs/compiler-rs` 0.5.2 など）。
    新しく入る `tinyps`（tinylibs）と `fnv1a-64`（`danielroe`）はどちらも OIDC + provenance、install script なし。CI は docs-site を
    ビルドしないので、merge-base と PR ヘッドの両方でローカルにビルドし、`_astro/` のハッシュ・版文字列・Astro の scope class を
    正規化して比べた。73 ページの HTML がすべて一致し、WARN も main と同じ 2 件だった
  - **jsdom 30.1.3**: 性能改善と `XMLHttpRequest` の cross-origin redirect 時の credential / cookie の扱いの修正。部分木で
    `@asamuzakjp/dom-selector` が 9.2.4 → 10.0.4（major、同じ作者、diff に危険パターンなし）。app の devDependency だけ
  - **knip 6.42.1**: 部分木で `unbash` 5.1.0 → 6.0.0（major、同じ作者 `webpro`）と `oxc-parser` 0.153 → 0.154 が動く。CI の `knip` は green
  - **oxlint 1.89.0 / oxfmt 0.74.0**: oxlint は多数の plugin rule を recommended に昇格させたが `--deny-warnings` で新しい指摘は無い。
    oxfmt は `--check` が green で整形差分が出ないので、ADR-2447 の整形同梱は不要だった
  - **その他**: user-event 14.6.8（`null` 入力値の修正 1 件）、Playwright 1.64.1（regression 修正 2 件）、lucide-react（アイコンの追加のみ、
    karasu が import する `ChevronRight` / `X` は残る）、vitest 5.0.5（バグ修正のみ）、react 19.3.1（RSC の transport の改善 1 件、
    karasu は RSC を使わず `react-dom` の client 側の差分は版文字列だけ）
- chokidar 6 は、得るもの（karasu の使い方に当たる修正）が確認できない一方で、公開パッケージの Node 下限と食い違い、書き直し直後の
  regression も出ている。修正版を待っても失うものが無い

## 反映

ユーザー判断（2026-10-27、Design Doc PR #3381 のマージ）: npm 12 件をそのまま採用する。#3373 は保留する。#3366 は却下し、v0.92.0 で再生成する。

- npm 12 件を #3379 → #3378 → #3377 → #3367 → #3376 → #3375 → #3374 → #3368 → #3372 → #3371 → #3370 → #3369 の順に
  squash merge した（10-27 12:25 〜 15:56 UTC）。原則として 1 本ごとに `@dependabot rebase` → CI green → マージの前に PR タイトルの版と
  rebase 後の lock の依存エッジを main と比べた
- rebase で版が変わったのは 2 件で、どちらもトリアージ時に確認した範囲に収まった:
  - #3369 `lucide-react` は 1.60.0 で入った（Design Doc の時点で事前確認済みの版）
  - #3372 の部分木の `unbash` は 6.0.1 で入った（10-20 公開、`webpro`、6.0.0 と同じく provenance なし、install script なし。
    差分は ANSI-C quoting のバイト列デコードの修正と README のバッジだけ）
- rebase で、依存元が「グラフに既にある別の版」へ乗り換えたものが 3 件あった。いずれも先にマージした PR が持ち込んだ版で、
  トリアージ時にその PR の部分木として確認済み:
  - #3374: `jsdom → undici` 7.30.0 → 7.30.1（#3375 の `unifont` が持ち込んだ patched 版）、`vite → rolldown` 1.2.13 → 1.2.14
    （vite の宣言 `~1.2.12` の範囲内。#3375 の部分木の版で OIDC + provenance。app のバンドラーなので、ビルドした app で回る
    Playwright が green なことも確認した）
  - #3368: `@astrojs/mdx → es-module-lexer` 3.0.3 → 3.0.4（#3375 の部分木の版。docs-site の devDependency だけ）
- #3372 は #3368 のマージの 10 秒後に、#3368 を含まない base のままマージされた（並行して同じキューを処理していたため）。
  2 本の lock の変更は重ならず、マージ後の main（`5248631d`）の CI は green だった
- #3366 を close した（ignore なし）。gh-aw は #3384 で v0.92.0 に再生成した（10-27 12:48 UTC マージ）
- #3373 は open のまま残した

## 運用上の学び

- **rebase 後の依存エッジの比較は、版が上がったかだけでなく、依存元の乗り換えも拾う。** 今回は先にマージした #3375 が
  持ち込んだ版へ、後続の PR の rebase で `jsdom` / `vite` / `@astrojs/mdx` が寄った。PR タイトルの版は変わらないので、
  タイトルだけを見ていると気づけない
- **1 つのマージキューは 1 つの主体が順に処理する。** 同じキューを 2 か所から進めると、片方が rebase を依頼している間に
  もう片方がマージし、rebase 前の base のままの PR が入る（#3372）。今回は lock の変更が重ならなかったので main は green のままだった

## 対象外の観測

### undici の override が vulnerable な版に固定している

open alert #101（`undici` GHSA-xjj6-f33q-929c、脆弱範囲 `>= 7.18.0, < 7.30.1`、10-25 起票）が lock の `undici@7.30.0` に当たっている。
`pnpm-workspace.yaml` の `overrides:` にある `undici: ^7.29.1` は、範囲の下限が脆弱範囲の内側にあり、
`.claude/rules/dependabot.md` が書く「override が脆弱版への固定装置として働く」形になっている。

さらに、この override は名前だけで全 undici に掛かるので、`undici` ^8 を要求する依存まで 7 系に押し戻している
（`jsdom` 30.1.3 は `^8.12.1`、astro 7.4.1 で入る `unifont@1.0.3` は `^8.0.0` を宣言するが、解決はどちらも 7.x）。
トリアージ時点では、#3375 のマージで `unifont` は `undici@7.30.1`（patched）に解決されるが、jsdom は 7.30.0 のまま残ると見ていた。
実際には #3374 の rebase で jsdom も 7.30.1 に寄り、lock から `undici@7.30.0` が消えて alert #101 は `fixed` になった。
ただし override の floor（`^7.29.1`）が脆弱範囲の内側にあることと、`^8` を要求する依存を 7 系に押し戻していることは残っている。
今回の PR はこの状態を作ったものでも直すものでもないので、`/hane:security-alert` で別に扱う。
open alert はほかに `launch-editor`（#94–#96）、`zod`（#97）、`serialize-javascript`（#98）、`@azure/msal-node`（#102）がある。

## 却下した案

### chokidar 6 を今すぐ差し替え PR で採用する（Node 下限の sweep を同梱）

書き直し直後の版を利用者の `karasu serve` に届けることになり、得るもの（karasu の使い方に当たる修正）は確認できなかった。

### chokidar 6 を却下して `@dependabot ignore this major version` を付ける

chokidar 6 は将来入れる前提なので ignore は合わない。

### gh-aw を 10-28 以降に v0.93.x で再生成する

v0.93 系は 10-21〜10-25 に非 prerelease が 5 版出ているので、待てば 1 回で新しい方に寄せられる。ただし再生成は ADR-3242 から
2 回持ち越していたので、持ち越しの回数を増やさないことを優先した。v0.93 は次の週次で同じ手順で上げればよい。

### lefthook 2.2.2 の判断を ADR-3304 の supersede として記録する

ADR-3304 の判断（実行される binary に provenance があり、手動 publish された wrapper の中身が前版と同一なら採用してよい）は
今回も成り立っており、覆す必要が無い。訂正は binary の数と、provenance の無い新規 binary が実行されない platform の範囲だけなので、
`related_to` で範囲を限った判断として残す。
