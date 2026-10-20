---
id: TPL-3162
title: "他人に渡すリンクは、受け取った人が開ける origin から作る"
status: active
date: 2026-10-16
applicable_to:
  - "共有リンク・permalink・「app で開く」リンクなど、利用者がコピーして他人に渡す URL を組み立てる変更"
  - "既存の画面を、別の origin（ローカルの CLI サーバー・preview deploy・sandbox の viewer・エディタの webview）で動かす変更"
  - "URL を組み立てる関数に `window.location` / `location.origin` を渡す、または既定値にする変更"
known_consumers:
  - share-dialog
  - serve-mode
discovered_from:
  - issue: "#3162"
  - root_cause_file: "packages/app/src/hooks/useShareDialog.ts"
  - root_cause_adr: "ADR-3138"
related_to:
  - TPL-1024
  - TPL-2259
  - TPL-1983
topic: app-ui
scope:
  packages:
    - app
    - cli
---

# TPL-3162: 他人に渡すリンクは、受け取った人が開ける origin から作る

## 観点

> 起源は **#3162**（proactive）。`karasu serve` の Share は `buildShareUrls(payload, window.location)` で
> リンクを作っていたので、`http://localhost:<port>/#s=…` になった。このリンクは serve を動かしている
> マシンの上でしか開けない。#3138 はこれを理由に serve から Share を外し（ADR-3138 決定 5）、#3162 は
> 宛先を公開版 app に変えて戻す。

`window.location` は「今このページを開いている場所」であって、「リンクを受け取った人が開ける場所」
ではない。2 つが一致するのは、公開版 app のように誰でも届く origin でページが動いているときだけである。
同じ画面をローカルの CLI サーバー、preview deploy、sandbox の viewer、エディタの webview で動かすと、
`window.location` から作ったリンクは黙って他人に届かなくなる。リンクを作った本人の手元では開けるので、
作った側のテストでは気づかない。

他人に渡すリンクの origin は、画面を動かしている側（serve モード・viewer・webview）が明示的に決めて
渡す。`window.location` を使ってよいのは、その origin が他人にも届くと分かっているときだけである。

## 想定される失敗モード

- **ローカルのサーバーを指すリンクを渡す。** serve の Share が `http://localhost:<port>/#s=…` を作り、
  受け取った人の手元では開けない（#3138 / #3162）。
- **origin は直しても path を持ち越す。** serve の `pathname` は開いているファイル名（`/<name>`）なので、
  `origin` だけ公開版に差し替えると公開版に存在しない path を指す。
- **受け取る側が配っていない path を指す。** `/s?s=` は公開版 app が配るが CLI は配らない。宛先を変えずに
  unfurl のリンクを出すと 404 になる。
- **build によって宛先が変わる。** 宛先を build 時の定数で決めると、Pages 用 build の serve モードと
  npm の serve 用 build で、同じ画面のリンクが別の場所を指す（TPL-1024）。
- **寿命の短い origin を指す。** preview deploy（`<branch>.karasu.pages.dev`）から作ったリンクは、
  ブランチが消えると開けなくなる。意図した動作かどうかを決めておく。

## チェックリスト

他人に渡す URL を組み立てる変更、または画面を別の origin で動かす変更で確認する:

- [ ] リンクの origin を、受け取った人が開ける場所から取っている（`window.location` を使うなら、
      その origin が他人にも届く理由を説明できる）
- [ ] origin を差し替えるとき、path も宛先で意味を持つものにしている（今のページの `pathname` を持ち越していない）
- [ ] リンクが指す path（`#s=`・`/s?s=` など）を、宛先が実際に配っている
- [ ] 同じ画面を動かす全ての origin（公開版・serve の 2 つの build・viewer・webview）で、作られるリンクの
      宛先をテストしている
- [ ] 宛先が今のページと違うとき、共有する本人にそのことが見える

## 既知の対処パターン

- **宛先を、画面を動かしている側が渡す**（#3162 の方針）: 公開版の URL を app の定数に置き、
  `ServeModeApp` がツールバーの口（`PreviewToolbarSlotContext`）で渡す。口が何も渡さなければ
  `window.location` を使う。2 つの build が同じ `ServeModeApp` を通るので、build で宛先が変わらない。
- **出せないなら出さない**（#3138）: 他人に届く宛先を決められない画面では、リンクを作る操作そのものを
  出さない。黙って届かないリンクを作るより良い。

## 関連テスト

- `packages/app/src/ServeModeApp.test.tsx` › `keeps Share and points its links at the public app (#3162)`（serve モードがツールバーの口に公開版の origin を渡す。2 つの build は同じ `ServeModeApp` を通る）
- `packages/app/src/components/PreviewColumn.test.tsx` › `builds both links on the slot's share origin, at its root, and says so` / `builds the links on this page, with no destination line, when no host sets an origin`
- `packages/app/src/utils/inline-share.test.ts` › `points both links at the public app when given its origin and the root path`
- `packages/app/src/components/ShareDialog.test.tsx` › `names the host the links open on only when they are built elsewhere`
- `scripts/lint/hosted-app-origin.test.ts`（app の `HOSTED_APP_ORIGIN` と docs-site の `APP_URL` が同じ値）
- `packages/e2e/tests/at-0032-cli-serve-mode.spec.ts` › `TC-07: Share builds its links on the public app, not on the local server`（nightly、karasu serve に対して）
