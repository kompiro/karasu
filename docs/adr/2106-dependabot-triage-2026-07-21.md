---
id: ADR-2106
title: Dependabot トリアージ 2026-07-21 — setup-node 採用・astro は starlight と協調 bump
status: accepted
date: 2026-07-21
topic: build
scope:
  packages: [docs-site]
  concerns: [dependencies, security]
related_to: []
---

# ADR-2106: Dependabot トリアージ 2026-07-21 — setup-node 採用・astro は starlight と協調 bump

- **日付**: 2026-07-21
- **ステータス**: 決定済み
- **関連**:
  - Design Doc PR: [#2106](https://github.com/kompiro/karasu/pull/2106)（本 ADR に昇格し削除）
  - 対象 Dependabot PR: [#2101](https://github.com/kompiro/karasu/pull/2101) / [#2102](https://github.com/kompiro/karasu/pull/2102) / [#2103](https://github.com/kompiro/karasu/pull/2103)
  - 協調 bump PR: [#2109](https://github.com/kompiro/karasu/pull/2109)
  - コード: `.github/workflows/*.yml`, `packages/docs-site/package.json`, `pnpm-lock.yaml`

## 背景

`hane:dependabot` の方針に従い、open だった 3 件の Dependabot PR を bump 種別を
問わず upstream まで遡ってサプライチェーン観点でリスク分析した。

| PR | 依存 | from → to | 種別 |
| --- | --- | --- | --- |
| #2101 | `actions/setup-node` | 6.4.0 → 7.0.0 | major |
| #2102 | `astro`（docs-site dir） | 6.4.7 → 7.1.0 | major |
| #2103 | `astro`（group / lockfile 込み） | 6.4.7 → 7.1.0 | major |

分析で判明した要点:

- **#2101**: 本 repo は setup-node を SHA pin している。PR の新 SHA
  `820762786026740c76f36085b0efc47a31fe5020` は upstream `actions/setup-node` の
  `v7.0.0` タグが指す commit と **完全一致**（`gh api` で検証）。リリースノートは
  ESM 化・cache output 追加・ダミー `NODE_AUTH_TOKEN` export 削除など無害で、
  OIDC publish に影響しない。CI 全通過。
- **#2102**: `package.json` だけを書き換え `pnpm-lock.yaml` を更新しておらず、CI が
  `ERR_PNPM_OUTDATED_LOCKFILE` で fail する #2103 の壊れた重複。
- **#2103**: サプライチェーンは低リスク（astro maintainers `fredkschott` /
  `matthewp` 不変、新規 lifecycle スクリプトなし、対象 7.1.0 は open advisory 圏外）。
  一方で **互換性のブロッカー**がある: docs-site は `@astrojs/starlight@^0.40.0` を
  使い、starlight 0.40.0 の peer は `astro ^6.4.5` で **astro 7 を許容しない**
  （astro 7 対応は starlight `^0.41`）。#2103 の lockfile は starlight 0.40.0 を
  astro 7.1.0 に対して peer 無視で force-resolve していた。しかも
  **PR CI は docs-site を build しない**（`astro build` は `pages.yml` の
  push-to-main でしか走らず、root `build` script は docs-site を filter 外にする）
  ため、この破壊は緑 CI をすり抜け、main への push 後に Pages デプロイを壊しうる。
- 追加の文脈: 現行 6.4.7 は **HIGH `GHSA-vj59-8hwv-xxmv`**（`>=6.4.7 <6.4.8`、fix
  6.4.8）に該当し、astro を上げる動機自体は正当かつ急ぎ。

## 決定

**#2101 を採用（マージ）、#2102 を却下（close）、#2103 は単独採用せず astro 7.1.3 と
`@astrojs/starlight` 0.41.3 を協調 bump する [#2109](https://github.com/kompiro/karasu/pull/2109)
に置き換える（Design Doc の案A）。**

## 理由

- **#2101 マージ**: SHA が upstream の正規 `v7.0.0` タグと一致し改ざんの兆候がなく、
  リリース内容も無害で、CI が全 workflow を横断して緑。low リスク。
- **#2102 close**: lockfile 未更新で CI が構造的に fail する #2103 の重複。残す価値なし。
- **#2103 を協調 bump へ置換**: astro 7 は starlight ^0.41 を要するため、astro 単独
  bump は starlight 0.40 の peer を壊す。PR CI が docs-site を build しないため
  この破壊は自動検出できない。よって astro と starlight を **1 つの PR（#2109）で
  一緒に上げ**、CI がスキップする docs-site の `astro build`（+ `check-links`）を
  **ローカルで実行して検証**した（65 ページ生成・pagefind index / sitemap 生成、
  docs-site vitest 59 passed、typecheck clean、lockfile は astro@7.1.3 +
  `@astrojs/markdown-remark@7.2.1` で starlight peer を満たす）。これにより現行
  6.4.7 の HIGH advisory も同時に解消する。
- **#2103 の再オファー抑止はしない**: #2109 が astro を 7.x に載せるため、将来の 7.x
  patch/minor 更新は歓迎する。`@dependabot ignore this major version` は 7.x 全体を
  抑止してしまうので取り消した。close は「協調 bump に superseded された」ためであって
  astro 7.x を避けるためではない。

## 却下した案

- **#2103 をそのままマージ（astro 単独 7.1.0）**: starlight 0.40.0 の peer 違反で
  docs-site build が壊れうる。PR CI が docs-site を build しないため緑をすり抜け、
  main への push 後に Pages が壊れるリスクが高い。却下。
- **暫定策として astro 6.4.8 へ patch bump（案B）**: HIGH advisory だけを先に潰し、
  starlight 0.40 との互換を保つ案。時間を稼げるが astro 7 移行を先送りするだけで、
  今回ローカル検証で協調 bump が問題なく通ったため案A を直接採用した。将来
  #2109 が難航した場合の退避策としては有効。

## 派生 follow-up

- docs-site の `astro build` が PR CI で走らない盲点（dev 依存の major bump を CI が
  緑にしてしまう）は別途 Issue 化を検討する。`packages/docs-site/**` 変更時に
  docs-site build を PR CI に含めるか、TPL 化する。
