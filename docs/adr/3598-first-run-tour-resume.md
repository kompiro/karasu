---
id: ADR-3598
title: 初回体験のツアーを localStorage の記録と入口の URL で再開し、deep link の復元は指すファイルを待つ
status: accepted
date: 2026-11-05
topic: app-ui
related_to: [ADR-278, ADR-321, ADR-425, ADR-811, ADR-1094, ADR-1827]
scope:
  packages: [app]
assumptions:
  - 'grep: packages/app/src/components/first-run/tour-progress.ts :: TOUR_PROGRESS_KEY = "karasu-first-run-tour"'
  - "symbol: packages/app/src/components/first-run/tour-progress.ts :: readTourProgress"
  - "symbol: packages/app/src/components/first-run/tour-progress.ts :: writeTourProgress"
  - "symbol: packages/app/src/components/first-run/tour-progress.ts :: clearTourProgress"
  - "symbol: packages/app/src/components/first-run/tour-resume.ts :: decideTourResume"
  - "symbol: packages/app/src/components/first-run/tour-resume.ts :: tourStepHash"
  - "symbol: packages/app/src/hooks/useProjectNavigation.ts :: decideInitialHash"
  - "symbol: packages/app/src/hooks/useProjectNavigation.ts :: bootFile"
  - 'grep: packages/app/src/hooks/useFileSelection.ts :: FileSelectionStatus = "opened" \| "failed" \| "superseded"'
  - "symbol: packages/app/src/state/deep-link-restore.ts :: endDeepLinkRestore"
  - "symbol: packages/app/src/hooks/useOrgView.ts :: settledEntryPath"
  - "grep: packages/app/src/hooks/useHistoryNavigation.ts :: restoreTargetRef\\.current\\.filePath = file"
---

# ADR-3598: 初回体験のツアーを localStorage の記録と入口の URL で再開し、deep link の復元は指すファイルを待つ

