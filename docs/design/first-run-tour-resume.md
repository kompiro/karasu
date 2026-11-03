# 初回体験のツアーを再読み込みや共有からの戻りで再開する

- **日付**: 2026-11-04
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3598](https://github.com/kompiro/karasu/issues/3598)（Phase 2 Epic [#3602](https://github.com/kompiro/karasu/issues/3602)、PRD [#3573](https://github.com/kompiro/karasu/issues/3573) §11「共有先から戻った際の文脈維持」）
  - 関連 TPL: [TPL-1534](../test-perspectives/TPL-1534-cancel-stale-async-effect-results.md)（遅れて届く非同期の結果）、[TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)（派生状態の陳腐化）
  - コード: `packages/app/src/components/first-run/FirstRunExperience.tsx`、`welcome-gate.ts`、`use-guided-scene.ts`

## 背景・課題

Phase 1 のツアーは `FirstRunExperience` の React state（`guide`）にしかない。Step 5 は Share を案内するが、
作ったリンクを同じタブで開く、再読み込みする、タブを閉じて開き直す、のどれでもツアーは消え、
同じステップに戻る手段が無い（Restart Guided Tour… は Step 1 からになる、#3597）。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| ツアーの状態 | `guide: { kind: "tour", root, step, run }`。`root` はサンプルのプロジェクトの `rootPath` |
| シーンの適用 | `useGuidedScene`。プロジェクトを離れて戻ると `reapplyOnReturn` で同じシーンを当て直す |
| 永続化済みの初回体験の状態 | `localStorage["karasu-welcome-dismissed"]`（`welcome-gate.ts`）。読み書きは try で包み、失敗しても既定の動作になる |
| deep link の判定 | `hasDeepLink(location)`：`?example` / `?krs` / `#krs-` / `#s=` |
| プロジェクトの識別 | `Project.id`（不変）と `rootPath`。名前は変えられる |

## 制約・前提

- Welcome と同じく、特定の場所へのリンクで開いたときは邪魔をしない。
- 保存先が使えない（プライベートウィンドウ、ストレージの拒否）ときは、今の動作（再開しない）に落ちる。
- 再開しても、訪問者のモデルを変えない（シーンはファイル・ビュー・差分の選択だけ）。
- 共有リンク（`#s=`）の先は別の表示であり、そこにツアーを出すことは範囲外。

## 検討した選択肢

### 案1: localStorage に `{ projectId, step }` を置く

ツアーを始めた・ステップを動かしたときに書き、Skip / Continue to editor で消す。起動時に読み、
そのプロジェクトがまだあれば同じステップのツアーとして復元する。

**メリット**

- Welcome の記録と同じ置き場・同じ失敗時の扱いで済む。
- `projectId` で引くので、プロジェクト名を変えても、`rootPath` が変わっても追える。

**デメリット**

- ブラウザごと・プロファイルごとの状態になる（端末をまたがない）。初回体験としては問題にならない。

### 案2: OPFS のプロジェクトのメタデータに持つ

**メリット**

- プロジェクトと一緒に消えるので、陳腐化の判定が要らない。

**デメリット**

- ツアーはアプリの状態であってプロジェクトの内容ではない。プロジェクトの書き出しや複製にツアーの状態が混ざる。
- 書き込みが非同期になり、ステップの移動のたびに OPFS へ書く。

### 案3: URL（hash / query）に持つ

**メリット**

- 再読み込みでは確実に残る。

**デメリット**

- hash は deep permalink（`#krs-…`）と共有（`#s=`）が使っている。共有リンクにツアーの状態が乗ると、受け取った人の画面にツアーが出る。
- タブを閉じて開き直すと消える。

## 現時点の方針

**案1 を採用する。** Welcome の記録と同じ規律（localStorage、try で包む、失敗したら既定の動作）に乗せられ、
プロジェクトの内容を汚さず、共有リンクにも漏れない。

### 確定させる規則

- **保存**: `localStorage["karasu-first-run-tour"] = { projectId, step }`。ツアーを始めたとき（Welcome の
  Design a service split、Restart Guided Tour…）とステップを動かしたときに書く。
- **消す**: Skip、Continue to editor（最終ステップ）、保存先のプロジェクトが見つからないとき。
- **復元**: 起動時、`hasDeepLink(initialLocation)` が偽で、保存された `projectId` のプロジェクトがあれば、
  `{ kind: "tour", root: project.rootPath, step, run }` として復元する。シーンの適用は今の
  `useGuidedScene` がそのまま行う（起動時に開くプロジェクトが別なら、ツアーのプロジェクトへ戻ったときに当たる。
  パネルの表示条件も今と同じで、ツアーのプロジェクトを開いているときだけ出る）。
- **deep link で開いた起動**: 復元しないが、記録は消さない（リンク先を見たあと、次の通常の起動で戻れる）。
- **範囲外の値**: `step` がツアーの長さの外、形が違う JSON は、記録ごと捨てる（壊れた記録で再開しない）。
- **Track architecture evolution の 1 回きりのシーン**: 保存しない（ツアーではない）。

### 実装の指針

1. `packages/app/src/components/first-run/tour-progress.ts`：`readTourProgress(storage?)` / `writeTourProgress` /
   `clearTourProgress`。`welcome-gate.ts` と同じく `storage` を引数で差し替えられるようにし、読み書きの失敗は握りつぶす。
2. `FirstRunExperience`：`guide` の変化に合わせて書く・消す effect と、起動時の 1 回の復元。復元は
   `projects` が読み込まれた後（空の一覧で「プロジェクトが無い」と判定して記録を消さない。TPL-1032）。
3. テスト：
   - unit（jsdom）：読み書き、範囲外の値・壊れた JSON・ストレージが例外を投げる場合
   - e2e：Step 3 で再読み込みすると 3 / 5 と差分が戻る、Skip のあと再読み込みしても出ない、deep link で開くと出ず、
     そのあと通常に開くと戻る
4. AT：`docs/acceptance/first-run-experience.md` に再開の項目を足す（すべて自動）。
5. ADR 昇格：実装の PR が通ったあと、ADR-3598 として昇格し、本 Design Doc を削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: ツアーを途中でやめずに閉じた人だけ、次に開いたとき同じステップに戻る。それ以外は変わらない。
- ドキュメント更新: `docs/tools/app.md` / `app.ja.md` の「First visit」節に 1 文。
- テスト・examples への影響: e2e の opfs fixture は localStorage を毎回消すので、ほかの spec には影響しない。

## 未解決の問い / 決めないこと

- 記録の有効期限は設けない。プロジェクトが残っていれば何日後でも戻る。必要になったら別に決める。
- 端末をまたいだ再開は扱わない（アカウントが無い）。
