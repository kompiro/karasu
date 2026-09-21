---
type: product
---

# AT: shape mode の `url()` カードアイコンが、測ったとおりの行を描く（#2803）

- **日付**: 2026-09-21
- **関連 Issue**: [#2803](https://github.com/kompiro/karasu/issues/2803)
- **Related TPLs**:
  [TPL-2803](../test-perspectives/TPL-2803-measured-lines-are-drawn-lines.md)（測った行は描かれた行）、
  [TPL-1001](../test-perspectives/TPL-1001-display-mode-cross-surface.md)（表示モードは全描画面で点検する）、
  [TPL-2385](../test-perspectives/TPL-2385-attachment-follows-drawn-outline.md)（幾何は描画出力から読む）、
  [TPL-2234](../test-perspectives/TPL-2234-one-entity-one-appearance-resolver.md)（見た目の決定は 1 箇所）
- **対象ファイル**:
  - `packages/core/src/renderer/svg-renderer.ts`（`renderNode` のテキスト分岐 / `iconBodyBox`）
  - `packages/core/src/shapes/shape-registry.ts`（`pictogramGroup` / `PICTOGRAM_OFFSET`）
  - `packages/core/src/renderer/org-renderer.ts`（同じピクトグラム配置を共有）
  - `docs/spec/style.md` / `docs/spec/style.ja.md`（「How a `url()` icon is drawn」節）

> テキストスロットを持つアイコン（`icons.json` の 30 個すべて）を shape mode で当てると、
> カードは中央寄せスタックの行数で測られるのに `renderSlottedText` が label と description
> しか描かないため、メタ行・`role`・client のチップが消えたうえでその高さだけ空いていた。
> 加えて本体スケールがカード高さ依存でピクトグラムの大きさが揃わず、description も
> 折り返されなかった。本 AT は shape mode でこの 4 つが解消し、icon mode が変わらないことを固定する。

## 受け入れ条件

### AC-1: 測定が確保した行がすべて描かれる

- [x] AT-A: capability・link を持つ client に `shape: url()` を当てても、アイコン無しの同じノードとメタグリフ数・チップ・description が一致し、カード寸法も同じである

  > ✅ Automated — `packages/core/src/renderer/external-icon-card.test.ts` › external icon card (#2696) > shape mode > a card-design icon draws the card's own text (#2803) > draws every line the card was measured for

- [x] AT-B: テキストの y 位置が、アイコン無しの同じノードと一致する（上部に固まらない）

  > ✅ Automated — 同 describe › puts the text where the card measured it, not at the icon's slots

- [x] AT-C: description が測定と同じ行数に折り返される

  > ✅ Automated — 同 describe › wraps the description the way measurement wrapped it

### AC-2: ピクトグラムはカード角に原寸で置かれる

- [x] AT-D: カードの高さが違う 2 ノードで、ピクトグラムが同じ原寸・同じ角位置（カード左上 + (6, 4)）に描かれる

  > ✅ Automated — 同 describe › draws the pictogram at native size in the card's corner on every card

- [x] AT-E: ピクトグラムがテキストスタックの 1 行目と重ならず、カード幅からはみ出さない

  > ✅ Automated — 同 describe › keeps the pictogram clear of the text it sits beside

- [x] AT-F: 内接させた本体がカードの裏に二重に描かれない

  > ✅ Automated — 同 describe › draws no second copy of the icon body behind the card

### AC-3: 既存の描かれ方が変わらない

- [x] AT-G: スロットを持たないアイコンは従来どおり比率を保って内接し、中央に置かれる

  > ✅ Automated — 同ファイル › external icon card (#2696) > shape mode > centres a slot-less icon, which has no layout of its own to line up

- [x] AT-H: icon mode は固定カードを本体で満たし、スロットに文字を載せたままである

  > ✅ Automated — 同ファイル › external icon card (#2696) > icon mode is unchanged > puts both of the icon's text slots on the body they belong to

- [x] AT-I: 組織図のアイコンカードのピクトグラム位置が変わらない（配置定数を共有しても退行しない）

  > ✅ Automated — `packages/core/src/renderer/org-renderer.test.ts`

### AC-4: 実機での見え方

- [ ] AT-J: <https://karasu.kompiro.dev/> で `client { shape: url("client-web"); }` を当てた client カードに、
  🔐 / 📦 / link / team のチップが出て、ピクトグラムがカード左上に原寸で置かれている

- [ ] AT-K: label だけのノードと description ありのノードを並べ、どちらもテキストがカード中央に座り、
  下側に空白が残らない。ピクトグラムの大きさが 2 つのカードで揃っている

- [ ] AT-L: Settings → 表示 → アイコンカード（icon mode）に切り替えると、従来どおりピクトグラムの横に
  ラベルが並ぶ固定カードで描かれる（見え方が退行していない）

- [ ] AT-M: dark / light の両テーマで、ピクトグラムの色がカードの文字色と揃っている
