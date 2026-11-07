# Design a service split のガイドに 2 つ目の題材を足す

- **日付**: 2026-11-07
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3601](https://github.com/kompiro/karasu/issues/3601)（Phase 2 Epic [#3602](https://github.com/kompiro/karasu/issues/3602)、PRD [#3573](https://github.com/kompiro/karasu/issues/3573) §9・§11「Switch between samples」）
  - 関連 ADR: [ADR-3600](../adr/3600-first-run-understand-evolve-tours.md)（ガイドをデータとして持つ、Understand の照合）、[ADR-3598](../adr/3598-first-run-tour-resume.md)（ツアーの再開）、[ADR-3599](../adr/3599-first-run-step-completion.md)（ステップの ✓）、[ADR-1642](../adr/1642-en-ja-example-parity.md)（en / ja のサンプルの対応）、[ADR-3345](../adr/3345-generated-builtin-examples.md)（同梱サンプルの生成）
  - 関連 TPL: [TPL-3113](../test-perspectives/TPL-3113-written-path-resolves-to-its-node.md)（書いたパスがそのノードに解決する）、[TPL-1534](../test-perspectives/TPL-1534-cancel-stale-async-effect-results.md)（遅れて届く非同期の結果）、[TPL-2019](../test-perspectives/TPL-2019-i18n-key-naming-max-4-segments.md)（i18n key の段数）
  - コード: `packages/app/src/components/first-run/`（`tour-steps.ts`、`FirstRunExperience.tsx`、`TourPanel.tsx`、`project-matches-example.ts`）、`scripts/examples/gen-builtin-examples.ts`、`examples/{en,ja}/service-split/`、`packages/core/src/examples.test.ts`、`packages/i18n/src/first-run.ts`、`packages/docs-site/scripts/lib/examples-manifest.ts`

## 背景・課題

ガイドの題材はどれも架空の EC サイトである。EC に縁のない訪問者は、受注と請求の話を自分の業務に読み替えながら歩くことになる。
ガイドが伝えたいのはサービス分割の考え方であって EC ではないので、読み替えの負担は本来いらない。

## 現状（インベントリ）

| 面 | 今の形 | 2 つ目の題材を足すときに要るもの |
| --- | --- | --- |
| ガイドの定義 | `TOURS: Record<TourId, TourDefinition>`、`TourId` は 3 つ | `TourId` を 1 つ、ステップの配列を 1 つ |
| 進み具合とプロジェクトの記録 | `tour` と `projectId` を持ち、未知の `tour` は無効（ADR-3600） | 変更なし。新しい `TourId` がそのまま記録され、再開と Restart も働く |
| シーンの型 | `SampleEntry = "index.krs" \| "planned.krs" \| "migrating.krs"` | 同じ 3 ファイルの構成にすれば変更なし |
| 題材の解決 | `resolveProject` が `tour !== "understand"` で service-split を開く | `TourId` からサンプルを引く形に直す |
| サンプル | `examples/{en,ja}/service-split/`、`gen-builtin-examples.ts` に 2 つの定数（`@karasu-tools/core` の公開 API） | 同じ構成で en / ja を足し、定数を 2 つ足す |
| ギャラリー | `examples-coverage.test.ts` が、`examples/` のディレクトリがすべて `examples-manifest.ts` に載っていることを求める | en / ja の題名・説明・キャプションを足す。公開の URL が 1 つ増える |
| 文を縛るテスト | `examples.test.ts` が service-split の気づきを en / ja で確かめる。`tour-steps.test.ts` のノードの縛りは手で並べた `SAMPLES`、呼び名の縛りは Understand と Evolve だけ | 新しいサンプルの縛りを足し、ガイドを足し忘れても落ちる形に直す |
| 文 | `firstRun.step.*`。タイトル、`org.body`、質問の q2〜q4、共有の文は題材に依らない | 題材の名前を持つ `current.body`、`current.notice`、`org.notice`、`target.body`、`target.notice`、`decision.body`、`q1` の 7 件と切り替えの 2 件で、言語あたり 9 件。ギャラリーの文は別 |

`examples/*/hr-tool` は同じ人事の領域だが、最初から勤怠と給与が別サービスで、3 つの状態も持たないので、この用途には使えない。

## 制約・前提

- PRD §5 の主な経路（Welcome から Design a service split を選び、すぐ歩き始める）に判断を増やさない。PRD §4「Preserve user control」、§9「Only the complexity needed for a first understanding」。
- 新しい DSL 構文を足さない（PRD の non-goal）。3 つの状態は既存の `@planned`、`@migration_target`、`@deprecated` で書く。
- 訪問者のプロジェクトを書き換えない。切り替えで前の題材のプロジェクトを消さない。
- アプリには計測が無く、入れるかどうかも決まっていない（PRD §12）。このスライスの価値は実測で確かめられず、手がかりは PRD §12 のインタビューだけである。Epic は #3601 を、ほかのガイドができてから価値を判断するものとして最後に置いている。
- ADR-1642 は「アプリは最小シード、網羅はギャラリー」と決めていて、同梱のサンプルを増やすには理由が要る。

## 検討した選択肢

### 決めること 1：足すかどうか

- **案P: 足す**。読み替えの負担を減らせる。費用は、サンプル一式（en / ja の 3 ファイルずつ）、文、その縛り、ギャラリーのページ、core の公開定数 2 つ。あとで消すと core の破壊的変更になり、公開の URL も消える。
- **案Q: データが出るまで見送る**。Issue を閉じて Phase 2 を終え、Phase 3 の準備に移る。読み替えの負担は残る。

### 決めること 2：題材

Issue の条件は「別の領域で同じ形」、つまり共有されたサービス、持ち主のずれ、計画された分割、途中の状態である。

- **案a: 勤怠と給与（人事基盤）**。勤怠と給与の両方を訪問者が自分の経験で知っている。給与データは機微なので、分ける理由が説明なしで伝わる。EC から十分に遠い。
- **案b: 診療予約と会計（クリニック）**。分ける理由は伝わるが、医療の用語は en / ja の訳語を選ぶ負担が大きく、実務の正確さも問われる。
- **案c: 認証の切り出し（B2B SaaS）**。開発者には身近だが、認証は横断機能で、ドメインとチームの持ち主のずれという同じ形にならない。

### 決めること 3：サンプルを同梱するか

- **案A: 同梱する**。文とサンプルが同じビルドに入り、ずれない。オフラインでも切り替えられる。service-split の en / ja は合わせて 18.7 KB、gzip で 2.9 KB で、同じ大きさを見込む。
- **案B: ギャラリーから取ってくる**（`fetch-example`、ADR-1646）。同梱は増えず ADR-1642 に沿うが、docs-site は別にデプロイされるので、ノードを名指しする文と取ってくるサンプルが別のビルドになる。ずれるとドリルの ✓ が出ず、文が嘘になる。切り替えの途中で取得に失敗する経路も増える。

### 決めること 4：どこで選ばせるか

- **案1: Welcome で選ぶ**（Design のカードに題材の選択を足す、または選択の画面を挟む）。最初から自分に近い題材で歩けるが、何も知らない段階の判断が 1 つ増え、主な経路に効く。
- **案2: ガイドのパネルの Step 1 で切り替える**。主な経路は変わらず、EC を見て「自分の業務とは違う」と思った訪問者だけが 1 回押す。PRD §11 の「Switch between samples」の言葉どおりでもある。
- **案3: コマンドパレットだけ**。見つけられる訪問者がほとんどいない。

### 決めること 5：ステップをどう持つか

- **案X: 別の `TourId` として `TOURS` に足す**。`TourDefinition` に `example`（題材）と `switchTo`（切り替え先）を足すだけで、記録・再開・✓・Restart は何も変えずに働く。5 ステップの配列が 2 つ並ぶ。
- **案Y: 1 つのガイドを題材で差し替える**（`Guide` に `sample` を足す）。Issue の「parameterized by sample」の素直な形だが、記録の形式を変え、再開と Restart も `sample` を受け渡すことになる。文もノードも題材ごとに違うので、共有できるのはステップの骨組みだけである。
- **案Z: 文をテンプレートにする**（`{service}` を差し込む）。ja の助詞や言い回しが題材ごとに変わるので、自然な文にならない。

### 決めること 6：切り替えるたびにコピーが増えないようにするか

Design の入口の「毎回新しいコピー」をそのまま使うと、往復するたびにプロジェクトが増える。

- **案i: Understand と同じ照合を使う**（ADR-3600）。名前と全ファイルの中身が一致するコピーがあれば使い、無ければ新しいコピーを開く。新しい状態を持たず、再読み込みをまたいでも増えない。
- **案ii: 題材ごとのプロジェクトをメモリに覚える**。再読み込みで忘れて増える。編集済みのコピーに戻ると文が合わない。
- **案iii: 片道だけにする**。戻る道が無く、Preserve user control に反する。

## 現時点の方針

**案P・案a・案A・案2・案X・案i を採用する。** 案P は kompiro の判断を仰ぎたい点である。機構の変更はほとんど無いが、上の費用は実際に増え、使われているかを知る手段も無い。それでも足すのは、Phase 2 を続ける判断がすでにあり、PRD §11 が挙げている項目だから。やめるかどうかの判断は PRD §12 のインタビューか kompiro の判断に任せることになり、数字では決まらない。

案A は ADR-1642 の「最小シード」の例外になる。例外とする理由は service-split と同じで、ガイドの文はサンプルのノードを名指しするので、同じビルドに入っていないと成り立たない。同梱するのはガイドが歩くサンプルだけで、網羅はギャラリーの役割のままである。

### サンプル：`payroll-split`

`examples/{en,ja}/payroll-split/` に `index.krs`、`planned.krs`、`migrating.krs` を置く。役割は service-split と 1 対 1 に対応させ、大きさも揃える。

| 役割 | service-split | payroll-split |
| --- | --- | --- |
| システム | Commerce Platform | Workforce Platform |
| 利用者 | Customer、Finance staff | Employee、Payroll staff |
| 1 つのサービス | `CommerceApp` | `WorkforceApp` |
| その中のドメイン | `Ordering`、`Billing` | `Attendance`、`Payroll` |
| ドメインの依存 | `Ordering -> Billing` | `Attendance -> Payroll`（締めた勤怠を渡す） |
| 別のワーカー | `InventoryWorker`（`Inventory`） | `ReminderWorker`（`Reminders`） |
| 外部（`[external]`） | Payment Gateway | Bank Transfer |
| 共有 DB | `CommerceDB`（`Orders`、`Invoices`、`Payments`、`Stock`） | `WorkforceDB`（`Timesheets`、`Payslips`、`Transfers`、`ReminderQueue`） |
| 移るテーブル（migrating で `@deprecated`、planned で新しい DB へ） | `Invoices`、`Payments` | `Payslips`、`Transfers` |
| ドメインをまたぐ読み取り（current と migrating にあり、planned で消える） | `IssueInvoice` が `Orders` を読む | `CalculatePay` が `Timesheets` を読む |
| 分割後 | `BillingService`、`BillingDB` | `PayrollService`、`PayrollDB` |
| チーム | `commerce`、`billing`、`platform` | `workforce`、`payroll`、`platform` |
| 持ち主のずれ | `billing` はドメインだけを持つ | `payroll` はドメインだけを持つ |
| 組織 | `Shop`（Shop Engineering） | `Corporate`（Corporate Engineering） |
| システムの辺 | `Customer` と `FinanceStaff` が `CommerceApp` を呼び、migrating で `FinanceStaff` が移る | `Employee` と `PayrollStaff` が `WorkforceApp` を呼び、migrating で `PayrollStaff` が移る |

表にないものも service-split に揃える。ドメインとテーブルの id は重ねない（`team ... { owns X }` が `owns-target-ambiguous` になる）。

### ガイド

- `TourId` の末尾に `"service-split-payroll"` を足す（ADR-3600 の assumption はこの決定では変わらない）。5 ステップで、シーンの構成は Design と同じ。`reveal` と `drilled` のノードだけ違う。
- 見出しは Design と同じ `firstRun.welcome.design.title`。
- 題材の名前を持たない文（各ステップのタイトル、`org.body`、質問の q2〜q4、共有の文）は `firstRun.step.*` を再利用し、題材の名前を持つ文だけ `firstRun.payroll.*` に足す（TPL-2019 の 4 段に収まる）。

### 切り替え

- `TourDefinition` に `example`（en / ja のサンプルを引く）と、任意の `switchTo: { tour: TourId; label: PhraseKey }` を足す。Design の 2 つのガイドだけが互いを指す。Understand と Evolve は持たない。
- `TourPanel` は **Step 1 のときだけ**、本文の下に切り替えのボタン（アイコン + テキスト、`variant` は既定の ghost）を出す。文は「Try it with a payroll system instead」と「Try it with an online shop instead」、ja は「給与システムの題材で試す」と「EC サイトの題材で試す」を起点に実装の PR で確定する。
- 押すと切り替え先のガイドを Step 1 から始める。`enterTour` の `opening` と `runs` の確認をそのまま通るので、開いているあいだの 2 度押しは無視される。✓ は run が変わるので持ち越さない。
- **切り替えの解決中はパネルの操作を止める。** Welcome と違ってパネルは解決中も押せる。今の `endTour` は `runs` を進めないので、解決中に Skip すると、解決後にガイドが戻ってきて記録も書かれる（Restart が `enterTour` に落ちる経路で再現した。main にある穴で、パネルが押せる経路が増えるとこの切り替えでも踏む）。新しいコピーは解決の途中で移動まで済むので、`runs` の確認だけでは戻せない。解決中はボタンを無効にし（`aria-disabled`、フォーカスを落とさないため）、`endTour` でも `runs` を進める（TPL-1534）。
- 切り替えのプロジェクトは案i で解決する。`resolveProject` は `tour` ごとの分岐をやめ、`TourDefinition.example` と「未編集のコピーを再利用するか」を受け取る。Understand の入口と切り替えは再利用し、Design と Evolve の入口は今のとおり毎回新しいコピーを開く。Restart が `service-split-payroll` のプロジェクトを見つけられないときは、入口が無いガイドなので切り替えと同じ規則で開く。
- 前の題材のプロジェクトは残す。プロジェクトのセレクタから戻れる。そのプロジェクトに戻ってもパネルは出ない（パネルは走っているガイドのプロジェクトに属する。ADR-3600 までの規則のまま）。
- Welcome は変えない。Design の入口は常に EC から始める。Restart Guided Tour… は最後に始めたガイドをやり直すので、切り替えたあとは payroll になる。

### 実装の指針

1. `examples/{en,ja}/payroll-split/` と `gen-builtin-examples.ts`、`pnpm gen:examples`、`examples/README.md`（`.claude/rules/examples-sync.md`）、`examples-manifest.ts`。
2. `first-run.ts` に en / ja の文。`tour-steps.ts` に `TourId`、`example`、`switchTo`、ステップ。
3. `FirstRunExperience.tsx` の `resolveProject` と切り替え、`TourPanel.tsx` のボタン。
4. テスト：
   - core：service-split の気づきの縛りを payroll-split にも足す（en / ja）。形が同じなので、ノード名を引数にして共有できるところは共有する。両方のサンプルで parse の診断が warning も含めて空であることも確かめる（今は error だけで、`owns-target-ambiguous` を通す）
   - unit：`tour-steps.test.ts` の `SAMPLES` を `TOURS[tour].example` から作り、`GUIDE_TEXT_NAMES` を `TourId` で引く形にして、ガイドを足し忘れると落ちるようにする（Design の文の呼び名も縛る）。`switchTo` が互いを指すこと、未編集のコピーの再利用と編集済みでの新しいコピー、Step 1 以外でボタンが出ないこと、Understand と Evolve に出ないこと、切り替えの解決中に Skip が効かず押したあとでガイドが戻らないこと
   - e2e：Step 1 で切り替えて 5 ステップを歩く、往復してもプロジェクトが増えない、再読み込みで切り替え後のガイドの同じステップに戻る、Restart、全ステップでノードがパネルに隠れない（layout の行列は Welcome の入口から始めるので、切り替えを経由する形に広げる。Step 1 のパネルはボタンの分だけ高くなるので、EC のガイドの行もここで確かめる）
5. PRD #3573 の §9・§11 を Revisions で更新する。`docs/tools/app.md`、`app.ja.md`、changeset、AT。
6. 昇格：実装の PR が通ったあと ADR-3601 として昇格し、本 Design Doc を削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響：Design のガイドの Step 1 にボタンが 1 つ増える。既存の記録はそのまま読める。古い版のタブが新しい `tour` の記録を読むと、未知の値として無効になる（ADR-3600 の規則のまま）。
- バンドル：同梱サンプルが en / ja で 3 ファイルずつ増える。service-split と同じ大きさなら gzip で約 3 KB。
- `@karasu-tools/core` の公開定数が 2 つ増え、ギャラリーに en / ja のページが増える。
- デモ動画のシナリオ（`scripts/demo-video/scenarios/first-run-tour.mts`）は EC のガイドだけを歩くので変えない。

## 未解決の問い / 決めないこと

- Understand と Evolve の題材は増やさない。Issue の範囲外で、Understand は Getting Started を使う理由が別にある（初回に増やさない）。
- 題材を 3 つ以上に増やす UI は決めない。`switchTo` は 1 つの切り替え先だけを持つので、増やすときに形を変える。今の 2 つでは一覧を作るほうが大きい。
- 訪問者の領域を推測して題材を出し分けることはしない。
- 計測はこのスライスに含めない。PRD §12 のとおり入れるかどうかは別の判断で、それが決まらないかぎり、切り替えがどれだけ押されるかは分からない。
