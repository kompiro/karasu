# 初回体験の Understand と Evolve にもガイドツアーを付ける

- **日付**: 2026-11-06
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3600](https://github.com/kompiro/karasu/issues/3600)（Phase 2 Epic [#3602](https://github.com/kompiro/karasu/issues/3602)、PRD [#3573](https://github.com/kompiro/karasu/issues/3573) §5・§11「fuller Understand / Evolve scenarios」）
  - 関連 ADR: [ADR-3598](../adr/3598-first-run-tour-resume.md)（ツアーの再開）、[ADR-3599](../adr/3599-first-run-step-completion.md)（ステップの ✓）
  - 関連 TPL: [TPL-3113](../test-perspectives/TPL-3113-written-path-resolves-to-its-node.md)（書いたパスがそのノードに解決する）、[TPL-1534](../test-perspectives/TPL-1534-cancel-stale-async-effect-results.md)（遅れて届く非同期の結果）、[TPL-1530](../test-perspectives/TPL-1530-persistent-store-init-and-mutation-resilience.md)（永続ストアの読み書き）、[TPL-1535](../test-perspectives/TPL-1535-edit-and-watch-same-store.md)（自分で書き込みつつ監視するストア）
  - コード: `packages/app/src/components/first-run/`（`tour-steps.ts`、`FirstRunExperience.tsx`、`TourPanel.tsx`、`WelcomeDialog.tsx`、`tour-progress.ts`、`tour-project.ts`、`tour-resume.ts`、`use-guided-scene.ts`）、`packages/core/src/examples.test.ts`、`packages/i18n/src/first-run.ts`

## 背景・課題

Welcome の 3 つの入口のうち、ガイドがあるのは Design a service split だけで、Understand an existing system は Getting Started を
開くだけ、Track architecture evolution は移行途中の差分を 1 画面出すだけで終わる。どちらの入口を選んだ訪問者も、次に何を見れば
よいかを知らされず、PRD の 3 つの価値のうち Understand と Evolve を体験できない。

## 現状（インベントリ）

| 入口 | 開くもの | ガイド | コード上の形 |
| --- | --- | --- | --- |
| Design a service split | service-split の新しいコピー | 5 ステップ | `Guide { kind: "tour" }`、`SERVICE_SPLIT_TOUR` |
| Understand an existing system | 既存の Getting Started（名前で探す。無ければ新しいコピー） | なし | `choose` の分岐 |
| Track architecture evolution | service-split の新しいコピー | 差分を 1 回当てるだけ | `Guide { kind: "scene" }`、`EVOLVE_SCENE`、`reapplyOnReturn: false` |

ツアーの部品は Design 専用の形になっている。

- `FirstRunExperience` と `tour-resume.ts`、`tour-progress.ts` が `SERVICE_SPLIT_TOUR` を直接読む。
- 進み具合の記録は `tour: "service-split"` を持つが、読み手は他の値を捨てる（ADR-3598 が #3600 のために残した欄）。
- ツアーのプロジェクトの記録（`karasu-first-run-tour-project`）は id の文字列だけで、どのガイドのものかを持たない。
- パネルの見出し（`firstRun.tour.heading`）は固定で「サービス分割を設計する」。
- Welcome の `badge` は Design だけが持つ。

サンプルについて、ガイドの文が頼れる事実は次のとおり（en / ja とも確認した）。

- **Getting Started**: `ECommerce` の中で `Catalog` と `Order` が互いに依存している。4 サービスのうち `Payment` と `Inventory` は
  `[external]` で、deploy には `ECommerce` と `Notification` だけが現れる。`notification` チームは `owns` を持たず、`Notification`
  サービスは `commerce` チームが持っている。
- **service-split**: `migrating.krs` の `BillingService` は `@migration_target(from: CommerceApp)`、`BillingDB` は `@planned`、
  `CommerceDB` の `Invoices` と `Payments` は `@deprecated`。`planned.krs` ではこの 2 つのテーブルが `BillingDB` に移り、
  `@planned` も外れている。

## 制約・前提

- PRD §4「Preserve user control」：ガイドは操作を妨げない。✓ は示すだけで、進むのは Next（ADR-3599）。
- 訪問者のプロジェクトの内容を書き換えない。Welcome の脚注（既存のプロジェクトはそのまま残る）を守る。打ったばかりの編集も
  失わない（下の「シーンのファイルがすでに開いているとき」）。
- ガイドの文がサンプルについて述べることは、core のテストで縛る（Phase 1 と同じ）。ステップが名指すノードは、app のテストで
  en / ja のサンプルと照合する（TPL-3113）。
- 同時に走るガイドは 1 つ。進み具合の記録も 1 つ。
- 再開（ADR-3598）と ✓（ADR-3599）は、どのガイドでも同じように働く。
- Evolve の入口が今出している画面（`migrating.krs` と `index.krs` の差分）は、Evolve の最初のステップとして残す。

## 検討した選択肢

### 決めること 1：3 つのガイドをどう持つか

- **案A: 1 つの機構にデータとして足す**。`TOURS: Record<TourId, TourDefinition>` を持ち、`Guide` は `kind: "scene"` をやめて `tour` を
  持つ。ツアーを増やす #3601 もこの形に乗る。
- **案B: Understand と Evolve を別のコンポーネントにする**。再開・✓・Restart を 3 つ持つことになり、振る舞いがずれる。

### 決めること 2：Understand の舞台をどのプロジェクトにするか

Getting Started は訪問者が編集できる。Show Welcome… から入り直した訪問者の Getting Started は、ガイドの文と違っているかもしれず、
同じ名前の別のプロジェクトかもしれない。文が嘘になり、ドリルを頼んだノードが無ければ ✓ も出ない。

- **案1: 今のまま名前で探して使う**。初回は問題ないが、編集後は上のとおり。
- **案2: 常に新しいコピーを開く**。文は常に正しいが、初回から Getting Started が 2 つ並ぶ。
- **案3: 名前で探し、中身がサンプルと同じならそれを使い、違えば新しいコピーを開く**。初回は増えず、編集後も文が正しい。ファイルの
  読み取りが 1 回増える。

### 決めること 3：Restart Guided Tour… は何をやり直すか

- **案X: 最後に始めたガイド**。走っているガイドは必ず最後に始めたものなので、Understand の途中で打って Design に飛ぶことがない。
- **案Y: Design のまま**。ほかのガイドの途中で打つと別のガイドになる。
- **案Z: 選択肢を出す**。Show Welcome… と同じことになる。

## 現時点の方針

**案A・案3・案X を採用する。** Understand と Evolve は 4 ステップで、どちらも Design と同じく最後に共有へ着く（PRD §5 の流れ）。

### ステップ

**Understand an existing system**（Getting Started の `index.krs`）

| # | シーン | 文の要旨 | 気づき | ✓ の条件 |
| --- | --- | --- | --- | --- |
| 1 | system、`ECommerce` を表示 | 1 枚でシステム全体が見える。EC サイトをクリックして中を見る | 商品カタログと受注は互いに依存している | `ECommerce` へのドリル |
| 2 | deploy | 同じシステムを、どう動いているかで見る | 動かしているのは 2 サービスだけで、決済と在庫は外部 | なし |
| 3 | org | 同じシステムを、誰が持っているかで見る | 通知チームは何も持たない。System ビューの通知サービスを見ると、持っているのはコマースチーム | なし |
| 4 | system | 見つけたことを共有する（`firstRun.step.share.title` / `body` を再利用） | | Share か Export SVG |

**Track architecture evolution**（service-split の `migrating.krs`）

| # | シーン | 文の要旨 | 気づき | ✓ の条件 |
| --- | --- | --- | --- | --- |
| 1 | `migrating.krs` と `index.krs` の差分、`BillingService` を表示 | 移行中の姿を今日のシステムと比べる。追加は緑、削除は赤 | 請求サービスができ、請求ドメインがコマースアプリケーションから出た | なし |
| 2 | `migrating.krs`、`BillingDB` を表示 | モデル自体が移行の状態を語る（移行先・計画中・廃止予定の印）。コマース DB を開いて確かめる | 請求のテーブルは廃止予定で、移る先の DB はまだ計画だけ | `CommerceDB` へのドリル |
| 3 | `planned.krs` と `migrating.krs` の差分、`BillingDB` を表示 | 目標と今を比べる。差分が残りの仕事 | 残っているのはデータの移動 | なし |
| 4 | `migrating.krs` | 進み具合を共有する（`share` の `title` / `body` を再利用） | | Share か Export SVG |

文の確定は実装の PR で行う。最後のステップの `done` は、ガイドごとに別の文を持つ。

### 確定させる規則

- **データの形**：`tour-steps.ts` に `TourId = "service-split" | "understand" | "evolve"` と
  `TourDefinition { heading: PhraseKey; steps: readonly TourStep[] }`、`TOURS` を置く。見出しは `firstRun.welcome.*.title` を指し、
  `firstRun.tour.heading` は消す。`isStepDone` と `TourStep` は変えない。
- **`Guide`**：`kind` をやめ、`{ tour, projectId, root, step, run, resumed? }` にする。`EVOLVE_SCENE`、`reapplyOnReturn`、
  `useGuidedScene` の `reapplyOnReturn` の分岐はなくなる（Evolve も離れて戻ればシーンを当て直す）。シーンの key は
  `tour:${run}:${step}` のままで、`run` が開始ごとに変わるので ✓ は混ざらない。
- **シーンのファイルがすでに開いているとき**：ディスクから読み直さず、開いているバッファをそのまま使う。今の `useGuidedScene` は
  開いているファイルも `selectFile` で読み直す。保存がコミットされる前に Next を押すと、バッファが古い内容に戻り、完了した保存は
  `isOwnWrite` で自分の書き込みとして無視され、次の打鍵が古い内容を元にディスクを上書きする。`useFileSelection` と
  `useEditorDocument` を書き込みの遅い fs でつないだ使い捨てのテストで再現した（`base` に `X` を打って Next、続けて `Y` を打つと、
  ディスクは `base+Y` になる）。窓は打鍵からコミットまでの間だけだが、失うのは訪問者の入力で、Understand は全ステップが、Evolve は
  Step 1→2 が同じファイルなのでこの経路を通る回数が増える。Design の Step 1→2 と 4→5 にある同じ穴も、ここで一緒に塞がる。
  `useFileSelection` に、進行中の読み取りを追い越したうえで view だけを初期化する入口（`SELECT_FILE` の `VIEW_RESET` と同じ範囲で、
  `fileContent` に触れない）を足し、シーンはファイルが開いていればそれを使う。前のシーンの遅い読み取りを落とす働き（TPL-1534）は
  これで保たれる。
- **進み具合の記録**：`{ v: 1, tour, projectId, step }` のまま `tour` の値を増やす。既存の `service-split` の記録はそのまま読める。
  `tour` が未知の値、またはステップがそのガイドの範囲外なら無効。`tourStepHash` と `TourResume` は `tour` を受け渡す。
- **始めたとき**：どの入口も `startTour(tour, project)` を通り、記録を書く。別のガイドの記録は上書きする。ADR-3598 の「Evolve で
  消す」「Understand では消さない」は、「どの入口も自分の記録で置き換える」になる。Open the editor は今のとおり記録に触れない。
- **ツアーのプロジェクトの記録**：`{ tour, projectId }` の JSON にする。`{` で始まらない値は既存の形式で、`service-split` の
  プロジェクト id として読む。これで Restart は最後に始めたガイドを、そのプロジェクトでやり直す。プロジェクトが消えていれば、
  そのガイドの入口と同じ規則で開き直す。
- **Understand のプロジェクト**：テンプレートと同じ名前か、その番号付きのコピー（`getting-started (2)`）のうち、テンプレートの全ファイルの中身が一致するものを、開いているものを優先して使う。
  読めないファイルがあれば一致しないものとして扱う。一致するものが無ければ新しいコピーを開く。読み取りのあいだにほかのガイドが
  始まったら、`runs` の確認で捨てる（TPL-1534）。開いているプロジェクトがそれなら移動しない（移動すると開いているファイルが
  閉じる）。
- **Evolve のプロジェクト**：今のとおり、毎回 service-split の新しいコピー。Design のコピーを流用すると、訪問者が Design のコピーで
  編集していた場合に文が合わなくなる。
- **Welcome**：Understand と Evolve にもバッジ（`Guided · 3 min`）を付け、説明の文を「ガイド付きで見る」方向に直す。
  `WelcomeDialog` の「ガイドは Design だけ」のコメントを直す。
- **パネル**：`TourPanel` は `heading` を受け取る。ステップ数の表示は既存の `total` で足りる。
- **サンプルの縛り**：`packages/core/src/examples.test.ts` に、上の表の気づきを en / ja で足す。`tour-steps.test.ts` の縛りは全ガイドの
  `drilled.node` と `reveal` に広げる。

### 実装の指針

1. `tour-steps.ts` に `TOURS` と 2 つのガイド、`first-run.ts` に en / ja の文。
2. `tour-progress.ts`、`tour-project.ts`、`tour-resume.ts` を `tour` 対応に。
3. `FirstRunExperience.tsx` の `Guide`、`startTour`、`choose`、`restartTour`。`ProjectModeApp` から「テンプレートと中身が同じか」を
   読む手段を渡す。
4. `WelcomeDialog`、`TourPanel`、`use-guided-scene.ts`、`useFileSelection.ts`。TPL-1535 のチェックリストに「開いているファイルを読み直す経路が、コミット前の保存を巻き戻さないか」を足す。
5. テスト：
   - core：Getting Started と service-split の気づきの縛り（en / ja）
   - unit：記録の読み書き（未知の `tour`、範囲外のステップ、既存の形式のプロジェクト記録）、再開の判定、Understand のプロジェクトの選択（一致・不一致・読めない・無い）、書き込みの遅い fs で打鍵の直後に同じファイルのシーンへ進んでも編集が残る、前のシーンの遅い読み取りがあとから届かない
   - e2e：2 つのガイドを Next で歩く、Evolve の差分が Step 3 で読み替わり Skip で消える、再読み込みで同じガイドの同じステップに戻る、✓、Restart が最後に始めたガイドをやり直す、編集した Getting Started では新しいコピーが開く、全ステップで表示するノードがパネルに隠れない（en / ja）
6. PRD #3573 の §5 の「他の入口はガイドなし」を Revisions で更新する。`docs/tools/app.md`、`app.ja.md`、changeset、AT。
7. ADR 昇格：実装の PR が通ったあと ADR-3600 として昇格し、本 Design Doc を削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: Welcome の 2 つの入口の振る舞いが変わる。localStorage の既存の記録はどちらもそのまま読める。
- Evolve を選んだ訪問者は、これまでと同じ差分から始まり、パネルが増える。Skip すれば差分も閉じる。
- ドキュメント更新: `docs/tools/app.md` の「First visit」節と `app.ja.md` の対応する節。
- デモ動画のシナリオ（`scripts/demo-video/scenarios/first-run-tour.mts`）は Design のガイドだけを歩くので変えない。

## 未解決の問い / 決めないこと

- Restart で戻るプロジェクトを訪問者が編集していた場合は、#3597 のとおりそのまま使う。文が合わないことは受け入れる（自分で編集した
  コピーを、自分でやり直している）。
- 保存の完了を待つ仕組みは足さない。別のファイルを読むシーンでは、保存先は打鍵の時点のパスなので編集は失われない。Understand の
  プロジェクトの照合が保存前の内容を読んでも、編集を失うわけではなく、編集済みのプロジェクトを使って文が合わなくなるだけで、
  Welcome を開いて選ぶあいだに保存は終わる。順番待ちは `AppShell` の下の `useSerializedFileWrite` にあり、その上の `ProjectModeApp`
  から待つには配線が増える。
- 別のファイルへ移って、保存のコミット前に元のファイルへ戻る（Next を 2 回、書き込みより速く押す）場合は読み直しが残る。
- ファイルツリーで開いているファイルをクリックしても同じ読み直しが起きる。ガイドに固有の話ではないので [#3626](https://github.com/kompiro/karasu/issues/3626) に分けた。
- 別のサンプルでの Design（#3601）は本 Doc に含めない。`TourDefinition` の形は変えずに足せる見込みで、そちらで決める。
- 各ステップの所要時間の表示は `Guided · 3 min` の概算だけにする。
