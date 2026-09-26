---
id: TPL-2756
title: "パイプラインの下流は、上流が組み立てた集合を作り直さず消費する"
status: active
date: 2026-09-24
applicable_to:
  - "抽出 → レイアウト → 描画のように、上流が集合（エッジ・ノード・スタイル・ghost）を組み立てて下流がそれを描くコード"
  - "下流が上流の成果物ではなく元モデル（`sys.edges` / `node.children` など）から同じ集合を組み直している箇所"
  - "上流に新しい派生族・新しい導出ルールを足す変更"
  - "分岐ごとに入力の作り方が違うパイプライン（single / multi、primary / 非 primary）"
known_consumers:
  - layout-single-vs-multi-system
  - view-extract
  - layout-edges
  - view-diff
  - style-resolver
discovered_from:
  - issue: "#2756"
  - issue: "#2223"
  - root_cause_file: "packages/core/src/renderer/layout.ts"
  - root_cause_file: "packages/core/src/view/view-extract.ts"
  - root_cause_adr: "ADR-2223"
related_to:
  - TPL-219
  - TPL-999
  - TPL-1666
topic: renderer
scope:
  packages:
    - core
---

# TPL-2756: パイプラインの下流は、上流が組み立てた集合を作り直さず消費する

## 観点

karasu の描画は「抽出が集合を組み立て、レイアウトが並べ、レンダラが描く」という一方向の
パイプラインである。この形が壊れるのは、**下流のステージが上流の成果物を読まず、同じ集合を
元モデルから組み直すとき**である。組み直した側は上流が足した分を知らないので、上流に族が
1 つ増えるたびに下流で黙って落ちる。

TPL-219 は「並列に存在する関数ファミリの parameter parity」を見る観点で、**呼び出し側が渡した
ものが片方の関数に届かない**形を扱う。本観点は切り口が違う。**誰も何も渡し忘れていない。**
下流は上流の成果物を受け取っているのに、それを使わず自分で作り直している。options を全分岐へ
通しても直らないので、TPL-219 のチェックリストでは捕まらない。

判定条件は 1 つ。**その集合を作る関数が 2 つ以上あるなら、下流の 1 つは要らない。**

#2223 では、抽出が `service S { S -> Other }` を拾えるようにしたのに、multi-system root の
レイアウトが `sys.edges` から組み直していたため描画直前で落ちた。そのとき **anchored edge だけ**を
レイアウト側にも足して塞いだ。#2756 はその塞ぎ残しで、同じ経路が infra 派生・implicit service・
`delivers` の 3 族をまだ落としていた。**同じ形が同じ場所で 2 回起きている。**

## 想定される失敗モード

- 上流に新しい派生族を足した PR が、下流で作り直している経路を直し忘れる。型は通り、
  上流のテスト（slice に対する assert）も通るので、**描画されないことに誰も気づかない**
- 「single system では出るのに root view では出ない」のように、**分岐依存で機能が丸ごと消える**。
  モデルの書き方（矢印で書くか `resource` で書くか）によって出る / 出ないが変わる
- 塞ぎ方が族単位になり、次の族で同じ穴が開く（#2223 → #2756 がまさにこれ）
- 上流が集合と一緒に持たせた**付随情報が落ちる**。#2756 では implicit service エッジの構成要素
  （詳細パネルの行）と compare モードの diff state が、エッジだけ作り直した経路に届かなかった
- 回帰柵を**上流の成果物に対して張ってしまう**（`slice.childEdges` を assert する）。下流が
  それを読まないので、柵は穴を素通りする（ADR-2223 の「実装上の落とし穴」がこれを明記している）

## チェックリスト

上流の導出を変えるとき、下流の入力を変えるとき、パイプラインに分岐を足すときに確認する:

- [ ] その集合を組み立てる関数は 1 つか。下流に「元モデルから作り直している」箇所が残っていないか
      （`sys.edges` / `node.children` / `withChildAnchoredEdges` のような元モデル参照を下流で grep する）。
      上流に族を 1 つ足したとき下流が自動で受け取らないなら、作り直しが残っている印
- [ ] 作り直しを残すなら、**なぜ上流の成果物では足りないのか**をコメントで名指ししているか。
      足りない理由が「上流が除外しているから」なら、その除外理由と対で書く
- [ ] 集合と一緒に運ぶべき付随情報（詳細・diff state・スタイル・provenance）も同じ経路で届くか。
      **エッジだけ届いて中身が空**という半端な状態になっていないか
- [ ] 柵は**下流の出力**に張っているか（`layout().edges` / 描画 SVG）。上流の成果物への assert だけで
      終わっていないか
- [ ] 分岐ごとに入力の作り方が違うなら、**同じモデルを各分岐に置いた parity 表**で出力が一致することを
      縛っているか（single / primary / 非 primary / 擬似 system）

## 既知の対処パターン

- **上流に「1 フレーム分の集合」を作る関数を 1 つ置き、下流はそれを引くだけにする。** #2756 では
  `deriveCanvasEdges()` を 1 本にして全 system に対して呼び、`ViewSlice.systemEdges` として
  フレームごとに載せ、レイアウトは `systemEdges.get(sys.id)` を読むだけにした
- **付随情報は集合と同じ器に入れる。** キーで後から引き当てる形にすると、キーが一意でない面
  （root view の bare id）で混線する。#2756 は詳細マップと diff state をフレームのエントリに同居させ、
  diff state はさらに `LayoutEdge` 自身に刻んだ
- **fallback を残して既存の呼び出しを壊さない。** `viewSlice.systemEdges?.get(sys.id)?.edges ?? withChildAnchoredEdges(sys)`
  の形なら、slice を手組みする直接呼び出しは無変更で動く
- 作り直しを**意図的に**残す場合（#2756 の `crossSystemSource` は宣言済み集合から取る）、
  上の 2 番目のチェック項目どおり理由をコメントに書く

## 関連テスト

- `packages/core/src/renderer/layout.test.ts` — 「the root view draws every derived edge family」節。
  派生 3 族 × 3 位置（single / `si === 0` / `si >= 1`）の parity 表と、`system` を書かないモデル
  （`__unassigned__` 単独）の柵。いずれも `layout().edges`（下流の出力）に対して張っている
- `packages/core/src/renderer/layout.test.ts` — 「compare-mode diff state stays with its own system frame」節。
  付随情報がフレームに閉じていることと、single 経路が従来のキー引きのままであること
- `packages/core/src/view/view-extract.test.ts` — 「per-system-frame edge sets on the root view」節。
  全 system 分のフレームが揃い、`childEdges` がその union であること
- `packages/core/src/view/view-extract.test.ts` — 「derived edges on every frame reach style resolution」節。
  付随情報のうちスタイルが届くこと（TPL-1666 の隣）
- `packages/core/src/view/anchored-edge-render-or-warn.test.ts` — #2223 の柵。配置ごとに「描画される」か
  「報告される」かのちょうど一方が成り立つことを表で縛る。**上流と下流の両方を通した出力**で見ている
