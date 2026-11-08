---
id: ADR-3601
title: Design a service split のガイドに給与システムの題材を同梱し、Step 1 で切り替えられるようにする
status: accepted
date: 2026-11-08
topic: app-ui
related_to: [ADR-3600, ADR-3598, ADR-3599, ADR-1642, ADR-1646, ADR-3345]
scope:
  packages: [app, i18n, core, docs-site]
assumptions:
  - 'grep: packages/app/src/components/first-run/tour-steps.ts :: TourId = "service-split" \| "understand" \| "evolve" \| "service-split-payroll"'
  - "grep: packages/app/src/components/first-run/tour-steps.ts :: reusesCopy\\?: boolean"
  - "grep: packages/app/src/components/first-run/tour-steps.ts :: switchTo\\?: \\{ tour: TourId; label: PhraseKey \\}"
  - "symbol: packages/app/src/hooks/useProjectActions.ts :: addBundledExample"
  - "grep: packages/app/src/components/first-run/TourPanel.tsx :: event\\.detail <= 1"
  - "grep: packages/core/src/index.ts :: PAYROLL_SPLIT_PROJECT_EN"
  - "grep: packages/docs-site/scripts/lib/examples-manifest.ts :: payroll-split"
---

# ADR-3601: Design a service split のガイドに給与システムの題材を同梱し、Step 1 で切り替えられるようにする

