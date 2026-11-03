# 初回体験のツアーで、ステップが求めた操作をしたことを示す

- **日付**: 2026-11-04
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3599](https://github.com/kompiro/karasu/issues/3599)（Phase 2 Epic [#3602](https://github.com/kompiro/karasu/issues/3602)、PRD [#3573](https://github.com/kompiro/karasu/issues/3573) §11「ガイドの操作完了の自動検知」、§4「Preserve user control」）
  - 関連 TPL: [TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)（派生状態の陳腐化）、[TPL-1534](../test-perspectives/TPL-1534-cancel-stale-async-effect-results.md)（遅れて届く非同期の結果）
  - コード: `packages/app/src/components/first-run/tour-steps.ts`、`TourPanel.tsx`、`FirstRunExperience.tsx`、`packages/app/src/hooks/useAppViews.ts`（チーム依存の表示）、`packages/app/src/hooks/useShareDialog.ts`（Share ダイアログ）

## 背景・課題

ステップの文は操作を頼む（Step 1「コマースアプリケーションをクリックして中のドメインを見る」、Step 2「チーム依存を見る」、
Step 5「共有する」）。Phase 1 は Next でしか進まず、頼んだ操作を訪問者がしたかどうかをパネルが知らない。
した人には「それでよい」と、していない人には「何をすればよいか」が伝わらない。

## 現状（インベントリ）

| ステップ | 文が頼む操作 | その状態がある場所 |
| --- | --- | --- |
| 1. 現在のシステム | コマースアプリケーションをクリックしてドリルダウン | app の reducer の `viewPath`（`useAppContext` で読める） |
| 2. 組織の境界 | Org ビューでチーム依存を見る | `useAppViews` の `isTeamDependenciesOpen`（AppShell の中。FirstRunExperience からは見えない） |
| 3. 計画 | 差分を見る（操作は頼まない） | — |
| 4. 移行途中 | 問いを話し合う（操作は頼まない） | — |
| 5. 共有 | 共有リンクを作る / SVG を書き出す | `useShareDialog` の `shareOpen`（PreviewColumn の中）、SVG 書き出しの handler |

`FirstRunExperience` は `ProjectModeApp` に置かれ、AppShell より外にいる。reducer の状態は読めるが、
チーム依存の表示と Share ダイアログは各コンポーネントの local state にある。

## 制約・前提

- PRD §4「Preserve user control」：ツアーは訪問者の操作を妨げない。
- 操作を頼まないステップ（3・4）は、完了を示さない。
- 条件に書くノード id はサンプルにあることをテストで縛る（Phase 1 のガイドの主張と同じく、`packages/core/src/examples.test.ts` か tour-steps のテスト）。
- 完了の判定のために、ツアー以外の機能の振る舞いを変えない。

## 検討した選択肢

### 決めること 1：示すだけか、自動で進めるか

#### 案A: 示すだけ（✓ と Next の強調）

条件を満たしたら、ステップの見出しの横に ✓、Next を強調する。進むのは訪問者が Next を押したとき。

**メリット**: 訪問者が自分のペースで見続けられる（Step 1 でドリルダウンしたあと、中を見ている途中で次へ飛ばされない）。
**デメリット**: 1 クリック余計にかかる。

#### 案B: 自動で次へ進める

**メリット**: 操作が少ない。
**デメリット**: 操作の直後に画面（ファイル・ビュー・差分）が切り替わり、操作の結果を見る前に次のシーンになる。
「Preserve user control」に反する。

### 決めること 2：ツアーの外の状態をどう知るか

#### 案1: reducer の状態だけを見る

**メリット**: 新しい経路が要らない。
**デメリット**: Step 2・5 の操作は reducer に無いので判定できない。

#### 案2: 小さな通知の store に、その機能が自分の出来事を書く

`preview-reveal.ts`（#3583）と同じ形の module store に、チーム依存を開いた・Share ダイアログを開いた・
SVG を書き出した、を各機能が 1 行で書く。ツアーはそれを読む。

**メリット**: 各機能の振る舞いは変わらず、書く行が増えるだけ。ツアーが居ないときは誰も読まない。
**デメリット**: 機能側にツアー向けの 1 行が入る（名前は「ツアー」ではなく「出来事」にして、ほかの読み手も使えるようにする）。

#### 案3: DOM を観察する（aria-pressed や dialog の出現）

**メリット**: 機能側を触らない。
**デメリット**: 表示の文言・構造の変更で黙って壊れる。e2e の locator と同じ脆さを本番コードが持つ。

## 比較

| 観点 | 案1 | 案2 | 案3 |
| --- | --- | --- | --- |
| 判定できるステップ | 1 | 1・2・5 | 1・2・5 |
| 機能側の変更 | なし | 出来事を書く 1 行ずつ | なし |
| 壊れ方 | — | 書き忘れはテストで捕まる | 表示の変更で黙って壊れる |

## 現時点の方針

**案A + 案2 を採用する。** 自動で進めると操作の結果を見る前に画面が変わり、PRD の「Preserve user control」に反する。
判定は、reducer にあるもの（Step 1 の `viewPath`）は reducer から、無いもの（Step 2・5）は出来事の store から読む。

### 確定させる規則

- `TourStep` に `done?: (o: TourObservation) => boolean` を足す。`TourObservation` は
  `{ viewPath, activeView, events: Set<TourEvent> }`。`TourEvent` は `"team-dependencies-shown" | "share-opened" | "svg-exported"`。
- 条件：Step 1 は system ビューの `viewPath` に `CommerceApp` を含む。Step 2 は `team-dependencies-shown`。
  Step 5 は `share-opened` か `svg-exported`。Step 3・4 は条件を持たない（✓ を出さない）。
- **出来事はステップを移るときに空にする**（そのステップの中で起きたものだけを数える。前のステップの出来事で ✓ が出ない。TPL-1032）。
- **一度満たしたら、そのステップにいるあいだは ✓ を残す**（ドリルダウンから戻っても消さない。✓ が点いたり消えたりしない）。
- パネル：✓ と「できました」の短い文（en / ja）。Next は `variant="actionable"` のまま強調の見た目だけ変える（aria で状態を伝える）。

### 実装の指針

1. `packages/app/src/state/app-events.ts`：`reportAppEvent(event)` / `useAppEvents()`（`preview-reveal.ts` と同じ module store）。
2. 書く場所：`useAppViews` のチーム依存の toggle（開いたときだけ）、`useShareDialog` の open、SVG 書き出しの handler。
3. `tour-steps.ts` に `done`、`TourPanel` に ✓ と文、`FirstRunExperience` でステップごとの出来事の集合を持つ。
4. テスト：
   - unit：各ステップの `done`、ステップを移ると出来事が空になる、満たしたあと条件が外れても ✓ が残る
   - サンプルの縛り：`done` が名指すノード id がサンプルにある
   - e2e：Step 1 でコマースアプリケーションを開くと ✓、Step 2 でチーム依存を開くと ✓、Step 5 で Share を開くと ✓、Step 3・4 には出ない
5. AT：`docs/acceptance/first-run-experience.md` に項目を足す（すべて自動）。
6. ADR 昇格：実装の PR が通ったあと、ADR-3599 として昇格し、本 Design Doc を削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: ツアー中の表示だけ。出来事の store は読み手がいなければ何もしない。
- ドキュメント更新: `docs/tools/app.md` / `app.ja.md` の「First visit」節に 1 文。
- テスト・examples への影響: なし。

## 未解決の問い / 決めないこと

- Step 3・4 に操作を足す（例：差分のノードを開く）かは、ガイドの文の変更を伴うので本 Doc では決めない。
- 出来事の store をツアー以外（たとえば将来のヘルプ）が使うかは決めない。名前だけ汎用にしておく。
