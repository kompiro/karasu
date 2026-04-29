---
type: tooling
---

# AT-0072: VS Code WebView E2E harness — Phase 3 / AT-0038 hint visibility

## 概要

Phase 2 (#964 / AT-0071) の harness 上で、AT-0038 の **WebView ツールバー hint
テキスト** に関する 2 つの TC を migrate する
（Issue [#1014](https://github.com/kompiro/karasu/issues/1014) Phase 3、設計は
`docs/design/vscode-webview-e2e-harness.md`）。

Phase 3 / AT-0038 のスコープ:

- AT-0038 用の多階層 fixture（`system / service / domain` を含む）を
  `run-webview-tests.mjs` でディスクへ書き出し、`KARASU_E2E_FIXTURE_KRS_AT0038`
  経由でテストへ渡す
- Test を 1 ファイル追加: `at-0038-cmd-click-hint.test.ts` に TC-01 / TC-02 を
  describe で並べる
  - TC-01: root view で `#jump-hint` が visible かつ `Cmd/Ctrl+Click to jump`
    を含むこと
  - TC-02: parent node（`OrderService`）を drill-down した後も `#jump-hint`
    が visible のままであること
- AT-0038 の Coverage policy を "Manual" → "Partial automation" に更新（TC-01/02
  のみ自動化、TC-03..TC-05 は引き続き ADR-20260428-05 manual）

技術ポイント:

1. **drill-down は extension host 側で `webview.html` を再代入し、iframe
   の document を入れ替える**。Selenium の current frame コンテキストが
   無効化されるため、click の直後に一旦 `switchBack` してから
   `switchToFrame` で再アタッチする必要がある。
2. **SVG `<g>` の coordinate-based click は親グループに流れやすい**
   （OrderService の bounding box は子要素を含むので、center 座標が
   ECommerce の rect に乗ることがある）。`dispatchEvent` で `e.target` を
   厳密に指定する。
3. **drill 後の breadcrumb は祖先チェーン全体を展開する**（OrderService の
   metadata viewPath が `['ECommerce', 'OrderService']` のため `Root ›
   ECommerce › OrderService` になる）。TC-02 の本旨は「drill 後も hint が
   見える」なので、`segments.length > 1` でアサートする。
4. **fixture には parent ノードが必要**。AT-0039 の fixture（`Customer` /
   `OrderService` がいずれも leaf）は drill-down 用件を満たさないので、
   AT-0038 専用に `service > domain` 階層を持つ別 fixture を出力する。

## 前提条件

- Phase 2 の harness（`packages/vscode-e2e/run-webview-tests.mjs`、
  `vscode-webview-e2e` workflow ジョブ）が main にある
- ローカル GUI が無い場合は `xvfb-run` 経由で実行する

## 受け入れ条件

### AC-1: AT-0038 TC-01 / TC-02 が PASS する

- [x] TC-01: root view で `#jump-hint` が visible + テキスト一致
> 🟡 Partially automated — `packages/vscode-e2e/tests/webview/at-0038-cmd-click-hint.test.ts` › `TC-01: shows the hint text in the toolbar on the root view` (CI は `vscode-webview-e2e` ラベル opt-in、xvfb 必要のため required check には昇格しない)

- [x] TC-02: `OrderService` drill-down 後も `#jump-hint` が visible
> 🟡 Partially automated — `packages/vscode-e2e/tests/webview/at-0038-cmd-click-hint.test.ts` › `TC-02: keeps the hint visible after drilling into a parent node` (CI は `vscode-webview-e2e` ラベル opt-in、xvfb 必要のため required check には昇格しない)

### AC-2: AT-0038 の Coverage policy が更新される

- [ ] `docs/acceptance/0038-vscode-phase4-5-cmd-click-hint.md` の Coverage policy が "Manual" → "Partial automation" に変わっている
- [ ] TC-03..TC-05（modifier-click 経由の editor jump）は依然 ADR-20260428-05 manual で運用される旨が明記されている

> 上記 2 項目は本 PR 内のドキュメント編集で対応済み。リリース QA で目視レビューする。

## 自動化された検証

- `packages/vscode-e2e/tests/webview/at-0038-cmd-click-hint.test.ts` —
  本 Phase の本体テスト。CI は `vscode-webview-e2e` ラベルでオプトイン。

## 手動確認項目

- [ ] ローカルで `pnpm --filter @karasu-tools/vscode-e2e run test:webview` を
  実行し、3 スイート（runner smoke + AT-0039 + AT-0038）がすべて PASS する
  ことを目視確認する。
- [ ] 失敗した場合は `packages/vscode-e2e/test-resources/screenshots/` の
  状態を見て、selector 関連のリグレッションか / VS Code 起動シーケンスの
  揺れかを切り分ける。

## スコープ外

- AT-0038 TC-03..TC-05（modifier-click + plain-click → editor jump） — Phase 3
  内の別 PR で対応（active TextEditor の cursor 位置 assertion が必要）
- AT-0037-9 / AT-0042-vscode の自動化 — Phase 3 内の別 PR
- AT-0039 残り TC（description / link / Jump-to-editor / [ⓘ] ボタン） — Phase 3
  内の別 PR
- ADR-20260428-05 の supersede — Phase 3 完了時に実施

## 関連

- Issue: [#1014](https://github.com/kompiro/karasu/issues/1014)
- 設計: `docs/design/vscode-webview-e2e-harness.md`
- Phase 2 AT: `docs/acceptance/0071-vscode-webview-e2e-phase2.md`
- 既存 ADR: ADR-20260428-03（拡張ホスト smoke）, ADR-20260428-05（マニュアル運用 — Phase 3 完了時に supersede 予定）
