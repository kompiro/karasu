# AT-3017: npm パッケージから入れた `karasu serve` がプレビューを表示する

- **日付**: 2026-10-12
- **関連 Issue**: [#3017](https://github.com/kompiro/karasu/issues/3017), [#3138](https://github.com/kompiro/karasu/issues/3138)（serve 用 build から Monaco を外す）
- **対象ファイル**:
  - `packages/app/vite.serve.config.ts`（serve 用 build。minify あり、sourcemap なし、Pages 専用の public ファイルなし。entry を `serve-main.tsx` に差し替え、`monaco-editor` が入ったら失敗する）
  - `packages/app/src/serve-main.tsx` / `packages/app/src/mount-app.tsx`（Monaco を読まない serve 用 entry と、両 entry 共通の mount）
  - `packages/app/src/ServeModeApp.tsx`（serve モードの Share。#3138 で外し、#3162 で公開版 app 宛てのリンクとして戻した）
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

- [x] tarball に Monaco の `editor.worker` と codicon フォントが入らない（#3138）

  > ✅ Automated — `packages/cli/pack/serve-from-tarball.test.ts` › `ships no Monaco editor, which serve mode never shows (#3138)`

- [x] serve 用 build が `monaco-editor` の module を 1 つでも含むと build が失敗する（#3138）

  > ✅ Automated — `packages/app/src/serve-build-config.test.ts` › `loads the serve entry, which leaves Monaco out (#3138)` / `fails the build when a monaco-editor module is bundled` / `recognizes monaco-editor modules, and not the @monaco-editor/react wrapper`（`build:serve` は `prepack` で毎回通る）

- [x] モードを固定した app は実行時のモード判定をせず、`#s=` の共有 URL も開かない（#3138）

  > ✅ Automated — `packages/app/src/App.test.tsx` › `App with the mode fixed by the entry (#3138)`

- [x] serve モードのプレビューツールバーの Share は、手元のサーバーではなく公開版 app を指すリンクを作る。#3138 では、共有リンクが手元のサーバーを指し npm の serve build はそれを開けないため Share を外した。#3162 でリンクの宛先を公開版 app にして戻した（詳細は [AT-3162](3162-serve-share-hosted-links.md)）

  > ✅ Automated — `packages/app/src/ServeModeApp.test.tsx` › `ServeModeApp` › `keeps Share and points its links at the public app (#3162)`（Share が出て、公開版の origin を渡す）
  >
  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `PreviewColumn — Share (karasu-nest inline URL)` › `builds both links on the slot's share origin, at its root, and says so`（渡された origin からリンクを作る）

- [ ] npm で入れた `karasu serve` で、コマンドパレット・キーボードショートカット・pop-out reference window が Pages 用 build の serve モードと同じに動く（#3138）

  > 🔧 Manual — 下の手順 3。serve 用 build は別 entry から起動するので、Provider ツリーが同じになっているかはブラウザで見る

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
3. コマンドパレット（Ctrl/Cmd+Shift+P）が開くこと、reference の pop-out ボタンで別ウィンドウに reference が出ることを確かめる。DevTools の Network に `*.worker-*.js` や Monaco の chunk が出ないことも見る
4. 終わったら `npm rm -g karasu` で片付ける
