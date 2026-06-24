---
id: TPL-20260623-03
title: "label-gated / 遅延実行のテストスイートは、その検証対象を変える PR でマージ前に必ず起動させる"
status: active
date: 2026-06-23
applicable_to:
  - "条件付き（label / path / schedule gated）でしか走らないテストスイートが assert している surface を変更する機能"
  - "DOM 構造・control ラベル・ARIA role・セレクタなど、別スイートのアサーションが依存する契約を持つ UI リファクタ"
known_consumers:
  - e2e
  - app
discovered_from:
  - issue: "#1725"
  - root_cause_file: ".github/workflows/e2e.yml:18"
related_to:
  - TPL-20260516-01
  - TPL-20260510-09
  - TPL-20260520-02
topic: testing
scope:
  packages:
    - e2e
    - app
---

# TPL-20260623-03: label-gated / 遅延実行のテストスイートは、その検証対象を変える PR でマージ前に必ず起動させる

## 観点

すべてのスイートが全 PR で走るとは限らない。karasu の Playwright e2e は **`e2e` ラベルが付いた PR でのみ**走り（`.github/workflows/e2e.yml` の `if: contains(github.event.pull_request.labels.*.name, 'e2e')`）、それ以外は nightly（`e2e-nightly.yml`）でしか実行されない。

このような **gated / 遅延実行のスイート**は「検出のブラインドスポット」を生む。スイートがアサーションしている surface（DOM 構造・control のラベルや ARIA role・セレクタ）を変える PR が、そのスイートを起動させずにマージされると、**壊れたアサーションが緑のまま `main` に入り**、失敗が nightly か後続の（ラベル付き）無関係 PR まで遅延する。失敗が顕在化したとき、原因 PR はすでにマージ済みで、無関係な PR の作者が切り分けコストを払うことになる。

観点は「テストが壊れること」ではなく **「テストが走らないことで壊れが検出されないこと」**。コード変更が契約を壊す側（[TPL-20260510-09] / [TPL-20260516-01]）の補完で、こちらは検出メカニズム側の gap を扱う。

## 想定される失敗モード

- UI リファクタ PR（ボタン削除・dropdown 化・ARIA role 変更・ラベル文言変更）が `e2e` ラベル無しでマージ → e2e セレクタが stale 化したまま `main` が緑。
  - 実例 #1725: #1548 が「Open reference」独立ボタンを docs dropdown 内項目に変更したが、e2e 未実行のまま merge。`at-0014` AC-5 が `getByRole("button", {name:/Open reference/})` を待ち続け、数日後の無関係 e2e PR で初めて失敗が表面化した。
- 同型の path-gated / schedule-gated チェック全般（特定 path 変更時だけ走る lint、nightly でだけ走る重いスイート）でも、対象を変える PR がトリガ条件を満たさなければ同じブラインドスポットが開く。
- nightly が拾っても、原因 PR の特定（どの merge が壊したか）に二次コストがかかる。

## チェックリスト

UI / surface を変える PR（特にリファクタ・リネーム・control 削除）で、以下を確認する:

- [ ] 変更する surface を assert している gated スイートが無いか確認する（削除・改名する control のラベル / role / セレクタを e2e specs に grep する。例: `grep -rn "Open reference" packages/e2e`）。
- [ ] 該当スイートがあれば、その PR に起動条件を満たさせる（karasu の e2e なら `e2e` ラベルを付けてマージ前に green を確認する）。
- [ ] 削除・改名で stale 化するアサーションは、同じ PR でテスト側も更新する（テストを後追いの別 PR に先送りしない）。
- [ ] 起動できない事情があるなら、対象スイート名と「次にどこで検証されるか（nightly 日時など）」を PR に明記して検出遅延を可視化する。

## 既知の対処パターン

- **トリガを gate から path filter へ（構造的対処）**: app E2E は ADR-20260623-05、VS Code E2E（extension host / WebView）は ADR-20260623-07 で、それぞれラベル駆動を廃止し関連パッケージの変更で自動起動する path filter に移行した。これにより該当 surface を触る PR では人間がラベルを覚えなくても E2E がマージ前に走り、本ブラインドスポットは構造的に塞がれる。先例は Preview workflow の同型移行（ADR-20260413-01）。
  - karasu の主要 E2E スイート（`e2e.yml` / `vscode-e2e.yml`）は path filter 化済み。今後 **新しい gated スイートを足すとき**（label / 特定 path / schedule でしか走らないチェック）は、その検証対象を変える PR で必ず起動するトリガ条件になっているかを設計時に確認する。
- **同 PR で grep → トリガ確認 → テスト更新**: surface を変える PR で `packages/e2e` / `packages/vscode-e2e` を変更セレクタで grep し、ヒットしたら対象スイートがその PR で起動することを確認し、stale なアサーションを同 PR で直す。
- **nightly セーフティネット**: `e2e-nightly.yml` が全スイートを定期実行し、失敗時に `ci: nightly-e2e` ラベルの Issue を起票する。ただしこれは最後の砦であり、マージ前検出の代替にはならない（検出遅延 = 切り分けコスト）。
- #1725 では `at-0014` AC-5 を「docs dropdown を開く → `↗ Reference` menuitem をクリック」に修正して回復した。

## 関連テスト

- `packages/e2e/tests/at-0014-memory-project-mode-unification.spec.ts`（AC-5 — reference pop-out 起動経路。stale 化した実例）
- `.github/workflows/e2e.yml`（app E2E のトリガ定義 — path filter, ADR-20260623-05）
- `.github/workflows/vscode-e2e.yml`（VS Code E2E のトリガ定義 — path filter, ADR-20260623-07）
- `.github/workflows/e2e-nightly.yml`（遅延検出のセーフティネット）
