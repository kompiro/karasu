# スコープを持たない bare-id 参照サイトの多重解決を報告する（`owns` / top-level `contains`）

- **日付**: 2026-08-17
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2088](https://github.com/kompiro/karasu/issues/2088)（owns/team membership references: cross-layer node addressing、[#2036](https://github.com/kompiro/karasu/issues/2036) から分離）
  - 関連 ADR: [ADR-2036](../adr/2036-scoped-boundary-declaration.md)（boundary はスコープ内宣言で曖昧性を構造的に解消・修飾記法は却下）、[ADR-927](../adr/927-import-system-nested.md)（同名 id の共存は正当）、[ADR-1566](../adr/1566-ownership-during-migration.md)（重複所有は tolerated fact）、[ADR-2075](../adr/2075-edge-endpoint-scope-diagnostic.md)（edge endpoint の scope 規則）、[ADR-2442](../adr/2442-owns-existence-any-declared-node.md) / [ADR-2410](../adr/2410-import-coupled-diagnostics-decline-and-invalid-owns-kind-only.md)（`owns` の存在検査と kind 検査の分離）、[ADR-1820](../adr/1820-notation-promotion-gate.md)（notation promotion gate）、[ADR-1858](../adr/1858-system-view-group-by-team.md)（Group by: team のメンバー範囲）
  - 関連 TPL: [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)、[TPL-1936](../test-perspectives/TPL-1936-cross-domain-entity-reference-qualified.md)、[TPL-1720](../test-perspectives/TPL-1720-validation-target-set-enumerates-all-kinds.md)、[TPL-1386](../test-perspectives/TPL-1386-diagnostic-register-fact-vs-style.md)、[TPL-1583](../test-perspectives/TPL-1583-migration-priority-index-winner.md)、[TPL-1623](../test-perspectives/TPL-1623-diagnostics-catalog-completeness.md)、本 PR で起票する proactive [TPL-2088](../test-perspectives/TPL-2088-unscoped-bare-id-reference-reports-multiplicity.md)
  - コード: `packages/core/src/parser/reference-validation.ts`、`packages/core/src/parser/parser.ts`（`buildNodePathIndex` / `indexTeams`）、`packages/core/src/renderer/layout-measure.ts`（`makeOwnerResolver`）

## 背景・課題

`owns <id>` は bare id でノードを指す。ノード id は兄弟の中でだけ error 級に一意で
（`duplicate-node-id-parent`）、層をまたいだ同名 id は [ADR-927](../adr/927-import-system-nested.md)
が正当と認めている。したがって `owns Payment` は、top-level の `service Payment` と
別 service 配下にネストした `domain Payment` を区別できない。

Issue #2088 はこれを「どちらを指したのか author が言えない」曖昧性として起票された。
**計測してみると、前提が 3 つとも実際の挙動と食い違っていた。** 以下はすべて本 Design Doc の
ための probe（`Parser.parse` + `analyze` + `compile`、`main` = eff605f7）で確認した事実である。

### 誤りだった前提 1 — 「衝突すると 1 つのノードが選ばれる」

選ばれない。**すべてのノードが選ばれる。**

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

つまり現状は「取り違え」ではなく **over-claim（過剰主張）**である。Issue の選択肢 3
「衝突した `owns` はどれか 1 つを選ぶ、と受け入れて文書化する」は、存在しない挙動を
文書化することになる。

### 誤りだった前提 2 — 「`owns` は `nodePathIndex` に対して存在検査する」

[ADR-2410](../adr/2410-import-coupled-diagnostics-decline-and-invalid-owns-kind-only.md) /
[ADR-2442](../adr/2442-owns-existence-any-declared-node.md) 以降、`owns` の存在検査は
`collectOwnsResolvableIds`（`packages/core/src/parser/reference-validation.ts`）が
**マージ後ツリー**から作る `Set<string>` を引く。`nodePathIndex` はもう読んでいない
（`parser.ts` の該当コメントが明示している）。

多重度が観測できない点は Issue の指摘どおりだが、**修正すべき場所が違う**。`Set` を
multimap にするのは `collectOwnsResolvableIds` 側であって `nodePathIndex` ではない。

### 誤りだった前提 3 — 「`node-id-multiple-locations` の発火範囲は部分的」

部分的なのではなく **宣言順に依存する**。同じモデルを書く順序を変えただけで発火が入れ替わる。

| ケース | `node-id-multiple-locations` | `nodePathIndex` の帰結 |
| --- | --- | --- |
| `service Payment` → ネスト `domain Payment` | **発火しない** | service の entry を domain が黙って上書き |
| ネスト `domain Payment` → `service Payment` | 発火する | — |
| 同一 system 内の 2 つのネスト `domain Inner` | 発火しない（設計どおり。`domain-dispersal` info が担当） | 先勝ち |
| top-level `database Payment` + ネスト `service Payment` | **発火しない** | service の entry を infra ループが黙って上書き |
| 2 system にまたがる同名 `service Dup` | 発火する | 先勝ち |

原因は `buildNodePathIndex`（`parser.ts`）の構造で、警告を出すのは
**非 domain の INDEXED_KIND 分岐が「既に index にある」と気づいたときだけ**である。
domain 分岐と top-level infra ループは無条件に `index.set` する。`nodePathIndex` は
`viewPath` / permalink の解決元でもあるため、上書きは「service `Payment` の permalink が
domain `Payment` を指す」形で表面化しうる。

### 併せて判明したこと — 同じ形の参照サイトがもう 1 つある

top-level の `boundary … contains` も同一形状だった。`boundaryMembership` は
`Map<id, boundaryId[]>` で、衝突しても診断は 0 件、membership は id 単位で成立する。

```krs
system Shop {
  service Payment {}
  service Checkout { domain Payment {} }
}
boundary Core { contains Payment }   // 診断 0 件、membership は id "Payment" に対して 1 件
```

[ADR-2036](../adr/2036-scoped-boundary-declaration.md) はスコープ内 `boundary` を
導入したが、決定 5 で **top-level 形は挙動不変で存続**させている。つまり
「メンバは兄弟だから曖昧性が構造的に消える」という ADR-2036 の解決は top-level 形には
及んでいない。

### edge endpoint は追随しない — 既に構造的な答えを持っている

Issue が併せて問うている「edge endpoint（`A -> B`）も同じ決定に従うか」は **否**。
[ADR-2075](../adr/2075-edge-endpoint-scope-diagnostic.md) の `edge-endpoint-not-at-scope`
が既に scope 規則を与えており、probe で次を確認した。

- 宣言スコープに peer がある場合、bare id は **その peer に束縛**され、より深い同名ノードは
  無視される。診断 0 件（正しい挙動）
- endpoint がネスト `domain` にしか存在しない場合、`edge-endpoint-not-at-scope` が
  `endpointKind` / `ownerId` / `scopeKind` を伴って発火する
- 別 system にしか存在しない場合も同様に発火する

これは ADR-2036 が `boundary` に与えたのと同じ「宣言スコープで解決する」構造であり、
edge には既に入っている。**スコープを持たない bare-id 参照サイトは `owns` と
top-level `contains` の 2 つだけ**である。

## 現状（インベントリ）

| 参照サイト | スコープ | 衝突時の挙動 | 診断 |
| --- | --- | --- | --- |
| `owns <id>` | **なし**（organization はシステム木の外側の overlay） | broadcast（全ノードを主張） | なし |
| top-level `boundary … contains <id>` | **なし** | broadcast | なし |
| スコープ内 `boundary … contains <id>` | 宣言ノードの直下の子 | 兄弟は error 一意 → 曖昧性なし | `contains-target-not-found`（ADR-2036） |
| edge endpoint `A -> B` | 宣言スコープの peer | peer に束縛 | `edge-endpoint-not-at-scope`（ADR-2075） |
| entity 関連 `Order -> Customers.Customer` | domain | 修飾必須（bare は intra-domain 専用） | TPL-1936 |
| `import { A.B.C }` | — | 明示 path 構文 | `import-path-not-found`（ADR-927） |

`owns` に関わる既存診断の分担（[ADR-2442](../adr/2442-owns-existence-any-declared-node.md)）:

- `owns-target-not-found` — 「その id を持つノードが在るか」だけを問う（kind を問わない）
- `invalid-owns` — 「解決した先の kind は所有できるか」だけを問う

**「解決先が 1 つか」を問う診断がない。** これが本件で埋める穴である。

## 制約・前提

- **同名 id の共存は正当**（[ADR-927](../adr/927-import-system-nested.md)）。system 移行期の
  新旧 `OrderService`、マルチテナントの `TenantA.Billing` / `TenantB.Billing`、複数 system に
  またがる一般名 domain はいずれも通常の使い方であり、これらに警告を出してはならない
- **重複所有は tolerated fact**（[ADR-1566](../adr/1566-ownership-during-migration.md)、
  info `duplicate-owner-assignment`）。逆コンウェイ移行期に 2 team が同一ノードを所有するのは
  正当な過渡状態
- **notation promotion gate**（[ADR-1820](../adr/1820-notation-promotion-gate.md)）。既定は
  据え置き。構文表面積を増やす案は「stable へ昇格するに足る実利用証拠」を要求される。
  ADR-2036 は修飾記法（案 Q）をこの gate を根拠に却下している
- **`owns` は v1.0-stable、`boundary` は experimental**。`owns` の意味を変える案は
  後方互換の約束を破る（v2.0 マター）
- **診断の register**（[TPL-1386](../test-perspectives/TPL-1386-diagnostic-register-fact-vs-style.md)）。
  モデルが正当に表現しうる事実は info、author の誤りは warning
- **1 診断 1 問い**（[ADR-2410](../adr/2410-import-coupled-diagnostics-decline-and-invalid-owns-kind-only.md)）
- **out of scope**: ノード id の identity を path 化すること（[ADR-1827](../adr/1827-permalink-deep-element.md) 既決に反する）、
  グローバル id 一意性の強制（ADR-927 既決に反する）、`namespace` 語彙の導入（ADR-1858 既決に反する）

## 検討した選択肢

### 案1: broadcast を spec で明文化し、多重解決を「区別可能なとき」だけ報告する

2 つを組にする。

1. **spec に broadcast を書く** — `owns <id>` / top-level `contains <id>` は id への
   主張であって単一ノードへの主張ではない、と明記する。現状の挙動に名前を与えるだけで
   挙動は変えない
2. **多重解決の診断を足す** — 解決先が 2 つ以上あり、かつ **それらが (kind, 深さ) で
   揃っていない**ときだけ warning を出し、候補 path を列挙する

判定条件は 1 つ、**解決先の集合が (kind, 深さ) の合成キーで 1 点に潰れるか**。

- 潰れる（同 kind・同深さ）→ 沈黙。ADR-927 / ADR-1566 が正当と認めた並行モデリング
  （移行共存・マルチテナント・複数 system の一般名 domain）はすべてここに落ちる
- 潰れない（kind か深さが違う）→ warning。service と別階層の nested domain を 1 行で
  同時に主張する読み方は、repo のどの決定も正当化していない

**メリット**

- 構文表面積が増えない。[ADR-1820](../adr/1820-notation-promotion-gate.md) の gate に
  触れず、[ADR-2036](../adr/2036-scoped-boundary-declaration.md) の案 Q 却下とも整合する
- 沈黙する範囲が既存の正当パターンと**一致する**。多テナント・移行共存で noise を出さない
- 合成キーで判定するのは [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)
  の処方そのもの。「区別が必要な属性を全部キーに入れる」を、index ではなく判定に適用した形
- `owns` と top-level `contains` の**両方**に同じ述語を当てられる。
  [TPL-1720](../test-perspectives/TPL-1720-validation-target-set-enumerates-all-kinds.md) の
  学び（「全部に足す」ではなく列挙を 1 箇所に畳む）に沿う
- 後方互換。既存 `.krs` の意味は変わらず、増えるのは warning だけ

**デメリット**

- broadcast 自体は残る。cross-layer の衝突に対する author の手当ては rename であり、
  「broadcast のまま黙らせる」手段がない（`@allow` 的な抑制構文は本案では導入しない）
- 判定に (kind, 深さ) の 2 次元が要る。単純な「解決先が 2 つ以上か」より実装が一段複雑

### 案2: 多重解決をすべて報告する

同じ診断を、(kind, 深さ) の例外なしに「解決先が 2 つ以上なら常に」出す。

**メリット**

- 判定条件が最も単純（集合のサイズだけ）

**デメリット**

- ADR-927 / ADR-1566 が正当と認めたパターンで発火する。マルチテナントの
  `owns Billing` は **broadcast が意図そのもの**であり、rename という手当ても取れない
  （テナントごとに domain 名を変えるのは本末転倒）。警告が「無視するのが正しい警告」に
  なると、診断全体の信頼を削る

### 案3: 修飾記法を `owns` に認める（`owns Checkout.Payment`）

**メリット**

- author が意図を書ける。[TPL-1936](../test-perspectives/TPL-1936-cross-domain-entity-reference-qualified.md)
  の `DomainId.EntityId` と同じ形で、repo 内に前例がある

**デメリット**

- 決めることが多い。解決規則（full path / 親 1 段 / 最小接尾辞）、bare id の意味を
  broadcast のまま残すか narrowing にするか、後者なら v2.0 マター
- [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)
  に従えば `ownerIndex` を path キーに張り替えることになり、カードのチップ・
  *Group by: team* のフレーム・collapse・org view・drawio exporter まで波及する
- [ADR-2036](../adr/2036-scoped-boundary-declaration.md) が案 Q として却下した記法を、
  [ADR-1820](../adr/1820-notation-promotion-gate.md) の「実利用証拠」なしに再提案することになる。
  cross-layer 衝突が実モデルで痛みを生んだ証拠（#1783 karasu-nest corpus 等）は現時点で無い
- TPL-1936 の前例は**そのままは効かない**。あちらの修飾子 `DomainId` は system 内で
  error 級に一意だが、`owns` の対象の親（service）は system をまたぐと warning 級一意でしかない
  （probe 3b）。同じ 1 段修飾では曖昧性が残る

### 案4: 現状維持 + 文書化のみ

broadcast を spec に書いて終わりにする。

**メリット**

- 最小コスト。broadcast は [ADR-1566](../adr/1566-ownership-during-migration.md) の
  co-ownership、[ADR-1858](../adr/1858-system-view-group-by-team.md) の per-view フレームと
  内部的に整合しており、それ自体は破綻していない

**デメリット**

- 事故的な cross-layer over-claim が黙ったままになる。org 図は正しく見えるのに
  system 図では意図しない team チップが付く、という「図が黙って嘘をつく」状態が残る
- `node-id-multiple-locations` の順序依存が未着手のまま残り、Issue が求めた
  「発火範囲の再計測」の結論が記録されない

## 比較

| 観点 | 案1 | 案2 | 案3 | 案4 |
| --- | --- | --- | --- | --- |
| 構文表面積 | 変化なし | 変化なし | 増える | 変化なし |
| 後方互換性 | 保つ（warning 増のみ） | 保つ | bare id の意味を変えるなら v2.0 | 保つ |
| 正当パターンでの noise | 出ない | **出る** | 出ない | 出ない |
| 事故的 over-claim の検出 | する | する | する（author が書けば） | しない |
| 変更量 | 小（診断 1 述語 + 2 コード） | 小 | 大（index 張り替え + 全 consumer） | 極小 |
| 既決との整合 | ADR-1820 / 2036 / 927 と整合 | ADR-927 / 1566 に反する | ADR-2036 案 Q の再提案 | 整合するが Issue を閉じない |

## 現時点の方針

**案1 を採用する。**

現状は「取り違え」ではなく「over-claim」だと計測で分かったことが決め手になる。取り違えなら
author が意図を書ける手段（修飾記法）が要るが、over-claim なら**どこまで主張しているかを
見せれば足りる**。broadcast が意図であるケース（マルチテナント・移行共存）はそのまま動き、
意図でないケース（層をまたぐ事故的衝突）だけが可視化される。

判定を (kind, 深さ) の合成キーに置くことで、沈黙させる範囲が
[ADR-927](../adr/927-import-system-nested.md) / [ADR-1566](../adr/1566-ownership-during-migration.md)
の正当パターンと一致する。これは偶然ではなく、両 ADR が認めているのが「**同じ層に同じ種類の
ものが並ぶ**」並行モデリングだからである。

修飾記法（案3）は却下ではなく**見送り**とする。[ADR-1820](../adr/1820-notation-promotion-gate.md)
の既定は据え置きであり、昇格トリガーは証拠。本案の診断が実モデルで頻繁に鳴るなら、それが
まさに gate の言う「痛みが surface したシグナル」になる。診断を先に入れることは、修飾記法の
判断材料を作ることでもある。

### スライス（実装ステップ）

| スライス | 前提 | 独立に出荷できる理由 |
| --- | --- | --- |
| **A** broadcast の明文化 + 多重解決診断（`owns` / top-level `contains`） | — | 既存の解決結果を変えず warning を足すだけ。図も既存診断も変わらない |
| **B** `node-id-multiple-locations` の順序依存解消（別 Issue に分離） | なし（A と独立） | A とは別の index（`nodePathIndex`）の欠陥で、`viewPath` / permalink 側の blast radius を持つ。混ぜると review 単位が過大になる |

スライス B は **本 Issue では実装せず、独立した bug Issue として起票する**。Issue #2088 が
求めた「発火範囲の再計測」は本 Design Doc の背景節が結論（順序依存であること）を記録し、
修正はその Issue が担う。

### 実装の指針（スライス A）

1. **多重解決の述語を 1 つ作る** — `packages/core/src/parser/reference-validation.ts` に、
   宣言済みノードを `Map<id, NodeLocation[]>`（`NodeLocation = { kind, path }`）で集める walk を
   足す。`collectDeclaredIds` と同じ walk から派生させ、`Set` 版はその keys とする
   （2 つの walk に分けない — ADR-2442 が 1 walk に畳んだ理由と同じ）
2. **判定** — 候補が 2 件以上かつ `new Set(locs.map(l => `${l.kind}:${l.path.length}`)).size > 1`
   のとき報告する。合成キーのヘルパーは 1 つにし、2 つの参照サイトが同じ関数を引く
3. **診断コードを 2 つ足す** — `owns-target-ambiguous` / `contains-target-ambiguous`
   （severity: **warning**）。params は `{ id, candidates: Array<{ kind, path }> }`。
   既存の `*-target-not-found` 命名族に揃える。単一コード + `site` param にしない理由は、
   既存 2 族（`owns-` / `contains-`）が既に構文別に分かれているため
4. **import 結合の扱いを既存に揃える** — `file.nodeImports.length > 0` なら判定しない
   （[ADR-2410](../adr/2410-import-coupled-diagnostics-decline-and-invalid-owns-kind-only.md)、
   [TPL-1522](../test-perspectives/TPL-1522-style-coupled-diagnostics-sheetless-context.md) の
   台帳に本 2 コードを追記する）。多重度はマージ後にしか確定しない
5. **配線** — `packages/core/src/types/ast.ts`（params 型）、`packages/i18n/src/{en,ja}.ts`、
   `packages/i18n/src/render-diagnostic.ts`、`packages/lsp/src/diagnostics.ts`、
   `docs/spec/diagnostics.md` / `.ja.md`（カタログ。
   [TPL-1623](../test-perspectives/TPL-1623-diagnostics-catalog-completeness.md) の網羅テストが通ること）
6. **spec に broadcast を明文化** — `docs/spec/syntax.md` / `.ja.md` の §team node と
   §boundary に「`owns` / top-level `contains` は id への主張であり、同 id のノードが
   複数あればそのすべてに及ぶ」を書く。`.claude/rules/spec-audit.md` に従い章末に
   `> Related TPLs:` で TPL-2088 を back-ref する
7. **concepts の drift を直す** — `docs/concepts.md:87` / `docs/concepts.ja.md:88-90` が
   「同じノード id を複数の team が `owns` することはできず、…warning として検出される」と
   書いているが、[ADR-1566](../adr/1566-ownership-during-migration.md) 以降これは
   tolerated fact + **info** であり、同ファイルの診断表（`duplicate-owner-assignment`）と
   自己矛盾している。本 Design Doc の実装 PR で 2 行を修正する
8. **AT**: `docs/acceptance/2088-unscoped-reference-multiplicity.md` を新規。TC は:
   - cross-layer 衝突（`service` + ネスト `domain`）で `owns-target-ambiguous` が
     候補 path 2 件を伴って出る
   - 同 kind・同深さの衝突（2 system の同名 `domain`）では **出ない**
   - top-level `contains` でも同じ 2 ケースが同じ判定になる
   - 宣言順を入れ替えても判定が変わらない（順序独立）
   - import を持つ file では判定しない / マージ後は判定する
9. **ADR 昇格**: 実装完了後 `docs/adr/2088-unscoped-bare-id-reference-multiplicity.md` として
   昇格し、本 Design Doc は同 PR で削除する

### 影響範囲・マイグレーション

- **既存ユーザーへの影響**: 既存 `.krs` の解決結果・描画は変わらない。cross-layer の id 衝突を
  持つモデルに warning が 1 種類増える。図は変わらないため、無視しても従来どおり動く
- **ドキュメント更新**: `docs/spec/diagnostics.md` / `.ja.md`、`docs/spec/syntax.md` / `.ja.md`、
  `docs/concepts.md` / `.ja.md`（上記 drift）
- **テスト・examples への影響**: `examples/` に cross-layer の id 衝突を持つものが無いか
  実装時に確認する（`examples.test.ts` の drift ガードに引っかかる可能性）
- **changeset**: `@karasu/core` / `@karasu/i18n` / `@karasu/lsp` に minor（診断追加）

## 未解決の問い / 決めないこと

- **`node-id-multiple-locations` との併発をどう扱うか。** cross-layer 衝突を
  「domain → service」の順で書いた場合、宣言側で `node-id-multiple-locations`、
  参照側で `owns-target-ambiguous` の 2 件が出る。両者は**別の問いに答えており**
  （宣言の多重性 vs 参照の過剰主張）、loc も別（宣言箇所 vs team ブロック）なので
  現時点では両立させる。ただしスライス B で前者が順序独立になると併発が系統的になるため、
  **その時点で再評価する**
- **broadcast を意図的に使うときの表明手段**（`owns` 側で「全部でいい」と書く構文）は
  導入しない。必要性が実モデルで示されてから考える（ADR-1820 の既定）
- **修飾記法**（案3）は見送り。本診断の発火実績を昇格トリガーの証拠として使う
- **`realizes` は対象外**。deploy unit → 論理ノードの参照も bare id だが、本 Design Doc では
  計測していない。同じ形状かどうかは別途確認する
