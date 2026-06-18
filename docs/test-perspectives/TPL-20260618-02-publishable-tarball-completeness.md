---
id: TPL-20260618-02
title: "publish するパッケージの tarball は実行に必要な build 成果物だけを含み、テスト・型・sourcemap を除外する"
status: active
date: 2026-06-18
applicable_to:
  - "npm / レジストリに publish するパッケージ（CLI・ライブラリ・拡張など、外部に配布される成果物）"
  - "`files` ホワイトリスト / `.npmignore` で配布物の中身を制御するパッケージ"
  - "build 出力ディレクトリ（`dist/` 等）が gitignore され、test / 型 emit と混在しうるパッケージ"
known_consumers:
  - karasu-cli
discovered_from:
  - issue: "#1681"
  - root_cause_file: "packages/cli/package.json"
related_to:
  - TPL-20260510-15
topic: build
scope:
  packages:
    - cli
    - core
    - vscode
---

# TPL-20260618-02: publish するパッケージの tarball は実行に必要な build 成果物だけを含み、テスト・型・sourcemap を除外する

## 観点

外部に配布されるパッケージは、**「ソースに何があるか」ではなく「tarball に何が入るか」** で評価する。配布物には実行に必要な build 成果物（バンドル / コンパイル済み JS / 必要な型定義・アセット）が**漏れなく**含まれ、かつテスト JS（`*.test.js`）・テスト専用の型定義・sourcemap・dev 専用ファイルは**含まれない**必要がある。

特に build 出力ディレクトリ（`dist/` / `out/`）を `files: ["dist"]` のように**ディレクトリまるごと** glob で指定するのは危険。その glob は「`dist/` の中身が配布物そのものである」ことを暗黙に信用しているが、`dist/` は gitignore された作業ディレクトリであり、`tsc`（`--noEmit` 抜き）や IDE が混ぜ込んだ stale な emit が紛れ込むと、それも一緒に publish される。配布物が単一バンドルなら `files` を**その 1 ファイル**に固定し、複数成果物でも emit の種別（`*.js` のみ等）まで絞って、`dist/` の hygiene に依存しない**決定論的**な配布面にする。

publish 前の `npm pack --dry-run`（Tarball Contents）が、配布面の唯一の信頼できる検証手段。

## 想定される失敗モード

- build を含めず publish してしまい、`npx <pkg>` が `could not determine executable to run` で失敗する（#1681 の `karasu@0.0.1`: tarball が `package.json` + `README` のみ）
- `files: ["dist"]` のまま、手元 / CI の `dist/` に残った `*.test.js` / `*.d.ts` / `*.map` が tarball に混入する。利用者のインストールサイズが膨らみ、テストコードや内部実装が意図せず配布される
- ローカルでは `npm pack` が正しく見えるのに、別環境（stale dist が残った CI / 開発機）で publish すると中身が変わる — **環境依存で非決定的**な配布面
- `bin` / `main` / `exports` が指す先が `files` に含まれず、install しても entry point が存在しない

## チェックリスト

publish 対象パッケージを追加・変更するとき、以下を確認する:

- [ ] `npm pack --dry-run` の Tarball Contents を実際に確認したか（ソースの存在ではなく tarball の中身で判断する）
- [ ] `files` がディレクトリまるごとの glob（`["dist"]`）になっていないか。単一バンドルなら `dist/index.js` のように成果物そのものを列挙する
- [ ] `bin` / `main` / `module` / `exports` / `types` が指す全ファイルが `files` に含まれているか
- [ ] tarball にテスト JS（`*.test.js`）・テスト型定義・不要な sourcemap・dev 専用ファイルが含まれていないか
- [ ] `dist/` に stale な emit を混ぜた状態で `npm pack --dry-run` しても、配布物が変わらないか（決定論性）

## 既知の対処パターン

- **`files` を成果物ファイル単位で列挙する**（#1681 の修正パターン）。esbuild 単一バンドルなら `files: ["dist/index.js", "THIRD_PARTY_NOTICES.md"]`。`dist/` の中身に依存せず決定論的になる
- `package.json` の `files` / `bin` を読み、退行を検出する**ユニットテスト**を置く（`packages/cli/src/packaging.test.ts`）。`files` が再びディレクトリ glob に戻る、bin の指す先が `files` から外れる、を assert で防ぐ
- build を `dist/` の clean から始める（`rm -rf dist && …`）と dev の hygiene は上がるが、`files` 限定ほど決定論性は強くない。両者は併用可
- 複数成果物を tsc で出すパッケージ（core 等）は `tsconfig.build.json` で `*.test.ts` を `exclude` し、emit 対象を絞る

## 関連テスト

- `packages/cli/src/packaging.test.ts` — `files` がバンドル単体に固定され、`bin` がその成果物を指すことの回帰ガード
- 手動 AT: `docs/acceptance/1681-cli-pack-only-bundle.md`（`npm pack --dry-run` の Tarball Contents 目視確認、stale dist 混入の決定論性確認）

## 関連 TPL

- [TPL-20260510-15](TPL-20260510-15-dev-vs-packaged-mode-parity.md): dev tree と packaged レイアウトの parity。あちらは **packaged モードでの path 解決**（配布後にファイルがどこにあるか）を扱い、本 TPL は **tarball に何を入れる / 入れない**（配布物の中身そのもの）を扱う。配布物が dev 環境と乖離して壊れる、という同系統の失敗の表裏。
