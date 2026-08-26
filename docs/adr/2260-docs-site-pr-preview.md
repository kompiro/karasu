---
id: ADR-2260
title: "docs サイトは本番と同じ base path のまま別 Pages プロジェクトへ PR preview する"
status: accepted
date: 2026-08-22
topic: build
related_to:
  - ADR-1575
  - ADR-9017
  - ADR-953
  - ADR-1890
  - ADR-903
  - ADR-1961
scope:
  concerns:
    - ci
    - deployment
assumptions:
  - "file: .github/workflows/docs-preview.yml"
  - "file: packages/docs-site/wrangler.toml"
  - "grep: packages/docs-site/wrangler.toml :: karasu-docs"
  - "grep: .github/workflows/docs-preview.yml :: workingDirectory: packages/docs-site"
  - "grep: .github/workflows/docs-preview.yml :: packageManager: pnpm"
  - "symbol: scripts/lint/docs-site-ci-paths-sync.ts :: expandLocaleSiblings"
  - "grep: .github/workflows/preview-janitor.yml :: project: karasu-docs"
---

# ADR-2260: docs サイトは本番と同じ base path のまま別 Pages プロジェクトへ PR preview する

- **日付**: 2026-08-22
- **ステータス**: 決定済み
- **Issue**: [#2260](https://github.com/kompiro/karasu/issues/2260)
- **関連**:
  - 実装 PR [#2553](https://github.com/kompiro/karasu/pull/2553)
  - [ADR-1575](./1575-docs-site-ssg.md) — `docs/` を single source of truth として
    サイトを生成する決定。生成物が git に無いという本 ADR の前提はここで生まれた
  - [ADR-9017](./9017-cloudflare-deployment-and-byok-ai.md) — app の Cloudflare Pages
    デプロイ基盤。本 ADR はそこに 2 つ目のプロジェクトを足す
  - [ADR-953](./953-ci-docs-only-paired-stub-workflow.md) — paired stub による
    required check。preview は required にしないので stub を持たない
  - [ADR-1890](./1890-ci-runner-ubicloud.md) — secret を持つデプロイジョブは
    GitHub-hosted に留める
  - [ADR-903](./903-skip-secret-gated-jobs-on-bot-prs.md) — secret を読めない PR では
    ジョブを skip する
  - [TPL-2254](../test-perspectives/TPL-2254-durable-record-points-at-durable-address.md) —
    preview URL を記録に焼き付けない
  - 受け入れテスト: [AT-2260](../acceptance/2260-docs-site-pr-preview.md)
  - コード: `.github/workflows/docs-preview.yml`, `packages/docs-site/wrangler.toml`,
    `scripts/lint/docs-site-ci-paths-sync.ts`

## 背景

docs サイトは `docs/` から生成される（[ADR-1575](./1575-docs-site-ssg.md)）ため、
生成物は git に入っていない。`pages.yml` は main への push でのみデプロイするので、
docs の PR を読むレビュアーが見られるのは入力の markdown だけで、**レンダリング結果を
初めて見るのはマージ後**だった。4 件の受け入れテストが「公開サイトを見る」と書き、
その手動確認がマージ後にしか実施できなかったのはこの構造による。

app は `preview.yml` で PR ごとに preview を持っている。「読んで伝わるか」が最も効く面が
docs サイトであり、そこだけが preview を持っていなかった。

再検討の直接の契機は、[#2257](https://github.com/kompiro/karasu/issues/2257) の初期版が
「`base: "/karasu/"` は GitHub Pages のパスに結びついているので preview は本番と routing が
乖離する」と書いていたことである。**この主張はビルドを実測せずに書かれたもので、誤りだった。**
実測すると `dist/` はルート直下にページを出力し（`dist/concepts/index.html`）、生成される
リンクとアセットは `/karasu/` prefix を持つ。つまり `dist` をホストのルートで配ると 404 に
なるが、**1 階層下に置けば本番と同一に解決する**。

## 決定

docs サイト専用の Cloudflare Pages プロジェクト `karasu-docs` を設け、
**本番と同じビルド・同じ `base` のまま `dist/` を `karasu/` サブディレクトリへ置いて**
PR ごとにデプロイする。デプロイ経路は `docs-preview.yml` だけとし、Cloudflare の
Git 連携（push 追従）は使わない。

## 理由

- **設定を二重化しないことが preview の信頼性そのもの。** preview で見つけたい不具合は
  routing とリンクであり、`base: "/"` で別ビルドすれば URL は綺麗になるが、
  「preview で見えたものが本番でも同じか」を疑う余地が生まれる。ステージングで
  1 階層下げる方式なら本番と同じ成果物を配るので、その疑いが原理的に生じない。
  代償は URL が app より 1 階層深いこと（`…pages.dev/karasu/`）だけで、
  bare host は `_redirects` の `/  /karasu/  302` 1 行で着地させた。
- **root redirect は bare root のみにする。** `/*` splat にすると `/karasu/` prefix を
  欠いたリンクまで救済してしまい、preview が本番の 404 を隠す。実測でも
  `/concepts/` は preview 上で 404 のままであることを確認している。
- **app のプロジェクトは共有できない。** Pages のデプロイはアセット集合を丸ごと
  置き換えるため、同じプロジェクトに docs を入れると app が消える。
- **wrangler はリポジトリルートではなく `packages/docs-site` から実行する。**
  ルートの `functions/[[path]].ts` は静的アセットより先に走る catch-all
  （[ADR-1961](./1961-bare-permalink-route.md) の bare permalink）で、ルートから
  デプロイすると docs 側の全リクエストを横取りする。ルートの `wrangler.toml` は
  app のプロジェクト名も持っている。
- **working directory を移すと package manager の推論が壊れるので明示する。**
  wrangler-action は working directory の lockfile で package manager を選ぶ。
  `packages/docs-site` に lockfile は無いので npm に落ち、npm は `workspace:*` を
  含む package.json にインストールできない（`EUNSUPPORTEDPROTOCOL`）。
  `packageManager: pnpm` と working directory は対で意味を持つ。
- **secret を読めない PR では skip する。** fork PR も bot PR も secret を受け取れない。
  guard が無いと、リポジトリ外からの docs 貢献という最も起きやすいケースが、
  実行不可能なデプロイのせいで赤くなる（[ADR-903](./903-skip-secret-gated-jobs-on-bot-prs.md)
  と同じ判断を fork にも広げた）。
- **Cloudflare の Git 連携は使わない。** プロジェクト作成時に付けられる push 追従は、
  `docs-preview.yml` と二重にデプロイし、しかも main への push で docs サイトの
  **production デプロイ**を作る。公開先は GitHub Pages（`pages.yml`）であって
  Cloudflare ではないので、追従を切ってデプロイの所有者を Actions 単独にした。
- **preview は required check にしない。** 落ちてもマージを止めないので
  [ADR-953](./953-ci-docs-only-paired-stub-workflow.md) の paired stub は不要。
  `#2257` が入れた `reference-docs-check.yml` 側のガード（`check-links` 等）は
  preview が構成されていない PR でも走る必要があるため、preview はそれを置き換えない。

## 発火条件を 2 本目の手書きリストで閉じない

`paths:` はサイトが公開するものの手書きの写しであり、公開集合に足された doc が
`paths:` に足されないと**黙って**発火しなくなる（[TPL-2253](../test-perspectives/TPL-2253-removal-sweep-needs-a-search-not-a-file-list.md)）。
`scripts/lint/docs-site-ci-paths-sync.ts` を `reference-docs-check.yml` と
`docs-preview.yml` の両方に対して検査するよう一般化し、ディスク上に存在する
`.ja.md` 兄弟も期待集合に含めた。これで実際に `docs/glossary.ja.md` が
どの `paths:` にも一致していない（= 編集してもサイトのガードが 1 つも走らない）
ことが見つかった。

期待集合が「ツリーの事実」になったので、ガード自体も docs-only PR で走る必要がある
（`ci.yml` の vitest mirror は `paths-ignore: docs/**` で skip される）。
`reference-docs-check.yml` のステップに加え、lefthook の glob を `docs/**` に広げた。

`examples/**` も trigger に含める。`sync.ts` は `GALLERY_PAGES` の各 `.krs` を
ギャラリーページへレンダリングするので、examples の編集は docs の編集と同じだけ
サイトを変える。この関係は `PUBLISHED_EN_FILES` に現れないため、ガードでは検出できない。

## 却下した案

- **`base: "/"` で preview 用に再ビルドする** — URL は
  `…pages.dev/` で綺麗になるが、preview が本番と同じ成果物でなくなる。
  routing のバグを探すための面で routing 設定を変えるのは筋が悪い。
- **app の `karasu` プロジェクトを共有する** — デプロイがアセット集合を
  丸ごと置き換えるため、docs をデプロイすると app が消える。
- **`preview.yml` にジョブを足す** — デプロイ先プロジェクト・path filter・
  ステージングがすべて異なる。同じファイルに置くと docs の都合で app の preview の
  発火条件を触ることになる（`spike-preview.yml` を分けたのと同じ理由）。
  後始末ロジックだけは `.github/actions/purge-preview-deployments` で共有する。
- **`packages/core/**` を trigger に含める** — ギャラリーの SVG は core の
  レンダラーが生成するので厳密には影響するが、含めるとほぼ全てのコード PR で
  docs preview が走る。レンダラーの見た目は app の preview で確認できる。

## 未解決

preview ができたので、公開サイトを名指ししている 4 件の docs-site AT
（[#1710](https://github.com/kompiro/karasu/issues/1710) /
[#1711](https://github.com/kompiro/karasu/issues/1711) /
[#1712](https://github.com/kompiro/karasu/issues/1712) /
[#1734](https://github.com/kompiro/karasu/issues/1734)）を見直せる。ただし
TPL-2254 により「preview URL に差し替える」ことはできない — 記録より寿命の短い
アドレスだからである。マージ前の確認を PR 本文側の責務として書き直すかどうかの
判断が残る。
