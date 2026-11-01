---
id: ADR-3237
title: OPFS fixture の origin は app の起動ではなく static file で得る
status: accepted
date: 2026-11-01
topic: testing
related_to:
  - ADR-862
scope:
  packages:
    - e2e
  concerns:
    - performance
assumptions:
  - "symbol: packages/e2e/fixtures/opfs.ts :: ORIGIN_DOCUMENT"
  - "grep: packages/e2e/fixtures/opfs.ts :: ORIGIN_DOCUMENT = \"/favicon.svg\""
  - "file: packages/app/public/favicon.svg"
---

# ADR-3237: OPFS fixture の origin は app の起動ではなく static file で得る

- **日付**: 2026-11-01
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3237](https://github.com/kompiro/karasu/issues/3237)、PR [#3503](https://github.com/kompiro/karasu/pull/3503)
  - [ADR-862](./862-opfs-fixture-helper.md)（OPFS fixture。origin を memory モードの起動で得ると決めた）
  - Issue [#3041](https://github.com/kompiro/karasu/issues/3041)（`workers: 2` の計測。#3237 はそこで見つかった）
  - `packages/e2e/fixtures/opfs.ts`、`packages/e2e/tests/at-3031-focus-canvas.spec.ts`

## 背景

#3041 の `workers: 2` 計測で、at-3031 の 2 本が 10.7s / 10.3s まで伸び、per-test の `timeout: 15_000` の約 7 割に達した。
`workers: 1` でも `at-3031:147`（TPL-3022 の「どの edge にも届く」）は 5.5s で、suite で最も遅いテストだった。

時間を測ると、大半はアサーションではなく準備に使われていた（ローカル、`CI=1`、1 worker）。

| 手順 | 時間 |
| --- | --- |
| `opfs.seed()`。中の `ensureOrigin` が memory モードで app を起動する | 約 0.8s |
| `gotoApp()`。app をもう一度起動する | 約 0.57s |
| Monaco への貼り付けと 400ms の compile settle | 約 0.56s |
| System タブ、system root の描画、Umami app への drill | 約 0.85s |
| Relations を 10 ノード分、開いて閉じる | 約 1.45s |

ADR-862 は origin を memory モードの起動で得ると決めた。理由は「`about:blank` 経由のような OPFS スコープ外しの回避策が不要になる」こと。
ただし必要なのは origin 上の document だけで、app が動いている必要は無い。
`page.evaluate` で `localStorage` と `navigator.storage.getDirectory()` を呼べる document なら何でもよい。

## 決定

OPFS fixture の `ensureOrigin` は、app が配信する static file（`ORIGIN_DOCUMENT = "/favicon.svg"`、`packages/app/public`）を開いて origin を得る。
レスポンスがその SVG でなければ throw する。

## 理由

- **必要なのは同じ origin の document だけである。** SVG document でも `localStorage` と OPFS を使え、`about:blank` の回避策にもならない。ADR-862 が memory モードの起動を選んだ理由はそのまま満たされる
- **seed の間に app が動いていない。** 旧方式は memory モードの app を動かしたまま wipe と書き込みをしていた（memory モードは OPFS を読まないので無害だった）。新方式では競合の相手そのものがいない
- **起動 1 回分が消える。** `seed` は約 0.8s から約 20ms になった。ローカルでは suite のテスト時間の合計が 857s から 570s（295 テスト、全 pass）に減った
- **CI での効果はローカルより小さい。** 旧方式の起動は、続く `gotoApp()` の読み込みのキャッシュも温めていた。遅い runner ほどこの冷えた読み込みが重く、CI の `workers: 1` ではテスト時間の合計が 794s から 698〜737s（−8〜−15%）にとどまった
- **レスポンスを確かめる。** ファイルが配信されなくなっても 404 にはならず、SPA fallback が `200 text/html` で `index.html` を返す。すると seed の最中に app が project モードで起動し、OPFS を読む。黙って遅くなり、競合も生むので、fixture は SVG 以外のレスポンスで失敗する

static file の origin だけでは at-3031 は 5s を割らなかった（CI の `workers: 1` で `:147` が 6.4s / 5.8s）。同じ PR で at-3031 側も直した。

- `openDenseCanvas` は fixture を project の `index.krs` として seed し、`#krs-system-UmamiApp` で開く。dense canvas のレイアウトは 1 回で済む
- TPL-3022 のテストは、最初のノードだけ Relations pill で開く。以降は開いている canvas のカードで次のノードへ移り、カードが画面に無いときだけ pill に戻る。pill とカードはどちらも `{ kind: "node", id }` の focus を開く（`PreviewPane.tsx`）ので、検証内容（各 edge のラベルが両端の canvas の lane にある）は変わらない

結果（CI）は次のとおり。

- `workers: 1`: `:147` が 3.7s / 3.8s、`:184` が 4.3s / 4.2s で、Issue の基準（5s）を満たした
- `workers: 2`: 対象 4 本の最長は 6.0s。p95 は 3 回とも 4.6s 以下で、#3041 の基準（5s）内に収まった

## 却下した案

### A. at-3031 だけを直し、fixture は別 Issue にする

at-3031 の中だけの削減（`clickPoint` の一括化、Relations ループの待ちの削減）は 0.3〜0.5s 程度の見込みで、CI で 5s を割る保証が無かった。
fixture の変更は全 OPFS spec に効く。測定済みで小さい変更なので、同じ PR に含めた。

### B. at-3031 を project モードの通常起動（`bootProjectApp`）に替えるだけ

static file の origin と組み合わせても、memory モードの起動との差は 0.1〜0.3s だった。
効いたのは起動モードではなく、system root を経ずに dense の階層から開くこと（hash 起動）である。

### C. 起動を `addInitScript` に替える

ADR-862 が却下した案のまま（React の `useEffect` が seed の完了前に走る）。static file の document への `page.evaluate` なら、seed の完了を await してから `gotoApp()` できる。
