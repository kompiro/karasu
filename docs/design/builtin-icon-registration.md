# 組み込みアイコンを全描画面で登録し、名前が解決しない `url()` を診断する

- **日付**: 2026-09-17
- **ステータス**: 検討中
- **Issue**: #2802
- **PR**: #TBD
- **関連**:
  - 引き金 Issue: [#2802](https://github.com/kompiro/karasu/issues/2802)（残スコープは item 2 と 3。item 1 は [#2816](https://github.com/kompiro/karasu/issues/2816) へ移管済み）
  - 関連 Issue: [#2816](https://github.com/kompiro/karasu/issues/2816)（`url()` を `icon()` に改名する）、[#2696](https://github.com/kompiro/karasu/issues/2696)、[#2797](https://github.com/kompiro/karasu/pull/2797)
  - 関連 ADR: [ADR-9005](../adr/9005-svg-icon-file-import.md)（SVG ファイル + マニフェスト、ファイル I/O は利用側）、[ADR-1178](../adr/1178-style-value-diagnostics.md)（値レベル診断）、[ADR-2376](../adr/2376-icon-display-mode-de-emphasis-and-removal-path.md)（icon mode の removal path、移行先は `shape: url()`）、[ADR-299](../adr/299-vscode-icon-mode-toggle.md)（VS Code の icon mode トグル）
  - 関連 TPL: [TPL-1001](../test-perspectives/TPL-1001-display-mode-cross-surface.md)、[TPL-1415](../test-perspectives/TPL-1415-shared-vocabulary-dual-representation.md)、[TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)、[TPL-1024](../test-perspectives/TPL-1024-dev-vs-packaged-mode-parity.md)、[TPL-2802](../test-perspectives/TPL-2802-core-registry-contents-do-not-depend-on-host.md)（本 PR で起こす proactive TPL）
  - コード: `packages/core/src/renderer/icon-manifest.ts`、`packages/core/src/shapes/shape-registry.ts`、`packages/core/src/style/value-validator.ts`、`packages/app/src/hooks/useSystemView.ts`

## 背景・課題

`shape: url("<name>")` はプロセス全体で共有されるシェイプレジストリを名前で引く。
組み込みアイコン 30 個をこのレジストリに登録しているのは、ブラウザ app の
`useSystemView.ts` がモジュール読み込み時に呼ぶ `resolveIconManifest` だけである。
それ以外の描画面は何も登録しないので、`renderShape` の
`getShape(name) ?? getShape("box")!` に落ちて、診断なしで box になる。

core を直接呼んで、登録なしと登録ありを比べた（`compile()`、`service` 1 つのモデル）:

| 入力 | 登録なし | app と同じ manifest を登録 |
| --- | --- | --- |
| `service { shape: url("database"); }` | アイコンなし、診断 0 件 | アイコンあり |
| `displayMode: "icon"`（シートなし） | アイコンなし、診断 0 件 | アイコンあり |
| `service { shape: url("databse"); }`（typo） | box、診断 0 件 | box、診断 0 件 |

2 行目が示すとおり、壊れているのは `url()` を書いた利用者だけではない。
icon theme（`ICON_THEME_STYLE_SOURCE`）も `url("service")` を生成するので、
**icon display mode も app 以外ではアイコンを描いていない**。

Issue は CLI と VS Code を挙げているが、実際に core で描画して登録していない面はもっと多い:

| 描画面 | どこで描画するか | 組み込みアイコン |
| --- | --- | --- |
| app（Vite） | ブラウザ | 登録する（`useSystemView.ts`） |
| `karasu serve` の UI | ブラウザ（app の dist を配信） | 登録する |
| `karasu render` / `diff` / `serve` の `/render` | Node（esbuild bundle） | なし |
| VS Code プレビュー | 拡張ホスト（esbuild bundle） | なし（ADR-299 の icon mode トグルも効いていない） |
| LSP | Node（esbuild bundle） | なし（描画しないが、下記の診断を出すなら要る） |
| Pages Functions `/render`・`/s` | Cloudflare（wrangler bundle） | なし（README・OGP 画像） |
| karasu-nest gallery | Cloudflare Worker | なし（`displayMode=icon` を受け付ける） |
| `@karasu-tools/core` を npm から使う第三者 | 任意 | なし |

typo は描画面を問わず診断されない。`value-validator.ts` の `url` spec は
「関数名が `url` なら受理」しか見ないので、名前が存在するかは誰も確認しない
（TPL-1503 の ghost vocabulary）。

ADR-2376 は icon mode 利用者の移行先を `shape: url()` と決めた。その移行先が 1 つの描画面でしか動かず、
しかも書き間違いを黙って box にする。これが「今やる」理由である。

## 制約・前提

- **ADR-9005 の決定を守る**: アイコンの正本は `.svg` ファイルのまま置く（プレビューできることが理由）。
  core はファイル I/O を持たない。
  ただし ADR-9005 が却下した「TS 文字列リテラルへの埋め込み」の却下理由は「`.svg` として
  プレビューできなくなる」ことだった。`.svg` を正本に残したまま、ビルド成果物として TS を生成する
  案（下記 案B）はこの理由に抵触しない。採るなら ADR で「却下したのは手書きの埋め込みであり、
  生成は別物」と明記する。
- 描画面ごとにバンドラが違う: Vite（app）、esbuild（CLI・VS Code・LSP）、wrangler（Pages Functions・nest）、
  `tsc`（core の npm 配布物）。`.svg` を文字列として import する設定はバンドラごとに要る。
  `tsc` には該当する手段がない。
- core の `development` export 条件は `src/*.ts` を直接読む。生成物は commit する必要がある。
- #2816 が `url()` を `icon()` に改名する予定。診断のコード名とメッセージは、どちらの綴りでも使える形にする。
- **スコープ外**:
  - `url()` の綴りと、アイコンとビルトインシェイプの名前空間の分離（#2816）。bare ident の
    `shape: database` を resolver は `hasShape` で受理するが validator は enum エラーにする、
    という食い違いもここに含める
  - Issue コメントの item 4「アイコン名の一覧表を生成する」。綴りが #2816 で変わるので、
    その後に起こす。本設計の生成モジュールが一覧の単一ソースになるので、そのときの手間は小さくなる
  - プロジェクト相対の `.svg` パスを読み込む loader（#2816 の判断待ち）

## 検討した選択肢

### 登録の置き場所

#### 案A: 各描画面が自分で登録する（現状の延長）

app の 30 行の `?raw` import と `resolveIconManifest` 呼び出しを、CLI・VS Code・LSP・Pages Functions・nest に写す。
各バンドラに `.svg` を text として読む loader 設定（esbuild `--loader:.svg=text`、wrangler の rules）を足す。

**メリット**

- ADR-9005 の「登録は利用側の責任」をそのまま守る
- core の変更がない

**デメリット**

- 同じ 30 行の import 表が 6 箇所に複製され、アイコン追加のたびに全箇所を直す（TPL-1415）
- 次に増える描画面が登録を忘れると、今回と同じ silent box になる。今回の 5 面の漏れは、まさにこの構造から出ている
- npm の `@karasu-tools/core` 利用者は `icons/*` を自分で読んで登録しなければアイコンが出ず、そのことがどこにも書かれていない
- 診断を validator に置くと、登録を忘れた面ではすべての `url()` が「未知のアイコン」になる

#### 案B: core が組み込みアイコンを生成モジュールとして持ち、import 時に自動登録する（推奨）

`packages/core/icons/icons.json` と `*.svg` から、`name → SVG 文字列` の TS モジュールを生成して commit する。
<!-- absent-path-next-line: file this design proposes to generate (#2802) -->
生成先の例は `packages/core/src/shapes/builtin-icons.generated.ts`。
組み込みシェイプの `registerBuiltinShapes()`（`shapes.ts` で import 時に自動実行）と同じく、
core がこれを import 時に `builtIn: true` で登録する。

- 正本は引き続き `.svg` と `icons.json`。生成スクリプトと、生成結果が最新であることを確認する drift テストを置く
- app の `?raw` import 30 行と `resolveIconManifest` 呼び出しは削除する
- `resolveIconManifest` / `loadAndRegisterIcon(s)` は利用者が独自アイコンを足す API として残す
- `@karasu-tools/core/icons/*` の export も残す（外部から `.svg` を見る用途）

**メリット**

- 描画面が何もしなくても全面で同じレジストリになる。新しい描画面が登録を忘れる余地がない
- バンドラごとの loader 設定が不要（ただの TS なので Vite・esbuild・wrangler・tsc がそのまま扱う）
- npm 利用者も import するだけでアイコンと icon mode が動く
- 診断を validator に置いたとき、どの面でも同じ結果になる

**デメリット**

- core の import に副作用が 1 つ増える（ただし組み込みシェイプで前例あり）
- アイコンを使わない利用者にも約 18KB（SVG 30 個の合計）が乗る
- 生成物と正本の二重表現になる。drift テストで担保する（TPL-1415）
- ADR-9005 の却下案に似て見えるので、違いを ADR に書く必要がある

#### 案C: 案B の生成モジュールを持つが、自動登録せず `registerBuiltinIcons()` を export する

**メリット**

- 副作用なし。アイコン不要な利用者は呼ばなければ登録されない

**デメリット**

- 「各面が呼び忘れると silent box」という構造は案A と変わらない。複製が 30 行から 1 行に縮むだけ
- 組み込みシェイプは自動登録なので、同じレジストリの中で登録方式が 2 通りになる

### 診断の置き場所

#### 案X: 値 validator で宣言位置に出す（推奨）

`value-validator.ts` の `url` spec で名前を取り出し（resolver の `url\("(.+?)"\)` と同じ規則）、
`hasShape(name)` が偽なら新しい診断 `style-unknown-icon`（warning）を値ノードの位置に出す。
param は `{ property, name }`。

- validator は `compile`（app・CLI render・VS Code・Pages・nest）、LSP、`karasu lint-style` の 3 経路すべてで走る（ADR-1178）
- 描画はこれまでどおり box にフォールバックする。warning にするのは、描画自体は継続できるから
- 引用符のない `url(database)` のように名前を取り出せないとき、resolver は黙って box にする。
  このときも同じコードを出し、`name` には引数の生テキストを入れる
- レジストリの参照は既定引数として注入できる形にする（`isRegisteredShape = hasShape`）。テストが
  グローバル状態に依存しないようにするため
- **案B が前提**。案A/C のままだと、登録していない LSP や CLI ですべての `url()` が誤検知になる

**メリット**

- エディタの squiggle と CLI 出力が宣言の行を指す。どのノードにもマッチしない規則の typo も見つかる
- 1 宣言 1 件で、ノード数に比例して増えない

**デメリット**

- validator がグローバルなレジストリを読む。独自アイコンを持つ埋め込み利用者は、compile / validate の前に登録しておく必要がある（ドキュメントに書く）

#### 案Y: 描画時に、フォールバックしたノードごとに Warning を出す

`renderShape` で登録されていない名前に当たったとき、新しい `WarningKind` を出す。

**メリット**

- 実際に box へフォールバックした事実そのものを報告する

**デメリット**

- ソース位置を持たない。LSP は描画しないので出ない
- ノード数だけ出る。マッチしない規則の typo は見つからない

## 比較

| 観点 | 案A | 案B | 案C |
| --- | --- | --- | --- |
| 描画面間の一致 | 各面の実装次第 | 構造で保証 | 各面の実装次第 |
| 新しい描画面での再発 | する | しない | する |
| バンドラ設定 | 5 箇所に追加 | 不要 | 不要 |
| アイコン追加の変更箇所 | `.svg` + manifest + 6 箇所の import | `.svg` + manifest + 再生成 | `.svg` + manifest + 再生成 |
| npm 利用者 | 自前で登録（未文書化） | 何もしなくてよい | 1 行呼ぶ（要文書化） |
| 案X の診断と組めるか | 誤検知の危険 | そのまま組める | 呼び忘れた面で誤検知 |

## Related TPLs

- [TPL-1001](../test-perspectives/TPL-1001-display-mode-cross-surface.md): icon mode は表示モード。全描画面の点検が要る。今回の不具合はその「描画面」に CLI・VS Code・Pages・nest が入っていなかった形
- [TPL-1415](../test-perspectives/TPL-1415-shared-vocabulary-dual-representation.md): `.svg`/manifest と生成モジュールは二重表現になる。drift テストで正本から生成物を検証する。icon theme が使う名前が全部登録済みであることも同じ観点で固定する
- [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md): `url()` の引数は「受理するが効果も警告もない」ghost vocabulary だった。案X はこれを「警告される」に移す
- [TPL-1024](../test-perspectives/TPL-1024-dev-vs-packaged-mode-parity.md): CLI（`dist/index.js` だけを配布）と `.vsix` はバンドル済みで、`icons/` ディレクトリを持たない。生成モジュールはバンドルに入るので配置に依存しない。検証はバンドル後の成果物で行う
- **[TPL-2802](../test-perspectives/TPL-2802-core-registry-contents-do-not-depend-on-host.md)（本 PR で新規、proactive）**: core の描画・診断が読むレジストリの中身は、ホストが何を呼んだかで変わってはならない。組み込みの中身は core が埋め、ホストの登録は追加だけに限る

## 現時点の方針

**登録は案B、診断は案X を採用する。** 案A と案C はどちらも「描画面が呼び忘れると黙って box」という
構造を残し、今回の 5 面の漏れはその構造から出ている。案B は正本を `.svg` に残すので ADR-9005 の
却下理由（プレビューできなくなる）には当たらない。組み込みシェイプとも登録方式が揃う。
案X の診断は、全面でレジストリが同じだという前提で初めて誤検知なしに置ける。
なので 2 つは同じ PR で入れる。

### 実装の指針

1. **生成スクリプト**: `icons.json` の順に `*.svg` を読み、`BUILTIN_ICON_SOURCES: readonly { name; svg }[]` を
   書き出す（`scripts/` 配下、`pnpm gen:icons` のような script を追加）。ファイル先頭に「生成物、手で編集しない、
   正本は `packages/core/icons/`」と書く
2. **drift テスト**（core vitest）: テスト内で生成結果を作り直し、commit 済みの生成物と一致することを確認する。
   `icons.json` の全 entry が生成物にあること、生成物にしかない名前がないこと（key 集合の和で比べる、TPL-1415）
3. **自動登録**: 組み込みシェイプと同じく import 時に登録する。登録は、レジストリを読むモジュール
   （`renderer/shapes.ts` と `style/value-validator.ts`）の import グラフから必ず到達する場所に置く。
   循環依存チェック（`docs/process.md`）を通す。`clearRegistry()` を使う既存テストへの影響を確認し、
   必要なら組み込みを再登録するテスト用ヘルパを用意する
4. **app の整理**: `useSystemView.ts` の `?raw` import 30 行と `resolveIconManifest` 呼び出しを削除する
5. **parity テスト**:
   - icon theme（`ICON_RULES`）とクライアントのサブタイプ規則（`client-<subtype>`）が使う名前が、すべて登録済みであること
   - core を import しただけで（ホストが何も呼ばずに）`url("database")` と `displayMode: "icon"` がアイコンを描くこと
   - CLI: `karasu render` の出力 SVG にアイコンが入ること（`render.e2e.test.ts`。ビルド済みバンドルを通す、TPL-1024）
   - VS Code: 拡張ホストの compile 経路で同じことを確認する unit テスト
6. **診断**: `value-validator.ts` に `style-unknown-icon` を足す。i18n カタログ（en / ja）にメッセージを追加する。
   `docs/spec/diagnostics.md`（+ ja）の style 表に 1 行、`docs/spec/style.md`（+ ja）の shape 節に
   「登録されていない名前は warning、描画は box」を書く。spec に新しい規定を足すので、
   TPL-2802 か既存 TPL へ back-ref を張る（`.claude/rules/spec-audit.md`）
7. **changeset**: CLI・VS Code・core の patch（CLI と VS Code でアイコンと icon mode が描かれるようになる、
   typo が warning になる）
8. **AT**: `docs/acceptance/` に新規ファイル。TC:
   - `karasu render` で `shape: url("database")` のノードにアイコンが描かれる
   - VS Code プレビューで同じモデルにアイコンが描かれ、icon mode トグルでアイコンカードになる
   - `url("databse")` が、app の診断パネル・VS Code の Problems（LSP）・`karasu lint-style` の 3 か所で warning になり、宣言の行を指す
9. **ADR 昇格**: 実装完了後、`docs/adr/2802-builtin-icon-registration.md` に昇格し、本 Design Doc は同じ PR で削除する。
   ADR-9005 とは `related_to` で結び、「却下したのは手書きの埋め込みで、`.svg` を正本にした生成とは別」と明記する

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: CLI・VS Code・README 画像・nest で、`url()` と icon mode がアイコンを描くようになる（見た目が変わる。不具合の修正）。
  typo していた宣言に warning が出るようになる。描画は変わらない
- 独自アイコンを `resolveIconManifest` で登録している埋め込み利用者: 変更なし。同じ名前で登録すれば組み込みを上書きする（今と同じ）
- ドキュメント更新: `docs/spec/style.md` / `style.ja.md`、`docs/spec/diagnostics.md` / `diagnostics.ja.md`
- テスト・examples への影響: SVG スナップショットのうち、Node 側で `url()` / icon mode を描いていたものは出力が変わる。
  変更内容が「box → アイコン」だけであることを差分で確認する
