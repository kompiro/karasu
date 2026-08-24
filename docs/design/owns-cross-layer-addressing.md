# ノード id を指す参照は全サイトで同一の path 記法を受理する

- **日付**: 2026-08-17
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2088](https://github.com/kompiro/karasu/issues/2088)（owns/team membership references: cross-layer node addressing、[#2036](https://github.com/kompiro/karasu/issues/2036) から分離）
  - 関連 ADR: [ADR-927](../adr/927-import-system-nested.md)（`import { A.B.C }` の明示 path 構文 — 本 Design Doc が一般化する記法の原型）、[ADR-316](../adr/316-database-as-first-class-node.md)（`resource OrderDB.OrderTable`）、[ADR-104](../adr/104-system-selector-not-adopted.md)（クロスシステム参照のドット記法）、[ADR-1911](../adr/1911-cross-domain-ghost-entities.md)（cross-domain entity 参照）、[ADR-2036](../adr/2036-scoped-boundary-declaration.md)（決定 4 で修飾記法を導入しないとした — 本 Design Doc が narrow する）、[ADR-1820](../adr/1820-notation-promotion-gate.md)（notation promotion gate）、[ADR-1566](../adr/1566-ownership-during-migration.md)、[ADR-2442](../adr/2442-owns-existence-any-declared-node.md) / [ADR-2410](../adr/2410-import-coupled-diagnostics-decline-and-invalid-owns-kind-only.md)、[ADR-2075](../adr/2075-edge-endpoint-scope-diagnostic.md)
  - 関連 TPL: [TPL-1936](../test-perspectives/TPL-1936-cross-domain-entity-reference-qualified.md)、[TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)、[TPL-1720](../test-perspectives/TPL-1720-validation-target-set-enumerates-all-kinds.md)、[TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)、[TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md)、[TPL-2221](../test-perspectives/TPL-2221-merge-only-facts-decided-on-merged-model.md)、本 PR で起票する proactive [TPL-2088](../test-perspectives/TPL-2088-id-reference-notation-uniform-across-sites.md)
  - コード: `packages/core/src/parser/parser.ts`（`parseNodeImport` の path 解析、各 property の parse）、`packages/core/src/fs/import-resolver.ts`（path 走査）、`packages/core/src/parser/reference-validation.ts`、`packages/core/src/renderer/layout-measure.ts`（`makeOwnerResolver`）

## 背景・課題

Issue #2088 は `owns <id>` の bare id が層をまたいだ同名ノードを区別できない問題として
起票された。**計測すると、これは `owns` 単独の問題ではなく、記法が参照サイトごとに
バラバラであることの一症状だった。**

以下はすべて本 Design Doc のための probe（`Parser.parse` / `analyze` / `compile`、
`main` = eff605f7）で確認した事実である。

### 中心的な事実 — ドット記法を受理するサイトとしないサイトが混在している

同じ「ノードを指す」行為に対し、受理される記法が **サイトごとに違う**。

| 参照サイト | ドット path | 根拠 |
| --- | --- | --- |
| `import { Shop.Checkout.Payment }` | **受理** | [ADR-927](../adr/927-import-system-nested.md) |
| edge endpoint `Caller -> B.Callee`（cross-system） | **受理** | [ADR-104](../adr/104-system-selector-not-adopted.md) |
| entity 関連 `Order -> Customers.Customer` | **受理** | [ADR-1911](../adr/1911-cross-domain-ghost-entities.md) / [TPL-1936](../test-perspectives/TPL-1936-cross-domain-entity-reference-qualified.md) |
| `resource OrderDB.Orders` | **受理** | [ADR-316](../adr/316-database-as-first-class-node.md) |
| `owns Shop.Checkout.Payment` | **parse error** | — |
| `contains Shop.Checkout.Payment`（top-level boundary） | **parse error** | — |
| `contains Shop.Checkout`（スコープ内 boundary） | **parse error** | — |
| `realizes Shop.Api` | **parse error** | — |
| `handles Backend.Order` | **parse error** | — |

4 サイトが受理し、5 サイトが拒否する。author から見れば「karasu ではノードを
`A.B.C` で指せる」は**半分しか本当でない**。

### 拒否側の失敗モードは「エラー」ではなく「黙って別の意味になる」

拒否する 5 サイトはいずれも、`unexpected-token-in-block` を出しながら
**先頭セグメントだけを有効な参照として記録する**。

| 書いたもの | 記録されたもの |
| --- | --- |
| `owns Shop.Checkout.Payment` | `owns Shop` |
| `contains Shop.Checkout.Payment` | `contains Shop` |
| `realizes Shop.Api` | `realizes Shop` |
| `handles Backend.Order` | `handles Backend` |

つまり他サイトで通る記法をここで書くと、**エラーと同時に誤ったモデルが出来る**。
`owns Shop` は system を所有する主張になり `invalid-owns` を、`contains Shop` は
`contains-target-not-found` を引く — いずれも author が書いた意図とは無関係な診断で、
根本原因（記法が受理されていない）を指していない。

### bare id は「1 つを選ぶ」のではなく「全部を主張する」

`ownerIndex` は `Map<nodeId, teamId>` で、参照側は `ownerIndex.get(node.id)`
（`makeOwnerResolver`、`packages/core/src/renderer/layout-measure.ts:64`）。id だけを
キーにしているため、`owns Payment` は **id が `Payment` であるノード全部**を主張する。

```krs
system Shop {
  service Payment {}                 // system view で Platform チップが付く
  service Checkout {
    domain Payment {}                // Checkout ドリルダウンでも Platform チップが付く
  }
}
organization Org { team Platform { owns Payment } }
```

`compile` を viewPath なし / `["Shop","Checkout"]` の 2 回走らせ、**両方に
`data-team-button="Platform"` が出る**ことを確認した。診断は 0 件。
top-level `boundary … contains` も `boundaryMembership: Map<id, boundaryId[]>` で同型。

Issue の選択肢 3「衝突した `owns` はどれか 1 つを選ぶ、と受け入れて文書化する」は、
存在しない挙動を文書化することになる。

### 既存のドット記法はすべて「full path の接尾辞」で説明できる

受理側 4 サイトの実例を並べると、**どれも対象ノードの full path の接尾辞**である。

| 実例 | 対象の full path | 関係 |
| --- | --- | --- |
| `Shop.Checkout.Payment` | `Shop.Checkout.Payment` | 全体（長さ 3 の接尾辞） |
| `Customers.Customer` | `Shop.Api.Customers.Customer` | 長さ 2 の接尾辞 |
| `OrderDB.Orders` | `OrderDB.Orders` | 全体 |
| `B.Callee` | `B.Callee` | 全体 |

bare id（`Payment`）はその退化形（長さ 1 の接尾辞）である。**つまり karasu には既に
一つの記法があり、サイトごとに受理する接尾辞の長さが違うだけ**だった。
「絶対 path」「相対 path」という 2 種類の規則があるわけではない。

### 付随して判明したこと

- **`owns` は `nodePathIndex` を読んでいない**。[ADR-2410](../adr/2410-import-coupled-diagnostics-decline-and-invalid-owns-kind-only.md) /
  [ADR-2442](../adr/2442-owns-existence-any-declared-node.md) 以降、存在検査は
  `collectOwnsResolvableIds`（マージ後ツリー由来の `Set<string>`）を引く。Issue の
  実装メモは stale で、multimap 化すべき場所はこちらである
- **`node-id-multiple-locations` は部分的なのではなく宣言順に依存する**。
  `service X` → ネスト `domain X` の順では黙り（かつ `nodePathIndex` の entry を
  黙って上書きする）、逆順では警告する。top-level infra ループも無条件に上書きする。
  `nodePathIndex` は `viewPath` / permalink の解決元なので、上書きは「service の
  permalink が別階層の domain を指す」形で表面化しうる
- **edge endpoint には既に scope 規則がある**。[ADR-2075](../adr/2075-edge-endpoint-scope-diagnostic.md) の
  `edge-endpoint-not-at-scope` が宣言スコープの peer に束縛し、peer でなければ報告する。
  記法の統一とは別軸の話であり、本 Design Doc は edge の解決規則を変えない

## 制約・前提

- **同名 id の共存は正当**（[ADR-927](../adr/927-import-system-nested.md)）。system 移行期の
  新旧 `OrderService`、マルチテナントの `TenantA.Billing` / `TenantB.Billing` は通常の使い方
- **重複所有は tolerated fact**（[ADR-1566](../adr/1566-ownership-during-migration.md)、info `duplicate-owner-assignment`）
- **後方互換は必須**。`owns` / `realizes` / `handles` は v1.0-stable。既存の bare id が
  意味を変えてはならない
- **[ADR-2036](../adr/2036-scoped-boundary-declaration.md) 決定 4 との関係**。同 ADR は
  「修飾記法（FQCN / 最小接尾辞パス）は導入しない」と書いているが、その理由は
  「案 S（スコープ内宣言）によって解くべき曖昧性が消えるため」であり、**スコープ内
  `boundary` にしか当てはまらない**。top-level `boundary` と `owns` にはスコープが無く、
  曖昧性は消えていない。本 Design Doc は決定 4 をスコープ内形に narrow する
- **out of scope**: ノード id の identity を path 化すること（[ADR-1827](../adr/1827-permalink-deep-element.md) 既決）、
  グローバル id 一意性の強制（ADR-927 既決）、`namespace` 語彙（ADR-1858 既決）、
  edge endpoint の scope 規則（ADR-2075 既決）

## 検討した選択肢

### 案1: 全サイトで接尾辞 path 記法を受理する（採用）

**一つの記法・一つの解決規則を、ノード id を指すすべてのサイトで共有する。**

- **記法**: `Segment(.Segment)*`。`ImportIdPath`（ADR-927）と同じ字句形
- **解決規則**: 対象ノードの full path の**接尾辞に一致するノードの集合**を返す。
  bare id は長さ 1 の接尾辞であり、既存の意味と完全に一致する
- **受理サイト**: `owns` / `contains`（top-level・スコープ内）/ `realizes` / `handles` を
  受理側に加え、既に受理している 4 サイトと同じ walker を共有する
- **多重一致**: 一致が 2 件以上で、かつそれらが (kind, 深さ) で揃っていないとき
  `*-target-ambiguous` を warning で報告し、候補 full path を列挙する。
  揃っている衝突（移行共存・マルチテナント）は broadcast が意図なので沈黙する

**メリット**

- **記法の分岐が消える**。author が覚えるのは 1 つで、どのサイトでも同じ形が通る
- **新しい記法を発明しない**。`A.B.C` は ADR-927 以降 v1.0-stable であり、
  拒否側 5 サイトを受理側に揃えるのは surface の追加ではなく**穴埋め**である。
  [ADR-1820](../adr/1820-notation-promotion-gate.md) が守ろうとしている「後で剥がせない
  約束を安易に増やさない」に反しない
- **接尾辞規則は既存の全用例を後付けなしで説明する**（背景の表）。新規則ではなく
  既に成立している規則の明文化
- **完全な後方互換**。bare id = 長さ 1 の接尾辞なので、既存 `.krs` の解決結果は不変
- 曖昧性診断が**実行可能な助言**になる。「rename せよ」ではなく「path で修飾せよ」と言える

**デメリット**

- 影響サイトが 5 つあり、1 PR には収まらない（スライス分割が要る）
- `ownerIndex` / `boundaryMembership` を path キーに張り替える必要がある
  （[TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)）。
  カードのチップ・*Group by: team* のフレーム・collapse・org view・drawio exporter に波及する
- 接尾辞一致は「モデルが育つと修飾を伸ばす必要が出る」。ただしそれは
  **曖昧になった時点で診断が教える**ので、黙って壊れることはない

### 案2: `owns` にだけ修飾記法を認める

Issue が挙げた選択肢 2 そのもの。

**メリット**

- 変更量が最小

**デメリット**

- **記法の分岐を 1 つ減らして 4 つ残す**。`realizes` / `handles` / `contains` は
  引き続き他サイトで通る記法を拒否し、先頭セグメントを黙って記録し続ける。
  「サイトごとに記法が違う」という根本問題は温存される
- [TPL-1720](../test-perspectives/TPL-1720-validation-target-set-enumerates-all-kinds.md) の
  学びに反する。ADR-1720 が `client` を「3 つの集合すべてに足した」結果、次の kind で
  `detectInvalidOwns` だけ取り残された。サイトを 1 つずつ直すのは同じ失敗の形

### 案3: 診断のみ（記法は増やさない）

多重解決を報告し、author は rename で解消する。

**メリット**

- 構文変更ゼロ

**デメリット**

- **rename が取れない場合がある**。マルチテナントで `TenantA.Billing` /
  `TenantB.Billing` の domain 名を変えるのは本末転倒。author に手当てが無い診断になる
- 記法の分岐は残ったまま。「`A.B.C` は import では書けるのに owns では書けない」という
  一貫性の欠如を説明できない

### 案4: 現状維持 + 文書化のみ

**メリット**

- 最小コスト

**デメリット**

- 他サイトで通る記法が黙って別の意味になる状態が残る。これは
  [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md) が
  禁じている「受理したのに効果が違う」形に近い

## 比較

| 観点 | 案1 | 案2 | 案3 | 案4 |
| --- | --- | --- | --- | --- |
| 記法の分岐 | **解消** | 4 つ残る | 5 つ残る | 5 つ残る |
| 新しい構文表面 | 追加なし（既存記法の適用範囲拡大） | 同左 | なし | なし |
| 後方互換性 | 保つ（bare = 長さ 1 の接尾辞） | 保つ | 保つ | 保つ |
| author の手当て | path で修飾 | `owns` のみ修飾 | rename のみ（取れない場合あり） | なし |
| 変更量 | 大（5 サイト + index 張り替え） | 小 | 小 | 極小 |
| 既決との整合 | ADR-927 の一般化。ADR-2036 決定 4 を scoped 形に narrow | 同左 | ADR-2036 に整合 | 整合するが Issue を閉じない |

## 現時点の方針

**案1 を採用する。**

決め手は、ドット記法が **karasu に既にある**という計測結果である。4 サイトが受理し
5 サイトが拒否している状態は、「修飾記法を導入するかどうか」の問題ではなく
**同じ記法の適用範囲が揃っていない**問題である。したがって
[ADR-1820](../adr/1820-notation-promotion-gate.md) の gate が守る「新しい後方互換の
約束を安易に背負わない」には抵触しない — 約束は ADR-927 で既に背負っている。

接尾辞一致を解決規則に選ぶのは、それが**既存の全用例を後付けなしに説明する**唯一の
規則だったからである。`Customers.Customer`（相対）と `Shop.Checkout.Payment`（絶対）を
2 種類の規則として扱う必要はなく、どちらも接尾辞であり、bare id はその長さ 1 の場合に
すぎない。規則が 1 つなら、サイトごとに解決が食い違う余地も無い。

曖昧性診断は案1 に含めて残す。ただし役割が変わる — 案3 では「rename せよ」という
逃げ場の無い警告だったものが、案1 では「path で修飾せよ」という実行可能な助言になる。

レビューで次の 3 点を確認済み（2026-08-17）:

- **解決規則は接尾辞一致**。先頭からの絶対 path 必須にはしない
- **9 サイト一括で揃える**。`owns` だけを直して分岐を 4 つ残す形は採らない
- **AST の破壊的変更を許容する**。`owns` / `contains` / `realizes` / `handles` の
  property 型が `string[]` → `string[][]` になる（[ADR-927](../adr/927-import-system-nested.md) が
  `ImportDeclaration.ids` で行ったのと同じ変更）

### スライス（実装ステップ）

| スライス | 前提 | 独立に出荷できる理由 |
| --- | --- | --- |
| **A** path 記法の共有 parse ヘルパー + 接尾辞 resolver。既存の受理側 4 サイト（`import` / edge endpoint / entity 関連 / `resource`）を新 resolver に載せ替える | — | 受理する形も解決結果も変えない純粋な載せ替え。既存テストがそのまま回帰ガードになる |
| **B** `owns` / `contains`（top-level・スコープ内）を受理側に追加。`ownerIndex` / `boundaryMembership` の path キー化と `*-target-ambiguous` 診断を含む | A | bare id の解決は不変で、増えるのは受理される形と warning のみ |
| **C** `realizes` / `handles` を受理側に追加 + `*-target-ambiguous` 診断 | A | B と独立（別 property・別 validator・別 index）。B と並行して進められる |

**受理と narrowing を分割しない。** 記法だけ通して索引を id キーのまま残すと、
`A.B.C` と書いても解決先が bare と同じ集合になり、
[TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md) の
「受理されるのに効果が違う」を自分で作ることになる。そのため index の張り替えは
B から切り出さず同一スライスに含める。

> 各スライスの到達点（できること / その時点でできないこと）は親 Issue
> [#2088](https://github.com/kompiro/karasu/issues/2088) の `## Slice status` に置く
> （`.claude/rules/program-slices.md`）。

### 実装の指針

1. **字句と AST** — `ImportIdPath = string[]`（ADR-927）を汎用の `NodeIdPath` として
   `packages/core/src/types/ast.ts` に置き直す。`owns` / `contains` / `realizes` / `handles` の
   property 型を `string[]` から `NodeIdPath[]` に変える。bare id は `["Foo"]`
2. **共有 parse ヘルパー** — `Identifier (Dot Identifier)*` を読む関数を 1 つ作り、
   全サイトがこれを呼ぶ。`kebab-name.ts` の `TokenCursor` パターンに合わせる。
   **サイトごとに parse を書かない** — それが今の分岐を生んだ形
3. **接尾辞 resolver** — `packages/core/src/parser/reference-validation.ts` に
   `Map<id, Array<{ kind, path }>>` を作り（`collectDeclaredIds` と同じ walk から派生。
   walk を 2 本に分けない — ADR-2442 が 1 本に畳んだ理由と同じ）、
   path の一致は「候補の full path の末尾 N 要素と一致するか」で判定する。
   ヘルパーは 1 つに閉じ、全サイトが同じ関数を引く
4. **曖昧性診断** — 一致 2 件以上、かつ `${kind}:${path.length}` の集合サイズが 1 を
   超えるとき warning。コードは `owns-target-ambiguous` / `contains-target-ambiguous` /
   `realizes-target-ambiguous`（既存の `*-target-not-found` 命名族に揃える）。
   params は `{ path, candidates: Array<{ kind, path }> }`。
   `handles` には置かない — 候補が one-hop expose 規則の対象集合（system 直下の子の
   さらに直下の `domain`）に限られ、集合サイズがつねに 1 になるため（#2549 で確定）
5. **import 結合** — `file.nodeImports.length > 0` なら判定しない
   （[ADR-2410](../adr/2410-import-coupled-diagnostics-decline-and-invalid-owns-kind-only.md)、
   [TPL-1522](../test-perspectives/TPL-1522-style-coupled-diagnostics-sheetless-context.md) の
   台帳に新コードを追記する）
6. **index の path キー化**（スライス D） — `ownerIndex` を `Map<pathKey, teamId>` に、
   `boundaryMembership` を同様に変える。`makeOwnerResolver` は既に
   「some canvases key their node map by a qualified id」を前提にした signature を持つので、
   lookup キーをノードの full path に揃える。consumer は `layout.ts` / `layout-grouping.ts` /
   `group-collapse.ts` / `drill-down-svg.ts` / `build-drawio-project.ts`
7. **formatter** — `karasu fmt` が path を正規化しないこと（author が書いた長さを保つ）を
   固定する。[TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md) の round-trip
8. **spec** — `docs/spec/syntax.md` / `.ja.md` に「ノード参照の path 記法」節を新設し、
   各サイトの記述からそこを参照する形にする（記法の説明を 9 箇所に散らさない）。
   `docs/spec/diagnostics.md` / `.ja.md` に新コード。章末に `> Related TPLs:` で
   TPL-2088 を back-ref（`.claude/rules/spec-audit.md`）
9. **concepts の drift 修正** — `docs/concepts.md:87` / `docs/concepts.ja.md:88-90` が
   「同じノード id を複数の team が `owns` することはできず、…warning として検出される」と
   書いているが、[ADR-1566](../adr/1566-ownership-during-migration.md) 以降これは
   tolerated fact + **info** であり、同ファイルの診断表と自己矛盾している
10. **AT**: `docs/acceptance/2088-node-reference-path-notation.md`。TC は:
    - 9 サイトすべてで `A.B.C` が受理される（**受理側 4 サイトの回帰も含める**）
    - bare id の解決結果が全サイトで不変（後方互換）
    - 修飾 path で broadcast が 1 ノードに絞られる（チップが片方だけに付く）
    - 同 kind・同深さの衝突では `*-target-ambiguous` が出ない
    - 宣言順を入れ替えても判定が変わらない
    - `karasu fmt` が path を保つ
11. **ADR 昇格**: `docs/adr/2088-node-reference-path-notation.md`。
    [ADR-2036](../adr/2036-scoped-boundary-declaration.md) 決定 4 の扱いは
    `supersedes` ではなく `related_to` + 本文での narrow 記述にする
    （ADR-2036 の決定 1-3 / 5 / 6 は生きているため。
    [ADR-2442](../adr/2442-owns-existence-any-declared-node.md) が ADR-2408 の機構記述を
    更新したときと同じ扱い）。本 Design Doc は同 PR で削除する

### 影響範囲・マイグレーション

- **既存ユーザーへの影響**: 既存 `.krs` の解決結果・描画は不変（bare id = 長さ 1 の接尾辞）。
  増えるのは「書けるようになる形」と warning。移行作業は不要
- **ドキュメント更新**: `docs/spec/syntax.md` / `.ja.md`、`docs/spec/diagnostics.md` / `.ja.md`、
  `docs/concepts.md` / `.ja.md`（上記 drift）
- **AST の破壊的変更**: `owns` / `contains` / `realizes` / `handles` の property 型が
  `string[]` → `string[][]`。AST consumer（formatter / patch / LSP / translate / exporter）が
  追随する。ADR-927 が `ImportDeclaration.ids` で同じ変更をした前例がある
- **changeset**: `@karasu/core` / `@karasu/i18n` / `@karasu/lsp` / `@karasu/cli` に minor

## 未解決の問い / 決めないこと

- **`node-id-multiple-locations` の順序依存は別 Issue に分離する。** `nodePathIndex` は
  別の索引で、`viewPath` / permalink 側の blast radius を持つ。本 Design Doc は計測結果を
  記録するにとどめる
- **接尾辞ではなく先頭からの絶対 path を必須にするか**は決めない。既存 4 サイトの用例が
  接尾辞で説明できる以上、絶対必須にすると `Customers.Customer` を壊す。将来
  「曖昧なら絶対 path を要求する」strict モードを足す余地は残す
- **edge endpoint の解決規則は変えない。** [ADR-2075](../adr/2075-edge-endpoint-scope-diagnostic.md) の
  scope 規則は記法とは別軸で、統一の対象は「どの形を受理するか」であって
  「どのスコープで解決するか」ではない
- **`facets` は対象外。** facet id は node id ではなく flat な独自名前空間で、
  `docs/spec/syntax.md` が明示的に「cross-layer addressing の問いは生じない」と書いている
