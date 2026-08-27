# edge endpoint の qualified 化 — スコープ規則を 1 本に畳んで ADR-2075 を置き換える

- **日付**: 2026-08-21（方針改訂: 2026-08-27 — 案1 から案2 へ）
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2577](https://github.com/kompiro/karasu/issues/2577)（#2088 slice E。プログラム全体は [owns-cross-layer-addressing](owns-cross-layer-addressing.md)）
  - 関連 ADR: [ADR-104](../adr/104-system-selector-not-adopted.md)（cross-system の 2 セグメント記法）、[ADR-2075](../adr/2075-edge-endpoint-scope-diagnostic.md)（endpoint は宣言スコープの peer に束縛 — **本設計で supersede**）、[ADR-2547](../adr/2547-shared-node-path-machinery.md)（共有 path 機構）、[ADR-2223](../adr/2223-service-anchored-edge-renders-on-parent-canvas.md)（子に anchored な edge は親 canvas に描く）
  - 関連 TPL: [TPL-2088](../test-perspectives/TPL-2088-id-reference-notation-uniform-across-sites.md)、[TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)、[TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)、[TPL-2075](../test-perspectives/TPL-2075-parsed-construct-renders-or-warns.md)、[TPL-1936](../test-perspectives/TPL-1936-cross-domain-entity-reference-qualified.md)
  - コード: `packages/core/src/parser/parser.ts`（`parseEdge`、`maxSegments: 2`）、`packages/core/src/view/view-extract.ts`（`buildGhostSystems` / caller-ghosts）、`packages/core/src/renderer/layout.ts` / `ghost-layout.ts`、`packages/core/src/resolver/warnings.ts`（`detectEdgeEndpointsNotAtScope`）

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

1 が本設計の主題である。**endpoint がどこを指せるかという問いに、規則を 2 本
持たない**（bare 用と qualified 用）というのが結論であり、そのために ADR-2075 を
narrow ではなく supersede する。

## 制約・前提

- bare endpoint の判定は変えない。peer 束縛と `edge-endpoint-not-at-scope`（warning）は
  ADR-2075 のまま。v1.0-stable
- 既存の 2 セグメント cross-system 参照（`Sys.Child`）の解決結果・描画は不変
- **スコープ規則は 1 本に保つ**。「dot が付いていれば検査しない」という綴り基準の
  例外は作らない
- entity 関連の解決プールは slice D1（#2575）で決着済みで、本設計は触らない。
  `parseEdge` を共有するのは*受理*であって解決ではない
- 受理と解決は同時に着地させる（TPL-1503。cap 解除だけ先行させない）

## 検討した選択肢

### 案1: qualified は「エスケープ」、bare は ADR-2075 のまま（却下）

**dot を含む endpoint はスコープ規則の対象外**とし、接尾辞解決で任意の宣言
ノードを指せるようにする案。今日の warnings が持つ skip-if-dotted ガードを
一般化する形で、既存挙動との連続性はいちばん高い。

却下の理由:

- **規則が 2 本になる**。「bare はスコープに縛られ、dotted は縛られない」は、
  綴りの違いが到達範囲の違いになるということで、endpoint がどこを指せるかを
  1 文で言えなくなる。ADR-2075 が 6 配置の割れを 1 本の規則に畳んだ価値を、
  記法の軸で割り直すことになる
- **エスケープ側に上限が無い**。深い接尾辞を許すと、system の内部構造に別 system
  から直接 edge を張れてしまう。今日の 2 セグメントは「system を名指して、その
  直下の子まで」という自然な上限があり、その上限は偶然ではなく ADR-104 の
  cross-system 記法が引いたもの
- ADR-2075 は narrow で済む（`related_to` + 本文）が、その代償として「dotted は
  検査しない」という例外が spec に恒久的に残る

### 案2: qualified にもスコープ規則を適用（採用）

接尾辞候補を**宣言スコープから見えている範囲**に絞る。

- スコープ規則が bare / qualified の両方を覆う 1 本になる。qualified は
  「スコープ外を指す許可」ではなく「**見えているものから降りていく**」記法になる
- 到達範囲が構造で決まる。別 system の内部を指すには、その system を名指して
  そこから降りる — ADR-104 の 2 セグメント記法を深さ方向へ一般化したものになり、
  既存の `Sys.Child` はその長さ 2 の場合として一切変わらない
- 代償は、案1 なら解決していた形の一部が warning になること。ただし**今日
  parse できる形の判定は 1 つも変わらない**（下の「非破壊性」を参照）

当初この案は「edge 専用の可視性語彙をもう 1 つ発明することになる」として却下して
いた。それは可視性を新しい概念として導入する場合の話で、本設計は
**ADR-2075 が既に定義している `peers(C)` を祖先方向に畳んだだけ**の集合を使う。
新しい語彙ではなく、既存の peer 定義の再利用である。

### 案3: cap 解除のみ先行（解決は 2 セグメントのまま）

- 受理して効果がない形を作る（TPL-1503）。却下

## 方針

### 規則

コンテナ `C` に宣言された edge の endpoint `E` について:

- **bare（`E` に dot が無い）** — `E ∈ peers(C)` でなければ
  `edge-endpoint-not-at-scope`。ADR-2075 の判定式をそのまま維持する
  （peer はノードインスタンス単位で数える点も含む）
- **qualified（`E` に dot がある）** — 接尾辞規則で解決した候補のうち、
  **参照の先頭セグメントが `visible(C)` のノードに当たるもの**だけを残す。
  残りが 0 件なら `edge-endpoint-not-at-scope`（「見えている範囲から降りる形に
  修飾せよ」の variant）、2 件以上で (kind, 深さ) が非一様なら
  `edge-target-ambiguous`

`visible(C)` は `peers(C)` を祖先方向に畳んだもの:

```
visible(C) = peers(C) ∪ peers(parent(C)) ∪ … ∪ { トップレベルの root }
```

`peers` の定義は ADR-2075 のまま（system なら自身の子 ∪ トップレベル orphan
`domain`、それ以外なら自身 ∪ 宣言した親インスタンスの子）。トップレベル root は
`system` と orphan バケットで、これが `Sys.Child` を今日どおり通す項になる。

言い換えると、**endpoint は「自分の隣にあるもの」を bare で、「見えているものの
中にあるもの」を path で指す**。bare が長さ 1 の場合、という #2088 の一貫性は
ここでも保たれる。

### 非破壊性

今日 parse できる qualified endpoint は 2 セグメントの `Sys.Child` だけで、
先頭セグメントは常にトップレベル system である。トップレベル root は
`visible(C)` に必ず含まれるので、**既存モデルの判定は 1 件も変わらない**。
新規則が実際に効くのは、cap 解除で初めて書けるようになる 3 セグメント以上の形と、
2 セグメントでも先頭が system でない形（`Checkout.Payment` のような、これまで
`unresolved-edge-endpoint` に落ちていた綴り）である。

これは AT の受け入れ条件として固定する（既存 examples corpus で新診断が 0 件）。

### 実装スライス

1. **E-1 解決**: endpoint の解決を `collectDeclaredNodePaths` + 接尾辞規則 +
   `visible(C)` フィルタの共有関数に集約する（view-extract / warnings / layout の
   「最初の dot で割る」実装を置換）。`detectEdgeEndpointsNotAtScope` の
   skip-if-dotted を、この規則による判定に置き換える。`edge-target-ambiguous`
   （warning、共有 params 形）を追加
2. **E-2 描画**: 解決先の full path から ghost 表現を導出する。3 セグメント
   以上は**最上位 system の ghost コンテナに解決先ノードを直接置き、コンテナ
   ラベルに中間 path を添える**（`Shop › Checkout` のような表記）。ghost の
   layout キーは full path key（#2548 の ownerIndex キーと同じ規約）
3. **E-3 受理**: `parseEdge` の `maxSegments: 2` を解除（entity 関連の深い
   qualifier も同時に解禁され、#2575 の out-of-scope が閉じる）。routing は
   TPL-1927 の再計測（貫通 0 / 共線 0）で確認

順序は E-1 → E-3 を 1 PR に畳む（TPL-1503: 受理と解決を割らない）。E-2 は
ghost の見た目だけなので分離できる。

## 未解決の問い

- E-2 の中間 path 表記（コンテナラベル案）か、ネストしたコンテナ描画か。
  ラベル案は ghost ジオメトリを変えないので TPL-1927 リスクが小さい — まず
  ラベル案で出し、ネスト描画は需要が出てから
- `edge-endpoint-not-at-scope` の variant を分けるか、1 メッセージに畳むか。
  bare の「source と co-located に置け」と qualified の「見えている anchor から
  降りる形に修飾せよ」は fix の綴りが違う（ADR-2075 が message variant で
  吸収すると決めた形と同型）
- `visible(C)` に祖先の peers を畳む深さ。全祖先を畳むと、深い service の中から
  でもトップレベル system を名指せる（cross-system 参照が常に書ける）。これは
  今日の挙動と一致するので既定にするが、「1 段だけ」に閉じる選択肢は残る

## 影響範囲

- 受理形の拡大 + 新診断 → changeset minor（core + karasu）
- spec: path-notation 節の edge 記述、edge 章の Endpoint scope 節（bare /
  qualified の両方を 1 本の規則として書き直す）、diagnostics 行
- **ADR 昇格時に ADR-2075 を supersede する**。新 ADR に `supersedes: [ADR-2075]`、
  ADR-2075 に `status: superseded` + `superseded_by: ADR-<new>` を入れる
  （`.claude/rules/adr.md`。旧 ADR の本文は書き換えず歴史的記録として残し、
  `pnpm adr:validate` の双方向整合で担保する）。narrow ではなく supersede に
  するのは、ADR-2075 の判定式の第 1 項「E が dotted → skip」を本設計が
  取り下げるためで、決定そのものが置き換わる
- 新 ADR は ADR-2075 の残る判断（peer をインスタンス単位で数える、register は
  warning、LSP で抑制しない）を再掲して引き受ける。supersede は「決定の置き場所を
  1 つにする」ことであって、これらを捨てることではない
- v1.0 freeze（ADR-1314）には触れない。構文の追加は path 記法の一般化で、
  診断は警告の追加であり、既存モデルの判定は変わらない（上の非破壊性）
