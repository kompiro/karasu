---
id: ADR-20260429-08
title: VS Code WebView の DOM 系テストは ExTester ハーネスで自動化する
status: accepted
date: 2026-04-29
topic: testing
supersedes: [ADR-20260428-05]
related_to:
  - ADR-20260428-03
scope:
  packages:
    - vscode
    - vscode-e2e
  concerns: []
assumptions:
  - "file: packages/vscode-e2e/run-webview-tests.mjs"
  - "file: packages/vscode-e2e/tests/webview/at-0038-cmd-click-hint.test.ts"
  - "file: packages/vscode-e2e/tests/webview/at-0039-detail-panel.test.ts"
  - "file: packages/vscode-e2e/tests/webview/at-0069-runner-smoke.test.ts"
  - "file: packages/vscode/src/preview-panel.ts"
  - "file: .claude/rules/vscode-webview-tests.md"
  - "file: docs/acceptance/0037-vscode-phase5-standard-lsp.md"
  - "file: docs/acceptance/0038-vscode-phase4-5-cmd-click-hint.md"
  - "file: docs/acceptance/0039-vscode-phase6-detail-panel.md"
  - "file: docs/acceptance/0042-vscode-cross-diagram-navigation.md"
---

# ADR-20260429-08: VS Code WebView の DOM 系テストは ExTester ハーネスで自動化する

