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

使い回しをしていない今でも、entry point によって循環の描き方が揃っていない（下表）。app のライブ表示と all-views の書き出しでは赤い循環 edge になり、All-layers パネル・ライブの entity view・drill-down の書き出しでは普通の edge になる。

## 現状（インベントリ）

`cyclic` を立てる場所は `detectCyclicDependencies`（`resolver/warnings.ts`）の 1 か所だけ。`KrsEdge.cyclic` を直接読むのは style 解決と layout の 2 か所で、それより後ろは layout が作った `LayoutEdge.cyclic` を読む。style 解決が読むのは slice ではなく AST の edge である点に注意する。

| 読む場所 | 何を読むか |
| --- | --- |
| `style-resolver.ts` `resolveStyles` → `edgeSelectorMatches` | 渡された system の **AST の edge** を走査し、`edge.cyclic` を仮想タグ `cyclic` として `edge[cyclic]` に当てる。結果は from / to / kind を鍵にした map で、renderer は layout edge の from / to / kind で引く。slice の edge を見るのは、この map に無い鍵を補う `addMissingEdgeStyles` だけ |
| `layout-edges.ts` | slice の `edge.cyclic` を `LayoutEdge.cyclic` に写す |
| `edge-routing.ts`（`krs-edge--cyclic` class）、`edge-routing-*.ts`、`port-frame.ts`、`crossing-marks.ts`、`label-placement.ts`、`layout.ts` | `LayoutEdge.cyclic`（layout が作った派生物。AST ではない） |
| `drawio-exporter.ts` | `page.layout.edges` の `LayoutEdge.cyclic` |

slice の edge は AST の edge そのものか、`{ ...edge, from, to }` で作ったコピーである。コピーは `view-extract.ts` に 8 か所（implicit edge・集約 edge・projected edge・entity の ghost edge など）、renderer 側に collapse の stub が 2 か所（`group-collapse.ts`・`category-collapse.ts`）あり、どれも `cyclic` を引き継ぐ。集約した implicit edge は、束ねた domain edge のうち 1 本の `cyclic` だけを引き継ぐ（今の挙動。本 Design Doc では変えない）。

entry point ごとの現状（「循環が赤く描かれるか」）:

| entry point | 描く前に analyze するか | 循環の描画 |
| --- | --- | --- |
| `compile` / `compileProject`（app のライブ表示、CLI `render --view`） | する（`collectModelWarnings` が先） | 赤 |
| `buildAllViewsSvg` / `buildAllViewsSvgProject`（CLI `render`、nest、app の all-views 書き出しと share） | する（関数の先頭） | 赤 |
| `buildDrawioProject` | する（warnings を先に集める） | 赤 |
| `buildDrillDownSvg`（app の drill-down 書き出し）/ `buildAllLayersSvg`（app の All-layers パネル）/ `renderEntityView`（app のライブ entity view） | しない | 普通の edge |
| `buildDrawio(krsFile)` | しない | 普通の edge |
| `compile*Diff` / `buildAllViewsSvgDiffProject` | 描いた後に after 側だけ | 普通の edge |

diff は before と after の slice を `diffEdgeArray`（`diff/view-diff.ts`）で 1 つにまとめる。removed の edge は before 側の edge オブジェクトがそのまま入る。

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
- diff は cyclic の描き方を使わない。止める場所は 2 つで、どちらもモデルには書き込まない。1 つは style 解決で、diff が `resolveStyles` を呼ぶときは `cyclic` の仮想タグを付けない指定を渡す（色と線幅は AST の edge から解決されるので、slice 側で外すだけでは赤い線が残る）。もう 1 つは `diffEdgeArray` で、`cyclic` が立っている edge だけを、`cyclic` を外したコピーにして slice に入れる（class と routing の除外を止める）。立っていない edge はコピーしない。layout は cross-system edge の出どころを edge オブジェクトの同一性で引いており（`layout.ts` の `crossSystemSource`）、全 edge をコピーするとこの lookup が外れて、同じ素の id を畳む複数 system の diff で出力が変わるためである。理由は 2 つある。removed の edge が before 側の判定を持ち込むのに、diff の警告は after 側しか出さないので、図と警告が食い違う。そして builtin の `edge[cyclic]` の色 `#EF4444` は diff の removed の線の色 `#ef4444` と同じで、unchanged の循環 edge が removed に見える。diff は「何が変わったか」を描く面なので、変化の色を優先する。今の diff は循環を描いていないので、出力は変わらない。

**メリット**

