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
- `karasu`（CLI）は `@karasu-tools/core` に依存するため、CLI を publish するなら **core も publish する**か、core を CLI バンドルに取り込む必要がある。#1302 の hybrid versioning は「core の TS API は v0.x」と述べており、core を公開パッケージとして出す前提と読める。→ 本デザインでは **core / lsp / cli を公開パッケージにする**方針を採る（`private: true` を外す）。
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
   - `"ignore": ["@karasu-tools/app", "@karasu-tools/e2e", "@karasu-tools/vscode-e2e"]`（非 publish パッケージ）
   - `"linked": []` / fixed なし — **independent versioning**（core 0.x と cli を別々に上げられる）
   - `karasu-vscode` の扱い: **`ignore` に入れる**。Marketplace への publish もバージョン管理も #1316 に委ねる。
3. **公開対象パッケージの `private: true` を外す**: `@karasu-tools/core`, `@karasu-tools/lsp`, `karasu`（cli は既に非 private）。各 `package.json` に `publishConfig: { "access": "public" }`、`repository` / `homepage` / `files` フィールドを整える。`@karasu-tools/lsp` は現 0.1.0 のまま、`@karasu-tools/core` は **手動で 0.1.0 に揃えて**から changesets に渡す。公開名は repo のまま（CLI = `karasu`、ライブラリ = `@karasu-tools/core` / `@karasu-tools/lsp`）。
4. **scripts**（root `package.json`）:
   - `"changeset": "changeset"`
   - `"version-packages": "changeset version && pnpm install --lockfile-only"`
   - `"release": "pnpm build && changeset publish"`
5. **GitHub Actions** `.github/workflows/release.yml`:
   - trigger: `push` to `main`
   - job: checkout → setup pnpm/node → `pnpm install --frozen-lockfile` → `changesets/action@v1` with `version: pnpm version-packages`, `publish: pnpm release`
   - secrets: `NPM_TOKEN`（npm の automation token）。npm provenance（`--provenance`）を使うため `id-token: write` permission を付与し `NPM_CONFIG_PROVENANCE=true`。
   - `changesets/action` が `GITHUB_TOKEN` で Version PR を作る → `permissions: contents: write, pull-requests: write`。
6. **changeset bot**（`github.com/apps/changeset-bot`）と npm **Trusted Publishing（OIDC）** は今回スコープ外。bot はリポジトリ public 化（#1302 Phase 1）後に有効化、OIDC は初回トークン publish 後に移行。`release.yml` は当面 `NPM_TOKEN` シークレット運用（ただし `id-token: write` と `NPM_CONFIG_PROVENANCE=true` は最初から付けておき、後で OIDC へ切替えやすくする）。`docs/process.md` にこのフォローアップを明記する。
7. **ドキュメント**: `docs/process.md` に「リリースフロー」節を追加（changeset の書き方、Version PR、publish の流れ）。CONTRIBUTING.md への要約リンクは #1312 で行う。
8. **スモークテスト**: 些細な patch changeset（例: cli の README 追記）を1つ入れて Version PR → マージ → publish job が通ることを確認。**実 publish には npm 上の名前確保（`karasu` / `@karasu-tools` org）が必要**なため、名前確保前は `npm publish --dry-run` 相当で workflow のロジックだけ検証し、実 publish は名前確保後に回す。Issue にチェック項目として残す。

### 今回の Issue (#1315) の DoD と、別 Issue に切り出すもの

- #1315 でやる: changesets 導入・設定・`release.yml`・`docs/process.md` 更新・dry-run スモークテスト・公開対象パッケージの `private` 解除と manifest 整備。
- #1316 に委ねる: `karasu-vscode` の Marketplace publish workflow。
- #1320（license-compliance automation）と独立。
- npm の名前確保（`karasu` の unscoped + `@karasu-tools` org）と実 publish の最終実行は、名前が取れ次第。Issue にチェック項目として残す。

## 決定事項（壁打ちの結論）

1. **リリースツール**: changesets を採用（release-please / 手動は却下）。independent versioning、`access: public`。
2. **公開パッケージ名**: repo の名前を正とする — CLI = `karasu`（unscoped）、ライブラリ = `@karasu-tools/core` / `@karasu-tools/lsp`。npm 上での名前/org 確保は launch 前チェック項目。`@karasu-tools/app` / `e2e` / `vscode-e2e` は非公開のまま `ignore`。
3. **`@karasu-tools/core` の初期バージョン**: 手動で `0.1.0` に揃えてから changesets 管理下に置く（lsp と一致させる）。
4. **`karasu-vscode`**: changesets の `ignore` に入れる。バージョン管理・Marketplace publish はすべて #1316 で扱う。
5. **changeset bot / npm OIDC**: 今回スコープ外。bot は repo public 化後、OIDC は初回トークン publish 後に移行。`release.yml` は最初から `id-token: write` + provenance を付けておく。

→ 実装完了後、本デザインドキュメントは ADR へ昇格させる（`docs/adr/`）。
