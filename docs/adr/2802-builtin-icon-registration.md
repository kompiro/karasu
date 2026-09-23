---
id: ADR-2802
title: 組み込みアイコンは core が import 時に登録し、解決しない url() は値 validator が診断する
status: accepted
date: 2026-09-23
topic: renderer
authors: [kompiro]
related_to:
  - ADR-9005
  - ADR-1178
  - ADR-2376
  - ADR-299
  - ADR-2803
scope:
  packages:
    - core
    - app
    - cli
    - lsp
    - vscode
assumptions:
  - "file: packages/core/src/shapes/builtin-icons.ts"
  - "file: packages/core/src/shapes/builtin-icons.generated.ts"
  - "file: scripts/icons/gen-builtin-icons.ts"
  - "symbol: packages/core/src/shapes/builtin-icons.ts :: registerBuiltinIcons"
  - "symbol: packages/core/src/renderer/shapes.ts :: resetRegistryToBuiltins"
  - "grep: packages/core/src/style/value-validator.ts :: style-unknown-icon"
  - "grep: packages/core/src/types/warnings.ts :: style-unknown-icon"
  - "file: docs/acceptance/builtin-icon-registration.md"
  - "file: docs/test-perspectives/TPL-2802-core-registry-contents-do-not-depend-on-host.md"
---

# ADR-2802: 組み込みアイコンは core が import 時に登録し、解決しない url() は値 validator が診断する

