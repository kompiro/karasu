---
paths:
  - "packages/vscode-e2e/**"
  - "packages/vscode/src/preview-panel.ts"
  - "docs/acceptance/0037-vscode-*.md"
  - "docs/acceptance/0038-vscode-*.md"
  - "docs/acceptance/0039-vscode-*.md"
  - "docs/acceptance/0042-vscode-*.md"
---

# VS Code WebView Test Rules

VS Code 拡張のプレビュー（`packages/vscode/src/preview-panel.ts`）は WebView
として実装されている。以下のルールは ADR-20260428-05 で決定済み。

## ルール

1. **WebView の DOM / スタイル / クリックハンドラに依存する AT は、harness
   （`packages/vscode-e2e`）で自動化しない。マニュアルテストで運用する。**

   `@vscode/test-cli` のテストは **拡張ホスト側** で動くので、隔離された
   WebView の iframe には到達できない。これに該当するのは:

   - 「Webview のツールバーに〜が表示される」「ヒントテキストが見える」など
     描画系の TC
   - 「ノードをクリックすると〜」「Cmd+Click で〜」など WebView 上の click
     ハンドラに依存する TC
   - 「詳細パネルに〜が並ぶ」など WebView の DOM 構造を assert する TC

2. **harness で書いてよいのは「拡張ホスト側で完結する」テストだけ。** 具体的には:

   - LSP プロバイダ（補完・F12・ホバー・診断・Outline）
   - 拡張のアクティベーション、コマンド登録、`vscode.workspace` API の挙動
   - LSP のカスタムリクエスト（`karasu/nodeAtPosition`,
     `karasu/positionOfNode`）が正しい結果を返すこと

3. **WebView 由来のテストを「拡張ホスト側のスタブ」だけで偽装しない。**
   `webview.postMessage` を直接呼ぶ・`handleNavigate` を export して呼ぶ等の
   手段で部分的にカバーすると、テストは緑だが実際の WebView 上の挙動は壊れている、
   という状態を作りやすい。本番のシームを増やすコストに対して得られる検証範囲が
   狭いため、原則禁止する。

4. **本 ADR の方針を覆したいときは別 Issue で WebView E2E harness の
   Design Doc から始める。** `vscode-extension-tester` / Playwright on
   Electron / `@vscode/test-web` などの選択肢があり、本 ADR と独立して
   評価する。

## AT ファイルへの記述

WebView 依存の AT は冒頭に以下を含める:

```
## Coverage policy

**Manual** — see [ADR-20260428-05](../adr/20260428-05-vscode-webview-manual-tests.md).
This AT exercises the karasu preview WebView, which is unreachable from the
`packages/vscode-e2e` harness. Verify by hand during release QA.
```

部分的に WebView 依存の AT（例: AT-0037 の TC-9 だけが WebView）は、当該 TC
セクションの直下に同じ注記を入れる。

## 関連

- ADR-20260428-05 — VS Code WebView の DOM 系テストはマニュアル運用とする
- ADR-20260428-03 — VS Code 拡張ホスト向け smoke test harness
