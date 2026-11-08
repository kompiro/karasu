---
id: ADR-3599
title: 初回体験のツアーは、ステップが頼んだ操作をしたことを示すだけで、進むのは訪問者に任せる
status: accepted
date: 2026-11-06
topic: app-ui
related_to: [ADR-3598, ADR-3600]
scope:
  packages: [app, i18n]
assumptions:
  - "symbol: packages/app/src/components/first-run/tour-steps.ts :: isStepDone"
  - 'grep: packages/app/src/components/first-run/tour-steps.ts :: kind: "drilled", view: "system", node: "CommerceApp"'
  - "symbol: packages/app/src/state/app-signals.ts :: beginEvent"
  - "symbol: packages/app/src/state/app-signals.ts :: recordEvent"
  - "symbol: packages/app/src/state/app-signals.ts :: happenedSince"
  - "symbol: packages/app/src/state/app-signals.ts :: useShowingSignal"
  - 'grep: packages/app/src/hooks/useShareDialog.ts :: recordEvent\("share-opened", started\)'
  - 'grep: packages/app/src/components/PreviewColumn.tsx :: recordEvent\("svg-exported"\)'
  - 'grep: packages/app/src/components/PreviewColumn.tsx :: useShowingSignal\("team-dependencies", showTeamDependencies\)'
  - "grep: packages/app/src/components/first-run/TourPanel.tsx :: data-scene-landed"
  - 'grep: packages/i18n/src/first-run.ts :: "firstRun.tour.stepDone"'
---

# ADR-3599: 初回体験のツアーは、ステップが頼んだ操作をしたことを示すだけで、進むのは訪問者に任せる