- **日付**: 2026-11-08
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3601](https://github.com/kompiro/karasu/issues/3601)（Phase 2 Epic [#3602](https://github.com/kompiro/karasu/issues/3602)、PRD [#3573](https://github.com/kompiro/karasu/issues/3573) §9・§11「Switch between samples」）。Design Doc PR #3659、実装 PR #3674
  - 関連 ADR: [ADR-3600](3600-first-run-understand-evolve-tours.md)（ガイドをデータとして持つ、Understand の照合）、[ADR-3598](3598-first-run-tour-resume.md)（ツアーの再開）、[ADR-3599](3599-first-run-step-completion.md)（ステップの ✓）、[ADR-1642](1642-en-ja-example-parity.md)（en / ja のサンプルの対応）、[ADR-3345](3345-generated-builtin-examples.md)（同梱サンプルの生成）
  - TPL: [TPL-3113](../test-perspectives/TPL-3113-written-path-resolves-to-its-node.md)、[TPL-1534](../test-perspectives/TPL-1534-cancel-stale-async-effect-results.md)、[TPL-2019](../test-perspectives/TPL-2019-i18n-key-naming-max-4-segments.md)
  - AT: [first-run-experience.md](../acceptance/first-run-experience.md)（AT-AJ〜AT-AQ）
  - コード: `examples/{en,ja}/payroll-split/`、`scripts/examples/gen-builtin-examples.ts`、`packages/core/src/builtins/examples.ts`、`packages/docs-site/scripts/lib/examples-manifest.ts`、`packages/app/src/components/first-run/`（`tour-steps.ts`、`FirstRunExperience.tsx`、`TourPanel.tsx`）、`packages/app/src/hooks/useProjectActions.ts`、`packages/i18n/src/first-run.ts`、`packages/core/src/examples.test.ts`

## 背景

ガイドの題材はどれも架空の EC サイトだった。EC に縁のない訪問者は、受注と請求の話を自分の業務に読み替えながら歩くことになる。
ガイドが伝えたいのはサービス分割の考え方であって EC ではないので、読み替えの負担は本来いらない。

アプリには計測が無く、入れるかどうかも決まっていない（PRD §12）。そのため 2 つ目の題材の価値は実測で確かめられない。Epic は #3601 を、
ほかのガイドができてから価値を判断するものとして最後に置いていた。また ADR-1642 は「アプリは最小シード、網羅はギャラリー」と決めていて、
同梱のサンプルを増やすには理由が要る。

## 決定

**Design a service split のガイドに、勤怠と給与の分割を題材にした `payroll-split` を同梱し、ガイドのパネルの Step 1 で題材を
切り替えられるようにする。** 2 つ目の題材は別の `TourId` として `TOURS` に足し、切り替え先の未編集のコピーがあれば使う。足すことは
kompiro が判断した（2026-11-07、PR #3659 の検討中）。

### サンプル

`examples/{en,ja}/payroll-split/` に `index.krs`、`planned.krs`、`migrating.krs` を置く。役割は service-split と 1 対 1 に対応させ、
大きさも揃える。

| 役割 | service-split | payroll-split |
| --- | --- | --- |
| システム | Commerce Platform | Workforce Platform |
| 1 つのサービス | `CommerceApp` | `WorkforceApp` |
| その中のドメイン | `Ordering`、`Billing` | `Attendance`、`Payroll` |
| 別のワーカー | `InventoryWorker` | `ReminderWorker` |
| 外部（`[external]`） | Payment Gateway | Bank Transfer |
| 共有 DB | `CommerceDB` | `WorkforceDB` |
| 移るテーブル | `Invoices`、`Payments` | `Payslips`、`Transfers` |
| ドメインをまたぐ読み取り | `IssueInvoice` が `Orders` を読む | `CalculatePay` が `Timesheets` を読む |
| 分割後 | `BillingService`、`BillingDB` | `PayrollService`、`PayrollDB` |
| チーム（持ち主のずれ） | `commerce`、`billing`、`platform`（`billing` はドメインだけを持つ） | `workforce`、`payroll`、`platform`（`payroll` はドメインだけを持つ） |

`@karasu-tools/core` は `PAYROLL_SPLIT_PROJECT` と `PAYROLL_SPLIT_PROJECT_EN` を公開する。ギャラリーにも `payroll-split` のページを足す。

### ガイド

- `TourId` の末尾に `"service-split-payroll"` を足す。5 ステップで、シーンの構成は Design と同じで、`reveal` と `drilled` のノードだけ違う。
  見出しは Design と同じ `firstRun.welcome.design.title`。
- 題材の名前を持たない文は `firstRun.step.*` を再利用し、題材の名前を持つ 7 件だけを `firstRun.payroll.*` に足す。
- `TourDefinition` に `example`（en / ja のサンプル）、任意の `reusesCopy`、任意の `switchTo: { tour, label }` を足す。Design の 2 つのガイドだけが
  `switchTo` で互いを指す。ボタンの文は「⇄ Try it with a payroll system instead」「⇄ Try it with an online shop instead」、ja は
  「⇄ 給与システムの題材で試す」「⇄ EC サイトの題材で試す」。

### 切り替え

- `TourPanel` は Step 1 のときだけ切り替えのボタンを出す。押すと切り替え先のガイドを Step 1 から始める。✓ は持ち越さない。
- 切り替えは未編集のコピーを再利用する（ADR-3600 の Understand と同じ照合）。編集したコピーは残し、ガイドは新しいコピーを開く。
  `reusesCopy` を持つのは Understand と payroll のガイドで、Design と Evolve の入口は今のとおり毎回新しいコピーを開く。
- 解決中はパネルのボタンをすべて `aria-disabled` で止める。フォーカスを落とさないため `disabled` は使わない。
- 切り替えのボタンはダブルクリックの 2 回目（`event.detail` が 2 以上）を無視する。戻るボタンがポインタの下に現れるため。
- 前の題材のプロジェクトは残し、プロジェクトのセレクタから戻れる。そこにはパネルは出ない。Welcome は変えず、Design の入口は常に EC から始める。

### どの入口でも、新しい選択を優先する

同梱サンプルの追加（`addBundledExample`）はプロジェクトを作るだけにして移動しない。移動は `enterTour` の 1 か所で、次の確認のあとに行う。

- 始めたときから `runs` が進んでいない（エディタを選ぶ、ガイドを終える、で進む。`endTour` も `runs` を進める）
- 開いているプロジェクトが始めたときのまま

どちらかが崩れたら開始を取りやめ、移動もしない（TPL-1534）。書き込みまで済んだコピーはプロジェクトの一覧に残る。この確認は切り替えに限らず、
Welcome の入口と Restart Guided Tour… を含むすべての開始に当てる。

## 理由

- 足すのは、Phase 2 を続ける判断がすでにあり、PRD §11 が挙げている項目だから。使われているかは数字で分からないので、やめるかどうかは PRD §12 の
  インタビューか kompiro の判断に任せる。
- 題材を勤怠と給与にしたのは、どちらも訪問者が自分の経験で知っていて、給与データが機微なので分ける理由が説明なしで伝わり、EC から十分に遠いため。
- 同梱するのは、ガイドの文がサンプルのノードを名指しするので、同じビルドに入っていないと成り立たないため。ADR-1642 の「最小シード」の例外で、
  同梱するのはガイドが歩くサンプルだけ、網羅はギャラリーの役割のままである。
- 切り替えを Step 1 に置くのは、PRD §5 の主な経路（Welcome から選んですぐ歩き始める）に判断を増やさず、EC を見て「自分の業務とは違う」と思った
  訪問者だけが 1 回押せばよいため。
- 別の `TourId` にするのは、記録・再開・✓・Restart が何も変えずに働くため。
- 未編集のコピーを再利用するのは、往復するたびにプロジェクトが増えないようにするため。照合は中身で行うので、再読み込みをまたいでも増えない。
- 解決中にパネルを止め、`endTour` で `runs` を進めるのは、Welcome と違ってパネルは解決中も押せるため。それまでの `endTour` は `runs` を進めず、
  Restart でプロジェクトを開き直している最中に Skip すると、解決後にガイドが戻ってきた。この不具合は main にあり、この変更で塞いだ。
- 追加と移動を分けたのは、パネルを止めてもプロジェクトのセレクタは押せるため。新しいコピーは追加の途中で移動まで済んでいたので、`runs` の確認だけ
  では訪問者の選択を戻せなかった。Design Doc では確認の関数を追加に渡す形を書いたが、実装では追加が移動しない形のほうが単純で、こちらにした。

## 却下した案

- **データが出るまで見送る**: 読み替えの負担が残る。
- **診療予約と会計（クリニック）**: 医療の用語は en / ja の訳語を選ぶ負担が大きく、実務の正確さも問われる。
- **認証の切り出し（B2B SaaS）**: 認証は横断機能で、ドメインとチームの持ち主のずれという同じ形にならない。
- **ギャラリーから取ってくる**（`fetch-example`、ADR-1646）: docs-site は別にデプロイされるので、ノードを名指しする文と取ってくるサンプルが
  別のビルドになる。ずれるとドリルの ✓ が出ず文が嘘になり、取得に失敗する経路も増える。
- **Welcome で選ぶ**: 何も知らない段階の判断が 1 つ増え、主な経路に効く。
- **コマンドパレットだけ**: 見つけられる訪問者がほとんどいない。
- **1 つのガイドを題材で差し替える**（`Guide` に `sample`）: 記録の形式を変え、再開と Restart も `sample` を受け渡すことになる。文もノードも
  題材ごとに違うので、共有できるのはステップの骨組みだけである。
- **文をテンプレートにする**（`{service}` を差し込む）: ja の助詞や言い回しが題材ごとに変わり、自然な文にならない。
- **題材ごとのプロジェクトをメモリに覚える**: 再読み込みで忘れて増え、編集済みのコピーに戻ると文が合わない。
- **片道だけにする**: 戻る道が無く、PRD §4「Preserve user control」に反する。

## 影響

- Design のガイドの Step 1 にボタンが 1 つ増え、パネルがその分高くなる。全ステップでノードがパネルに隠れないことは e2e で確かめている（AT-AP）。
- 同梱サンプルが en / ja で 3 ファイルずつ増える。gzip で約 3 KB。`@karasu-tools/core` の公開定数が 2 つ増え、ギャラリーに en / ja のページが増える。
  あとで消すと core の破壊的変更になり、公開の URL も消える。
- どの入口でも、解決中にエディタを選ぶ、別のプロジェクトを開く、ガイドを終えると、開始を取りやめて移動しない。
- 古い版のタブが `service-split-payroll` の記録を読むと、未知の値として無効になる（ADR-3600 の規則のまま）。
- Understand と Evolve の題材は増やさない。題材を 3 つ以上にするときは、`switchTo` が切り替え先を 1 つしか持たないので形を変える。
- デモ動画のシナリオ（`scripts/demo-video/scenarios/first-run-tour.mts`）は EC のガイドだけを歩くので変えていない。