- **日付**: 2026-04-29
- **ステータス**: 決定済み
- **関連**:
  - ADR-20260428-03 — VS Code 拡張ホスト向け smoke test harness
  - ADR-20260428-05 — VS Code WebView の DOM 系テストはマニュアル運用とする（本 ADR が supersede）
  - 親 Issue [#1014](https://github.com/kompiro/karasu/issues/1014) — Phase 3 トラッカー
  - 関連 PR: #1017 / #1023 / #1027 / #1030 / #1034 / #1039
  - 関連 AT 記録: AT-0072 / AT-0073 / AT-0074 / AT-0075 / AT-0076

## 背景

ADR-20260428-05 は WebView を駆動する E2E ハーネスのコストが「対象 AT 4 件」
には見合わないと判断し、**WebView の DOM・スタイル・クリックハンドラに依存
する AT は当面マニュアル運用とする**と決めた。同時に、将来検討する場合は
別 Issue で Design Doc から始めると明記した。

その後 #928 と Design Doc `docs/design/vscode-webview-e2e-harness.md` で
ランナー候補（ExTester / Playwright + CDP / `@vscode/test-web` / 現状維持）
を実機評価し、Phase 1〜3 として段階的に harness を実装・運用した:

- **Phase 1** (#964): `vscode-extension-tester` ベースのランナー
  (`packages/vscode-e2e/run-webview-tests.mjs`) と最小スイートを追加。
  CI は `vscode-webview-e2e` ラベルでオプトイン。
- **Phase 2** (#964): AT-0039 TC-01 を移植して runner 妥当性を確認。
- **Phase 3** (#1017 / #1023 / #1027 / #1030 / #1034 / #1039): 残り 4 セットを
  順次移植。途中で見つかった本番バグ（拡張の LSP server module path が
  installed mode に到達しない）も #1027 で fix。Phase 3 終了時点で 15 個の
  WebView TC が CI で走る。

その過程で、ADR-20260428-05 が前提としていた「ROI が見合わない」「拡張に
シームを増やす方が高くつく」という制約条件は次のように変化した:

- ROI は受け入れ可能：全 5 ファイル / 15 TC で実行 ~50 秒（CI）。マニュアル
  運用で同じカバレッジを維持するコストより安い。
- シームは増えていない：synthetic `MouseEvent` を `dispatchEvent` で WebView
  iframe に直接送ることで、本番コードに `export` を追加せずに `e.metaKey` 等
  を含む click handler 経路を駆動できた。
- 拡張本体のバグ検出力が上がった：ExTester は **installed-mode の .vsix を
  実機に入れて動かす** ため、dev mode（F5）では現れない packaging バグ
  （#1024）を検出できる。これは ADR-20260428-05 の手動 QA では拾えなかった。

## 決定

**WebView の DOM・スタイル・クリックハンドラに依存する AT は、原則として
`packages/vscode-e2e/tests/webview/` 配下の ExTester ハーネスで自動化する。**

具体的な運用ポリシーは以下:

1. **ハーネス**: `vscode-extension-tester` を `packages/vscode-e2e` に同居
   させ、`pnpm --filter @karasu-tools/vscode-e2e run test:webview` で起動。
   既存の `@vscode/test-cli` ベース smoke と並行運用する。
2. **CI gating**: `vscode-webview-e2e` ラベルが付いた PR でのみ実行する。
   xvfb と VS Code stable のダウンロードが必要なため、required check には
   昇格させない。
3. **テスト追加方針**: 新規 WebView 系 AT は既存 suite に co-locate する
   （別ファイルにすると "File: Open File..." simple-dialog の xvfb stall
   flake を踏みやすいため。詳細はメモリ
   `feedback_webview_simple_dialog_flake.md` 参照）。やむを得ず別ファイルに
   する場合は、既存ファイルが採用している 3-attempt retry パターンを必ず
   踏襲する。
4. **拡張ホスト側スタブ禁止は維持**: ADR-20260428-05 のルール 3
   （`webview.postMessage` の偽装や `handleNavigate` の export 経由テストは
   書かない）はそのまま継承する。harness が WebView frame に正面から到達
   できるようになった以上、シームを増やす理由はさらに薄くなった。
5. **マニュアル運用が残るケース**: 以下は意図的に手動 QA で運用し続ける。
   - **AT-0039 TC-07**（リンクが外部ブラウザで開く）: WebView 側で
     `openExternal` postMessage を観測することはできるが、拡張ホストの
     `vscode.env.openExternal` の実呼び出しを検証するには本番コードに
     test-only seam を増やすしかない。本 ADR のシーム禁止ルールに照らして
     manual のまま据え置く。
   - **AT-0042-vscode TC-3**（runtime/realizes セクションの順序）: live
     fixture で「runtime/realizes と team/role/tags を両方持つノード」が
     存在しないため runtime test 化できない。`preview-panel.ts` の
     `_buildHtml` で section emission が source 順に固定されている静的
     不変条件として code review で担保する。

## 理由

- **Design Doc + Phase 1〜3 の実装で「不確実性」が解消された**。
  ADR-20260428-05 時点では「ExTester が xvfb 上で安定するか」「拡張の
  click handler を WebView frame から駆動できるか」が未知だったが、
  Phase 3 完了時点で 15 TC が安定して走る実績を積めた。
- **拡張本体の packaging バグ (#1024) のような installed-mode 限定の
  リグレッションを、dev mode を出ない手動 QA より早く検出できる**。
  ExTester は .vsix を install して動かすため、`vsce package` の出力が
  実機で正しく機能するかが副作用として常に検証される。
- **テスト追加コストが下がった**。Phase 3 で確立した dispatchEvent パターン
  / switchBack→switchToFrame パターン / 3-attempt retry パターンを使えば、
  新規 TC の追加は 1 ファイル co-locate + 数十行で済む。
- **AT ドキュメントが coverage map として機能する**。各 AT の Coverage
  policy 節に「自動化済み / cross-referenced / manual / N/A」が明記されて
  いるため、リリース QA は手で確認するべきものだけに集中できる。

## 却下した代替

| 案                                                          | 却下理由                                                                                                          |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **ADR-20260428-05 を維持して manual 運用に留める**           | ROI が逆転した。Phase 3 で投じたコストは harness 立ち上げ済みの今、追加 TC 移植にはほぼ転嫁されない。              |
| **Playwright + CDP で WebView を駆動**（design doc B 案）   | 公式手順を外れた起動シーケンスを自前で組む必要があり、メンテ債務が ExTester より高い。Phase 1 評価で却下済。      |
| **`@vscode/test-web`**（design doc C 案）                    | 拡張本体の Web 互換ビルド要件が大きく、本 ADR のスコープ外。将来必要になれば別 Issue を起こす。                   |
| **harness と manual の併用**（一部 AT を恒常的に manual 維持） | TC-07 / TC-3 のような「自動化困難」例外だけ manual 据え置きで十分。残り全部を harness に寄せる方がコヒーレント。 |

## 影響

- **`docs/design/vscode-webview-e2e-harness.md` は本 ADR への昇格に伴い
  削除する**（履歴は本 ADR と関連 PR に集約）。
- **AT ドキュメントの Coverage policy 節**は既に Phase 3 の各 PR で更新
  済み。AT-0037-9 / AT-0038 / AT-0039 / AT-0042-vscode はそれぞれ自動化済み
  TC と manual 残置 TC を明示している。
- **`.claude/rules/vscode-webview-tests.md`** は ADR-20260428-05 の頃の
  「manual 運用とする」記述を引きずっているので、本 ADR を反映して
  「ExTester ハーネスで自動化する」「co-locate 方針」「シーム禁止」へ
  書き直す。
- **#928** は本 ADR と Phase 3 PR 群で完了。フォローアップ Issue は不要。
- **既存 ADR-20260428-05 の status を `superseded` に変更**し、
  `superseded_by: ADR-20260429-08` を追加する。`pnpm adr:validate` が
  双方向参照を担保する。
