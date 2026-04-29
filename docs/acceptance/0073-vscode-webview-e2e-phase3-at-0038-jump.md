---
type: tooling
---

# AT-0073: VS Code WebView E2E harness — Phase 3 / AT-0038 editor jump

## 概要

Phase 3 / AT-0038 の続編として、AT-0072 (#1017) で hint visibility（TC-01,
TC-02）まで自動化していた `at-0038-cmd-click-hint.test.ts` に **modifier-click
で editor cursor が移動する** TC-03 / TC-04 を追加する
（Issue [#1014](https://github.com/kompiro/karasu/issues/1014) Phase 3、設計は
`docs/design/vscode-webview-e2e-harness.md`）。

スコープ:

- 既存テストファイルを restructure（単一 `it()` → `before/after` + 4 つの
  `it()`）して TC-01 / TC-03 / TC-02 / TC-04 を独立した describe 配下に並べる
- TC-03: root view で `OrderService`（parent）に Cmd/Ctrl+Click → editor cursor が
  `service OrderService` 行に移動 + breadcrumb は `Root` のまま（drill しない）
- TC-04: `OrderService` を drill した後の view で `OrderManagement`（leaf）に
  Cmd/Ctrl+Click → editor cursor が `domain OrderManagement` 行に移動 +
  breadcrumb は drilled 状態のまま（view が変わらない）
- AT-0038 doc の Coverage policy を Automated (TC-01..TC-04) に更新。TC-05
  は Phase 6 の detail panel 実装で意味が変わっており、AT-0039 TC-01 が代替
  自動化済みである旨を明記

技術ポイント:

1. **modifier+click は OS キーボード入力を再現せず、`dispatchEvent` の
   MouseEvent オプションで `{ ctrlKey: true, metaKey: true }` を渡す**。
   WebView の click handler は `e.metaKey || e.ctrlKey` を見るので、
   この合成イベントで navigate path に入る。xvfb 上での Selenium Actions
   API のキー入力に依存しないため、CI 安定性が高い。
2. **navigate 経路は `webview.html` を再代入しない**。`handleNavigate`
   は `editor.selection` を書き換えるだけなので、Cmd/Ctrl+Click 後は
   iframe コンテキストが生きたままで、`switchBack`/`switchToFrame` の
   再アタッチは drill click のときだけで良い。
3. **editor cursor の検証は `EditorView.openEditor(FIXTURE_NAME, 0)` で
   .krs エディタを active 化してから `TextEditor.getCoordinates()` を読む**。
   座標は 1-indexed の `[line, column]` を返すので、fixture の line
   定数（`OrderService=2`, `OrderManagement=3`）と直接比較する。
   読み取り後は `refocusPreview()` で preview を active に戻し、次の TC で
   WebView frame に正しく入れるようにする。
4. **テスト実行順は state-driven（01 → 03 → 02 → 04）**。01/03 はどちらも
   root view で完結し、02 が drill した後の状態を 04 が引き継ぐ。Mocha は
   describe 内 source order で実行するため、自然に状態を引き渡せる。

## 前提条件

- AT-0072 の harness（`packages/vscode-e2e/run-webview-tests.mjs`、
  `vscode-webview-e2e` workflow ジョブ）が main にある
- ローカル GUI が無い場合は `xvfb-run` 経由で実行する

## 受け入れ条件

### AC-1: AT-0038 TC-01..TC-04 が PASS する

- [x] TC-01: root view で `#jump-hint` が visible + テキスト一致
> ✅ Automated — `packages/vscode-e2e/tests/webview/at-0038-cmd-click-hint.test.ts` › `TC-01: shows the hint text on the root view` (CI は `vscode-webview-e2e` ラベル opt-in、xvfb 必要のため required check には昇格しない)

- [x] TC-02: drill 後も `#jump-hint` が visible
> ✅ Automated — `packages/vscode-e2e/tests/webview/at-0038-cmd-click-hint.test.ts` › `TC-02: keeps the hint visible after plain-clicking a parent node to drill in` (CI は `vscode-webview-e2e` ラベル opt-in、xvfb 必要のため required check には昇格しない)

- [x] TC-03: parent への Cmd/Ctrl+Click で editor cursor が移動 + drill しない
> ✅ Automated — `packages/vscode-e2e/tests/webview/at-0038-cmd-click-hint.test.ts` › `TC-03: Cmd/Ctrl+Click on a parent node moves the editor cursor without drilling` (CI は `vscode-webview-e2e` ラベル opt-in、xvfb 必要のため required check には昇格しない)

- [x] TC-04: leaf への Cmd/Ctrl+Click で editor cursor が移動 + view が変わらない
> ✅ Automated — `packages/vscode-e2e/tests/webview/at-0038-cmd-click-hint.test.ts` › `TC-04: Cmd/Ctrl+Click on a leaf node moves the editor cursor without changing the view` (CI は `vscode-webview-e2e` ラベル opt-in、xvfb 必要のため required check には昇格しない)

### AC-2: AT-0038 doc の Coverage policy が更新される

- [ ] `docs/acceptance/0038-vscode-phase4-5-cmd-click-hint.md` の Coverage policy が "Partial automation" → "Automated (TC-01..TC-04)" に変わっている
- [ ] TC-05 が「Phase 6 で実装方針が変わり、現行動作は AT-0039 TC-01 で代替自動化済み」と明記されている

> 上記 2 項目は本 PR 内のドキュメント編集で対応済み。リリース QA で目視レビューする。

## 自動化された検証

- `packages/vscode-e2e/tests/webview/at-0038-cmd-click-hint.test.ts` —
  本 Phase の本体テスト（4 つの `it()`）。CI は `vscode-webview-e2e` ラベルで
  オプトイン。

## 手動確認項目

- [ ] ローカルで `pnpm --filter @karasu-tools/vscode-e2e run test:webview` を
  実行し、4 スイート（runner smoke + AT-0039 + AT-0038 hint+jump）が PASS する
  ことを目視確認する。
- [ ] 失敗した場合は `packages/vscode-e2e/test-resources/screenshots/` の
  状態を見て、selector 関連のリグレッションか / VS Code 起動シーケンスの
  揺れかを切り分ける。

## スコープ外

- AT-0037-9（SVG-click による editor ↔ preview 双方向ジャンプの SVG 側） — Phase 3 内の別 PR
- AT-0039 残り TC（description / link / Jump-to-editor / [ⓘ] ボタン） — Phase 3 内の別 PR
- AT-0042-vscode（cross-diagram navigation） — Phase 3 内の別 PR
- ADR-20260428-05 の supersede — Phase 3 完了時に実施

## 関連

- Issue: [#1014](https://github.com/kompiro/karasu/issues/1014)
- 設計: `docs/design/vscode-webview-e2e-harness.md`
- 同 Phase の hint visibility AT: `docs/acceptance/0072-vscode-webview-e2e-phase3-at-0038.md`
- 既存 ADR: ADR-20260428-03（拡張ホスト smoke）, ADR-20260428-05（マニュアル運用 — Phase 3 完了時に supersede 予定）
