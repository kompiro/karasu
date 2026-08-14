# AT: ファセット所属一覧パネルがツールバーに食い込まない

- **日付**: 2026-08-14
- **関連 Issue**: [#2492](https://github.com/kompiro/karasu/issues/2492)
- **Related TPLs**:
  [TPL-2492](../test-perspectives/TPL-2492-published-measurement-carries-its-origin.md)（本 bug から起こした観点）、
  [TPL-1468](../test-perspectives/TPL-1468-overlay-z-index-scale.md)
- **対象ファイル**:
  - `packages/app/src/components/PreviewColumn.tsx`（`--preview-toolbar-bottom` の publish）
  - `packages/app/src/styles/components/panels.css`（`.facet-overview-panel` の `top`）

## 概要

ファセット所属一覧パネル（#2177）はツールバーの**下**に出るはずが、上に重なって
ツールバーのボタンを覆っていた。1280px / ja で計測すると、ツールバー下端 97px に対して
パネル上端 69px、つまり 28px 食い込んでいた。

原因は、publish された値の**意味のずれ**。`PreviewColumn` はツールバーの「高さ」を
`--preview-toolbar-h` として配り、パネルはそれを「`.preview-column` 上端からの距離」として
`top` に使っていた。あいだにダイアグラムのタブバー（36px）があるため、その分だけ上にずれる。
どちらのコードも単体では正しく、値も正しい。ずれていたのは原点だけだった。

修正は、**消費側が必要とする量そのものを publish する**こと。ツールバーの下端
（`offsetTop + height`）を `--preview-toolbar-bottom` として配り、高さは配らない。

## 受け入れ条件

### AC-1: publish される値が原点を含む

- [x] タブバーが上にある状態で、publish 値がツールバー単体の高さを上回る
  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `publishes the toolbar's bottom edge, which clears the tab bar above it`

- [x] 高さは publish されない（消費側が offset と取り違える余地を残さない）
  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `publishes no bare height, so no consumer can read one as an offset`

### AC-2: パネルの配置

- [x] `.facet-overview-panel` の `top` が `--preview-toolbar-bottom` を参照し、`--preview-toolbar-h` を参照しない
  > ✅ Automated — `packages/app/src/components/FacetSelector.test.tsx` › `anchors on the toolbar's published bottom edge, not on its height`

## 手動確認

判定に実寸が要る 1 点だけを残す。到達先は本番 app（`https://karasu.kompiro.dev/`）。

- [ ] facet を宣言したモデルで「ファセット → 所属一覧」を開き、パネルがツールバーに重ならず、
      ツールバーのボタンがすべて押せる

## 補足

- 発見は #2317 の spike。ツールバーを 1 行にする作業の途中で、未改修のツールバー
  （`?toolbar=current`）でも同じ重なりが出ることを計測して確認したため、#2317 とは独立の
  既存 bug として切り出した。
- 「高さと offset のどちらを配るか」という一般形は TPL-2492 に切り出した。
