---
id: TPL-2802
title: "core が描画・診断で読むレジストリの中身は、ホストが何を呼んだかで変わってはならない"
status: active
date: 2026-09-17
applicable_to:
  - "core の renderer / resolver / validator が、プロセス全体で共有されるレジストリ（shape・icon など）を名前で引くコード"
  - "組み込みの中身を、ホスト（app / CLI / VS Code / LSP / Pages Functions / nest）の初期化コードが登録している構造"
  - "新しい描画面（別バンドル・別ランタイム）で core を呼び始める変更"
known_consumers:
  - shape-registry
  - svg-icon-loader
  - icon-manifest
  - icon-theme
  - value-validator
  - use-system-view
discovered_from:
  - issue: "#2802"
  - root_cause_file: "packages/app/src/hooks/useSystemView.ts"
  - root_cause_file: "packages/core/src/renderer/shapes.ts"
  - root_cause_adr: "ADR-9005"
related_to:
  - TPL-1001
  - TPL-1415
  - TPL-1503
  - TPL-1024
topic: renderer
scope:
  packages:
    - core
    - app
    - cli
    - vscode
    - lsp
    - nest
---

# TPL-2802: core が描画・診断で読むレジストリの中身は、ホストが何を呼んだかで変わってはならない

## 観点

core の関数が「名前 → 実装」のレジストリを引くとき、**同じ入力に対する出力は、どのホストから
呼ばれても同じ**でなければならない。組み込みの中身をホストの初期化コードが登録する構造だと、
この一致は「すべてのホストが登録を忘れていない」ことに依存する。描画面は増えていく
（ブラウザ、Node の CLI、拡張ホスト、Cloudflare の Functions と Worker、npm の第三者）。
登録を忘れたホストは、型エラーにも例外にもならず、**フォールバックした出力を黙って返す**。

置き方は 1 つにまとめられる。**組み込みの中身は core 自身が埋め、ホストの登録は追加
（利用者独自の拡張）だけにする。** レジストリの中身がホストで変わらなければ、
そのレジストリを前提にした診断（「未登録の名前」警告など）も、どの面でも同じ結果になる。

#2802 では、組み込みアイコン 30 個を app だけが登録していた。そのため CLI・VS Code・Pages Functions・nest では、
`shape: url("database")` も icon display mode も、診断なしで box になっていた。

## 想定される失敗モード

- ある描画面だけで、アイコン・シェイプ・テーマの一部が黙ってフォールバック表示になる。
  その面で実際に描画して見比べるまで誰も気づかない（app の E2E はすべて green）
- 表示モード（icon mode など）のように、組み込み登録を前提にした機能が、登録のない面で丸ごと効かない
- 新しい描画面（Worker・Function・別バンドル）を足した PR が、既存の面の初期化コードを写し忘れる。
  diff には「足したファイル」しか出ないので、レビューでも見落とす
- 「名前が未登録なら警告する」診断を足すと、登録を忘れた面（とくに描画しない LSP）で、正しい名前すべてに誤検知が出る
- 組み込みの一覧をホストごとに複製し、アイコンを 1 つ足したとき一部の面にだけ入る（TPL-1415 と同じ drift）

## チェックリスト

レジストリを引くコード、組み込みの登録、描画面を追加・変更するときに確認する:

- [ ] 組み込みの中身は core の import だけで登録されるか。core 外に残る登録呼び出しは利用者独自の追加だけか
      （`resolveIconManifest` / `registerIcon` / `registerShape` を core 外で grep する）
- [ ] 「ホストが何もしない状態で core を import し、組み込み名を引くと実装が返る」ことをテストしているか
- [ ] 組み込み登録を前提にした機能（icon theme が生成する名前など）が、すべて登録済みの名前だけを使っていることを parity テストで固定しているか
- [ ] 配布物（CLI の単一バンドル、`.vsix`、Worker バンドル）でも組み込みが入っているか。dev tree のファイル配置に依存していないか（TPL-1024）
- [ ] レジストリを前提にした診断が、描画しない面（LSP）でも誤検知しないか

## 既知の対処パターン

- 組み込みシェイプは `renderer/shapes.ts` の `registerBuiltinShapes()` が import 時に自動実行される。これが「core が埋める」形の前例
- ファイル I/O を core に持ち込まずに正本ファイル（`.svg` など）を core に入れるには、正本から TS モジュールを生成して commit し、
  drift テストで最新であることを確かめる（[#2802](https://github.com/kompiro/karasu/issues/2802) の Design Doc `docs/design/builtin-icon-registration.md`）

## 関連テスト

- `packages/core/src/builtins/icon-theme.test.ts` — `ICON_RULES` から生成される各規則が `url()` 形式であることと、
  そこで使う名前の取り合わせを固定する。ここに載る名前が「登録済みであること」までは見ておらず、本観点の穴はその差分にある
- `packages/core/src/renderer/icon-manifest.test.ts` — マニフェストと SVG 文字列を渡したとき登録されることを見る。
  渡す側（どのホストが呼ぶか）は対象外で、テストは自分で登録してから引く
- `packages/core/src/renderer/svg-icon-loader.test.ts` — SVG 文字列 1 個の解析と登録
- `packages/core/src/displaymode-meta.test.ts` — `displayMode` を通す公開エントリポイントの網羅。library 層の保証であって、
  ホストがレジストリを埋めたかは見ない（TPL-1001 と同じ library / consumer の境目）

上記はいずれも「登録済みである」ことを前提に置いている。#2802 の実装で、ホストが何も呼ばない状態そのものを
落とすテストを足した:

- `packages/core/src/shapes/builtin-icons.test.ts` — core の package entry を import しただけで、マニフェストの全名が
  `builtIn: true` で登録済みであること、`url("database")` と `displayMode: "icon"` がアイコンを描くこと、
  `ICON_RULES` と `client-<subtype>` が使う名前がすべて登録済みであること（parity）
- `scripts/icons/gen-builtin-icons.test.ts` — commit 済みの生成モジュールが正本（manifest と `.svg`）から
  再生成したものと一致し、名前集合と順序も manifest どおりであること（TPL-1415）。判定は lefthook の
  `pnpm gen:icons --check` と同じ `regenerate()` を呼ぶので、フックとテストが食い違わない
- `packages/core/src/style/value-validator.test.ts` — 未登録の名前が `style-unknown-icon` になり、組み込みの名前は
  ホストの登録なしに通ること
- `packages/cli/src/render.e2e.test.ts` — `karasu render` が `url("database")` をアイコンで描き、typo を warning にすること
- `packages/cli/src/lint-style.test.ts` — `karasu lint-style` が typo を宣言位置つきの warning にすること
- `packages/lsp/src/diagnostics.test.ts` — 描画しない LSP でも同じ判定になり、組み込みの名前を誤検知しないこと
- `packages/vscode/src/builtin-icons-extension-host.test.ts` — 拡張ホストの `compileProject` 経路で同じこと

## 派生元 spec

- [`docs/spec/style.md`](../spec/style.md) — 「shape property」節（`url()` の引数は登録済みアイコンの名前で、
  組み込みのセットは core 自身が登録する。未登録の名前は `style-unknown-icon` warning、描画は `box`）
- [`docs/spec/diagnostics.md`](../spec/diagnostics.md) — 「Style validation」節の `style-unknown-icon` 行（章末の `> Related TPLs:` が本 TPL を指す）
