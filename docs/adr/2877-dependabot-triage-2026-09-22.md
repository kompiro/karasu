---
id: ADR-2877
title: Dependabot トリアージ 2026-09-22：changesets 3 は CI が回さない release flow を壊すので差し替え PR で入れ、gh-aw は再生成で上げる
status: accepted
date: 2026-09-22
topic: build
related_to:
  - ADR-1315
  - ADR-1370
  - ADR-1758
  - ADR-2753
  - ADR-2836
  - ADR-2404
  - ADR-2786
  - ADR-784
  - ADR-2839
scope:
  packages: [app, cli, core, vscode, vscode-e2e]
  concerns: [ci, dependencies]
assumptions:
  - "file: .changeset/config.json"
  - "grep: .changeset/config.json :: \"privatePackages\""
  - "grep: .github/workflows/release-prepare.yml :: find .changeset -maxdepth 1 -name '\\*.md' ! -name README.md"
  - "grep: package.json :: \"@changesets/cli\": \"\\^3\\."
  - "file: scripts/ci/gh-aw-lock-consistency.test.ts"
---

# ADR-2877: Dependabot トリアージ 2026-09-22：changesets 3 は CI が回さない release flow を壊すので差し替え PR で入れ、gh-aw は再生成で上げる

- **日付**: 2026-09-22
- **ステータス**: 決定済み
- **関連**:
  - Design Doc PR: [#2877](https://github.com/kompiro/karasu/pull/2877)（本 ADR に昇格し削除）
  - 対象 Dependabot PR: [#2867](https://github.com/kompiro/karasu/pull/2867) / [#2868](https://github.com/kompiro/karasu/pull/2868) / [#2869](https://github.com/kompiro/karasu/pull/2869) / [#2870](https://github.com/kompiro/karasu/pull/2870) / [#2871](https://github.com/kompiro/karasu/pull/2871) / [#2872](https://github.com/kompiro/karasu/pull/2872) / [#2873](https://github.com/kompiro/karasu/pull/2873) / [#2874](https://github.com/kompiro/karasu/pull/2874) / [#2875](https://github.com/kompiro/karasu/pull/2875) / [#2876](https://github.com/kompiro/karasu/pull/2876)
  - #2867 の再生成 PR: [#2878](https://github.com/kompiro/karasu/pull/2878)
  - #2871 の差し替え PR: [#2880](https://github.com/kompiro/karasu/pull/2880)
  - changesets 採用と release script: [ADR-1315](1315-release-automation-changesets.md)
  - release-prepare workflow: [ADR-1370](1370-release-flow-actions-driven.md)
  - `karasu-vscode` を changesets で版管理する: [ADR-1758](1758-vscode-changeset-versioning.md)
  - gh-aw の `.lock.yml` は再生成で上げる: [ADR-2753](2753-dependabot-triage-2026-09-07.md)
  - major を差し替え PR で入れた前例: [ADR-2836](2836-dependabot-triage-2026-09-14.md)
  - `dompurify` の override と宣言レンジ: [ADR-2404](2404-dependabot-security-2026-08-08.md)
  - 安全網が結論を出せないときは失敗にする: [ADR-2786](2786-threat-detection-fail-closed.md)、[TPL-2786](../test-perspectives/TPL-2786-guard-failure-must-fail-the-run.md)
  - cooldown 7 日: [ADR-784](784-update-dependencies-20260421.md)
  - 週次 workflow の schedule 停止: [ADR-2839](2839-pause-dependabot-triage-schedule.md)
  - 運用ルール: `.claude/rules/dependabot.md`, `docs/release.md`「Dependabot 運用ルール」

## 背景

2026-09-21（月）の weekly バッチ。npm 8 件と github-actions 2 件の計 10 件で、`security` ラベルはゼロ、
`dependabot/alerts` の open も 0 件の純粋な version update バッチだった。週次 workflow は ADR-2839 で
schedule を止めているため所見は無く、upstream の追跡を最初から行った。

**供給側（配布主体・改ざん）の懸念はゼロだった。**

- cooldown 7 日: 全件充足。最も近いのは `github/gh-aw-actions` v0.89.15（2026-09-14 17:47 公開、PR 起票まで 7 日 4 時間）と
  `@changesets/cli` 3.0.3（同日 15:31 公開、7 日 6 時間）
- publisher: from 版と to 版で変化なし。`marked` / `lefthook` / `react` / `react-dom` / `vite` /
  `@testing-library/user-event` / `@changesets/cli` は GitHub Actions の OIDC trusted publishing で provenance 付き。
  `dompurify`（`cure53`）、`@types/*`（`types`）、`vscode-extension-tester`（`rhdevelopers-ci`）は従来から provenance なしのまま
- lifecycle script（`preinstall` / `install` / `postinstall` / `prepare`）: 新規追加ゼロ。`lefthook` の `postinstall` は
  `lefthook install -f` から `lefthook install` に変わり、既存の hook を上書きしなくなった（本 repo の hook は lefthook 管理なので挙動は同じ）
- 既知 advisory: GitHub Advisory Database で to 版 9 件と from 版の `dompurify` / `marked` を照会し、該当ゼロ
- github-actions 2 件: PR が pin した SHA が upstream の annotated tag の参照先 commit と一致

依存エッジは `pnpm-lock.yaml` の snapshot を peer suffix を落として base（`b2812c38`）と PR ヘッドで突き合わせた。
`pnpm-workspace.yaml` の `overrides:` に掛かる解決は `dompurify` 3.4.15 / `vite` 8.3.0 / `nanoid` 3.3.19 / `postcss` 8.5.28 の
4 件で、いずれも floor を満たす。

CI が red なのは #2867 の 1 件だけで、原因は bump ではなく `scripts/ci/gh-aw-lock-consistency.test.ts` が意図どおり捕まえたもの
（ADR-2753 の再現）。一方で、**CI が green でも採用できない PR が 1 件あった**。#2871（`@changesets/cli` 2 → 3）は
CI が `changeset version` を実行しないため green だが、ローカルで回すと現在の pending changeset で失敗した。

## 決定

**10 件すべてを採用した。却下・保留はゼロ。** 8 件は bot PR のままマージし、#2871 は差し替え PR [#2880](https://github.com/kompiro/karasu/pull/2880)、
#2867 は `gh aw compile` の再生成 PR [#2878](https://github.com/kompiro/karasu/pull/2878) で入れた。

| PR | 依存 | from → to | 種別 | 判断 | 反映 |
| --- | --- | --- | --- | --- | --- |
| #2868 | `azure/login` | v3.0.2 → v3.1.0 | minor | 採用 | そのままマージ（`49817a16`） |
| #2875 | `lefthook` | 2.1.12 → 2.1.14 | patch ×2 | 採用 | そのままマージ（`996879eb`） |
| #2872 | `vscode-extension-tester` | 8.24.0 → 8.27.0 | minor ×3 | 採用 | そのままマージ（`bbd9d0f0`） |
| #2876 | `marked` | 18.0.9 → 18.0.13 | patch ×4 | 採用 | そのままマージ（`f91a7a9a`） |
| #2874 | `dompurify` | 3.4.13 → 3.4.15 | patch ×2 | 採用 | そのままマージ（`7f38da50`） |
| #2870 | `@testing-library/user-event` | 14.6.6 → 14.6.7 | patch | 採用 | そのままマージ（`8c0109a3`） |
| #2873 | `vite` | 8.2.2 → 8.3.0 | minor | 採用 | rebase 1 回の後マージ（`ad9b337a`） |
| #2869 | `react` / `react-dom` / `@types/react` / `@types/react-dom`（react group） | 19.2.8 → 19.3.0 ほか | minor | 採用 | rebase 1 回の後マージ（`e7da996c`） |
| #2871 | `@changesets/cli` | 2.31.0 → 3.0.3 | **major** | 採用（bot PR は close） | 差し替え PR #2880（bump と config と workflow を同梱） |
| #2867 | `github/gh-aw-actions/setup` | 0.88.7 → 0.89.15 | minor | 採用（bot PR は close） | 再生成 PR #2878（gh-aw **v0.89.17** で compile、`63316db5`） |

採用なので `@dependabot ignore` はどこにも設定していない。

## 理由

### #2871: bot PR のままでは release flow が壊れる。CI はそれを見ていない

3.0.0 の major change のうち本 repo に当たるものは 3 つあった。

1. **private パッケージは既定で版管理されなくなった**（changesets#2186、`privatePackages` の既定が `{ version: false, tag: false }`）。
   `private: true` の `karasu-vscode` は ADR-1758 で changesets の版管理対象にしており、pending changeset `clever-eyes-shake` が
   `@karasu-tools/core` / `karasu` / `karasu-vscode` を 1 枚に書いている。v3 はこれを mixed changeset として拒否する。
2. **`changeset version` は pending が無いとき exit 1 になる**（changesets#1860）。`release-prepare.yml` は `pnpm version-packages` を
   無条件に実行し、その後で tree が clean なら「nothing to release」で正常終了する設計（ADR-1370）だった。v3 では正常系のはずの
   「pending なし」が job の失敗として報告される。
3. `prettier` オプションが `format` に置き換わった。本 repo は書いていないので `format: "auto"` に乗る。

bot ブランチを throwaway worktree に checkout して確かめた。

| 状態 | `changeset status` | `changeset version` |
| --- | --- | --- |
| bot PR そのまま | **exit 1**: `Found mixed changeset clever-eyes-shake … not allowed` | 同じエラーで **exit 1** |
| `privatePackages: { version: true, tag: false }` を追加 | exit 0: core / karasu / karasu-vscode を minor と表示 | exit 0: `karasu` 0.6.0 → 0.7.0、`@karasu-tools/core` 0.2.0 → 0.3.0、`karasu-vscode` 0.1.3 → 0.2.0。CHANGELOG 3 本、changeset 158 枚を消費、整形ノイズなし |
| pending を全部消費した後 | exit 1 | exit 1（changesets#1860 のとおり） |

`privatePackages: { version: true, tag: false }` は v2 の既定値そのものなので、明示すれば `karasu-vscode` の扱いは変わらない。
`tag: false` は「npm に publish せず Marketplace 手動」（ADR-1315 / ADR-1758）を変えないため。`changelog.cjs` は ESM 化した v3 からも読めた。

差し替え PR #2880 の中身は 1 コミット: `@changesets/cli` `^3.0.3` と lock、`.changeset/config.json` の `privatePackages` と `$schema`
（`@changesets/config@4.0.1`）、`release-prepare.yml` の guard、`docs/release.md` の 2 文。guard は **`.changeset/*.md`（`README.md` 以外）の
有無を `pnpm version-packages` の前に見て分岐する**形にし、`|| true` で exit 1 を握る形は取らなかった。本物の失敗（mixed changeset、
config エラー）まで「nothing to release」に見えてしまうからで、TPL-2786 / ADR-2786 と同じ線である。`ignore` 対象だけを書いた changeset は
guard を通り `changeset version` で落ちるが、それは公開できないものを黙って残さない正しい結果として受け入れた。changesets の prerelease
mode（`.changeset/pre.json`）は本 repo の release flow に無いので guard は扱わず、導入時に `"mode": "exit"` を通す必要があることを
workflow のコメントに残した。

その他の major change は当たらない: `changeset tag` → `git-tag`（未使用）、`--sinceMaster` の削除（`--since=main`）、Node `^22.11 || ^24`
（Node 24）、pnpm `>=10`（11.20）、Yarn Classic / Bolt サポート削除。ADR-1315 の assumption `"release": "pnpm build && changeset publish"` は不変。

依存ツリーは lock から 61 エントリが消え、新しいパッケージ名が 8 件入る（`@changesets/format`、`@manypkg/tools`、
`@pnpm/deps.graph-sequencer`、`cac`、`launch-editor`、`import-meta-resolve`、`shell-quote`、`jju`）。いずれも長期公開の既知パッケージで
install 時に走る script は無い。差し替え PR の lock は bot PR と削除集合が一致し、追加集合は bot より 3 件少ない
（`@clack/prompts@1.8.0` と `yaml@2.9.0` を main の既存版で解決し、bot が持ち込む 1.8.1 / `@clack/core@1.5.1` / 2.9.1 の重複を作らない）。

### #2867: 再生成で上げ、compiler の版は stable の v0.89.17 を pin した

`.claude/rules/dependabot.md` と ADR-2753 のとおり、bot PR は `uses:` 12 箇所だけを書き換え `gh-aw-manifest` / `compiler_version` /
`actions-lock.json` を据え置くので却下し、再生成 PR #2878 で入れた。PR タイトルの「from 0.88.8」は Dependabot の読み違いで、
対象ファイルはすべて v0.88.7 起点だった。

Dependabot の要求版 v0.89.15 ではなく **v0.89.17** を pin した。`github/gh-aw` では v0.89.0〜v0.89.15 が prerelease で、v0.89.17（2026-09-19）が
v0.89 系で最初の stable だったから。公開 3 日後で cooldown 7 日には満たないが、gh-aw-actions は開発が活発で bot PR を待つと次の版が
来続けることと、annotated tag の参照先 commit と pin した SHA `f3b81cdb` が一致し、2 回コンパイルして idempotent であることを確かめた上で
入れると判断した。

再生成の差分で権限に関わるのは 1 点で、**生成される `activation` job に `issues: write` が付く**。使うのは compiler が出す
「compile-agentic version チェック」step だけで、upstream が compiled version をブロックしたとき `[aw] Workflows blocked by compile-agentic …`
Issue を開く通知用（`GH_AW_BLOCKED_VERSION_REPORT_AS_ISSUE`）。agent job の scope でも workflow ソースの `permissions:` でもなく、
frontmatter の `on.report-blocked-version: false` で通知は切れるが scope 自体は残る仕様なので、既定のまま「記録した上で受け入れる」とした。
agent job の `permissions:` と `GH_AW_INFO_ALLOWED_DOMAINS` は両 workflow とも不変。CodeRabbit が「artifact upload step に
`continue-on-error: true` を足せ」と求めたが、生成物への手パッチは次の compile で消え「再コンパイルしても差分が出ない」到達状態を
自分で破るので却下した。detection 側の upload が fatal なのは v0.88.7 でも同じで、ADR-2786 の方向とも一致する。

### その他の 8 件

- #2868: `action.yml` は入力 2 つの追加のみ（既定値は不変）。本 repo は `client-id` / `tenant-id` / `allow-no-subscriptions` しか渡さない
- #2869: `<ViewTransition />` 追加と transition の独立 render 化。4 つを同時に動かすので peer は揃い、typecheck を含む全 job が green
- #2870: `DataTransfer` の alias 正規化と iframe 対応の 2 commit
- #2872: 99 commit の大半が download / session lifecycle の CI 向け強化。新しい名前は `tar` 系 3 件（`isaacs` 管理）。arm64 では ExTester を
  回せないので CI の ExTester job（green）で判断
- #2873: Breaking なし。`packages/app` だけが 8.3.0 に上がり `vitest` / `astro` は 8.2.2 を指したまま並存する（ADR-2836 の `undici` と同形）
- #2874: 既定設定の `sanitize(raw)` のみで allow-list を広げていないので 3.4.14 の bypass 修正の恩恵側。override `^3.4.13` と宣言は不変
- #2875: 2.1.13 は npm に存在せず 2.1.14 が含む。`postinstall` の `-f` 削除は本 repo では無影響
- #2876: CommonMark 準拠の修正 40 commit、依存なし

### マージ順は lock を作り直して検証した

ADR-2836 と同じく、マージ順に bot ブランチを main へ重ね、各時点で `pnpm install --lockfile-only` が lock に差分を出さないことを
確かめてから進めた。#2868 / #2875 / #2872 / #2876 / #2874 / #2870 の 6 件はテキストで重なり lock も一致したので rebase なしで順にマージした。
#2873 と #2869 は `packages/app` の隣接行でぶつかったので `@dependabot rebase` を 1 回ずつ依頼し、CI green の後に同じ検証をしてマージした。
マージ後の main の lock と `packages/app/package.json` は検証した状態と一致した。#2880 はその main の上で lock を作り直し、
`pnpm install --lockfile-only` が no-op、`--frozen-lockfile` が通ることを確かめた。

## 却下した案

- **#2871 を bot PR のままマージする**: CI は green だが `changeset version` を回していない。次の release-prepare が mixed changeset で失敗する
- **#2871 を保留し、先に main の `config.json` だけ直す**: `privatePackages` は v2 でも受け付けるが、exit code の対応は v3 でしか意味を
  持たず、2 PR に分けると片方だけ入った中間状態が生まれる
- **`karasu-vscode` を `ignore` に入れて v3 の既定に合わせる**: ADR-1758 の決定を変えることになり、今回の bump の範囲ではない
- **release-prepare で `pnpm version-packages || true`**: 本物の失敗も「nothing to release」に見せてしまう（TPL-2786）
- **guard に `.changeset/pre.json` の `"mode": "exit"` 分岐を足す**（CodeRabbit の指摘）: 本 repo に prerelease flow が無く、
  入らない状態を守る未検証の経路になる。制限はコメントに残した
- **#2867 を bot PR に `actions-lock.json` の修正を足して通す**: `gh-aw-manifest` は compiler 出力なので compiler を通さずに整合させられない（ADR-2753）
- **#2867 の再生成を v0.89.17 の公開 7 日後まで待つ**: 上記のとおり、SHA 検証と idempotent 検証を根拠に待たないことを選んだ

## 影響

- `.changeset/config.json` に `privatePackages` が明示され、changesets の major が private パッケージの既定を変えても `karasu-vscode` の扱いは
  config が決める。次に `@changesets/config` の major が来たら `$schema` と一緒に見直す
- `release-prepare.yml` は「pending なし」を changeset ファイルの有無で判定する。prerelease mode を導入するときは guard も直す
- `vite` が 8.2.2（`vitest` / `astro` 経由）と 8.3.0（`packages/app`）に分かれた。次に `vitest` / `astro` が動いたときに畳まれる見込み
- gh-aw の compiler は v0.89.17。`activation` job に `issues: write` が付いた状態が以後の再生成でも続く
