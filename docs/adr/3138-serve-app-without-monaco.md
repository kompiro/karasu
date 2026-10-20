---
id: ADR-3138
title: "`karasu serve` の app build は専用 entry から始め、Monaco を含めない"
status: accepted
date: 2026-10-13
topic: build
refines: [ADR-3017]
related_to: [ADR-9013, ADR-2993, ADR-1681]
scope:
  packages:
    - app
    - cli
assumptions:
  - "file: packages/app/src/serve-main.tsx"
  - "symbol: packages/app/src/mount-app.tsx :: mountApp"
  - "symbol: packages/app/vite.serve.config.ts :: swapInServeEntry"
  - "symbol: packages/app/vite.serve.config.ts :: rejectMonaco"
  - "symbol: packages/app/vite.serve.config.ts :: isMonacoModule"
  - "symbol: packages/app/src/ServeModeApp.tsx :: SERVE_TOOLBAR"
  - 'grep: packages/app/src/main.tsx :: import "./monaco-setup.js"'
  - "grep: knip.json :: src/serve-main.tsx"
---

# ADR-3138: `karasu serve` の app build は専用 entry から始め、Monaco を含めない

- **日付**: 2026-10-13
- **ステータス**: 決定済み
- **関連**:
  - Issue #3138（起点）、設計 PR #3148（本 ADR に集約し削除: `docs/design/serve-app-without-monaco.md`）、実装 PR #3160
  - [ADR-3017](3017-serve-app-shipping.md)（serve 用 build を npm パッケージに同梱。「Monaco の worker が入る」を決めずに残しており、本 ADR はそれに答える）
  - [ADR-9013](9013-cli-serve-mode.md)（serve モードと、実行時の serve / standalone 判定。判定そのものは残す）
  - [ADR-2993](2993-gallery-client-side-rendering.md)（`PreviewToolbarSlotContext` を足し「viewer だけが使う」とした。本 ADR で serve モードも使う）
  - [ADR-1681](1681-cli-pack-only-bundle.md)（tarball の中身を決定論的に保つ）
  - TPL: [TPL-1681](../test-perspectives/TPL-1681-publishable-tarball-completeness.md)（チェック項目と対処パターンを追記し、`discovered_from` に #3138 を足した）、[TPL-1983](../test-perspectives/TPL-1983-view-state-gate-parity-across-surfaces.md)、[TPL-1024](../test-perspectives/TPL-1024-dev-vs-packaged-mode-parity.md)
  - AT: `docs/acceptance/3017-serve-from-npm-package.md`（#3138 の TC を追記）
  - 後続: #3162（serve モードから hosted app を指す共有リンクを作る）

## 背景

ADR-3017 で npm パッケージに入れた serve 用 build は 16MB（97 ファイル）あり、大半が Monaco Editor だった。
serve モードはエディタを表示しない（`AppShell hideEditor`）ので、一度も読まれない。

| ファイル                                              | サイズ |
| ----------------------------------------------------- | ------ |
| `ts.worker`                                           | 6.9MB  |
| `index`（app 本体 + Monaco 本体 + 80 余りの言語定義） | 5.5MB  |
| `css` / `html` / `json` の worker                     | 2.2MB  |
| `editor.worker`                                       | 0.3MB  |

Monaco を読み込むのは `monaco-setup.ts` の `import * as monaco from "monaco-editor"` だけである。
エディタ部品が import する `@monaco-editor/react` は薄い wrapper で、`main.tsx` から `monaco-setup` の
import を 1 行消すと 1.7MB（4 ファイル）になった。gallery viewer（同じ `AppShell hideEditor`）が
1.5MB に収まっているのも同じ理由である。

問題は、app が serve かどうかを**実行時に**決めていること（`detectAppMode()` が `/api/files` を叩く。
ADR-9013）だった。serve 用 build だけ Monaco を外すには、どこかで**build 時に** serve と決める必要がある。
さらに monorepo の `karasu serve` は Pages 用 build（`packages/app/dist`）を配る（`findAppDistDir`）ので、
Pages 用 build も serve モードで動き続ける必要がある。

## 決定

serve 用 build に専用の entry を持たせ、モードを build 時に `serve` に固定する。

1. **共通の mount**: `main.tsx` の Provider ツリーと `?reference` の分岐を `mount-app.tsx` の
   `mountApp({ mode? })` に移す。`main.tsx` は `monaco-setup` を import してから `mountApp()` を、
   `serve-main.tsx` は import せずに `mountApp({ mode: "serve" })` を呼ぶ。serve の画面（`ModeWrapper` 以下）は
   2 つの entry で同じコードを使う（TPL-1983）。
2. **`App` の `mode`**: `App` は `mode?: AppMode` を受け、渡されたら `detectAppMode()` も `#s=`（inline share）の
   読み取りもしない。inline share はエディタ付きの memory モードで開くが、Monaco の無い build で開くと
   `@monaco-editor/react` が既定の CDN から Monaco を取りに行く。`?krs=` の deep link 正規化は残す。
   `detectAppMode()` は Pages 用 build のために残す。
