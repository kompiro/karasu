---
id: ADR-3600
title: 初回体験の Understand と Evolve を同じ機構のガイドにし、シーンは開いているバッファを読み直さない
status: accepted
date: 2026-11-07
topic: app-ui
related_to: [ADR-3598, ADR-3599]
scope:
  packages: [app, i18n, core]
assumptions:
  - 'grep: packages/app/src/components/first-run/tour-steps.ts :: TourId = "service-split" \| "understand" \| "evolve"'
  - "symbol: packages/app/src/components/first-run/tour-steps.ts :: TOURS"
  - "symbol: packages/app/src/components/first-run/tour-steps.ts :: isTourId"
  - "symbol: packages/app/src/components/first-run/project-matches-example.ts :: isNamedAfterExample"
  - "symbol: packages/app/src/components/first-run/project-matches-example.ts :: projectMatchesExample"
  - "symbol: packages/app/src/components/first-run/tour-project.ts :: readTourProject"
  - "symbol: packages/app/src/components/first-run/tour-project.ts :: writeTourProject"
  - "grep: packages/app/src/components/first-run/use-guided-scene.ts :: if \\(alreadyOpen && !pending\\.resumed\\) keepOpenFile\\(\\)"
  - 'grep: packages/app/src/state/app-reducer.ts :: type: "RESET_FILE_VIEW"'
---

# ADR-3600: 初回体験の Understand と Evolve を同じ機構のガイドにし、シーンは開いているバッファを読み直さない

