---
id: ADR-2088
title: ノード参照は全サイトで同じ path 記法を受理し、接尾辞規則で解決する
status: accepted
date: 2026-08-29
topic: parser
depends_on:
  - ADR-927
  - ADR-2547
supersedes:
  - ADR-2075
related_to:
  - ADR-104
  - ADR-316
  - ADR-1386
  - ADR-1911
  - ADR-1566
  - ADR-1820
  - ADR-2036
  - ADR-2408
  - ADR-2410
  - ADR-2442
scope:
  packages: [core, i18n]
assumptions:
  - "symbol: packages/core/src/parser/node-path.ts :: readNodeIdPathTail"
  - "symbol: packages/core/src/parser/node-path.ts :: nodePathMatchesSuffix"
  - "symbol: packages/core/src/parser/node-path.ts :: ambiguousNodePathCandidates"
  - "symbol: packages/core/src/parser/reference-validation.ts :: collectDeclaredNodePaths"
  - "symbol: packages/core/src/resolver/edge-endpoint.ts :: resolveEdgeEndpoint"
  - "symbol: packages/core/src/resolver/edge-endpoint.ts :: buildGhostEndpointResolver"
  - "symbol: packages/core/src/types/ast.ts :: NodeIdPath"
  - "grep: docs/spec/syntax.md :: Node reference path notation"
  - "grep: docs/spec/diagnostics.md :: edge-target-ambiguous"
---

# ADR-2088: ノード参照は全サイトで同じ path 記法を受理し、接尾辞規則で解決する

