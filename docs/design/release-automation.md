# Release automation for the OSS launch

- **日付**: 2026-05-12
- **Issue**: #1315（親: #1302 OSS launch Phase 2）
- **ステータス**: 完了（実装着手可）
- **関連**: #1302（OSS launch brainstorm — hybrid versioning の決定を含む）, #1306（Apache-2.0 ライセンス）, #1311（英語 README）, #1312（CONTRIBUTING.md）, #1314（`.krs` / `.krs.style` v1.0 spec freeze ADR）, #1316（VS Code Marketplace publish）

## 背景・課題

OSS 公開（#1302）に向けて、リリースを「再現可能・低労力」なプロセスにしたい。現状を整理すると:

- **何も publish されていない**: npm レジストリにもタグ（`git tag`）にも何もない。`.github/workflows/` に publish workflow は存在しない。#1302 の表に「Already published as `@kompiro/karasu-tools`」とあるが、実際のリポジトリ上の CLI パッケージ名は `karasu`（`packages/cli/package.json`）であり、publish 実績は確認できない。→ **公開名は repo の名前を正とする**（下記「現時点の方針」）。
- **パッケージ構成**:
  - `karasu`（`packages/cli`） — ユーザー向け CLI。`bin: karasu`。`@karasu-tools/core` に `workspace:*` 依存。`private` 指定なし。
  - `@karasu-tools/core` — パーサー / スタイル解決 / SVG レンダラー。現状 `private: true`、`version: 0.0.0`。
  - `@karasu-tools/lsp` — LSP 実装。`private: true`、`version: 0.1.0`。
  - `karasu-vscode`（`packages/vscode`） — VS Code 拡張。`private: true`、`version: 0.1.0`。Marketplace へは `vsce`/`ovsx` で publish（#1316）。
  - `@karasu-tools/app` / `@karasu-tools/e2e` / `@karasu-tools/vscode-e2e` — 非 publish（アプリ本体・テストハーネス）。
- **`.npmrc`**: `@kompiro:registry=https://npm.pkg.github.com` — これは devDependency `@kompiro/adr-tools` を GitHub Packages から**取得**するための設定であり、karasu 自身の publish 先ではない。
- **バージョニング方針（#1302 で決定済み）**: `.krs` / `.krs.style` 言語仕様は launch 時 v1.0（安定）。`packages/core` の TS API は v0.x のまま（安定保証なし）。→ 言語仕様のバージョンは「パッケージのバージョン」とは別軸。`packages/core` を publish するなら 0.x で出す。
- **コミット規約**: CLAUDE.md で Conventional Commits（subject 英語）を既に実践している。

## 制約・前提

- pnpm workspaces モノレポ（`pnpm@10.33.0`）。
- CI は GitHub Actions。fork でも基本ビルド/テストが通る必要がある（#1302 §2）。
- `karasu`（CLI）は `@karasu-tools/core` に `workspace:*` 依存しているため、CLI を publish するなら **core も publish する**か、core を CLI バンドルに取り込む必要がある。`@karasu-tools/core` の `package.json` は `main` / `exports.types` / `exports.default` が `./src/index.ts`（workspace 内部の慣習 — `app` などは Vite/tsx で TS ソースを直接解決する）を指しており、これを公開パッケージとして整える（`exports` を `dist` に向ける・`pnpm typecheck` を `pnpm build` 依存にする等）のは `app` / `lsp` の設定にも波及する非自明な作業。→ 本デザインでは **公開するのは `karasu`（CLI）のみとし、`@karasu-tools/core` は esbuild で CLI バンドルに内包する**（`lsp` が既に採用しているパターンに合わせる）。`@karasu-tools/core` を「v0.x の TS API」として独立公開する話（#1302）は別 Issue に切り出す。
- 「Best-effort, no SLA」（#1302）— リリース頻度は不定。重い専任プロセスは不要。
- メンテナは実質 1 人。per-PR の changelog 記入を contributor に強制しすぎると外部 PR の摩擦になるが、karasu は当面メンテナ主導なので許容範囲。

## 検討した選択肢

### 案1: changesets（採用）

`@changesets/cli` + `changesets/action`。

