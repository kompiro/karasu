---
id: ADR-2397
title: ツールチェーンの Node.js を 24（Active LTS）に上げ、公開パッケージの下限を 22 にする
status: accepted
date: 2026-08-08
topic: build
related_to:
  - ADR-199
  - ADR-349
  - ADR-1315
  - ADR-2142
  - ADR-9020
scope:
  packages: [core, cli]
  concerns: [ci, dependencies, security]
assumptions:
  - "grep: .devcontainer/Dockerfile :: typescript-node:1-24-bookworm"
  - "file: scripts/ci/node-version-policy.test.ts"
  - "grep: packages/core/package.json :: \"node\": \">=22\""
---

# ADR-2397: ツールチェーンの Node.js を 24（Active LTS）に上げ、公開パッケージの下限を 22 にする

- **日付**: 2026-08-08
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2397](https://github.com/kompiro/karasu/issues/2397)
  - [ADR-199](./199-update-dependencies-20260331.md)（`@types/node` を 25 系へ、CI は Node 22 と記録）
  - [ADR-1315](./1315-release-automation-changesets.md)（`engines.node: ">=20"` と esbuild `--target=node20` をセットで決めた）
  - [ADR-9020](./9020-npm-trusted-publishing-oidc.md)（npm OIDC の要件 npm >= 11.5.1 / Node >= 22.14.0）
  - [TPL-2253](../test-perspectives/TPL-2253-removal-sweep-needs-a-search-not-a-file-list.md)（sweep は検索で閉じる）

## 背景

Node.js の[リリーススケジュール](https://github.com/nodejs/Release/blob/main/schedule.json)に対して、リポジトリの pin が 2 つの意味でずれていた。

| ライン | 2026-08 時点 | maintenance 入り | EOL |
| --- | --- | --- | --- |
| v20 (Iron) | **EOL** | 2024-10-22 | 2026-04-30 |
| v22 (Jod) | maintenance | 2025-10-21 | 2027-04-30 |
| v24 (Krypton) | **Active LTS** | 2026-10-20 | 2028-04-30 |

1. CI と devcontainer は Node 22 で動いていた。約 10 か月前に maintenance へ入っており、critical fix しか降ってこない。
2. `packages/core` と `packages/cli` の `engines.node` が `">=20"` だった。両者は npm に公開しているので、これは利用者への約束として EOL 済みランタイムを掲げていることになる。

加えて、pin は `node-version:` / devcontainer のベースイメージタグ / `engines.node` / esbuild `--target=nodeNN` という 4 つの異なる形で散在しており、バージョン更新が毎回 sweep になっていた。

## 決定

ツールチェーン（CI 全ワークフロー・devcontainer・配布する GitHub Actions テンプレート）を Node 24 に統一し、公開パッケージの `engines.node` は `">=22"` に上げる。両者が乖離しないことを `scripts/ci/node-version-policy.test.ts` で機械的に縛る。

## 理由

- **ツールチェーンは Active LTS に置く。** 24 は 2028-04 までサポートされる。22 に留まると、次に動く頃には EOL が視野に入る。
- **公開パッケージの下限は 24 ではなく 22 にする。** `karasu` と `@karasu-tools/core` は他人が使うライブラリで、下限の引き上げは下流に破る約束になる。22 は 2027-04 まで maintenance LTS として生きているので、**EOL したライン（20）だけを落とす**のが最小の破壊になる。CI は 24 で回すため、宣言している最古のランタイムより上でビルドしていることになるが、逆（CI が宣言下限より下）でなければ問題ない。
- **esbuild の `--target` を engines と揃える。** ADR-1315 は `engines: ">=20"` と `--target=node20` を同時に決めていた。engines だけ上げると、もうサポートを謳っていないランタイム向けにダウンレベル出力し続けることになる。どこも壊れずに緑のまま残るので、ガードが無ければ気づけない。
- **release job から `npm install -g npm@latest` を落とす。** このステップは「Node 22 の同梱 npm が 10.x で、OIDC 要件の 11.5.1 に届かない」ために存在していた（ADR-9020）。Node 24 は npm 11.17+ を同梱するのでランタイム側で要件を満たす。publish 権限を OIDC で持つ唯一の job が、実行時に registry から無 pin で最新 npm を取ってくるのをやめられる分、サプライチェーン面はむしろ改善する。
- **sweep を検索で閉じ、ガードを残す。** Issue #2397 は対象を 19 箇所と手で列挙していたが、全文検索すると 21 箇所あった（`examples/github-actions/*.yml` の 2 件が漏れていた。これらは `docs/github-actions.md` が「コピーして使え」と案内しているテンプレートで、利用者が karasu を動かすランタイムの推奨そのもの）。TPL-2253 が言うとおり、列挙は計画であって完了条件ではない。完了条件は「pin が全部一致しているか」で、それをテストにした。

## 変更しなかったもの

TPL-2253 は「残す判断をした箇所は、なぜ残すのかをその場に書く」ことを求めている。以下は検索に引っかかるが対象外とした。

- `README.md` / `docs/spec/syntax.md` / `docs/spec/syntax.ja.md` / `docs/acceptance/0029-system-to-deploy-navigation.md` の `runtime "Node.js 20"` — `.krs` サンプル中の**モデル対象システム**に付いたラベルであり、karasu 自身のツールチェーンではない。
- `packages/lsp` と `packages/vscode` の esbuild には `--target` が無い — 相手は VS Code 拡張ホストの Node で、そのバージョンは Electron が決める。こちらの pin の管轄外。
- ADR-199 / ADR-349 / ADR-2142 の本文にある「CI は Node 22」「リポジトリの要求は node 20+」という記述 — ADR は歴史的記録なので書き換えない（`.claude/rules/adr.md`）。事実の更新は本 ADR が担う。

## 却下した案

- **`engines.node` も 24 にする。** ツールチェーンと下限を 1 つの数字に畳めて分かりやすいが、まだ 2027-04 までサポートされる 22 の利用者を、こちらの都合だけで切ることになる。得るものが「数字が 1 つで済む」ことしかない。
- **Node 版を単一ソース化する（`.nvmrc` + `node-version-file:`）。** 21 箇所の pin を 1 箇所に畳む案。ワークフローの差分は小さくなるが、devcontainer のベースイメージタグと `engines.node` と esbuild target は結局 `.nvmrc` から読めないので、sweep は残る。整合を**検査する**ガードのほうが、同じコストで対象を全部カバーできる。単一ソース化は本 ADR を否定しないので、必要になった時点で上に足せる。