- **日付**: 2026-11-07
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3600](https://github.com/kompiro/karasu/issues/3600)（Phase 2 Epic [#3602](https://github.com/kompiro/karasu/issues/3602)、PRD [#3573](https://github.com/kompiro/karasu/issues/3573) §5・§11）。Design Doc PR #3624、実装 PR #3652
  - 関連 ADR: [ADR-3598](3598-first-run-tour-resume.md)（ツアーの再開）、[ADR-3599](3599-first-run-step-completion.md)（ステップの ✓）
  - TPL: [TPL-1535](../test-perspectives/TPL-1535-edit-and-watch-same-store.md)、[TPL-1534](../test-perspectives/TPL-1534-cancel-stale-async-effect-results.md)、[TPL-1530](../test-perspectives/TPL-1530-persistent-store-init-and-mutation-resilience.md)、[TPL-3113](../test-perspectives/TPL-3113-written-path-resolves-to-its-node.md)
  - AT: [first-run-experience.md](../acceptance/first-run-experience.md)（AT-Z〜AT-AI）
  - 後続: [#3626](https://github.com/kompiro/karasu/issues/3626)（ファイルツリーで開いているファイルをクリックしたときの読み直し）、[#3601](https://github.com/kompiro/karasu/issues/3601)（別のサンプルでの Design）
  - コード: `packages/app/src/components/first-run/`（`tour-steps.ts`、`FirstRunExperience.tsx`、`project-matches-example.ts`、`use-guided-scene.ts`、`tour-progress.ts`、`tour-project.ts`、`tour-resume.ts`）、`packages/app/src/hooks/useFileSelection.ts`、`packages/app/src/state/app-reducer.ts`、`packages/i18n/src/first-run.ts`、`packages/core/src/examples.test.ts`

## 背景

Welcome の 3 つの入口のうち、ガイドがあるのは Design a service split だけだった。Understand an existing system は Getting Started を
開くだけ、Track architecture evolution は移行途中の差分を 1 画面出すだけで終わる。どちらの入口を選んだ訪問者も次に何を見ればよいかを
知らされず、PRD の 3 つの価値のうち Understand と Evolve を体験できなかった。

ツアーの部品は Design 専用の形で、進み具合の記録の `tour` は `service-split` 以外を捨て、ツアーのプロジェクトの記録は id の文字列だけ
だった。

同じファイルのシーンへ進む経路には、編集を失う不具合もあった。`useGuidedScene` は開いているファイルも `selectFile` で読み直す。
保存がコミットされる前に Next を押すと、バッファが古い内容に戻り、完了した保存は `isOwnWrite` で自分の書き込みとして無視され、次の
打鍵が古い内容を元にディスクを上書きする。Understand は全ステップが、Evolve は Step 1→2 が同じファイルなので、この経路を通る回数が
増える。Design の Step 1→2 と 4→5 にも同じ穴があった。

## 決定

**3 つのガイドを `TOURS` のデータとして 1 つの機構で動かす。シーンのファイルがすでに開いていれば、ディスクから読み直さず開いている
バッファを使う。** 再開（ADR-3598）と ✓（ADR-3599）はどのガイドでも同じように働く。

### ガイドの中身

Understand と Evolve は 4 ステップで、どちらも Design と同じく最後に共有へ着く。Evolve の入口がそれまで出していた差分は最初のステップに
残した。

**Understand an existing system**（Getting Started の `index.krs`）

| # | シーン | 気づき | ✓ の条件 |
| --- | --- | --- | --- |
| 1 | system、`ECommerce` を表示 | 商品カタログと受注は互いに依存している | `ECommerce` へのドリル |
| 2 | deploy | 動かしているのは 2 サービスだけで、決済と在庫は外部 | なし |
| 3 | org | 通知チームは何も持たない。System ビューの通知サービスを見ると、持っているのはコマースチーム | なし |
| 4 | system | 見つけたことを共有する | Share か Export SVG |

**Track architecture evolution**（service-split の `migrating.krs`）

| # | シーン | 気づき | ✓ の条件 |
| --- | --- | --- | --- |
| 1 | `migrating.krs` と `index.krs` の差分、`BillingService` を表示 | 請求サービスができ、請求ドメインがコマースアプリケーションから出た | なし |
| 2 | `migrating.krs`、`BillingDB` を表示 | 請求のテーブルは廃止予定で、移る先の DB はまだ計画だけ | `CommerceDB` へのドリル |
| 3 | `planned.krs` と `migrating.krs` の差分、`BillingDB` を表示 | 残っているのはデータの移動 | なし |
| 4 | `migrating.krs` | 進み具合を共有する | Share か Export SVG |

### データの形

- `tour-steps.ts` に `TourId`、`TourDefinition { heading, steps }`、`TOURS` を置く。見出しは `firstRun.welcome.*.title` を指す。
  `Guide` は `kind` をやめて `tour` を持つ。`EVOLVE_SCENE` と `reapplyOnReturn` はなくなり、Evolve も離れて戻ればシーンを当て直す。
- `isTourId` は `Object.hasOwn` で判定し、storage から読んだ値が `TOURS` のプロトタイプのキーに当たっても無効にする。
- 進み具合の記録は `{ v: 1, tour, projectId, step }` のまま `tour` の値を増やす。`tour` が未知の値、またはステップがそのガイドの範囲外なら
  無効にする。
- ツアーのプロジェクトの記録は `{ tour, projectId }` の JSON にする。`{` で始まらない値は以前の形式で、`service-split` のプロジェクト id
  として読む。

### 入口とプロジェクト

- どの入口も `startTour` を通り、自分の記録で置き換える。ADR-3598 の「Evolve で消す」「Understand では消さない」は、これに置き換わる。
  Open the editor は今のとおり記録に触れない。
- **Design と Evolve** は毎回 service-split の新しいコピーを開く。Evolve が Design のコピーを流用すると、訪問者が Design のコピーで編集して
  いた場合に文が合わなくなる。
- **Understand** は、テンプレートと同じ名前か、その番号付きのコピー（`getting-started (2)`）のうち、テンプレートの全ファイルの中身が
  一致するものを使う。開いているものを優先する。読めないファイルがあれば一致しないものとして扱い、一致するものが無ければ新しいコピーを
  開く。読み取りのあいだに訪問者が別の選択をしたら、`runs` の確認で捨てる（TPL-1534）。開いているプロジェクトがそれなら移動しない
  （移動すると開いているファイルが閉じる）。
- **Restart Guided Tour…** は最後に始めたガイドを、そのプロジェクトでやり直す。プロジェクトが消えていれば、そのガイドの入口と同じ規則で
  開き直す。訪問者が編集したプロジェクトもそのまま使う。

### 開いているファイルのシーン

`useFileSelection` に `keepOpenFile` を足す。進行中の読み取りを追い越し、`RESET_FILE_VIEW` で view だけを初期化する。範囲は
`SELECT_FILE` の `VIEW_RESET` と同じで、`fileContent` に触れない。前のシーンの遅い読み取りを落とす働き（TPL-1534）はこれで保たれる。

`useGuidedScene` はシーンのファイルが開いていれば `selectFile` を呼ばず `keepOpenFile` を呼ぶ。起動時に再開したステップは、hash の復元が
進めている読み取りを追い越さないように呼ばない。

### 文をサンプルに縛る

ガイドの文がサンプルについて述べることは、`packages/core/src/examples.test.ts` が en / ja で確かめる。`tour-steps.test.ts` は、全ガイドの
`drilled.node` と `reveal` が en / ja のサンプルに解決すること（TPL-3113）と、文がノードを図と同じ名前で呼ぶことを確かめる。

## 理由

- 別々のコンポーネントにすると、再開・✓・Restart を 3 つ持つことになり、振る舞いがずれる。データとして足せば #3601 も同じ形に乗る。
- Understand を中身で照合するのは、初回に Getting Started を増やさず、編集後も文を正しく保つため。同じ名前だけで照合すると、編集した
  訪問者が Understand を選ぶたびに `getting-started (2)` が新しく増える。実装のレビューでこの動きを確かめ、番号付きのコピーも照合の対象に
  した。開いているものを優先するのは、同じ中身のコピーが複数あるときに、見ているプロジェクトから理由なく移動させないため。
- Restart を最後に始めたガイドにするのは、走っているガイドは必ず最後に始めたものなので、Understand の途中で打って Design に飛ぶことが
  ないため。
- 読み直しをやめるのは、ガイドが訪問者の入力を失わせないため。窓は打鍵からコミットまでの間だけだが、失うのは入力そのものである。
  Design Doc の段階では、ファイルツリーのクリックと同じだから問題ないと一度判断したが、書き込みの遅い fs で再現して誤りが分かった。

## 却下した案

- **Understand と Evolve を別のコンポーネントにする**: 上のとおり。
- **Understand を名前だけで探して使う**: 編集後は文が嘘になり、ドリルを頼んだノードが無ければ ✓ も出ない。
- **Understand は常に新しいコピーを開く**: 初回から Getting Started が 2 つ並ぶ。
- **Restart は Design のまま**: ほかのガイドの途中で打つと別のガイドになる。
- **Restart で選択肢を出す**: Show Welcome… と同じことになる。
- **保存の完了を待ってからシーンを当てる**: 順番待ちは `AppShell` の下の `useSerializedFileWrite` にあり、その上の `ProjectModeApp` から
  待つには配線が増える。別のファイルを読むシーンでは、保存先は打鍵の時点のパスなので編集は失われない。

## 影響

- Welcome の 2 つの入口の振る舞いが変わる。localStorage の既存の記録はどちらもそのまま読める。
- Evolve を選んだ訪問者は、これまでと同じ差分から始まり、パネルが増える。Skip すれば差分も閉じる。
- 編集を失う不具合は、公開中の Design のガイドでも塞がる。
- 別のファイルへ移って、保存のコミット前に元のファイルへ戻る（Next を 2 回、書き込みより速く押す）場合は読み直しが残る。
- ファイルツリーで開いているファイルをクリックしても同じ読み直しが起きる。ガイドに固有の話ではないので #3626 に分けた。
- 差分のステップで Next の直後にガイドを終えると、遅れて届いた読み取りで差分が残ることがある。窓は読み取り 1 回分で、Exit diff で閉じられる。
