# Dependabot トリアージ 2026-10-26

- **日付**: 2026-10-26
- **ステータス**: 検討中
- **関連**:
  - 対象 Dependabot PR: [#3366](https://github.com/kompiro/karasu/pull/3366) / [#3367](https://github.com/kompiro/karasu/pull/3367) / [#3368](https://github.com/kompiro/karasu/pull/3368) / [#3369](https://github.com/kompiro/karasu/pull/3369) / [#3370](https://github.com/kompiro/karasu/pull/3370) / [#3371](https://github.com/kompiro/karasu/pull/3371) / [#3372](https://github.com/kompiro/karasu/pull/3372) / [#3373](https://github.com/kompiro/karasu/pull/3373) / [#3374](https://github.com/kompiro/karasu/pull/3374) / [#3375](https://github.com/kompiro/karasu/pull/3375) / [#3376](https://github.com/kompiro/karasu/pull/3376) / [#3377](https://github.com/kompiro/karasu/pull/3377) / [#3378](https://github.com/kompiro/karasu/pull/3378) / [#3379](https://github.com/kompiro/karasu/pull/3379)
  - 前回トリアージ: [ADR-3304](../adr/3304-dependabot-triage-2026-10-19.md)（lefthook 2.2.2 の手動 publish を採用可と判断、gh-aw の再生成は持ち越し）
  - gh-aw の再生成規則: [ADR-2753](../adr/2753-dependabot-triage-2026-09-07.md)、[ADR-3242](../adr/3242-dependabot-triage-2026-10-15.md)、`.claude/rules/dependabot.md`
  - 公開パッケージの Node 下限: [ADR-2397](../adr/2397-node-24-baseline.md)、[ADR-2472](../adr/2472-dependabot-triage-2026-08-13.md)（commander 15 で 22.12 に上げた前例）
  - 判定語彙: [ADR-2474](../adr/2474-dependabot-replacement-pr-vocabulary.md)、cooldown 7 日: [ADR-784](../adr/784-update-dependencies-20260421.md)

## 背景

2026-10-26（月）21:45–21:51 UTC に週次の Dependabot PR が 14 件起票された（github-actions 1 件、npm 13 件）。
security update ではない（`security` ラベル無し。open な Dependabot alert は 7 件あるが、どれも今回の PR の対象パッケージではない。後述「対象外の観測」）。
npm 13 件は CI green、gh-aw の 1 件は `gh-aw-lock-consistency.test.ts` で Check が落ちている。
`[dep-triage]` の Issue や workflow の所見コメントは無かった。

**供給側（配布主体・改ざん）の懸念は見つからなかった。** 確認したこと:

- **publisher / provenance**: lefthook を除き、to 版の publisher の種類は from 版と同じ。GitHub Actions OIDC + SLSA provenance
  でないのは `knip`（`webpro`）と、その部分木の `unbash` 6.0.0（`webpro`）、jsdom の部分木の `@asamuzakjp/dom-selector` 10.0.4
  （`asamuzakjp`）で、いずれも過去の版から同じ。`lefthook` 2.2.2 の wrapper だけは 2.2.1（GitHub Actions OIDC + provenance）から
  `mrexox` の手動 publish（provenance なし）に変わっているが、これは ADR-3304 が採用可と判断した版そのもの。
  加えて lefthook 2.2.2 で**新しく加わったパッケージ**が 1 つあり、これも provenance を持たない（後述 #3376）
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
- **依存エッジ**: lock の snapshot を peer suffix を落として merge-base（`a250c9da`）と各 PR ヘッドで突き合わせた
  （`security-alert` skill の edges 手順）。main の lock に無いパッケージ名が新しく入るのは 3 PR の 4 件だけ:
  #3376 の `lefthook-android-arm64`、#3377 の `@opentelemetry/api`、#3375 の `tinyps` と `fnv1a-64`。
  それ以外の PR は、bump 対象とその専属の部分木（native binding 一式など）が版を変えるだけだった

## 一覧

| PR | 依存 | from → to | 種別 | CI | リスク | 推奨 |
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

## PR ごとの分析

### #3373 chokidar 5.0.0 → 6.0.0（保留を推奨）

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
   timer、#1497 `pollingInterval: 0`、#1498 Windows の `BigIntStats`）、修正 PR が open のまま 6.0.1 は未公開。
   karasu の使い方（既定 backend、`change` / `add` / `unlink` の path だけ読む）に直接当たるものは無いが、#1498 は Windows の
   初回スキャンの `add` に関わる

**推奨は保留**（bot PR は open のまま残す）。6.0.x の修正版が cooldown を越えて Dependabot が PR を更新したときに、
ADR-2472 の commander 15 と同じ形で採用する: Node 下限を `>=22.22` に上げる sweep（`packages/core` / `packages/cli` の `engines`、
esbuild `--target` 2 箇所、policy test の `ENGINES_FLOOR`、ADR-2397 の assumption）を bump と同じ PR に入れる差し替え PR にする。
22.22 は Node 22（maintenance LTS、2027-04 まで）の中での絞り込みなので、ADR-2397 の「EOL したラインだけを落とす」原則には反しない。

代案:

- **今すぐ差し替え PR で採用する**（下限 sweep を同梱）。書き直し直後の版を利用者の `karasu serve` に届けることになり、
  得るもの（karasu の使い方に当たる修正）は確認できなかった
- **却下して `@dependabot ignore this major version`**。chokidar 6 は将来入れる前提なので ignore は合わない

### #3376 lefthook 2.2.1 → 2.2.2（採用。ADR-3304 の判断を適用、1 点訂正あり）

ADR-3304 が「wrapper が手動 publish でも、実行される binary が provenance 付きで wrapper の中身が前版と同一なら採用してよい」と
決めた版そのもの。wrapper の tarball は 2.2.1 との差分が `package.json`（版と optionalDependencies）と README だけで、`postinstall.js` は不変。

**訂正**: ADR-3304 は 2.2.2 の platform binary を「10 パッケージ」と書いたが、実際は **11 パッケージ**で、
`lefthook-android-arm64` が 2.2.2 で新しく加わっている。この 1 つだけ性質が違う:

- パッケージ自体が新規（10-13 09:40 に `0.0.0-stage` で作成、同日 09:42 に 2.2.1、09:44 に 2.2.2）
- `mrexox` の個人アカウントからの publish で、provenance なし（他の 10 binary は 2.2.2 でも GitHub Actions OIDC + provenance）
- upstream の経緯は説明がつく: lefthook PR #1591「packaging: add support for android」と、リリースコミット
  「2.2.2: … release android NPM package」。npm の trusted publishing は既存パッケージにしか設定できないので、
  新規パッケージの初回は手で publish するしかない（karasu も adr-tools の OIDC 移行で同じ初回 bootstrap を経験した）
- `os: android` / `cpu: arm64` なので、pnpm は linux / macOS / Windows では取得もしない。lock は全 platform の binary を
  `os` / `cpu` 付きで列挙するが、インストールされるのは一致する 1 つだけ。手元（linux arm64、main の 2.2.1）の `node_modules/.pnpm` に
  ある lefthook の binary は `lefthook-linux-arm64` だけで、oxlint / oxfmt の binding も linux-arm64-gnu の 1 つずつだった

実行されうる binary の出所はすべて provenance で確認でき、provenance を持たない新規パッケージは karasu の開発環境・CI では
インストールされない。ADR-3304 の条件は成り立つので採用でよい。

### #3377 @anthropic-ai/sdk 0.133.0 → 0.135.0（採用）

0.134.0 で「OpenTelemetry tracing の native 対応」が入り、`dependencies` に `@opentelemetry/api`（^1.4.1、lock では 1.9.1）が加わる。
`@opentelemetry/api` は open-telemetry 公式の 2020 年からあるパッケージで、1.9.1 は GitHub Actions OIDC + provenance。
SDK が span を作るのは**アプリがグローバルな tracer provider を登録したときだけ**で、karasu の app は登録していない
（API だけ入っていて provider が無い状態は no-op）。不要なら `openTelemetry: false` か `ANTHROPIC_OPEN_TELEMETRY=false` で止められる。
karasu が SDK で使うのは `client.messages.create` と `APIError` だけで、0.134 / 0.135 の変更はどちらも追加と streaming の修正。

### #3375 astro 7.3.8 → 7.4.1（採用）

部分木の動きが今回で最も大きい（`unifont` 0.7.5 → 1.0.3、`devalue` 5 → 6、`@astrojs/compiler-rs` 0.5.2、`rolldown` 1.2.14 など）。
新しく入るパッケージ名は `tinyps`（tinylibs、`43081j`）と `fnv1a-64`（`danielroe`）で、どちらも GitHub Actions OIDC + provenance、install script なし。
`find-proc` と `ohash` は lock から消える。

CI は docs-site をビルドしない（Docs Preview は Dependabot PR では skip される）ので、merge-base と PR ヘッドの両方でローカルに
`pnpm run build` し、`_astro/` のハッシュ・Astro / Starlight の版文字列・Astro の scope class を正規化して比べた。
**73 ページの HTML がすべて一致し**、`_astro/` のファイル構成も同じ、WARN も main と同じ 2 件だった。

### #3374 jsdom 30.1.2 → 30.1.3（採用）

性能改善と `XMLHttpRequest` の cross-origin redirect 時の credential / cookie の扱いの修正。部分木で `@asamuzakjp/dom-selector` が
9.2.4 → 10.0.4（major、同じ作者、前版と同じく provenance なし、diff に危険パターンなし）。app の devDependency だけで公開物には入らない。
undici の解決については「対象外の観測」を参照（この PR が原因ではない）。

### #3372 knip 6.41.0 → 6.42.1（採用）

部分木で `unbash` 5.1.0 → 6.0.0（major、同じ作者 `webpro`）と `oxc-parser` 0.153 → 0.154（binding 一式）が動く。
knip の変更は plugin ごとの検出の修正で、CI の `pnpm run knip` は green。

### #3378 oxlint 1.87.0 → 1.89.0 / #3371 oxfmt 0.72.0 → 0.74.0（採用）

oxlint 1.89.0 は多数の plugin rule を recommended に昇格させたが、CI の `oxlint --deny-warnings packages/ scripts/` は green で新しい指摘は無い。
oxfmt 0.73 / 0.74 は formatter の修正と TOML / Astro 対応の追加で、CI の `oxfmt --check` は green（整形差分が出ないので ADR-2447 の整形同梱は不要）。
binding 一式はすべて GitHub Actions OIDC + provenance。oxfmt 0.74.0 は optional peer に `@astrojs/compiler-rs` を足したが、lock には既にある。

### その他（採用）

- **#3379 user-event 14.6.8**: programmatic な `null` 入力値を空文字として扱う修正 1 件
- **#3370 Playwright 1.64.1**: Electron の初期ウィンドウ消失と Chromium 155+ の preflight redirect の regression 修正 2 件。
  `playwright` / `playwright-core` も 1.64.1 で、追加行は版文字列とその 2 修正だけ
- **#3369 lucide-react 1.59.0**: アイコンの追加のみで削除は 0。karasu が import する `ChevronRight` / `X` は残る
- **#3368 vitest 5.0.5**: バグ修正のみ（リリースノートは PR 本文）。パッケージ全体の危険パターン出現数は 5.0.4 と同じ
- **#3367 react 19.3.1**: React Server Components の transport の改善 1 件だけで、karasu は RSC を使わない。`react-dom` の
  client 側（`react-dom-client.*` / `react-dom.*`）の差分は版文字列だけで、残りは server 側（`react-dom-server.*`）の transport の変更

### #3366 gh-aw-actions 0.89.21 → 0.92.5（却下）

bot は 2 つの `.lock.yml` の `uses:` 行だけを書き換えるので `gh-aw-lock-consistency.test.ts` が 2 件落ちる（ADR-2753）。
加えて 0.92.5 は github/gh-aw の prerelease。`@dependabot ignore` は付けずに close する。

再生成は ADR-3242 から 2 回持ち越している。起票時点で cooldown を越えた非 prerelease の最新は **v0.92.0**（10-15 公開）で、
次の v0.93.0（10-21 23:24 UTC 公開）は 10-28 23:24 UTC に越える。方針は次のどちらか:

- **v0.92.0 で今すぐ再生成する**（別 PR）。持ち越しを止められる
- **10-28 以降に v0.93.x で再生成する**。v0.93 系は 10-21〜10-25 に非 prerelease が 5 版（v0.93.0 / .2 / .3 / .4 / .5）出ているので、
  待てば 1 回で新しい方に寄せられる

推奨は前者（持ち越しの回数を増やさない。v0.93 は次の週次で同じ手順で上げればよい）。

## マージの進め方

採用する npm の PR はすべて `pnpm-lock.yaml` を書き換えるので、1 本マージするたびに残りは `@dependabot rebase` → CI green を待ってから進める
（ADR-3304 と同じ）。マージ前に毎回、PR タイトルの版と、rebase 後の lock の依存エッジを main と比べる。

rebase で版が上がりうるもの（マージ時点で cooldown を越える新しい版）は事前に確認しておいた:

- `lucide-react` 1.60.0（10-27 06:15 UTC に越える）/ 1.61.0: GitHub Actions OIDC + provenance、`dependencies` なし
- `@anthropic-ai/sdk` 0.136.0（10-27 18:13 UTC に越える）/ 0.137.0: 同上、`dependencies` は 0.135.0 と同じ 3 件
- `knip` 6.43.0（10-24）と `astro` 7.4.2（10-21）は、10-28 以降でなければ越えない

これ以外の版に変わったら、その PR はマージ前に同じ確認をやり直す。

## 対象外の観測（別の作業で扱う）

### undici の override が vulnerable な版に固定している

open alert #101（`undici` GHSA-xjj6-f33q-929c、脆弱範囲 `>= 7.18.0, < 7.30.1`、10-25 起票）が lock の `undici@7.30.0` に当たっている。
`pnpm-workspace.yaml` の `overrides:` にある `undici: ^7.29.1` は、範囲の下限が脆弱範囲の内側にあり、
`.claude/rules/dependabot.md` が書く「override が脆弱版への固定装置として働く」形になっている。

さらに、この override は名前だけで全 undici に掛かるので、`undici` ^8 を要求する依存まで 7 系に押し戻している
（main の lock で `jsdom@30.1.2 -> undici 7.30.0`。jsdom 30.1.3 は `^8.12.1`、astro 7.4.1 で入る `unifont@1.0.3` は `^8.0.0` を宣言するが、
解決はどちらも 7.x）。#3375 をマージすると `unifont` は `undici@7.30.1`（patched）に解決されるが、jsdom は 7.30.0 のまま残る。
今回の PR はこの状態を作ったものでも直すものでもないので、`/hane:security-alert` で別に扱う。
open alert はほかに `launch-editor`（#94–#96）、`zod`（#97）、`serialize-javascript`（#98）、`@azure/msal-node`（#102）がある。

## 現時点の方針

- npm 12 件（#3367–#3372、#3374–#3379）は**採用**し、bot PR をそのままマージする
- #3373 chokidar 6 は**保留**し、6.0.x の修正版が出てから Node 下限 22.22 の sweep を同梱した差し替え PR で入れる
- #3366 gh-aw は**却下**して close し（ignore なし）、v0.92.0 で再生成する PR を別に出す
- undici の override は、このトリアージとは別に security alert として扱う
