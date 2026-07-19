# 層をまたぐノード指定方法の定義 — membership 参照の修飾記法

- **日付**: 2026-07-18
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2036](https://github.com/kompiro/karasu/issues/2036)（parent [#1822](https://github.com/kompiro/karasu/issues/1822) comprehension）／設計 PR: [#2058](https://github.com/kompiro/karasu/pull/2058)
  - carve-out 先: [#2065](https://github.com/kompiro/karasu/issues/2065)（cross-cutting concern labeling — user-defined tag の領分）
  - 顕在化元: [#1983](https://github.com/kompiro/karasu/issues/1983) / [#2034](https://github.com/kompiro/karasu/issues/2034)（drill-down grouping 正規化 → [ADR-20260717-01](../adr/20260717-01-boundary-drilldown-grouping.md)）
  - 関連 Issue: [#2032](https://github.com/kompiro/karasu/issues/2032)（cross-file contains の偽 not-found — 同じ contains 解決経路）
  - notation の母体（設計）: [`system-view-grouping.md`](./system-view-grouping.md)（P2b `boundary`/`contains`、status: 部分昇格）
  - 関連 ADR: [ADR-20260513-03](../adr/20260513-03-import-system-nested.md)（import path `A.B.C` — 明示 path で曖昧解消、本設計の主論拠）、[ADR-20260714-01](../adr/20260714-01-cross-domain-ghost-entities.md)（cross-domain entity 修飾参照 — 同方向の先例）、[ADR-20260404-09](../adr/20260404-09-cross-system-service-references.md)（cross-system `SystemId.ServiceId`）、[ADR-20260715-01](../adr/20260715-01-domain-entity-modeling.md)（entity id のフラット名前空間）、[ADR-20260630-01](../adr/20260630-01-permalink-deep-element.md)（permalink deep anchor = leaf id）、[ADR-20260711-03](../adr/20260711-03-system-view-group-by-team.md)（`namespace` 語彙却下）、[ADR-20260713-01](../adr/20260713-01-notation-promotion-gate.md)（notation promotion gate）、[ADR-20260715-02](../adr/20260715-02-expand-all-services-in-place.md)（expand-all — group-by と排他）
  - 関連 TPL: [TPL-20260714-01](../test-perspectives/TPL-20260714-01-cross-domain-entity-reference-qualified.md)、[TPL-20260512-01](../test-perspectives/TPL-20260512-01-composite-key-must-cover-all-distinguishing-dimensions.md)（案 B）／[TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md)、[TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md)、[TPL-20260615-02](../test-perspectives/TPL-20260615-02-diagnostic-absence-assertion-scope-severity.md)、[TPL-20260623-02](../test-perspectives/TPL-20260623-02-validation-target-set-enumerates-all-kinds.md)（案 A）
  - コード: `packages/core/src/parser/parser.ts`（`contains` `:1797` / `owns` `:1857` の単一 Identifier 受理、`collectContainableIds` / `buildNodePathIndex`）、`packages/core/src/view/view-extract.ts`（`resolveQualifiedEntity` / `buildDomainEntityIndex`）、`packages/core/src/renderer/layout.ts`（`groupIdOf` / `buildGroupFrames`）

## 背景・課題

### 課題ではないもの — 層をまたぐ id 衝突は正当

まず前提を正す。**service `Payment` と別 service 配下の domain `Payment` が共存すること自体は完全に正当で、許容される**。`duplicate-node-id-parent`（error）が sibling（同一親直下）でのみ発火するのは**意図した設計**であって穴ではない — karasu のモデリングでは同名 id の意図的な共存が珍しくない（システム移行で新旧 system が同じ `OrderService` を持つ、マルチテナントで `TenantA.Billing` / `TenantB.Billing` を並べる、`Order` / `Catalog` のような一般ドメイン名が複数 system に登場する。[ADR-20260513-03](../adr/20260513-03-import-system-nested.md) L36）。

> **前版からの撤回**: 本 doc の以前の版は、この衝突を「sharp edge」「曖昧性＝欠陥」と位置づけていた。これは**誤った問題設定**であり撤回する。衝突は言語が許す正当な構造である。

### 真の課題 — 異なる層のノードを識別する「指定方法」が言語に無い

課題は衝突そのものではなく、**同 id が複数層にあるとき「どれを指すか」を書き分ける手段が言語に定義されていない**ことにある。`contains` / `owns` は **bare id しか受け付けない**（`parser.ts:1797` の `contains.push(this.advance().value)`、`parser.ts:1857` の `properties.owns.push(this.advance().value)` — いずれも単一 Identifier トークンを 1 つ消費するだけ）。

compile probe で確認した（本設計で実行）:

| 書きたい形 | 今日の結果 |
| --- | --- |
| `contains Checkout.Payment` | **parse error** — `unexpected-token-in-block({blockKind:"boundary", tokenType:"Dot"})` + 続く `Identifier "Payment"` も stray |
| `owns Checkout.Payment` | **parse error** — 同型（`blockKind:"team"`） |
| `contains Payment`（bare） | 通る。ただし**どの層の `Payment` かは書けない** |
| `Order -> Customers.Customer`（entity 関連） | **診断ゼロで通る** — 同じドット形が別の参照サイトでは正規の記法 |

**同じドット形が、entity 関連サイトでは正規の記法なのに membership 参照サイトでは parse error になる。** これが本設計の解くべき gap である。

### 記述性 — ドット記法は文脈ごとに散在し、membership にだけ無い

karasu には既に「ノードを修飾して指す」記法が複数の文脈に存在するが、**membership 参照サイトにだけ無い**:

| 文脈 | 記法 | 出典 | membership で使えるか |
| --- | --- | --- | --- |
| entity 関連（cross-domain） | `DomainId.EntityId` | syntax.md:595、[TPL-20260714-01](../test-perspectives/TPL-20260714-01-cross-domain-entity-reference-qualified.md) | — |
| cross-system 参照 | `SystemId.ServiceId` | [ADR-20260404-09](../adr/20260404-09-cross-system-service-references.md) | — |
| 物理マッピング | `InfraId.SubId`（`table OrderDB.orders`） | syntax.md:567 | — |
| import path | `A.B.C` | [ADR-20260513-03](../adr/20260513-03-import-system-nested.md)、syntax.md:1154 | — |
| **membership（`contains` / `owns`）** | **無し（bare id のみ）** | `parser.ts:1797` / `:1857` | **✗ parse error** |

**ノードの指定方法を文脈ごとに揃えないと、人間はうまく記述できない。** 著者は entity 関連で `Customers.Customer` と書けるのに、boundary member では同じ発想が通じない。本設計の主動機はこの**言語としての一貫性の回復**であり、衝突の回避策ではない。

### boundary が「描ける」範囲 — 指定方法の定義とは別問題

深さバラバラの members を持つ boundary は、view ごとに別フレームへ**断片化**する（compile 実測、distinct id・診断ゼロ）:

```krs
system Shop {
  service CardVault {}                      // root
  service Billing {}                        // root
  service Checkout { domain Payment {        // drill: Checkout
    usecase Authorize                        // drill: Checkout>Payment
    usecase Capture
  } }
}
boundary pci "PCI" { contains CardVault contains Billing contains Payment contains Authorize contains Capture }
```

| view | `__group_pci__` frame | framed members |
| --- | --- | --- |
| root system view | 出る | `CardVault`, `Billing` |
| drill: `Checkout` | 出る | `Payment` |
| drill: `Checkout > Payment` | 出る | `Authorize`, `Capture` |

boundary は「同一 view に co-render する peer をまとめる」**視覚グルーピング軸**であり（[ADR-20260717-01](../adr/20260717-01-boundary-drilldown-grouping.md) の正規化）、**cross-kind・same-level は可／cross-depth は 1 枠にならない**。加えて expand-all-services（[ADR-20260715-02](../adr/20260715-02-expand-all-services-in-place.md)）は group-by と排他（`useSystemView.ts:276,299` の `expandedContainers: groupBy !== "none" ? undefined : expandedContainers`）。

> **位置づけの訂正**: これは **boundary が *描ける* 範囲の scoping** であって、**指定方法を定義しない根拠ではない**。前版はこの事実を案 B（修飾記法）却下の論拠に使っていたが、その論理は誤りなので削除する。「**描画の範囲**」と「**指定方法の定義**」は別問題である — 修飾記法は「どのノードを指すか」を言語に与えるものであり、そのノードが同一 view に描かれるかどうかは boundary 側の描画セマンティクスが決める。cross-cutting concern（PCI 等）のラベリングは boundary ではなく tag の領分（[#2065](https://github.com/kompiro/karasu/issues/2065)）という結論も維持する。

## 現状（インベントリ）

### bare id しか受けない参照サイト（同じ gap、フェーズを分けて揃える）

| 参照サイト | 現状の指定方法 | 実装 | 同 id が複数層にあるとき |
| --- | --- | --- | --- |
| `contains` | bare id のみ | `parser.ts:1797`／`buildBoundaryIndex` `Map<id, boundaryId>`（`:2030`）／`groupIdOf(n.id)`（`layout.ts:1056`）→ `buildGroupFrames` が **一致する全ノードを枠取り**（`layout.ts:82`） | どれを指すか書けない（全一致が枠に入る） |
| `owns`/team | bare id のみ | `parser.ts:1857`／`nodePathIndex` `Map<id, path>`（**単一勝者・lossy**、`:2068-2170`）／`ownerIndex` → 同じ `groupIdOf(n.id)` | どれを指すか書けない |
| edge `from`/`to` | bare id（cross-system の `SystemId.ServiceId` のみ例外） | `layoutNodes.get(edge.from)`（`layout.ts:2042`、単一勝者） | どれを指すか書けない（silent に 1 勝者） |

`contains` の存在チェック（`validateContainsReferences` `parser.ts:2220`）は `collectContainableIds`（`:2240`）に対して行うが、後者は **`Set<string>`** なので同 id を 1 エントリに畳み、**多重性を観測すらできない**。

### 既存の識別モデル（本設計の土台）

| 語彙 | 一意性 severity | 曖昧解消手段 | 出典 |
| --- | --- | --- | --- |
| sibling id（同一親直下） | **error**（`duplicate-node-id-parent`） | — | diagnostics.md:76 |
| system 内 node id | **error**（`duplicate-node-in-system`） | — | diagnostics.md:78 |
| `DomainId`（system 内） | **error**級一意 | — | syntax.md:600-602 |
| entity id / domain id（anchor 名前空間） | **warning**（`entity-anchor-collision`） | `DomainId.EntityId` ドット | syntax.md:618-622、[ADR-20260715-01](../adr/20260715-01-domain-entity-modeling.md) |
| node id 全域 | **強制しない**（意図的共存を許す） | import path `A.B.C` | syntax.md:1154-1183、[ADR-20260513-03](../adr/20260513-03-import-system-nested.md) |

**この表が示すのは「一意性を強めよ」ではなく「一意でないところには修飾で指す道が用意されている」**という既存の設計方針である。membership だけがその道を持たない。

## 制約・前提

- **層をまたぐ id 衝突は正当**。global 一意性を強制しない（本設計の出発点）。
- **identity = author-given bare flat id を変えない**。修飾は**参照サイト**の記法であって identity の再定義ではない（permalink deep anchor `#krs-<view>-<id>` は leaf id 依存、[ADR-20260630-01](../adr/20260630-01-permalink-deep-element.md)）。
- **後方互換**: bare id は一意に解決できる限り従来どおり有効（既存 `.krs` を壊さない）。
- **boundary = view 内 peer grouping 軸**（描画範囲の scoping）。指定方法の定義とは独立。
- 案 B は**文法追加 → promotion gate 対象**（[ADR-20260713-01](../adr/20260713-01-notation-promotion-gate.md)）。案 A は文法非変更 → gate 外。

## 検討した選択肢

### 案 B（主軸）: membership 参照の修飾ドットパス — ノード識別方法の言語定義

**位置づけ**: 衝突の回避策ではなく、**「任意の層のノードをどう指すか」の言語定義**。既存の散在するドット記法を membership 参照サイトにも揃える。

**規定**

- **bare id = 一意に解決できるときの簡約形**（既存互換。import bare / entity bare intra と一貫、syntax.md:1183）。
- **修飾ドットパス = 任意の層のノードを指せる正準形**。深さは **最小の disambiguating 接尾辞パス**（`DomainId.EntityId` の grain に倣い full path 強制でない）。`Payment` が曖昧なら `Checkout.Payment`、まだ曖昧なら祖先を足す。
- **identity は bare flat id のまま不変**。

**文法**: `contains` / `owns` の引数を `Identifier ("." Identifier)*` に拡張。parser は既に import で `Identifier (Dot Identifier)*` を `ImportIdPath` として受理しているので流用でき（[ADR-20260513-03](../adr/20260513-03-import-system-nested.md)）、`parser.ts:1797` / `:1857` の「単一 `advance()`」を path 受理に置き換える。AST の `BoundaryBlock.contains` / `team.properties.owns` を `string[]` → path 保持形へ。

**解決**: `collectContainableIds`（`parser.ts:2240`）を **`Set<string>` → `Map<string, { kind, path }[]>`**（全 kind の multimap）に多値化し、修飾参照の**接尾辞パス照合**で絞り込む → 一意なら解決ノードを得る。`nodePathIndex`（`:2068`）は service/domain/client のみ + 単一勝者なので流用不可。

**既存 resolver の位置づけ（正直に）**: `resolveQualifiedEntity`（`view-extract.ts:1126-1138`）は `target.indexOf(".")` の **1 回分割＝固定 2 segment**、`buildDomainEntityIndex`（`:1101-1118`）は **domain id first-wins**（`:1106` の `!index.has(node.id)`）。「参照サイトで scope 解決しノード identity で比較する」**方式**の先例ではあるが、**多 segment 接尾辞・全 kind への一般化は本設計の新規実装**である。

**`boundaryIndex` の再キー**（案 B の中核実装コスト）: 現状 `Map<id, boundaryId>` を `groupIdOf(n.id)`（bare id）で引くため、修飾 member が指す「特定の 1 ノード」を表せない。選択肢:

- **(B-i) full-path キー化**: `Map<pathKey, boundaryId>` にし `groupIdOf` も node の full path で引く。根本的（[TPL-20260512-01](../test-perspectives/TPL-20260512-01-composite-key-must-cover-all-distinguishing-dimensions.md): 区別属性 = path をキーに入れる）だが全 layout 経路に path を通す必要。
- **(B-ii) 混在フォールバック**: bare member は現行 bare-id index、修飾 member だけ path キー index に置き `groupIdOf` で層別参照。軽いが bare/修飾でキー系が割れる整合リスク（[TPL-20260714-01](../test-perspectives/TPL-20260714-01-cross-domain-entity-reference-qualified.md) failure #3 と同型）。

**適用範囲（文脈ごとに揃える原則）**: 指定方法は**言語として一つに定義し、参照サイト間で揃える**。主対象は `contains` / `owns`。**edge（`A -> B` の from/to）も同じ gap を持つ**（bare が silent に 1 勝者、`layout.ts:2042`）ので**同じ定義の適用対象**であり、切り捨てない。ただし**適用順は段階的**（edge は後続フェーズ or 別 Issue）。

**その他**: permalink anchor identity 不変。collapse は group id キーで member 記法と独立。diff grouping は system root のみ。multi-file は [#2032](https://github.com/kompiro/karasu/issues/2032) と同経路（修飾は cross-file の同 id を著者が解く手段にもなる）。

**メリット**

- 散在するドット記法を membership に揃え、**言語としての一貫性を回復**する（記述性の主動機）。
- 任意の層のノードを**指せるようになる**（今日は書く手段自体が無い）。
- 新語彙ゼロ・identity 不変・bare 後方互換。

**デメリット**

- 文法追加 → promotion gate 対象。
- `boundaryIndex` 再キーが非自明。
- 最小接尾辞パスの解決規則を新規に定義する必要（下記 未解決）。

### 案 A（従属）: 未解決参照の解決指示診断

**位置づけの変更**: 「id 衝突の警告」**ではなく**、「**参照が under-specified で一意に解決できない → 修飾形で書け**」という**解決指示**の診断。`locations` 出力が**そのまま書くべき修飾子**を提示するため、karasu で初めて **fix を伴う診断**になる。

- **診断コード**: `contains-target-ambiguous` / `owns-target-ambiguous`（コード名は維持）。**parser Diagnostic チャネル**（`contains-target-not-found` の隣。`DiagnosticParamsByCode` `ast.ts:555` → `render-diagnostic.ts` の exhaustive switch → `en.ts`/`ja.ts` → `diagnostics.md` カタログ）。
- **severity**: **warning**（[TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md)）。衝突は事実（正当）だが、**参照が意図した 1 ノードに解決しない**のは著者が直すべき欠陥。`contains-target-not-found` と同格。
- **発火条件**: member id が **>1 の declared node に一致**するとき（＝ bare では一意解決できない）。別 member id が別レベルに散るのは正常なので、判定は**単一 member id の多重性**のみ。
- **検出層**: `validateContainsReferences`（`parser.ts:2220`）。案 B と**同じ multimap** を消費する（`length===0` → 既存 not-found、`===1` → OK、`>1` → ambiguous）。
- **params**: `{ memberId: string; locations: string[] }`（各一致ノードの path。例 `["Shop.Payment", "Shop.Checkout.Payment"]` — 案 B 出荷後はこれがそのまま書ける修飾子）。
- **i18n**（[i18n.md](../spec/i18n.md): en 必須 / ja 推奨）:
  - `packages/i18n/src/types.ts` に両キーの**型宣言**（`containsTargetNotFound` が宣言される ~L420 の隣。無いと `t(...)` と en/ja が型チェックを通らない）。
  - `render-diagnostic.ts` に `case "contains-target-ambiguous": return t("diagnostic.containsTargetAmbiguous.message", d.params);`
  - en 案（案 B 出荷後）: `` `boundary member "${memberId}" is under-specified — it matches ${n} nodes (${locations}). Write it qualified (e.g. "${first}") to pick one.` ``
  - ja 案（同）: `` `boundary メンバー "${memberId}" は指定が不足しています — ${n} 個のノード（${locations}）に一致します。修飾形（例 "${first}"）で書いて 1 つに絞ってください。` ``
- **`owns-target-ambiguous`**: `owns` も同 gap。既存 `node-id-multiple-locations`（warning, emit `parser.ts:2132`）は **非 domain 枝でしか発火せず service/service しか拾わない**（domain 枝 `parser.ts:2106-2138` は診断なしで上書き）ため、scope は **残余集合**（service 対 domain / domain 分散）に絞り二重発火を避ける。`owns` 検証が使う `nodePathIndex` は単一勝者・lossy で多重性を見られないので、multimap を **owns 対象 kind**（service/domain/client + top-level infra）に絞って別途構築し `validateOwnsReferences`（`parser.ts:2188`）で判定する。
- **catalog**: `diagnostics.md` + `diagnostics.ja.md` の Cross-reference resolution family に 2 行追加。completeness を強制するのは `packages/core/src/types/diagnostics-catalog.test.ts`（`DiagnosticParamsByCode` + `WarningKind` の全メンバが両 doc の backtick 記載を持つまで fail。code→doc 方向のみ保証）。
- **テスト**: `parser.test.ts`（発火/非発火）。診断不在 assert は severity で絞る（[TPL-20260615-02](../test-perspectives/TPL-20260615-02-diagnostic-absence-assertion-scope-severity.md)）。`render-diagnostic.test.ts`・`diagnostics-catalog.test.ts`。

### 案 C（却下）: in-context membership（node 側に所属を書く）

「membership を宣言サイト（node）に in-context で書く」着想。**却下**（詳細は「却下・非目標」）。洞察は cross-cutting tag として [#2065](https://github.com/kompiro/karasu/issues/2065) へ転用する。

## 比較

| 観点 | 案 B（修飾記法＝言語定義） | 案 A（解決指示診断） |
| --- | --- | --- |
| 解く問題 | **任意の層のノードを指す手段が無い** | 指定不足を検出し修飾形へ誘導 |
| 文法変更 | あり（`contains`/`owns` に dotted path） | なし |
| promotion gate | **対象** | 外（[ADR-20260717-01](../adr/20260717-01-boundary-drilldown-grouping.md) L52 先例） |
| 後方互換 | 完全（bare 継続、修飾は opt-in の追加） | 完全（新 warning のみ） |
| 単独で成立するか | する（診断が無くても書けるようになる） | **しにくい**（修飾形が無いと fix を提示できない） |
| 依存 | — | 案 B があって初めて「fix を伴う診断」になる |

## 現時点の方針

**案 B（membership 参照の修飾ドットパス）を主軸として採用し、案 A（解決指示診断）を従属の companion として併走させる。**

- 主動機は **記述性・言語一貫性の回復** — 既に `DomainId.EntityId` / `SystemId.ServiceId` / `InfraId.SubId` / import `A.B.C` と 4 文脈にドット記法があるのに membership だけ bare 縛りで、著者が「どの層の `Payment` か」を書けない。指定方法は文脈ごとに揃える。
- **`duplicate-node-id-parent` の sibling 限定は維持**（衝突は正当）。本設計は一意性を強めるのではなく、**一意でないところを指す道を用意する**既存方針（上記識別モデル表）の membership への適用である。
- 案 A は単独でも gate 外で出荷できるが、**修飾形が無いうちは「直し方」を提示できない**。よって出荷順は下記のとおり扱う。

### 出荷順（sequencing）

1. **案 B が gate を通るなら 案 A + 案 B を同一 minor で co-ship** するのが最良 — 診断が最初から書ける fix を提示できる。
2. **案 B が corpus evidence 待ちで遅れる場合**は案 A を先行出荷してよいが、**文言を段階化**する（案 B 前は「id が一意になるよう改名するか member を外す」、案 B 後に「修飾形で書く」へ更新）。診断が実行不能な助言を出さないための措置。
3. **edge への適用は後続フェーズ**（or 別 Issue）。定義は同一、適用順のみ段階的。

### 実装の指針

**案 B（文法 + 解決）**

1. lexer/parser: `contains`（`parser.ts:1797`）/ `owns`（`:1857`）の単一 `advance()` を `Identifier (Dot Identifier)*` 受理へ（import の `ImportIdPath` を流用）。AST を path 保持形に。
2. `collectContainableIds`（`:2240`）を全 kind の `Map<string, { kind, path }[]>` に多値化。
3. 接尾辞パス照合で修飾参照を解決（一意なら解決ノード、0 なら not-found、>1 なら ambiguous）。
4. `boundaryIndex` 再キー（B-i / B-ii、未解決）。`ownerIndex` も同様に扱う。
5. spec: `syntax.md` に「ノード参照の指定方法（bare 簡約形 / 修飾正準形）」節を追加（+ja）、章末 `> Related TPLs:` back-ref。examples を 1 本追加。
6. changeset: `@karasu-tools/core` + `karasu` を **minor**（後方互換な文法追加）。

**案 A（診断）**

1. `validateContainsReferences`（`:2220`）で `>1` → `contains-target-ambiguous`。owns 対象 kind に絞った multimap で `validateOwnsReferences`（`:2188`）→ `owns-target-ambiguous`（残余集合 scope）。
2. `DiagnosticParamsByCode`（`ast.ts:555` 近傍）に `{ memberId, locations }` / `{ ownedId, locations }` を追加。
3. `render-diagnostic.ts` に case 追加（exhaustive switch の `never` ガードが強制）。
4. i18n: `packages/i18n/src/types.ts`（~L420）に型宣言 → `en.ts`（必須）+ `ja.ts`（推奨）。
5. `diagnostics.md` + `diagnostics.ja.md` に 2 行、`diagnostics-catalog.test.ts` が completeness を強制。
6. テスト（上記）。changeset: core + karasu **minor**。CLI（`karasu`）は core を devDep でバンドルするため changeset は **cascade しない** — だからこそ `.claude/rules/changesets.md` どおり両パッケージを明示的に名指す。
7. AT: `docs/acceptance/` に新規（下記）。

### 影響範囲・マイグレーション

- **既存ユーザー**: bare は一意な限り従来どおり（挙動不変）。同 id が複数層にあるモデルにだけ warning が増え、修飾形で解消できるようになる。
- **ドキュメント**: `docs/spec/syntax.md`（+ja、ノード参照の指定方法節 / boundary 節）、`docs/spec/diagnostics.md`（+ja、新コード 2 行）。
- **examples**: 案 B で修飾形の例を 1 本追加しうる。

## 却下・非目標

- **hard global id 一意性の強制**: **却下**（本設計で特に重要）。層をまたぐ衝突は**正当**であり、一意性を強めるのは既存の段階 severity（entity は warning 級一意 [ADR-20260715-01](../adr/20260715-01-domain-entity-modeling.md)、sibling のみ error）と意図的な同 id 共存（[ADR-20260513-03](../adr/20260513-03-import-system-nested.md) L36）に真っ向から反する。本設計は**衝突を許したまま指す手段を与える**方向。
- **identity = path 化**: 却下。bare-id 参照と permalink deep anchor（leaf id 依存、[ADR-20260630-01](../adr/20260630-01-permalink-deep-element.md)）を壊す。修飾は**参照サイト限定**。
- **`namespace` 語彙 / 宣言サイトの identity name-scope 化**: [ADR-20260711-03](../adr/20260711-03-system-view-group-by-team.md) L57 / [`system-view-grouping.md`](./system-view-grouping.md) L240 で却下済み（id そのものを `payments.Billing` に修飾する＝過剰約束）。**案 B は参照サイトの指定方法定義であって宣言サイトの id 再定義ではない** — 表層形が似ていても別物であり、この区別は実装 ADR で明示する。
- **案 C（in-context membership）**: 却下。「node 側に所属を書く」着想自体は正しかったが、**in-context で宣言すべきは "boundary membership" ではなく "cross-cutting tag/属性"** だった（PCI は各 node に tag を付ける話）。boundary membership の in-context 化としては却下し、tag の議論は [#2065](https://github.com/kompiro/karasu/issues/2065) へ。
- **cross-cutting concern を boundary で表現する**: 非目標。per-element 属性 = tag の領分（既存 `[...]` system-defined / `@...` annotation は別概念）。定義方法・concern overview の要否は [#2065](https://github.com/kompiro/karasu/issues/2065)。
- **boundary で cross-depth を 1 枠に描く**: 描画としては成立しない（上記 probe）。ただし**これは指定方法を定義しない根拠ではない**。

## promotion gate 整理（[ADR-20260713-01](../adr/20260713-01-notation-promotion-gate.md)）

- **案 A**: notation 非変更（診断のみ）→ **gate を発火させない**。gate の対象は notation/構文であり、診断のみの変更が gate 外であることは [ADR-20260717-01](../adr/20260717-01-boundary-drilldown-grouping.md) L52（within-experimental の挙動/診断変更 = 通常の minor）が先例。
- **案 B**: 文法追加 → **gate 対象**。ただし正当化は corpus evidence 一辺倒ではない。**既存ドット記法との整合を回復する**という言語一貫性の論拠を併記する: [ADR-20260513-03](../adr/20260513-03-import-system-nested.md) は bare-id 再帰検索・hybrid を**却下**して「明示 path で曖昧解消」を採用し、[ADR-20260714-01](../adr/20260714-01-cross-domain-ghost-entities.md) は first-match bare 解決を**却下**して修飾参照を採用した。**karasu は既に「明示修飾で解く」を二度選んでおり、membership だけがその決定から取り残されている** — 本設計はその不整合の是正であって、新機軸の導入ではない。`boundary` 自体は experimental のまま据え置き。

## TPL

**案 B を支える**

- [TPL-20260714-01](../test-perspectives/TPL-20260714-01-cross-domain-entity-reference-qualified.md) — 修飾参照の直接先例（bare = intra 専用 / 修飾 = cross、bare を勝手に cross 解決しない）。endpoint-key 整合の failure #3 は `boundaryIndex` 再キーの注意点。
- [TPL-20260512-01](../test-perspectives/TPL-20260512-01-composite-key-must-cover-all-distinguishing-dimensions.md) — 区別属性（path）をキーに含めよ。B-i の構造的根拠。

**案 A を支える**

- [TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md)（受理語彙は効果/警告のいずれか）、[TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md)（register = warning）、[TPL-20260615-02](../test-perspectives/TPL-20260615-02-diagnostic-absence-assertion-scope-severity.md)（不在 assert は severity で絞る）、[TPL-20260623-02](../test-perspectives/TPL-20260623-02-validation-target-set-enumerates-all-kinds.md)（valid-target は全 kind 列挙 — multimap も同集合）。

**新規 proactive TPL — 本ブランチでは起こさない（判断と理由）**

候補は「**ノード参照サイトは同じ指定方法（bare 簡約形 + 修飾正準形）を共有し、新しい参照サイトを足すときに bare 縛りで取り残さない**」— 本設計が発見した一貫性 invariant。ただし (1) 双方向 spec back-ref は `syntax.md` に該当節を追加する**実装 PR** でしか閉じられない（本 PR は docs/design のみ）、(2) 母体 P2b design doc も同じ deferral 先例（[`system-view-grouping.md`](./system-view-grouping.md) L357）、(3) 本設計は当該原則を **uphold する側**（違反ではなく是正）。よって**実装 PR で**起票（or [TPL-20260714-01](../test-perspectives/TPL-20260714-01-cross-domain-entity-reference-qualified.md) を当該 syntax 節に back-ref）を推奨。ドラフト: known_consumers = `parseBoundaryBlock` / `parseTeamBlock` / `collectContainableIds` / edge endpoint 解決。

## AT 案（人間の目視が必要な項目のみ、実装 PR で `docs/acceptance/` に起票）

- **案 B / app**: 同 id が 2 層にある `index.krs` で `contains Checkout.Payment` と修飾すると、drill `Checkout` で domain `Payment` **だけ**が枠に入り、root の service `Payment` は枠外のままであること（目視）。bare `contains Payment` に戻すと従来どおり両方に効くこと。
- **案 A / app**: bare `contains Payment` が曖昧なとき WarningPanel に **warning severity** で 1 件出て、`locations`（両ノードの path）が読め、それが**そのまま書き写せる修飾子**になっていること（目視）。`owns` 版も同様。

## 未解決の問い / 決めないこと

- **最小 disambiguating 接尾辞パスの解決規則** — 接尾辞照合（`Checkout.Payment`）か、import 流の top-level 起点 walk（`Shop.Checkout.Payment`）か、両対応か。entity は 2 segment 固定、import は system 起点。membership の canonical をどれにするか（本設計の最大の設計判断で、実装前に確定が要る）。
- **`boundaryIndex` / `ownerIndex` の再キー方式**（B-i full-path キー vs B-ii 混在フォールバック）— 実装コストと [TPL-20260512-01](../test-perspectives/TPL-20260512-01-composite-key-must-cover-all-distinguishing-dimensions.md) / [TPL-20260714-01](../test-perspectives/TPL-20260714-01-cross-domain-entity-reference-qualified.md) 整合リスクのトレードオフ。
- **案 A / 案 B の出荷順と文言**（上記 sequencing の 1 か 2 か）— gate 判断に依存。
- **edge への適用フェーズ** — 後続フェーズか別 Issue か。定義自体は共通と決めている。
- **既存ドリフト（実装 PR で拾う）**: `duplicate-boundary-id` は syntax.md L1004 が error と記すが diagnostics.md / 実装に未登録（completeness テストは code→doc 方向のみ保証）。
- **multi-file（[#2032](https://github.com/kompiro/karasu/issues/2032)）との解決順序** — 修飾パス解決が merge 後 tree に依存する点。multimap 化と同経路なので実装時に併せて確認。
