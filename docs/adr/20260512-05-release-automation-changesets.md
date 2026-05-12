---
id: ADR-20260512-05
title: "OSS リリース自動化に changesets を採用し、当面は `karasu`（CLI）のみを npm 公開する"
status: accepted
date: 2026-05-12
topic: build
related_to:
  - ADR-20260330-05
scope:
  packages:
    - cli
  concerns:
    - ci
    - deployment
assumptions:
  - "file: .changeset/config.json"
  - "file: .github/workflows/release.yml"
  - "file: packages/cli/README.md"
  - "grep: package.json :: \"release\": \"pnpm build && changeset publish\""
  - "grep: packages/cli/package.json :: esbuild src/index.ts --bundle"
---

# ADR-20260512-05: OSS リリース自動化に changesets を採用し、当面は `karasu`（CLI）のみを npm 公開する

- **日付**: 2026-05-12
- **ステータス**: 決定済み
- **関連**:
  - 親 Issue: [#1302](https://github.com/kompiro/karasu/issues/1302)（OSS 化ブレインストーミング — hybrid versioning の決定を含む）
  - 引き金 Issue: [#1315](https://github.com/kompiro/karasu/issues/1315)（OSS launch Phase 2 — release automation）
  - 設計検討 PR: [#1355](https://github.com/kompiro/karasu/pull/1355)（旧 `docs/design/release-automation.md` — 本 ADR に集約して削除）
  - 実装 PR: [#1356](https://github.com/kompiro/karasu/pull/1356)
  - 関連 ADR: [ADR-20260330-05](20260330-05-vscode-extension-lsp-first.md)（VS Code 拡張が LSP server を esbuild バンドルする先例 — CLI も同じパターンを踏襲）

## 背景

OSS 公開（#1302）に向けて、リリースを「再現可能・低労力」なプロセスにする必要があった。着手時点の現状:

- npm にも `git tag` にも何も公開されておらず、publish 用の GitHub Actions workflow も存在しなかった（#1302 の表にある「Already published as `@kompiro/karasu-tools`」は実体が確認できず、リポジトリ上の CLI パッケージ名は `karasu`）。
- パッケージ構成: `karasu`（`packages/cli`、ユーザー向け CLI、`@karasu-tools/core` に `workspace:*` 依存）/ `@karasu-tools/core`・`@karasu-tools/lsp`（`private: true`）/ `karasu-vscode`（Marketplace 配布）/ `@karasu-tools/app`・`*-e2e`（非公開）。
- `@karasu-tools/core` の `package.json` は `main` / `exports.types` / `exports.default` が `./src/index.ts` を指す（ワークスペース内部の慣習 — `app` 等は Vite/tsx で TS ソースを直接解決する）。これを公開パッケージとして整える（`exports` を `dist` に向ける・`pnpm typecheck` を `pnpm build` 依存にする等）のは `app` / `lsp` の設定にも波及する非自明な作業。
- バージョニング方針は #1302 で「`.krs` / `.krs.style` 言語仕様は launch 時 v1.0（安定）、`packages/core` の TS API は v0.x（安定保証なし）」と決定済み。コミットは CLAUDE.md で Conventional Commits を実践済み。

リリースツールの候補は changesets / release-please / 手動 + CHANGELOG.md。比較・トレードオフの詳細は旧 `docs/design/release-automation.md`（#1355）にあるが、要点は: release-please はモノレポでのパッケージ判定をコミットの scope/path から推論する設定が煩雑で、規約違反の 1 コミットが静かにリリース内容を狂わせる; 手動は 3 ヶ月の launch ramp で確実に事故る; changesets は per-PR で公開意図を明示でき design-doc 文化と相性が良く事故耐性が高い、というもの。

## 決定

1. **リリース自動化に changesets（`@changesets/cli` + `changesets/action`）を採用する。** `.changeset/config.json` は `access: public`、independent versioning（`fixed` / `linked` なし）、`ignore` に `karasu` 以外の全パッケージ（`@karasu-tools/app` / `core` / `lsp` / `e2e` / `vscode-e2e`、`karasu-vscode`）を列挙 — 実質 `karasu`（CLI）のみが公開対象。root `package.json` に `changeset` / `version-packages`（`changeset version && pnpm install --lockfile-only`）/ `release`（`pnpm build && changeset publish`）スクリプトを置く。

2. **当面 npm に公開するのは `karasu`（CLI）のみとし、`@karasu-tools/core` は esbuild で CLI バンドルに内包する。** `packages/cli` の `build` を `tsc` → `esbuild src/index.ts --bundle --platform=node --format=esm --target=node20 --alias:@karasu-tools/core=../core/src/index.ts --external:commander --external:chokidar --external:yaml` に変更（core は npm 依存ゼロの純粋 TS なのでソースから安全にバンドルできる; CJS の `commander` 等は ESM 出力での `require` エラーを避けるため external のまま）。`@karasu-tools/core` は CLI の `dependencies` → `devDependencies`（build 時のみ必要）へ移す。`packages/cli/package.json` に `publishConfig: { access: "public", provenance: true }` / `repository` / `homepage` / `files: ["dist"]` / `engines: { node: ">=20" }` と package 用の `README.md` / `LICENSE` を追加。`version` は `0.0.0`（pre-release プレースホルダ）のままにし、初回 changeset を `minor` にすることで最初の公開版を `0.1.0` にする。

3. **`@karasu-tools/core`（および必要なら `@karasu-tools/lsp`）を「v0.x の TS API」として独立公開する作業は別 Issue（#1302 ぶら下げ）に切り出す。** `exports` エントリの整理・公開 API surface のレビュー・後方互換ポリシー策定が必要で、リリース配線とは独立したスコープ。`karasu-vscode` の version 管理と Marketplace publish は #1316 に委ねる。

4. **`.github/workflows/release.yml`**: `push` to `main`（+ `workflow_dispatch`）で `changesets/action` を実行 — 未消化の changeset があれば「Version Packages」PR を作成・更新し、その PR がマージされると `pnpm release` で npm に公開する。`permissions` は `contents: write` / `pull-requests: write` / `id-token: write`。publish には npm provenance（`NPM_CONFIG_PROVENANCE=true`）を付ける。リポジトリ `.npmrc` は `@kompiro` スコープを GitHub Packages（`@kompiro/adr-tools` 取得用、`NODE_AUTH_TOKEN`）に向けているため、`~/.npmrc` に npmjs.org の `_authToken`（`${NPM_AUTH_TOKEN}` ← `secrets.NPM_TOKEN`）を別途追記する。

5. **changeset-bot（GitHub App）と npm Trusted Publishing（OIDC）は今回スコープ外。** changeset-bot はリポジトリ public 化（#1302 Phase 1）後に有効化、OIDC は初回トークン publish 後に移行（`release.yml` には `id-token: write` と provenance を最初から付けてある）。`karasu` の unscoped 名と `@karasu-tools` org の npm 上での確保、および `NPM_TOKEN` secret の設定は launch 前チェック項目で、それまで publish job は失敗する想定。リリース手順は `docs/process.md` の「リリース運用」節に記載する。

## 理由

- **散文ではなく明示的な changeset から CHANGELOG を組む方が事故に強い**。release-please はコミット規約に違反した 1 コミットでリリース内容が狂うが、changesets は PR 単位で公開意図を明示するため「内部リファクタは changeset なし」を自然に表現でき、CHANGELOG 文も利用者向けに書ける。pnpm workspaces のモノレポと independent versioning にネイティブ対応し、`workspace:*` 依存も publish 時に実バージョンへ置換される（本件では core をバンドルするため該当しないが、将来 core を公開する際に効く）。
- **公開対象を CLI に絞ったのは、`@karasu-tools/core` を公開パッケージとして整える作業が `app` / `lsp` の `exports` / typecheck-build 順序にまで波及する非自明な別タスクだから**。ユーザーが触る成果物は CLI なので、まず `npx karasu` が動けば OSS launch のミニマムを満たせる。core を「v0.x の TS API」として出す話（#1302）はこれと独立に進められる。
- **core を CLI に esbuild バンドルしたのは、`lsp` が `vscode` 拡張に LSP server をバンドルしている先例（ADR-20260330-05）と整合し、core が npm 依存ゼロの純粋 TS でバンドルが安全だから**。`tsc` はバンドラではないので `dist/index.js` に `import "@karasu-tools/core"` が残り、core を公開しない限り壊れる。型チェックは引き続き `tsc --noEmit`（cli の `typecheck` スクリプト）が担う。
- **`package.json` の `version` を `0.0.0` のままにしたのは changesets の標準パターンに従うため**。pre-release プレースホルダ `0.0.0` + 初回 `minor` changeset → 最初の公開版が `0.1.0` になり、手動 pre-bump と changeset の `minor` が二重に効く事故を避けられる。
- **provenance / OIDC permission を最初から入れたのは後からの移行を容易にするため**。npm Trusted Publishing は npm 側でパッケージ作成後に設定するため初回はトークンが要るが、`release.yml` に `id-token: write` と provenance を仕込んでおけば OIDC 移行時の差分が小さい。

## 却下した案

### release-please

Conventional Commits からリリースを組む。per-PR の追加作業はゼロだが、モノレポで「どのパッケージを上げるか」をコミットの scope / path から推論する設定（`release-please-config.json` の `packages` マッピング）が煩雑で、CHANGELOG 文がコミット subject に固定されリリースノート向けに書き直しにくい。`workspace:*` のバージョン置換も別途対応が必要。何より、コミット規約に違反した 1 コミットが静かにリリース内容を狂わせる。

### 手動 + CHANGELOG.md

`pnpm version` + 手書き CHANGELOG + 手動 `pnpm publish`。ツール追加ゼロだが、3 ヶ月の launch ramp でタグ・CHANGELOG・publish の整合を人手で保つのは非現実的。

### `@karasu-tools/core` / `lsp` も同時に公開する

#1302 の hybrid versioning は core の TS API を v0.x で出す前提と読めるが、core の `package.json` の `exports` を `dist` に向け、`pnpm typecheck` を `pnpm build` 依存にし、`app` / `lsp` の設定も追従させる作業は本件のスコープを大きく広げる。CLI を先に出し、core の公開は別 Issue に分離した。
