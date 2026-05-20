---
id: ADR-20260520-04
title: overlay/portal surface の z-index を文書化されたトークンスケールで管理する
status: accepted
date: 2026-05-20
topic: app-ui
related_to: [ADR-20260515-01]
scope:
  packages: [app]
assumptions:
  - "grep: packages/app/src/styles/app.css :: --z-dialog"
  - "grep: packages/app/src/components/ui/dialog.tsx :: z-\\[var\\(--z-dialog\\)\\]"
---

# ADR-20260520-04: overlay/portal surface の z-index を文書化されたトークンスケールで管理する

- **日付**: 2026-05-20
- **ステータス**: 決定済み
- **関連**:
  - Issue #1468 — Command palette renders behind the References panel
  - PR #1471
  - [ADR-20260515-01](20260515-01-adopt-shadcn-ui.md) — shadcn/ui 採用
  - [TPL-20260520-01](../test-perspectives/TPL-20260520-01-overlay-z-index-scale.md)

## 背景

App の overlay/portal surface（modal dialog・slide-in panel・context menu・tooltip・dropdown）は、それぞれが個別に `z-index` のマジックナンバーを持っていた。`app.css` 側の手書き overlay は 50〜1000 の範囲で値を散らし、shadcn 由来の portal primitive（`Dialog` / `DropdownMenu` / `Tooltip`）は一律 `z-50` を持っていた。

`z-index` は同じ stacking context 内の **他 surface との相対値** でしか意味を持たないため、この状態では 2 つの surface が同時に開いたときの重なり順がコード上のどこにも明示されない。実際に #1468 で、`z-50` の shadcn `Dialog`（コマンドパレット）が `z-index: 200` の `.reference-panel-overlay` の裏に潜り、操作不能になる bug が表面化した。同じ潜り込みは tooltip / dropdown でも潜在していた。

#1468 では 3 つの修正案を検討した:

1. `ReferencePanel` を shadcn primitive（Sheet 相当）へ移行し、Radix portal に重なり順を任せる
2. z-index を文書化されたスケール（トークン）に集約する
3. コマンドパレットの `z-index` だけを既存最大値より上に引き上げる

## 決定

App の overlay/portal surface の `z-index` は、`app.css :root` に定義した `--z-*` カスタムプロパティのスケール（案 2）で一元管理する。

スケールは低→高の順に `--z-handle`(50) / `--z-dropdown`(100) / `--z-panel`(200) / `--z-context-menu`(1000) / `--z-dialog`(2000) / `--z-menu`(3000) / `--z-tooltip`(4000)。`app.css` の各 overlay ルールと shadcn primitive（Tailwind の `z-[var(--z-*)]` arbitrary value 経由）はすべてこのトークンを参照し、ベタ書きのマジックナンバーは置かない。コンポーネント内に閉じたローカルな stacking context（sticky table header 等）の `z-index: 1` はスケールの対象外とする。

## 理由

- スケールを 1 か所に定義することで、任意の 2 surface の相対順がコメント付きで一覧でき、新しい surface を足すときも「どの層に属するか」を選ぶだけで済む。
- shadcn / Radix の portal primitive と既存の手書き overlay という **2 つの流儀** が同居しても、両者が同じトークンを参照すれば衝突しない。#1468 のような shadcn-vs-legacy の潜り込みが構造的に起きなくなる。
- 案 3（個別引き上げ）はコマンドパレットだけを直し、tooltip / dropdown の同種 bug を残す。案 2 は全 surface を一度に整合させられる。
- portal 系メニュー（`--z-menu`）と tooltip（`--z-tooltip`）を dialog より上に置くことで、dialog 内から開いたメニュー／tooltip が dialog に隠れない。

## 却下した案

- **案 1（`ReferencePanel` の shadcn 化）**: `ReferencePanel` は中央寄せの modal ではなく右端固定・全高の slide-in panel であり、shadcn `Dialog` へ移すには Sheet 相当の新 primitive が要る。bug 修正のスコープを超える実質的なリファクタであり、別 Issue として切り出すべきと判断した。
- **案 3（コマンドパレットのみ引き上げ）**: 最小差分だが、shadcn-vs-legacy の不整合という根本原因を残し、tooltip / dropdown の潜在 bug も塞げないため却下した。
