# `karasu serve` のプレビュー app を npm パッケージに同梱する

- **日付**: 2026-10-12
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3017](https://github.com/kompiro/karasu/issues/3017)
  - 関連 ADR: [ADR-9013](../adr/9013-cli-serve-mode.md)（`karasu serve`。「build 済み app を CLI に同梱する」と決め、同梱方法を残課題にしていた）, [ADR-1681](../adr/1681-cli-pack-only-bundle.md)（CLI の `files` を `dist/index.js` に固定）, [ADR-1320](../adr/1320-license-compliance-automation.md)（`THIRD_PARTY_NOTICES.md` の自動生成）, [ADR-2993](../adr/2993-gallery-client-side-rendering.md)（app の別 build を別の配布先に載せた前例: gallery viewer）
  - 関連 TPL: [TPL-1024](../test-perspectives/TPL-1024-dev-vs-packaged-mode-parity.md)（dev と packaged のパス解決の parity）, [TPL-1681](../test-perspectives/TPL-1681-publishable-tarball-completeness.md)（tarball の中身の完全性と除外）
  - コード: `packages/cli/src/serve.ts`, `packages/cli/package.json`, `packages/cli/src/packaging.test.ts`, `packages/app/vite.config.ts`, `scripts/ci/generate-third-party-notices.ts`

## 背景・課題

npm から入れた `karasu serve` は動かない。`/` へのリクエストはすべて
`App not built. Run: npm run build --workspace=packages/app` を返す。README の
オンボーディング手順 `npx --yes karasu@latest serve .` は、monorepo の外にいる全員で失敗する。

原因は 2 つ重なっている。

1. `getAppDistDir()` が app の build を **CLI バンドルからの相対パス** `../../app/dist` で探す。
   monorepo では `packages/app/dist` を指すが、install 後は `node_modules/app/dist` を指し、存在しない。
2. tarball に app の build が入っていない。ADR-9013 は「build 済み app を CLI に同梱する」と決めたが、
   同梱方法を残課題にしたまま実装されず、その後 ADR-1681 が `files` を `dist/index.js` 単体に固定した。

エラーメッセージも monorepo のコマンドを案内しており、npm 利用者には実行できない。

テストが見逃した理由も構造的で、`serve.e2e.test.ts` は workspace から `serve()` を呼ぶので
`../../app/dist` が解決できてしまう。tarball から起動するテストが無い（TPL-1024 の失敗モードそのもの）。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| CLI の配布物 | `files: ["dist/index.js", "THIRD_PARTY_NOTICES.md"]`。tarball は 5 ファイル、展開 1.1MB |
| app の build | `vite.config.ts` は Pages 用で `minify: false` / `sourcemap: true`。`packages/app/dist` は 84MB（sourcemap 48MB） |
| app の `public/` | `_redirects` / `_routes.json`（Pages の routing）、`karasu-logo-1200w.png`（OGP）、`fonts/`（root の `functions/render.ts` が PNG 描画に使う。8MB）、`favicon.svg` / `logo.svg` |
| serve モード判定 | app は起動時に `/api/files` を叩いて serve / standalone を切り替える（ADR-9013）。serve 専用の entry は無く、Monaco を含む同じバンドルを使う |
| app の別 build の前例 | `vite.viewer.config.ts`（`mergeConfig` で Pages 用設定を継承し、`dist-viewer/` に minify・sourcemap なしで出す。nest が配布）。`src/viewer/build-config.test.ts` が設定を守る |
| notices | CLI の `prebuild` が CLI の prod 依存だけを列挙する。app の依存（React、Monaco、Radix、`@anthropic-ai/sdk` ほか）は入らない。生成器は `LICENSE` / `COPYING` / `NOTICE` だけを拾い、`monaco-editor` の `ThirdPartyNotices.txt` は拾わない |
| release | `pnpm run release` = `pnpm build && changeset publish`。publish ごとに CLI の `prepack`（`pnpm run build`）が走る |

serve 用に minify・sourcemap なしで build し、Pages 専用の `public/` を除いた場合の実測（2026-10-12）:
展開 18MB、gzip 4MB。最大は Monaco の `ts.worker`（7.8MB）と app 本体（5.4MB）。

## 制約・前提

- `karasu render` だけを使う利用者もいる。CLI の install サイズは増えるが、`render` の挙動・起動時間は変えない。
- TPL-1681: tarball の中身は決定論的であること。stale な作業ファイルが混ざっても配布物が変わらない。
- TPL-1024: dev（monorepo）と packaged の両方で動くこと。packaged での失敗は silent にしない。
- ADR-1320: 再配布する第三者コードの LICENSE 全文を同梱する。
- Pages の app（`deploy.yml` / `preview.yml` が `packages/app/dist` を deploy）の build と挙動は変えない。
- out of scope: serve モード用に Monaco を外した軽量 entry を作ること（未解決の問いを参照）。

## 検討した選択肢

### 案1: Pages 用 build（`packages/app/dist`）をそのまま CLI に同梱する

prepack で `packages/app/dist` を `packages/cli/dist/app/` にコピーする。Issue の提案に最も近い。

**メリット**

- 新しい build 設定が要らない。

**デメリット**

- Pages 用 build は minify なし・sourcemap ありで 84MB。sourcemap を除いても 36MB（PNG 描画用フォント 8MB を含む）。
- `_redirects` / `_routes.json` / OGP 画像 / `fonts/` など、ローカル serve で使わない Pages 専用ファイルが入る。
- TPL-1681 の「sourcemap を配布しない」をコピー側のフィルタで守ることになり、Pages 側の設定変更で配布物が変わる。

### 案2: serve 用の別 build を作り、CLI の prepack で `dist/app/` に stage する

`vite.serve.config.ts` を足し（`vite.viewer.config.ts` と同じく `mergeConfig` で継承）、
minify あり・sourcemap なし・Pages 専用 public ファイルなしで `dist-serve/` に出す。
CLI の prepack がそれを build して `packages/cli/dist/app/` に stage し、`files` に `dist/app/` を足す。

**メリット**

- 配布物の中身を serve 用設定が決める。Pages 用設定の変更（sourcemap、public ファイル）に引きずられない。
- 18MB / gzip 4MB に収まる。
- gallery viewer と同じ形（別 config + 設定を守るテスト）で、repo に前例がある。

**デメリット**

- vite の設定が 1 つ増え、app の共有コンポーネント変更で serve build が壊れうる。CI で build する必要がある。
- CLI の prepack が app の build を含むので publish が遅くなる（vite build 1 回分）。

### 案3: app を別の npm パッケージ（例: `@karasu-tools/serve-app`）として publish し、CLI の依存にする

**メリット**

- CLI の tarball 自体は小さいまま。

**デメリット**

- `render` だけの利用者にも依存として入るので install サイズは案2と変わらない。
- 公開パッケージが 1 つ増え、Trusted Publisher の設定・release tag・バージョンの lockstep（CLI と app の API 契約）が要る。
- 得るものが無い。

### 案4: CLI は API だけを提供し、ページは hosted app（Pages）から読む

ブラウザで hosted app を開き、`http://localhost:<port>/api/*` を叩かせる。

**メリット**

- CLI に app を入れなくてよい。

**デメリット**

- https のページから http://localhost を叩くので、CORS と Private Network Access の preflight が要り、ブラウザごとに挙動が違う。
- オフラインで使えない。
- hosted app と install 済み CLI のバージョンがずれ、`/api/*` の契約を後方互換で保ち続ける必要がある。
- ローカルの `.krs` を扱うツールが外部オリジンのページに依存する。

## 比較

| 観点 | 案1 | 案2 | 案3 | 案4 |
| --- | --- | --- | --- | --- |
| install サイズ（展開） | 36MB 以上 | 18MB | 18MB | 1.1MB |
| 配布物を決めるもの | Pages 用設定 + コピーのフィルタ | serve 用設定 | serve 用設定 | なし |
| 公開パッケージ数 | 変わらず | 変わらず | +1 | 変わらず |
| オフライン | 可 | 可 | 可 | 不可 |
| CLI と app のバージョン | 一致 | 一致 | lockstep の運用 | ずれる |

## 現時点の方針

**案2 を採用する**。配布物の中身を serve 用の build 設定が決めるので、TPL-1681 の決定論性と
sourcemap 除外を Pages 側の都合と切り離して守れる。サイズも案1の半分以下で、repo に同じ形の前例
（gallery viewer）がある。案3は運用だけが増え、案4はブラウザ制約とバージョンずれを持ち込む。

ADR-9013 の「同梱する」という決定はそのまま実装し、残課題「同梱方法」に答える。
ADR-1681 の「`files` を成果物そのものに固定する」は、`dist/app/` を足す形で改める
（`dist/app/` は stage 時に毎回消して作り直すので、TPL-1681 の決定論性は保たれる）。

### 実装の指針

<!-- absent-path-next-line: the serve build config this design intends to create (#3017) -->
1. **serve 用 build**: `packages/app/vite.serve.config.ts` を追加し、`build:serve` script を足す。
   `outDir: "dist-serve"`、minify あり、sourcemap なし、`publicDir: false`（viewer と同じ）。
   `publicDir: false` では `index.html` が参照する `favicon.svg` も出なくなるので、serve build が
   `dist-serve/` へ明示的にコピーする（コピーするのは `index.html` が参照するファイルだけ。
   現時点では `favicon.svg` のみ）。`_redirects` / `_routes.json` / `karasu-logo-1200w.png` /
   `fonts/` はコピーしない。`viewer` の `build-config.test.ts` と同じく設定（`publicDir: false`、
   コピー対象の一覧）を守るテストを置き、出力に何が入ったかは手順 6 の `test:pack` が tarball の
   中身で確かめる。`dist-serve/` を `.gitignore` に足す。
2. **stage**: `packages/cli` に `build:app` script を足す。`@karasu-tools/app` の `build:serve` を実行し、
   `packages/cli/dist/app/` を消してから `dist-serve/` をコピーする。
   `prepack` を `pnpm run build && pnpm run build:app` にする。`build`（バンドルのみ）は今のまま速く保つ。
3. **`files`**: `["dist/index.js", "dist/app/", "THIRD_PARTY_NOTICES.md"]`。`packaging.test.ts` を更新し、
   `dist/app/` が入ること、`dist` 全体の glob に戻らないことを assert する。
4. **パス解決**（TPL-1024）: `getAppDistDir()` を候補探索にする。
   - packaged: バンドルと同じ階層の `app/`（`dist/app/index.html` があるとき）
   - dev: `../../app/dist`。ただし `../../app/package.json` の `name` が `@karasu-tools/app` のときだけ採る
     （install 先で偶然 `node_modules/app` があっても拾わない）
   - どちらも無ければ、起動時に stderr へ探した場所を出し、`/` は 503 で同じ内容を返す。
     文言は利用者が実行できることを案内する: npm 利用者には「この install には preview app が
     入っていない、karasu を入れ直す」、monorepo では `pnpm --filter @karasu-tools/app run build`。
5. **notices**（ADR-1320）: stage 時に app の prod 依存の notices を生成し、
   `dist/app/THIRD_PARTY_NOTICES.md` に置く。生成器が upstream の `ThirdPartyNotices.txt`
   （`monaco-editor` が持つ）も拾うようにする。
6. **tarball から起動するテスト**: CLI に `test:pack` script を足す。`pnpm pack` で実際の prepack を
   通した tarball を作り、一時ディレクトリに展開し、`node package/dist/index.js serve <fixture>` を
   起動して次を確かめる。
   - `/` が 200 で app の `index.html` を返し、そこが参照する `/assets/*.js` も 200
   - `/api/files` が fixture を返す
   - tarball に `*.map` / `fonts/` / `_redirects` / `_routes.json` が無い

   依存（`commander` など）は展開先から workspace の `packages/cli/node_modules` を symlink して
   解決し、ネットワークを使わない。vite build を含むので通常の `test` には入れず、`ci.yml` の
   build の後に専用 step として走らせる。
7. **CI**: `ci.yml` で `build:serve` を build する（viewer と同じ理由: 共有コンポーネントの変更で壊れたら
   PR で落とす）。`test:pack` もここで走らせる。
8. **changeset**: `karasu: patch`。
9. AT: `docs/acceptance/3017-serve-from-npm-package.md`。自動化できない項目だけを手動にする:
   - 手動: `pnpm pack` した tarball を空ディレクトリに `npm i -g` し、`karasu serve .` をブラウザで開いて
     図が描かれること、`.krs` を保存すると表示が更新されること
   - 自動（`test:pack`）: tarball の中身、`/` と assets と `/api/files` の応答
10. TPL: TPL-1024 / TPL-1681 の「関連テスト」に `test:pack` を足し、`known_consumers` に CLI serve を加える。
    新規 TPL は起こさない（2 つの既存 TPL が観点を覆っている）。
11. ADR 昇格: 実装完了後、`docs/adr/3017-serve-app-shipping.md` として昇格し、本 Design Doc は同 PR で削除する。
    ADR-9013 の残課題と ADR-1681 の決定から新 ADR を参照する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: `karasu serve` が npm 版で初めて動く。install サイズが 1.1MB から約 19MB（gzip 約 4MB）に増える。
  `render` ほか他のコマンドの挙動は変わらない。
- Pages の app: 変更なし（`vite.config.ts` と `packages/app/dist` は触らない）。
- release: publish 時の prepack に vite build が 1 回増える。
- ドキュメント更新: README の手順はそのままで正しくなる。`packages/cli/README.md` に serve の記述があれば確認する。

## 未解決の問い / 決めないこと

- **serve 専用の軽量 entry**: serve モードは Monaco を表示しないが、同じバンドルを使うので Monaco の
  worker（`ts.worker` だけで 7.8MB）が入る。serve 用 entry から Monaco を外せば大きく減るが、
  `App` の構成を分ける必要がある。本件では決めず、サイズが問題になったら別 Issue にする。
- **core の依存の notices**: CLI バンドルには `@karasu-tools/core` が esbuild で入り、core の prod 依存
  `smol-toml` も一緒にバンドルされる。現在の CLI の notices は CLI 自身の prod 依存だけを数えるので
  `smol-toml` が載っていない。本件の範囲外の既存の漏れなので、別 Issue に切り出す。
