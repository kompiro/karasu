---
id: TPL-20260510-13
title: "E2E テストは fixture が状態 / 環境 / 後始末をすべて所有し、リーク経路を post-merge で監視する"
status: active
date: 2026-05-10
applicable_to:
  - "Playwright や VS Code ExTester 等を使った E2E テストの追加・修正"
  - "テスト間で共有される storage（OPFS / localStorage / cookie / 一時ファイル）に書き込むフロー"
  - "navigator.language / timezone / 環境変数など runner 依存の変数に挙動が左右される assertion"
known_consumers:
  - opfs-fixture
  - anthropic-fixture
  - editor-fixture
related_to:
  - TPL-20260510-11
discovered_from:
  - issue: "#976"
  - issue: "#1006"
  - issue: "#1007"
  - issue: "#1271"
  - root_cause_file: "packages/e2e/fixtures/opfs.ts"
  - root_cause_file: "packages/e2e/fixtures/anthropic.ts"
topic: testing
scope:
  packages:
    - e2e
    - vscode-e2e
---

# TPL-20260510-13: E2E テストは fixture が状態 / 環境 / 後始末をすべて所有し、リーク経路を post-merge で監視する

## 観点

E2E スイートが「個別実行では通るが full-run で落ちる」状態になる主因は **テスト間でのリーク**。具体的には:

1. **共有 storage の状態リーク** — OPFS / localStorage / cookie / 一時ディレクトリなど、worker を跨いで残るストレージに前のテストの残骸が残る
2. **環境変数のドリフト** — `navigator.language` / timezone / locale など runner ごとに異なる値が assertion に紛れ込む
3. **可視化されない flake** — PR-gated でしか E2E が動かないと、main にマージ後の flake 増加が誰にも見えない

karasu の `opfs` fixture は `wipe()` / `seed()` を提供しているのに、72 箇所の `page.goto("/")` が fixture を経由せずブートしていた（#1006）。`anthropic` fixture は `karasu-locale=en` を pin していたが `opfs` fixture には同等の処理が無く、`navigator.language=ja` の runner で英語文字列の assertion が落ちていた（#1007）。両方とも「fixture に集約すべき責務が個別 spec に分散していた」結果。

## 想定される失敗モード

- **個別実行では通り、full-run で落ちる**（実行順序や直前テストの残骸に依存）
- **特定の runner / OS / locale でだけ落ちる** が、開発者の手元では再現しない
- 失敗が **`flaky` として retry-pass で隠蔽** され、`failed` カウントには現れない（実は壊れているのに見えない）
- post-merge には CI が走らないため、flake が **時間とともに静かに蓄積** する

## チェックリスト

E2E テスト / 共通 fixture を追加・修正するとき、以下を確認する:

- [ ] テスト本体が **`page.goto()` 直接呼び出しではなく fixture 経由** でブートしているか（必ず `wipe()` → `seed()` のライフサイクルに乗る）
- [ ] runner 依存の環境値（`navigator.language` / locale / timezone / 認証 token / feature flag）が **fixture 側で pin** されているか。i18n 等を意図的に test する spec のみが opt-out できる構造か
- [ ] テスト終了時に fixture が **状態を破棄** するか（次のテストが前のテストの状態を見ない保証がある）。`afterEach(cleanup)` を含む
- [ ] flake が `flaky` retry-pass として **隠蔽されていない** か。CI ログで retry 発生数を可視化しているか
- [ ] **post-merge / nightly** で E2E が走る経路があるか。PR-gated だけだと main の flake が見えなくなる

## 既知の対処パターン

- 既存 fixture（`anthropic.ts` の locale pin）を**テンプレートとして他 fixture にコピー**する。新しい環境変数 / 状態軸を追加するときは、すべての fixture に同期して入れる（→ TPL-11 の parallel-implementation parity と同じ思想）
- `page.goto("/")` の直接利用を **lint で禁止** し、fixture 経由必須にする（migration が完了したらルール化する）
- retry-pass を `failed` と同等に扱う集計を追加し、「retry で通ったが flake である」テストに早めに気付く
- nightly cron で main を E2E 実行する。flake が累積する前に検知できる（#976 が `ci: nightly-e2e` ラベルに言及）
- 個別 fixture に閉じない storage（system-level の OPFS / 一時 dir）は **playwright worker 単位の isolation** を再確認する（worker pool 内での同時アクセス事故を防ぐ）

## 関連テスト

- `packages/e2e/fixtures/opfs.ts` / `opfs.smoke.spec.ts`
- `packages/e2e/fixtures/anthropic.ts`
- `packages/e2e/fixtures/README.md` — fixture 利用方針
- `scripts/ci/playwright-flaky-summary.ts` — Playwright JSON report を解析して retry-pass（flaky）テストを `::warning::` annotation と `$GITHUB_STEP_SUMMARY` の markdown 表で surface する。`e2e.yml` / `e2e-nightly.yml` の "Surface flaky retry-passes" ステップから `if: always()` で実行（gap GT13-2 / #1271）
