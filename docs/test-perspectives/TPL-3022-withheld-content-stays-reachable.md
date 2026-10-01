---
id: TPL-3022
title: "canvas が省略・保留した authored 情報は、その surface 上で全文に到達できる経路を持つ"
status: active
date: 2026-10-01
applicable_to:
  - "レンダラが authored なテキスト（label / description / 名前）を省略・切り詰め・非表示にする変更"
  - "密度や衝突を理由に、図の要素を既定で描かない・薄くする・畳む変更"
  - "新しい render surface（静的出力・webview・埋め込み viewer）を足すとき、既存の省略がその surface でどう読めるかを決めるとき"
known_consumers:
  - edge-label-disclosure
  - description-summary
  - team-chip
discovered_from:
  - root_cause_file: "docs/concepts.ja.md"
  - root_cause_adr: "ADR-1554"
  - root_cause_adr: "ADR-445"
related_to:
  - TPL-1223
  - TPL-1227
  - TPL-1983
  - TPL-2174
  - TPL-2048
topic: renderer
scope:
  packages:
    - core
    - app
    - vscode
---

# TPL-3022: canvas が省略・保留した authored 情報は、その surface 上で全文に到達できる経路を持つ

## 観点

karasu は「一度に見せる情報量を絞る」ために、俯瞰では畳み、詳細は次の操作に委ねる
（`docs/concepts.ja.md`「集約 — 俯瞰時の情報量を絞る」）。この原則は **絞ることと、
絞ったものへ辿り着けることが対になって** 初めて成り立つ。集約エッジは詳細パネルで
内訳を出し（ADR-445 / ADR-463）、node の `description` は 50 文字に省略されるが
`NodeDetailPanel` が全文を出す。

省略や保留を足す変更は、片側だけを実装しやすい。canvas から消す側は 1 箇所
（renderer）で済み、見た目がすぐ良くなる。辿り着く側は surface ごとに別の実装が要り、
無くてもテストは落ちない。その結果「読みやすくなったが、書いた内容がどこにも出ない」
状態が、特定の surface でだけ起きる。

ADR-1554 が context menu でのラベル省略を却下した理由も同じ形をしている。回復のための
場所で省略すると、回復の手段が無くなる。

したがって、authored な情報を canvas で省略・保留する変更では、次の 2 つを別々に
確認する。

1. **その surface で、全文に到達する経路が 1 つ以上あること。** 経路は surface ごとに
   違ってよい（app は tooltip、静的 SVG は `<title>`、など）。
2. **到達した先では省略しないこと。** tooltip・詳細パネル・context menu は全文を
   折り返して出す。

## 想定される失敗モード

- ラベルを canvas から保留したが、tooltip を実装したのは app だけで、VS Code preview と
  静的 SVG では全文がどこにも出ない
- 保留した全文を SVG の中の隠し要素として持たせたが、node card より先に描かれるので、
  表示しても card の裏に回って読めない（#3022 の spike で実際に起きた）
- 全文を出すための属性を「無効時は出さない」規律（TPL-2174）と取り違え、保留している
  ときにも出さなくなる
- 省略の閾値を surface ごとに変えた結果、同じモデルが surface によって違う情報を落とす
- 回復の場所（tooltip・パネル）に同じ省略関数を使い回し、そこでも `…` で切れる
- hover にしか経路が無く、hover の無い端末では到達できない

## チェックリスト

authored な情報を省略・保留する PR で:

- [ ] 省略・保留が起きる各 render surface について、全文に到達する経路を PR に列挙した
      （app / 静的 SVG / all-layers / VS Code preview）
- [ ] 省略・保留した要素が全文を機械的に持つことを、surface ごとにテストで assert している
      （例: 保留した edge が `data-edge-label` か `<title>` を持つ）
- [ ] 到達した先（tooltip・パネル・menu）が省略関数を通らず、全文を折り返して出すことを
      確認した
- [ ] 全文を出す要素が、他の要素の裏に回らない重ね順にあることを実機かスクリーン
      ショットで確認した
- [ ] 何も省略・保留していないときは、追加のマーカーが出ないことも確認した（TPL-2174）

## 既知の対処パターン

- **全文は属性で運び、表示は surface が決める**: renderer は authored な全文を data 属性
  として要素に載せ（ADR-463 / ADR-1554 の配管）、各 surface が自分の手段で出す。SVG の
  中に隠しテキストを持たせない。
- **静的出力の fallback は `<title>`**: stylesheet も script も無い surface では、
  ブラウザ自身の tooltip が唯一の経路になる。
- **到達の経路を render option で明示する**: 「この surface は自前の tooltip を持つ」を
  別の能力のフラグに畳まず、独立の option にする（`nodeControls` を `interactive` に
  畳まなかったのと同じ理由）。

## 関連テスト

（未確立。#3022 の実装 PR で、保留した edge の到達性を全 surface で assert するテストを
足す。）