- **日付**: 2026-11-06
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3599](https://github.com/kompiro/karasu/issues/3599)（Phase 2 Epic [#3602](https://github.com/kompiro/karasu/issues/3602)、PRD [#3573](https://github.com/kompiro/karasu/issues/3573) §4「Preserve user control」、§8・§11「ガイドの操作完了の自動検知」）。Design Doc PR #3605、実装 PR #3616
  - 関連 ADR: [ADR-3598](3598-first-run-tour-resume.md)（ツアーの再開）
  - TPL: [TPL-1534](../test-perspectives/TPL-1534-cancel-stale-async-effect-results.md)、[TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)、[TPL-3113](../test-perspectives/TPL-3113-written-path-resolves-to-its-node.md)
  - AT: [first-run-experience.md](../acceptance/first-run-experience.md)（AT-W〜AT-Y）
  - コード: `packages/app/src/state/app-signals.ts`、`packages/app/src/components/first-run/tour-steps.ts`、`FirstRunExperience.tsx`、`TourPanel.tsx`、`use-guided-scene.ts`、`packages/app/src/components/PreviewColumn.tsx`、`packages/app/src/hooks/useShareDialog.ts`

## 背景

ステップの文は操作を頼む（Step 1「コマースアプリケーションをクリックして中のドメインを見る」、Step 2「チーム依存を見る」、
Step 5「共有する」）。Phase 1 は Next でしか進まず、頼んだ操作を訪問者がしたかどうかをパネルが知らない。した人には
「それでよい」と、していない人には「何をすればよいか」が伝わらなかった。

判定に要る状態は 1 か所にない。ドリルは reducer の `viewPath` にあるが、チーム依存の表示と Share ダイアログは各コンポーネントの
state にある。`FirstRunExperience` は `ProjectModeApp` に置かれ、それらの親でも子でもない。

## 決定

**頼んだ操作をすると、パネルに ✓ と短い文を出す。進むのはこれまでどおり訪問者が Next を押したときだけにする。** 判定は、
状態で読めるものは状態で、一度きりのものは seq つきの出来事で読み、どちらもステップのシーンが着いてから行う。

### 条件はステップのデータに書く

`TourStep.completion` に書き、`isStepDone` が 1 か所で判定する。操作を頼まない Step 3・4 は持たない。

| ステップ | 条件 | 読む値 |
| --- | --- | --- |
| 1 | `{ kind: "drilled", view: "system", node: "CommerceApp" }` | reducer の `activeView` と `viewPath`（ドリルしたノードまでの完全なパスなので「含む」で読む） |
| 2 | `{ kind: "showing", what: "team-dependencies" }` | app-signals の `showing` |
| 5 | `{ kind: "event", any: ["share-opened", "svg-exported"] }` | app-signals の `lastEvent` |

`drilled` のノードは en / ja のサンプルの `nodePathIndex` にあることを app のテストが確かめる（TPL-3113）。`StepCompletion` 型は
`tour-steps.ts` の中だけで使う。

### 外の機能は `app-signals` に出し、ツアーを知らない

`app-signals.ts` は `useSyncExternalStore` で読む module store で、次の 2 種類を持つ。

- **値（`showing`）**: いま画面に出ているもの。遅れて読み始めても読める。`PreviewColumn` が `showTeamDependencies`（`activeView` が
  org、表示モードが dependencies、チーム依存のビューがある）を `useShowingSignal` で出し、unmount で戻す。`useOrgDisplayMode` の
  `setMode` の updater では書かない（StrictMode で 2 回走る）。
- **出来事（`lastEvent` と `seq`）**: 一度きりのこと。誰かが空にする Set にせず、種類ごとの最新の seq を持ち、読み手が自分の起点より
  後かを比べる（`happenedSince`）。読んでも消えないので、読み手が増えても互いに奪わない。

出来事は**成功したとき**に書く。

- SVG は `PreviewColumn` の `handleExport`（ツールバーの Export SVG）で、`exportCurrentSvg` が例外なく終わったあとに書く。何を書き
  出したかには依らない。ドロップダウンの drill-down、全図、draw.io は数えない。
- Share は `useShareDialog` で共有リンクを作れたあとに書く。ダイアログを開いたときや、バンドルの生成に失敗したときは書かない。

### 待ちを挟む出来事は、始めた時点の seq で記録する

Share はバンドルの生成を待つので、始めてから終わるまでのあいだに訪問者が移動できる。`handleShare` は `beginEvent` で seq を
受け取り、終わったら `recordEvent("share-opened", started)` で書く。seq は始めた時点のものなので、別のプロジェクトで始めて
ツアーに戻ってから終わった Share は、戻ったシーンの起点より前になり、数えない。

### 判定はシーンが着いてから（TPL-1534）

- `useGuidedScene` が、ファイルを開いてビューを当て終えたシーンの key を返す。`appliedKey`（同じシーンを 2 度当てないための印で、
  `selectFile` の前に立てる）とは別に、`landed` として当て終えたあとに立てる。ツアーのプロジェクトを離れると render 中に忘れる。
- `isStepDone` は、着いた key がいまのステップの key（`tour:${run}:${step}`）と一致するまで条件を読まない。Back の直後に、離れた
  ステップの `viewPath` で ✓ が出ない。
- `FirstRunExperience` は着いた key が変わった時点の seq を起点（`sinceSeq`）として覚え、それより後の出来事だけを数える。別の
  プロジェクトへ行って戻ると着き直すので、よそでの Share は数えない。

### 一度出た ✓ は残し、run が変われば消える

`FirstRunExperience` が満たした key の集合を持つ。key に `run` が入るので、次のようになる。

- 同じ run の同じステップなら、条件が外れても（ドリルから戻る、チーム依存を閉じる）、別のプロジェクトへ行って戻っても、Back で
  戻っても ✓ が出る。点いたり消えたりしない。
- Restart Guided Tour… は run が変わるので、すべて未完了から始まる。
- 集合は React state なので、再読み込みで再開したステップ（ADR-3598）には持ち越さない。Step 2 のような状態で読む条件は、着いた
  あとに読み直すので、チーム依存を表示していれば ✓ が出る。

### パネルの表示

ステップ本文の下に ✓ と固定の文（`firstRun.tour.stepDone`）を、既存の `aria-live` の領域の中に出す。Next は `aria-describedby` で
その文を指す。見た目は変えない。

パネルの `data-scene-landed` は、いまのステップのシーンが着いたことを示す。e2e はこれを待ってから操作する。着く前の操作は
数えない仕様なので、待たないテストは負荷しだいで落ちる。

## 理由

- 自動で進めると、操作の結果を見る前に画面（ファイル・ビュー・差分）が切り替わる。Step 1 でドリルした訪問者が、中を見ている途中で
  次へ飛ばされる。PRD §4「Preserve user control」に反するので、PRD §8 の検知は「示すまで」と読み、PRD の Revisions に記録した。
- チーム依存は表示モードが残るので、出来事だけで読むと、すでに表示している訪問者に ✓ が出ない。値と出来事の両方が要る。
- 出来事を seq で読むと、書く側がプロジェクトやツアーを知らずに済む。数える範囲を読む側が決めるので、Share と Export SVG に
  ツアーの都合が入らない。
- 終わった時点の seq で書くと、待ちのあいだに戻ったプロジェクトの起点より後になり、よそで始めた Share を数えてしまう。Design Doc は
  「数える範囲は読む側が決める」で足りると見ていたが、実装のレビューでこの穴が見つかったので `beginEvent` を足した。
- 判定をシーンの到着で区切らないと、Back の直後は前のステップの `viewPath` が残っており、未完了のステップに ✓ が出る。

## 却下した案

- **自動で次へ進める**: 上のとおり、操作の結果を見る前に画面が変わる。
- **reducer の状態だけで判定する**: Step 2・5 が判定できない。チーム依存と Share を reducer へ移すのは、判定のために機能の構造を
  変えることになる。
- **DOM を観察する**（`aria-pressed` や dialog の出現）: 文言や構造の変更で黙って壊れる。
- **出来事を Set に入れ、読み手が空にする**: 読み手が増えると奪い合う。ステップの切り替えと空にする順序にも依存する。
- **Step 3・4 にも ✓ を出す**: 操作を頼んでいないので、出す根拠がない。

## 影響

- ツアー中のパネルの表示だけが変わる。store は読み手がいなければ何もしない。機能の振る舞いは変えない。
- Share をすぐ閉じても、リンクを作れていれば ✓ が出る。
- Step 3・4 に操作を足すかは、ガイドの文の変更を伴うので決めていない。