3. **entry の差し替え**: `vite.serve.config.ts` の `swapInServeEntry` が `index.html` の `/src/main.tsx` を
   `/src/serve-main.tsx` に置き換える。出力名は `index.html` のままで、CLI の SPA fallback は変わらない。
   置き換え対象が見つからなければ build を失敗させる。
4. **Monaco の締め出し**: `rejectMonaco` が `generateBundle` で module graph を調べ、`monaco-editor` の module
   （`isMonacoModule`）が 1 つでもあれば build を失敗させる。CLI の `prepack` は毎回この build を通る。
   tarball 側では `serve-from-tarball.test.ts` が Monaco の `editor.worker` と codicon フォントが無いことを確かめる。
5. **serve モードは Share を出さない**: `ServeModeApp` が `PreviewToolbarSlotContext` に `hideShare: true` を渡す。
   Pages 用 build と serve 用 build のどちらで動く serve モードも同じ見え方になる（TPL-1024）。
6. `knip.json` に `src/serve-main.tsx` を entry として足す（html の差し替え経由でしか届かないため）。

## 理由

- 実測（2026-10-13、main）で serve 用 build は 16MB → 1.7MB。tarball は 4.1MB（105 ファイル）→ 0.8MB
  （12 ファイル）、展開後は約 19MB → 3.2MB。
- Monaco を丸ごと外せる案のうち、Pages の起動順序を変えず、何を外しているかがコードから読めるのは
  entry の分割だけだった。
- serve 画面の組み立て（Provider ツリー・`?reference`・`?krs=`）を `mountApp` と `App` の 1 か所に置いたので、
  entry を足しても serve 画面が 2 通りに分かれない。
- 「`monaco-editor` を import しない」は人が守る約束ではなく build の失敗で守る。`serve-main.tsx` に
  `monaco-setup` の import を戻すと 1233 module を検出して build が落ちることを確認した。
- Share を出さないのは、serve モードの Share が `window.location` から `http://localhost:<port>/#s=…` を作るため
  （`buildShareUrls`）。同じマシンで serve が動いている間しか開けず、`/s?s=` の unfurl URL は CLI が配っていない。
  `#s=` を読まないだけでは、Share で作ったリンクが黙って `index.krs` を開くことになる（PR #3160 のレビューで判明）。
  ADR-2993 はこの slot を「viewer だけが使う」としていたが、serve モードも同じ理由（その配布先では Share が
  成り立たない）で使う。`toolbar-slot-owner.test.ts` が slot を提供してよいファイルを viewer と
  `ServeModeApp` の 2 つに固定している。

## 却下した案

### build 時の定数で分岐し、`monaco-setup` を dynamic import にする

`define` に `__KARASU_SERVE_BUILD__` を入れ、`main.tsx` を `if (!__KARASU_SERVE_BUILD__) await import("./monaco-setup.js")`
にする。entry は 1 つで済むが、Pages 用 build でも `monaco-setup` が非同期になり、`loader.config` がエディタの
mount より前に終わる保証を作り直す必要がある。分岐の外に `monaco-editor` の import が増えると黙って戻るので、
結局同じ機械チェックが要る。

### serve 用 config の `resolve.alias` で `monaco-editor` を stub に差し替える

app のコードを触らずに済むが、`loader.config({ monaco: stub })` が実行されるなど stub を Monaco の API に
合わせ続ける必要があり、何を外しているかが config を読まないと分からない。

### 使わない言語 worker（TypeScript / CSS / HTML / JSON）を全 build から外す（Issue の「最低限」案）

`monaco-editor/editor/editor.api.js` と必要な contrib だけを import すれば worker 4 つ（9.2MB）が消える。
しかし serve 用 build は約 7MB までしか減らない。monaco-editor 0.56 には editor contrib をまとめた公開 entry が無く、
`editor.main.js` が並べる約 80 の import を手で写すことになり、version bump のたびに合わせ直す必要がある。
Pages の利用者にも効かない。言語 worker はその言語の model を作ったときに初めて fetch され、karasu は `.krs`
の独自言語しか使わないので、Pages でもこれらは一度も読まれていない。

## 影響

- `karasu` の npm パッケージが小さくなる（上記）。serve モードの画面からは Share ボタンが消える。
  利用者向けの説明は `docs/tools/app.md` / `app.ja.md` に足した。
- Pages の app は変わらない（Monaco の読み込み方も同じ）。monorepo の `karasu serve` は Pages 用 build を
  配り続けるが、Share を出さない点は npm 版と揃う。
- 決めずに残したこと:
  - `@monaco-editor/react` とその loader は serve 用 build に残る（`App` → `AppShell` → `EditPane` の静的 import）。
    将来 serve モードでエディタを描くと、loader が jsDelivr から Monaco を取りに行く。現在その経路は無い。
  - `dist/app/THIRD_PARTY_NOTICES.md` は `packages/app` の prod 依存全体から作るので monaco-editor が載ったまま
    になる（過剰な表示で、欠落ではない）。notices の範囲は #3137 で扱う。
  - Pages 用 build でエディタを遅延読み込みにして初回表示を軽くするかは別の問いとして扱わない。
