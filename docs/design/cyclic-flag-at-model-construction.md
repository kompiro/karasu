# `KrsEdge.cyclic` をモデル構築時に導出し、`analyze()` を読むだけのパスにする

- **日付**: 2026-10-30
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2791](https://github.com/kompiro/karasu/issues/2791)
  - 関連 ADR: [ADR-287](../adr/287-cyclic-dependency-detection.md)（`KrsEdge.cyclic` の導入。本 Design Doc はフラグを立てる場所を変える）
  - 関連 Issue: [#2757](https://github.com/kompiro/karasu/issues/2757)（parse 済みモデルの使い回しへ向かう perf 作業）、[#2759](https://github.com/kompiro/karasu/issues/2759)（bundle の全 level で抽出コンテキストを共有）
  - 関連 TPL: [TPL-2221](../test-perspectives/TPL-2221-merge-only-facts-decided-on-merged-model.md)（cycle はファイルをまたいで成立しうる事実）、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)（静的 bundle は app と同じものを描く）、[TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)、[TPL-2791](../test-perspectives/TPL-2791-read-passes-do-not-write-the-model.md)（本 PR で proactive に起こす）
  - コード: `packages/core/src/resolver/warnings.ts`（`detectCyclicDependencies`）、`packages/core/src/parser/parser.ts`、`packages/core/src/fs/import-resolver.ts`

## 背景・課題

`analyze()` は渡された `KrsFile` を書き換える。sync edge の循環を見つけると、その edge オブジェクトに `edge.cyclic = true` を立てる（ADR-287）。renderer・style resolver・draw.io exporter はこのフラグを読むので、**同じ `KrsFile` でも `analyze()` を呼ぶ前と後で描画が変わる**。

```ts
const file = Parser.parse(src).value;          // system S { service A  service B  A -> B  B -> A }
const before = buildDrillDownSvg(file).svg;    // 2074 bytes
analyze(file, sheets);                         // 両 edge に cyclic = true
const after = buildDrillDownSvg(file).svg;     // 2289 bytes
```

今は表に出ていない。どの entry point も「毎回 parse し直す」か「描く前に analyze する」かのどちらかだからである。ただし #2757 の perf 作業は parse 済みモデルを使い回す方向に進んでいて、#2759 は bundle の全 level で抽出コンテキストを共有し、その安全性を「使っている間はモデルが変わらない」ことに置いている。読むだけのはずのパスがモデルに書き込むと、この前提が成り立たない。

使い回しをしていない今でも、entry point によって循環の描き方が揃っていない（下表）。app のライブ表示では赤い循環 edge が、app の SVG 書き出しでは普通の edge になる。

## 現状（インベントリ）

`cyclic` を立てる場所は `detectCyclicDependencies`（`resolver/warnings.ts`）の 1 か所だけ。読む側は 3 層に分かれる。

| 層 | 読む場所 | 何を読むか |
| --- | --- | --- |
| style 解決 | `style-resolver.ts` `edgeSelectorMatches` | `edge.cyclic` を仮想タグ `cyclic` として `edge[cyclic]` に当てる |
| layout | `layout-edges.ts` | slice の edge から `LayoutEdge.cyclic` に写す |
| routing ほか | `edge-routing-*.ts`、`port-frame.ts`、`crossing-marks.ts`、`label-placement.ts`、`layout.ts` | `LayoutEdge.cyclic`（layout が作った派生物。AST ではない） |
| draw.io | `drawio-exporter.ts` | slice の edge の `cyclic` |

slice の edge は AST の edge そのものか、`{ ...edge, from, to }` で作ったコピー（implicit edge・集約 edge・collapse の stub・projected edge など、`view-extract.ts` だけで 7 か所）である。コピーは `cyclic` を引き継ぐ。

entry point ごとの現状（「循環が赤く描かれるか」）:

| entry point | 描く前に analyze するか | 循環の描画 |
| --- | --- | --- |
| `compile` / `compileProject`（app のライブ表示、CLI `render --view`） | する（`collectModelWarnings` が先） | 赤 |
| `buildAllViewsSvg` / `buildAllViewsSvgProject`（CLI `render`、nest） | する（関数の先頭） | 赤 |
| `buildDrawioProject` | する（warnings を先に集める） | 赤 |
| `buildDrillDownSvg` / `buildAllLayersSvg` / `renderEntityView`（app の SVG 書き出し） | しない | 普通の edge |
| `buildDrawio(krsFile)` | しない | 普通の edge |
| `compile*Diff` / `buildAllViewsSvgDiffProject` | 描いた後に after 側だけ | 普通の edge |

実測（2026-10-30、main `c17b473c`）:

- examples の `.krs` 85 件に sync の循環は 0 件。
- Dify のモデル（`/workspaces/dify/index.krs`）は循環 1 件。`buildDrillDownSvg` と `buildAllLayersSvg` の出力は analyze の前後で変わる。
- examples 85 件 + Dify で、parse 結果を `structuredClone` した写しと deep-equal を比べた。`analyze` / `buildDrillDownSvg` / `buildAllLayersSvg` / `buildAllViewsSvg` / `buildDrawio` のうち、モデルを書き換えたのは `analyze` と、内部で `analyze` を呼ぶ `buildAllViewsSvg` だけ（どちらも Dify のみ）。**cyclic 以外にモデルへ書き込むパスは見つからなかった。**

## 制約・前提

- 循環の検出規則（sync のみ、スコープごとの DFS、entity の関係 edge は除外、スコープをまたぐ循環は対象外）は変えない。ADR-287 の規則をそのまま使う。
- `cyclic-dependency` 警告の件数・`cyclePath`・`loc` は変えない。LSP も `analyze()` から同じものを受け取る。
- `edge[cyclic]` の style、`krs-edge--cyclic` class、routing が cyclic edge を除外する挙動は変えない。
- 循環は**ファイルをまたいで成立しうる**事実である（`system S` を 2 ファイルで reopen し、`A -> B` と `B -> A` を別ファイルに書く）。TPL-2221 に従い、project mode ではマージ後のモデルで判定する。
- render の公開 API のシグネチャは変えない。

## 検討した選択肢

### 案1: モデル構築時に導出する（Parser と ImportResolver が立てる）

`cyclic` を `boundaryMembership` や `nodePathIndex` と同じ「モデル構築時に導出する事実」にする。

- 循環の検出を純粋関数 `findCyclicDependencies(file)` に切り出す。モデルには書き込まず、循環に入る edge の集合と警告を返す。
- `Parser.parse` の後処理（`buildBoundaryMembership` などを呼んでいる箇所）で集合を求め、該当 edge に `cyclic = true` を立てる。自分が作っている最中の AST に書くので、渡されたモデルを書き換えることにはならない。
- `ImportResolver.resolve` は、マージ後のモデルで全 edge の `cyclic` を一度落としてから同じ関数で立て直す。ファイルをまたぐ循環もここで立つ（`boundaryMembership` の再構築と同じ位置）。
- `analyze()` は同じ関数を呼んで警告だけを返す。モデルには書き込まない。

**メリット**

- 渡されたモデルに書き込むパスが無くなる。`KrsFile` は parse（または resolve）が返した時点で確定し、どの builder・どの順で呼んでも同じ描画になる。
- 読む側（style・layout・draw.io・routing）は一切変わらない。ADR-287 が `edge[tag]` の仕組みに載せた利点（render のシグネチャ不変、利用者が `.krs.style` で `edge[cyclic]` を上書きできる）をそのまま保つ。
- entry point による描き分けが無くなる。app の SVG 書き出しも diff も、ライブ表示と同じく循環を赤く描く（TPL-219）。

**デメリット**

- 今 analyze しない entry point の出力が、**循環を含むモデルに限って**変わる（普通の edge → 赤い循環 edge）。Issue の受け入れ条件 2「今のすべての entry point でバイト同一」を文字どおりには満たさない（後述「受け入れ条件の読み替え」）。
- 循環の DFS が parse ごとに 1 回増える（analyze 側でも警告のために 1 回回す）。edge 数に線形で、per-keystroke の parse でも無視できる大きさと見込む。実装 PR で計測する。

### 案2: 循環 edge の集合を render の引数で渡す（Issue の提案）

`analyze()` は警告と一緒に循環 edge の集合を返し、renderer は `facetOverlay` や `boundaryMembership` と同じように引数で受け取る。

**メリット**

- どの entry point の出力もバイト同一に保てる。集合を渡す entry point だけが赤く描き、渡さないものは今のまま。

**デメリット**

- ADR-287 が「render / CompileResult のシグネチャ変更が必要で波及大」として**却下済みの案**である。今回はさらに、集合の鍵が決まらない。slice の edge の多くは `{ ...edge }` のコピーで、AST の edge との同一性が切れる。コピーが共有する `loc` オブジェクトを鍵にすれば動くが、「同じ `loc` を指す別の edge は同じ循環に属する」という暗黙の前提を全コピー経路に課すことになる。
- style 解決（`edge[cyclic]`）・layout・draw.io の 3 層それぞれに集合を通す配線が要る。
- entry point による描き分け（ライブ表示と書き出しで循環の色が違う）が設計として固定される。

### 案3: 描画時に slice の edge から循環を求める

renderer が描く level の edge 集合で DFS する。

**デメリット**

- slice の edge はスコープの edge とは別物（implicit edge・集約 edge を含む）なので、循環の意味が ADR-287 のスコープ単位の規則と変わり、`cyclic-dependency` 警告と描画が食い違う。今 analyze する entry point の出力も変わる。採らない。

## 比較

| 観点 | 案1 構築時に導出 | 案2 引数で渡す | 案3 描画時に求める |
| --- | --- | --- | --- |
| 渡されたモデルに書き込むか | 書き込まない | 書き込まない | 書き込まない |
| 読む側の変更 | なし | style・layout・draw.io に配線 | renderer 内に DFS |
| 今 analyze する entry point の出力 | 不変 | 不変 | 変わりうる |
| 今 analyze しない entry point の出力 | 循環を含むモデルだけ赤くなる | 不変 | 変わる |
| entry point 間の一貫性 | 揃う | 描き分けが残る | 揃うが警告と食い違う |
| ファイルをまたぐ循環 | merge 後に再導出（TPL-2221） | analyze が merge 後に走る限り可 | slice 次第 |

## 現時点の方針

**案1 を採用する。** `cyclic` は「循環という、モデルについての事実」であり、`boundaryMembership` と同じくモデルを作った時点で確定させるのが自然である。読む側を一切変えずに、渡されたモデルを書き換えるパスを無くせる。案2 は ADR-287 が却下した理由（配線の波及）がそのまま残り、加えてコピーされた edge の同一性という新しい問題を持ち込む。

### 受け入れ条件の読み替え

Issue の受け入れ条件 2 は「循環 edge の描画は、今のすべての entry point で今と同じ。examples と Dify でバイト同一」である。案1 では次のように読み替える。

- **今 analyze してから描く entry point**（`compile`・`compileProject`・`buildAllViewsSvg*`・`buildDrawioProject`）: examples 全件と Dify でバイト同一。
- **今 analyze しない entry point**（`buildDrillDownSvg`・`buildAllLayersSvg`・`renderEntityView`・`buildDrawio`・diff 系）: examples 全件でバイト同一（循環が 0 件のため）。循環を含むモデル（Dify）では、循環 edge が `compile` と同じ描き方に変わる。これは描き分けの解消であり、changeset（core と `karasu` の patch）で利用者に知らせる。

### 実装の指針

1. `resolver/warnings.ts` の `detectCyclicDependencies` を純粋関数 `findCyclicDependencies(file): { cyclicEdges: Set<KrsEdge>; warnings: Warning[] }` に書き換え、新しいモジュール（`resolver/cyclic-dependencies.ts`）に移す。走査範囲（`file.systems` とその子孫、entity は除外）と DFS は今のまま。
2. 同じモジュールに `markCyclicEdges(file)` を置く。全スコープの edge の `cyclic` を落としてから、集合に入る edge に立てる。呼び出し元はモデルを作る 2 か所だけ:
   - `Parser.parse` の後処理（`buildBoundaryMembership` の隣）
   - `ImportResolver.resolve` のマージ後（`buildBoundaryMembership` の再構築の隣）
3. `analyze()` は `findCyclicDependencies(file).warnings` を返すだけにする。
4. テスト:
   - 受け入れ条件 1: 同じ `KrsFile` を `buildDrillDownSvg` で 2 回描き、間に `analyze()` を挟んでも同じ SVG（循環を含むモデル）。
   - 受け入れ条件 3（機械検査）: examples 全件と循環を含む fixture で、parse 結果の `structuredClone` を取り、`analyze` / `collectModelWarnings` / 各 builder を通した後も deep-equal であること。新しいパスを足したときにこの表へ足す形にする（TPL-2791）。
   - 受け入れ条件 2: 今 analyze する entry point について、循環を含む fixture で `compile` の出力が変わらないこと（既存の cyclic のテストが通ること）。加えて `buildDrillDownSvg` が `compile` と同じく `krs-edge--cyclic` を出すこと。examples と Dify のバイト同一は実装 PR で main との比較を測って本文に記す。
   - TPL-2221: `system S` を 2 ファイルで reopen して循環を分けたとき、`compileProject` で両 edge が `cyclic` になり、警告が 1 件であること。単一ファイルの `compile` でも 1 件であること。
5. AT は追加しない。確かめる項目はすべて自動テストで固定できる。
6. ADR 昇格: 実装完了後、`docs/adr/2791-cyclic-flag-at-model-construction.md` として昇格する。ADR-287 の「`analyze()` が `resolveStyles()` より前に呼ばれることが保証されており」という理由は成り立たなくなるので、新 ADR は ADR-287 のフラグを立てる場所の決定を置き換える（`.claude/rules/adr.md` の supersede の書き方に従う）。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 循環を含むモデルで、app の SVG 書き出し・diff・`buildDrawio` の循環 edge が、ライブ表示や `karasu render` と同じ赤い描き方になる。それ以外は変わらない。
- 公開 API: `KrsEdge.cyclic` は残る。立つ時点が「analyze の後」から「parse / resolve の直後」に早まるだけで、型は変わらない。
- ドキュメント更新: `docs/spec/tags-annotations*.md` の `[cyclic]` は「描画時に付与」のまま正しい（`.krs` には現れない仮想タグ）。変更なし。
- テスト・examples への影響: examples に循環は無いので、snapshot は変わらない見込み。

## 未解決の問い / 決めないこと

- スコープをまたぐ循環（ADR-287 の残課題）は扱わない。
- `KrsFile` 全体を `Readonly` 型にする・`Object.freeze` する案は採らない。型の波及が大きく、今回の検査（deep-equal のテスト）で書き込みは捕まえられる。
