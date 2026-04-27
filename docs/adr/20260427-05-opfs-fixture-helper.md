---
id: ADR-20260427-05
title: Playwright 向け OPFS fixture ヘルパー
status: accepted
date: 2026-04-27
topic: testing
related_to:
  - ADR-20260412-05
scope:
  packages:
    - e2e
  concerns: []
assumptions:
  - "file: packages/e2e/fixtures/opfs.ts"
  - "file: packages/e2e/fixtures/README.md"
  - "file: packages/e2e/tests/fixtures/opfs.smoke.spec.ts"
  - "symbol: packages/e2e/fixtures/opfs.ts :: OpfsFixture"
  - "symbol: packages/app/src/fs/opfs-provider.ts :: OpfsFileSystemProvider"
  - "grep: packages/app/src/fs/detect-storage-mode.ts :: mode=memory"
---

# ADR-20260427-05: Playwright 向け OPFS fixture ヘルパー

- **日付**: 2026-04-27
- **ステータス**: 決定済み
- **関連**:
  - Issue #862 — OPFS fixture helper for Playwright
  - 親 Issue #597 — remaining E2E candidates after #534 rollout
  - PR #874 — Design Doc 追加
  - PR #879 — fixture 実装
  - 依存される AT: AT-0004 (#865), AT-0014 (#866)
  - ADR-20260412-05 — Playwright + AI visual review 戦略

## 背景

`packages/e2e` の Playwright スイートは ProjectMode の状態を前提にした
受け入れテストを書けない状態が続いていた。具体的には以下の 2 点が止まる:

- AT-0004（プロジェクト管理 / OPFS）: ProjectSelector・FileTree・初回起動
  シードなど、すべて OPFS の中身に依存する。
- AT-0014（MemoryModeApp / ProjectModeApp 統一）: 同じシナリオを **OPFS
  モード** と **InMemory モード** の両方で回す必要がある。

既存テストはアプリの初回シード経路に乗ってしまうため、テストごとに
「OPFS を空にする」「任意のファイルを置く」「memory モードで回す」
という 3 つの操作が決定論的に行えなかった。

## 決定

`packages/e2e/fixtures/opfs.ts` に Playwright fixture を追加し、
`test.extend({ opfs })` 経由で次の API を提供する:

- `opfs.seed(options)` — OPFS と `localStorage` を消去してから `projects` /
  `lastProjectId` を書き込み、後続の `gotoApp()` のモードを記憶する。
- `opfs.reset()` — シードなしで OPFS と `localStorage` を消去する。
- `opfs.read(path)` — テスト本体から OPFS の内容を確認する。
- `opfs.gotoApp(path)` — fixture が memory モードのとき自動で `?mode=memory`
  を付与してアプリへ遷移する。

シーディングは **`page.evaluate` 経由**で行う。最初の呼び出しで
`?mode=memory` を一度開いて origin を確立し、以降は `navigator.storage.getDirectory()`
を直接叩いて wipe + 書き込みを完了させる。これによりアプリの React 初期化
（`/meta/projects.json` の読み取り）と fixture の書き込みが競合しない。

二環境（OPFS / Memory）での同一シナリオ実行は **fixture 引数で切り替える**
方式とし、Playwright `projects:` を 2 系統に分けて全テスト 2 倍走らせる
方式は採らない。AT-0014 のような「両環境で必ず通したいテスト」だけが
opt-in で 2 回し、他の AT は OPFS 単一実行のままにする。

fixture は **opt-in** であり、既存のスペックが `import` を変更しない
限り挙動は一切変わらない。

## 理由

- **`page.evaluate` ベース**にすると、fixture が自分で書き込み完了まで
  await できる。`addInitScript` 方式では React の `useEffect` が
  シード完了前に走るレースが避けられなかった。
- **Memory モードで origin を確立**してからシードに移ると、`about:blank`
  経由のような OPFS スコープ外し回避策が不要になる。
- **fixture 引数で mode を切り替え**れば、CI 全体のテスト数が増えない。
  両環境必須のテストはコード上でも明示される（`for (const mode of [...])`）
  ため、可視性が高い。
- **opt-in** にしたので、既存 AT がアプリの初回シード経路に依存している
  事実（とくに `at-0050-filetree-collapse-scope` など）を壊さない。
- Smoke テストで `seed` / `reset` / memory ルーティング / memory 時の
  projects 無視を検証するため、下位 AT が依存する契約が回帰なしで保たれる。

## 却下した案

### A. アプリ側にテスト専用の seed フックを足す

`window.__seedOpfs()` のようなテストフックを `packages/app` に追加する案。
プロダクションコードに test-only な経路を持ち込むこと、Playwright 標準の
`page.evaluate` で同じことが達成できることから却下。

### B. すべてのテストで `beforeEach` に wipe を入れる

既存テストは初回シード結果に依存しているため、グローバル wipe を入れる
と回帰する。スコープ拡大しすぎるため却下。

### C. Playwright `projects:` を 2 系統に分けて全テスト 2 環境で回す

CI コストが倍になり、ほとんどのテストにとっては memory モード分が冗長。
opt-in に閉じる方が経済的で、必要になったときだけ拡張できる。

### D. `addInitScript` で wipe + seed する

`addInitScript` は async 内容を await しないため、React の `useEffect`
が OPFS を読み取るタイミングと競合する。ロード前完了の保証を作るには
追加の同期プリミティブが必要で、`page.evaluate` ベースの方が単純。

## 影響範囲

- 新規: `packages/e2e/fixtures/opfs.ts`, `packages/e2e/fixtures/README.md`,
  `packages/e2e/tests/fixtures/opfs.smoke.spec.ts`
- アプリ側: 変更なし
- CI: 既存の `e2e` ラベルゲートに変更なし。fixture スモーク 1 ファイル分
  （4 ケース）が追加される

## やらないこと

- AT-0004 / AT-0014 のテスト本体（別 Issue: #865 / #866）
- VS Code 拡張ホストハーネス（別 Issue: #863）
- Chat UI のモック / BYOK 対応（別 Issue: #864）
- Cross-browser での OPFS（Firefox / WebKit）