- **日付**: 2026-08-29
- **ステータス**: 決定済み・実装完了
- **関連**:
  - 起点 Issue: [#2088](https://github.com/kompiro/karasu/issues/2088)（[#2036](https://github.com/kompiro/karasu/issues/2036) から分離）
  - スライス: [#2547](https://github.com/kompiro/karasu/issues/2547)（A、[ADR-2547](2547-shared-node-path-machinery.md)） / [#2548](https://github.com/kompiro/karasu/issues/2548)（B） / [#2549](https://github.com/kompiro/karasu/issues/2549)（C） / [#2575](https://github.com/kompiro/karasu/issues/2575)（D1） / [#2576](https://github.com/kompiro/karasu/issues/2576)（D2） / [#2577](https://github.com/kompiro/karasu/issues/2577)（E）
  - 記法の原型: [ADR-927](927-import-system-nested.md)（`import { A.B.C }`）、[ADR-104](104-system-selector-not-adopted.md)（cross-system の 2 セグメント参照）、[ADR-316](316-database-as-first-class-node.md)（`resource OrderDB.Orders`）、[ADR-1911](1911-cross-domain-ghost-entities.md)（cross-domain entity 関連）
  - **本 ADR が supersede する**: [ADR-2075](2075-edge-endpoint-scope-diagnostic.md)（edge endpoint のスコープ診断）
  - narrow する決定: [ADR-2036](2036-scoped-boundary-declaration.md) 決定 4（修飾記法を導入しない — スコープ内 `boundary` に限定する）
  - 共存を正当化する決定: [ADR-1566](1566-ownership-during-migration.md)、[ADR-2442](2442-owns-existence-any-declared-node.md)、[ADR-2410](2410-import-coupled-diagnostics-decline-and-invalid-owns-kind-only.md)、[ADR-1820](1820-notation-promotion-gate.md)（notation promotion gate）
  - 関連 TPL: [TPL-2088](../test-perspectives/TPL-2088-id-reference-notation-uniform-across-sites.md)、[TPL-2577](../test-perspectives/TPL-2577-endpoint-reach-is-one-rule-for-bare-and-qualified.md)、[TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)、[TPL-2075](../test-perspectives/TPL-2075-parsed-construct-renders-or-warns.md)、[TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)
  - AT: [AT-2088](../acceptance/2088-node-reference-path-notation.md)

## 背景

Issue #2088 は `owns <id>` の bare id が層をまたいだ同名ノードを区別できない問題として
起票された。計測すると、これは `owns` 単独の問題ではなく、**記法が参照サイトごとに
バラバラであること**の一症状だった。

### ドット記法を受理するサイトとしないサイトが混在していた

同じ「ノードを指す」行為に対し、受理される形がサイトごとに違った。9 サイト中 4 つが
`A.B.C` を受理し、5 つが拒否していた（`owns` / `contains` の両形 / `realizes` / `handles`）。
author から見れば「karasu ではノードを `A.B.C` で指せる」は半分しか本当でない。

### 拒否側は「エラー」ではなく「黙って別の意味になる」形だった

拒否する 5 サイトはいずれも `unexpected-token-in-block` を出しながら、**先頭セグメント
だけを有効な参照として記録していた** — `owns Shop.Checkout.Payment` は `owns Shop` に、
`realizes Shop.Api` は `realizes Shop` になる。エラーと同時に誤ったモデルが出来ており、
続いて出る `invalid-owns` / `contains-target-not-found` は根本原因を指していなかった。

### bare id は「1 つを選ぶ」のではなく「全部を主張する」

`ownerIndex` は `Map<nodeId, teamId>` で、参照側は `ownerIndex.get(node.id)`。id だけを
キーにしているため、`owns Payment` は id が `Payment` のノード**全部**を主張する。
Issue の選択肢「衝突したら 1 つを選ぶと文書化する」は、存在しない挙動の文書化だった。

### 既存のドット記法はすべて「full path の接尾辞」で説明できた

受理側 4 サイトの実例を並べると、どれも対象ノードの full path の接尾辞であり、
bare id はその退化形（長さ 1）だった。**karasu には既に 1 つの記法があり、サイトごとに
受理する接尾辞の長さが違うだけ**で、「絶対 path」「相対 path」の 2 規則があるわけでは
なかった。

### edge endpoint だけは別軸の問題を抱えていた

[ADR-2075](2075-edge-endpoint-scope-diagnostic.md) は endpoint を宣言スコープの peer に
束縛し、その判定式の第 1 項に「E が dotted なら skip」を置いていた。記法を統一すると
この skip は「検査されない領域」に変わる。当初この Design Doc は「edge の解決規則は
変えない」と scope を切っていたが、受理形を広げたまま解決を据え置くと
[TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md) に触れる
ため、2026-08-21 にプログラムを再 scope して slice D1 / D2 / E を追加した。

## 決定

**ノードを id で指すすべてのサイトが `Segment(.Segment)*` を受理し、参照は対象ノードの
full path の接尾辞に一致することで解決する。bare id はその長さ 1 の場合である。**

1. **記法は 1 つ** — `Segment(.Segment)*`（ADR-927 の `ImportIdPath` が原型）。字句の
   読み取りは `readNodeIdPathTail` に集約し、サイトごとに parse を書かない。深さの
   上限は置かない。
2. **解決規則も 1 つ** — 接尾辞一致（`nodePathMatchesSuffix`）。9 サイトすべてが同じ
   resolver を引く。
3. **多重一致の扱い** — 一致が 2 件以上で `(kind, 深さ)` が揃っていないときだけ
   `*-target-ambiguous`（warning）で候補 full path を列挙する。揃っている多重一致は
   ADR-927 / ADR-1566 が正当化する意図的な broadcast（移行共存・マルチテナント）なので
   沈黙する。
4. **索引は path キー** — `ownerIndex` / `boundaryMembership` を full path キーに張り替え、
   修飾が実際に絞り込むようにする（[TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)。
   受理と絞り込みは同じ出荷単位に入れる）。
5. **edge endpoint の到達範囲** — bare は `peers(C)`（ADR-2075 の判定式を維持）、
   qualified は**トップレベル `system` から対象までの full path**であること。
   下の「ADR-2075 を supersede する」を参照。
6. **`handles` に ambiguity コードは置かない** — 候補が one-hop expose 規則の対象集合に
   限られ、多重一致は構造上つねに揃うため。発火しえないコードは「何を見ているか」に
   ついて嘘をつく。

## 理由

- **記法の分岐が消える**。author が覚えるのは 1 つで、どのサイトでも同じ形が通る。
- **新しい記法を発明していない**。`A.B.C` は ADR-927 以降 v1.0-stable であり、拒否側
  5 サイトを揃えるのは surface の追加ではなく穴埋めである。したがって
  [ADR-1820](1820-notation-promotion-gate.md) の gate が守る「後で剥がせない約束を安易に
  増やさない」には抵触しない — 約束は ADR-927 で既に背負っている。
- **接尾辞規則は既存の全用例を後付けなしに説明する**。新規則の導入ではなく、既に
  成立していた規則の明文化である。
- **完全な後方互換**。bare id = 長さ 1 の接尾辞なので、既存 `.krs` の解決結果は不変。
  実測でも `examples/**/*.krs` コーパスに新診断は 0 件（`examples.test.ts` が固定）。
- **曖昧性診断が実行可能な助言になる**。「rename せよ」ではなく「path で修飾せよ」と
  言えるようになった。マルチテナントのように rename が取れない場面でも手当てがある。

## ADR-2075 を supersede する

ADR-2075 の判定式の第 1 項は「endpoint が dotted なら skip」だった。本 ADR はこれを
取り下げるため、narrow ではなく supersede とする — 決定そのものが置き換わる。

**引き受ける判断（ADR-2075 のまま）**:

- bare endpoint は宣言スコープの peer でなければならず、違反は
  `edge-endpoint-not-at-scope`（warning）で報告する
- **peer はノードインスタンス単位で数える**（id で union しない）。id で union すると、
  同一ファイル内の同 id `system` ブロック 2 つと、同じ `domain` id が 2 service に
  分散した形の 2 つの drop を隠す
- register は warning（ADR-1386）。error ではなく warning なのは、endpoint の位置が
  ファイル跨ぎ merge 後にしか判定できないため
- LSP では抑制しない（TPL-1522 の side を維持）
- `domain` → `domain` の bare endpoint は暗黙 service edge に集約されて描画されるため除外

**置き換わる判断**:

- dotted endpoint は skip しない。**トップレベル `system` から対象までの full path で
  あること**を要求し、満たさなければ同じコードの qualified variant で報告する。
  メッセージは「エッジを移せ」ではなく「anchor された綴りに書き直せ」と言う
- `entity` ブロック内の qualified 関連はこの検出器の対象外。entity ビューが自身の
  pool で解決し外部 entity を ghost として描くため、ここで判定すると描画される
  エッジを報告してしまう

**到達範囲を `system` 起点の full path に限るのは、描画できる集合と一致させるため**である。
ghost フレームはトップレベル `system` であり、それ以外を起点にした参照
（`Checkout.Payment` のような断片、トップレベル orphan を起点にした `Billing.Invoice`）は
どのフレームにも収まらない。検査側だけを広げると、in-scope と判定された参照が
どのビューにも載らない — [TPL-2075](../test-perspectives/TPL-2075-parsed-construct-renders-or-warns.md)
が禁じる silent drop になる。実装ではこの条件を検査側と ghost リゾルバで共有し、
全参照 × 全コンテナの照合で「一方が受理し他方が拒否する組み合わせが 0 件」であることを
確認した。

## ADR-2036 決定 4 の扱い

ADR-2036 は「修飾記法（FQCN / 最小接尾辞パス）は導入しない」と決めたが、その理由は
「案 S（スコープ内宣言）によって解くべき曖昧性が消えるため」であり、**スコープ内
`boundary` にしか当てはまらない**。top-level `boundary` と `owns` にはスコープが無く、
曖昧性は消えていない。本 ADR は決定 4 をスコープ内形に narrow する。ADR-2036 の
決定 1-3 / 5 / 6 は生きているため `supersedes` ではなく `related_to` とする
（ADR-2442 が ADR-2408 の機構記述を更新したときと同じ扱い）。

## 却下した案

- **`owns` にだけ修飾記法を認める** — 分岐を 1 つ減らして 4 つ残す。
  [TPL-1720](../test-perspectives/TPL-1720-validation-target-set-enumerates-all-kinds.md) の
  学び（サイトを 1 つずつ直すと次の kind で取り残しが出る）に反する。
- **診断のみ（記法は増やさない）** — rename が取れない場面（マルチテナントの
  `TenantA.Billing` / `TenantB.Billing`）で author に手当てが無い。
- **現状維持 + 文書化** — 他サイトで通る記法が黙って別の意味になる状態が残る。
- **先頭からの絶対 path を必須にする** — `Customers.Customer` のような既存の相対形を
  壊す。ただし edge endpoint だけは描画可能性の制約から full path を要求しており、
  そこは記法の一般規則ではなくサイト固有のスコープ規則として書き分けている。
- **qualified endpoint を「見えているものから降りる」形で定義する**（`visible(C)` =
  `peers(C)` を祖先方向に畳んだ集合）— slice E の設計時にいったん採ったが、実装すると
  宣言元 system の内部に解決する参照を生み、ghost 機構がフレームを作れずに silent drop に
  なった。到達範囲は描画できる集合と一致していなければならない。

## スライスと到達点

| スライス | 何ができるようになったか |
| --- | --- |
| **A**（#2547 / [ADR-2547](2547-shared-node-path-machinery.md)） | 共有 parse ヘルパーと接尾辞規則を 1 箇所に定義。既存 4 サイトを挙動不変で載せ替え |
| **B**（#2548） | `owns` / `contains` が path を受理し、索引が path キーになって修飾が実際に絞る |
| **C**（#2549） | `realizes` / `handles` が path を受理。拒否形は先頭セグメントを記録しない |
| **D1**（#2575） | entity 関連 / `resource` が共有 resolver で解決。重複 domain id で関連が黙って落ちなくなる |
| **D2**（#2576） | `import` が接尾辞で解決。曖昧な接尾辞は報告される |
| **E**（#2577） | edge endpoint が任意の深さの qualified path を受理・解決・描画。`parseEdge` の 2 セグメント上限が外れ、entity 関連の深い qualifier も解禁 |

## 未解決 / 決めないこと

- **`node-id-multiple-locations` の順序依存**は別 Issue。`nodePathIndex` は `viewPath` /
  permalink の解決元という別の blast radius を持つ。本プログラムはこれを作っていない。
- **トップレベル orphan を qualified 参照の起点にできるようにするか**は決めない。
  現状は報告される（silent drop ではない）。orphan にフレームを与えるのは描画側の
  独立した変更である。
- **strict モード**（曖昧なら絶対 path を要求する）の余地は残す。
- **`facets` は対象外**。facet id は node id ではなく flat な独自名前空間である。
