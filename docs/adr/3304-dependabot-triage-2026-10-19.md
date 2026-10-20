---
id: ADR-3304
title: Dependabot トリアージ 2026-10-19：npm 11 件をそのまま採用し、gh-aw-actions は却下する。lefthook 2.2.2 の手動 publish は採用可と判断する
status: accepted
date: 2026-10-20
topic: build
related_to:
  - ADR-3242
  - ADR-2753
  - ADR-2474
  - ADR-784
scope:
  packages: [app, core, docs-site, vscode]
  concerns: [ci, dependencies, security]
---

# ADR-3304: Dependabot トリアージ 2026-10-19：npm 11 件をそのまま採用し、gh-aw-actions は却下する。lefthook 2.2.2 の手動 publish は採用可と判断する

- **日付**: 2026-10-20
- **ステータス**: 決定済み
- **関連**:
  - Design Doc PR: [#3304](https://github.com/kompiro/karasu/pull/3304)（本 ADR に昇格し削除）
  - 対象 Dependabot PR: [#3291](https://github.com/kompiro/karasu/pull/3291) / [#3292](https://github.com/kompiro/karasu/pull/3292) / [#3293](https://github.com/kompiro/karasu/pull/3293) / [#3294](https://github.com/kompiro/karasu/pull/3294) / [#3295](https://github.com/kompiro/karasu/pull/3295) / [#3296](https://github.com/kompiro/karasu/pull/3296) / [#3297](https://github.com/kompiro/karasu/pull/3297) / [#3298](https://github.com/kompiro/karasu/pull/3298) / [#3299](https://github.com/kompiro/karasu/pull/3299) / [#3300](https://github.com/kompiro/karasu/pull/3300) / [#3301](https://github.com/kompiro/karasu/pull/3301) / [#3302](https://github.com/kompiro/karasu/pull/3302)
  - 前回トリアージ: [ADR-3242](./3242-dependabot-triage-2026-10-15.md)（gh-aw は 10-21 以降に再生成と決めた）
  - gh-aw の再生成規則: [ADR-2753](./2753-dependabot-triage-2026-09-07.md)、`.claude/rules/dependabot.md`
  - 判定語彙: [ADR-2474](./2474-dependabot-replacement-pr-vocabulary.md)、cooldown 7 日: [ADR-784](./784-update-dependencies-20260421.md)

## 背景

2026-10-19（月）21:44–21:49 UTC に週次の Dependabot PR が 12 件起票された（github-actions 1 件、npm 11 件）。
security update ではない（`security` ラベル無し、open な Dependabot alert は 0 件）。npm 11 件は CI green、gh-aw の 1 件は
`gh-aw-lock-consistency.test.ts` で Check が落ちていた。

**供給側（配布主体・改ざん）の懸念は見つからなかった。** 確認したこと:

- **publisher / maintainer**: to 版の publisher の種類は from 版と同じ。GitHub Actions OIDC + provenance でないのは
  `knip` / `unbash`（`webpro`）、`dompurify`（`cure53`）、`i18next`（`adrai`）、`@types/node`（`types`）で、いずれも過去の版から同じ
- **lifecycle script**: to 版で追加・変更されたものはゼロ。既存は `lefthook` の `postinstall: node postinstall.js`（前後で不変）と、
  registry install では走らない `prepare: husky` だけ
- **コード差分**: `npm diff` で from…to の tarball を比べ、追加行を `child_process` / `eval` / `new Function` / `process.env` /
  `fetch(` / base64 decode / 外部 URL で grep し、該当箇所を読んだ。`vitest` は chunk のハッシュ名が変わるため追加行が 6 万行
  出るが、パッケージ全体での各パターンの出現数は 5.0.3 と 5.0.4 で同じだった
- **既知 advisory**: to 版すべてで該当ゼロ
- **公開からの経過**: すべての to 版と、transitive で新しく入る版が起票時点で cooldown 7 日を越えていた
- **依存エッジ**: lock の snapshot を peer suffix を落として merge-base と各 PR ヘッドで突き合わせた（bump 対象自身の行も含めた）。
  main の lock に無いパッケージ名が新しく入る PR は 0 件

| PR | 依存 | from → to | CI | リスク | 判定 |
| --- | --- | --- | --- | --- | --- |
| #3301 | `lefthook`（root、dev） | 2.2.0 → 2.2.1 | green | low | 採用（そのままマージ） |
| #3302 | `smol-toml`（core） | 1.9.0 → 1.9.1 | green | low | 採用（そのままマージ） |
| #3299 | `@types/node`（全 package、dev） | 26.6.4 → 26.6.5 | green | low | 採用（そのままマージ） |
| #3298 | `dompurify`（app） | 3.4.16 → 3.4.17 | green | low | 採用（そのままマージ） |
| #3297 | `marked`（app / vscode） | 18.1.0 → 18.1.1 | green | low | 採用（そのままマージ） |
| #3300 | `lucide-react`（app） | 1.53.0 → 1.55.0 | green | low | 採用（そのままマージ） |
| #3294 | `@anthropic-ai/sdk`（app） | 0.132.1 → 0.133.0 | green | low | 採用（そのままマージ） |
| #3293 | radix group（`react-dialog` 1.3.1 / `react-dropdown-menu` 2.2.1 / `react-tabs` 1.2.1 / `react-tooltip` 1.4.1、app） | minor | green | low | 採用（そのままマージ） |
| #3292 | `vitest` / `@vitest/coverage-v8` | 5.0.3 → 5.0.4 | green | low | 採用（そのままマージ） |
| #3295 | `knip`（root、dev） | 6.40.0 → 6.41.0 | green | low | 採用（そのままマージ） |
| #3296 | `@astrojs/starlight`（docs-site、dev） | 0.42.5 → 0.42.6 | green | low | 採用（そのままマージ） |
| #3291 | `github/gh-aw-actions/setup` | 0.89.21 → 0.91.9 | Check red | 対象外 | 却下 |

## 決定

**npm 11 件はそのままマージし、gh-aw-actions の bot PR は却下して再生成に回す。** 差し替え PR が必要な件は無かった
（override の floor が脆弱範囲に入る件も、設定ファイルを bump と同時に動かす必要がある件も無い）。

**lefthook 2.2.2 は、wrapper が maintainer の手動 publish でも採用してよいと判断した。** 今回は rebase 前に #3301 をマージした
ので 2.2.1 で入ったが、次回 Dependabot が 2.2.2 以降を出したときにこの判断を使う。根拠:

- 2.2.2 の `lefthook` パッケージ（wrapper）だけが `mrexox` の個人アカウントから provenance なしで publish されている
  （2.2.0 / 2.2.1 は GitHub Actions OIDC + provenance）
- 原因は upstream の release workflow（run 38374933526）の `publish-npm` ジョブの失敗で、再実行が
  `You cannot publish over the previously published versions: 2.2.2` で落ち、wrapper は手で publish された
- 実際に実行される platform binary 10 パッケージ（`lefthook-linux-x64` など）は 2.2.2 でも OIDC + provenance
- wrapper の tarball は 2.2.1 との差分が `package.json` の版（自身と binary 10 件）と README だけで、`postinstall.js` は不変
- 2.1.15 も同じ形（wrapper だけ手動 publish）で、その前後は OIDC に戻っている

このため「publisher の種類が変わった版」でも、**実行されるコードの出所が provenance で確認でき、手動 publish された部分の中身が
前版と同一である**なら採用してよい。どちらかが崩れたら（binary に provenance が無い、wrapper のスクリプトが変わった）保留にする。

### gh-aw-actions（#3291）: 却下

bot は 2 つの `.lock.yml` の `uses:` 行だけを書き換えるので `gh-aw-lock-consistency.test.ts` が 2 件落ちる（ADR-2753）。0.91.9 は
github/gh-aw の prerelease。ADR-3242 で決めたとおり、非 prerelease の v0.91.12 が cooldown を越える 10-21 以降に再生成する
（v0.92.0 は 10-22 に越えるので、作業日に応じて新しい方を選ぶ）。`@dependabot ignore` は付けずに close した。

## 理由

- 11 件とも upstream の変更が修正・追加中心で、karasu の使い方に当たる破壊的変更が無かった:
  - `dompurify` 3.4.17: `IN_PLACE` モードと namespace 判定の hardening（instance の own property ではなく `Element.prototype` の
    getter で `namespaceURI` / `tagName` を読む）。karasu は `IN_PLACE` を使わない。`dependencies` に `@types/trusted-types` が
    加わったが型定義だけで、lock の版は 2.0.7 のまま。`pnpm-workspace.yaml` の `dompurify: ^3.4.16` は advisory が無いので据え置いた
  - `marked` 18.1.1: CommonMark 準拠の修正。app は描画前に `DOMPurify.sanitize` を通すので、パース結果の変化はサニタイズの手前に留まる
  - radix group: 1.3.0 / 2.2.0 系は `exactOptionalPropertyTypes` 対応の型変更、1.3.1 / 2.2.1 系はその regression 修正。bump 後も
    各 primitive は 1 版だけで、#3199 の揃えを崩さない
  - `knip` 6.41.0: 部分木で `unbash` 5.1.0（major、同じ作者）、`formatly` 0.11.4、`oxc-parser` 0.153.0 が動く。knip の changelog に
    unbash v5 と formatly の新しい結果型への移行が書かれている。`formatly` の `child_process` 増加は dprint 用 formatter で、
    knip の `--format` でしか呼ばれない（karasu は使わない）
  - `lucide-react`: アイコンの追加のみで削除は 0。karasu が import する `ChevronRight` / `X` は残る
  - `@anthropic-ai/sdk`: 型の追加のみ。karasu が使うのは `client.messages.create` だけ
  - `smol-toml`: 数値リテラルの指数部の符号の修正 1 か所（`packages/core/src/translate/wrangler.ts` が使う）
- `@astrojs/starlight` は CI が docs-site をビルドしないので、merge-base と PR ヘッドの両方でローカルにビルドし、`_astro/` の
  ハッシュ・Astro / Starlight の版文字列・Astro の scope class（`astro-xxxxxxxx`）を正規化して比べた。73 ページの HTML が
  すべて一致し、WARN も main と同じ 2 件だった

## 反映

ユーザー判断（2026-10-19）: npm 11 件をそのまま採用する。lefthook が rebase で 2.2.2 になっても採用する。#3291 は却下する。

- #3301 を rebase 前に最初にマージし（2.2.1 のまま）、残りは #3302 → #3299 → #3298 → #3297 → #3300 → #3294 → #3293 → #3292 →
  #3295 → #3296 の順に `@dependabot rebase` → CI green → squash merge（10-19 22:55 〜 10-20 02:08 UTC）。毎回マージの前に、PR タイトルの
  版と、rebase 後の lock の依存エッジを main と比べた。rebase で版が上がった PR は無く、新しく入る版はトリアージ時に確認したものから
  先にマージした PR の分が抜けただけだった
- #3291 を close した（ignore なし）

## 運用上の学び

- **`gh pr merge` が GraphQL のエラーを返しても、マージ自体は成立していることがある。** #3298 は 23:51:33 UTC にエラーが返り、
  直後の `gh pr view` では `OPEN` だったが、実際には 23:51:46 にマージされていた（ADR-3242 の #3245 の 502 と同じ種類）。
  エラーが出たら数十秒おいて `mergedAt` を確認してから再実行する
- `gh pr checks --watch` は、その時点で登録済みの check だけを待つ。Playwright のように後から登録される required check が
  あるので、待ち終えたら pending の check が 0 件かをもう一度確かめる
- rebase で版が上がりうる版（cooldown を越えた新しい版）をトリアージの時点で一覧にし、`lucide-react` 1.56 / `@anthropic-ai/sdk`
  0.134 / `lefthook` 2.2.2 を事前に確認しておいた。今回は cooldown を越える前に順番が回ったので使わなかったが、lefthook の
  publisher の変化はこの事前確認で見つかった

## 却下した案

### lefthook 2.2.2 を `@dependabot ignore` して次の OIDC 版を待つ

publisher の種類が変わった版を一律に避ける案。実行される binary は provenance 付きで、手動 publish された wrapper の中身は
2.2.1 と同一なので、避けても安全性は上がらない。upstream の release workflow が失敗するたびに版を飛ばすことになる。

### lefthook を 2.2.1 に戻す差し替え PR にする

rebase で 2.2.2 に上がった場合に 2.2.1 で入れる案。上と同じ理由で、2.2.1 に留めても守れるものが無い。