- 渡されたモデルに書き込むパスが無くなる。`KrsFile` は parse（または resolve）が返した時点で確定し、どの builder・どの順で呼んでも同じ描画になる。
- 読む側（style・layout・draw.io・routing）は、diff だけを外す指定を除いて変わらない。ADR-287 が `edge[tag]` の仕組みに載せた利点（render のシグネチャ不変、利用者が `.krs.style` で `edge[cyclic]` を上書きできる）をそのまま保つ。
- 単一ファイルのモデルについては、entry point による描き分けが無くなる。All-layers パネル・ライブの entity view・drill-down の書き出しも、ライブ表示と同じく循環を赤く描く（TPL-219）。ファイルをまたぐ循環は、source 文字列を 1 ファイル分だけ parse する builder（`buildDrillDownSvg` などの公開版）からは見えないので、`compileProject` との差が残る。これは今もある差で、本 Design Doc では扱わない。

**デメリット**

- 今 analyze しない entry point の出力が、**循環を含むモデルに限って**変わる（普通の edge → 赤い循環 edge）。Issue の受け入れ条件 2「今のすべての entry point でバイト同一」を文字どおりには満たさない（後述「受け入れ条件の読み替え」）。
- 循環の DFS を回す回数が増える。単一ファイルでは parse と analyze で 2 回、project mode ではファイルごとの parse・マージ後・analyze で回る。今の DFS は edge 数に線形ではない。後退辺ごとに循環の各区間で `syncEdges.filter` を回し（循環の長さ × edge 数）、DFS の各フレームで path を複製する。実装 PR では、循環を多く含むモデルを入れて parse の時間を main と比べる。

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
| 読む側の変更 | diff を外す指定だけ | style・layout・draw.io に配線 | renderer 内に DFS |
| 今 analyze する entry point の出力 | 不変 | 不変 | 変わりうる |
| 今 analyze しない entry point の出力 | 循環を含むモデルだけ赤くなる（diff は不変） | 不変 | 変わる |
| entry point 間の一貫性 | 単一ファイルでは揃う | 描き分けが残る | 揃うが警告と食い違う |
| ファイルをまたぐ循環 | merge 後に再導出（TPL-2221） | analyze が merge 後に走る限り可 | slice 次第 |

## 現時点の方針

**案1 を採用する。** `cyclic` は「循環という、モデルについての事実」であり、`boundaryMembership` と同じくモデルを作った時点で確定させるのが自然である。読む側は diff を外す指定だけで済み、渡されたモデルを書き換えるパスを無くせる。案2 は ADR-287 が却下した理由（配線の波及）がそのまま残り、加えてコピーされた edge の同一性という問題をすべての描画面に持ち込む。案1 でも diff ではこの問題に触れるが、コピーするのは `cyclic` が立った edge だけに限られる。

### 受け入れ条件の読み替え

Issue の受け入れ条件 2 は「循環 edge の描画は、今のすべての entry point で今と同じ。examples と Dify でバイト同一」である。案1 では次のように読み替える。

- **今 analyze してから描く entry point**（`compile`・`compileProject`・`buildAllViewsSvg*`・`buildDrawioProject`）と **diff 系**: examples 全件と Dify でバイト同一。
- **今 analyze しない、diff 以外の entry point**（`buildDrillDownSvg`・`buildAllLayersSvg`・`renderEntityView`・`buildDrawio`）: examples 全件でバイト同一（循環が 0 件のため）。循環を含むモデル（Dify）では、循環 edge が `compile` と同じ描き方に変わる。これは描き分けの解消であり、changeset（core と `karasu` の patch）で利用者に知らせる。

### 実装の指針

1. `resolver/warnings.ts` の `detectCyclicDependencies` を純粋関数 `findCyclicDependencies(file): { cyclicEdges: Set<KrsEdge>; warnings: Warning[] }` に書き換え、`parser/` の下の新しいモジュールに移す。Parser と ImportResolver が呼ぶので、置き場所は `parser/` にする（今の依存は `resolver/ → parser/` の一方向だけで、`parser/` から `resolver/` を import する箇所は無い。TPL-2221 の対処パターンも共有する導出を `parser/` に置いている）。`resolver/warnings.ts` はそれを import する。走査範囲（`file.systems` とその子孫、entity は除外）と DFS は今のまま。
2. 同じモジュールに `markCyclicEdges(file)` を置く。全スコープの edge の `cyclic` を落としてから、集合に入る edge に立てる。呼び出し元はモデルを作る 2 か所だけ:
   - `Parser.parse` の後処理（`buildBoundaryMembership` の隣）
   - `ImportResolver.resolve` のマージ後（`buildBoundaryMembership` の再構築の隣）。マージ後のモデルの edge はファイルごとの parse 結果の edge オブジェクトそのものなので、落としてから立て直せば、ファイルごとに立てたフラグが古いまま残ることはない。
