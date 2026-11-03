# 初回体験のツアーを再読み込みや共有からの戻りで再開する

- **日付**: 2026-11-04
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3598](https://github.com/kompiro/karasu/issues/3598)（Phase 2 Epic [#3602](https://github.com/kompiro/karasu/issues/3602)、PRD [#3573](https://github.com/kompiro/karasu/issues/3573) §11「共有先から戻った際の文脈維持」）
  - 関連 TPL: [TPL-1842](../test-perspectives/TPL-1842-restore-state-survive-later-reset.md)（復元した状態が後のリセットに負けない）、[TPL-1530](../test-perspectives/TPL-1530-persistent-store-init-and-mutation-resilience.md)（永続化した値の初期化と破損への耐性）、[TPL-1534](../test-perspectives/TPL-1534-cancel-stale-async-effect-results.md)（遅れて届く非同期の結果）、[TPL-976](../test-perspectives/TPL-976-e2e-fixture-controlled-state.md)（e2e の fixture が状態を決める）
  - コード: `packages/app/src/components/first-run/FirstRunExperience.tsx`、`tour-project.ts`（#3597）、`use-guided-scene.ts`、`welcome-gate.ts`、`packages/app/src/hooks/useHistoryNavigation.ts`、`packages/app/src/ProjectModeApp.tsx`

## 背景・課題

Phase 1 のツアーは `FirstRunExperience` の React state（`guide`）にしかない。Step 5 は Share を案内するが、
再読み込みする、作ったリンクを同じタブで開いて戻る、タブを閉じて開き直す、のどれでもツアーは消え、
同じステップに戻る手段が無い（Restart Guided Tour… は Step 1 からになる、#3597）。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| ツアーの状態 | `guide: { kind: "tour", root, step, run }`。`root` はサンプルのプロジェクトの `rootPath`（`/projects/<id>`、名前を変えても変わらない） |
| シーンの適用 | `useGuidedScene`。プロジェクトを離れて戻ると `reapplyOnReturn` で同じシーンを当て直す。`selectFile` は `VIEW_RESET` を伴う |
| ツアーのプロジェクト | `localStorage["karasu-first-run-tour-project"]`（#3597）。ツアーを始めるたびに書き、ツアーを終えても消さない。Restart Guided Tour… はこれで戻り先を引く |
| URL | `useHistoryNavigation` は起動時に hash が無くても `#krs-system-root?file=…` を `replaceState` で書き、以後もビュー・ドリル・ファイルの変化を hash に反映する。つまり**再読み込みの URL は常に `#krs-…` を持つ** |
| deep link の判定 | `hasDeepLink(location)`（`?example` / `?krs` / `#krs-` / `#s=`）。Welcome の判定に使う |
| 起動時のプロジェクト | `ProjectModeApp` は読み込みが終わり、プロジェクトが開いてから `FirstRunExperience` を mount する（`SET_PROJECTS` はその前） |

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
  `projectId` はツアーのプロジェクトの記録（#3597）と同じ値になる。
- **書く・消す**: effect ではなく操作の場所で書く。ツアーを始めたとき（Welcome の Design a service split、Restart Guided Tour…）と
  Next / Back で書き、Skip、Continue to editor、ほかのガイドを始めたとき（Track architecture evolution）に消す。
  `guide` の変化を見る effect で書くと、復元しなかった起動で `guide === null` を「終わった」と読んで消してしまう。
- **復元する条件（1 つ）**: **起動時に開いたプロジェクトが記録の `projectId` である**。そのときだけ、
  `{ kind: "tour", root: project.rootPath, step, run: ++runs }` を `useState` の初期値として復元する（パネルの無い 1 フレームを作らない）。
  - 再読み込み・共有から戻る・タブを開き直す：アプリはツアーのプロジェクトを開いて起動するので復元する。
  - ギャラリーの example（`?example`）や他人の permalink・共有リンク：起動時のプロジェクトが別になるので復元しない。記録は消さない。
  - 別のプロジェクトで起動し、あとでツアーのプロジェクトへ切り替えた：復元しない。何日も後にサンプルを開いたとき、
    シーンが訪問者の居場所を上書きしないため。ツアーに戻りたければ Restart Guided Tour… を使う。
  - `hasDeepLink` は使わない（アプリ自身の `#krs-…` を外のリンクと読んでしまう）。
- **復元とシーンの順序（TPL-1842）**: 復元した起動では、hash の復元（ファイル・ビュー・ドリル）が先に済み、そのあとに
  ステップのシーン（ファイル・ビュー・差分）が勝つ。差分は URL に無いので、シーンを当て直さないと Step 3 の差分が戻らない。
  当て直しは起動の 1 回だけで、**ブラウザの履歴を増やさない**（`history.length` が再読み込みの前後で同じ）。
- **範囲外の値**: `v` / `tour` が違う、`step` がツアーの長さの外、`projectId` のプロジェクトが無い、JSON が壊れている、は記録ごと捨てる。
- **再開したステップの表示**: ✓（#3599）は持ち越さない。ステップの中で起きたことの記録は再読み込みで消える。
- **言語**: 記録は言語に依らない。ja で始めて en で再読み込みしても、同じプロジェクトの同じステップに戻る。
- **複数のタブ**: 最後に書いたタブが勝つ。別のタブの Skip が、もう一方の Next で書き戻されることは受け入れる。

### 実装の指針

1. `packages/app/src/components/first-run/tour-progress.ts`：`readTourProgress(storage?)` / `writeTourProgress` / `clearTourProgress`。
   型ガードで形を確かめ、外れたら `null`（TPL-1530）。`tour-project.ts` と同じく storage を差し替えられ、失敗は握りつぶす。
2. `FirstRunExperience`：`startTour`・`moveStep`・`endTour`・Evolve の開始で書く・消す。初期値の復元は `useState` の初期化関数で、
   `currentProject.id === progress.projectId` のときだけ。
3. `useGuidedScene`：復元した起動でも、hash の復元を待ってからシーンを当てる（`useHistoryNavigation` の初回の hash 解決の後）。
   当て直しの `selectFile` が履歴を push しないことを確かめる。
4. テスト：
   - unit（jsdom）：読み書き、形・版・範囲の外れ、壊れた JSON、例外を投げる storage
   - e2e（opfs fixture は localStorage を毎回消すので他の spec に影響しない。TPL-976）：
     - Step 3 で再読み込みすると 3 / 5 と差分が戻り、`history.length` が増えない
     - Skip のあと再読み込みしても出ない
     - ツアー中に別のプロジェクトへ切り替えて再読み込みすると出ない。ツアーのプロジェクトへ戻しても出ない
     - ギャラリーの example（`?example=`）で開くと出ない
5. AT：`docs/acceptance/first-run-experience.md` に再開の項目を足す（すべて自動）。
6. ADR 昇格：実装の PR が通ったあと、ADR-3598 として昇格し、本 Design Doc を削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: ツアーを終えずにページを閉じた人だけ、次にそのプロジェクトで開いたとき同じステップに戻る。
- ドキュメント更新: `docs/tools/app.md` / `app.ja.md` の「First visit」節に 1 文。
- テスト・examples への影響: なし。

## 未解決の問い / 決めないこと

- 記録の有効期限は設けない。起動時にツアーのプロジェクトを開いたときだけ戻るので、古い記録が訪問者の居場所を奪わない。
- 端末をまたいだ再開は扱わない（アカウントが無い）。
