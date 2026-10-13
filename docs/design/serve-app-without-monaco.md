# serve 用 build から Monaco を外す

- **日付**: 2026-10-13
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3138](https://github.com/kompiro/karasu/issues/3138)
  - 関連 ADR: [ADR-9013](../adr/9013-cli-serve-mode.md)（serve モードと実行時のモード判定）、#3017 の Design Doc [serve-app-shipping](serve-app-shipping.md)（ADR-3017 へ昇格予定。本件はその「未解決の問い」）
  - 関連 TPL: [TPL-1681](../test-perspectives/TPL-1681-publishable-tarball-completeness.md)、[TPL-1983](../test-perspectives/TPL-1983-view-state-gate-parity-across-surfaces.md)
  - コード: `packages/app/src/main.tsx`、`packages/app/src/App.tsx`、`packages/app/src/monaco-setup.ts`、`packages/app/vite.serve.config.ts`

## 背景・課題

#3017 で `karasu` の npm パッケージに preview app（`packages/app` の serve 用 build）を同梱した。
その build は 16MB あり、ほとんどが Monaco Editor である。serve モードはエディタを表示しない
（`AppShell hideEditor`）ので、この 16MB の大半は一度も読まれない。

2026-10-13 時点の `pnpm --filter @karasu-tools/app build:serve` の実測:

| ファイル | サイズ | 中身 |
| --- | --- | --- |
| `ts.worker-*.js` | 6.9MB | TypeScript の言語 worker |
| `index-*.js` | 5.5MB | app 本体 + Monaco 本体 + 80 余りの言語定義 |
| `css.worker` / `html.worker` / `json.worker` | 2.2MB | CSS / HTML / JSON の言語 worker |
| `editor.worker-*.js` | 0.3MB | Monaco の基本 worker |
| その他（言語ごとの chunk 等） | 約 1MB | |
| **合計** | **16MB（97 ファイル）** | |

`main.tsx` 先頭の `import "./monaco-setup.js"` を 1 行消して同じ build をすると、
**1.7MB（4 ファイル）** になる。Monaco を読み込んでいるのは `monaco-setup.ts` の
`import * as monaco from "monaco-editor"` だけで、エディタ部品（`EditorPane.tsx`）が
import する `@monaco-editor/react` は数 KB の薄い wrapper である。gallery viewer
（`vite.viewer.config.ts`、同じ `AppShell hideEditor` を使う）が `monaco-setup` を
import せず 1.5MB に収まっているのも同じ理由。

課題は、serve 用 build だけ `monaco-setup` を読まないようにする方法である。app は
serve かどうかを **実行時に** 決めている（`detect-storage-mode.ts` が `/api/files` を
叩く。ADR-9013）ので、どこかで **build 時に** serve と決める必要がある。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| entry | `index.html` → `src/main.tsx`。`main.tsx` が `monaco-setup` を import し、`?reference` なら `ReferenceWindow`、それ以外は `App` を render する |
| モード判定 | `App` が `#s=`（inline share）を読み、無ければ `detectAppMode()` で serve / opfs / memory を決める。`?krs=` の deep link 正規化もここ |
| serve の画面 | `ModeWrapper` が Provider 群（`AppProvider` / `CommandProvider` / `KeyboardShortcutDispatcher` / `CommandPalette` / `TranslateProvider`）で `ServeModeApp` を包む。`ServeModeApp` は `AppShell hideEditor` |
| serve 用 build | `vite.serve.config.ts` が Pages 用 config を `mergeConfig` で継承し、minify・sourcemap なし・`dist-serve/` に出す。input は `index.html` のまま |
| CLI が配る app | npm パッケージでは `dist/app/`（`dist-serve/` を stage したもの）。**monorepo では `packages/app/dist/`（Pages 用 build）** を使う（`packages/cli/src/serve.ts` `findAppDistDir`） |

最後の行が効く。monorepo の `karasu serve` は Pages 用 build を配るので、Pages 用 build も
serve モードで動き続ける必要がある。実行時のモード判定は残す。

## 制約・前提

- Pages の app（standalone モード）の挙動は変えない。Monaco の読み込み方（`loader.config({ monaco })` で
  ローカルの monaco-editor を使う）もそのまま。
- monorepo で `karasu serve` が Pages 用 build を配る経路は残る。`detectAppMode()` は消さない。
- serve 用 build の serve モードは、Pages 用 build の serve モードと同じ画面・同じ操作になる
  （コマンドパレット・ショートカット・pop-out reference window・`?krs=` deep link）。
- CLI は `index.html` を SPA fallback として配る。serve 用 build の出力は `index.html` のまま。
- out of scope: Pages 用 build の初回読み込みを軽くすること（エディタの遅延読み込み）。

## 検討した選択肢

### 案1: serve 用の entry を作り、モードを build 時に serve に固定する

`src/serve-main.tsx` を足す。`main.tsx` から Provider ツリーと `?reference` の分岐を
共通関数に切り出し、`main.tsx` は `monaco-setup` を import してから、`serve-main.tsx` は
import せずにそれを呼ぶ。`serve-main.tsx` は `App` にモードを渡して実行時判定を飛ばす
（`<App mode="serve" />`）。

`vite.serve.config.ts` には `transformIndexHtml` の plugin を足し、`index.html` の
`/src/main.tsx` を `/src/serve-main.tsx` に差し替える。input も出力名も `index.html` のまま。

**メリット**

- 実測 16MB → 1.7MB。Monaco を丸ごと外せる。
- serve 画面のコード（`ModeWrapper` 以下）は Pages 用 build と同じものを使う。serve 用に
  画面を作り直さない。
- 「serve 用 build に Monaco が入っていないこと」を build 時に機械的に確かめられる
  （下記「実装の指針」2）。

**デメリット**

- entry が 2 つになる。`main.tsx` に足した初期化が `serve-main.tsx` に届かない漏れが起きうる
  （共通関数に寄せて抑える）。
- `index.html` の script 差し替えは文字列置換なので、`index.html` の書き方が変わると外れる
  （置換できなければ build を失敗させる）。

### 案2: build 時の定数で分岐し、`monaco-setup` を dynamic import にする

`vite.serve.config.ts` で `define` に `__KARASU_SERVE_BUILD__: true` を入れ、`main.tsx` を
`if (!__KARASU_SERVE_BUILD__) await import("./monaco-setup.js")` にする。定数が true なら
rolldown が分岐ごと消す。

**メリット**

- entry は 1 つのまま。

**デメリット**

- Pages 用 build でも `monaco-setup` が非同期になる。`loader.config` がエディタの mount より
  前に終わる保証を、render 前の await で作る必要がある。Pages の起動順序を変える。
- 分岐の外にある `monaco-editor` の import（型以外）が 1 つでも増えると黙って 16MB に戻る。
  案1 と同じ機械チェックが別途要る。

### 案3: serve 用 config の `resolve.alias` で `monaco-editor` を空の stub に差し替える

**メリット**

- app のコードを触らない。

**デメリット**

- `loader.config({ monaco: stub })` が実行されるなど、stub の形を Monaco の API に合わせ続ける
  必要がある。何が外れているかがコードから読めない。

### 案4（Issue の「最低限」案）: 使わない言語 worker（TypeScript / CSS / HTML / JSON）を全 build から外す

`import * as monaco from "monaco-editor"` は `editor.main.js` 経由で全言語の定義と 4 つの
言語機能を読む。`monaco-editor/editor/editor.api.js` と必要な editor contrib だけを
import すれば worker 4 つ（9.2MB）が消える。

**メリット**

- Pages 用 build の deploy サイズも減る。

**デメリット**

- serve 用 build は 16MB → 約 7MB で、案1 の 1.7MB に遠い。
- monaco-editor 0.56 には `editor.all` に当たる公開 entry が無く、`editor.main.js` が並べている
  約 80 の contrib import（find widget・folding・suggest など）を手で写すことになる。
  `monaco-setup.ts` の注記どおり 0.56 で `exports` の形が変わった前例があり、version bump の
  たびに写しを合わせる必要がある。
- Pages の利用者には効かない。言語 worker は、その言語の model を作ったときに初めて fetch される。
  karasu は `.krs` の独自言語しか使わないので、Pages でもこれらは一度も読まれていない。

## 比較

| 観点 | 案1 entry 分割 | 案2 define + dynamic import | 案3 alias stub | 案4 言語 worker 除外 |
| --- | --- | --- | --- | --- |
| serve 用 build のサイズ | 1.7MB | 1.7MB | 約 1.7MB | 約 7MB |
| Pages の挙動 | 変わらない | 起動順序が変わる | 変わらない | 変わらない |
| monaco-editor の version bump への耐性 | 影響なし | 影響なし | stub を合わせる | contrib の写しを合わせる |
| 読み手が分かるか | entry を見れば分かる | 定数の分岐を追う | config を読まないと分からない | 写したリストの意図が要る |

## Related TPLs

- [TPL-1681](../test-perspectives/TPL-1681-publishable-tarball-completeness.md): tarball には実行に必要な
  build 成果物だけを入れる。serve で読まれない Monaco は「実行に必要でないもの」にあたる。
  本件で「serve 用 build に `monaco-editor` の module が入っていない」ことを build 時に確かめる
  チェックを足し、TPL-1681 の具体例に追記する。
- [TPL-1983](../test-perspectives/TPL-1983-view-state-gate-parity-across-surfaces.md): 同じ機能を
  複数の surface に出すとき、条件を surface 間で揃える。serve モードの画面が Pages 用 build と
  serve 用 build の 2 つの entry から出るので、Provider ツリーと `?reference` / `?krs=` の扱いを
  共通関数 1 か所に置き、entry ごとに書かない。

新規の proactive TPL は起こさない。上の 2 件で観点が足りている。

## 現時点の方針

**案1 を採用する** — Monaco を丸ごと外せるのは案1〜3 で、そのうち Pages の起動順序を変えず、
外していることがコードから読めるのは案1 だけである。案4 は serve 用 build を十分に小さくせず、
Pages でも読まれていない worker を外すために version bump ごとの保守を背負うので採らない。

### serve 用 build で `#s=`（inline share）を読まない

`App` はモードを渡されたとき `#s=` を読まない。inline share は memory モードでエディタ付きの
画面を開くが、serve 用 build には Monaco が無いので、開くと `@monaco-editor/react` が既定の
CDN から Monaco を取りに行く。`#s=` は karasu-nest / Pages の URL 形式で、`karasu serve` の
URL には付かないので、読まなくても失うものは無い。`?krs=` の deep link 正規化は serve モードでも
意味があるので残す。

### 実装の指針

1. `src/main.tsx` の render 部分（Provider ツリー、`?reference` の分岐）を `src/mount-app.tsx` の
   `mountApp(options)` に切り出す。`main.tsx` は `import "./monaco-setup.js"` の後に
   `mountApp({})` を、`src/serve-main.tsx` は `mountApp({ mode: "serve" })` を呼ぶ。
   `App` は `mode?: AppMode` を受け、渡されたら `detectAppMode()` と `#s=` の読み取りを飛ばす。
2. `vite.serve.config.ts` に 2 つの plugin を足す。
   - `index.html` の `/src/main.tsx` を `/src/serve-main.tsx` に置き換える。置き換え対象が
     見つからなければ build を失敗させる。
   - build の module graph に `monaco-editor` の module があれば build を失敗させる
     （`generateBundle` で `this.getModuleIds()` を調べる）。CLI の `build:app` はこの build を
     通るので、publish 前に必ず確かめられる。
3. テスト
   - `serve-build-config.test.ts` に、上の 2 plugin が config に入っていることを足す。
   - `App` のテストに、`mode="serve"` のとき `/api/files` を叩かず、`#s=` があっても serve 画面を
     出すことを足す。
   - `serve-main.tsx` が `monaco-setup` を import していないことは 2 の build 時チェックが守る。
4. AT: 既存の [AT 3017-serve-from-npm-package](../acceptance/3017-serve-from-npm-package.md) に
   TC を足す（npm パッケージの `karasu serve` で、コマンドパレット・ショートカット・pop-out
   reference window が Pages 用 build と同じに動く。手動確認）。
5. TPL-1681 の具体例に本件を追記する。
6. ADR 昇格: 実装完了後、`docs/adr/3138-serve-app-without-monaco.md` に昇格し、本 Design Doc を
   同じ PR で削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: `karasu` の npm パッケージが約 15MB 小さくなる。画面の変化なし。
- ドキュメント更新: なし（ADR-9013 の「Monaco 非表示」は変わらない）。
- テスト・examples への影響: なし。

## 未解決の問い / 決めないこと

- Pages 用 build でエディタを遅延読み込みにして初回表示を軽くするかは決めない。本件は npm
  パッケージのサイズが課題で、Pages の初回読み込みは別の問いである。
