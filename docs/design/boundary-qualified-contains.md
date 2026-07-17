# boundary `contains` の id 衝突曖昧性 — 曖昧性診断と修飾 `contains`

- **日付**: 2026-07-17
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2036](https://github.com/kompiro/karasu/issues/2036)（parent [#1822](https://github.com/kompiro/karasu/issues/1822) comprehension）
  - 顕在化元: [#1983](https://github.com/kompiro/karasu/issues/1983) / [#2034](https://github.com/kompiro/karasu/issues/2034)（drill-down grouping 正規化 → [ADR-20260717-01](../adr/20260717-01-boundary-drilldown-grouping.md)。末尾「補足（識別モデルの sharp edge）」が本設計の charter）
  - 関連 Issue: [#2032](https://github.com/kompiro/karasu/issues/2032)（cross-file contains の偽 not-found — 同じ contains 解決経路）
  - notation の母体（設計）: [`system-view-grouping.md`](./system-view-grouping.md)（P2b `boundary`/`contains`、status: 部分昇格。本設計はその follow-up）
  - 関連 ADR: [ADR-20260713-01](../adr/20260713-01-notation-promotion-gate.md)（notation promotion gate）、[ADR-20260513-03](../adr/20260513-03-import-system-nested.md)（import path 構文 `A.B.C`）、[ADR-20260714-01](../adr/20260714-01-cross-domain-ghost-entities.md)（cross-domain entity 修飾参照 — 案 B の直接先例）、[ADR-20260715-01](../adr/20260715-01-domain-entity-modeling.md)（entity id のフラット名前空間 + `entity-anchor-collision`）、[ADR-20260630-01](../adr/20260630-01-permalink-deep-element.md)（permalink deep anchor = leaf id）、[ADR-20260711-03](../adr/20260711-03-system-view-group-by-team.md)（P2a team 軸・`namespace` 語彙却下）、[ADR-20260404-09](../adr/20260404-09-cross-system-service-references.md)（dot-notation 参照の起点）
  - 関連 TPL: [TPL-20260714-01](../test-perspectives/TPL-20260714-01-cross-domain-entity-reference-qualified.md)、[TPL-20260512-01](../test-perspectives/TPL-20260512-01-composite-key-must-cover-all-distinguishing-dimensions.md)、[TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md)、[TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md)、[TPL-20260615-02](../test-perspectives/TPL-20260615-02-diagnostic-absence-assertion-scope-severity.md)、[TPL-20260623-02](../test-perspectives/TPL-20260623-02-validation-target-set-enumerates-all-kinds.md)
  - コード: `packages/core/src/parser/parser.ts`（`buildBoundaryIndex` / `collectContainableIds` / `validateContainsReferences` / `buildNodePathIndex` / `validateOwnsReferences`）、`packages/core/src/renderer/layout.ts`（`groupIdOf` / `buildGroupFrames`）、`packages/core/src/view/view-extract.ts`（`resolveQualifiedEntity` / `buildDomainEntityIndex` — 案 B の template）

## 背景・課題

`boundary contains <id>`（および team の `owns <id>`）は **素の id 文字列**でノードを参照し、boundary membership は layout 時に **id 一致**で解決する。ところが node id の一意性は**グローバルではない**: `duplicate-node-id-parent`（error）は sibling（同一親直下）でのみ発火し、親が違えば同 id が黙って共存できる（karasu が意図して許す構造 — システム移行・マルチテナント・一般ドメイン名。根拠は `duplicate-node-id-parent` の **sibling 限定 scope**（`parser.ts:2172-2186`）+ [ADR-20260513-03](../adr/20260513-03-import-system-nested.md) L36「同名 id の意図的な共存」。なお [ADR-20260514-01](../adr/20260514-01-multi-file-import-semantics.md) は逆に別インスタンス同 id に `duplicate-node-in-system` を **維持**する — 同 ADR が許すのは同名 system の reopen/union-merge であって node-id 共存ではない）。

この二つが重なると、`contains X` が **意味の異なる複数ノードを各レベルで黙って枠に取り込み**、**診断がゼロ**になる。著者は 1 ノードのつもりで `contains Payment` と書くが、別物の 2 ノードが framed になり、しかも「service ではなく domain の方」と bare id で言い分ける手段も、曖昧だったという警告も無い。

### compile probe（本設計で再実行し確証）

`packages/core/src/index.ts` の `compile` を直接叩いて再現した（probe: `/tmp` 配下スクリプト、`tsx` 実行）。

**シナリオ 1 — `contains` + 同 id（Issue 再現）**

```krs
system Shop {
  service Payment { domain Ledger {} }     // top-level service, id=Payment
  service Checkout { domain Payment {} }    // nested domain, id=Payment（親が違うので許容）
}
boundary b "B" { contains Payment }
```

`groupBy: "boundary"` で観測:

| view | diagnostics | 枠 | 枠に入るノード |
| --- | --- | --- | --- |
| root | **なし** | `__group_b__` | top-level **service** `Payment` |
| drill `Shop.Checkout` | **なし** | `__group_b__` | nested **domain** `Payment`（別ノード） |
| drill `Shop.Payment` | なし | （枠なし） | `Ledger` |

→ `contains Payment` が **別物 2 ノードを 2 レベルで黙って枠取り**、診断ゼロ。`duplicate-node-id-parent` も `contains-target-not-found` も出ない（id は存在し、sibling でもない）。

**シナリオ 2 — `owns`/team、同じ形（service 対 nested domain の衝突）**

同じ Shop に `organization Org { team T "Team T" { owns Payment } }` を足して `groupBy: "team"` で観測 → root で service `Payment`、drill `Checkout` で domain `Payment` が `__group_T__` に入り、**両 view とも診断なし**。**`owns`/team 軸も同じ silent 多重フレームの穴**を持つ。

**シナリオ 2b — `owns`/team、top-level service 2 つが同 id** → `warning:node-id-multiple-locations({nodeId:"Payment"})` が発火。**`owns` の穴は部分的にしか塞がれていない**（service/client 同士の衝突だけ既存 warning でカバー、service 対 domain・domain 分散は silent）。

**シナリオ 3 — edge `Caller -> Payment`（同 id）** → 診断なし。edge endpoint も bare id で 1 勝者に黙って解決（`layoutNodes.get(edge.from)` `layout.ts:2042` — `computeEdgePoints` 開始は :2028）。本設計のスコープ外だが同根であることの確認。

**シナリオ 4 — 一意 id（control）** → 正常に枠が出て診断なし。回帰の基準線。

### なぜ #1983 が増幅したか

id モデルは以前からこれを許していたが、衝突は概ね潜在的だった: 静的 export は root band のみ枠取りしていた（[#1879](https://github.com/kompiro/karasu/issues/1879) gate）ため nested 同 id ノードはそもそも枠取り対象外だった。[#1983](https://github.com/kompiro/karasu/issues/1983)（[ADR-20260717-01](../adr/20260717-01-boundary-drilldown-grouping.md)）が grouping を drill レベル / export / entity view で正規化し**canonical として spec 化**したことで、両同 id ノードが可視的に参加するようになり、曖昧性の噛む範囲が広がって公式挙動になった。ADR-20260717-01 は末尾でこれを sharp edge として明記し、「曖昧性診断」と「修飾 `contains`」を本 Issue #2036 に切り出している。

## 現状（インベントリ）

### bare-id 参照の 3 経路（すべて同じ穴、カバレッジだけ差）

| 参照 | 解決キー | 実装 | 同 id 衝突時の既存診断 |
| --- | --- | --- | --- |
| `contains` | bare id | `buildBoundaryIndex` = `Map<id, boundaryId>`（`parser.ts:2030-2047`、first-wins）／membership は `groupIdOf(n.id)`（`layout.ts:1056-1057`）→ `buildGroupFrames` が **一致する全ノードを枠取り**（`layout.ts:82`） | **なし**（silent 多重フレーム） |
| `owns`/team | bare id | `nodePathIndex` = `Map<id, path>`（**単一勝者・lossy**、`parser.ts:2068-2170`）／`ownerIndex` → 同じ `groupIdOf(n.id)` | **部分的**: service/client 対 → `node-id-multiple-locations`（warning, emit `parser.ts:2132`、**非 domain 枝のみ**）。service 対 domain・domain 分散 → **silent**（probe 2 実証。domain 枝 `parser.ts:2106-2138` は `index.has` を見ず上書き） |
| edge `from`/`to` | bare id | `layoutNodes.get(edge.from)`（`layout.ts:2042`、単一勝者） | **なし**（silent 1 勝者） |

`contains` の存在チェックは `validateContainsReferences`（`parser.ts:2220-2234`）が `collectContainableIds`（`parser.ts:2240-2258`）に対して行うが、後者は **`Set<string>`** なので同 id を 1 エントリに畳んでしまい、**多重性を観測すらできない**。`buildBoundaryIndex` の `duplicate-boundary-assignment`（info）は「同 id が複数 boundary に居る」別軸で、「1 contains が複数ノードに一致」は検出しない。

### 既存の識別・参照モデル（本設計の土台）

karasu は既に「**フラット id 名前空間 + kind 別の段階 severity 一意性 + 曖昧なときだけドット修飾で解決**」を採る。案 B はこの**一般化**であって新機構ではない。

| 語彙 | 一意性 severity | 曖昧解消手段 | 出典 |
| --- | --- | --- | --- |
| sibling id（同一親直下） | **error**（`duplicate-node-id-parent`） | — | diagnostics.md:76 |
| system 内 node id | **error**（`duplicate-node-in-system`） | — | diagnostics.md:78 |
| `DomainId`（system 内） | **error**級一意 | — | syntax.md:600-602 |
| entity id / domain id（anchor 名前空間） | **warning**（`entity-anchor-collision`） | `DomainId.EntityId` ドット | syntax.md:618-622、[ADR-20260715-01](../adr/20260715-01-domain-entity-modeling.md) |
| node id 全域 | **強制しない**（意図的共存を許す） | import path `A.B.C` | syntax.md:1154-1183、[ADR-20260513-03](../adr/20260513-03-import-system-nested.md) |

既存のドット修飾の実例: cross-domain entity `Order -> Customers.Customer`（syntax.md:590-604、`DomainId.EntityId`、[TPL-20260714-01](../test-perspectives/TPL-20260714-01-cross-domain-entity-reference-qualified.md)）、physical `table OrderDB.orders`、cross-system `SystemId.ServiceId`（[ADR-20260404-09](../adr/20260404-09-cross-system-service-references.md)）、import path `ECPlatform.ECommerce.Order`（syntax.md:1154-1164）。いずれも **bare が曖昧なときだけ opt-in で修飾**し、bare は簡単形として残る（syntax.md:1183）。

### 修飾解決の実装 template（案 B の下敷き）

cross-domain entity は「bare 文字列一致ではなく所属ドメインで scope した解決」を実装している。ただし **2 segment・entity 限定のパターン**であり、案 B が要る多 segment 接尾辞・全 kind・`boundaryIndex` 再キーは template では実証されない（下記の限界に注意）:

- `buildDomainEntityIndex(system)`（`view-extract.ts:1101-1118`）: `Map<domainId, { domain, entities: Map<entityId, node> }>`。entity を**所属ドメイン下にスコープ**するので同 bare entity id が 2 ドメインに在っても別物として保たれる。ただし **domain id 自体は first-wins**（`view-extract.ts:1106` の `!index.has(node.id)`）— entity id 衝突には robust だが **domain id 衝突には非 robust**（system 内 `DomainId` は error 一意ゆえ実害は出ない前提）。
- `resolveQualifiedEntity(target, index)`（`view-extract.ts:1126-1138`）: `target.indexOf(".")` の **1 回分割 = 固定 2 segment**（`DomainId.EntityId`）。修飾子（所属ドメイン id）で曖昧を解くが、多 segment 接尾辞パスは未対応。
- identity 比較（`view-extract.ts:1198,1213,1217`）: `entry.domain === domain`（**ノード参照**で比較、bare id 文字列でなく）。→ 案 B が流用できるのは「参照サイトで所属 scope により解決しノード identity で比較する」**方式**であって、多 segment・全 kind への一般化は本設計の新規実装（[TPL-20260512-01] の合成キー + 接尾辞照合が要る）。

## 制約・前提

- `boundary` は **experimental notation**（[ADR-20260717-01](../adr/20260717-01-boundary-drilldown-grouping.md) L52）。promotion gate（[ADR-20260713-01](../adr/20260713-01-notation-promotion-gate.md)）が対象とするのは **notation/構文**（experimental → stable 昇格、後方互換な追加 = v1.x minor / 変更・再設計 = v2.0 major）であって診断ではない。**案 A は文法非変更・診断追加のみ → gate を発火させない** — この「experimental 層内の挙動/診断変更は gate 外」は [ADR-20260717-01](../adr/20260717-01-boundary-drilldown-grouping.md) L52 の先例そのもの（「experimental 層内の挙動確定…stable 昇格ではない」「その分は promotion gate の枠外の通常の minor 挙動変更として扱った」）。**案 B は文法追加 → gate 対象**（corpus evidence 待ち）。
- **identity = author-given bare id を変えない。** permalink deep anchor `#krs-<view>-<id>` は leaf id に依存し、full path は `nodePathIndex` から**再構成**する（[ADR-20260630-01](../adr/20260630-01-permalink-deep-element.md) L50,L53）。identity=path 化は bare-id 参照と deep anchor を壊すので不可。
- **global id 一意性の強制は不可。** entity は warning 級一意（`entity-anchor-collision`）、親が違えば同 id が共存する（`duplicate-node-id-parent` は sibling 限定 `parser.ts:2172-2186`、[ADR-20260513-03](../adr/20260513-03-import-system-nested.md) L36）。段階 severity の既存判断と矛盾させない。
- **cross-system の修飾は v1 out of scope**（P2b design [`system-view-grouping.md`](./system-view-grouping.md) L342 の out-of-scope、entity view の cross-system 制限 syntax.md:602-604 と一貫）。
- 本設計のスコープは **membership 参照（`contains` を主、`owns` を対称検討）に限定**。edge endpoint の同 id 曖昧（probe 3）は同根だが別スコープ（後述）。

## 検討した選択肢

案 A と案 B は **排他ではなく補完**。A は今すぐ silent を可視化し、B は将来 boundary 安定化の一部として曖昧を著者が解けるようにする。A の診断出力が B の修飾子をそのまま提示する導線になる。

### 案 A: 曖昧性診断 `contains-target-ambiguous`（近接・gate 非依存）

`contains` の member id が **複数の別ノードに解決**したとき warning を出す。文法変更ゼロ。

- **診断コード**: `contains-target-ambiguous`（kebab-case。**parser Diagnostic チャネル** — `contains-target-not-found` の隣、`DiagnosticParamsByCode`（`ast.ts:555`）→ `render-diagnostic.ts` の exhaustive switch → `en.ts`/`ja.ts` → `diagnostics.md` カタログ。`entity-anchor-collision` は resolver Warning チャネルだが、本件は同じ検出 site（parser の contains 検証）なので `contains-target-not-found` と同チャネルに置く）。
- **severity**: **warning**（[TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md)）。id 再利用自体は許された事実（info 相当）だが、**参照 site で著者の意図（1 ノード）に解決しない**のは欠陥。membership addressability を損なう点で `entity-anchor-collision`（deep-link addressability を損なう warning）と対称。`contains-target-not-found`（warning）とも同格。
- **発火条件**: member id が **>1 の distinct declared node に一致**するとき。**別 member id が別レベルに散るのは正常**（ADR-20260717-01 rule 2 の disjoint フレーム）ので、発火は**単一 member id の多重性**でのみ判定する（レベル単位ではない）。
- **検出層**: `validateContainsReferences`（`parser.ts:2220`）。`collectContainableIds`（`parser.ts:2240`）を **`Set<string>` → `Map<string, { kind, path }[]>`** に拡張（id → その id を持つ全宣言ノードの kind と path。全 kind を歩く現行 walk をそのまま多値化。[TPL-20260623-02](../test-perspectives/TPL-20260623-02-validation-target-set-enumerates-all-kinds.md): valid-target 集合は全 kind 列挙 — multimap も同集合を踏襲）。member id の list について: `length === 0` → 既存 `contains-target-not-found`、`length === 1` → OK、`length > 1` → `contains-target-ambiguous`。`buildBoundaryIndex` の first-wins とは独立に検出できる。
- **params**: `{ memberId: string; locations: string[] }`（各一致ノードの path 文字列。例 `["Shop.Payment", "Shop.Checkout.Payment"]`）。`ast.ts` の `DiagnosticParamsByCode` に追加。locations は案 B で「書けばよい修飾子」そのものになる。
- **i18n**（[i18n.md](../spec/i18n.md): en 必須 / ja 推奨）:
  - `packages/i18n/src/types.ts` に `diagnostic.containsTargetAmbiguous.message` の**型宣言**を追加（`containsTargetNotFound` が宣言される ~L420 の隣。無いと `t(...)` と en/ja が型チェックを通らない）。
  - `render-diagnostic.ts` に `case "contains-target-ambiguous": return t("diagnostic.containsTargetAmbiguous.message", d.params);`
  - en（必須、`en.ts`）案: `` `boundary member "${memberId}" is ambiguous — it matches ${n} declared nodes (${locations}). Qualify the reference to pick one.` ``
  - ja（推奨、`ja.ts`）案: `` `boundary メンバー "${memberId}" が曖昧です — ${n} 個の宣言済みノード（${locations}）に一致します。参照を修飾して 1 つに絞ってください。` ``
- **catalog 登録**: `diagnostics.md`（+ `diagnostics.ja.md`）の「Cross-reference resolution」family に `contains-target-not-found` と並べて行追加。completeness を強制するのは `packages/core/src/types/diagnostics-catalog.test.ts`（`DiagnosticParamsByCode` + `WarningKind` の全メンバが `diagnostics.md` / `diagnostics.ja.md` **両方**の backtick 記載を持つまで fail。code→doc 方向のみ保証で doc→code は非保証）。
- **テスト**: `parser.test.ts`（発火: service + nested domain 同 id / 非発火: 一意 id・not-found・単一一致・別 member が別レベル）。診断不在 assert は severity で絞る（[TPL-20260615-02](../test-perspectives/TPL-20260615-02-diagnostic-absence-assertion-scope-severity.md)）。`render-diagnostic.test.ts`・`packages/core/src/types/diagnostics-catalog.test.ts`。
- **`owns` 版（設計で確定 — Phase A に同梱）**: `owns`/team も同型の silent 二重フレーム穴（probe 2）。既存 `node-id-multiple-locations`（warning, emit `parser.ts:2132`）は **非 domain 枝でしか発火せず service/service しか拾わない** — domain 枝（`parser.ts:2106-2138`）は診断なしで上書きするため **service 対 domain と domain 分散は silent のまま**。`contains Payment`=警告／`owns Payment`=無言という著者視点の非対称を残さないため、**`owns-target-ambiguous`（warning）を Phase A に同梱**する（[TPL-20260510-11]（parallel-function-parity）— 片軸だけ診断を付けると非対称が固定化）。scope は `node-id-multiple-locations` が外す **残余集合**（service 対 domain / domain 分散）に絞り二重発火を避ける。**多重性の観測手段（設計で解く）**: `owns` の存在検証が使う `nodePathIndex` は単一勝者・lossy（`parser.ts:2068-2170`）で多重性を観測できない。よって `owns-target-ambiguous` は nodePathIndex を流用せず、**案 A の `contains` multimap を `owns` 対象 kind（service/domain/client + top-level infra）に絞った multimap** を別途構築して `validateOwnsReferences`（`parser.ts:2188`）で判定する。edge は本スコープ外。

**メリット**

- 今日の silent sharp edge を**文法変更なしで可視化**（gate 非依存で先行独立出荷）。
- 既存 `contains-target-not-found` の隣に**最小差分**で乗る（同チャネル・同 loc・同 params 形）。
- 出力 `locations` が案 B の修飾子を提示し、A→B の導線になる。

**デメリット**

- **解決手段は与えない** — 警告は出るが、bare id では依然「service ではなく domain」を言えない（それは案 B）。
- `collectContainableIds` を多値化する分だけ検出コストが増える（全 kind walk は元々あるので軽微）。

### 案 B: 修飾 `contains`（設計・corpus evidence にゲート）

`contains` に**ドット修飾子**を許し、既存のドット記法解決を再利用して曖昧を解く。

- **文法**: `contains <qualifiedId>`、`qualifiedId ::= Identifier ("." Identifier)*`。import path `A.B.C`（[ADR-20260513-03](../adr/20260513-03-import-system-nested.md)、parser は既に `Identifier (Dot Identifier)*` を `ImportIdPath` として受理）と `DomainId.EntityId`（syntax.md:590）の一般化。新規 grammar 表面積は「`contains` の引数が単一 Identifier → dotted path」だけ。
- **最小の disambiguating スコープ（full path 強制でない）**: member を一意化する**最短の接尾辞パス**。bare `Payment` が衝突 → `Checkout.Payment`（parent.child）、まだ衝突 → 祖先を足す。`DomainId.EntityId` が full path を強制しないのと同じ grain。案 A の `locations` 出力がそのまま候補修飾子になる。
- **解決（bare 文字列一致 → 解決済みノード identity 一致）**: 方式の template は `resolveQualifiedEntity` + `buildDomainEntityIndex` + identity 比較（`view-extract.ts:1101-1235`、ただし **2 segment・entity 限定** — 多 segment 接尾辞・全 kind は本設計で新規）。boundary 版は案 A で作る multimap（id → `{ node, path }[]`、**全 kind**）に対し qualified member の接尾辞パスでフィルタ → 一意なら解決ノードを得る。`nodePathIndex`（`parser.ts:2068`）は service/domain/client のみで usecase/entity/resource を含まないため流用不可 — **案 A の全 kind multimap が案 B の解決基盤を兼ねる**（フェーズ依存が自然）。
- **`boundaryIndex` の再キー**（案 B の中核実装コスト）: 現状 `Map<id, boundaryId>` を `groupIdOf(n.id)`（bare id）で引く。qualified member は「特定の 1 ノード」を指すので bare-id キーでは表せない（同 id 他ノードを巻き込む）。選択肢:
  - **(B-i) full-path キー化**: `boundaryIndex: Map<pathKey, boundaryId>`、`groupIdOf` も各 layout node の full path で引く。根本的（[TPL-20260512-01](../test-perspectives/TPL-20260512-01-composite-key-must-cover-all-distinguishing-dimensions.md): 区別属性 = path をキーに入れる）だが全 layout 経路に path を通す必要。
  - **(B-ii) 混在フォールバック**: bare member は現行 bare-id `boundaryIndex`、qualified member だけ `Map<pathKey, boundaryId>` に解決し `groupIdOf` で層別参照。実装は軽いが bare/qualified でキー系が割れる整合リスク（[TPL-20260714-01](../test-perspectives/TPL-20260714-01-cross-domain-entity-reference-qualified.md) failure #3: ghost node と edge endpoint のキー不整合と同型）。
  - → 未解決の問いに残す（実装時に corpus と相談）。
- **任意**: bare は曖昧でない限り有効（import bare / entity bare intra と一貫、syntax.md:1183）。曖昧なときだけ修飾（案 A の警告が促す）。
- **`owns` への適用**: 同 resolver で `owns` も qualified 化できるが、`owns`/`organization` は **stable notation**。stable 構文への任意修飾子追加は後方互換（bare 継続）だが experimental の `contains` と gate 階層が違う。**v1 は `contains` に限定**、qualified `owns` は follow-on。
- **edge への波及**: edge `from`/`to` も bare id（`layoutNodes` bare キー、probe 3）。cross-system `SystemId.ServiceId` は既にある（[ADR-20260404-09](../adr/20260404-09-cross-system-service-references.md)）が intra-system の同 id 曖昧は未対応。**本設計スコープ外**（membership に限定）。同 resolver を将来 edge にも適用しうる、と記すに留める。
- **permalink anchor identity 不変**: identity は bare flat id のまま。qualified `contains` は reference-site のみ。deep anchor は leaf id（[ADR-20260630-01](../adr/20260630-01-permalink-deep-element.md)）。identity を path 化しない。
- **diff / collapse / multi-file 相互作用**:
  - collapse: `collapsedGroups` は group id（boundary id）キーで member 修飾と独立 → 影響なし。
  - diff: diff grouping は system root のみ（ADR-20260717-01 rule）→ drill レベルの qualified member と交差薄い。
  - multi-file: [#2032](https://github.com/kompiro/karasu/issues/2032)（cross-file contains 偽 not-found）と同経路。qualified contains は cross-file の同 id 衝突を著者が解く手段になりうる（プラス）が、path 解決が merge 後 tree に依存する点は #2032 と同じ解決順序の注意（実装時）。

**メリット**

- **曖昧を著者が解ける**（警告だけでなく修正手段を与える）。
- 既存ドット記法の一般化 — **新語彙ゼロ**、`DomainId.EntityId` / import path と同じ grain。identity 不変。
- 全 kind multimap を案 A と共有し、resolver template（view-extract）も既存。

**デメリット**

- 文法追加 → promotion gate（corpus evidence 待ち、出荷は後）。
- `boundaryIndex` 再キーは非自明（bare-id 前提の layout 経路に触る）。
- 過剰投資リスク: 実 corpus で同 id 衝突がどれだけ起きるか未計測（gate の存在理由そのもの）。

## 比較

| 観点 | 案 A（曖昧性診断） | 案 B（修飾 contains） |
| --- | --- | --- |
| 文法変更 | なし | あり（`contains` に dotted path） |
| promotion gate | **外**（gate 非依存で先行出荷） | **対象**（corpus evidence 待ち） |
| 変更量 | 小（parser 検出 + i18n + catalog + test） | 中（文法 + resolver + `boundaryIndex` 再キー + spec） |
| 後方互換 | 完全（新 warning のみ） | 完全（bare 継続、qualified は opt-in の追加） |
| 提供価値 | 可視化（警告） | 解決（修飾で 1 ノードに絞る） |
| identity への影響 | なし | なし（reference-site のみ） |
| 出荷時期 | 即（Phase A） | 後（Phase B、gate 通過後） |

## 現時点の方針

**案 A を先行独立出荷し、案 B を boundary 安定化設計として corpus evidence にゲートする（両者は補完）。**

- **案 A** は文法非変更（診断追加のみ）なので gate を発火させない（[ADR-20260717-01](../adr/20260717-01-boundary-drilldown-grouping.md) L52 の within-experimental 先例）。今日の silent sharp edge を最小差分で可視化し、`@karasu-tools/core` + `karasu` の minor changeset で単独出荷する。診断の `locations` 出力が案 B の修飾子候補を提示し、A→B が自然な連続になる。
- **案 B** は文法追加なので [ADR-20260713-01](../adr/20260713-01-notation-promotion-gate.md) の gate に乗せ、karasu-nest corpus で「同 id 衝突下の contains」がどれだけ実発生するかの evidence を待ってから実装 ADR に昇格する。案 A の全 kind multimap が案 B の解決基盤を兼ねるので、A を先に入れておくこと自体が B の下ごしらえになる。

**過去 ADR との整合**: 本設計は #2036 として明示に切り出された follow-up であり、既存決定と矛盾しない。むしろ同方向:

- [ADR-20260513-03](../adr/20260513-03-import-system-nested.md) は bare-id 再帰検索・hybrid を**却下**し「明示 path で曖昧解消」を採用 → 案 B の「明示修飾で解く」と同方向。
- [ADR-20260714-01](../adr/20260714-01-cross-domain-ghost-entities.md) は first-match bare 解決を**却下** → 案 A（bare 多重一致を警告）・案 B（修飾で解決）と同方向。nested-domain 修飾子 `Parent.Child.Entity` を v2 に deferred しており、案 B の最小接尾辞パスと隣接。
- `namespace` 語彙は [ADR-20260711-03](../adr/20260711-03-system-view-group-by-team.md) L57 / P2b [`system-view-grouping.md`](./system-view-grouping.md) L240 で**却下済み**。却下原文は「`payments.Billing` のように id を修飾するゆえ却下」で、案 B の `Checkout.Payment` と**表層形が同一**なので先回りして線を引く: 却下されたのは **宣言サイトで identity を name-scope 化する**こと（id そのものを `payments.Billing` に変える＝過剰約束）。案 B は **参照サイトの曖昧解消**で、既採択の `DomainId.EntityId`（syntax.md:590）と同型・**identity は bare flat id のまま不変**。同じ表層形でも「id を修飾する（却下）」対「参照を修飾する（既採択）」は別物。この区別を実装 ADR で明示すること。

### 実装の指針

**Phase A（先行・gate 外）— `contains-target-ambiguous`**

1. `collectContainableIds`（`parser.ts:2240`）を `Map<string, { kind, path }[]>` に多値化。
2. `validateContainsReferences`（`parser.ts:2220`）で `length > 1` → `contains-target-ambiguous` emit（`length===0` は既存 not-found を維持）。
3. `DiagnosticParamsByCode`（`ast.ts:555` 近傍）に `"contains-target-ambiguous": { memberId: string; locations: string[] }` を追加。
4. `render-diagnostic.ts` に case 追加（exhaustive switch の `never` ガードが強制）。
5. i18n: `packages/i18n/src/types.ts`（`containsTargetNotFound` ~L420）に新キー `diagnostic.containsTargetAmbiguous.message` の**型宣言**を追加し、`en.ts`（必須）+ `ja.ts`（推奨）にエントリを追加。
6. `diagnostics.md` + `diagnostics.ja.md` の Cross-reference resolution family に行追加。
7. テスト: `parser.test.ts`（発火/非発火、[TPL-20260615-02](../test-perspectives/TPL-20260615-02-diagnostic-absence-assertion-scope-severity.md) の severity スコープ）、`render-diagnostic.test.ts`、`packages/core/src/types/diagnostics-catalog.test.ts`（en/ja 両 doc の completeness）。
8. changeset: `@karasu-tools/core` + `karasu` を **minor**（新診断 = 利用者から見える挙動追加）。CLI（`karasu`）は core を devDep でバンドルするため changeset は **cascade しない** — だからこそ `.claude/rules/changesets.md` どおり両パッケージを明示的に名指す。
9. spec: `syntax.md` の boundary 節に「同 id に一致する曖昧な `contains` は `contains-target-ambiguous` 警告」を 1 文追記し、章末 `> Related TPLs:` に既存 TPL を back-ref（CLAUDE.md「spec 新規記述 PR は proactive TPL 最低 1 件 or 既存 back-ref」）。
10. `owns-target-ambiguous` の要否を `node-id-multiple-locations` の二重発火を見て判断（任意）。
11. AT: `docs/acceptance/` に新規（下記 AT 案）。

**Phase B（後続・ADR gate 通過後）— qualified `contains`**

1. 文法: `contains` 引数を dotted path 受理（`ImportIdPath` 流用）、AST `BoundaryBlock.contains` を `string[]` → path 保持形へ。
2. resolver: 案 A multimap + 接尾辞パスフィルタ + identity 比較（view-extract template）。
3. `boundaryIndex` 再キー（B-i / B-ii、未解決）。
4. spec: `syntax.md` に qualified `contains` 節（`> Related TPLs:` back-ref 付き）、examples 追加。
5. 実装 ADR 昇格 + 本 Design Doc 削除。changeset: core + karasu **minor**（後方互換追加）。

### 影響範囲・マイグレーション

- **既存ユーザーへの影響**: 案 A は新 warning のみ（既存 .krs は挙動不変、同 id 衝突を持つモデルにだけ warning が増える）。案 B は bare 継続で完全後方互換。
- **ドキュメント更新**: `docs/spec/syntax.md`（+ja、boundary 節）、`docs/spec/diagnostics.md`（+ja、新コード行）。concepts は不変（fact-vs-style 表に追加不要 — warning であって info ではない）。
- **テスト・examples**: examples は不変（Phase A）。Phase B で qualified contains の example を 1 本追加しうる。

## 却下・非目標

- **identity = path 化**: bare-id 参照と permalink deep anchor（`#krs-<view>-<id>`、leaf id 依存、[ADR-20260630-01](../adr/20260630-01-permalink-deep-element.md)）を壊す。**却下**。
- **hard global id 一意性の強制**: entity の warning 級一意（`entity-anchor-collision`、[ADR-20260715-01](../adr/20260715-01-domain-entity-modeling.md)）・親が違えば同 id が共存する既存 scope（`duplicate-node-id-parent` は sibling 限定、[ADR-20260513-03](../adr/20260513-03-import-system-nested.md) L36）と矛盾。**却下**。
- **cross-system 修飾 `contains`**: v1 out of scope（P2b [`system-view-grouping.md`](./system-view-grouping.md) L342、entity cross-system 制限 syntax.md:602）。
- **`namespace` 語彙 / 宣言サイトの identity name-scope 化**: [ADR-20260711-03](../adr/20260711-03-system-view-group-by-team.md) L57 / P2b L240 で却下済み（id を `payments.Billing` に修飾する＝過剰約束）。案 B は**参照サイト**の曖昧解消で id・identity を変えないため別物（表層形 `Checkout.Payment` は同じでも意味が違う）。**却下**（宣言サイト側のみ）。
- **edge endpoint の同 id 曖昧解消**: 同根（probe 3）だが本設計スコープ外。将来 membership resolver を edge に一般化しうる、と記録するに留める。
- **`contains` を illegal 化・bare 参照の禁止**: しない。bare は曖昧でない限り正当な簡単形。

## promotion gate 整理（[ADR-20260713-01](../adr/20260713-01-notation-promotion-gate.md)）

- **案 A**: notation 非変更（診断追加のみ）→ **gate を発火させない**。gate の対象は notation/構文であり（[ADR-20260713-01](../adr/20260713-01-notation-promotion-gate.md)）、診断のみの変更が gate 外であることは [ADR-20260717-01](../adr/20260717-01-boundary-drilldown-grouping.md) L52（within-experimental の挙動/診断変更 = 通常の minor）が先例。`boundary` は experimental のまま据え置き（診断が付いても stable 昇格ではない）。
- **案 B**: 文法追加（experimental notation の拡張）→ **gate 対象**。karasu-nest corpus（[#1783](https://github.com/kompiro/karasu/issues/1783)）で「同 id 衝突下の contains」の実利用 pain を観測してから実装。後方互換な追加なので昇格時は v1.x minor 想定。

## TPL

**引用（doc 中で参照済み）**

- [TPL-20260714-01](../test-perspectives/TPL-20260714-01-cross-domain-entity-reference-qualified.md) — 案 B の直接先例（bare = intra 専用 / 修飾 = cross、bare を勝手に cross 解決しない）。endpoint-key 整合の failure（#3）は `boundaryIndex` 再キーの注意点。
- [TPL-20260512-01](../test-perspectives/TPL-20260512-01-composite-key-must-cover-all-distinguishing-dimensions.md) — 区別属性（path）をキーに含めよ。案 B (B-i) 全 path キー化の構造的根拠、silent last-write-wins の一般形。
- [TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md) — 受理語彙は「効果 / 警告 / open-set 明文化」のいずれか。曖昧 contains は「意図せぬ効果」= 警告側に倒す（案 A の register 根拠）。派生元 spec に boundary 節あり。
- [TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md) — `contains-target-ambiguous` は欠陥（warning）であって流派 smell（info）ではない。
- [TPL-20260615-02](../test-perspectives/TPL-20260615-02-diagnostic-absence-assertion-scope-severity.md) — 診断不在 assert は severity で絞る（案 A のテスト流儀）。
- [TPL-20260623-02](../test-perspectives/TPL-20260623-02-validation-target-set-enumerates-all-kinds.md) — valid-target 集合は全 kind 列挙。multimap も `collectContainableIds` の全 kind 集合を踏襲。

**新規 proactive TPL — 本ブランチでは起こさない（判断と理由）**

候補となる原則は「**フラット名前空間の bare-id 参照解決は >1 ノードの曖昧性を検出し surface する（contains / owns / boundaryIndex / edge endpoint が bare id で silent に過剰一致・単一勝者化する穴）**」。これは probe で 3 site 実証した cross-cutting invariant で、既存 TPL の `known_consumers` は誰もこの解決 site を守っていない（TPL-20260714-01 は view-extract/layout、TPL-20260512-01 は style-resolver）。しかし本ブランチで起票しない:

1. **双方向 spec back-ref が完成しない** — proactive TPL の規約（spec 章末 `> Related TPLs:` ↔ TPL「派生元 spec」の相互リンク）は、`syntax.md` に該当節を追加する**実装 PR** でしか閉じられない。本 PR は docs/design のみ。
2. **母体 P2b design doc の deferral 先例** — [`system-view-grouping.md`](./system-view-grouping.md) L357 は同様に「新規 proactive TPL は起こさず既存を back-ref、要否は実装時に最終判断」とした（#1939 の「既存原則の適用範囲拡大なら新規 TPL 不要」）。
3. **design-doc の proactive TPL trigger に当たらない** — CLAUDE.md のそれは「**設計が違反しうる**未 TPL 原則」を対象とするが、本設計は当該原則を**uphold する側**（違反ではなく是正）。

→ **実装 PR で** 上記 invariant の proactive TPL を起票（or TPL-20260714-01 を当該 syntax 節に back-ref）することを推奨。ドラフト: title「bare-id 参照解決はフラット名前空間の >1 ノード曖昧性を検出する」、known_consumers = `buildBoundaryIndex` / `validateContainsReferences` / `nodePathIndex` / `computeEdgePoints`、related_to = TPL-20260714-01 / TPL-20260512-01。

## AT 案（人間の目視が必要な項目のみ、実装 PR で `docs/acceptance/` に起票）

- **案 A / app**: 同 id 衝突を持つ `index.krs`（service `Payment` + 別 service 配下 domain `Payment` + `boundary b { contains Payment }`）を開き、WarningPanel に `contains-target-ambiguous` が **warning severity** で 1 件出て、両ノードの path（locations）が読めること（目視）。
- **案 B / app**: `contains Checkout.Payment` と修飾すると、drill `Checkout` で domain `Payment` **だけ**が枠に入り、root の service `Payment` は枠外になること。warning が消えること（目視）。

## 未解決の問い / 決めないこと

- **`boundaryIndex` 再キー方式**（B-i full-path キー vs B-ii 混在フォールバック）— 実装コストと [TPL-20260714-01](../test-perspectives/TPL-20260714-01-cross-domain-entity-reference-qualified.md)/[TPL-20260512-01](../test-perspectives/TPL-20260512-01-composite-key-must-cover-all-distinguishing-dimensions.md) 整合リスクのトレードオフ。案 B 実装時に決める。
- **既存ドリフト（実装 PR で拾う）**: `duplicate-boundary-id` は syntax.md L1004 が error と記すが diagnostics.md / 実装に未登録（completeness テストは code→doc 方向のみ保証、doc→code は非保証）。本設計の責任外だが、Phase A で diagnostics.md に触れるついでに拾うとよい。
- **最小修飾スコープの正確な解決規則** — 接尾辞パス一致（`Checkout.Payment`）か、import 流の top-level 起点 walk（`Shop.Checkout.Payment`）か、両対応か。entity は 2 セグメント、import は system 起点。`contains` はどれを canonical にするか。
- **edge endpoint への将来波及** — 同根（probe 3）。本設計スコープ外だが、membership resolver を一般化するときに再訪。
- **multi-file（[#2032](https://github.com/kompiro/karasu/issues/2032)）との解決順序** — qualified path 解決が merge 後 tree に依存する点の相互作用。
