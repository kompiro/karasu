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
  - useSystemView
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

- [ ] 組み込みの中身は core の import だけで登録されるか（ホストの呼び出しに依存していないか）
- [ ] ホスト側の登録呼び出しは、利用者独自の追加だけになっているか。組み込みを登録しているホストコードが残っていないか
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

- （#2802 の実装で追加予定）core を import しただけで `url("database")` と `displayMode: "icon"` がアイコンを描くことのテスト、
  生成モジュールの drift テスト、`karasu render` のバンドル経由の e2e テスト
