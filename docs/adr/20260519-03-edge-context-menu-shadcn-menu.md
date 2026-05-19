---
id: ADR-20260519-03
title: EdgeContextMenu の direction メニューは shadcn DropdownMenu + 仮想 trigger を基盤にする
status: accepted
date: 2026-05-19
topic: app-ui
related_to: [ADR-20260515-01]
scope:
  packages: [app]
  concerns: [accessibility]
assumptions:
  - "file: packages/app/src/components/ui/dropdown-menu.tsx"
  - "symbol: packages/app/src/components/EdgeContextMenu.tsx :: EdgeContextMenu"
---

# ADR-20260519-03: EdgeContextMenu の direction メニューは shadcn DropdownMenu + 仮想 trigger を基盤にする

- **日付**: 2026-05-19
- **ステータス**: 決定済み
- **関連**:
  - Issue #1400 — Migrate EdgeContextMenu direction items to a shadcn menu primitive
  - 親 Issue #1399（shadcn/ui 移行レビューの item 3 から分離）
  - 関連 ADR: [ADR-20260515-01](20260515-01-adopt-shadcn-ui.md) — shadcn/ui 採用
  - 関連 TPL: [TPL-20260516-01](../test-perspectives/TPL-20260516-01-control-a11y-contract-survives-migration.md) —
    interactive control の a11y 契約は移行で静かに壊れる
  - コード: `packages/app/src/components/EdgeContextMenu.tsx`、
    `packages/app/src/components/ui/dropdown-menu.tsx`

## 背景

ダイアグラム上のエッジを右クリックすると、クリック座標に浮かぶメニューで edge direction
（`auto` / `up` / `down` / `left` / `right`）を選べる。ADR-20260515-01 の shadcn/ui 採用に
伴い #1368 で Radix `Popover` へ移行済みだったが、direction 項目は `PopoverContent` 内に
並べた生の `<button role="menuitem">` のままだった。

`role="menuitem"` を付けてはいても親が本物の menu primitive ではないため、矢印キーによる
roving focus・type-ahead・Home/End・disabled 項目のキーボードスキップといった menu の
操作セマンティクスが欠落していた。#1400 はこれを本物の menu primitive へ移行して解消する。

このメニューはエッジのクリック座標にプログラム的に開く。クリックすべき可視 trigger は
無く、診断 SVG は `dangerouslySetInnerHTML` で描画されるためエッジ要素に React の
trigger をマウントすることもできない。「座標で開く」というモデルを保ったまま menu
primitive 化する必要がある、というのが論点だった。

## 決定

`EdgeContextMenu` の direction メニューは Radix `DropdownMenu` を基盤にし、`DropdownMenuTrigger`
をクリック座標に置いたゼロサイズの `position: fixed` 要素（仮想 trigger）として `open` 制御で
使う。direction 項目は `DropdownMenuItem` にする。

## 理由

- **キーボードセマンティクスを無償で得る**: `DropdownMenuItem` 化により roving focus・
  type-ahead・Home/End・disabled スキップが Radix Menu から自動で付く。#1400 が問題視した
  hand-rolled の menu 操作を実装せずに済む。
- **座標表示を維持できる**: `DropdownMenuTrigger` は `DropdownMenuContent` の anchor を
  兼ねる。これをゼロサイズ要素としてクリック座標に置けば、移行前の `Popover` +
  `PopoverAnchor` と同型の「仮想 anchor」テクニックがそのまま使え、座標表示・dismissal
  （Esc / outside-click）契約を崩さない。
- **a11y 契約を強化する方向の移行**（TPL-20260516-01）: `role="menuitem"` と disabled 状態は
  primitive 由来になり、`aria-disabled` / `data-disabled` が付く。contract test も class
  ベースから role / 属性ベースへ移した。移行で契約が劣化するのではなく、menu primitive 化で
  むしろ強化される。
- **`Popover` を撤去できる**: `EdgeContextMenu` が `ui/popover.tsx` の最後の利用者だった。
  移行に伴い `ui/popover.tsx` と `@radix-ui/react-popover` 依存を削除した。

## 却下した案

- **`Popover` のまま roving focus / type-ahead を手書きする**: 依存追加は不要だが、Radix Menu が
  無償で持つものを再実装することになり、#1400 が問題視する hand-rolled をまさに増やす。
- **ネイティブ trigger の `DropdownMenu`**: 教科書どおりだが、クリックすべき可視 trigger が
  存在しない karasu の「座標で開く」モデルに合わない。
- **Radix `ContextMenu`**: 「右クリックで開く」意味論は一致するが、trigger にできるのは React が
  マウントする要素であり、`dangerouslySetInnerHTML` の SVG エッジには付けられない。ラッパ全体を
  trigger にするとエッジ以外の右クリックでも開くため、結局エッジ判定を別途書くことになり利点が
  相殺される。
