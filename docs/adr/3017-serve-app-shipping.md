---
id: ADR-3017
title: "`karasu serve` のプレビュー app を serve 専用 build として npm パッケージに同梱する"
status: accepted
date: 2026-10-12
topic: build
refines: [ADR-9013]
related_to: [ADR-1681, ADR-1320, ADR-2993]
scope:
  packages:
    - app
    - cli
  concerns:
    - ci
assumptions:
  - "file: packages/app/vite.serve.config.ts"
  - "symbol: packages/app/vite.serve.config.ts :: SERVE_PUBLIC_FILES"
  - "symbol: packages/cli/scripts/stage-app.ts :: stageApp"
  - "symbol: packages/cli/src/serve.ts :: findAppDistDir"
  - "symbol: packages/cli/src/serve.ts :: missingAppMessage"
  - "grep: packages/cli/package.json :: \"dist/app/\""
  - "grep: packages/cli/package.json :: \"prepack\": \"pnpm run build && pnpm run build:app\""
  - "file: packages/cli/pack/serve-from-tarball.test.ts"
  - "grep: .github/workflows/ci.yml :: run: pnpm --filter ./packages/cli run test:pack"
  - "symbol: scripts/ci/generate-third-party-notices.ts :: readUpstreamNoticesFile"
---

# ADR-3017: `karasu serve` のプレビュー app を serve 専用 build として npm パッケージに同梱する

- **日付**: 2026-10-12
- **ステータス**: 決定済み
- **関連**:
  - Issue #3017（起点）、設計 PR #3128（本 ADR に集約し削除: `docs/design/serve-app-shipping.md`）、実装 PR #3139
  - [ADR-9013](9013-cli-serve-mode.md)（`karasu serve`。「build 済み app を CLI に同梱する」と決め、同梱方法を残課題にしていた。本 ADR はその残課題に答える）
  - [ADR-1681](1681-cli-pack-only-bundle.md)（CLI の `files` を成果物そのものに固定。本 ADR で `dist/app/` を足す）
  - [ADR-1320](1320-license-compliance-automation.md)（`THIRD_PARTY_NOTICES.md` の自動生成。同梱した app の依存にも広げる）
  - [ADR-2993](2993-gallery-client-side-rendering.md)（app の別 build を別の配布先に載せた前例: gallery viewer）
  - TPL: [TPL-1024](../test-perspectives/TPL-1024-dev-vs-packaged-mode-parity.md)（dev と packaged のパス解決）、[TPL-1681](../test-perspectives/TPL-1681-publishable-tarball-completeness.md)（tarball の中身の完全性と除外）。どちらも `discovered_from` に #3017 を追記した
  - AT: `docs/acceptance/3017-serve-from-npm-package.md`
  - 後続: #3137（CLI の notices に core 経由でバンドルされる `smol-toml` が載っていない）、#3138（serve build から Monaco を外して小さくする）

## 背景

npm から入れた `karasu serve` は動かなかった。`/` へのリクエストはすべて
`App not built. Run: npm run build --workspace=packages/app` を返し、README のオンボーディング手順
`npx --yes karasu@latest serve .` は monorepo の外にいる全員で失敗していた。

原因は 2 つ重なっていた。

1. `serve` が app の build を **CLI バンドルからの相対パス** `../../app/dist` で探していた。monorepo では
   `packages/app/dist` を指すが、install 後は `node_modules/app/dist` を指し、存在しない。
2. tarball に app の build が入っていなかった。ADR-9013 は同梱を決めたが方法を残課題にしたまま実装されず、
   その後 ADR-1681 が `files` を `dist/index.js` 単体に固定した。

エラーメッセージも monorepo のコマンドを案内しており、npm 利用者には実行できなかった。
テストが見逃したのは、`serve.e2e.test.ts` が workspace の `src/` から `serve()` を呼ぶので
`../../app/dist` が常に解決できたからである（TPL-1024 の失敗モード）。

Pages 用の app build（`vite.config.ts`）は `minify: false` / `sourcemap: true` で 84MB あり、
`public/` には Pages の routing（`_redirects` / `_routes.json`）、OGP 画像、root の `functions/render.ts` が
PNG 描画に使うフォント（8MB）が入っている。どれもローカルの `serve` では使わない。

## 決定

serve 専用の app build を作り、CLI の `prepack` で `dist/app/` に stage して npm パッケージに同梱する。

1. **serve build**: `packages/app/vite.serve.config.ts`（`build:serve`）。Pages 用設定を `mergeConfig` で
   継承し、`dist-serve/` に minify あり・sourcemap なし・`publicDir: false` で出す。`public/` からは
   `index.html` が参照するファイル（`SERVE_PUBLIC_FILES`、現時点では `favicon.svg`）だけを明示的に出力する。
2. **stage**: `packages/cli/scripts/stage-app.ts`（`build:app`）が `dist/app/` を消してから serve build を
   コピーし、app の prod 依存の notices を `dist/app/THIRD_PARTY_NOTICES.md` に書く。
   `prepack` は `pnpm run build && pnpm run build:app`。`build`（バンドルのみ）は速いまま保つ。
   script は `prebuild` と同じく `tsx` で走らせる（package が宣言する Node 22.12 は型の除去も
   `import.meta.main` も持たない）。
