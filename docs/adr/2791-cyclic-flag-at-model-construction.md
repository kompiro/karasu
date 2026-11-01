---
id: ADR-2791
title: "`KrsEdge.cyclic` をモデル構築時に導出し、`analyze()` を読むだけのパスにする"
status: accepted
date: 2026-10-31
topic: resolver
supersedes: [ADR-287]
scope:
  packages:
    - core
assumptions:
  - "file: packages/core/src/parser/cyclic-dependencies.ts"
  - "symbol: packages/core/src/parser/cyclic-dependencies.ts :: findCyclicDependencies"
  - "symbol: packages/core/src/parser/cyclic-dependencies.ts :: markCyclicEdges"
  - "symbol: packages/core/src/parser/finalize-file.ts :: markCyclicEdges"
  - "symbol: packages/core/src/fs/import-resolver.ts :: markCyclicEdges"
  - "symbol: packages/core/src/resolver/warnings.ts :: findCyclicDependencies"
  - "symbol: packages/core/src/compile/compile-diff.ts :: NO_CYCLIC_TAG"
  - "symbol: packages/core/src/diff/view-diff.ts :: withoutCyclic"
  - "grep: packages/core/src/resolver/style-resolver.ts :: cyclicTag && edge\\.cyclic"
  - "file: packages/core/src/resolver/model-immutability.test.ts"
  - "file: packages/core/src/parser/cyclic-dependencies.test.ts"
  - "file: docs/test-perspectives/TPL-2791-read-passes-do-not-write-the-model.md"
---

# ADR-2791: `KrsEdge.cyclic` をモデル構築時に導出し、`analyze()` を読むだけのパスにする

- **日付**: 2026-10-31
- **ステータス**: 決定済み
- **関連**:
  - Issue #2791（起点）、Design Doc PR #3406、実装 PR #3422
  - [ADR-287](287-cyclic-dependency-detection.md)（`KrsEdge.cyclic` の導入。本 ADR が supersede する。検出規則は下の「決定」に引き継ぐ）
  - 関連 Issue: #2757（parse 済みモデルの使い回しへ向かう perf 作業）、#2759（bundle の全 level で抽出コンテキストを共有）
  - TPL: [TPL-2791](../test-perspectives/TPL-2791-read-passes-do-not-write-the-model.md)（本件で proactive に起こした）、[TPL-2221](../test-perspectives/TPL-2221-merge-only-facts-decided-on-merged-model.md)（循環はファイルをまたいで成立しうる）、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)（entry point 間で同じものを描く）、[TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)（派生状態が古いまま残る）
  - コード: `packages/core/src/parser/cyclic-dependencies.ts`、`packages/core/src/parser/parser.ts`、`packages/core/src/fs/import-resolver.ts`、`packages/core/src/resolver/warnings.ts`、`packages/core/src/resolver/style-resolver.ts`、`packages/core/src/compile/compile-diff.ts`、`packages/core/src/diff/view-diff.ts`

## 背景

ADR-287 は、`analyze()` が循環を見つけたとき、その edge オブジェクトに `edge.cyclic = true` を立てる方式を採った。理由の 1 つは「`analyze()` は `_compileCore` 内で `resolveStyles()` より前に呼ばれることが保証されている」ことだった。

この前提は entry point が増えるうちに崩れていた。

- `analyze()` は渡された `KrsFile` を書き換えるので、**同じ `KrsFile` でも `analyze()` の前と後で描画が変わる**。相互の sync edge 2 本のモデルで、`buildDrillDownSvg` の出力は 2074 bytes から 2289 bytes に変わった。
- entry point によって循環の描き方が揃っていなかった。`compile` / `compileProject`（app のライブ表示、CLI）、`buildAllViewsSvg*`、`buildDrawioProject` は描く前に analyze するので赤く描く。`buildDrillDownSvg`（drill-down の書き出し）、`buildAllLayersSvg`（All-layers パネル）、`renderEntityView`（ライブの entity view）、`buildDrawio` は analyze しないので普通の edge で描く。
- #2757 の perf 作業は parse 済みモデルを使い回す方向に進み、#2759 は「使っている間はモデルが変わらない」ことを共有の安全性の根拠にしている。読むだけのはずのパスが書き込むと、この根拠が成り立たない。