- **日付**: 2026-11-05
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3598](https://github.com/kompiro/karasu/issues/3598)（Phase 2 Epic [#3602](https://github.com/kompiro/karasu/issues/3602)、PRD [#3573](https://github.com/kompiro/karasu/issues/3573) §11「共有先から戻った際の文脈維持」）。Design Doc PR #3605、実装 PR #3607
  - 前提: [#3597](https://github.com/kompiro/karasu/issues/3597)（PR #3604）の Restart Guided Tour… とツアーのプロジェクトの記録（`tour-project.ts`）
  - 関連 ADR: [ADR-278](278-browser-history-navigation.md)（ブラウザの履歴）、[ADR-321](321-project-url-navigation.md)（`/projects/<id>`）、[ADR-425](425-hash-highlight-restoration.md)（hash のハイライトの復元）、[ADR-811](811-diff-open-file-as-entry.md)（hash の `?file=`）、[ADR-1094](1094-active-view-url-hash.md)、[ADR-1827](1827-permalink-deep-element.md)（deep permalink）
  - TPL: [TPL-1842](../test-perspectives/TPL-1842-restore-state-survive-later-reset.md)、[TPL-1530](../test-perspectives/TPL-1530-persistent-store-init-and-mutation-resilience.md)、[TPL-1534](../test-perspectives/TPL-1534-cancel-stale-async-effect-results.md)、[TPL-976](../test-perspectives/TPL-976-e2e-fixture-controlled-state.md)
  - AT: [first-run-experience.md](../acceptance/first-run-experience.md)（AT-R〜AT-V）、[3284-deep-link-cold-boot-history.md](../acceptance/3284-deep-link-cold-boot-history.md)（AC-3、AT-F / AT-G）
  - コード: `packages/app/src/components/first-run/tour-progress.ts`、`tour-resume.ts`、`FirstRunExperience.tsx`、`use-guided-scene.ts`、`packages/app/src/ProjectModeApp.tsx`、`packages/app/src/hooks/useProjectNavigation.ts`、`useProjectInitialization.ts`、`useFileSelection.ts`、`useHistoryNavigation.ts`、`history-hash.ts`、`useOrgView.ts`、`packages/app/src/state/deep-link-restore.ts`

## 背景

Phase 1 のツアーは `FirstRunExperience` の React state にしかなく、再読み込み・作った共有リンクを開いて戻る・タブを閉じて
開き直す、のどれでも消えた。Restart Guided Tour…（#3597）は Step 1 からやり直す。

再開の判定には次の事情があった。

- アプリは起動時から hash を `#krs-…?file=…` に書き続けるので、再読み込みの URL は必ず `#krs-…` を持つ。Welcome が使う
  `hasDeepLink` ではアプリ自身の hash と外から来たリンクを区別できない。
- 起動するプロジェクトは `/projects/<id>` か、無ければ最後に開いたプロジェクト（`karasu-last-project-id`）になる。ツアーの
  あとは最後のプロジェクトがツアーのものなので、`?example=` や他人の permalink でもツアーのプロジェクトで起動する。
- Step 3〜5 のシーンは `index.krs` 以外のファイルを開く。hash の復元はファイルを待たずに終わっていたので、`index.krs` が先に
  着くと復元が終わり、あとから着いた目的のファイルが `pushState` された。これは `?file=` が `index.krs` 以外を指す deep link
  すべてにあった競合で、ほかに、開いている途中で訪問者が選んだファイルにリンクのドリルが当たる、開けないファイルを指す
  リンクでそのセッションの間ずっと戻る／進むが効かない、という不具合も実装のレビューで見つかった。

## 決定

ツアーの進み具合を localStorage に記録し、**入口の URL がツアーのプロジェクトへの再読み込みか、アドレス欄から開き直したもの
のときだけ**同じステップで再開する。再開する起動では起動時の hash をそのステップのシーンのものに書き換え、hash の復元は
**指すファイルと、そのファイルから作った図が揃うまで待つ**。

### ツアーの記録

- `localStorage["karasu-first-run-tour"] = { v: 1, tour: "service-split", projectId, step }`。`tour` は今後のツアー
  （#3600、#3601）と区別するため。ツアーのプロジェクトの記録（#3597）とは寿命が違うので分けて持つ（そちらはツアーを
  終えても残り、こちらは消える）。
- 書く・消すのは操作の場所で行う。ツアーを始めたとき（Welcome の Design a service split、Restart Guided Tour…）と Next / Back で
  書き、Skip、Continue to editor、ほかのガイドを始めたときに消す。`guide` を見る effect では書かない（復元しなかった起動の
  `guide === null` を「終わった」と読んで消してしまう）。
- 形・版・ステップの範囲が外れた値、壊れた JSON、ローカルに無いプロジェクトを指す記録は捨てる。storage の例外は握りつぶし、
  再開しない動作に落ちる（TPL-1530）。削除が失敗して終えたツアーの記録が残る storage はまれなので、抑える印は持たない。
- 記録は言語に依らない。複数のタブでは最後に書いたタブが勝つ。✓（#3599）は持ち越さない。

### 再開するかの判定

純粋な `decideTourResume({ entry, record, projects, lastProjectId })` が 1 か所で決める。

| 入口の URL | 結果 |
| --- | --- |
| `?example` / `?krs` / `#s=` を持つ | 再開しない（記録は残す） |
| `/projects/<記録の projectId>`（hash は問わない） | 再開する |
| パスにプロジェクトが無く、query も hash も無く、最後のプロジェクトが記録の `projectId` | 再開する |
| それ以外（他人の `#krs-…`、別のプロジェクトのパス、最後のプロジェクトが別） | 再開しない（記録は残す） |

呼ぶのは `useProjectNavigation` の初期化で、プロジェクトの一覧が揃い起動先が決まったあと、初回の `replaceState` の直前に
1 回だけ（`ProjectModeApp` が `decideInitialHash(target, projects, lastProjectId)` として渡し、hooks 層に `tour-steps` を
持ち込まない）。再開しなかった起動では、あとからツアーのプロジェクトへ切り替えてもパネルは出ない。

### 再開の順序（TPL-1842）

- 再開する起動では、起動時の hash を `tourStepHash(root, step)`（シーンのファイルとビュー、ドリル無し）に書き換える。hash の
  復元がシーンのファイル・ビューを当て、シーンの適用は URL に無い差分と reveal だけを足すので、**ブラウザの履歴は増えない**。
  入口の hash のドリルは外れる。
- `FirstRunExperience` は `useState` の初期化関数で `{ kind: "tour", root, step, run: 0 }` を作る（パネルの無い 1 フレームを
  作らない）。再開したシーンは deep link の復元を終わらせない（下の「訪問者の操作」に数えない）。

### deep link の復元（ツアー以外のリンクにも効く）

- **ファイルを待つ**: hash の `?file=` を復元の目標に入れ、`currentFilePath` がそれになり、さらにパスの索引がそのファイルから
  作られたもの（`useOrgView` の `settledEntryPath`）になるまで、ビュー・ドリル・ハイライトを当てず、復元を終えない。
- **起動のファイルは 1 か所が選ぶ**: hash がファイルを指す起動では、プロジェクトの切り替えの自動選択が `index.krs` ではなく
  hash のファイル（`bootFile`）を開く。`bootFile` は起動するプロジェクトの中のパスに限り、その読み込みが失敗したら `index.krs`
  を開く。同じファイルの読み込みが進行中なら、後の選択はそれに合流する。
- **`selectFile` の結果を 3 つに分ける**: `"opened" | "failed" | "superseded"`。追い越された（訪問者が別のファイルや
  プロジェクトを選んだ）ときは復元を終える。読み込みが失敗したときは、ファイルを待つのだけをやめ、ほかの値の復元は続ける
  （開けないファイルを指すリンクで復元が終わらなくならない）。
- **コンパイルエラー**: 指すファイルのコンパイルがエラーで終わったら、タブとハイライトは当て、古い索引でしか解けない
  ドリルは捨てて復元を終える。
- **訪問者の操作が復元を終える**: 別のファイルへの移動、タブ・ドリル（`navigate*`）、別ビューへのジャンプ、アウトライン、
  戻る／進む、訪問者が進めたガイドのシーン（`endDeepLinkRestore`）。まだ解けていない値はその操作の上に後から当てず捨て、
  訪問者の操作は通常どおり履歴に積む。

## 理由

- localStorage は Welcome の記録・ツアーのプロジェクトの記録と同じ置き場で、失敗時の扱いも同じにできる。プロジェクトの内容を
  汚さず、共有リンクにも乗らない。
- 判定を入口の URL で行えば、アプリ自身の `#krs-…` を持つ再読み込みと、外から来たリンクを区別できる。起動のプロジェクト
  だけで決めると、外から来たリンクでもツアーが出る。
- hash をシーンに書き換えると、hash の復元とシーンの適用が同じ値を目指すので、2 つの順序に依らず結果が同じになり、
  履歴も増えない。
- ファイルを待つ修正は、ツアーの Step 3〜5 に必要なだけでなく、`index.krs` 以外を指す deep link すべての既存の競合を
  直す。待つ条件を「ファイル」だけでなく「そのファイルの索引」にしたのは、切り替え直後の索引が前のファイルのもので、
  そこで解いたドリルが外れるため（TPL-1534）。
- 待つのをやめる条件を Design Doc の「目標のパスの読み込みが失敗したときだけ」から広げ、追い越し・コンパイルエラー・
  訪問者の操作でも終えるようにしたのは、どれも「リンクの値をあとから当てると訪問者の居場所を奪う」場面だから。終わらない
  復元は戻る／進むを replace に変え続けるので、終える側に倒す。

## 却下した案

- **OPFS のプロジェクトのメタデータに持つ**: ツアーはアプリの状態で、プロジェクトの内容ではない。書き出しや複製に混ざり、
  ステップの移動のたびに非同期の書き込みになる。
- **URL（hash / query）に持つ**: hash は deep permalink と共有が使っている。共有リンクにツアーの状態が乗ると、受け取った人の
  画面にツアーが出る。タブを開き直すと消える。
- **`hasDeepLink` で判定する**: アプリ自身が書いた `#krs-…` を外のリンクと読み、再読み込みで再開しない。
- **追い越しを失敗に数える**: 訪問者が選んだファイルの上にリンクのドリルとビューが当たる（実装のレビューで見つかった）。

## 影響

- ツアーを終えずにページを閉じた人だけが、次にそのプロジェクトで開いたとき同じステップに戻る。
- `index.krs` 以外を指す deep link は、開いても履歴が増えず、訪問者が途中で選んだファイルを上書きせず、開けないファイルを
  指していても戻る／進むが効く。
- 記録の有効期限は設けない（起動時にツアーのプロジェクトを開いたときだけ戻るので、古い記録が居場所を奪わない）。端末を
  またいだ再開は扱わない。
