# AT-3017: npm パッケージから入れた `karasu serve` がプレビューを表示する

- **日付**: 2026-10-12
- **関連 Issue**: [#3017](https://github.com/kompiro/karasu/issues/3017)
- **対象ファイル**:
  - `packages/app/vite.serve.config.ts`（serve 用 build。minify あり、sourcemap なし、Pages 専用の public ファイルなし）
  - `packages/cli/scripts/stage-app.ts`（serve build を `dist/app/` に stage）
  - `packages/cli/package.json`（`files` に `dist/app/`、`prepack` が `build:app` を実行）
  - `packages/cli/src/serve.ts`（`findAppDistDir` / `missingAppMessage`）
  - `scripts/ci/generate-third-party-notices.ts`（`--out` と upstream の `ThirdPartyNotices` の取り込み）
- **関連 ADR**: [ADR-9013](../adr/9013-cli-serve-mode.md), [ADR-1681](../adr/1681-cli-pack-only-bundle.md), [ADR-1320](../adr/1320-license-compliance-automation.md)
- **関連 TPL**: [TPL-1024](../test-perspectives/TPL-1024-dev-vs-packaged-mode-parity.md), [TPL-1681](../test-perspectives/TPL-1681-publishable-tarball-completeness.md)

## 受け入れ条件

- [x] tarball にバンドル・プレビュー app・2 つの notices（CLI と app）が入る
  > ✅ Automated — `packages/cli/pack/serve-from-tarball.test.ts` › `ships the bundle, the preview app and both notices`

- [x] tarball に sourcemap と Pages 専用ファイル（`fonts/`、`_redirects`、`_routes.json`、OGP 画像）が入らない
  > ✅ Automated — `packages/cli/pack/serve-from-tarball.test.ts` › `ships no sourcemaps and none of the files that serve Pages only`

- [x] tarball から起動した `karasu serve` が `/` で app を返し、ページが参照する script / stylesheet もすべて返す
  > ✅ Automated — `packages/cli/pack/serve-from-tarball.test.ts` › `serves the preview app at /` / `serves every script and stylesheet the page references`

- [x] tarball から起動した `karasu serve` が `/api/files` でプロジェクトの `.krs` を返す
  > ✅ Automated — `packages/cli/pack/serve-from-tarball.test.ts` › `lists the project's .krs files`

- [x] app が見つからないとき、npm 利用者には入れ直しを、monorepo では build コマンドを案内する（monorepo のコマンドを npm 利用者に見せない）
  > ✅ Automated — `packages/cli/src/serve.test.ts` › `missingAppMessage` › `tells an npm user to reinstall, not to run a monorepo command (#3017)` / `tells a monorepo contributor which build to run`

- [x] install 先で `../../app` に無関係なパッケージがあっても、それを app として配信しない
  > ✅ Automated — `packages/cli/src/serve.test.ts` › `findAppDistDir` › `does not serve an unrelated package that happens to sit at ../../app`

- [ ] npm で入れた `karasu serve` をブラウザで開くと図が描かれ、`.krs` を保存すると表示が更新される
  > 🔧 Manual — 下の手順。ブラウザ上で SPA が serve モードで起動するか（Monaco が出ない、図が描かれる、タブやボタンのアイコンが欠けない）と、SSE による更新は HTTP の応答からは見えない

## 手動確認の手順

```sh
cd packages/cli && pnpm pack --pack-destination /tmp/karasu-pack
mkdir -p /tmp/karasu-demo && cd /tmp/karasu-demo
npm i -g /tmp/karasu-pack/karasu-*.tgz
echo 'system A { service B {} }' > index.krs
karasu serve . -p 4410
```

1. `http://localhost:4410` を開き、エディタなしで `A` の中に `B` が描かれることを確かめる
2. `index.krs` に `service C {}` を足して保存し、リロードなしで `C` が現れることを確かめる
3. 終わったら `npm rm -g karasu` で片付ける