- **日付**: 2026-09-23
- **ステータス**: 決定済み
- **関連**:
  - 起点 Issue: [#2802](https://github.com/kompiro/karasu/issues/2802)（`shape: url()` がブラウザ app でしか解決しない）
  - 実装 PR: [#2865](https://github.com/kompiro/karasu/pull/2865)、Design Doc PR: [#2855](https://github.com/kompiro/karasu/pull/2855)
  - 分離した Issue: [#2816](https://github.com/kompiro/karasu/issues/2816)（`url()` を `icon()` へ綴り替える。パス形式を受けるかの判断もここ）、[#2858](https://github.com/kompiro/karasu/issues/2858)（アイコン名の一覧表。本 ADR の生成モジュールがその単一ソース）
  - 派生 Issue: [#2879](https://github.com/kompiro/karasu/issues/2879)（`karasu diff` は resolver warning を一切出さない。本件の調査で判明）
  - [ADR-9005](9005-svg-icon-file-import.md)（SVG ファイル + マニフェスト方式。却下案との差は「却下した案」節）、[ADR-1178](1178-style-value-diagnostics.md)（値レベル診断）、[ADR-2376](2376-icon-display-mode-de-emphasis-and-removal-path.md)（icon mode の removal path。移行先が本件の `shape: url()`）、[ADR-299](299-vscode-icon-mode-toggle.md)（VS Code の icon mode トグル）、[ADR-2803](2803-slotted-icon-card-text.md)（slotted アイコンのテキスト描画）、[#2715](https://github.com/kompiro/karasu/issues/2715)（位置は文書と対で意味を持つ。ADR 未昇格）
  - TPL: [TPL-2802](../test-perspectives/TPL-2802-core-registry-contents-do-not-depend-on-host.md)（本件起源の retrospective）、[TPL-1001](../test-perspectives/TPL-1001-display-mode-cross-surface.md)、[TPL-1415](../test-perspectives/TPL-1415-shared-vocabulary-dual-representation.md)、[TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)、[TPL-1024](../test-perspectives/TPL-1024-dev-vs-packaged-mode-parity.md)
  - AT: [AT-2802](../acceptance/builtin-icon-registration.md)
  - コード: `packages/core/src/shapes/builtin-icons.ts`、`packages/core/src/renderer/shapes.ts`、`packages/core/src/style/value-validator.ts`、`scripts/icons/gen-builtin-icons.ts`

## 背景

`shape: url("<name>")` はプロセス全体で共有されるシェイプレジストリを名前で引く。組み込み
アイコン 30 個をそのレジストリに入れていたのは、ブラウザ app の `useSystemView.ts` が
モジュール読み込み時に呼ぶ `resolveIconManifest` だけだった。他の描画面は何も登録しないので
`renderShape` の `getShape(name) ?? getShape("box")!` に落ち、診断もなく box になる。

壊れていたのは `url()` を書いた利用者だけではない。icon theme も `url("service")` を生成する
ので、**icon display mode も app 以外ではアイコンを描いていなかった**。該当する面は CLI
（`render` / `diff` / `serve` の `/render`）、VS Code プレビュー、LSP、Pages Functions、
karasu-nest、そして `@karasu-tools/core` を npm から使う第三者に及ぶ。

さらに名前の書き間違いはどの面でも診断されなかった。`value-validator.ts` の `url` spec は
「関数名が `url` なら受理」しか見ず、名前が存在するかを誰も確認していない（TPL-1503 の
ghost vocabulary）。ADR-2376 が icon mode 利用者の移行先を `shape: url()` と決めた以上、
その移行先が 1 面でしか動かず書き間違いを黙って box にするのは放置できない。

## 決定

**組み込みアイコンは core 自身が生成モジュールとして持ち、import 時に登録する。** 解決しない
名前は値 validator が `style-unknown-icon`（warning）として宣言位置に報告し、描画は box に
フォールバックしたままにする。

- 正本は `packages/core/icons/` の `.svg` と `icons.json` のまま。そこから
  `packages/core/src/shapes/builtin-icons.generated.ts` を生成して commit する
  （`pnpm gen:icons` / `--check`、lefthook と `scripts/icons/gen-builtin-icons.test.ts` が drift を落とす）
- `shapes/builtin-icons.ts` が import 時に `builtIn: true` で登録する。組み込みシェイプの
  `registerBuiltinShapes()` と同じ形
- `resolveIconManifest` / `loadAndRegisterIcon(s)` は利用者が独自アイコンを足す API として残す。
  app 側の `?raw` import 30 行と登録呼び出しは削除する
- `resetRegistryToBuiltins()` が「core が出荷するレジストリ」を復元する。core がレジストリを
  埋める場所は 2 つ（幾何シェイプとアイコン）になったので、片方だけ戻す reset を作らせない

## 理由

- **描画面が何もしなくても全面で同じレジストリになる。** 新しい描画面が登録を忘れる余地が構造上
  無い。今回の漏れはまさに「各面が自分で登録する」構造から出ている（TPL-2802）
- **バンドラごとの loader 設定が要らない。** ただの TS なので Vite・esbuild・wrangler・`tsc` が
  そのまま扱う。`.svg` を文字列として import する設定は面ごとに必要で、`tsc` には手段が無い
- **npm 利用者も import するだけで動く。** 従来は `icons/*` を自分で読んで登録しなければ
  アイコンが出ず、そのことがどこにも書かれていなかった
- **診断をどの面でも同じ結果にできる。** レジストリの中身が面で変わらないという前提が無いと、
  登録しない LSP や CLI ですべての `url()` が誤検知になる。値 validator に置いたので、
  `compile`・LSP・`karasu lint-style` の 3 経路すべてで同じ判定になり（ADR-1178）、
  どのノードにもマッチしない規則の書き間違いも 1 宣言 1 件で見つかる

## 却下した案

### 各描画面が自分で登録する（現状の延長）

app の 30 行の `?raw` import と `resolveIconManifest` 呼び出しを CLI・VS Code・LSP・
Pages Functions・nest に写し、各バンドラに `.svg` を text として読む設定を足す。

同じ 30 行の表が 6 箇所に複製され、アイコン追加のたびに全箇所を直すことになる（TPL-1415）。
次に増える描画面が登録を忘れれば今回と同じ silent box が再発する。診断を validator に置くと、
登録を忘れた面ではすべての `url()` が誤検知になる。

### 生成モジュールを持つが、自動登録せず `registerBuiltinIcons()` を export するだけ

副作用が増えないのは利点だが、「各面が呼び忘れると silent box」という構造は上と変わらない。
複製が 30 行から 1 行に縮むだけで、組み込みシェイプが自動登録なのにアイコンだけ手動という
非対称もレジストリの中に残る。

### 描画時に、フォールバックしたノードごとに Warning を出す

実際に box へ落ちた事実そのものを報告できるが、ソース位置を持たず、描画しない LSP では出ない。
ノード数だけ出るうえ、どのノードにもマッチしない規則の書き間違いは見つからない。

### ADR-9005 が却下した「TS 文字列リテラルへの埋め込み」との違い

ADR-9005 は SVG を TS の文字列リテラルとして管理する案を「`.svg` としてプレビューできなくなる」
ことを理由に却下した。**却下したのは手書きの埋め込みであり、本 ADR の生成物は別物である。**
正本の `.svg` はそのまま残り、デザイナはこれまでどおりファイルを開いて編集・プレビューできる。
生成モジュールはそこから作られるビルド成果物で、drift テストが正本との一致を保証する。
core がファイル I/O を持たないという ADR-9005 の決定にも触れていない。

## 実装で設計から変えたこと

- **drift テストは 1 本にした。** 設計は core 側にも内容比較のテストを置く想定だったが、生成
  スクリプト側の byte 一致テストが内容一致を含むうえ、リポジトリの他の generator
  （`gen-docs` / `gen-guide-diagrams`）は「lefthook + scripts に 1 本」で揃っている。判定は
  lefthook が呼ぶ `regenerate({ root, check })` そのものを呼ぶので、フックとテストが食い違わない
- **生成モジュールは `// prettier-ignore` を持つ。** 当初はフォーマッタの quote 選択規則を
  生成器側に写していたが、それでは `.oxfmtrc.json` の変更でアイコンと無関係に `format:check` が
  落ちる。生成物をフォーマッタの対象外にして `JSON.stringify` で書く方が依存が少ない
- **`resetRegistryToBuiltins()` を足した。** 設計の「必要ならテスト用ヘルパを用意する」に対応する。
  本件の前は `registerBuiltinShapes()` だけでレジストリが出荷状態に戻ったので、2 呼び出しに
  なった時点で「片方だけ戻す」事故が入りうる。core のリセット箇所をこれに寄せ、
  `warnings.test.ts` が持っていた手書き 18 件のアイコン表（`icons.json` の三重表現）も消した
- **警告の位置はシートに名前があるときだけ保つ。** validator の位置をそのまま warning に載せると、
  `compile(krs, { styleSource })` 経路ではシートにパスが無いため位置が `.krs` 側の行として
  読まれる。[#2715](https://github.com/kompiro/karasu/issues/2715) が取り除いた誤読そのものなので、`unplacedStyleDiagnostics` と同じ規則を適用した
- **`karasu render` が warning の位置を出すようにした。** 診断には位置を付けて warning には
  付けない扱いは、`docs/spec/diagnostics.md` の「面ごとの位置表示」表と食い違っていた。
  `karasu diff` は対象外 — そもそも warning を 1 つも出さないことが分かり、[#2879](https://github.com/kompiro/karasu/issues/2879) に切り出した

## 影響

- CLI・VS Code・README 画像・nest で `url()` と icon mode がアイコンを描くようになる（見た目が
  変わるが不具合の修正）。書き間違えていた宣言には warning が出る。描画結果は box のまま変わらない
- 独自アイコンを登録している埋め込み利用者は変更なし。同じ名前で登録すれば組み込みを上書きする
- **ホストが独自に登録したアイコンは、別プロセスで動く LSP と `karasu lint-style` からは見えない。**
  そこでは未登録として報告される（ホスト側の描画は正しいまま）。制約として
  `docs/spec/style.md` / `style.ja.md` に明記した
- アイコンを使わない利用者にも SVG 30 個分（約 21KB、gzip 約 5KB）が乗る