- 各 PR で `pnpm changeset` を実行し、`.changeset/*.md` に「どのパッケージを major/minor/patch で上げるか + changelog 文」を明示的に追加。
- `changesets/action` が `main` 上の溜まった changeset を集計して「Version Packages」PR を自動生成（バージョン bump + CHANGELOG.md 更新）。その PR をマージすると publish job が走る。
- モノレポでパッケージごとに独立バージョン（independent versioning）を扱える。`workspace:*` 依存も publish 時に実バージョンへ置換される（pnpm 対応）。
- **メリット**: 公開意図が PR 単位で明示的。design-doc 文化と相性が良い。「内部リファクタは changeset なし」を自然に表現できる。`.krs` spec の安定性と TS API の不安定性を別バージョンで扱える。
- **デメリット**: contributor が changeset ファイルを書く必要がある（`changeset bot` で PR にリマインドできる）。設定ファイルが増える。

### 案2: release-please

Google の Conventional Commits パーサ。`release-please-action` が `main` のコミットを解析して Release PR を生成。

- **メリット**: per-PR の追加作業ゼロ（コミットメッセージから自動）。karasu は既に Conventional Commits を実践。
- **デメリット**: モノレポの「どのパッケージを上げるか」をコミットの scope / path から推論する設定が煩雑（`release-please-config.json` の `packages` マッピング）。changelog 文がコミット subject に固定され、リリースノート向けに書き直しにくい。`workspace:*` のバージョン置換は別途必要。コミット規約に違反した1コミットが静かにリリース内容を狂わせる。

### 案3: 手動 + CHANGELOG.md

`pnpm version` + 手書き CHANGELOG + 手動 `pnpm publish`。

- **メリット**: ツール追加ゼロ。
- **デメリット**: 3 ヶ月の launch ramp で確実に事故る。タグ・CHANGELOG・publish の整合を人手で保つのは非現実的。却下。

## 比較

| 観点 | changesets | release-please | 手動 |
|---|---|---|---|
| per-PR 労力 | 中（changeset 記入） | 低（コミットのみ） | 低 |
| モノレポ独立バージョン | ◎ ネイティブ | △ 設定で対応 | △ |
| `workspace:*` 解決 | ◎ | 要追加対応 | 手動 |
| changelog 文の質 | ◎ 自由記述 | △ コミット subject | ○ 手書き |
| 設計文化との整合 | ◎ 明示的意図 | ○ | — |
| 事故耐性 | ◎ | △（規約違反コミットに弱い） | ✗ |

## 現時点の方針

**changesets を採用する。**

### 構成

1. **依存追加**（root devDependency）: `@changesets/cli`。
2. **`pnpm changeset init`** で `.changeset/config.json` を生成。設定:
   - `"access": "public"`（公開 npm）
   - `"baseBranch": "main"`
   - `"updateInternalDependencies": "patch"`
   - `"ignore": ["@karasu-tools/app", "@karasu-tools/core", "@karasu-tools/lsp", "@karasu-tools/e2e", "@karasu-tools/vscode-e2e", "karasu-vscode"]` — 実質 `karasu`（CLI）のみが公開対象
   - `"linked": []` / fixed なし — **independent versioning**
3. **`karasu`（CLI）を publish 可能にする**:
   - `packages/cli` の `build` を `tsc` → **esbuild バンドル**に変更（`@karasu-tools/core` を内包、`commander` / `chokidar` / `yaml` は `--external` で実 deps のまま、出力は単一 ESM `dist/index.js`）。`@karasu-tools/core` は CLI の `dependencies` から `devDependencies` へ移す（バンドル済みなので runtime dep 不要・build time のみ必要）。
   - `packages/cli/package.json` に `publishConfig: { "access": "public", "provenance": true }`、`repository`、`homepage`、`files: ["dist"]`、`engines: { node: ">=20" }` と package 用の `README.md` / `LICENSE` を追加。`version` は `0.0.0` のまま（初回 changeset の `minor` で `0.1.0` になる）。
   - `@karasu-tools/core` / `@karasu-tools/lsp` / `karasu-vscode` は `private: true` のまま手を付けない。
4. **scripts**（root `package.json`）:
   - `"changeset": "changeset"`
   - `"version-packages": "changeset version && pnpm install --lockfile-only"`
   - `"release": "pnpm build && changeset publish"`
