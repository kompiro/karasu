---
id: TPL-2791
title: "モデルを読むだけのパス（解析・描画・書き出し）は、渡された KrsFile に書き込まない"
status: active
date: 2026-10-30
applicable_to:
  - "parse / resolve 済みの KrsFile を受け取って警告・SVG・書き出しを返す関数を追加・変更するとき"
  - "モデルについての派生事実（循環・所属・index）を、どこで求めてどこに置くかを決めるとき"
  - "parse 済みモデルを複数の builder や複数の呼び出しで使い回す（memoize・共有コンテキスト）とき"
known_consumers:
  - analyze
  - cyclic-dependency
  - drill-down-svg
  - all-layers-svg
  - drawio-export
discovered_from:
  - issue: "#2791"
  - root_cause_adr: "ADR-287"
  - root_cause_file: "packages/core/src/resolver/warnings.ts:detectCyclicDependencies"
related_to:
  - TPL-1032
  - TPL-2221
  - TPL-219
topic: resolver
scope:
  packages:
    - core
---

# TPL-2791: モデルを読むだけのパス（解析・描画・書き出し）は、渡された KrsFile に書き込まない

## 観点

`KrsFile` は `Parser.parse` または `ImportResolver.resolve` が返した時点で確定する。それを受け取るパス（`analyze()`、各 SVG builder、draw.io exporter など）は読むだけで、渡されたモデルに書き込まない。

判定の基準は 1 つ: **同じ `KrsFile` を、このパスを呼ぶ前と後で別の builder に渡したとき、結果が変わりうるか。** 変わりうるなら、このパスはモデルに書き込んでいる。

モデルについての派生事実（循環に入る edge、boundary の所属、node path の index）が要るときは、次のどちらかにする。

- **モデルを作る側が求めて載せる。** Parser の後処理と、ImportResolver のマージ後の再構築（[[TPL-2221]]）。`boundaryMembership`・`nodePathIndex`・`KrsEdge.cyclic` がこれに当たる。
- **戻り値で返す。** 警告は `Warning[]` で返す。

## 想定される失敗モード

- **呼んだ順で描画が変わる。** 解析パスが edge にフラグを立てると、そのパスより後に描いた図だけがフラグを反映する。同じモデル・同じ builder で出力が変わり、診断も出ない。
  **実例**（#2791）: `analyze()` が循環に入る edge に `edge.cyclic = true` を立てていた（ADR-287）。`buildDrillDownSvg(file)` は analyze の前に呼ぶと循環を普通の edge で、後に呼ぶと赤い循環 edge で描いた。
- **entry point によって描き分けが生まれる。** 「描く前に解析する」entry point と「解析しない」entry point で、同じモデルの描き方が揃わない。#2791 では app のライブ表示（`compileProject`）が循環を赤く描き、All-layers パネル（`buildAllLayersSvg`）と drill-down の書き出し（`buildDrillDownSvg`）は普通の edge で描いていた（[[TPL-219]]）。
- **モデルの使い回しが壊れる。** parse 結果を memoize する、bundle の全 level で抽出コンテキストを共有する（#2759）といった最適化は「使っている間モデルは変わらない」ことを前提にしている。書き込むパスが 1 つあると、この前提が黙って崩れ、キャッシュが古い値を返すのと同じ形の不具合になる（[[TPL-1032]]）。
- **今は表に出ない。** 毎回 parse し直す entry point しか無いあいだは、書き込みは観測されない。使い回しを入れた最初の PR で、原因から遠い場所に描画の不具合として現れる。

## チェックリスト

- [ ] 新しいパスは、受け取った `KrsFile` やその中の node・edge のプロパティに代入していないか（`edge.x = …`、`node.children.push(…)`、`file.<index> = …`）
- [ ] 派生事実を足すなら、Parser の後処理と ImportResolver のマージ後の両方で求めているか（ファイルをまたいで成立する事実なら、マージ後で求め直しているか）
- [ ] 不変性のテスト（parse 結果の `structuredClone` と、パスを通した後のモデルが deep-equal）の対象に、新しいパスを足したか
- [ ] 「描く前に X を呼んでおく必要がある」という前提をコメントや ADR に書いていないか。書いているなら、その前提は呼び出し順への依存である

## 既知の対処パターン

- **派生事実はモデル構築時に求める。** 先例は `boundaryMembership` と `nodePathIndex`（Parser の後処理で求め、ImportResolver がマージ後のモデルで求め直す）。#2791 は `KrsEdge.cyclic` を `analyze()` の副作用からこの形に移す計画で、読む側（`edge[cyclic]` の style、layout、routing、draw.io）は diff を外す指定のほかは変えない（Design Doc `docs/design/cyclic-flag-at-model-construction.md`、検討中）。
- **求める処理は純粋関数にして、警告を出す側と構築する側で共有する。** #2791 の計画では、循環に入る edge の集合と警告を返す純粋関数を 1 つ置き、構築側はその集合から edge にフラグを立て、`analyze()` は警告だけを使う。

## 関連テスト

- （#2791 の実装 PR で追加し、ここにパスを書く）examples 全件と循環を含む fixture で、`analyze` と各 builder を通した後もモデルが parse 直後と deep-equal であることを検査するテスト。新しいパスはこのテストの表に足す。

## 派生元 spec

- 決定: [ADR-287](../adr/287-cyclic-dependency-detection.md)（`KrsEdge.cyclic` の導入。立てる場所は #2791 の Design Doc `docs/design/cyclic-flag-at-model-construction.md` で変える）