examples 85 件と Dify のモデルで、parse 結果を `structuredClone` した写しと、`analyze` / `buildDrillDownSvg` / `buildAllLayersSvg` / `buildAllViewsSvg` / `buildDrawio` を通した後のモデルを比べたところ、モデルを書き換えるのは `analyze` と、内部で `analyze` を呼ぶ `buildAllViewsSvg` だけで、書き込む中身は `cyclic` だけだった。

## 決定

**`KrsEdge.cyclic` を `boundaryMembership` と同じ「モデル構築時に導出する事実」にし、モデルを作る 2 か所（Parser の後処理と ImportResolver のマージ後）だけが立てる。`analyze()` を含め、完成したモデルを受け取るパスはモデルに書き込まない。diff は循環の描き方を使わない。**

1. **検出は純粋関数にする**: `findCyclicDependencies(file)`（`parser/cyclic-dependencies.ts`）は循環に入る edge の集合と `cyclic-dependency` 警告を返し、モデルには書き込まない。Parser と ImportResolver が呼ぶので `parser/` に置く（依存は `resolver/ → parser/` の一方向のまま）。
2. **検出規則は ADR-287 のものを引き継ぐ**:
   - 対象は `kind === "sync"` の edge だけ。async（`-->`）の循環は結果整合性を狙った意図的なパターンが多いので対象外にする。
   - スコープごと（system の edge、その下の各 node の edge）に独立して深さ優先探索し、後退辺で循環を見つける。後退辺と、循環の各区間の並行する sync edge すべてを循環に入れる。
   - 自己参照 `A -> A` は色の判定より前に専用に扱う。
   - entity の関係 edge は対象外（自己参照や相互参照は ER の普通の形）。
   - スコープをまたぐ循環は検出しない（ADR-287 の残課題のまま）。
   - すべて warning で、error にしない。
3. **フラグを立てるのは `markCyclicEdges(file)` だけ**: 全スコープの edge の `cyclic` を落としてから、集合に入る edge に立てる。呼ぶのは `Parser.parse`（`buildBoundaryMembership` の隣）と `ImportResolver.resolve` のマージ後の 2 か所。マージ後に落としてから立て直すので、ファイルをまたぐ循環はマージ後のモデルで立ち、ファイル単位で立てたフラグが古いまま残らない（TPL-2221）。builder が受け取る `KrsFile` は、`boundaryMembership` や `nodePathIndex` と同じく、この 2 か所が作ったものに限る。`createEmptyKrsFile()` から手で組み立てたモデル向けに `cyclic` を導出する公開関数は足さない（要る呼び出し元が現れたら、派生事実をまとめて載せる関数として別に検討する）。
4. **`analyze()` は `findCyclicDependencies(file).warnings` を返すだけ**にする。警告の件数・`cyclePath`・`loc` は ADR-287 のときと同じ。
5. **diff は循環を描かない**: diff の `resolveStyles` はすべて `cyclicTag: false`（`NO_CYCLIC_TAG`）を渡し、`edge[cyclic]` が当たらない。`diffEdgeArray` は `cyclic` が立った edge だけを、フラグを外したコピーにして slice に入れる（class と routing の除外を止める）。立っていない edge はコピーしない。
6. **読む側は変えない**: `edge[cyclic]` の builtin style、利用者の `.krs.style` での上書き、`krs-edge--cyclic` class、routing が cyclic edge を除外する挙動、draw.io の書き出しは ADR-287 のまま。

## 理由

