---
id: TPL-3039
title: "E2E のカバレッジは AT の履歴ではなく操作面の集合に対して測り、操作面の登録と spec の対応を機械で見る"
status: active
date: 2026-10-03
applicable_to:
  - "受け入れテストや Issue の要求を起点に spec を足していく E2E / 統合テスト suite"
  - "ユーザー操作面（コマンド・ショートカット・ビュー・トグル）を登録 API 経由で増やせる UI"
  - "jsdom では判定できない境界（永続化・URL/history・別ウィンドウ・実フォーカス・ネイティブダイアログ）を跨ぐ機能"
known_consumers:
  - e2e
  - app
discovered_from:
  - issue: "#3039"
  - root_cause_adr: "ADR-529"
  - root_cause_file: "scripts/acceptance/coverage.ts"
related_to:
  - TPL-1680
  - TPL-1725
  - TPL-2446
  - TPL-1480
topic: testing
scope:
  packages:
    - e2e
    - app
---

# TPL-3039: E2E のカバレッジは AT の履歴ではなく操作面の集合に対して測り、操作面の登録と spec の対応を機械で見る

## 観点

E2E suite が「その Issue の AT が e2e を要求したか」を唯一の入口にして育つと、カバレッジは
**機能面ではなく履歴**に従う。spec は AT を引き、AT は spec を引き、両者の紐付け
（[TPL-1680]）は守られているのに、**spec を 1 本も持たない操作面**が増え続ける。
その操作面を足した PR は AT を書いても `✅ Automated` を付けずに済み（手動項目にすれば
`at:check-coverage` は通る）、CI はどこでも止まらない。

観点は 2 つに分かれる。

1. **分母を履歴ではなく操作面の集合に取る。** 「AT のうち e2e 化された割合」ではなく、
   「ユーザーが触れる操作面のうち spec を持つ割合」で測る。操作面はコードに登録点がある
   （karasu の app なら `useCommand({ id, keybinding })`、view tab、toolbar の toggle）ので、
   その登録点が集合の定義になる。
2. **登録点と spec の対応を機械で見る。** 登録 API を通る操作面が増えたとき、どこかの spec に
   その id / keybinding が現れることを lint で要求する。AT ↔ spec の guard（[TPL-1680]）が
   「spec が AT に紐付く」を守るのに対し、こちらは「操作面が spec に紐付く」を守る。
   両方向が揃って初めて「AT が要求しなかった面」が検出される。

e2e に入れるかどうかの判定条件は 1 つ、**その流れが jsdom の模せない境界を跨ぐか**
（OPFS / localStorage の永続化、URL / hash / history / reload、ダウンロード・アップロード・popup、
実フォーカスとキー入力、`confirm` / `prompt`）。跨ぐ流れを unit で代替したつもりになるのが、
この観点が拾う典型の見落としである。

## 想定される失敗モード

- 2026-10-03 時点の karasu app: 119 の app 対象 AT のうち 73 が e2e spec を 1 本も引かず、
  ショートカット全般・コマンドパレット・CRUD matrix タブ・Facets・Collapse/Expand all・
  Share・スナップショット・Translate・`ja` locale に spec が無かった（#3039）。各面には
  unit テストがあり、`at:check-coverage` は finding ゼロだった。
- 操作面を足す PR が AT を「手動」で書いて merge し、その面の退行は手動 QA か利用者が見つける。
- 「unit で覆っている」と判断した流れが、実際には永続化や history を跨いでおり、jsdom の
  テストは境界の手前で止まっていた（例: `useHistoryNavigation` の reload 復元、
  `useEdgeDirectionWriter` が OPFS に書く本文）。
- 「#NNN が閉じたら e2e 化する」という注記が spec に残り、#NNN が閉じても誰も戻らない
  （AT-0046 AC5 の「#534 待ち」）。

## チェックリスト

操作面（コマンド・ショートカット・ビュー・トグル・ダイアログ）を足す、または E2E の充足を
評価するときに確認する:

- [ ] 足した操作面の登録点（`useCommand` の id / `keybinding`、view tab、toolbar toggle）が、
      どこかの `packages/e2e/tests/*.spec.ts` に文字列として現れる。現れないなら spec を
      同じ PR で足すか、`EXEMPT` に理由を書く。
- [ ] その流れが jsdom の模せない境界（永続化・URL/history・別ウィンドウ・実フォーカス・
      ネイティブダイアログ）を跨ぐなら、AT の該当項目を unit ではなく e2e の
      `✅ Automated` で埋める。
- [ ] 「別 Issue が閉じたら e2e 化する」と書くなら、その Issue の close 時に戻る手段
      （Issue 側の follow-up、または `test.fixme` + 追跡 Issue、ADR-1008）を同時に置く。
- [ ] E2E の充足を測るときは、AT の自動化率ではなく「spec を 1 本も引かない操作面」を
      数える（`docs/acceptance/` を `packages/e2e/tests/` の path で grep し、引かない
      ファイルのうち app 対象のものを列挙する）。

## 既知の対処パターン

- **登録点 → spec の drift guard**: `scripts/lint/app-shortcut-docs-sync.ts` が `keybinding` を
  抽出して docs に要求するのと同じ形で、`scripts/lint/` 配下に足す `e2e-command-coverage`（#3042 で追加）が `keybinding` と
  `useCommand` id を `packages/e2e/tests/**` に要求する（#3039 S1、Issue #3042）。lefthook と
  CI の `Check` で走らせる。走査は列挙ではなく `packages/app/src` 全体（[TPL-2446]）。
- **面ごとのスライス化**: 操作面を互いに素な `docs/acceptance/*.md` 集合で切り、スライス 1 本 =
  Issue 1 本 = PR 1 本にする（#1997、#3039）。順序を持たないので並行して landing できる。
- **容量を先に測る**: spec を足す前に CI の wall time と予算の差を測り、`workers` 等の
  設定変更を計測つきで先に入れる（#3039 PR-B、Issue #3041）。

## 関連テスト

- `scripts/acceptance/coverage.ts`（AT ↔ spec の紐付け guard。spec → AT の方向だけを見る）
- `scripts/lint/app-shortcut-docs-sync.ts`（登録点の抽出元。`e2e-command-coverage` はこれを再利用する）
- `scripts/lint/` 配下の `e2e-command-coverage`（#3042 で追加予定。登録点 → spec の方向を見る）
- `packages/e2e/tests/at-0046-system-id-in-viewpath.spec.ts`（「#534 待ち」の注記が残っていた実例）
