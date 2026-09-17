---
id: TPL-2803
title: "カードの寸法を測るテキストレイアウトと描くテキストレイアウトは同じもの — 測った行はすべて描き、描く行はすべて測る"
status: active
date: 2026-09-17
applicable_to:
  - "ノードの描画に 2 つ目のテキスト描画経路（アイコン・表示モード・シェイプ別の分岐）を足すとき"
  - "カードに新しい行・チップ・メタ情報を足すとき（測定側と描画側の両方に入ったか）"
  - "寸法を決める関数が、描画側の分岐条件（アイコン定義・display mode・shape）を見ずに測っているとき"
known_consumers:
  - layout-measure
  - svg-renderer
  - org-renderer
discovered_from:
  - issue: "#2803"
  - root_cause_file: "packages/core/src/renderer/svg-renderer.ts"
  - root_cause_file: "packages/core/src/renderer/layout-measure.ts"
related_to:
  - TPL-2234
  - TPL-2385
  - TPL-2157
  - TPL-1001
topic: renderer
scope:
  packages:
    - core
---

# TPL-2803: 測った行は描かれた行

## 観点

カードの大きさは `measureNode` が行を数えて決め、中身は renderer が描く。**両者は同じ
テキストレイアウトを前提にしていなければならない。** 測定が N 行ぶんの高さを確保したなら
描画はその N 行を描き、描画が行を足すなら測定もその行を数える。

描画側に分岐が 1 つ増えると、測定側がその分岐を知らないまま同じ高さを返し続ける。
分岐の先が行を減らしても増やしても、**カードは測った大きさで正しく描かれ、テストは緑のまま**
中身だけが食い違う。行が減れば情報が黙って落ちて空白が残り、行が増えればカードからはみ出す。

ここでの「行」は文字の行に限らない。チップ・バッジ・メタ行（link 数・team）・`role`・
折り返した description の各行を含む。

## 想定される失敗モード

- テキストスロット付きの `url()` アイコンは `renderSlottedText` で描かれ、メタ行・`role`・client の
  チップを描かない。`measureNode` はそれらの行を数えて高さを確保するので、チップが消えたうえに
  その高さだけ空いたカードになる（#2803）。
- 同じ分岐で description がスロット位置に 1 行で描かれ、測定が折り返した行数と一致しない。
- 新しいチップを `renderDefaultText` にだけ足し、もう一方の描画経路では出ない（TPL-2157 の
  kind gate と同じ「書いたのに出ない、診断も無い」形）。
- テストがカード寸法（測定の出力）だけを見ており、描かれた要素を数えていない。

## チェックリスト

- [ ] ノードのテキストを描く経路を列挙し、**それぞれがどの行を描くか**を測定側の行と突き合わせた
      （`renderNode` の分岐を grep する）。
- [ ] 描画経路が複数あるなら、**同じノードを各経路で描いて、描かれたチップ・行の数が一致する**テストがある
      （例: `data-meta-glyph` / `data-client-capability-count` の数をシートの有無で比べる）。
- [ ] 測定側が描画側の分岐条件（アイコン定義・display mode・shape）を見ていないなら、
      その分岐が行の集合を変えないことを確認した。変えるなら分岐を畳むか、測定にも同じ条件を入れる。
- [ ] 描いた行の位置を**描画出力から**読み、カードの箱の内側に収まることを assert している（TPL-2385）。

## 既知の対処パターン

| 何を | どう解くか |
| --- | --- |
| 描画経路が 2 つある | 経路を 1 つに畳み、違いは経路の外（本体の描き方・inset）に寄せる。#2803 の Design Doc は shape mode のテキストを `renderDefaultText` 1 本にし、アイコンはピクトグラムを padding 帯に置く形を採った |
| 形が行の置き場所を変える | 描画の分岐ではなく `contentInset` として宣言し、測定と描画の両方が同じ値を読む（ADR-2366 の `user` カード） |
| 固定サイズのカード | 測定が固定値を返すなら、描画側がその箱に収まるよう切り詰める・折り返す規則を持ち、はみ出しを assert する（icon mode、#2533） |

## 関連テスト

- `packages/core/src/renderer/external-icon-card.test.ts` — 外部アイコン（`shape: url()`）のカード。
  #2803 の実装で、シートの有無で描かれるチップ数が一致する assert を足す
- `packages/core/src/renderer/shape-content-inset.test.ts` — 測定と描画が同じ inset を読むこと