5. **GitHub Actions** `.github/workflows/release.yml`:
   - trigger: `push` to `main`（+ `workflow_dispatch`）
   - job: checkout（`fetch-depth: 0`）→ setup pnpm/node → `~/.npmrc` に npmjs.org の auth 行を追記（repo の `.npmrc` は `@kompiro` スコープを GitHub Packages に向けているため、publish 用に npmjs の `_authToken` を別途足す）→ `pnpm install --frozen-lockfile`（`NODE_AUTH_TOKEN`=`GITHUB_TOKEN`、`@kompiro/adr-tools` 取得用）→ `changesets/action@v1` with `version: pnpm version-packages`, `publish: pnpm release`
   - secrets: `NPM_TOKEN`（npm の automation token、`NPM_AUTH_TOKEN` env として渡す）。npm provenance（`--provenance`）のため `permissions: id-token: write` + `NPM_CONFIG_PROVENANCE=true`。
   - `changesets/action` が `GITHUB_TOKEN` で Version PR を作る → `permissions: contents: write, pull-requests: write`。
6. **changeset bot**（`github.com/apps/changeset-bot`）と npm **Trusted Publishing（OIDC）** は今回スコープ外。bot はリポジトリ public 化（#1302 Phase 1）後に有効化、OIDC は初回トークン publish 後に移行。`release.yml` は当面 `NPM_TOKEN` シークレット運用（ただし `id-token: write` と `NPM_CONFIG_PROVENANCE=true` は最初から付けておき、後で OIDC へ切替えやすくする）。`docs/process.md` にこのフォローアップを明記する。
7. **ドキュメント**: `docs/process.md` に「リリースフロー」節を追加（changeset の書き方、Version PR、publish の流れ）。CONTRIBUTING.md への要約リンクは #1312 で行う。
8. **スモークテスト**: 初回 changeset（`karasu` minor）を本 PR に含め、マージ後に Version PR が自動生成されることを確認する。**実 publish には npm 上の名前確保（`karasu` unscoped + `@karasu-tools` org）と `NPM_TOKEN` secret 設定が必要**なため、それ以前は publish job は失敗する想定。Issue にチェック項目として残す。

### 今回の Issue (#1315) の DoD と、別 Issue に切り出すもの

- #1315 でやる: changesets 導入・設定・`release.yml`・`docs/process.md` 更新・`packages/cli` の esbuild バンドル化と manifest 整備・初回 changeset 投入。
- 別 Issue に切り出す: `@karasu-tools/core`（と必要なら `@karasu-tools/lsp`）を「v0.x の TS API」として独立公開する作業（`exports` 整理・API surface レビュー・互換ポリシー）。#1302 にぶら下げる。
- #1316 に委ねる: `karasu-vscode` の Marketplace publish workflow と version 管理。
- #1320（license-compliance automation）と独立。
- npm の名前確保（`karasu` unscoped + `@karasu-tools` org）・`NPM_TOKEN` 設定・初回実 publish は launch 前チェック項目。

## 決定事項（壁打ちの結論）

1. **リリースツール**: changesets を採用（release-please / 手動は却下）。independent versioning、`access: public`。
2. **公開対象（descope）**: 本フローで npm に公開するのは `karasu`（CLI）のみ。`@karasu-tools/core` は esbuild で CLI に内包し、`private: true` のまま据え置く。`@karasu-tools/*` を公開ライブラリにする作業は別 Issue（#1302 ぶら下げ）に切り出す。`@karasu-tools/app` / `core` / `lsp` / `e2e` / `vscode-e2e` と `karasu-vscode` はすべて `.changeset/config.json` の `ignore` に入れる。
3. **`karasu` の初期バージョン**: `packages/cli/package.json` は `0.0.0`（pre-release プレースホルダ）のままにし、初回 changeset を `minor` にすることで最初の公開版を `0.1.0` にする（changesets の標準パターン）。`src/index.ts` の `program.version("0.0.0")` は当面据え置き（将来 package.json から読むよう自動化する余地あり）。`@karasu-tools/lsp` の `0.1.0` には手を付けない。
4. **`karasu-vscode`**: changesets の `ignore` に入れる。バージョン管理・Marketplace publish はすべて #1316 で扱う。
5. **changeset bot / npm OIDC**: 今回スコープ外。bot は repo public 化後、OIDC は初回トークン publish 後に移行。`release.yml` は最初から `id-token: write` + provenance を付けておく。

→ 実装完了後、本デザインドキュメントは ADR へ昇格させる（`docs/adr/`）。
