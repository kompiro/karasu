# AT: CI installs `@kompiro/*` from public npm without GitHub Packages auth

- **日付**: 2026-06-23
- **関連 Issue**: [#1700](https://github.com/kompiro/karasu/issues/1700)
- **対象ファイル**:
  - `.npmrc`（削除）
  - `package.json`（`@kompiro/adr-tools` / `@kompiro/tpl-tools` を `^0.0.6` に bump）
  - `.github/workflows/*.yml`（`NODE_AUTH_TOKEN` env と `packages: read` 権限を除去）
- **関連 Issue（前提）**: kompiro/adr-tools#10, kompiro/tpl-tools#11（両ツールの public npm 公開）

## 受け入れ条件

- [x] `pnpm-lock.yaml` が `@kompiro/adr-tools` / `@kompiro/tpl-tools` を npmjs（`registry.npmjs.org`）から解決し、`npm.pkg.github.com` への参照を 1 件も含まない
  > ✅ Automated — 本 PR の CI（各 workflow の `pnpm install --frozen-lockfile` が `.npmrc` の `@kompiro` GitHub Packages マッピングなし・`NODE_AUTH_TOKEN` なしで成功することで担保）

- [x] `pnpm adr:validate` / `pnpm adr:check-assumptions` / `pnpm tpl:validate` が bump 後の `@kompiro/*@0.0.6` で通る
  > ✅ Automated — CI の `Validate`（adr-validate / tpl-validate）ジョブ

- [ ] fork（外部コントリビューター）からの PR でも CI が secret なしで `pnpm install` を完了し、ジョブが通る
  > 🧑 Manual — fork から PR を 1 件開き、`Check` / `Validate` 等が GitHub Packages 認証なしで green になることを確認する（private 時は fork の `GITHUB_TOKEN` が maintainer の GitHub Packages を読めず install が失敗していた）。

## 補足

- `secrets.GITHUB_TOKEN` 自体は廃止されない（`actions/checkout` や `gh` が使う ambient token）。本変更で外したのは「npm install 認証としての `NODE_AUTH_TOKEN` 用途」と、そのための `packages: read` 権限のみ。
- public npm 上の `@kompiro/*` は `0.0.5` から（GitHub Packages の `0.0.1`–`0.0.4` は npmjs には存在しない）。
