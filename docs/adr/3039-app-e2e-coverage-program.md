---
id: ADR-3039
title: app の E2E は jsdom が模せない境界を跨ぐ流れを持ち、コマンドの追加は機械で止める
status: accepted
date: 2026-11-07
topic: testing
related_to:
  - ADR-529
  - ADR-862
  - ADR-916
  - ADR-1008
  - ADR-1729
  - ADR-1866
  - ADR-3257
  - ADR-3237
scope:
  packages:
    - e2e
    - app
  concerns:
    - ci
---

# ADR-3039: app の E2E は jsdom が模せない境界を跨ぐ流れを持ち、コマンドの追加は機械で止める

- **日付**: 2026-11-07
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3039](https://github.com/kompiro/karasu/issues/3039)（sub-issue の一覧と各スライスの到達点は `## Slice status`）
  - serve project の PR gate 昇格: [#3661](https://github.com/kompiro/karasu/issues/3661)
  - TPL: [TPL-3039](../test-perspectives/TPL-3039-e2e-coverage-follows-surface-not-history.md)

## 背景

`packages/e2e` の Playwright suite は、ADR-529 の「パイロットから始めて運用実績を見てから拡大する」方針どおり、
AT が e2e を要求した Issue ごとに spec を足して育った。その結果、カバレッジは機能面ではなく履歴に従っていた。
2026-10-03 の計測:

| 指標                              | 値                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| spec                              | 47 `at-*` + 2 fixture smoke、runtime 189 テスト                                              |
| 合計時間                          | 560s（平均 2.96s、CI は `workers: 1`、test step 上限 900s）                                  |
| 安定性                            | nightly 直近 8 日 全 success、flake Issue は 90 日で 1 件（#2789）                           |
| app 対象 AT                       | 119 ファイル / 1,415 項目                                                                    |
| 項目の内訳                        | e2e 198（14%）+ 部分 4 / unit 632（45%） / その他の自動化（scripts・CI）61 / 手動 520（37%） |
| e2e spec を 1 本も引かない app AT | 73 / 119 ファイル                                                                            |

ショートカットとコマンドパレット、CRUD matrix、Facets、Share と deep link、プロジェクトの rename と zip、
スナップショット、Translate、`ja` への切替、hash reload と back/forward、serve mode に spec が 1 本も無かった。
これらは jsdom が模せない境界を跨ぐ流れなので、unit テストでは代替できない。

## 決定

番号は Issue #3039 の Decisions と揃える（`scripts/lint/e2e-command-coverage.ts` が「decision 7 of #3039」を引く）。

1. **e2e に入れるかの判定条件は 1 つ、「jsdom が模せない境界を跨ぐか」とする。** OPFS / localStorage の永続化、
   URL / hash / history / reload、別ウィンドウ・ダウンロード・アップロード・clipboard、実フォーカスとキー入力、
   wheel / drag のレイアウト、`confirm` / `prompt` が該当する。コンポーネント内の分岐は RTL に残す。
2. **`packages/e2e` の Playwright suite は `data-testid` を使わない。** role / aria-label が無い操作面は app に足す。
   `NodeDetailPanel` と `EdgeDetailPanel` は `role="region"` + `aria-labelledby` で揃える。
   VS Code の webview の `VscodeToolbarExtras` にある `data-testid` は `packages/vscode-e2e` のもので、この決定の外にある。
3. **CI は `workers: 1` のままとする。** `retries: 0` も変えない（ADR-1008）。下の計測で 2 回とも見送った。
4. **serve mode は `E2E_SERVE=1` のときだけ起動する第 2 の `webServer` と `serve` project で検証し、PR gate でも走らせる。**
   Design Doc は nightly で 7 日続けて green になってから昇格を判断するとしていた。nightly が 18 日続けて green に
   なったところで昇格した（#3661）。`e2e.yml` の `paths` に `packages/cli/**` と `packages/skills/**` を足し、
   `e2e-skip.yml` と揃えた。環境変数は CI では両方の workflow が立てるが、残す。Playwright は `--project` に関係なく
   すべての `webServer` を起動するので、変数が無いと手元で app の spec を走らせるだけで CLI を build することになる。
5. **番号の無い AT の spec は、その AT の「関連 Issue」の番号で名付ける**（`at-1783-*`、1801、1827、1958）。
6. **AT-0050 AC-11 は preview 経由の書き込みで dirty にする。** app の挙動は変えない。
7. **`scripts/lint/e2e-command-coverage.ts` が、`useCommand` で登録したコマンドの id か keybinding が spec に現れることを検査する。**
   検査の対象を足したのに e2e が無い変更を CI で止める。対象と限界は「残っていること」に書く。

## 理由

- 判定条件が 1 つなら、e2e に入れるかどうかが場面の数え上げなしに決まり、unit との重複も増えない
- `data-testid` は 2 系統のセレクタを並立させ、a11y を改善しない。足した role と label は RTL でも使える（TPL-1399）
- `role="dialog"` にしないのは、焦点を奪わない inline の側面パネルであり、shadcn `Dialog` と `getByRole("dialog")` が曖昧になるため
- 履歴に従うカバレッジは放置すれば同じ形で戻る。本プログラムが埋めた穴はレビューで漏れたものなので、再発防止はレビュー規約では足りない
- AC-11 の手順どおり Editor タブで編集すると、`EditPane` が `ChatPane` を unmount して patch の提案が消える。preview で edge の方向を
  選ぶと、`.krs` に `@import` が無ければ本文が書き換わるので、Apply の hash 不一致を UI から確かめられる。edge の方向の書き込みが
  `.krs` を触らなくなったら、この経路を選び直す
- スライスは互いに素な AT の集合を持つので、どの順でもマージできるように切った（到達点の一覧は Issue の `## Slice status`）

### serve project の昇格の代償

Playwright は `webServer` をすべて待つので、CLI の build か起動に失敗すると、app だけを変えた PR の `Playwright` も落ちる。
また、`packages/cli` や `packages/skills` だけを変える PR は、これまで stub で済んでいた required check で約 12 分待つ。2026-10-08 以降で
ほかの E2E の path に触れないコミットは、`packages/cli` で 23 本中 7 本、`packages/skills` で 12 本中 2 本だった（squash コミットの概算）。
`serve` は skill の本文を読まないが、`packages/skills` は CLI の workspace 依存なので入れた。これらを受け入れて、`packages/cli` の退行を
次の nightly ではなく、それを起こした PR で止める方を取った。

`scripts/ci/generate-third-party-notices.ts` も CLI の build の一部だが `paths` には入れない。`ci.yml` がその変更で CLI を build と pack test する。

時間の増加は run ごとのばらつきに隠れて見えていない。昇格した PR の run は `Run E2E tests` が 11 分 52 秒（354 テスト、うち `[serve]` 10 本）で、
昇格前の `e2e.yml` は 12 分 32 秒、12 分 12 秒、14 分 38 秒、`serve` を含む nightly は 12 分 26 秒だった。上限は 25 分（ADR-3257）である。

## 却下した案

- **AT の手動項目をすべて e2e に移す**: 多くは視覚判断で、DOM assertion に写すと脆い spec になる。ピクセル比較を持たない ADR-529 と衝突する
- **`data-testid` を必要箇所に足す**: 決定 2 の理由による
- **重い新規 spec を nightly 限定にする**: PR で退行を見逃す範囲が広がり、「どれが重いか」の線引きが増える
- **2 job に shard する**: runner 課金が倍になり、report の集約と `e2e-skip.yml` の job の追加が要る
- **`<ChatPane>` を mount したままにして AC-11 を元の手順で検証する**: app の挙動変更で、AC-11 のためには不要
- **AC-11 を unit で代替して `test.skip` を外す**: 「Apply が UI 上で何も起こさない」という観測面が検証されない
- **再発防止をレビュー規約だけで運用する**: 本プログラムが埋める穴がまさにレビューで漏れたものである
- **Firefox / WebKit の project を足す**: WebKit は OPFS の `createWritable` に対応していない
- **既存 spec の幾何と色の assertion を core の unit テストへ移す**: 操作面を埋めるこのプログラムの範囲の外とした

## `workers: 2` の計測

採用の基準は、全 pass、p95 ≤ 5s（`timeout: 15_000` の 1/3）、最長 spec ≤ 60s、OPFS handle のエラーがゼロ、をどの回も満たすこととした。
手順は `gh workflow run e2e-nightly.yml -f workers=2` を 3 回以上、前の run の完了を待って 1 回ずつ流す。数値は `playwright-flaky-summary.ts` の「Playwright timings」節から取る。

### 1 回目（#3041、2026-10-14〜15）: 見送り

| run                                                                   | workers | 全体時間 | p95（基準 ≤ 5s） | 最遅テスト | 最遅 spec（基準 ≤ 60s） | 5s 超のテスト |
| --------------------------------------------------------------------- | ------- | -------- | ---------------- | ---------- | ----------------------- | ------------- |
| [nightly](https://github.com/kompiro/karasu/actions/runs/38638929182) | 1       | 671s     | 4.5s             | 5.6s       | at-0050 46.7s           | 4             |
| [1](https://github.com/kompiro/karasu/actions/runs/38640858261)       | 2       | 336s     | 4.5s             | 8.1s       | at-0050 42.1s           | 5             |
| [2](https://github.com/kompiro/karasu/actions/runs/38641921644)       | 2       | 407s     | **5.2s**         | 10.7s      | at-0050 58.5s           | 19            |
| [3](https://github.com/kompiro/karasu/actions/runs/38642995496)       | 2       | 333s     | 4.8s             | 7.0s       | at-0050 57.8s           | 8             |
| [4](https://github.com/kompiro/karasu/actions/runs/38715805301)       | 2       | 329s     | 4.3s             | 7.1s       | at-0050 55.3s           | 7             |
| [5](https://github.com/kompiro/karasu/actions/runs/38716849013)       | 2       | 358s     | **5.3s**         | 8.3s       | **at-0050 64.4s**       | 15            |
| [6](https://github.com/kompiro/karasu/actions/runs/38717902036)       | 2       | 387s     | **5.7s**         | 9.3s       | at-0050 55.6s           | 31            |

全体時間は約半分になったが（`workers: 1` は 224 テスト、`workers: 2` は別の commit の 204 テスト）、1 本あたりが伸び、p95 は 6 回中 3 回で基準を超えた。
6 回とも全 pass で、flaky は 0、OPFS handle のエラーは 0 だった。

### 2 回目（#3512、2026-11-01）: 見送り

#3236（at-0050 の `serial` を外した）と #3237（ADR-3237）の後に、305 テストで測り直した。

| run                                                                   | workers | 全体時間 | p95（基準 ≤ 5s） | 最遅テスト | 最遅 spec（基準 ≤ 60s） | 5s 超のテスト |
| --------------------------------------------------------------------- | ------- | -------- | ---------------- | ---------- | ----------------------- | ------------- |
| [nightly](https://github.com/kompiro/karasu/actions/runs/41350528499) | 1       | 588s     | 3.2s             | 4.3s       | at-0050 25.0s           | 0             |
| [1](https://github.com/kompiro/karasu/actions/runs/41317878688)       | 2       | 501s     | 4.5s             | 6.7s       | at-0014 25.9s           | 7             |
| [2](https://github.com/kompiro/karasu/actions/runs/41318655024)       | 2       | 629s     | **5.7s**         | 7.5s       | at-0014 28.9s           | 30            |
| [3](https://github.com/kompiro/karasu/actions/runs/41319657029)       | 2       | 461s     | 4.2s             | 5.8s       | at-0014 25.5s           | 4             |

3 回とも全 pass で、flaky は 0、OPFS handle のエラーは 0 だった。p95 は 2 回目だけが基準を超えた。#3237 のブランチで流した 3 回を合わせると
6 回中 1 回である。全体時間もほとんど縮まない（461〜629s、`workers: 1` は 588s）ので、当面は得るものが小さい。#3237 が 1 本あたりの準備を減らし、
`workers: 1` が 671s（224 テスト）から 588s（305 テスト）に下がったためである。

次に再計測するのは、`workers: 1` の nightly の全体時間が `Run E2E tests` の上限に近づいたときとする。

## 残っていること

- `e2e-command-coverage` は `useCommand` の登録だけを見る。view のタブ、toolbar のトグル、context menu の項目は対象外で、
  レビューに任せる（TPL-3039）。id か keybinding の文字列がどれかの spec に現れれば通り、assert の質は見ない。`EXEMPT` の項目
  （`view.openReference` など）には e2e が無い
- `<ChatPane>` をタブ切替で保持する UX 改善を別 Issue にするかは決めていない
- `at:check-coverage` は spec の path の実在を見るが、`›` の後のテスト名は見ない（#1997 で既知の盲点）
- `/s?s=` の bounce（Pages Functions）、LLM の応答品質、視覚判断は手動のままとする（ADR-529 の三層モデル）
