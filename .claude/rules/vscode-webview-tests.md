---
paths:
  - "packages/vscode-e2e/**"
  - "packages/vscode/src/preview-panel.ts"
  - "docs/acceptance/*-vscode-*.md"
---

# VS Code WebView Test Rules

VS Code 拡張のプレビュー（`packages/vscode/src/preview-panel.ts`）は WebView
として実装されている。WebView 系テストの方針は **ADR-20260429-08** で
更新済み（旧 ADR-20260428-05 を supersede）。

## ルール

1. **WebView の DOM / スタイル / クリックハンドラに依存する AT は、
   `packages/vscode-e2e/tests/webview/` 配下の ExTester ハーネスで自動化する。**

   `pnpm --filter @karasu-tools/vscode-e2e run test:webview` でローカル実行
   できる。CI は `vscode-webview-e2e` ラベル opt-in（required check には
   昇格しない）。

   既存の `@vscode/test-cli` ベース smoke は LSP / コマンド層など拡張ホスト
   側で完結するテスト用に残す（ADR-20260428-03）。

2. **新規 WebView テストは既存 suite に co-locate する**。`File: Open File...`
   simple-dialog は xvfb 上で 2 回目以降の open に intermittent に stall する
   ため、新規 test file を増やすほど flake リスクが上がる（メモリ
   `feedback_webview_simple_dialog_flake.md` 参照）。
   - AT-0038 hint / Cmd+click → `at-0038-cmd-click-hint.test.ts`
   - AT-0037-9 / AT-0039 / AT-0042-vscode → `at-0039-detail-panel.test.ts`
     （複数 AT を 1 ファイルに co-locate 済み）
   - やむを得ず別ファイルにする場合は、既存ファイルが採用している 3-attempt
     retry パターン（ESC dismiss → re-open → 7s per-attempt timeout）を必ず
     踏襲する。

3. **拡張ホスト側スタブで WebView 動作を偽装しない**。
   `webview.postMessage` を直接呼ぶ・`handleNavigate` を export して呼ぶ等の
   手段で部分的にカバーすると、テストは緑だが実際の WebView 上の挙動は
   壊れている、という状態を作りやすい。本番のシームを増やすコストに対して
   得られる検証範囲が狭いため、ADR-20260429-08 でも維持されている禁止事項。

4. **WebView 操作の確立済みパターン**:
   - **Click**: `MouseEvent` を `dispatchEvent` で element に直接送る
     （Selenium の coordinate-based click が nested SVG group を取り違える
     のを回避）。modifier-click は `{ ctrlKey: true, metaKey: true }` を
     synthesize して xvfb の OS keyboard を使わない。
   - **Drill-down / view switch 後の frame 再取得**: 拡張ホストが
     `webview.html` を再代入するため iframe context が無効化される。
     `webview.switchBack()` → `driver.sleep(800)` → `webview.switchToFrame()`
     で再取得する。
   - **Editor cursor の検証**: `webview.switchBack()` → `EditorView.openEditor(...)`
     → `TextEditor.getCoordinates()`。エディタを focus すると preview が
     再 render されるので、panel state は focus 前に assert しておく。

5. **マニュアル QA で残す TC**（自動化が原理的に困難なケース）:
   - **AT-0039 TC-07**: Links link → 外部ブラウザで開く挙動。
     `vscode.env.openExternal` の実呼び出し検証は本番コードに seam を
     増やすしかないため、ルール 3 に照らして manual のまま据え置く。
   - **AT-0042-vscode TC-3**: section 順序は renderer の固定 source 順で
     担保される静的不変条件。両セクションを同時に持つ live fixture が無い
     ため runtime test 化できない。code review で担保する。

## AT ファイルへの記述

自動化済みの WebView 依存 AT は Coverage policy 節を以下のように書く:

```
## Coverage policy

**Automated (TC-XX..)** — automated in
[`packages/vscode-e2e/tests/webview/<file>.test.ts`](...)
under the WebView E2E harness (see [AT-XXXX](...)).

The harness job is gated on the `vscode-webview-e2e` PR label and is **not**
a required check.
```

manual 残置 TC がある場合は同節内で「TC-XX stays manual」と理由付きで
明示する（AT-0039 doc の TC-07 の書き方を参考に）。

## 関連

- ADR-20260429-08 — VS Code WebView の DOM 系テストは ExTester ハーネスで自動化する
- ADR-20260428-05 — superseded by 上記
- ADR-20260428-03 — VS Code 拡張ホスト向け smoke test harness
