---
type: tooling
---

# AT-0076: VS Code WebView E2E harness — Phase 3 / AT-0042-vscode

## 概要

Phase 3 の最終 AT として、AT-0042-vscode（detail panel の cross-diagram
navigation）を ExTester WebView ハーネスへ移植する
（Issue [#1014](https://github.com/kompiro/karasu/issues/1014) Phase 3、設計は
`docs/design/vscode-webview-e2e-harness.md`）。

これで Phase 3 のテスト移植は完了。次は ADR-20260428-05 を supersede する
後継 ADR を起こして Phase 3 を締める。

## スコープ

既存 `packages/vscode-e2e/tests/webview/at-0039-detail-panel.test.ts` に
AT-0042 用の TC を co-locate（memory feedback `webview_simple_dialog_flake`
通り、新規 test file は作らず suite を共有）。fixture（AT-0039 と共用）に
UserService（team あり / deploy なし）と `deploy "production"` ブロックを
追加。

| TC | 内容 | この PR での扱い |
|----|------|------------------|
| AT-0042-1 | team を持つ node の ⓘ → panel に `data-nav-view="org"` ボタン → クリックで Org diagram に切替 | 新規自動化 |
| AT-0042-2 | deploy 紐付き service の ⓘ → panel に `data-nav-view="deploy"` ボタン → クリックで Deploy diagram に切替 | 新規自動化 |
| AT-0042-3 | runtime/realizes セクションが team/role/tags セクションの上に出る | **renderer 静的不変条件として記録**（live fixture で両 section を持つ node が存在しないため runtime test 不可） |
| AT-0042-4 | (spec で N/A — VSCode は team 設定時に常に nav button を出す) | 据え置き |
| AT-0042-5 | deploy 紐付きの無い service の ⓘ → deploy nav button が出ない | 新規自動化 |

技術ポイント:

1. **fixture の line shift**: AT-0042 の `service UserService { ... }` を
   挿入したことで Customer 行が 17 → 20 にずれる。AT-0039 TC-03 が使う
   `FIXTURE_LINE.Customer` 定数を 20 に更新。
2. **toolbar view button の active 状態判定**: `[data-view="<view>"]` ボタンは
   active のとき `style="background:var(--vscode-button-background);..."` が
   付く。テストは `style.includes('background')` で判定する。
3. **switchViewAndHighlight も webview.html を再代入する**。AT-0042-1/2 の
   nav button click 後は drill click と同じく `switchBack` →
   `switchToFrame` の dance が必要。共通化した `switchToView` helper を
   追加。
4. **TC-03（既存）の after に AT-0042 が並ぶ**ため、TC-03 のコメントを
   更新。AT-0042 は各テストの先頭で `switchToView("system")` を呼んで
   System view に戻し、TC-03 の rebuild 後でも安定して走るようにした。
5. **AT-0042-3 を runtime test 化しなかった理由**: services は `team` を
   持ち、deploy units は `runtime`/`realizes` を持つが、metadata は両者を
   1 ノードに集約しない。renderer の `_buildHtml` で
   `// Runtime / realizes` と `// Team / role / tags` セクションは固定の
   source 順で emit されるため、code review で順序を担保するのが妥当
   （AT-0042 doc の Coverage policy に明記）。

## 前提条件

- AT-0072 / AT-0073 / AT-0074 / AT-0075 の harness が main にある
- LSP packaging fix (#1024) が適用済み（既存 AT-0039 TC-03 の Jump-to-editor
  が installed mode で動作するため）
- ローカル GUI が無い場合は `xvfb-run` 経由で実行する

## 受け入れ条件

### AC-1: AT-0042-1 / AT-0042-2 / AT-0042-5 が PASS する

- [x] AT-0042-5: UserService の panel に deploy nav button が無い
> ✅ Automated — `packages/vscode-e2e/tests/webview/at-0039-detail-panel.test.ts` › `AT-0042-5: detail panel for a service without a deploy block does NOT show the deploy nav button` (CI は `vscode-webview-e2e` ラベル opt-in、xvfb 必要のため required check には昇格しない)

- [x] AT-0042-1: team nav button click で Org diagram に切替
> ✅ Automated — `packages/vscode-e2e/tests/webview/at-0039-detail-panel.test.ts` › `AT-0042-1: clicking the team nav button switches the preview to the Org diagram` (CI は `vscode-webview-e2e` ラベル opt-in、xvfb 必要のため required check には昇格しない)

- [x] AT-0042-2: deploy nav button click で Deploy diagram に切替
> ✅ Automated — `packages/vscode-e2e/tests/webview/at-0039-detail-panel.test.ts` › `AT-0042-2: clicking the deploy nav button switches the preview to the Deploy diagram` (CI は `vscode-webview-e2e` ラベル opt-in、xvfb 必要のため required check には昇格しない)

### AC-2: AT-0042 doc の Coverage policy が更新される

- [ ] `docs/acceptance/0042-vscode-cross-diagram-navigation.md` の Coverage
  policy に TC-1/2/5 の自動化先と TC-3/TC-4 の取り扱いが記述されている

> 上記項目は本 PR 内のドキュメント編集で対応済み。リリース QA で目視レビューする。

## 自動化された検証

- `packages/vscode-e2e/tests/webview/at-0039-detail-panel.test.ts` —
  AT-0039 の 6 `it()` + AT-0042 の 3 `it()` = 計 9 `it()`。CI は
  `vscode-webview-e2e` ラベルでオプトイン。

## 手動確認項目

- [ ] ローカルで `pnpm --filter @karasu-tools/vscode-e2e run test:webview` を
  実行し、suite 全体（runner smoke + AT-0037-9/AT-0038 5 + AT-0039+AT-0042 9
  = 15 passing）がすべて PASS することを目視確認する。
- [ ] **TC-3 の手動確認**（runtime/realizes section ordering）: F5 で
  extension dev host を起動し、deploy 図に切替 → oci/war ノードの ⓘ →
  runtime/realizes が独立 section で表示されることを目視。`team`/`role` を
  持つ node と並べた場合の順序は code review で担保しているため、追加の
  手動 TC は不要。

## スコープ外

- ADR-20260428-05 の supersede — Phase 3 完了の最後の作業として別 PR で実施

## 関連

- Issue: [#1014](https://github.com/kompiro/karasu/issues/1014)
- 設計: `docs/design/vscode-webview-e2e-harness.md`
- 同 file 内の関連 AT: `docs/acceptance/0075-vscode-webview-e2e-phase3-at-0039-rest.md` (AT-0039 残り)
- 既存 ADR: ADR-20260428-03（拡張ホスト smoke）, ADR-20260428-05（マニュアル運用 — Phase 3 完了時に supersede 予定）
