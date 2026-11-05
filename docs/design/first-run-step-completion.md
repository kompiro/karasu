# 初回体験のツアーで、ステップが求めた操作をしたことを示す

- **日付**: 2026-11-03
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3599](https://github.com/kompiro/karasu/issues/3599)（Phase 2 Epic [#3602](https://github.com/kompiro/karasu/issues/3602)、PRD [#3573](https://github.com/kompiro/karasu/issues/3573) §4「Preserve user control」、§8・§11「ガイドの操作完了の自動検知」）
  - 関連 TPL: [TPL-1534](../test-perspectives/TPL-1534-cancel-stale-async-effect-results.md)（遅れて届く非同期の結果）、[TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)（派生状態の陳腐化）、[TPL-3113](../test-perspectives/TPL-3113-written-path-resolves-to-its-node.md)（書いたパスがそのノードに解決する）
  - コード: `packages/app/src/components/first-run/tour-steps.ts`、`TourPanel.tsx`、`FirstRunExperience.tsx`、`use-guided-scene.ts`、`packages/app/src/hooks/useOrgDisplayMode.ts`（チーム依存）、`packages/app/src/hooks/useShareDialog.ts`（Share）、`packages/app/src/components/PreviewToolbar.tsx`（SVG 書き出し）

## 背景・課題

ステップの文は操作を頼む（Step 1「コマースアプリケーションをクリックして中のドメインを見る」、Step 2「チーム依存を見る」、
Step 5「共有する」）。Phase 1 は Next でしか進まず、頼んだ操作を訪問者がしたかどうかをパネルが知らない。
した人には「それでよい」と、していない人には「何をすればよいか」が伝わらない。

## 現状（インベントリ）

| ステップ | 文が頼む操作 | その状態がある場所 |
| --- | --- | --- |
| 1. 現在のシステム | コマースアプリケーションをクリックしてドリルダウン | reducer の `viewPath`（system ビュー。ドリルしたノードまでの完全なパス） |
| 2. 組織の境界 | Org ビューでチーム依存を見る | `useOrgDisplayMode` の表示モード（`toggleTeamDependencies`）。AppShell の `useState` で、ファイルやビューを変えても残る |
| 3. 計画 | 差分を見る（操作は頼まない） | — |
| 4. 移行途中 | 問いを話し合う（操作は頼まない） | — |
| 5. 共有 | 共有リンクを作る / SVG を書き出す | `useShareDialog` の `shareOpen`（PreviewColumn の中）、ツールバーの Export SVG（`onExport`） |

`FirstRunExperience` は `ProjectModeApp` に置かれ、AppShell と並ぶ。reducer の状態は読めるが、チーム依存の表示と
Share ダイアログは各コンポーネントの state にある。`TourStep.done` という名前はすでに最終ステップの締めの文（`PhraseKey`）に使っている。

## 制約・前提

- PRD §4「Preserve user control」：ツアーは訪問者の操作を妨げない。
- PRD §8 は「ユーザーの操作完了を検知して次へ進める案内は Phase 2」と書く。本 Doc は**検知して示す**までにし、進むのは
  訪問者に任せる。PRD の Revisions にこの読み替えを 1 行足す。
- 操作を頼まないステップ（3・4）は、完了を示さない。
- 条件が名指すノード id はサンプルにあることをテストで縛る。
- 判定のために、ツアー以外の機能の振る舞いを変えない。

## 検討した選択肢

### 決めること 1：示すだけか、自動で進めるか

- **案A: 示すだけ（✓ と短い文）**。進むのは訪問者が Next を押したとき。訪問者が操作の結果を見続けられる（Step 1 でドリルしたあと、中を見ている途中で次へ飛ばされない）。1 クリック余計にかかる。
- **案B: 自動で次へ進める**。操作の直後に画面（ファイル・ビュー・差分）が切り替わり、操作の結果を見る前に次のシーンになる。「Preserve user control」に反する。

### 決めること 2：ツアーの外の状態をどう知るか

- **案1: reducer の状態だけを見る**。Step 2・5 が判定できない。
- **案2: 各機能が「いまの状態」を小さな store に出す**。チーム依存を表示しているか、のように**値**として出す。最初から満たしている場合も正しく読める。
- **案3: 各機能が「出来事」を小さな store に書く**。Share を開いた・SVG を書き出した、のように一度きりのことに向く。
- **案4: DOM を観察する**（aria-pressed や dialog の出現）。表示の文言・構造の変更で黙って壊れる。

## 現時点の方針

**案A を採用し、判定は状態で読めるものは状態（reducer・案2）、一度きりのものは出来事（案3）で読む。**
自動で進めると操作の結果を見る前に画面が変わる。チーム依存は表示モードが残るので、出来事だけで読むと「すでに表示している」ときに ✓ が出ない。

### 確定させる規則

- **条件はデータで書く**。`TourStep.completion?: StepCompletion`（`done` とは別の名前）。
  ```ts
  type StepCompletion =
    | { kind: "drilled"; view: "system"; node: string }      // viewPath にそのノードを含む
    | { kind: "showing"; what: "team-dependencies" }          // org ビューでチーム依存を表示している
    | { kind: "event"; any: ("share-opened" | "svg-exported")[] };
  ```
  1 つの評価関数が `{ viewPath, activeView, showing, events, sinceSeq, completed }` から判定する（`sinceSeq` より後の出来事だけを数える）。
  `completed` はツアーが持つ「完了したシーンの key の集合」で、評価関数は「すでに完了している」か「いま条件を満たしている」なら ✓ を返す。
  `showing` はいまの表示なので、Step 2 で表示を閉じても `completed` が ✓ を保つ。データなので、app のテストがサンプル
  （`SERVICE_SPLIT_PROJECT` / `_EN`）を parse し、`drilled.node` が `buildNodePathIndex` にあることを確かめられる（TPL-3113。
  `viewPath` はドリルしたノードまでの完全なパスなので、条件は「含む」で書く）。
- 条件：Step 1 は `{ kind: "drilled", view: "system", node: "CommerceApp" }`、Step 2 は `{ kind: "showing", what: "team-dependencies" }`、
  Step 5 は `{ kind: "event", any: ["share-opened", "svg-exported"] }`。Step 3・4 は持たない。
- **評価はステップのシーンが着いてから**（TPL-1534）。「着いた key」は `useGuidedScene` の `appliedKey`（`selectFile` の前に立てる、
  同じシーンを 2 度当てないための印）とは別に持つ。`selectFile` が `landed` を返し、`currentKey` / `currentRoot` の確認を通ってから
  立て、`useGuidedScene` の戻り値（state）としてツアーに渡す。ツアーはその key がいまのステップの key（`tour:${run}:${step}`）と
  一致するまで判定しない。Back や Restart の直後、前のシーンの `viewPath` で ✓ が出ない。
- **数え直しはシーンの key で行う**（ステップの番号ではない）。同じ Step 1 でも Restart で key が変われば数え直す。
- **出来事は seq つきの記録**にし、共有の Set を誰かが空にする形にしない（ほかの読み手が来ても壊れない）。書く側（Share、Export SVG）は
  プロジェクトを知らないので、**数える範囲は読む側が決める**：ツアーは、ツアーのプロジェクトを開いていて、着いたシーンの key が
  いまのステップの key と一致するあいだだけ判定する。プロジェクトを離れると着いた key を忘れ（`useGuidedScene` の `appliedKey` と同じ）、
  戻ってシーンが着き直すと `sinceSeq` をその時点の seq に進める。別のプロジェクトでの Share で ✓ は出ない。
  すでに出ていた ✓ は `completed` に残るので、別のプロジェクトへ行って戻っても、Back で完了済みのステップに戻っても出る
  （同じ run の同じステップは同じ key）。Restart は run が変わるので、すべて未完了から始まる。
- **一度満たしたら、そのシーンのあいだは ✓ を残す**（ドリルから戻っても消さない。点いたり消えたりしない。TPL-1032 の逆向きの陳腐化は、key ごとに持つことで避ける）。
- **書く場所**：チーム依存は、実際にチーム依存を描いているか（`PreviewColumn` の表示条件と同じ：表示モードが dependencies で、
  チーム依存のビューがある）を値として出す。`setMode` の updater の中では書かない（StrictMode で 2 回走る）。AppShell が unmount したら値を戻す。
  どちらも**成功したとき**に書く（開始では書かない。失敗しても ✓ が出ないように）：Share はダイアログが共有リンクを作れたとき、
  SVG はツールバーの Export SVG（`onExport`）の書き出しが例外なく終わったとき。そのとき書き出すもの（全レイヤーの表示中なら
  全レイヤーの SVG）には依らない。ドロップダウンの drill-down（`onExportDrillDown`）・全図（`onExportAllDiagrams`）・draw.io は数えない。
- **パネルの表示**：ステップ本文の下に ✓ と固定の短い文（en / ja の新しい phrase）を、既存の `aria-live` の領域の中に出す。
  Next は `aria-describedby` でその文を指す。Next の見た目は変えない（e2e はその文と `aria-describedby` を見る）。
- **再開（#3598）との関係**：再読み込みで再開したステップは ✓ を持ち越さない。再開はステップのシーンの hash で起動するので、
  Step 1 の `viewPath` は空から始まり、前回のドリルで ✓ は出ない。状態で読む条件（Step 2）は着いたあとに読み直すので、
  チーム依存を表示していれば ✓ が出る。

### 実装の指針

<!-- absent-path-next-line: created by the #3599 implementation -->
1. `packages/app/src/state/app-signals.ts`：いまの状態（`teamDependenciesShown`）と seq つきの出来事を持つ module store。
   `preview-reveal.ts` と同じく `useSyncExternalStore`。unit テスト用に reset を持つ。
2. 書く場所：`showTeamDependencies` は `PreviewColumn` が自分の表示条件（`activeView === "org"`、表示モードが dependencies、
   チーム依存のビューがある）から effect で書き、cleanup で戻す（AppShell の unmount もこれで覆う）。`useShareDialog` の open、
   `PreviewToolbar` の Export SVG の handler。
3. `tour-steps.ts` に `completion`、評価関数、`TourPanel` に ✓ と文、`FirstRunExperience` でシーンの key と出来事の seq の起点を持つ。
   `useGuidedScene` は当て終えた key を返す。
4. テスト：
   - unit：評価関数（各 kind、着く前は判定しない、key が変わると数え直す、満たしたあと条件が外れても ✓ が残る、別プロジェクトの出来事を数えない、別のプロジェクトへ行って戻っても出ていた ✓ が残る）
   - サンプルの縛り：`drilled.node` が en / ja のサンプルの `buildNodePathIndex` にある
   - e2e：Step 1 で実際にドリルすると ✓、Step 2 でチーム依存を開くと ✓（すでに開いていても ✓）、Step 5 で Share を開くと ✓、Step 3・4 には出ない、Back で未完了のステップに戻ったとき、離れたステップの状態（たとえば Step 2 からの `viewPath`）で ✓ が出ない、Back で完了済みのステップに戻ると ✓ が出る、別のプロジェクトで Share を開いて戻っても Step 5 に ✓ が出ない
5. PRD #3573 の Revisions に「§8 の検知は、示すまでにして自動では進めない」を 1 行足す。
6. AT：`docs/acceptance/first-run-experience.md` に項目を足す（すべて自動）。
7. ADR 昇格：実装の PR が通ったあと、ADR-3599 として昇格し、本 Design Doc を削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: ツアー中の表示だけ。store は読み手がいなければ何もしない。
- ドキュメント更新: `docs/tools/app.md` の「First visit」節と `app.ja.md` の「初めて開いたとき：Welcome とガイドツアー」節に 1 文ずつ。
- テスト・examples への影響: なし。

## 未解決の問い / 決めないこと

- Step 3・4 に操作を足す（例：差分のノードを開く）かは、ガイドの文の変更を伴うので本 Doc では決めない。
- store をツアー以外（たとえば将来のヘルプ）が使うかは決めない。名前だけ汎用にしておく。