- **完成したモデルが不変になる。** `KrsFile` は parse か resolve が返した時点で確定し、どの builder をどの順で呼んでも同じものを描く。#2757 / #2759 の使い回しの前提が成り立つ。
- **単一ファイルのモデルでは entry point による描き分けが無くなる。** All-layers パネル・ライブの entity view・drill-down の書き出し・`buildDrawio` も、ライブ表示や `karasu render` と同じく循環を赤く描く（TPL-219）。
- **ADR-287 が `edge[tag]` に載せた利点はそのまま残る。** render のシグネチャは変わらず、利用者は `edge[cyclic]` を上書きできる。
- **diff で循環を描かないのは、diff が変化を描く面だから。** removed の edge は before 側のフラグを持ち込むのに、diff の警告は after 側しか出さないので図と警告が食い違う。また builtin の `edge[cyclic]` の色 `#EF4444` は diff の removed の線の色 `#ef4444` と同じで、unchanged の循環 edge が removed に見える。色と線幅は slice ではなく AST の edge から解決されるので、slice のフラグを外すだけでは赤い線が残る。style 解決の指定と slice のコピーの両方で止める。
- **コピーを循環 edge に限るのは、layout が cross-system edge の出どころを edge オブジェクトの同一性で引くから**（`layout.ts` の `crossSystemSource`）。全 edge をコピーすると、同じ素の id を畳む複数 system の diff で出力が変わる。
- **出力の変化は循環を含むモデルに限られる。** 実装 PR で examples 85 件と Dify を main と比べた。`compile` / `compileProject` / `buildAllViewsSvg*` / `buildDrawioProject` / diff 系は全件バイト同一、`buildDrillDownSvg` / `buildAllLayersSvg` / `buildDrawio` は Dify だけが変わった（循環 1 件が赤くなった）。
- **検出は parse のたびに回るので、深い入力でも落ちず、二乗にならないようにした。** 再帰をやめて明示的なスタックで回し（20000 段の chain が parse できる）、印を付け終えた区間は下向きの union-find で飛ばし（全 node が root を呼ぶ chain）、区間の edge は `(from, to)` の索引で引く（多数の service を呼び、そのすべてから呼び返される hub）。印を付けるだけのときは警告と循環の経路を作らない。main の検出と 6000 以上のランダムなグラフで比べ、警告・フラグとも一致した。Dify の parse は 11.2 ms から 11.3 ms。
- **書き込みは機械で検出する。** `model-immutability.test.ts` が examples 全件と循環を含む fixture について、`analyze` / `collectModelWarnings` / 各 builder を通した後もモデルが `structuredClone` と deep-equal であることを確かめる。新しいパスはその `PASSES` 表に足す（TPL-2791）。

## 却下した案

### 案1: 循環 edge の集合を render の引数で渡す（Issue の提案）

どの entry point の出力もバイト同一に保てるが、ADR-287 が「render / CompileResult のシグネチャ変更が必要で波及大」として却下した案そのものである。加えて、slice の edge の多くは `{ ...edge }` のコピーで AST の edge との同一性が切れるので、集合の鍵が決まらない。style 解決・layout・draw.io の 3 層それぞれに配線が要り、entry point による描き分けが設計として固定される。

### 案2: 描画時に slice の edge から循環を求める

slice の edge は implicit edge や集約 edge を含み、スコープの edge とは別物なので、循環の意味が ADR-287 のスコープ単位の規則から外れ、`cyclic-dependency` 警告と描画が食い違う。

### 案3: `KrsFile` を `Readonly` 型にする・`Object.freeze` する

型の波及が大きい。書き込みは deep-equal のテストで捕まえられる。

## 残課題

- ファイルをまたぐ循環は、source 文字列を 1 ファイル分だけ parse する builder（`buildDrillDownSvg` などの公開版）からは見えないので、`compileProject` との差が残る（この ADR の前からある差）。
- 検出を回す回数が増えた。単一ファイルでは 1 回のキー入力で 2 回（parse と `analyze`）、project mode ではファイルごとの parse・マージ後・`analyze` で回る。測った範囲では parse 時間への影響は小さい。
