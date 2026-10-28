---
id: ADR-3381
title: Dependabot トリアージ 2026-10-26：npm 12 件をそのまま採用し、chokidar 6 は Node 下限の引き上げと同梱する前提で保留、gh-aw-actions は却下して v0.92.0 で再生成する
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

# ADR-3381: Dependabot トリアージ 2026-10-26：npm 12 件をそのまま採用し、chokidar 6 は Node 下限の引き上げと同梱する前提で保留、gh-aw-actions は却下して v0.92.0 で再生成する

- **日付**: 2026-10-27
- **ステータス**: 決定済み
- **関連**:
  - Design Doc PR: [#3381](https://github.com/kompiro/karasu/pull/3381)（本 ADR に昇格し削除）
  - 対象 Dependabot PR: [#3366](https://github.com/kompiro/karasu/pull/3366) / [#3367](https://github.com/kompiro/karasu/pull/3367) / [#3368](https://github.com/kompiro/karasu/pull/3368) / [#3369](https://github.com/kompiro/karasu/pull/3369) / [#3370](https://github.com/kompiro/karasu/pull/3370) / [#3371](https://github.com/kompiro/karasu/pull/3371) / [#3372](https://github.com/kompiro/karasu/pull/3372) / [#3373](https://github.com/kompiro/karasu/pull/3373) / [#3374](https://github.com/kompiro/karasu/pull/3374) / [#3375](https://github.com/kompiro/karasu/pull/3375) / [#3376](https://github.com/kompiro/karasu/pull/3376) / [#3377](https://github.com/kompiro/karasu/pull/3377) / [#3378](https://github.com/kompiro/karasu/pull/3378) / [#3379](https://github.com/kompiro/karasu/pull/3379)
  - gh-aw の再生成 PR: [#3384](https://github.com/kompiro/karasu/pull/3384)
  - 前回トリアージ: [ADR-3304](./3304-dependabot-triage-2026-10-19.md)（lefthook 2.2.2 の手動 publish を採用可と判断、gh-aw の再生成は持ち越し）
  - gh-aw の再生成規則: [ADR-2753](./2753-dependabot-triage-2026-09-07.md)、[ADR-3242](./3242-dependabot-triage-2026-10-15.md)、`.claude/rules/dependabot.md`
  - 公開パッケージの Node 下限: [ADR-2397](./2397-node-24-baseline.md)、[ADR-2472](./2472-dependabot-triage-2026-08-13.md)（commander 15 で 22.12 に上げた前例）
  - 判定語彙: [ADR-2474](./2474-dependabot-replacement-pr-vocabulary.md)、cooldown 7 日: [ADR-784](./784-update-dependencies-20260421.md)

## 背景

2026-10-26（月）21:45–21:51 UTC に週次の Dependabot PR が 14 件起票された（github-actions 1 件、npm 13 件）。
security update ではない（`security` ラベル無し。open な Dependabot alert は 10 件（#86、#94–#102）あったが、どれも今回の PR が bump するパッケージではなかった。
うち #86 / #97 / #99–#101 は部分木の版の付け替えでマージ後に fixed になった。後述「対象外の観測」）。
npm 13 件は CI green、gh-aw の 1 件は `gh-aw-lock-consistency.test.ts` で Check が落ちていた。
`[dep-triage]` の Issue や workflow の所見コメントは無かった。

**供給側（配布主体・改ざん）の懸念は見つからなかった。** 確認したこと:

- **publisher / provenance**: lefthook を除き、to 版の publisher の種類は from 版と同じ。GitHub Actions OIDC + SLSA provenance
  でないのは `knip`（`webpro`）と、その部分木の `unbash` 6.0.0（`webpro`）、jsdom の部分木の `@asamuzakjp/dom-selector` 10.0.4
  （`asamuzakjp`）で、いずれも過去の版から同じ。`lefthook` 2.2.2 の wrapper だけは 2.2.1（GitHub Actions OIDC + provenance）から
  `mrexox` の手動 publish（provenance なし）に変わっているが、これは ADR-3304 が採用可と判断した版そのもの。
  加えて lefthook 2.2.2 で新しく加わったパッケージが 1 つあり、これも provenance を持たない（後述）
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
  最も新しいのは `chokidar` 6.0.0（10-19 20:52 公開、起票まで 7 日と 56 分）
- **依存エッジ**: lock の snapshot を peer suffix を落として merge-base（`a250c9da`）と各 PR ヘッドで突き合わせた
  （`security-alert` skill の edges 手順）。main の lock に無いパッケージ名が新しく入るのは 3 PR の 4 件だけ:
  #3376 の `lefthook-android-arm64`、#3377 の `@opentelemetry/api`、#3375 の `tinyps` と `fnv1a-64`

| PR | 依存 | from → to | CI | リスク | 判定 |
| --- | --- | --- | --- | --- | --- |
| #3379 | `@testing-library/user-event`（app、dev） | 14.6.7 → 14.6.8 | green | low | 採用（そのままマージ） |
| #3378 | `oxlint`（root、dev） | 1.87.0 → 1.89.0 | green | low | 採用（そのままマージ） |
| #3377 | `@anthropic-ai/sdk`（app） | 0.133.0 → 0.135.0 | green | low | 採用（そのままマージ） |
| #3376 | `lefthook`（root、dev） | 2.2.1 → 2.2.2 | green | low | 採用（そのままマージ） |
| #3375 | `astro`（docs-site、dev） | 7.3.8 → 7.4.1 | green | low | 採用（そのままマージ） |
| #3374 | `jsdom`（app、dev） | 30.1.2 → 30.1.3 | green | low | 採用（そのままマージ） |
| #3373 | `chokidar`（cli、dependencies） | 5.0.0 → 6.0.0（major） | green | medium | 保留 |
| #3372 | `knip`（root、dev） | 6.41.0 → 6.42.1 | green | low | 採用（そのままマージ） |
| #3371 | `oxfmt`（root、dev） | 0.72.0 → 0.74.0 | green | low | 採用（そのままマージ） |
| #3370 | `@playwright/test`（root / e2e、dev） | 1.64.0 → 1.64.1 | green | low | 採用（そのままマージ） |
| #3369 | `lucide-react`（app） | 1.55.0 → 1.59.0（rebase で 1.60.0） | green | low | 採用（そのままマージ） |
| #3368 | vitest group（`vitest` / `@vitest/coverage-v8`、全 package、dev） | 5.0.4 → 5.0.5 | green | low | 採用（そのままマージ） |
| #3367 | react group（`react` / `react-dom`、app） | 19.3.0 → 19.3.1 | green | low | 採用（そのままマージ） |
| #3366 | `github/gh-aw-actions/setup` | 0.89.21 → 0.92.5 | Check red | 対象外 | 却下（v0.92.0 で再生成） |

## 決定

**npm 12 件はそのままマージする。chokidar 6（#3373）は保留し、6.0.x の修正版が出てから Node 下限 22.22 への引き上げと同梱した
差し替え PR で入れる。gh-aw-actions の bot PR（#3366）は却下し、v0.92.0 で再生成する（#3384）。**

### chokidar 6（#3373）: 保留

今回のバッチで唯一、公開パッケージ（`karasu` CLI）の実行時依存が major で動く。`packages/cli/src/watcher.ts` が `karasu serve` の
ファイル監視に `watch(dir, { ignoreInitial: true, persistent: true })` と `change` / `add` / `unlink` だけを使い、esbuild では
`--external:chokidar` なので、利用者の環境に入るのは chokidar 6 そのものになる。供給側は問題ない（GitHub Actions OIDC + provenance、
5.0.0 と同じ配布経路）。保留の理由は次の 2 点:

1. **Node の下限が食い違う。** chokidar 6.0.0 は `engines.node: ">= 22.22"` を宣言する（5.0.0 は `>= 20.19.0`）。karasu の公開パッケージは
   `engines.node: ">=22.12"`（ADR-2397 / ADR-2472、`scripts/ci/node-version-policy.test.ts` が全 workspace で一致を検査する）。
   bot PR のままマージすると、22.12〜22.21 の利用者に「動く」と約束しながら依存側は対象外と言っている状態になる。CI は Node 24 で
   回り、policy test は依存の `engines` までは見ないので、この食い違いは green のまま残る
2. **6.0.0 は監視部分の書き直しで、公開から 1 週間で regression 報告が出ている。** 10-22 に v6 起因の Issue が 3 件立ち（upstream
   #1496 / #1497 / #1498）、修正 PR が open のまま 6.0.1 は未公開だった。karasu の使い方に直接当たるものは無いが、#1498 は Windows の
   初回スキャンの `add` に関わる

6.0.x の修正版が cooldown を越えて Dependabot が PR を更新したら、ADR-2472 の commander 15 と同じ形の差し替え PR で採用する。
Node 下限を `>=22.22` に上げる sweep を bump と同じ PR に入れる: `packages/core` / `packages/cli` の `engines`、esbuild `--target` 2 箇所、
policy test の `ENGINES_FLOOR`、現在の下限を assumption で grep している ADR-2397（`packages/core/package.json`）と
ADR-2472（`ENGINES_FLOOR = "22.12"`）の frontmatter。取りこぼしは `node-version-policy.test.ts` と `pnpm adr:check-assumptions` が検出する。
22.22 は Node 22（maintenance LTS、2027-04 まで）の中での絞り込みなので、ADR-2397 の「EOL したラインだけを落とす」原則には反しない。

### lefthook 2.2.2（#3376）: ADR-3304 の判断を適用し、対象 platform を限定する

ADR-3304 が「wrapper が手動 publish でも、実行される binary が provenance 付きで wrapper の中身が前版と同一なら採用してよい」と
決めた版そのもの。wrapper の tarball は 2.2.1 との差分が `package.json`（版と optionalDependencies）と README だけで、`postinstall.js` は不変。

**ADR-3304 の訂正**: 2.2.2 の platform binary は ADR-3304 が書いた 10 パッケージではなく **11 パッケージ**で、`lefthook-android-arm64` が
2.2.2 で新しく加わっている。この 1 つは `mrexox` の個人アカウントからの publish で provenance を持たない（10-13 に新規作成、
upstream PR #1591「packaging: add support for android」）。npm の trusted publishing は既存パッケージにしか設定できないので、
新規パッケージの初回は手で publish するしかない。

`os: android` / `cpu: arm64` なので、pnpm は linux / macOS / Windows では取得もしない。**この判断の対象 platform は、karasu の開発と CI が
動く linux（devcontainer と GitHub Actions の runner）・macOS・Windows に限る。** lefthook は root の devDependency で公開物にも入らない。
この範囲では、実行されうる binary の出所はすべて provenance で確認でき、provenance を持たない新規パッケージはインストールされない。
将来 Android（Termux など）で開発する人が出たら、provenance のない binary が実行される環境になるので改めて判断する。
ADR-3304 は覆さない（判断の範囲を限定して適用しただけ）。

### gh-aw-actions（#3366）: 却下し、v0.92.0 で再生成する

bot は 2 つの `.lock.yml` の `uses:` 行だけを書き換えるので `gh-aw-lock-consistency.test.ts` が 2 件落ちる（ADR-2753）。加えて 0.92.5 は
github/gh-aw の prerelease。`@dependabot ignore` は付けずに close した。

再生成は ADR-3242 から 2 回持ち越していたので、起票時点で cooldown を越えた非 prerelease の最新である **v0.92.0**（10-15 公開）で
今回入れた（#3384）。v0.93.x を待つ案は採らなかった（「却下した案」）。再生成で次のことが分かった:

- **v0.92.0 は `dependabot-triage.md` の `tools.web-fetch` をコンパイルエラーにする。** copilot engine は CLI を offline BYOK mode
  （`COPILOT_OFFLINE=true`）で動かし、このモードでは CLI の web tool が無効になる（github/gh-aw#65043）。旧 lock は
  `--allow-tool web_fetch` を渡していたが、tool は agent に届いていなかった。#3384 は `web-fetch:` を外したので実行時の振る舞いは
  変わらない。agent に registry への取得経路を戻すのは #2838 の範囲で、そちらにこの原因を追記した
- lock の読む場所（`permissions:`、`GH_AW_INFO_ALLOWED_DOMAINS`、`ghcr.io/...` のイメージ版）は、イメージ版以外は不変。
  gh-aw-firewall 0.28.23 → 0.28.57、gh-aw-mcpg v0.4.25 → v0.4.31、github-mcp-server v1.12.2 → v2.0.2（major、typed output の追加）。
  agent の tool 面は狭まった（`--allow-tool web_fetch` が消え、`--deny-tool workflow` と `--disable-builtin-mcps` が加わった）

## 理由

- 12 件とも upstream の変更が修正・追加中心で、karasu の使い方に当たる破壊的変更が無かった:
  - `@anthropic-ai/sdk` 0.134 / 0.135: OpenTelemetry tracing の native 対応で `dependencies` に `@opentelemetry/api`（1.9.1、open-telemetry
    公式、OIDC + provenance）が加わる。SDK が span を作るのはアプリがグローバルな tracer provider を登録したときだけで、karasu の app は
    登録していない（no-op）。不要なら `openTelemetry: false` か `ANTHROPIC_OPEN_TELEMETRY=false` で止められる。karasu が SDK で使うのは `client.messages.create` と `APIError` だけ
  - `astro` 7.4.1: 部分木の動きが最も大きい（`unifont` 0.7.5 → 1.0.3、`devalue` 5 → 6、`rolldown` 1.2.14 など）。新しく入る
    `tinyps`（tinylibs）と `fnv1a-64`（`danielroe`）はどちらも OIDC + provenance、install script なし。CI は docs-site をビルドしないので、
    merge-base と PR ヘッドの両方でローカルにビルドし、ハッシュ・版文字列・scope class を正規化して比べた。73 ページの HTML がすべて
    一致し、`_astro/` のファイル構成も WARN（2 件）も同じだった
  - `jsdom` 30.1.3: 性能改善と `XMLHttpRequest` の cross-origin redirect 時の credential / cookie の扱いの修正。部分木の
    `@asamuzakjp/dom-selector` 9.2.4 → 10.0.4 は同じ作者で、前版と同じく provenance なし、diff に危険パターンなし
  - `knip` 6.42.1: plugin ごとの検出の修正。部分木で `unbash` 5.1.0 → 6.0.x（同じ作者）と `oxc-parser` 0.154 が動く
  - `oxlint` 1.89.0 / `oxfmt` 0.74.0: rule の recommended 昇格と formatter の修正。CI の lint と `oxfmt --check` は green で、
    整形差分の同梱（ADR-2447）は不要だった
  - `@playwright/test` 1.64.1: regression 修正 2 件。`lucide-react`: アイコンの追加のみで、karasu が import する `ChevronRight` / `X` は残る
  - `react` 19.3.1: React Server Components の transport の改善だけで、karasu は RSC を使わない。`react-dom` の client 側の差分は版文字列だけ
  - `vitest` 5.0.5 / `user-event` 14.6.8: バグ修正のみ

## 反映

ユーザー判断（2026-10-27）: Design Doc の推奨をすべて採用（npm 12 件をそのまま採用、#3373 保留、#3366 却下して v0.92.0 で今すぐ再生成）。

- npm 12 件を 10-27 12:25〜15:56 UTC に squash merge した。最初の #3379 は rebase せずにマージし、残りは 1 本ずつ `@dependabot rebase` →
  CI green → マージ前に PR タイトルの版と rebase 後の lock の依存エッジを main と比べる、の順で進めた（マージ順は #3378 → #3377 → #3367 →
  #3376 → #3375 → #3374 → #3368 → #3372 → #3371 → #3370 → #3369）。作業は 2 つの Claude セッションが同じ一覧を並行して進めており、
  #3367 / #3368 など一部は相手側のセッションがマージした。どのマージも版は分析どおり、または下に挙げた確認済みの版だった
- 例外が 1 件ある。#3368 と #3372 はどちらも #3374 の後の main に rebase され、#3368 が 14:54:20、#3372 が 10 秒後に再 rebase なしで
  マージされた。#3372 の CI とエッジ比較は #3368 の lock を含まない状態で行われたことになる。マージ後の main（`5248631d`）の CI は green だった
- rebase で解決が変わり、トリアージ時に見ていない版が入ったものは、マージ前に同じ確認をした:
  - #3369: `lucide-react` 1.60.0（事前に確認済みの版。OIDC + provenance、`dependencies` なし）
  - #3375: `@shikijs/vscode-textmate` 10.0.2 → 10.1.0（shiki 経由）。10-20 公開で cooldown を越えている。publisher は 10.0.2 と同じ
    `antfu`（どちらも provenance なし）、install script も `dependencies` も無い。差分は devDependencies の更新（tsup 9 / TypeScript 6）に伴う
    build 出力の変化（class field 宣言の追加、型 export の分離）だけ
  - #3372: `unbash` 6.0.0 → 6.0.1。10-20 公開、publisher は同じ `webpro`、install script なし。差分は bash の `$'\xHH'` / `$'\NNN'` を
    byte 列として UTF-8 で復号する修正と README の badge だけ
  - #3374: `jsdom → undici` 7.30.0 → 7.30.1、`vite → rolldown` 1.2.13 → 1.2.14（vite の宣言は `~1.2.12`）。
    #3371: oxfmt の optional peer `@astrojs/compiler-rs` 0.5.1 → 0.5.2。#3368: `@astrojs/mdx → es-module-lexer` 3.0.3 → 3.0.4。
    いずれも先にマージした #3375 が main の lock に入れていた版への付け替え
  - #3377 は rebase 時点で `@anthropic-ai/sdk` 0.136.0 が cooldown を越えておらず、0.135.0 のまま入った
- #3373 は open のまま残した
- #3366 を close し（ignore なし）、#3384 で v0.92.0 に再生成した（10-27 12:48 UTC マージ）

## 運用上の学び

- **同じトリアージの反映を 2 つのセッションが並行して進めると、1 本ずつの順序が崩れる。** 今回はマージだけでなく ADR 昇格の
  commit も同じ worktree に並んだ。`gh pr merge` が「already merged」を返したら、相手のセッションが先にマージしたことを疑う。
  反映を始める前に open PR と worktree を確かめ、担当を 1 つに決める
- **`@dependabot rebase` に Dependabot が応答しないことがある。** #3376 は 1 回目の依頼から 20 分間 head が変わらず（PR は main より
  4 commit 遅れていたが conflict は無かった）、2 回目の依頼で rebase された。待ち時間に上限を置き、超えたら依頼し直す
- **`gh extension install --force --pin <v>` は既に入っている extension では pin を無視して最新に upgrade する。** v0.92.0 を指定して
  v0.93.5（cooldown 内）が入った。`gh extension remove gh-aw` してから `--pin` だけで入れ直し、`gh aw version` と
  `~/.local/share/gh/extensions/gh-aw/manifest.yml` の `ispinned: true` で確かめる
- **CodeRabbit は指摘ゼロの回に review を付けなくなった。** #3365 で `request_changes_workflow: false` にしてから CodeRabbit は approve
  しないので、指摘ゼロの回は要約コメントの `recent_review` 欄が「No actionable comments were generated」に書き換わるだけになる。
  #3384 はこの形で、`await-review.ts` は判定できずに待ち続けた（#3385 で起票）
- rebase でトリアージ時と違う版が入るのは今回 3 件あった（うち事前確認済みは 1 件）。毎回のエッジ比較が、未確認の版を
  マージ前に拾う唯一の手段になっている

## 却下した案

### chokidar 6 を今すぐ差し替え PR で採用する（Node 下限 sweep を同梱）

書き直し直後の版を利用者の `karasu serve` に届けることになる。得るもの（karasu の使い方に当たる修正）は確認できなかった。

### chokidar 6 を却下して `@dependabot ignore this major version` する

chokidar 6 は将来入れる前提なので ignore は合わない。

### gh-aw を 10-28 以降に v0.93.x で再生成する

v0.93 系は 10-21〜10-25 に非 prerelease が出ているので、待てば 1 回で新しい方に寄せられる。ただ再生成は ADR-3242 から 2 回
持ち越しており、待てば 3 回目になる。v0.93 は次の週次で同じ手順で上げればよい。

## 対象外の観測（別の作業で扱う）

トリアージ時、open alert #99 / #100 / #101（`undici`、脆弱範囲はいずれも上限 `< 7.30.1`）が lock の `undici@7.30.0` に当たっていた。今回のマージで
#3375 が `undici@7.30.1` を lock に入れ、#3374 で jsdom もそちらに解決されたので、lock から `undici@7.30.0` が消え、#99 / #100 / #101 は
10-27 14:36 UTC に fixed になった。同じく `zod`（#97）と `http-cache-semantics`（#86）も #3375 のマージで fixed になった。

ただし `pnpm-workspace.yaml` の `overrides:` にある `undici: ^7.29.1` は下限がまだ脆弱範囲の内側にあり、`.claude/rules/dependabot.md` の
「override が脆弱版への固定装置として働く」形が残っている。この override は名前だけで全 undici に掛かり、`undici` ^8 を要求する依存
（jsdom 30.1.3 の `^8.12.1`、`unifont` 1.0.3 の `^8.0.0`）も 7 系に押し戻している。open alert はほかに `launch-editor`（#94–#96）、
`serialize-javascript`（#98）、`@azure/msal-node`（#102）がある。これらは `/hane:security-alert` で扱う。
