---
id: ADR-20260515-01
title: shadcn/ui と Tailwind v4 を packages/app に採用する
status: accepted
date: 2026-05-15
topic: app-ui
scope:
  concerns:
    - accessibility
    - dependencies
related_to:
  - ADR-20260326-04
  - ADR-20260325-01
  - ADR-20260312-04
  - ADR-20260401-04
---

# ADR-20260515-01: shadcn/ui と Tailwind v4 を packages/app に採用する

- **日付**: 2026-05-15
- **ステータス**: 採用
- **関連**:
  - [ADR-20260326-04 app-testing-strategy](20260326-04-app-testing-strategy.md)
  - [ADR-20260325-01 testing-library-react](20260325-01-testing-library-react.md)
  - [ADR-20260312-04 css-inspired-styling](20260312-04-css-inspired-styling.md)
  - [ADR-20260401-04 vscode-phase3-webview-architecture](20260401-04-vscode-phase3-webview-architecture.md)
  - 実証実験: Issue #1368, PR #1379, PR #1395
  - 元 Design Doc: `docs/design/shadcn-ui-experiment.md`（本 ADR に集約のため削除）

## 背景

`packages/app/src/components/` は ~25 個の hand-rolled コンポーネントに肥大化し、
スタイリングは単一の `src/styles/app.css` に集約されていた。
UI 面が広がるにつれ（Chat / CRUD / Snapshot picker / Settings / ProjectSelector
/ PasteCompare 等）、以下の摩擦が無視できなくなった:

- **視覚言語の不一致**: dialog / dropdown / context menu / tabs が個別に実装され、
  focus ring・keyboard handling・portal 配置の挙動が微妙に異なる
- **a11y の局所最適**: Radix のような primitive を使わず手書きしているため、
  focus trap・aria 属性・keyboard navigation が漏れる
- **テーマ管理の散在**: light/dark の CSS 変数が `app.css` 内に散在し、
  diagram SVG 側のトークンと一致しているか目視確認が必要

karasu の主目的は「Claude Code の学習」と「テキストベースのアーキ可視化ツールの探索」であり、
UI フレームワーク選定は本体価値ではない。
そのため即決せず、**実験 PR で実コード上の trade-off を確認してから判断する** 方針を採った
（Issue #1368）。

実証実験は PR #1379 + #1395 として完了し、Dialog / Breadcrumb / Tooltip /
Tabs / Popover の **5 つの primitive 群で 6 コンポーネント** の移行が機械的に成立すること、
および Issue #1368 の懸念候補リストすべてに実装パスがあることを確認した。

## 決定

`packages/app` に **Tailwind CSS v4 + shadcn/ui を正式採用する**。
新規・既存どちらの UI コンポーネントも、対応する shadcn primitive
（Dialog / Breadcrumb / Tooltip / Tabs / Popover / 今後追加するもの）を優先する。

採用には以下の **協調変更** を同梱する:

1. `.claude/rules/dialog.md` を改訂し、shadcn `Dialog` を新規・既存両方の標準とする
   （`.dialog-overlay` / `.dialog` 構造はレガシーとして deprecated）
2. `.claude/rules/testing.md` を新設し、対話 UI のテストは
   `@testing-library/user-event` を標準とする方針を明文化
3. 既存の PR #1379 + #1395（実験ブランチ）をマージし、移行済みコンポーネントを main に取り込む

## 理由

### a11y baseline の底上げ（最重要）

- Radix primitive により focus trap、`aria-describedby`、Esc 処理、arrow-key nav、Portal 配置、
  DismissableLayer が自動で提供される
- 手書きでは現実的に維持できない細部（IME composition との干渉回避、複数 modal stacking、
  pointer-down-outside 判定など）が Radix の責務になる
- PR #1379 / #1395 の実装で、a11y 関連の bug を未然に防ぐコード削減も発生
  （PreviewPane の bespoke document listener 12 行が DismissableLayer に置き換え）

### 視覚言語の統一が現実的になる

- Radix の共通語彙（Dialog / Popover / Tabs / Tooltip / Command / Sheet …）で
  hand-rolled コンポーネントを置き換えられる
- focus ring、keyboard handling、portal 配置が局所最適でなく一貫する

### ソースコピー方式で runtime lock-in がない

- shadcn は npm 依存ではなく `src/components/ui/` にコピーする設計
- 気に入らない部分は直接書き換え可能
- 将来 shadcn を捨てたくなった場合、Radix を直接使う移行コストは小さい

### テーマトークンが既存資産と共存できる

- `@theme inline` で shadcn の color トークン → karasu の `--bg-overlay` / `--text-primary`
  などにマッピング可能
- Onyx Cartographer の dark palette を維持したまま導入できる（書き換え不要）
- diagram SVG renderer 側の色トークンと一貫性が保てる

### 段階的導入が機能する

- Tailwind v4 と既存 `app.css` が preflight 有効のまま共存することを実験で確認済み
- 一気に全 CSS を書き換える必要なく、コンポーネント単位で移行できる

## 採用に伴うコスト（許容する）

- **バンドル増**: main からの累積 **+283 kB raw / +66 kB gzip**（実験 PR 時点での 5 primitive 群）
  - VS Code webview バンドルにも同じ delta が乗る
  - 今後 primitive を追加するごとに +5〜25 kB gzip 程度の追加コストが発生する
- **runtime dependency 追加**: `@radix-ui/react-*` が primitive ごとに 1 パッケージ追加される
- **テスト書き換え**: 対話 UI テストを `userEvent` ベースに揃える（移行は段階的でよい）

## 撤退基準

以下のいずれかが現実化した場合、本決定を見直す:

- VS Code webview の初期 load time が体感で劣化する（実測ベース）
- shadcn / Radix のメジャーアップデートで破壊的変更が頻発する
- karasu 側で primitive を手書きカスタムする箇所が増え、shadcn の恩恵が消える

## 却下した案

### 案A: 何も採用しない（現状維持）

a11y baseline 改善の機会を失い、UI 面が増えるたびに同じ議論を再開することになる。
karasu の UI 面は実際に拡張フェーズに入っており、見送りは先送りでしかない。

### 案B: Radix primitive だけを直接使い、shadcn の wrapper は採用しない

Tailwind 導入コストを避けられるが、視覚一貫性のための CSS は引き続き手書きが必要。
shadcn の `cn()` ヘルパーや CSS 変数ブリッジによる体系化を捨てることになり、
中長期的な保守コストでの優位が薄い。

### 案C: 別の framework（Park UI / Mantine / Chakra v3 等）

Tailwind 前提でない選択肢もあるが、Issue #1368 は shadcn を名指しした実験であり、
範囲を広げると結論を出すコストが膨らむ。本 ADR では検討範囲外とする。

## 同 PR で起こす Proactive TPL

本 ADR では `docs/concepts.md` への新規セクション追加は伴わないため、
spec/concepts 由来の proactive TPL 起票は不要。
ただし shadcn 採用後に「primitive の test scope が portal に変わる」点は
将来 retrospective に拾われうるパターンとして、`.claude/rules/testing.md`
（本 PR で新設）に運用ガイドとして記述する。
