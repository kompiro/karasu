---
id: TPL-20260630-02
title: "URL/共有から復元する state は、後発の seed reset を越えて再適用する"
status: active
date: 2026-06-30
applicable_to:
  - "mount 時に hash / 共有ペイロードから state を復元する hook（activeView / viewPath / highlight / 選択中ブロック など）"
  - "子 effect で復元 dispatch した後に、親の seed/初期化 effect が SELECT_FILE → VIEW_RESET 等で同じ state を巻き戻す構成（MemoryModeApp + useHistoryNavigation）"
known_consumers:
  - history-navigation
discovered_from:
  - issue: "#1842"
  - root_cause_file: "packages/app/src/hooks/useHistoryNavigation.ts"
related_to:
  - TPL-20260630-01
topic: navigation
scope:
  packages:
    - app
---

# TPL-20260630-02: URL/共有から復元する state は、後発の seed reset を越えて再適用する

## 観点

mount 時に hash や共有ペイロードから復元した state（`viewPath` / `highlightedNodeId` / 選択中アイテム等）は、**子 effect で一度 dispatch しただけでは生き残らない**。React の effect 実行順は子 → 親なので、`useHistoryNavigation`（子）の mount effect ① が復元を dispatch した直後に、`MemoryModeApp`（親）の project-seed effect が `selectFileWithContent` → `SELECT_FILE` → `VIEW_RESET` を走らせ、同じ state を初期値に巻き戻す。

`viewPath`（drill 先 node）は effect ② が node-path index 充填後に再解決するため生き残るが、**同じ deferral を持たない復元値は seed reset で黙って消える**。#1842 では `target.highlight` を encode はしていたのに、開いたとき highlight が消える bug がこれだった（node だけ生き残り highlight だけ消える非対称）。

復元値ごとに「seed の VIEW_RESET より後に再適用する」遅延機構（pending ref → index-ready で再 dispatch）を用意する必要がある。index が seed のファイル内容から導出される性質を使うと、「index が非空＝reset は既に済んだ」という順序保証になり、reset の前に再適用してしまう取り違えを避けられる。

## 想定される失敗モード

- 共有リンクを開くと drill 先 node は復元されるのに highlight（選択強調）だけ消える、のような **復元値の非対称な欠落**
- ハッピーパス（seed reset の無いモード / reset 前に index が空のままのユニットテスト）は緑で、実アプリの mount 順でだけ再現
- 新しい復元フィールドを足したとき、node の deferral だけ真似て新フィールドの再適用を忘れる
- 再適用を「index 充填を待たず」に行い、seed reset の**前**に走って結局上書きされる（順序の取り違え）
- 再適用が index 変化のたびに発火し、ユーザー編集で index が再計算されるたび古い highlight が蘇る（一度きりにしていない）

## チェックリスト

URL/共有から state を復元する hook を実装・修正するとき:

- [ ] 復元する各フィールドについて、後発の seed/初期化 effect（`SELECT_FILE` → `VIEW_RESET` 等）で巻き戻されないか確認したか
- [ ] 巻き戻されるなら pending ref に退避し、**seed reset より後**であることが保証されるシグナル（model 由来 index の非空など）で再 dispatch しているか
- [ ] 再適用は **一度きり**か（pending ref を消費後 null にし、その後の index 変化で再発火しない）
- [ ] node だけでなく highlight / 選択中ブロック等、**復元値すべて**に deferral があるか（非対称な取りこぼしがないか）
- [ ] 「mount → 子で復元 dispatch → 親 seed が reset → index 充填」を模した回帰テスト（空 index で再適用なし → index 充填で再適用、を rerender で検証）があるか

## 既知の対処パターン

- `pendingHighlightRef` に退避し、effect ② で `nodePathIndex` / `orgPathIndex` が非空になった時点で `SET_HIGHLIGHTED_NODE` を再 dispatch、消費後 ref を null にして一度きりにする（`useHistoryNavigation.ts`）
- index が seed のファイル内容から導出される＝「index 非空なら SELECT_FILE は既に走った」を順序保証に使い、reset 前の再適用を避ける
- highlight-only-at-root（pending node 無し）のケースも index-ready で再適用する（node の有無に依存しない）

## 派生元 spec

なし（retrospective TPL — #1842 から抽出）。共有 encode/restore の anchor 文法側は [[TPL-20260630-01-deep-link-anchor-cross-surface-parity]] が守る。

## 関連テスト

- `packages/app/src/hooks/useHistoryNavigation.test.ts` › `pending highlight restoration (#1842)`（空 index で再適用なし → index 充填で再適用 / 一度きり）
