---
type: tooling
---

# AT-0075: VS Code WebView E2E harness — Phase 3 / AT-0039 残り TC

## 概要

AT-0071 (#964) で TC-01 まで自動化していた AT-0039（Phase 6 detail panel）の
残り TC を ExTester WebView ハーネスへ移植する
（Issue [#1014](https://github.com/kompiro/karasu/issues/1014) Phase 3、設計は
`docs/design/vscode-webview-e2e-harness.md`）。

## スコープ

既存 `packages/vscode-e2e/tests/webview/at-0039-detail-panel.test.ts` を
単一 `it()` から `before/after` + 6 つの `it()` に restructure し、AT-0039 の
仕様 TC を可能な限り移植する。

| TC | 内容 | この PR での扱い |
|----|------|------------------|
| TC-01 | 葉ノード（Customer）クリックで detail panel が開く | 既存自動化を維持 |
| TC-02 | panel に description (Markdown) / links / team / role が表示される | 新規自動化（OrderService の ⓘ 経由） |
| TC-03 | "Jump to editor" ボタンで editor cursor が `Customer` 行に移動 + panel は開いたまま | 新規自動化 |
| TC-04 | × ボタンと click-outside で panel が閉じる | 新規自動化 |
| TC-05 | Cmd/Ctrl+Click → editor jump, no panel | AT-0038 TC-03/04 で代替自動化済み |
| TC-06 | parent への ⓘ ボタン click は drill しない／plain click は drill | ⓘ 部分を新規自動化、plain-click 部分は AT-0038 TC-02 で代替自動化済み |
| TC-07 | Links を click すると URL が外部ブラウザで開く | **manual のまま** — `vscode.env.openExternal` の検証パスが WebView から無いため |
| TC-08 | panel が開いている間 tooltip が抑制される | 新規自動化 |
| TC-09 | ツールバーの hint text が更新される | AT-0038 TC-01 で代替自動化済み |

AT-0039 fixture を spec に合わせて拡張: OrderService に複数行 description
（`description """..."""` 形式）/ link / team を追加、leaf 用の
OrderManagement と Inventory を追加（OrderService が drill 可能になる）。

技術ポイント:

1. **dispatchEvent パターン**は AT-0038 と同じ。click は `MouseEvent` を
   element 上に直接 dispatch して、Selenium の coordinate-based click が
   nested SVG group を取り違える問題を回避する。
2. **ⓘ ボタンは `[data-info-button="<nodeId>"]`** として SVG にレンダリング
   されており、click handler は `e.target.closest('[data-info-button]')` を
   見て panel を開く（drill には進まない）。AT 自動化はこのセレクタに対して
   dispatchEvent する。
3. **tooltip 抑制**は WebView 側の `mousemove` handler で
   `currentDetailNodeId` truthy チェックで実装されている。テストは
   `mousemove` を element 中央で synthesize し、`#karasu-tooltip` の
   `style.display` を読んで検証する。
4. **simple-dialog の retry pattern** は AT-0038 と同じ 3-attempt（ESC で
   既存ダイアログを dismiss → 再 open）を踏襲。memory file
   `feedback_webview_simple_dialog_flake.md` 参照。
5. **TC-07 の external browser 検証は WebView から不可**。link click は
   `postMessage({ type: 'openExternal', url })` を投げるところまでは
   観測できるが、extension host 側の `vscode.env.openExternal` 呼び出しは
   観測できない（ADR-20260428-05 の「拡張ホストスタブ禁止」ルールに沿って
   manual のまま据え置き）。

## 前提条件

- AT-0072 / AT-0073 / AT-0074 の harness が main にある
- LSP packaging fix (#1024) が適用済み（TC-03 の Jump-to-editor が installed
  mode で動作するため）
- ローカル GUI が無い場合は `xvfb-run` 経由で実行する

## 受け入れ条件

### AC-1: AT-0039 TC-01..TC-04, TC-06, TC-08 が PASS する

- [x] TC-01: 葉ノードクリックで detail panel が開く
> ✅ Automated — `packages/vscode-e2e/tests/webview/at-0039-detail-panel.test.ts` › `TC-01: clicking a leaf node (Customer) opens the detail panel` (CI は `vscode-webview-e2e` ラベル opt-in、xvfb 必要のため required check には昇格しない)

- [x] TC-02: panel に description (Markdown) / links / team が表示される
> ✅ Automated — `packages/vscode-e2e/tests/webview/at-0039-detail-panel.test.ts` › `TC-02: detail panel shows description / links / properties (OrderService via ⓘ)` (CI は `vscode-webview-e2e` ラベル opt-in、xvfb 必要のため required check には昇格しない)

- [x] TC-03: Jump to editor ボタンで cursor が移動 + panel は開いたまま
> ✅ Automated — `packages/vscode-e2e/tests/webview/at-0039-detail-panel.test.ts` › `TC-03: Jump to editor button moves the .krs editor cursor and leaves the panel open` (CI は `vscode-webview-e2e` ラベル opt-in、xvfb 必要のため required check には昇格しない)

- [x] TC-04: × ボタンと click-outside で panel が閉じる
> ✅ Automated — `packages/vscode-e2e/tests/webview/at-0039-detail-panel.test.ts` › `TC-04: × close button dismisses the panel; click-outside also dismisses it` (CI は `vscode-webview-e2e` ラベル opt-in、xvfb 必要のため required check には昇格しない)

- [x] TC-06: parent への ⓘ click は drill しない
> ✅ Automated — `packages/vscode-e2e/tests/webview/at-0039-detail-panel.test.ts` › `TC-06: ⓘ info button on a parent does not drill the preview` (CI は `vscode-webview-e2e` ラベル opt-in、xvfb 必要のため required check には昇格しない)

- [x] TC-08: panel 開いている間 tooltip 抑制
> ✅ Automated — `packages/vscode-e2e/tests/webview/at-0039-detail-panel.test.ts` › `TC-08: tooltip is suppressed while the detail panel is open` (CI は `vscode-webview-e2e` ラベル opt-in、xvfb 必要のため required check には昇格しない)

### AC-2: AT-0039 doc の Coverage policy が更新される

- [ ] `docs/acceptance/0039-vscode-phase6-detail-panel.md` の Coverage policy
  に TC-01..TC-04, TC-06, TC-08 の自動化先と TC-05/TC-07/TC-09 の補足が
  記述されている

> 上記項目は本 PR 内のドキュメント編集で対応済み。リリース QA で目視レビューする。

## 自動化された検証

- `packages/vscode-e2e/tests/webview/at-0039-detail-panel.test.ts` —
  6 つの `it()`。CI は `vscode-webview-e2e` ラベルでオプトイン。

## 手動確認項目

- [ ] ローカルで `pnpm --filter @karasu-tools/vscode-e2e run test:webview` を
  実行し、suite 全体（runner smoke + AT-0037-9/AT-0038 5 + AT-0039 6 = 12
  passing）がすべて PASS することを目視確認する。
- [ ] **TC-07 の手動確認**: F5 で extension dev host を起動し、AT-0039 fixture
  を開いて preview の OrderService ⓘ ボタン → "Design Wiki" link をクリック →
  デフォルトブラウザで `https://wiki.example.com/order` が開くことを確認する。

## スコープ外

- AT-0042-vscode（cross-diagram navigation） — Phase 3 内の別 PR
- TC-07（external browser launch） — production seam を増やしたくないため
  manual 据え置き
- ADR-20260428-05 の supersede — Phase 3 完了時（AT-0042-vscode 移植後）に実施

## 関連

- Issue: [#1014](https://github.com/kompiro/karasu/issues/1014)
- 設計: `docs/design/vscode-webview-e2e-harness.md`
- 既存 TC-01 自動化: `docs/acceptance/0071-vscode-webview-e2e-phase2.md`
- 既存 ADR: ADR-20260428-03（拡張ホスト smoke）, ADR-20260428-05（マニュアル運用 — Phase 3 完了時に supersede 予定）
