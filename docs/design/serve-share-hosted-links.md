# karasu serve の Share を、公開版 app を指すリンクで戻す

- **日付**: 2026-10-16
- **ステータス**: 検討中
- **Issue**: [#3162](https://github.com/kompiro/karasu/issues/3162)
- **PR**: [#3254](https://github.com/kompiro/karasu/pull/3254)
- **関連**:
  - 関連 ADR: [ADR-3138](../adr/3138-serve-app-without-monaco.md)（serve モードから Share を外した決定。決定 5）、[ADR-3017](../adr/3017-serve-app-shipping.md)（npm の CLI に serve 用 app を同梱）、[ADR-2993](../adr/2993-gallery-client-side-rendering.md)（`PreviewToolbarSlotContext` と viewer）、[ADR-1809](../adr/1809-app-custom-domain-karasu-kompiro-dev.md)（公開版 app の URL）
  - 関連 TPL: [TPL-1024](../test-perspectives/TPL-1024-dev-vs-packaged-mode-parity.md)、[TPL-1983](../test-perspectives/TPL-1983-view-state-gate-parity-across-surfaces.md)、[TPL-2259](../test-perspectives/TPL-2259-shared-budget-enforced-at-every-producer.md)、[TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md)、[TPL-3162](../test-perspectives/TPL-3162-link-for-others-built-on-reachable-origin.md)（本 Design Doc で起こす proactive TPL）
  - コード: `packages/app/src/hooks/useShareDialog.ts`、`packages/app/src/utils/inline-share.ts`（`buildShareUrls`）、`packages/app/src/ServeModeApp.tsx`、`packages/app/src/components/preview-toolbar-slot.ts`

## 背景・課題

`karasu serve` は #3138（PR #3160、ADR-3138 決定 5）で Share を出さなくなった。Share のリンクは
`buildShareUrls(payload, window.location)` で作られるので、serve では `http://localhost:<port>/#s=…` になる。

- このリンクは、serve を動かしているマシンの上でしか開けない。
- `/s?s=`（Slack などでプレビューが展開されるリンク）は CLI が配っていないので 404 になる。
- npm の serve 用 build はエディタを持たず、`#s=` を読まない（ADR-3138 決定 2）。リンクを開いても、
  共有したモデルではなく `index.krs` が開く。

ローカルで書いている途中のモデルを人に見せたいときこそ Share が欲しい。#3162 は、リンクの宛先を
公開版 app（`https://karasu.kompiro.dev`）にして Share を serve に戻すことを提案している。公開版 app は
`#s=` を開けるし、`/s?s=` も配っているので、受け取った人は serve を動かしていなくても図を見られる。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| リンクの組み立て | `useShareDialog.applyShareUrls` が `buildShareUrls(finalPayload, window.location)` を呼ぶ。`origin + pathname + "#s=…"` と、収まれば `origin + "/s?s=…"`（`fitsUnfurlPayload`、TPL-2259） |
| Share を隠す口 | `PreviewToolbarSlotContext` の `hideShare`。提供してよいファイルは viewer と `ServeModeApp` の 2 つ（`toolbar-slot-owner.test.ts`） |
| serve モード | `ServeModeApp` が `{ hideShare: true }` を渡す。Pages 用 build の serve モードと npm の serve 用 build は同じ `ServeModeApp` を通る（ADR-3138、TPL-1024） |
| viewer（nest のギャラリー） | `mount-viewer.tsx` の既定ツールバーが `hideShare: true`。投稿ページ `/g/<id>` の URL がそのまま共有先になる。VS Code（#2996）は自前のツールバーを渡す予定 |
| 共有の中身 | `AppShell.getShareBundle` が entry と fs から `synthesizeSharePayload` で 1 つにまとめる。serve の fs には開いた 1 ファイルしか無い（`ServeModeApp` が `/serve/index.krs` に書く）ので、`import` 先は preview にも共有にも入らない |
| 公開版の URL | app のコードには定数が無い。docs-site の `site-map.ts` に `APP_URL = "https://karasu.kompiro.dev"`（ADR-1809 で gallery の "Open in the app" の単一ソース） |
| 案内文 | `docs/tools/app.md` / `app.ja.md` に「Share は `karasu serve` には出ない」 |

## 制約・前提

- **serve モードの見え方は 2 つの build で同じにする**（ADR-3138 決定 5、TPL-1024）。Pages 用 build の serve モードと
  npm の serve 用 build で Share の有無や宛先が変わってはいけない。
- **共有の中身は今と同じ**。fragment は送信されず、`/s?s=` は中身がサーバーに届くという説明（`unfurlHint`）も
  変えない。宛先が変わるだけで、payload の形式・上限（`MAX_UNFURL_PAYLOAD`）は変えない。
- **公開版 app と CLI の版はずれる**。公開版は main から常に deploy され、CLI は月次のリリース（ADR-2939）で出る。
  公開版は CLI より新しいのが普通なので、古い CLI で書いたモデルを新しい app が開く向きになる。言語の削除
  （ADR-2677 の v2.0 など）に当たると公開版で診断が出うるが、これは app の Share でも同じ向きの話で、本 Design Doc では扱わない。
- **out of scope**:
  - serve で `import` を解決すること（serve の fs に 1 ファイルしか無いのは別の制約）。
  - CLI 自身が `/s` を配ること（受け取った人が serve を動かしていない、という問題を解かない）。
  - VS Code の webview（#2996）。後で同じ口を使えるようにはしておく。

## 検討した選択肢

論点は 3 つある。(1) 公開版の URL をどこから取るか、(2) `/s?s=` のリンクも出すか、(3) viewer も対象にするか。

### 論点 1: 公開版の URL をどこから取るか

#### 案 1A: app に定数を置き、serve モードがツールバーの口で渡す

`packages/app/src/utils/hosted-app.ts` に `HOSTED_APP_ORIGIN = "https://karasu.kompiro.dev"` を置く。
`PreviewToolbarSlot` に `shareOrigin?: string` を足し、`ServeModeApp` は `{ shareOrigin: HOSTED_APP_ORIGIN }` を渡す。
`useShareDialog` は口に `shareOrigin` があればそれを、無ければ `window.location` を使う。

**メリット**

- Pages 用 build と serve 用 build が同じ `ServeModeApp` を通るので、2 つの build で宛先が同じになる（TPL-1024）。
- 「Share を出すか」「どこに向けるか」が同じ口に並び、提供してよいファイルの制約（`toolbar-slot-owner.test.ts`）もそのまま効く。
- 後で VS Code（#2996）が同じ口に `shareOrigin` を渡すだけで Share を出せる。

**デメリット**

- 公開版の URL が docs-site の `APP_URL` と 2 か所になる。

#### 案 1B: serve 用 build の `define` で埋め込む

`vite.serve.config.ts` の `define` に公開版の URL を入れ、`useShareDialog` が build 時の定数を見る。

**メリット**

- app の実行時の分岐が増えない。

**デメリット**

- Pages 用 build の serve モードには入らないので、2 つの build で宛先が変わる。ADR-3138 決定 5 と TPL-1024 に反する。
- ADR-3138 は「build 時の定数で分岐する」案を、何を外しているかがコードから読めないとして却下している。

#### 案 1C: CLI のオプションで渡す

`karasu serve --share-origin <url>` を足し、CLI が `/api/config` で app に渡す。既定値は公開版。

**メリット**

- 自分で app を立てている人が、自分の app に向けられる。

**デメリット**

- そういう利用者は今いない。API・起動時の非同期の取得・オプションの説明（`docs/tools/cli*.md`）が増える。
- 案 1A の上に後から足せる（口に渡す値の出どころが定数から API に変わるだけ）。今やる理由が無い。

### 論点 2: `/s?s=` のリンクも出すか

#### 案 2A: app と同じく 2 本とも出す

ダイアログの中身は app と同じ。既定でコピーされるのは fragment のリンク（中身はサーバーに届かない）で、
`/s?s=` は利用者が選んだときだけ使われ、「中身がサーバーに届き、ログに残りうる」と書いてある。

**メリット**

- app と serve で Share のダイアログが同じになる（TPL-1983）。
- Slack などで図のプレビューが出る。ローカルで書いた図を見せる場面ではむしろ欲しい。

**デメリット**

- ローカルのモデルは社外に出したくないものが多いかもしれない。ただし既定のリンクは送信されず、
  `/s?s=` には注意書きが付いている。条件は app で共有するときと同じ。

#### 案 2B: serve では fragment のリンクだけ出す

**メリット**

- 中身がサーバーに届く道が serve には無くなる。

**デメリット**

- ダイアログが app と serve で分かれる。分岐が 1 つ増え、片方だけ直す事故の元になる（TPL-1983）。
- 守れるものが少ない。利用者は serve の図を app に貼って `/s?s=` を作れる。

### 論点 3: viewer も対象にするか

#### 案 3A: viewer は今のまま出さない

nest の投稿ページは、その URL 自体が共有先である。viewer は origin を持たない sandbox の中で動き、
ADR-2993 で「共有（クリップボード）は出さない」と決めている。

#### 案 3B: viewer にも公開版宛ての Share を出す

投稿ページから、その図を公開版 app で開くリンクを作れる。しかし投稿ページの URL と役割が重なり、
ADR-2993 の決定を覆すことになる。#3162 の問題（serve のリンクが他人に届かない）とも関係が無い。

## 比較

| 観点 | 1A 定数 + 口 | 1B build の define | 1C CLI オプション |
| --- | --- | --- | --- |
| 2 つの build で宛先が同じ | 同じ | 変わる | 同じ |
| 変更量 | app のみ | app + serve config | app + CLI + API |
| 自前の app への対応 | 後から 1C を足せる | 不可 | 可 |

## Related TPLs

- [TPL-1024](../test-perspectives/TPL-1024-dev-vs-packaged-mode-parity.md): Pages 用 build の serve モードと npm の serve 用 build で、Share の有無と宛先が同じこと。
- [TPL-1983](../test-perspectives/TPL-1983-view-state-gate-parity-across-surfaces.md): Share のダイアログを app と serve で分けない。
- [TPL-2259](../test-perspectives/TPL-2259-shared-budget-enforced-at-every-producer.md): `/s?s=` を作るのは `buildShareUrls` の 1 か所のまま。宛先を変えても `fitsUnfurlPayload` を通る。
- [TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md): 受け取る側（公開版 app）の decode は変えない。serve で作った payload も同じ境界を通る。
- [TPL-3162](../test-perspectives/TPL-3162-link-for-others-built-on-reachable-origin.md)（proactive、本 PR で起こす）: 他人に渡すリンクを、今いるページの origin（`window.location`）から作らない。受け取った人が開ける origin から作る。

## 現時点の方針

**案 1A・2A・3A を採る。** 公開版の URL は app の定数に置き、`ServeModeApp` がツールバーの口で渡す。
ダイアログは app と同じく 2 本のリンクを出す。viewer は今のまま。

2 つの build が同じ `ServeModeApp` を通るので、宛先を `ServeModeApp` で決めれば build による違いが生じない。
CLI のオプションは、自前の app に向けたい利用者が現れたときに、口に渡す値の出どころを変えるだけで足せる。

ダイアログには、宛先が今いるページと違うとき（serve モード）にだけ「リンクは karasu.kompiro.dev で開きます」と
1 行足す。リンクを受け取った人がどこで開くかを、共有する本人が分かるようにするため。

### 実装の指針

1. **定数**: `packages/app/src/utils/hosted-app.ts` に `HOSTED_APP_ORIGIN` を置く。docs-site の `APP_URL` と
   値が同じであることを、`scripts/` の drift テストか docs-site 側の test で 1 本固定する（2 か所になる代わり）。
2. **口**: `PreviewToolbarSlot` に `shareOrigin?: string` を足す。`hideShare` があれば Share は出ない（今と同じ）。
3. **組み立て**: `useShareDialog` が `shareOrigin` を受け、あれば `{ origin: shareOrigin, pathname: "/" }` を
   `buildShareUrls` に渡す。serve の `pathname` は開いているファイル名（`/<name>`）なので、そのまま使うと
   公開版で存在しない path になる。`/s?s=` は今と同じく `buildShareUrls` の中で `fitsUnfurlPayload` を通る。
4. **serve モード**: `ServeModeApp` の `SERVE_TOOLBAR` を `{ shareOrigin: HOSTED_APP_ORIGIN }` にし、コメントを書き換える。
5. **ダイアログ**: `ShareDialog` に宛先の 1 行（`preview.share.dialog.hostedHint`、en / ja）を足す。宛先の origin が
   `window.location.origin` と違うときだけ出す。
6. **テスト**:
   - `inline-share.test.ts`: `{ origin: HOSTED_APP_ORIGIN, pathname: "/" }` で 2 本のリンクが公開版を指すこと。
   - `useShareDialog` / `PreviewColumn` の test: 口に `shareOrigin` があるとき、リンクがその origin から作られ、
     serve の `pathname` を含まないこと。無いときは今と同じく `window.location` から作られること。
   - `ServeModeApp.test.tsx`: 「Share を出さない（#3138）」を「Share を出し、宛先が公開版（#3162）」に書き換える。
   - `ShareDialog` の test: 宛先が違うときだけ `hostedHint` が出ること。
   - e2e: AT-0032 の nightly（`at-0032-cli-serve-mode.spec.ts`、#3049 で karasu serve に対して走る）で、Share の
     fragment リンクが `https://karasu.kompiro.dev/#s=` で始まり、decode すると開いたファイルの中身になること。
     Pages 用 build の serve モードでも同じことを確かめる（TPL-1024）。
7. **ドキュメント**: `docs/tools/app.md` / `app.ja.md` の「Share は `karasu serve` には出ない」を
   「`karasu serve` では公開版 app を指すリンクになる」に書き換える。
8. **AT**: `docs/acceptance/3162-serve-share-hosted-links.md` を新規作成する。TC は:
   - serve モードで Share が出る。fragment リンクは公開版を指し、serve のファイル名を path に含まない。
   - 収まる大きさなら `/s?s=` のリンクも公開版を指す。収まらなければ出ない（app と同じ）。
   - serve モードのダイアログにだけ宛先の 1 行が出る。
   - 手動: serve で作った fragment リンクを、serve を止めた別のブラウザで開くと、同じ図が公開版で開く。
9. **changeset**: serve の app は `karasu`（CLI）の tarball に入るので、`karasu` の minor を 1 つ。
10. **ADR 昇格**: 実装完了後、`docs/adr/3162-serve-share-hosted-links.md` として昇格し、本 Design Doc は同 PR で削除する。
    ADR-3138 決定 5（serve モードは Share を出さない）を refine する関係になる。ADR-3138 の本文は書き換えない。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: `karasu serve` のツールバーに Share が戻る。リンクは公開版 app で開く。
- ドキュメント更新: `docs/tools/app.md`、`docs/tools/app.ja.md`。
- テスト・examples への影響: `ServeModeApp.test.tsx` の 1 件を書き換える。examples は変わらない。

## 未解決の問い / 決めないこと

- **自前の app に向けるオプション**（案 1C）は決めない。利用者が現れたら、口に渡す値の出どころを足す。