3. `analyze()` は `findCyclicDependencies(file).warnings` を返すだけにする。
4. diff で cyclic の描き方を止める（上の「diff は cyclic の描き方を使わない」）。`resolveStyles` に `cyclic` の仮想タグを付けない指定を足して diff の呼び出しから渡し、`diffEdgeArray` は `cyclic` が立っている edge だけをコピーして外す。指定の形（引数か options か）は実装 PR で決める。
5. テスト:
   - 受け入れ条件 1: 同じ `KrsFile` を `buildDrillDownSvg` で 2 回描き、間に `analyze()` を挟んでも同じ SVG（循環を含むモデル）。
   - 受け入れ条件 3（機械検査）: examples 全件と循環を含む fixture で、parse 結果の `structuredClone` を取り、`analyze` / `collectModelWarnings` / 各 builder を通した後も deep-equal であること。新しいパスを足したときにこの表へ足す形にする（TPL-2791）。
   - 受け入れ条件 2: 今 analyze する entry point と diff について、examples 全件と Dify で main とのバイト同一を測って実装 PR の本文に記す。テストでは、循環を含む fixture で `buildDrillDownSvg` が `compile` と同じく `krs-edge--cyclic` を出すこと、diff の SVG で循環 edge が class（`krs-edge--cyclic`）も stroke の色と線幅も循環の描き方にならず、routing からも外れないことを固定する（class だけを見ると、AST から解決される色の漏れを見逃す）。multi-system の diff で cross-system edge の出力が変わらないことも、既存の diff テストで確かめる。
   - TPL-2221: `system S` を 2 ファイルで reopen して循環を分けたとき、`compileProject` で両 edge が `cyclic` になり、警告が 1 件であること。単一ファイルの `compile` でも 1 件であること。
   - 旧い契約を固定しているテストを書き換える。`resolver/warnings.test.ts` と `renderer/svg-renderer.test.ts` には `Parser.parse` → `analyze` → `edge.cyclic` を確かめるテストがあり、変更後は parse がフラグを立てるので何も確かめずに通ってしまう。`Parser.parse` と `compileProject` がフラグを立てること、`analyze` がフラグを変えないことを確かめる形にする。
   - analyze を通さずに相互の sync edge を parse している renderer の fixture（`renderer/layout.test.ts` など）は、変更後は edge が `cyclic` になり routing から外れる。期待値が変わるものは、循環を確かめたいテストかどうかを見て、fixture を async にするか期待値を直す。
6. ドキュメント: `docs/spec/tags-annotations.md` は `[cyclic]` を「resolver が描画時に付与する」と書いている（`.ja.md` は「描画時に付与」）。`.krs` に現れない仮想タグであることは変わらないが、付与する時点は parse / resolve に移るので、この 2 か所を直す。spec を触るので実装 PR は High になる。reverse-architecture スキルの同梱コピーも `lint:skill-reference-bundle-sync --write` で揃える。
7. AT は追加しない。確かめる項目はすべて自動テストで固定できる。
8. ADR 昇格: 実装完了後、`docs/adr/2791-cyclic-flag-at-model-construction.md` として昇格し、ADR-287 を supersede する。ADR-287 の「`analyze()` は `resolveStyles()` より前に呼ばれることが保証されており」という理由が成り立たなくなるので、`refines` で ADR-287 を有効のまま残すことはしない。ADR-287 の検出規則（sync のみ、スコープごとの DFS、自己参照、entity の関係 edge は除外、スコープをまたぐ循環は対象外）は新 ADR の決定に書き直して引き継ぐ。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 循環を含むモデルで、app の All-layers パネル・ライブの entity view・drill-down の書き出し・`buildDrawio` の循環 edge が、ライブ表示や `karasu render` と同じ赤い描き方になる。diff を含め、それ以外は変わらない。
- 公開 API: `KrsEdge.cyclic` は残る。立つ時点が「analyze の後」から「parse / resolve の直後」に早まるだけで、型は変わらない。
- ドキュメント更新: `docs/spec/tags-annotations.md` / `.ja.md` の `[cyclic]` を付与する時点の記述（実装の指針 6）。
- テスト・examples への影響: examples に循環は無いので、examples の出力は変わらない見込み。旧い契約を固定しているテストと、相互の sync edge を持つ renderer の fixture は書き換える（実装の指針 5）。

## 未解決の問い / 決めないこと

- スコープをまたぐ循環（ADR-287 の残課題）は扱わない。
- `KrsFile` 全体を `Readonly` 型にする・`Object.freeze` する案は採らない。型の波及が大きく、今回の検査（deep-equal のテスト）で書き込みは捕まえられる。
