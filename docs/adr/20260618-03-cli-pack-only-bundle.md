---
id: ADR-20260618-03
title: "karasu CLI の publish 成果物を単一バンドル `dist/index.js` に固定する"
status: accepted
date: 2026-06-18
topic: build
scope:
  concerns:
    - ci
related_to:
  - ADR-20260512-05
---

# ADR-20260618-03: karasu CLI の publish 成果物を単一バンドル `dist/index.js` に固定する

- **日付**: 2026-06-18
- **ステータス**: 決定済み
- **関連**:
  - Issue #1681 — published karasu@0.0.1 ships no build (tarball is package.json + README only)
  - ADR-20260512-05 — changesets による OSS リリース自動化（`karasu` CLI のみ npm 公開）
  - TPL-20260618-02 — publish する tarball の内容物完全性・除外（本 ADR を root cause とする retrospective TPL）
  - TPL-20260510-15 — dev / packaged モードの parity
  - PR #1690（Design Doc, 本 ADR に集約のうえ削除）

## 背景

npm に公開済みの `karasu@0.0.1` は **name reservation（パッケージ名の確保）を目的とした意図的なプレースホルダ publish** であり、実装を含んでいなかった。tarball の中身は `package.json` + `README.md` の 2 ファイルのみで、`dist/` も `bin` も無い。そのため `npx karasu render …` は `could not determine executable to run` で失敗する。これ自体は当時の意図通りだが、OSS launch（#1317）に向けて **次回 release で build を含む正しい tarball を確実に publish できる状態** にしておく必要がある。`kompiro/karasu-action`（#302）も `npx karasu render` を wrap するため、動く `karasu` の公開が前提となる。

現行の packaging 設定（`prepack: pnpm run build` / `files` / `bin`）自体は正しく、クリーンな CI checkout では `dist/index.js`（esbuild の単一バンドル）を含む tarball が出る。

ただし `files: ["dist"]` は **`dist/` ディレクトリをまるごと** pack する glob であり、`dist/` の中身が「バンドル単体である」ことを何も保証していない。`dist/` は gitignore された作業ディレクトリで、`tsc`（`--noEmit` なし）を手元や IDE が走らせると `tsconfig.json`（`declaration: true` / `outDir: ./dist`）の設定で `*.test.js` / `*.d.ts` / `*.map` が emit される。その状態で publish すると、テスト成果物・型定義・sourcemap が tarball に紛れ込む。配布面が **環境依存で非決定的** になっていた。

## 決定

`packages/cli/package.json` の `files` を、ディレクトリ glob から **公開する成果物そのもの** に固定する:

```diff
- "files": ["dist", "THIRD_PARTY_NOTICES.md"]
+ "files": ["dist/index.js", "THIRD_PARTY_NOTICES.md"]
```

公開物は esbuild の単一バンドル `dist/index.js` だけなので、`files` をその 1 ファイルに限定する。`dist/` に stale な emit が残っていても pack されるのは `dist/index.js` のみとなり、配布面が **決定論的** になる。

あわせて、

- `packages/cli/src/packaging.test.ts` を追加し、`files` がバンドル単体に固定されていること（ディレクトリ glob に退行しないこと）・`bin.karasu` がその成果物を指すことを assert する回帰ガードを置く。
- `karasu: patch` の changeset を追加する。次回 release で pending の minor 群とともに `0.1.0` に上がり、build を含む正しい tarball で `0.0.1`（name reservation 用）を上書きする。実際の npm publish は `NPM_TOKEN` / OSS launch（#1315）にゲートされており、本 ADR のスコープ外。

## 検討した代替案

- **build 前に `dist/` を clean する（`rm -rf dist && esbuild …`）**: stale な tsc 出力そのものを消すので dev の hygiene は上がるが、`files: ["dist"]` のまま残すと clean を通らない経路（build 抜きの手動 `npm pack` 等）では依然混入しうる。決定論性は `files` 限定ほど強くない。任意の hygiene 改善として将来併用は可能だが、本件の解としては不要。
- **`tsconfig.build.json` で `*.test.ts` を exclude する**: core が使う `tsc -p tsconfig.build.json` 方式。しかし CLI の build は **esbuild であって tsc ではない**。混入の原因は build pipeline ではなく `--noEmit` 抜き tsc の副産物であり、tsconfig をいじっても「`files: ["dist"]` がディレクトリ全体を信用している」根本は変わらない。

## 影響

- 既存ユーザーへの影響なし（壊れた `0.0.1` しか公開されておらず、正しく使えた利用者はいない）。次回 release で初めて動く `karasu` が公開される。
- `core` / `vscode` など他の publish 対象パッケージには本 ADR では手を入れない。ただし TPL-20260618-02 のチェックリストは横展開可能で、それらの `files` / tarball も同じ観点で見直す余地がある。
- spec / concepts / examples への影響なし。
