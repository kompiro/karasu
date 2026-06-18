---
id: ADR-20260618-01
title: "VS Code 拡張を Entra ID + GitHub OIDC（managed identity）で Marketplace に publish する"
status: accepted
date: 2026-06-18
topic: vscode
related_to:
  - ADR-20260512-05
  - ADR-20260330-05
scope:
  packages:
    - vscode
  concerns:
    - ci
    - deployment
    - security
assumptions:
  - "file: .github/workflows/vscode-release.yml"
  - "file: .github/workflows/azure-identity-bootstrap.yml"
  - "file: packages/vscode/.vscodeignore"
  - "file: packages/vscode/LICENSE"
  - "file: packages/vscode/README.md"
  - "grep: packages/vscode/package.json :: karasu-tools"
  - "grep: .github/workflows/vscode-release.yml :: azure-credential"
---

# ADR-20260618-01: VS Code 拡張を Entra ID + GitHub OIDC（managed identity）で Marketplace に publish する

- **日付**: 2026-06-18
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#1316](https://github.com/kompiro/karasu/issues/1316)（OSS launch Phase 2 — publisher `karasu-tools` で Marketplace publish）
  - 親 Issue: [#1302](https://github.com/kompiro/karasu/issues/1302)（OSS 化）, [#1317](https://github.com/kompiro/karasu/issues/1317)（hard launch）
  - 実装 PR: [#1668](https://github.com/kompiro/karasu/pull/1668)（配線）, [#1673](https://github.com/kompiro/karasu/pull/1673)（LICENSE）
  - 設計検討 PR: [#1664](https://github.com/kompiro/karasu/pull/1664)（旧 `docs/design/vscode-marketplace-publish.md` — 本 ADR に集約して削除）
  - フォローアップ: [#1671](https://github.com/kompiro/karasu/issues/1671)（スクリーンショット・検索ヒット確認）, [#1672](https://github.com/kompiro/karasu/issues/1672)（本 ADR 昇格・app registration 廃止）
  - 関連 ADR: [ADR-20260512-05](20260512-05-release-automation-changesets.md)（changesets は `karasu`(CLI) のみ公開、`karasu-vscode` の publish は #1316 に委譲）, [ADR-20260330-05](20260330-05-vscode-extension-lsp-first.md)（LSP server を esbuild バンドルする先例）
  - 関連 TPL: [TPL-20260510-15](../test-perspectives/TPL-20260510-15-dev-vs-packaged-mode-parity.md)（packaged/installed parity）, [TPL-20260520-02](../test-perspectives/TPL-20260520-02-consistency-check-triggers-on-both-sides.md)（guard を両側に張る）
  - コード: `.github/workflows/vscode-release.yml`, `.github/workflows/azure-identity-bootstrap.yml`, `packages/vscode/package.json`, `packages/vscode/.vscodeignore`

## 背景

hard launch（#1317）に向け `packages/vscode` 拡張を VS Code Marketplace に掲載したい。
[ADR-20260512-05](20260512-05-release-automation-changesets.md) は npm 公開を changesets で
`karasu`(CLI) のみに絞り、`karasu-vscode` を `.changeset/config.json` の `ignore` に入れたうえで
version 管理と Marketplace publish を **#1316 に委譲**すると明記していた。本 ADR はその委譲先の決定を記録する。

論点は 2 つ: (A) リポジトリ側の公開準備（README・メタデータ・`.vscodeignore`・LICENSE）と、
(B) `vsce publish` をどう trigger し**どう認証するか**。認証は当初 `VSCE_PAT`（Azure DevOps の
Personal Access Token）を想定していたが、**長期 PAT は 2026-12-01 に廃止**されるため secretless に切り替えた。

## 決定

1. **publisher は `karasu-tools`、拡張 ID は `karasu-tools.karasu-vscode`。** 希望した `karasu` は
   取得済みだったためフォールバック（`@karasu-tools/*` の npm scope とも揃う）。
2. **リリースは専用ワークフロー `.github/workflows/vscode-release.yml` で `workflow_dispatch` 手動トリガ。**
   changesets フロー（CLI 用）には載せない。build → `vsce package` → publish。`version` は
   `packages/vscode/package.json` を正典とし、初回は stable チャネル（`inputs.pre_release` は将来用）。
3. **認証は Microsoft Entra ID + GitHub OIDC（PAT 不使用）。** `azure/login`（federated credential、
   stored secret なし）で Entra token を取得し、`vsce publish --azure-credential`（vsce >= 2.26.1）で publish。
   identity は **user-assigned managed identity**。publish path は `AZURE_CLIENT_ID` repo **variable**
   （secret ではない identifier）の有無で gate し、未設定時は build/package のみ実行して no-op する
   （[ADR-20260512-05](20260512-05-release-automation-changesets.md) の `release.yml` における
   `NPM_TOKEN` guard と同じ思想）。
4. **`.vsix` の中身は `.vscodeignore` で固定。** `out/`（esbuild バンドル）・`icon.png`・`images/`・
   `syntaxes/`・`README.md`・`LICENSE`・`THIRD_PARTY_NOTICES.md` を同梱し、`src/`・`node_modules/`・
   テスト・dev config を除外する。`packages/vscode/src/marketplace-manifest.test.ts` で固定（TPL-20260510-15）。

## 理由

- **secretless が本命**: 長期 PAT は 2026-12-01 廃止。OIDC + federated credential なら repo に保管する
  秘密がゼロで、漏洩・ローテーションの対象が無い。`AZURE_CLIENT_ID` / `AZURE_TENANT_ID` は機密でない
  識別子なので repo variables に置く（ログ露出しても、それ自体では認証できない — トークン発行には
  `repo:kompiro/karasu:ref:refs/heads/main` という subject の GitHub OIDC トークンが必須）。
- **changesets と独立**: npm registry と Marketplace は配布先・認証（`NPM_TOKEN` vs Entra）・成果物
  （tarball vs `.vsix`）が異なる。[ADR-20260512-05](20260512-05-release-automation-changesets.md) の決定を踏襲し別配線にする。
- **手動トリガが安全**: 前提条件（identity・publisher member 化）が人手で整うまで誤発火させない。
  push では走らず、未設定なら no-op するので CI が赤くならない。
- **managed identity を採用**: 当初の app registration（service principal）では Marketplace publisher の
  Members 追加が通らなかった（下記「却下した案」「運用知見」）。Microsoft が Marketplace 向けに
  documented しているのは managed identity 経路であり、federated credential で GitHub OIDC も使える。

## 却下した案

- **`VSCE_PAT`（PAT 認証）**: 2026-12-01 廃止。secretless にできるなら最初から避ける。
- **tag-triggered publish（`vscode-v*`）**: CLI（changesets）と二重の version 体系になり、前提未整備の
  段階では tag 誤切りで失敗する。`workflow_dispatch` から trigger を足すだけで後から移行可能。
- **changesets フローへ統合**: [ADR-20260512-05](20260512-05-release-automation-changesets.md) の決定に反する。配布先・認証・成果物が異なり分岐が増える。
- **app registration（service principal）を publisher member にする**: publisher の Members フィールドが
  client ID / object ID では `TF14045`、resource ID では "not a valid id"、profile 取得では `VSS011031`
  を返し、materialize できずに行き詰まった。user-assigned managed identity に切り替えた。

## 運用知見（non-human identity の materialize）

VS Code Marketplace の publisher **Members** は、identity を **Azure DevOps の "Identity ID"（GUID）**で
識別する。これは client ID でも object ID でも resource ID でもなく、identity が Azure DevOps に **一度
認証して materialize された後**にしか存在しない。non-human identity（SP / managed identity）は
**Azure DevOps 組織にユーザーとして追加するまで profile を持たない**（追加前は `profiles/me` が
`VSS011031: There is no profile for the authenticated user` を返す）。

確立した手順:

1. user-assigned managed identity を作成し、GitHub OIDC の federated credential
   （issuer `https://token.actions.githubusercontent.com`、subject `repo:kompiro/karasu:ref:refs/heads/main`）を付ける。
2. その managed identity を **Azure DevOps 組織**（MI と同一テナント）に Users として追加して materialize する。
3. `.github/workflows/azure-identity-bootstrap.yml` を `main` で `workflow_dispatch` 実行する。MI として
   OIDC ログインし `az rest .../profiles/me --resource 499b84ac-1321-427f-aa17-267ca6975798` を叩いて
   **Identity ID** を出力する（ローカルでは MI を認証できないため Actions 上で行う）。
4. その Identity ID を publisher の Members に Contributor で追加する。
5. `vscode-release.yml` を実行して publish する。

`azure-identity-bootstrap.yml` は再 materialize が必要になったとき（組織から外れた等）に Identity ID を
再取得するための diagnostic として残す。
