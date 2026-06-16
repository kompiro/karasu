---
id: ADR-20260616-10
title: "@karasu-tools/core を v0.x の公開パッケージにする（development 条件で build 非依存 typecheck を維持）"
status: accepted
date: 2026-06-16
topic: build
related_to:
  - ADR-20260616-06
  - ADR-20260512-05
scope:
  packages: [core, cli, lsp, vscode]
assumptions:
  - "file: packages/core/README.md"
  - "file: packages/core/LICENSE"
  - "grep: packages/core/package.json :: development"
  - "grep: tsconfig.json :: customConditions"
  - "file: docs/acceptance/1363-publish-core-package.md"
---

# ADR-20260616-10: @karasu-tools/core を v0.x の公開パッケージにする（development 条件で build 非依存 typecheck を維持）

- **日付**: 2026-06-16
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#1363](https://github.com/kompiro/karasu/issues/1363)
  - 親 Issue: [#1302](https://github.com/kompiro/karasu/issues/1302)（ハイブリッド版管理）, [#1317](https://github.com/kompiro/karasu/issues/1317)（公開ローンチ — 実 publish ゲート）
  - 設計 PR: [#1651](https://github.com/kompiro/karasu/pull/1651)（旧 `docs/design/publish-core-package.md` — 本 ADR に集約して削除）, 実装 PR: [#1656](https://github.com/kompiro/karasu/pull/1656)
  - 統治 ADR: [ADR-20260616-06](20260616-06-krs-spec-v1-freeze.md)（`.krs` は v1.0、**TS API は v0.x**）, [ADR-20260512-05](20260512-05-release-automation-changesets.md)（changesets 運用）
  - AT: `docs/acceptance/1363-publish-core-package.md`

## 背景

#1302 のハイブリッド版管理は「`.krs` / `.krs.style` 言語は v1.0、`packages/core` の
TS API は v0.x（無保証）」を定めた（[ADR-20260616-06](20260616-06-krs-spec-v1-freeze.md)）。
その v0.x 側を実体化するため、これまで `private: true` で `exports` が `src/index.ts`
を指していた `@karasu-tools/core` を npm に公開可能な形にする（#1363）。

調査で分かった核心:

- **core は self-contained**（ランタイム依存は `yaml` のみ。`@karasu-tools/i18n` への
  参照はコメントのみで、依存方向は i18n → core）。よって単体公開できる。
- 消費側（app/cli/lsp/vitest）は **明示的な alias で `core/src` を直接解決**する一方、
  `tsc --noEmit` は package.json の **`exports.types` → `src`** を使う。そのため今は
  build なしで typecheck が通る。`exports.types` を素朴に `dist` に向けると、消費側の
  typecheck が core の事前 build を要求してしまう（#1363 が警告した CI 順序の結合）。

## 決定

**`@karasu-tools/core` を v0.x の公開パッケージにする。`development` export 条件 +
tsconfig `customConditions` で、公開先には `dist` を、repo 内には TS ソースを解決させ、
`pnpm typecheck` を build 非依存に保つ。** 実 publish と `@karasu-tools` npm org 予約は
公開ローンチ（#1317）ゲート。

個別の判断:

- **exports**: `{ development: ./src/index.ts, types: ./dist/index.d.ts,
  import/default: ./dist/index.js }`。`private` を外し `main`/`types` を `dist` に。
  `files: ["dist", "icons"]`（src は公開しない。README/LICENSE は npm が自動同梱）。
- **build 非依存 typecheck**: root tsconfig に `customConditions: ["development"]` を
  追加。root を extends しない standalone な消費 tsconfig（`lsp`・`cli`）にも個別追加。
  `vscode` の tsconfig は classic CommonJS（top-level `main`/`types` を読む）だったため
  **root を extends する形に変更**（bundler 解決 + 条件を継承）。これで全パッケージが
  build なしで typecheck green。
- **公開 API 面は現状据え置き**: 約 94 export をそのまま v0.x（無保証）で公開する。
  example プロジェクト dump や `getReference()` の subpath / 別パッケージ化は
  **post-v0.x** の curation 候補に留める（利用実績を見てから絞る。早すぎる最小化を避ける）。
- **CLI は bundling 維持**: CLI は esbuild で core src を内包し続け、公開 core への依存に
  切り替えない（moving parts を減らす）。`lsp`/`i18n` は公開対象外。
- **changesets**: `.changeset/config.json` の `ignore` から core を外し、v0.x changeset を
  追加。

## 理由

- **build 非依存 typecheck の維持**: `development` 条件は repo 内ツール（tsc）に src を、
  公開先に dist を解決させる。CI の typecheck→build 順を保て、ローカル `pnpm typecheck`
  も build 不要のまま。alias を使う Vite/vitest/esbuild は無影響。
- **v0.x の趣旨に合致**: 無保証なので API 面の完璧な curation を前提にしない。現状面を
  公開し、churn を避ける。
- **公開先の正しさ**: 公開 tarball は `dist`（js + d.ts）+ `icons` のみで src を含まない
  （`npm pack --dry-run` で検証）。

## 却下した案

- **CI を build→typecheck 順に並べ替える**: `exports.types` を `dist` のみにする案。
  typecheck が常に build に依存し、ローカル開発体験が悪化、app/cli/lsp にも波及する。
- **公開専用の最小エントリ（curated subset）を切る**: 現在の使われ方が未知のまま絞ると
  利用者の幅を狭める。v0.x には過剰で、post-v0.x に回す。
- **vscode に `paths`→src を張る / `node16` 解決にする**: 前者は core src を vscode の
  program に取り込み `rootDir` 違反、後者は CJS→ESM の `require` 境界（TS1479）に当たる。
  root extends（bundler）が最も素直だった。
