# 初回体験のツアーを再読み込みや共有からの戻りで再開する

- **日付**: 2026-11-03
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3598](https://github.com/kompiro/karasu/issues/3598)（Phase 2 Epic [#3602](https://github.com/kompiro/karasu/issues/3602)、PRD [#3573](https://github.com/kompiro/karasu/issues/3573) §11「共有先から戻った際の文脈維持」）
  - 関連 TPL: [TPL-1842](../test-perspectives/TPL-1842-restore-state-survive-later-reset.md)（復元した状態が後のリセットに負けない）、[TPL-1530](../test-perspectives/TPL-1530-persistent-store-init-and-mutation-resilience.md)（永続化した値の初期化と破損への耐性）、[TPL-1534](../test-perspectives/TPL-1534-cancel-stale-async-effect-results.md)（遅れて届く非同期の結果）、[TPL-976](../test-perspectives/TPL-976-e2e-fixture-controlled-state.md)（e2e の fixture が状態を決める）
  - 前提: [#3597](https://github.com/kompiro/karasu/issues/3597)（PR #3604）の Restart Guided Tour… とツアーのプロジェクトの記録（`tour-project.ts`）。
    本 Doc の実装は #3604 のマージ後に始める
  - コード: `packages/app/src/components/first-run/FirstRunExperience.tsx`、`tour-project.ts`（#3604 で追加）、`use-guided-scene.ts`、`welcome-gate.ts`、`packages/app/src/hooks/useHistoryNavigation.ts`、`packages/app/src/hooks/useProjectNavigation.ts`、`packages/app/src/ProjectModeApp.tsx`

## 背景・課題

Phase 1 のツアーは `FirstRunExperience` の React state（`guide`）にしかない。Step 5 は Share を案内するが、
再読み込みする、作ったリンクを同じタブで開いて戻る、タブを閉じて開き直す、のどれでもツアーは消え、
同じステップに戻る手段が無い（Restart Guided Tour… は Step 1 からになる、#3597）。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| ツアーの状態 | `guide: { kind: "tour", root, step, run }`。`root` はサンプルのプロジェクトの `rootPath`（`/projects/<id>`、名前を変えても変わらない） |
| シーンの適用 | `useGuidedScene`。プロジェクトを離れて戻ると `reapplyOnReturn` で同じシーンを当て直す。`selectFile` は `VIEW_RESET` を伴う |
| ツアーのプロジェクト | `localStorage["karasu-first-run-tour-project"]`（#3597、PR #3604 で追加）。ツアーを始めるたびに書き、ツアーを終えても消さない。Restart Guided Tour… はこれで戻り先を引く |
| URL | `useHistoryNavigation` は起動時に hash が無くても `#krs-system-root?file=…` を `replaceState` で書き、以後もビュー・ドリル・ファイルの変化を hash に反映する。つまり**再読み込みの URL は常に `#krs-…` を持つ** |
| deep link の判定 | `hasDeepLink(location)`（`?example` / `?krs` / `#krs-` / `#s=`）。Welcome の判定に使う |
| 起動時のプロジェクト | `useProjectNavigation` は URL の `/projects/<id>` がローカルにあればそれを、無ければ `localStorage["karasu-last-project-id"]` を開く。ツアーのあとは最後のプロジェクトがツアーのものになるので、`?example=` や他人の `#krs-…` で開いても、まずツアーのプロジェクトで起動する |
| 起動時の URL | `ProjectModeApp` は `useProjectNavigation` が `replaceState` する前の `search` / `hash` を `initialLocation` に写す。`FirstRunExperience` は読み込みが終わり、プロジェクトが開いてから mount する（`SET_PROJECTS` はその前） |
| hash の復元 | `useHistoryNavigation` の初回の解決（effect ①②）が hash のビュー・ドリル・ファイルを当てる。解決が終わると、ビュー・ドリル・ファイルの変化を `pushState` する（effect ③）。その内部状態は AppShell の中にあり、`FirstRunExperience` からは待てない |

## 制約・前提

- アプリ外から特定の場所へ来たとき（ギャラリーの example、他人の permalink、共有リンク）は邪魔をしない。
- アプリ自身が書いた `#krs-…` は、外から来たリンクと区別する（上の表のとおり、再読み込みは必ず `#krs-…` を持つ）。
- 保存先が使えない、値が壊れている、形が違うときは、再開しない（今の動作）に落ちる（TPL-1530）。
- 再開しても、訪問者のモデルを変えない（シーンはファイル・ビュー・差分の選択だけ）。
- 共有リンク（`#s=`）の先は別の表示であり、そこにツアーを出すことは範囲外。

## 検討した選択肢

### 案1: localStorage に進み具合を置く

ツアーを始めた・ステップを動かしたときに書き、Skip / Continue to editor で消す。起動時に読み、
条件が揃えば同じステップのツアーとして復元する。

**メリット**: Welcome の記録・ツアーのプロジェクトの記録（#3597）と同じ置き場・同じ失敗時の扱いで済む。
プロジェクトの内容を汚さず、共有リンクにも漏れない。

**デメリット**: ブラウザ・プロファイルごとの状態になる。初回体験としては問題にならない。

### 案2: OPFS のプロジェクトのメタデータに持つ

**メリット**: プロジェクトと一緒に消える。
**デメリット**: ツアーはアプリの状態であってプロジェクトの内容ではない。書き出しや複製に混ざる。ステップの移動のたびに非同期の書き込みになる。

### 案3: URL（hash / query）に持つ

**メリット**: 再読み込みでは確実に残る。
**デメリット**: hash は deep permalink と共有が使っている。共有リンクにツアーの状態が乗ると、受け取った人の画面にツアーが出る。タブを開き直すと消える。

## 現時点の方針

**案1 を採用する。**

### 確定させる規則

- **記録**: `localStorage["karasu-first-run-tour"] = { v: 1, tour: "service-split", projectId, step }`。
  `tour` は今後のツアー（#3600 の Understand / Evolve、#3601 の 2 つ目のサンプル）と区別するため。
  `projectId` はツアーのプロジェクトの記録（#3597）と同じ値になるが、2 つは寿命が違うので分けて持つ。ツアーのプロジェクトの記録は
  ツアーを終えても残り（Restart Guided Tour… の戻り先）、この記録はツアーを終えたら消える（再開するかどうか）。
- **書く・消す**: effect ではなく操作の場所で書く。ツアーを始めたとき（Welcome の Design a service split、Restart Guided Tour…）と
  Next / Back で書き、Skip、Continue to editor、ほかのガイドを始めたとき（Track architecture evolution）に消す。
  `guide` の変化を見る effect で書くと、復元しなかった起動で `guide === null` を「終わった」と読んで消してしまう。
  Next / Back は、新しいステップを closure の `guide` から求めて `setGuide` と記録の書き込みをそれぞれ行う
  （`setGuide` の updater の中では書かない。StrictMode で 2 回走る）。
- **復元する条件（入口の URL で決める）**: `initialLocation` に `pathname` を足し、入口の URL が次のどちらかで、
  かつ `?example` / `?krs` / `#s=` を持たないときだけ復元する。起動時のプロジェクトだけでは決めない（最後のプロジェクトがツアーのものだと、
  外から来たリンクでもツアーのプロジェクトで起動する）。
  - パスが `/projects/<記録の projectId>`：再読み込み、閉じたタブを開き直す。hash（アプリ自身の `#krs-…`）は問わない。
  - パスにプロジェクトが無く、query も hash も無く、**起動するプロジェクト（`karasu-last-project-id` から選ばれるもの）が記録の
    `projectId` である**：アドレス欄からアプリを開き直した。最後のプロジェクトが別なら復元しない（ツアーのファイルを別のプロジェクトに
    読み込ませない）。
  - それ以外（`?example=`、他人の `#krs-…`、共有リンクから project mode に落ちた場合、別のプロジェクトのパス）：復元しない。記録は消さない。
    あとでツアーのプロジェクトへ切り替えても、復元しなかった起動ではパネルは出ない（ツアーに戻りたければ Restart Guided Tour…）。
  - `hasDeepLink` は使わない（アプリ自身の `#krs-…` を外のリンクと読んでしまう）。
- **復元の値**: `{ kind: "tour", root: project.rootPath, step, run: 0 }` を `useState` の初期化関数で作る（パネルの無い 1 フレームを作らない）。
  初期化関数は純粋にする：`run` は 0（`startTour` は 1 から数えるので key は重ならない）、記録の読み取りは副作用を持たず、
  捨てるべき記録の削除は effect で行う。
- **復元とシーンの順序（TPL-1842）**: 復元する起動では、`ProjectModeApp` が起動時の URL を確定するところ
  （`useProjectNavigation` の初期化の `replaceState`、AppShell の mount より前）で、**hash をステップのシーンのものに書き換える**
  （`buildHash(scene.view, [], { file: root/scene.file })`）。すると hash の復元はシーンのファイル・ビューをそのまま当て、
  シーンの適用はファイル・ビューを変えないので `pushState` が起きない。シーンが足すのは URL に無い差分と reveal だけになる。
  ただし Step 3〜5 の hash は `index.krs` 以外のファイルを指し、今の `useHistoryNavigation` は hash の復元を終えたと判定するときに
  ファイルを待たない（プロジェクトの切り替えで自動選択される `index.krs` が先に着くと、復元を終えたあとで目的のファイルが着き、
  `pushState` される）。これは `?file=` が `index.krs` 以外を指す deep link すべてに今もある競合なので、**hash の復元はファイルも待つ**
  ように直す：effect ① で hash の `filePath` を復元の目標に入れ、effect ③ は今の終了条件（保留中の解決が無いこと、目標のビュー・ドリル・
  ハイライトと一致すること）に**加えて** `currentFilePath` がそれと一致するまで復元を終えない。hash がファイルを指す起動では、
  **復元のあいだファイルの選択を 1 か所が持つ**：プロジェクトの切り替えの自動選択は `index.krs` ではなく hash のファイルを選び
  （起動のファイルが hash のファイルになる）、シーンの同じファイルの選択はそれに合流する。`selectFile` は後の要求が前の要求を
  `false` にするので、**追い越しは失敗に数えない**。待つのをやめるのは、目標のパスの読み込みが決着して失敗したときだけで、
  そのときは今の条件だけで復元を終える
  （開けないファイルを指す deep link で復元が終わらなくならない）。
  これで hash の解決とシーンの適用の順序に依らず同じ結果になり、**ブラウザの履歴は増えない**。Step 1 で入口の hash がドリルを持っていても、
  書き換えでドリルは外れる（再開した Step 1 に前回のドリルで ✓ が出ない。#3599）。
- **記録を消せなかったとき**: storage が書き込みは受けたのに削除で例外を投げると、終えたツアーの記録が残り、次の起動で再開しうる。
  そうなる storage はまれなので受け入れる（再開を抑える印は持たない）。
- **範囲外の値**: `v` / `tour` が違う、`step` がツアーの長さの外、`projectId` のプロジェクトが無い、JSON が壊れている、は記録ごと捨てる。
- **再開したステップの表示**: ✓（#3599）は持ち越さない。ステップの中で起きたことの記録は再読み込みで消える。
- **言語**: 記録は言語に依らない。ja で始めて en で再読み込みしても、同じプロジェクトの同じステップに戻る。
- **複数のタブ**: 最後に書いたタブが勝つ。別のタブの Skip が、もう一方の Next で書き戻されることは受け入れる。

### 実装の指針

1. `packages/app/src/components/first-run/tour-progress.ts`：`readTourProgress(storage?)` / `writeTourProgress` / `clearTourProgress`。
   型ガードで形を確かめ、外れたら `null`（TPL-1530）。`tour-project.ts` と同じく storage を差し替えられ、失敗は握りつぶす。
2. 判定を 1 か所にする：純粋な `decideTourResume({ entry, record, projects, lastProjectId })` が「復元するか、するならどのプロジェクトの
   どのステップか」を返す。呼ぶのは `useProjectNavigation` の初期化の effect の中、プロジェクトの一覧が揃い（`SET_PROJECTS` の後）、
   起動先が決まり、初回の `replaceState` をする直前の 1 回だけ（初回 render の空の一覧で判定して有効な記録を捨てない）。
   `ProjectModeApp` はその判定を `useProjectNavigation` に `decideInitialHash(target, projects)` として渡し（hooks 層に `tour-steps` を
   持ち込まない）、返った判定を state に置いて `FirstRunExperience` に prop で渡す。`FirstRunExperience` は読み込みが終わってから
   mount するので、初期化関数が読む時点で判定は決まっている。別々に storage と URL を読むと、hash だけ書き換わって復元しない、
   またはその逆が起きる。捨てるべき記録の削除は `FirstRunExperience` の mount 時の effect が行う。
3. `useHistoryNavigation`：hash の復元の目標に `filePath` を入れ、`currentFilePath` が一致するまで復元を終えない（上の順序の規則）。
4. `FirstRunExperience`：`startTour`・`moveStep`・`endTour`・Evolve の開始で書く・消す。初期値の復元は純粋な `useState` の初期化関数で、
   `decideTourResume` の結果を読む。
5. テスト：
   - unit（jsdom）：読み書き、形・版・範囲の外れ、壊れた JSON、例外を投げる storage
   - unit（`decideTourResume`）：パスが一致、パス無しで最後のプロジェクトが一致、パス無しで最後のプロジェクトが別、`?example`、`#s=`、
     パス無しの `#krs-…`、別のプロジェクトのパス、ローカルに無いプロジェクトのパス
   - unit（実際の `appReducer` で）：`index.krs` 以外を指す hash の復元が、path index が初回の render で揃う場合と後の render で揃う場合の
     どちらでも、ビュー・ドリル・ファイルが揃ってから終わる。目標のファイルの選択が失敗したら待つのをやめる
   - e2e（at-3284 に足す）：`?file=` が `index.krs` 以外を指す deep link で開いても `history.length` が増えない。プロジェクトに無いファイルを指す
     deep link でも、そのあとのファイルの切り替えが通常どおり履歴に積まれる（復元が終わっている）
   - 判定の順序：`decideTourResume` が `SET_PROJECTS` の後、初回の `replaceState` の前に 1 回だけ呼ばれる
   - e2e（opfs fixture は localStorage を毎回消すので他の spec に影響しない。TPL-976）：
     - Step 3 で再読み込みすると 3 / 5 と差分が戻り、`history.length` が再読み込みの前と同じ
     - Step 1 でドリルしてから再読み込みすると、ドリルは外れて 1 / 5 に戻る
     - Skip のあと再読み込みしても出ない
     - ツアー中に別のプロジェクトへ切り替えて再読み込みすると出ない。ツアーのプロジェクトへ戻しても出ない
     - ギャラリーの example（`?example=`）で開くと出ず、そのあとツアーのプロジェクトへ切り替えても出ない
     - 最後のプロジェクトがツアーのものの状態で、他人の permalink（`/#krs-system-CommerceApp`）を開くと出ない
     - 最後のプロジェクトがツアーのものでない状態で、パス無しの `/` を開くと出ず、ツアーのファイルも読み込まれない
6. AT：`docs/acceptance/first-run-experience.md` に再開の項目を足す（すべて自動）。
7. ADR 昇格：実装の PR が通ったあと、ADR-3598 として昇格し、本 Design Doc を削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: ツアーを終えずにページを閉じた人だけ、次にそのプロジェクトで開いたとき同じステップに戻る。
- ドキュメント更新: `docs/tools/app.md` の「First visit」節と `app.ja.md` の「初めて開いたとき：Welcome とガイドツアー」節に 1 文ずつ。
- テスト・examples への影響: なし。

## 未解決の問い / 決めないこと

- 記録の有効期限は設けない。起動時にツアーのプロジェクトを開いたときだけ戻るので、古い記録が訪問者の居場所を奪わない。
- 端末をまたいだ再開は扱わない（アカウントが無い）。
