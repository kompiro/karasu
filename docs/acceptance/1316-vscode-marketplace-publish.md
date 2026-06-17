# AT: VS Code 拡張の Marketplace 公開準備と `vsce publish` 自動化

- **日付**: 2026-06-16
- **関連 Issue**: [#1316](https://github.com/kompiro/karasu/issues/1316)
- **関連 Design Doc**: `docs/design/vscode-marketplace-publish.md`（実装完了後 ADR 昇格予定）
- **関連 TPL**: [TPL-20260510-15](../test-perspectives/TPL-20260510-15-dev-vs-packaged-mode-parity.md), [TPL-20260520-02](../test-perspectives/TPL-20260520-02-consistency-check-triggers-on-both-sides.md)
- **対象ファイル**: `packages/vscode/package.json`, `packages/vscode/README.md`, `packages/vscode/.vscodeignore`, `.github/workflows/vscode-release.yml`, `README.md`

## 受け入れ条件

### discoverability metadata

- [x] `publisher` が `karasu-tools`（`karasu` は取得済みのためフォールバック）。拡張 ID は `karasu-tools.karasu-vscode`

  > ✅ Automated — `packages/vscode/src/marketplace-manifest.test.ts` › `publishes under publisher \`karasu-tools\` (karasu was taken)`

- [x] `keywords` に Acceptance の検索語（`karasu` / `C4` / `architecture diagram`）を含む

  > ✅ Automated — `packages/vscode/src/marketplace-manifest.test.ts` › `carries discoverability keywords including the Acceptance search terms`

- [x] `categories` に `Programming Languages` と `Visualization` を含む

  > ✅ Automated — `packages/vscode/src/marketplace-manifest.test.ts` › `declares Visualization alongside Programming Languages`

- [x] `repository`（`directory: packages/vscode`）/ `homepage` / `bugs` / `galleryBanner` / `icon` を備える

  > ✅ Automated — `packages/vscode/src/marketplace-manifest.test.ts` › `links repository (with directory), homepage, and bugs` / `sets a gallery banner and ships an icon`

### .vsix の中身（packaged/installed parity — TPL-20260510-15）

- [x] `.vscodeignore` が `src/**` / `**/*.test.*` / `scripts/**` を除外する

  > ✅ Automated — `packages/vscode/src/marketplace-manifest.test.ts` › `excludes source and dev tooling from the .vsix`

- [x] `.vscodeignore` が `out/**` / `README.md` / `icon.png` / `images/**` を除外しない

  > ✅ Automated — `packages/vscode/src/marketplace-manifest.test.ts` › `does not exclude the runtime bundle, README, or assets`

- [x] 実際に `vsce ls` で `.vsix` に `out/extension.js` / `out/server.js` / `README.md` / `icon.png` が入り、`src/` / `node_modules/` / `*.test.ts` が入らない

  > 🟡 Partially automated — 同梱を決める `.vscodeignore` パターンは上記の自動テストで縛る。最終的な `.vsix` の中身は `pnpm --filter karasu-vscode run build` 後の `pnpm exec vsce ls --no-dependencies` で確認した（`out/extension.js` `out/server.js` `README.md` `icon.png` `images/*` `syntaxes/*` を含み、`src/` `node_modules/` `*.test.ts` `tsconfig.json` を含まない）

### publish workflow（guard — TPL-20260520-02）

- [x] `vscode-release.yml` は `workflow_dispatch` のみ（push では走らない）

  > ✅ Automated — `packages/vscode/src/marketplace-manifest.test.ts` › `is manual-only (workflow_dispatch, not push)`

- [x] Entra ID（OIDC + `vsce publish --azure-credential`、PAT 不使用）で認証する

  > ✅ Automated — `packages/vscode/src/marketplace-manifest.test.ts` › `authenticates with Entra ID via OIDC (no PAT) and gates publish on it`

- [x] publish path が `AZURE_CLIENT_ID` variable に gate され、未設定時は build/package のみで no-op する

  > ✅ Automated — `packages/vscode/src/marketplace-manifest.test.ts` › `gates the publish path on the AZURE_CLIENT_ID variable`

- [x] `pre_release` input を持つが default は false（初回は stable チャネル）

  > ✅ Automated — `packages/vscode/src/marketplace-manifest.test.ts` › `supports a pre-release channel input but defaults to stable`

### root README cross-link

- [x] root `README.md` の VS Code extension 節に install コマンド（`code --install-extension karasu-tools.karasu-vscode`）と Marketplace URL、coming-soon 注記がある

  > ✅ Automated — `packages/vscode/src/marketplace-manifest.test.ts` › `links the Marketplace with the install command for the extension id`

### 手動確認（人手の前提条件 / 実 publish）

Entra ID + GitHub OIDC（PAT 不使用 — Azure DevOps PAT は 2026-12-01 廃止）:

- [ ] publisher `karasu-tools` の登録（marketplace.visualstudio.com）— 完了済み
- [ ] Entra ID app registration を作成し、federated credential（issuer `https://token.actions.githubusercontent.com`、subject `repo:kompiro/karasu:ref:refs/heads/main`、audience `api://AzureADTokenExchange`）を追加する
- [ ] その service principal を `karasu-tools` publisher の member（Contributor）として追加する（marketplace.visualstudio.com → Manage Publishers → Members）
- [ ] repo variables（secret ではない）に `AZURE_CLIENT_ID`（app の client id）と `AZURE_TENANT_ID`（tenant id）を設定する
- [ ] `vscode-release.yml` を `workflow_dispatch` で起動し、初回 `0.1.0` が stable チャネルに publish されることを確認する
- [ ] Marketplace 検索で "karasu" / "C4" / "architecture diagram" でヒットすることを確認する（#1316 の Acceptance）
- [ ] スクリーンショット（three-face 構造 + editor/preview ワークフロー）を撮影し README に差し込む
