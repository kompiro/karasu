---
id: ADR-20260428-05
title: VS Code WebView の DOM 系テストはマニュアル運用とする
status: superseded
superseded_by: ADR-20260429-08
date: 2026-04-28
topic: testing
related_to:
  - ADR-20260428-03
scope:
  packages:
    - vscode
    - vscode-e2e
  concerns: []
assumptions:
  - "file: packages/vscode-e2e/.vscode-test.mjs"
  - "file: packages/vscode/src/preview-panel.ts"
  - "file: .claude/rules/vscode-webview-tests.md"
  - "file: docs/acceptance/0037-vscode-phase5-standard-lsp.md"
  - "file: docs/acceptance/0038-vscode-phase4-5-cmd-click-hint.md"
  - "file: docs/acceptance/0039-vscode-phase6-detail-panel.md"
  - "file: docs/acceptance/0042-vscode-cross-diagram-navigation.md"
---

# ADR-20260428-05: VS Code WebView の DOM 系テストはマニュアル運用とする

- **日付**: 2026-04-28
- **ステータス**: 廃止（2026-04-29 ADR-20260429-08 で supersede）
- **関連**:
  - ADR-20260428-03 — VS Code 拡張ホスト向け smoke test harness
  - 親 Issue #597 — remaining E2E candidates after #534 rollout
  - 影響 Issue: #868（AT-0038）, #869（AT-0039）, AT-0042-vscode
  - フォローアップ Issue: #928 — WebView E2E harness を建てる際のトラッカー

## 背景

ADR-20260428-03 で導入した `packages/vscode-e2e` は `@vscode/test-cli` を
使い、Mocha スイートを **拡張ホスト（Electron のメインプロセス側）** で
実行する。`vscode` API には直接アクセスできるため、LSP（補完・F12・ホバー・
Outline・診断）や `karasu.openPreview` のようなコマンド層は十分自動化できる。

一方、karasu のプレビューは VS Code の **WebView** として実装されている
（`packages/vscode/src/preview-panel.ts`）。WebView は隔離された iframe で、
拡張ホスト側のテストコードからは DOM/`window`/click イベントへ直接到達できない。

この制約により、以下の AT は harness で完全自動化できないことが分かった:

- **AT-0037-9** — エディタ ↔ SVG プレビュー間の双方向ジャンプ（クリック側）
- **AT-0038（全 TC）** — Cmd/Ctrl+Click ヒントテキストの表示と modifier クリック挙動
- **AT-0039（全 TC）** — 詳細パネルの表示 / リンク / Jump to editor ボタン
- **AT-0042-vscode（全 TC）** — クロス図ナビゲーション（team → Org / service → Deploy）

これらに薄い拡張ホスト側のスタブを書いてもテストの主目的（WebView 上の
ユーザー体験）を検証できないため、無理に自動化しても価値が低い。

## 決定

**WebView の DOM・スタイル・クリックハンドラに依存する AT は、当面マニュアル
テストで運用する。** harness（`packages/vscode-e2e`）には WebView 越しの
スタブテストを書かない。各 AT のドキュメントに「manual coverage」と明記し、
リリース QA で `/qa` フローに乗せて手で確認する。

将来 WebView も自動で操作したくなったら、**#928（WebView E2E harness
トラッカー）から Design Doc を起こす**。候補は以下:

- VS Code 拡張ホスト + `@vscode/test-electron` + Playwright を組み合わせて
  Electron に CDP 接続し、WebView の iframe DOM を駆動する（実装例は
  `vscode-extension-tester` 周辺にある）
- Microsoft 内部で使われている `@vscode/test-web` 系の経路

いずれも本 ADR のスコープ外で、LSP 系 AT の自動化（#867 完了）と
独立して進める。

## 理由

- WebView を自動操作する infra は重い（CDP 接続・iframe 識別・waitFor 系
  ユーティリティ）。ROI に見合う AT がまだ 4 件しかない。
- 手で 5 分動かせば全 TC が確認できる。CI で毎回回す必要は薄い。
- harness にスタブだけ書くと「テストはあるのに実際の挙動を検証していない」
  状態になり、緑になっていても安心できない。マニュアル明記の方が誠実。

## 却下した代替

| 案                                                          | 却下理由                                                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 拡張ホスト側のメッセージハンドラだけスタブテスト             | WebView のクリック → postMessage 部分が抜け落ちるので AT の意図を満たせない                     |
| `handleNavigate` 等を export して直接呼ぶテストを書く        | 本番コードに「テスト用 export」シームを増やす割に得られる検証範囲が狭い                          |
| Playwright on Electron で WebView を駆動                     | 本 ADR と並行で導入するとスコープが大きくなる。別 Issue として分離                              |

## 影響

- AT-0037-9 / AT-0038 / AT-0039 / AT-0042-vscode の冒頭に
  「**Coverage policy: manual** — see ADR-20260428-05」を明記する。
- `.claude/rules/vscode-webview-tests.md` で同方針を Claude にも徹底させる。
  以降「VS Code 拡張の WebView 周りの AT を自動化したい」という依頼が来ても、
  本 ADR をもとに WebView harness 検討にリダイレクトする。
- #868（AT-0038 自動化）、#869（AT-0039 自動化）は本 ADR をもって close する
  運用とし、後続の「WebView E2E harness」Issue を立てる際にまとめて参照する。
- harness（`packages/vscode-e2e`）の対象範囲は LSP / コマンド / 拡張アクティ
  ベーションに限定する。
