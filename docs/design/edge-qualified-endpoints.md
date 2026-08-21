# edge endpoint の qualified 化 — 接尾辞解決と ADR-2075 スコープ規則の調停

- **日付**: 2026-08-21
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2577](https://github.com/kompiro/karasu/issues/2577)（#2088 slice E。プログラム全体は [owns-cross-layer-addressing](owns-cross-layer-addressing.md)）
  - 関連 ADR: [ADR-104](../adr/104-system-selector-not-adopted.md)（cross-system の 2 セグメント記法）、[ADR-2075](../adr/2075-edge-endpoint-scope-diagnostic.md)（endpoint は宣言スコープの peer に束縛）、[ADR-2547](../adr/2547-shared-node-path-machinery.md)（共有 path 機構）
  - 関連 TPL: [TPL-2088](../test-perspectives/TPL-2088-id-reference-notation-uniform-across-sites.md)、[TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)、[TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)
  - コード: `packages/core/src/parser/parser.ts`（`parseEdge`、`maxSegments: 2`）、`packages/core/src/view/view-extract.ts`（`buildGhostSystems` / caller-ghosts）、`packages/core/src/renderer/layout.ts` / `ghost-layout.ts`、`packages/core/src/resolver/warnings.ts`

## 背景・課題

#2088 で 9 サイトの参照記法は接尾辞 path に統一されたが、edge endpoint だけは
**受理が 2 セグメント・解決が anchored（`SystemId.直下の子`）** のまま残っている。
`A -> Shop.Checkout.Payment` は今日 parse すらされない（3 セグメント目が
`unexpected-token-in-block` を引く）。

据え置きには理由が 2 つあった:

1. **ADR-2075 のスコープ規則と方向が逆**。ADR-2075 は「bare endpoint は宣言
   スコープの peer に束縛し、peer でなければ `edge-endpoint-not-at-scope` を
   報告する」。接尾辞解決は「path が合えば遠くも指せる」方向で、無条件に導入
   するとスコープ規則を実質的に無効化する。
2. **解決と描画が 2 セグメント前提で散在**。`buildGhostSystems` / caller-ghost /
   layout の qualified 位置解決 / warnings の anchored 照合はすべて
   「最初の dot で割る」実装で、ghost は `Sys.Svc` の 2 段 qualified id を
   コンテナ描画のキーにしている。

## 制約・前提

- bare endpoint の意味（ADR-2075 の peer 束縛）は変えない。v1.0-stable
- 既存の 2 セグメント cross-system 参照の解決結果・描画は不変
- `parseEdge` は entity 関連と共有されるため、cap 解除は entity 関連の
  深い qualifier（#2575 の out-of-scope）も同時に解禁する
- 受理と解決は同時に着地させる（TPL-1503。cap 解除だけ先行させない）

## 検討した選択肢

### 案1: qualified は「エスケープ」、bare は ADR-2075 のまま（推奨）

**dot を含む endpoint はスコープ規則の対象外**とし、接尾辞解決で任意の宣言
ノードを指せるようにする。bare endpoint は今日のまま（peer 束縛 +
`edge-endpoint-not-at-scope`）。

- 今日の 2 セグメント形は既にこの意味論で動いている: `B.Callee` は宣言
  スコープの peer ではないのに解決され、ghost として描かれる。warnings の
  skip-if-dotted ガードがまさに「dotted はスコープ検査を通さない」を実装済み
- つまり案1 は新しい原則の導入ではなく、**既存の「dotted = スコープ外への
  明示的な参照」という区別を一般化**するもの。ADR-2075 の decision は
  bare に対してそのまま生き、supersede ではなく narrow（ADR-2036 決定 4 の
  扱いと同型）
- 曖昧性は共有 discriminator（(kind, depth) 非一様で warning）。edge 用の
  コードは `edge-target-ambiguous` を追加

### 案2: qualified にもスコープ規則を適用（候補を scope でフィルタ）

接尾辞候補を「宣言スコープから見える範囲」に絞る。

- スコープ規則と記法の直交性が失われ、「どこからは見えるのか」の規則を
  edge 専用にもう 1 つ発明することになる。ADR-2075 は「peer か、そうで
  なければ報告」という単純さが価値で、可視性規則への拡張は別物
- 2 セグメントの既存挙動（peer でない system の子を指せる）と矛盾する。却下

### 案3: cap 解除のみ先行（解決は 2 セグメントのまま）

- 受理して効果がない形を作る（TPL-1503）。却下

## 現時点の方針

**案1 を採用したい。** dotted endpoint は「スコープの外を明示的に指す」参照で
あり、それは 2 セグメント時代から一貫した意味論である。実装スライス:

1. **E-1 解決**: endpoint の dotted 形を `collectDeclaredNodePaths` +
   接尾辞規則で解決する共有関数に集約（view-extract / warnings / layout の
   「最初の dot で割る」実装を置換）。2 セグメントの既存ケースは同じ結果。
   `edge-target-ambiguous`（warning、共有 params 形）を追加
2. **E-2 描画**: 解決先の full path から ghost 表現を導出する。3 セグメント
   以上は**最上位 system の ghost コンテナに解決先ノードを直接置き、コンテナ
   ラベルに中間 path を添える**（`Shop › Checkout` のような表記）。ghost の
   layout キーは full path key（#2548 の ownerIndex キーと同じ規約）
3. **E-3 受理**: `parseEdge` の `maxSegments: 2` を解除（entity 関連の深い
   qualifier も同時に解禁され、#2575 の out-of-scope が閉じる）。routing は
   TPL-1927 の再計測（貫通 0 / 共線 0）で確認

## 未解決の問い

- E-2 の中間 path 表記（コンテナラベル案）か、ネストしたコンテナ描画か。
  ラベル案は ghost ジオメトリを変えないので TPL-1927 リスクが小さい — まず
  ラベル案で出し、ネスト描画は需要が出てから
- `edge-endpoint-not-at-scope` の文言に「qualified で明示すれば届く」旨の
  助言を足すか（診断が実行可能な助言になる、#2088 と同じ動機）

## 影響範囲

- 受理形の拡大 + 新診断 → changeset minor（core + karasu）
- spec: path-notation 節の edge 記述、edge 章のスコープ規則節、diagnostics 行
- ADR 昇格時: ADR-2075 は narrow（related_to + 本文）、supersede しない