3. **`files`**: `["dist/index.js", "dist/app/", "THIRD_PARTY_NOTICES.md"]`。ADR-1681 の「ディレクトリ glob で
   `dist/` を丸ごと信用しない」は保つ。`dist/app/` は pack のたびに空にして詰め直すので、tarball は
   決定論的なままである。
4. **パス解決**: `findAppDistDir` がバンドルと同じ階層の `app/` を先に、monorepo の `packages/app/dist` を
   次に探す。後者は `../../app/package.json` の `name` が `@karasu-tools/app` のときだけ採り、install 先で
   無関係な `node_modules/app` を配信しない。どちらも無ければ、起動時に stderr へ、リクエストには 503 の
   本文で、探した場所と利用者が実行できること（npm 利用者には入れ直し、monorepo では
   `pnpm --filter @karasu-tools/app run build`）を返す（`missingAppMessage`）。
5. **notices**: 生成器に `--out` を足し、依存自身の `ThirdPartyNotices` ファイル（`monaco-editor` の
   `ThirdPartyNotices.txt`）を LICENSE の後ろに載せる（`readUpstreamNoticesFile`）。
6. **tarball から起動するテスト**: `packages/cli/pack/serve-from-tarball.test.ts`（`test:pack`、専用の
   vitest 設定）。実際の `prepack` を通した tarball を展開し、workspace の `node_modules` を symlink して
   （ネットワークなしで）`serve` を起動する。`/` とページが参照する asset、`/api/files` が返ること、
   tarball に app と 2 つの notices があり、sourcemap と Pages 専用ファイルが無いことを確かめる。
   vite build を含むので通常の `test` には入れず、`ci.yml` の build の後に専用 step（`timeout-minutes: 10`）
   として走らせる。

## 理由

- 配布物の中身を serve 用の build 設定が決めるので、TPL-1681 の決定論性と sourcemap の除外を Pages 側の
  都合と切り離して守れる。Pages 用 build をコピーする形だと、Pages の設定変更で配布物が変わる。
- 実測（2026-10-12）で tarball は 4.1MB（105 ファイル）、`dist/app/` は展開 16MB。それまでの
  tarball（5 ファイル、展開 1.1MB）からは増えるが、Pages 用 build をそのまま入れる場合
  （sourcemap を除いても 36MB）の半分以下に収まる。
- 別 config とそれを守るテストという形は gallery viewer（`vite.viewer.config.ts`、ADR-2993）と同じで、
  repo に前例がある。
- 不具合を見逃したのは workspace からしか `serve` を動かしていなかったからで、tarball から起動する
  テストだけがそれを検出できる（TPL-1024 の「packaged mode のスモーク」）。`dist/app/` を `files` から
  外すとこのテストが落ちることを確認した。

## 却下した案

### Pages 用 build（`packages/app/dist`）をそのまま同梱する

Issue の提案に最も近く、新しい build 設定が要らない。しかし 84MB あり、sourcemap を除いても 36MB で、
ローカルの `serve` で使わない Pages 専用ファイルが入る。TPL-1681 の除外をコピー側のフィルタで守ることになり、
Pages 側の設定変更で配布物が変わる。

### app を別の npm パッケージにして CLI の依存にする

`render` だけを使う利用者にも依存として入るので install サイズは変わらない。公開パッケージが 1 つ増え、
Trusted Publisher の設定・release tag・CLI と app の `/api/*` 契約を保つためのバージョンの lockstep が要る。
得るものが無い。

### CLI は API だけを提供し、ページは hosted app（Pages）から読む

https のページから http://localhost を叩くので CORS と Private Network Access の preflight が要り、
ブラウザごとに挙動が違う。オフラインで使えず、hosted app と install 済み CLI のバージョンがずれ、
ローカルの `.krs` を扱うツールが外部オリジンのページに依存する。

## 影響

- `karasu serve` が npm 版で初めて動く。install サイズは上記のとおり増える。`render` ほか他のコマンドの挙動は
  変わらない。
- Pages の app（`vite.config.ts` と `packages/app/dist`）は変わらない。
- publish 時の `prepack` に vite build が 1 回増える（serve build は手元で約 6 秒）。
- 手元で一度 pack すると `packages/cli/dist/app/` が残り、monorepo で `dist/index.js` を直接起動しても
  `packages/app/dist` ではなくそちらが配信される（packaged を先に探すため）。
- 決めずに残したこと:
  - serve モードは Monaco を表示しないが、同じバンドルを使うので Monaco の worker（`ts.worker` だけで 7.8MB）が
    入る。serve 専用 entry にすると減るが、serve / standalone の判定を実行時から build 時へ移す必要がある（#3138）。
  - CLI のバンドルには core の prod 依存 `smol-toml` が入っているが、CLI の notices は CLI 自身の prod 依存しか
    数えないので載っていない。本件以前からの漏れ（#3137）。
