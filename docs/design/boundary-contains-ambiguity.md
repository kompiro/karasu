# boundary `contains` / `owns` の id 衝突曖昧性診断 — boundary は view 内 peer grouping に徹する

- **日付**: 2026-07-18
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2036](https://github.com/kompiro/karasu/issues/2036)（parent [#1822](https://github.com/kompiro/karasu/issues/1822) comprehension）
  - carve-out 先: [#2065](https://github.com/kompiro/karasu/issues/2065)（cross-cutting concern labeling — tag/annotation で足りるか first-class concern tag が要るか。本 doc で却下した案 B/C の cross-cutting 用途はここへ）
  - 顕在化元: [#1983](https://github.com/kompiro/karasu/issues/1983) / [#2034](https://github.com/kompiro/karasu/issues/2034)（drill-down grouping 正規化 → [ADR-20260717-01](../adr/20260717-01-boundary-drilldown-grouping.md)。末尾「補足（識別モデルの sharp edge）」が本設計の charter）
  - 関連 Issue: [#2032](https://github.com/kompiro/karasu/issues/2032)（cross-file contains の偽 not-found — 同じ contains 解決経路）
  - notation の母体（設計）: [`system-view-grouping.md`](./system-view-grouping.md)（P2b `boundary`/`contains`、status: 部分昇格。本設計はその follow-up）
  - 関連 ADR: [ADR-20260713-01](../adr/20260713-01-notation-promotion-gate.md)（notation promotion gate）、[ADR-20260715-02](../adr/20260715-02-expand-all-services-in-place.md)（expand-all-services — group-by と排他）、[ADR-20260630-01](../adr/20260630-01-permalink-deep-element.md)（permalink deep anchor = leaf id）、[ADR-20260711-03](../adr/20260711-03-system-view-group-by-team.md)（P2a team 軸・`namespace` 語彙却下）、[ADR-20260513-03](../adr/20260513-03-import-system-nested.md)（import path 構文 `A.B.C`）、[ADR-20260714-01](../adr/20260714-01-cross-domain-ghost-entities.md)（cross-domain entity 修飾参照 — 却下した案 B の参考）、[ADR-20260715-01](../adr/20260715-01-domain-entity-modeling.md)（entity id のフラット名前空間 + `entity-anchor-collision`）、[ADR-20260404-09](../adr/20260404-09-cross-system-service-references.md)（dot-notation 参照）
  - 関連 TPL: [TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md)、[TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md)、[TPL-20260615-02](../test-perspectives/TPL-20260615-02-diagnostic-absence-assertion-scope-severity.md)、[TPL-20260623-02](../test-perspectives/TPL-20260623-02-validation-target-set-enumerates-all-kinds.md)（案 A）／[TPL-20260714-01](../test-perspectives/TPL-20260714-01-cross-domain-entity-reference-qualified.md)、[TPL-20260512-01](../test-perspectives/TPL-20260512-01-composite-key-must-cover-all-distinguishing-dimensions.md)（却下した案 B の構造的先例）
  - コード: `packages/core/src/parser/parser.ts`（`buildBoundaryIndex` / `collectContainableIds` / `validateContainsReferences` / `buildNodePathIndex` / `validateOwnsReferences`）、`packages/core/src/renderer/layout.ts`（`groupIdOf` / `buildGroupFrames`）、`packages/app/src/hooks/useSystemView.ts`（`expandedContainers` × `groupBy` の排他）

## 背景・課題

`boundary contains <id>`（および team の `owns <id>`）は **素の id 文字列**でノードを参照し、boundary membership は layout 時に **id 一致**で解決する（`groupIdOf(n.id)` `layout.ts:1056-1057` → `buildGroupFrames` が一致する全ノードを枠取り `layout.ts:82`）。ところが node id の一意性は**グローバルではない**: `duplicate-node-id-parent`（error）は sibling（同一親直下）でのみ発火し、親が違えば同 id が黙って共存できる（karasu が意図して許す構造。`duplicate-node-id-parent` の **sibling 限定 scope** `parser.ts:2172-2186` + [ADR-20260513-03](../adr/20260513-03-import-system-nested.md) L36「同名 id の意図的な共存」。なお [ADR-20260514-01](../adr/20260514-01-multi-file-import-semantics.md) は別インスタンス同 id に `duplicate-node-in-system` を **維持**する — 許すのは同名 system の reopen/union であって node-id 共存ではない）。

この二つが重なると、`contains X` が **意味の異なる複数ノードを各レベルで黙って枠に取り込み**、**診断がゼロ**になる。著者は 1 ノードのつもりで `contains Payment` と書くが、別物の 2 ノードが framed になり、しかも「service ではなく domain の方」と言い分ける手段も、曖昧だったという警告も無い。

### compile probe 1 — id 衝突下の silent 多重フレーム（Issue #2036 の核）

```krs
system Shop {
  service Payment { domain Ledger {} }     // top-level service, id=Payment
  service Checkout { domain Payment {} }    // nested domain, id=Payment（親が違うので許容）
}
boundary b "B" { contains Payment }
```

`groupBy: "boundary"` で観測（本設計で再実行し確証、`tsx` probe）:

| view | diagnostics | 枠 | 枠に入るノード |
| --- | --- | --- | --- |
| root | **なし** | `__group_b__` | top-level **service** `Payment` |
| drill `Shop.Checkout` | **なし** | `__group_b__` | nested **domain** `Payment`（別ノード） |

→ `contains Payment` が **別物 2 ノードを 2 レベルで黙って枠取り**、診断ゼロ。`duplicate-node-id-parent` も `contains-target-not-found` も出ない（id は存在し、sibling でもない）。`owns`/team でも同型（後述インベントリ）。

### compile probe 2 — cross-layer boundary は 1 枠で描けない（案 B/C の動機を撤回する事実）

realistic な EC モデルで PCI スコープを深さバラバラの members で宣言すると、**1 boundary が view ごとに別フレームへ断片化する**（id 衝突なし・distinct id・診断ゼロ。本設計で compile 実測）:

```krs
system Shop {
  service CardVault {}                      // top-level service（root）
  service Billing {}                        // top-level service（root）
  service Checkout { domain Payment {        // domain（drill: Checkout）
    usecase Authorize                        // usecase（drill: Checkout>Payment）
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

boundary は **「同一 view に co-render する peer をまとめる」視覚グルーピング軸**である（[ADR-20260717-01](../adr/20260717-01-boundary-drilldown-grouping.md) の正規化: 各 view はそのレベルの member でフレームを組む。member が複数レベルに散る boundary はレベルごとに **disjoint な同名フレーム**になる）。したがって:

- **cross-kind・same-level は可**（同 view に co-render する service と domain を 1 枠で束ねられる）。
- **cross-depth は不可**（深さを跨ぐと必ず断片化し、1 枠で見ることはできない）。

さらに「複数 service の domain を一度に見る」view（expand-all-services in place、[ADR-20260715-02](../adr/20260715-02-expand-all-services-in-place.md)）は **group-by と mutually exclusive**（`useSystemView.ts:276,299` の `expandedContainers: groupBy !== "none" ? undefined : expandedContainers`）。よって **cross-layer boundary を 1 枠で描く view はそもそも存在しない**。

→ **結論**: 「cross-layer をうまく扱う」は boundary の用途として**成立しない**。コンプライアンス等の cross-cutting concern（PCI・データ所在地・移行状態…）は per-element の**属性 = tag/annotation**であって boundary membership ではない（[#2065](https://github.com/kompiro/karasu/issues/2065) に carve-out）。本 doc は #2036 を **view 内 correctness の focused fix（案 A）**に絞る。

### なぜ #1983 が増幅したか

id モデルは以前からこれを許していたが、衝突は概ね潜在的だった: 静的 export は root band のみ枠取りしていた（[#1879](https://github.com/kompiro/karasu/issues/1879) gate）。[#1983](https://github.com/kompiro/karasu/issues/1983)（[ADR-20260717-01](../adr/20260717-01-boundary-drilldown-grouping.md)）が grouping を drill レベル / export / entity view で正規化し **canonical として spec 化**したことで、同 id ノードが可視的に参加するようになり、曖昧性の噛む範囲が広がって公式挙動になった。

## 現状（インベントリ）

### bare-id 参照の 3 経路（同じ穴、カバレッジだけ差）

| 参照 | 解決キー | 実装 | 同 id 衝突時の既存診断 |
| --- | --- | --- | --- |
| `contains` | bare id | `buildBoundaryIndex` = `Map<id, boundaryId>`（`parser.ts:2030-2047`、first-wins）／`groupIdOf(n.id)`（`layout.ts:1056`）→ `buildGroupFrames` が **一致する全ノードを枠取り**（`layout.ts:82`） | **なし**（silent 多重フレーム） |
| `owns`/team | bare id | `nodePathIndex` = `Map<id, path>`（**単一勝者・lossy**、`parser.ts:2068-2170`）／`ownerIndex` → 同じ `groupIdOf(n.id)` | **部分的**: service/client 対 → `node-id-multiple-locations`（warning, emit `parser.ts:2132`、**非 domain 枝のみ**）。service 対 domain・domain 分散 → **silent**（probe 実証。domain 枝 `parser.ts:2106-2138` は `index.has` を見ず上書き） |
| edge `from`/`to` | bare id | `layoutNodes.get(edge.from)`（`layout.ts:2042`、単一勝者） | **なし**（silent 1 勝者）。**本設計スコープ外**（membership 参照に限定） |

`contains` の存在チェックは `validateContainsReferences`（`parser.ts:2220-2234`）が `collectContainableIds`（`parser.ts:2240-2258`）に対して行うが、後者は **`Set<string>`** なので同 id を 1 エントリに畳み、**多重性を観測すらできない**。`buildBoundaryIndex` の `duplicate-boundary-assignment`（info）は「同 id が複数 boundary に居る」別軸で、「1 contains が複数ノードに一致」は検出しない。

### 既存の識別・参照モデル（本設計の土台）

karasu は「**フラット id 名前空間 + kind 別の段階 severity 一意性 + 曖昧なときだけドット修飾で解決**」を採る。案 A の warning register も、案 B 却下の論拠も、この既存モデルから導かれる。

| 語彙 | 一意性 severity | 曖昧解消手段 | 出典 |
| --- | --- | --- | --- |
| sibling id（同一親直下） | **error**（`duplicate-node-id-parent`） | — | diagnostics.md:76 |
| system 内 node id | **error**（`duplicate-node-in-system`） | — | diagnostics.md:78 |
| `DomainId`（system 内） | **error**級一意 | — | syntax.md:600-602 |
| entity id / domain id（anchor 名前空間） | **warning**（`entity-anchor-collision`） | `DomainId.EntityId` ドット | syntax.md:618-622、[ADR-20260715-01](../adr/20260715-01-domain-entity-modeling.md) |
| node id 全域 | **強制しない**（意図的共存を許す） | import path `A.B.C` | syntax.md:1154-1183、[ADR-20260513-03](../adr/20260513-03-import-system-nested.md) |

**同一 view 内の兄弟 id は既に error 一意**（`duplicate-node-id-parent`）。したがって `contains` の member id が **複数ノードに一致するのは常に深さ/親を跨ぐ id 衝突**であり、それは probe 2 が示すとおり **1 枠に描けない断片ケース**である。案 A はこの「深さを跨ぐ contains をうっかり書いた」ケースの**安全網**として機能する（後述）。

## 制約・前提

- `boundary` は **experimental notation**（[ADR-20260717-01](../adr/20260717-01-boundary-drilldown-grouping.md) L52）。promotion gate（[ADR-20260713-01](../adr/20260713-01-notation-promotion-gate.md)）の対象は **notation/構文**であって診断ではない。**案 A は文法非変更・診断追加のみ → gate を発火させない**（「experimental 層内の挙動/診断変更は gate 外」は ADR-20260717-01 L52 の先例そのもの）。
- **boundary = view 内 peer grouping 軸**。cross-kind・same-level は可、**cross-depth membership は扱わない**（probe 2）。cross-layer / cross-cutting concern は本 doc の非目標（[#2065](https://github.com/kompiro/karasu/issues/2065)）。
- **identity = author-given bare id を変えない**（permalink deep anchor `#krs-<view>-<id>` は leaf id 依存、[ADR-20260630-01](../adr/20260630-01-permalink-deep-element.md)）。
- **global id 一意性の強制は不可**（entity は warning 級一意 `entity-anchor-collision`、親が違えば同 id 共存は意図的 — 段階 severity の既存判断と矛盾させない）。
- 本設計のスコープは **membership 参照の曖昧性診断（`contains` + `owns`）に限定**。edge endpoint の同 id 曖昧は同根だが別スコープ。

## 検討した選択肢

**案 A（曖昧性診断）を採用**する。着想として検討した **案 B（修飾 contains）・案 C（in-context membership）は却下**する（cross-layer boundary が描けないという probe 2 の事実により動機が消えたため。詳細は「却下・非目標」）。

### 案 A: 曖昧性診断 `contains-target-ambiguous` + `owns-target-ambiguous`

`contains`/`owns` の member id が **複数の別ノードに解決**したとき warning を出す。文法変更ゼロ。

- **診断コード**: `contains-target-ambiguous`（kebab-case。**parser Diagnostic チャネル** — `contains-target-not-found` の隣、`DiagnosticParamsByCode`（`ast.ts:555`）→ `render-diagnostic.ts` の exhaustive switch → `en.ts`/`ja.ts` → `diagnostics.md` カタログ）。`owns` 版は `owns-target-ambiguous`。
- **severity**: **warning**（[TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md)）。id 再利用自体は許された事実だが、**参照 site で著者の意図（1 ノード）に解決しない**のは欠陥。membership addressability を損なう点で `entity-anchor-collision`（deep-link addressability を損なう warning）と対称。`contains-target-not-found`（warning）とも同格。
- **発火条件**: member id が **>1 の distinct declared node に一致**するとき。**別 member id が別レベルに散るのは正常**（ADR-20260717-01 rule 2 の disjoint フレーム）ので、発火は**単一 member id の多重性**でのみ判定する。
- **検出層**: `validateContainsReferences`（`parser.ts:2220`）。`collectContainableIds`（`parser.ts:2240`）を **`Set<string>` → `Map<string, { kind, path }[]>`** に多値化（id → その id を持つ全宣言ノードの kind と path。全 kind を歩く現行 walk をそのまま多値化。[TPL-20260623-02](../test-perspectives/TPL-20260623-02-validation-target-set-enumerates-all-kinds.md): valid-target 集合は全 kind 列挙）。member id の list: `length === 0` → 既存 `contains-target-not-found`、`length === 1` → OK、`length > 1` → `contains-target-ambiguous`。
- **params**: `{ memberId: string; locations: string[] }`（各一致ノードの path 文字列。例 `["Shop.Payment", "Shop.Checkout.Payment"]` — どのノードに当たったかを著者が読めるようにする）。`ast.ts` の `DiagnosticParamsByCode` に追加。
- **i18n**（[i18n.md](../spec/i18n.md): en 必須 / ja 推奨）:
  - `packages/i18n/src/types.ts` に `diagnostic.containsTargetAmbiguous.message` の**型宣言**（`containsTargetNotFound` が宣言される ~L420 の隣。無いと `t(...)` と en/ja が型チェックを通らない）。
  - `render-diagnostic.ts` に `case "contains-target-ambiguous": return t("diagnostic.containsTargetAmbiguous.message", d.params);`
  - en（必須、`en.ts`）案: `` `boundary member "${memberId}" is ambiguous — it matches ${n} declared nodes (${locations}). The reference cannot pick one; rename so ids are unique, or drop the cross-level member.` ``
  - ja（推奨、`ja.ts`）案: `` `boundary メンバー "${memberId}" が曖昧です — ${n} 個の宣言済みノード（${locations}）に一致します。参照は 1 つに絞れません。id が一意になるよう改名するか、レベルを跨ぐメンバーを外してください。` ``
- **catalog 登録**: `diagnostics.md`（+ `diagnostics.ja.md`）の「Cross-reference resolution」family に `contains-target-not-found` と並べて行追加。completeness を強制するのは `packages/core/src/types/diagnostics-catalog.test.ts`（`DiagnosticParamsByCode` + `WarningKind` の全メンバが両 doc の backtick 記載を持つまで fail。code→doc 方向のみ保証）。
- **`owns-target-ambiguous`（案 A の一部・確定）**: `owns`/team も同型の silent 二重フレーム穴。既存 `node-id-multiple-locations`（warning, emit `parser.ts:2132`）は **非 domain 枝でしか発火せず service/service しか拾わない** — domain 枝（`parser.ts:2106-2138`）は診断なしで上書きするため **service 対 domain と domain 分散は silent**。`contains Payment`=警告／`owns Payment`=無言という著者視点の非対称を残さないため、`owns-target-ambiguous`（warning）を同梱し、scope は `node-id-multiple-locations` が外す **残余集合**（service 対 domain / domain 分散）に絞って二重発火を避ける。**多重性の観測手段**: `owns` 検証が使う `nodePathIndex` は単一勝者・lossy（`parser.ts:2068-2170`）で多重性を見られないため、`collectContainableIds` の multimap を `owns` 対象 kind（service/domain/client + top-level infra）に絞って別途構築し `validateOwnsReferences`（`parser.ts:2188`）で判定する。
- **テスト**: `parser.test.ts`（発火: service + nested domain 同 id / 非発火: 一意 id・not-found・単一一致・別 member が別レベル）。診断不在 assert は severity で絞る（[TPL-20260615-02](../test-perspectives/TPL-20260615-02-diagnostic-absence-assertion-scope-severity.md)）。`render-diagnostic.test.ts`・`packages/core/src/types/diagnostics-catalog.test.ts`。

## 現時点の方針

**案 A（`contains-target-ambiguous` + `owns-target-ambiguous` 診断）を #2036 の解として採用する。boundary は "view 内 peer grouping 軸" と割り切り、cross-layer membership は扱わない。**

- 案 A は **view 内 correctness の focused fix**。同一 view の兄弟 id は `duplicate-node-id-parent`（error）で既に衝突禁止なので、案 A が拾うのは **深さ/親を跨ぐ id 衝突**（= probe 1）— それは probe 2 の断片化と同じ「boundary が 1 枠で描けないもの」を bare id でうっかり参照したケースであり、案 A はその**安全網**になる。
- 文法変更ゼロ・promotion gate 非依存（[ADR-20260717-01](../adr/20260717-01-boundary-drilldown-grouping.md) L52）で **先行独立出荷**できる。
- 「うまく cross-layer を束ねる」方向（前回まで案 B/C の主動機）は probe 2 で**不成立と判明したので撤回**。cross-cutting concern は [#2065](https://github.com/kompiro/karasu/issues/2065) の tag/annotation 領域へ。

### 実装の指針（Phase A のみ）

1. `collectContainableIds`（`parser.ts:2240`）を `Map<string, { kind, path }[]>` に多値化。
2. `validateContainsReferences`（`parser.ts:2220`）で `length > 1` → `contains-target-ambiguous` emit（`length===0` は既存 not-found を維持）。`owns` 用に owns-対象-kind に絞った multimap を構築し `validateOwnsReferences`（`parser.ts:2188`）で `owns-target-ambiguous` emit（残余集合 scope）。
3. `DiagnosticParamsByCode`（`ast.ts:555` 近傍）に `"contains-target-ambiguous": { memberId: string; locations: string[] }` と `"owns-target-ambiguous": { ownedId: string; locations: string[] }` を追加。
4. `render-diagnostic.ts` に case 追加（exhaustive switch の `never` ガードが強制）。
5. i18n: `packages/i18n/src/types.ts`（`containsTargetNotFound` ~L420）に両キーの**型宣言**を追加し、`en.ts`（必須）+ `ja.ts`（推奨）にエントリを追加。
6. `diagnostics.md` + `diagnostics.ja.md` の Cross-reference resolution family に 2 行追加。
7. テスト: `parser.test.ts`（発火/非発火、[TPL-20260615-02](../test-perspectives/TPL-20260615-02-diagnostic-absence-assertion-scope-severity.md) の severity スコープ）、`render-diagnostic.test.ts`、`packages/core/src/types/diagnostics-catalog.test.ts`（en/ja 両 doc の completeness）。
8. changeset: `@karasu-tools/core` + `karasu` を **minor**（新診断 = 利用者から見える挙動追加）。CLI（`karasu`）は core を devDep でバンドルするため changeset は **cascade しない** — だからこそ `.claude/rules/changesets.md` どおり両パッケージを明示的に名指す。
9. spec: `syntax.md` の boundary 節に「同 id に一致する曖昧な `contains`/`owns` は `*-target-ambiguous` 警告」を追記し、章末 `> Related TPLs:` に既存 TPL を back-ref（CLAUDE.md「spec 新規記述 PR は proactive TPL 最低 1 件 or 既存 back-ref」）。
10. AT: `docs/acceptance/` に新規（下記 AT 案）。

### 影響範囲・マイグレーション

- **既存ユーザーへの影響**: 新 warning のみ（既存 .krs は挙動不変、同 id 衝突を持つモデルにだけ warning が増える）。
- **ドキュメント更新**: `docs/spec/syntax.md`（+ja、boundary 節）、`docs/spec/diagnostics.md`（+ja、新コード 2 行）。concepts は不変（warning であって info ではない）。
- **テスト・examples**: examples は不変。

## 却下・非目標

- **案 B（qualified `contains` — 修飾記法の追加）**: 却下。修飾（`Checkout.Payment`）が意味を持つのは **cross-depth 参照のときだけ**だが、それは probe 2 の「1 枠に描けない断片ケース」。**同一 view 内では兄弟 id が既に error 一意**（`duplicate-node-id-parent`）なので bare で足り、修飾は要らない。karasu には既に修飾解決イディオム（`DomainId.EntityId`、`view-extract.ts:1101-1235` の `resolveQualifiedEntity`）が在るが、それは entity view の cross-domain 解決であって cross-depth grouping を描けるようにはしない。よって **experimental surface を増やす実利用上の正当化が立たない**（[ADR-20260713-01](../adr/20260713-01-notation-promotion-gate.md) の gate 規律）。構造的先例だった [TPL-20260714-01](../test-perspectives/TPL-20260714-01-cross-domain-entity-reference-qualified.md)（修飾参照）/ [TPL-20260512-01](../test-perspectives/TPL-20260512-01-composite-key-must-cover-all-distinguishing-dimensions.md)（合成キー）は、案 B を復活させるときの参考として関連に残す。
- **案 C（in-context membership — node 側に boundary 所属を書く）**: 却下（ただし洞察は転用）。「membership を宣言サイト（node）に in-context で書く」という着想自体は正しかったが、**in-context で宣言すべき対象は "boundary membership" ではなく "cross-cutting tag/属性"** だった（PCI は各 node に `@pci` を付ける話であって、cross-depth の枠を作る話ではない）。boundary membership の in-context 化としては却下し、cross-cutting tag の議論は [#2065](https://github.com/kompiro/karasu/issues/2065) へ送る。
- **cross-layer bundling を boundary で扱う動機**: **撤回**。probe 2 が「boundary は cross-depth を 1 枠で描けない／expand-all は group-by と排他」を compile 実測で示した。boundary は cross-kind・same-level の peer grouping に徹する。
- **cross-cutting concern（PCI・データ所在地・移行状態…）の labeling を boundary で行う**: 非目標。これは per-element の属性 = tag/annotation の領域で、既存の `[...]`（system-defined）/ `@...`（user-defined open set）で概ね書ける。system-defined vs user-defined の定義方法や concern overview の要否は [#2065](https://github.com/kompiro/karasu/issues/2065) で検討。本 doc スコープ外。
- **identity = path 化**: bare-id 参照と permalink deep anchor（leaf id 依存、[ADR-20260630-01](../adr/20260630-01-permalink-deep-element.md)）を壊す。却下。
- **hard global id 一意性の強制**: entity の warning 級一意（[ADR-20260715-01](../adr/20260715-01-domain-entity-modeling.md)）・親が違えば同 id が共存する既存 scope（`duplicate-node-id-parent` は sibling 限定、[ADR-20260513-03](../adr/20260513-03-import-system-nested.md) L36）と矛盾。却下。
- **`namespace` 語彙 / 宣言サイトの identity name-scope 化**: [ADR-20260711-03](../adr/20260711-03-system-view-group-by-team.md) L57 / P2b L240 で却下済み（id を `payments.Billing` に修飾する＝過剰約束）。案 A/B いずれも identity を変えないため別問題。
- **edge endpoint の同 id 曖昧解消**: 同根（インベントリ）だが本設計スコープ外（membership 参照に限定）。

## promotion gate 整理（[ADR-20260713-01](../adr/20260713-01-notation-promotion-gate.md)）

- **案 A**: notation 非変更（診断追加のみ）→ **gate を発火させない**。gate の対象は notation/構文であり、診断のみの変更が gate 外であることは [ADR-20260717-01](../adr/20260717-01-boundary-drilldown-grouping.md) L52（within-experimental の挙動/診断変更 = 通常の minor）が先例。`boundary` は experimental のまま据え置き（診断が付いても stable 昇格ではない。stable 昇格は karasu-nest corpus evidence 待ち）。

## TPL

**引用（案 A を支える）**

- [TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md) — 受理語彙は「効果 / 警告 / open-set 明文化」のいずれか。曖昧 contains は「意図せぬ効果」= 警告側に倒す。派生元 spec に boundary 節あり。
- [TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md) — `*-target-ambiguous` は欠陥（warning）であって流派 smell（info）ではない。
- [TPL-20260615-02](../test-perspectives/TPL-20260615-02-diagnostic-absence-assertion-scope-severity.md) — 診断不在 assert は severity で絞る（テスト流儀）。
- [TPL-20260623-02](../test-perspectives/TPL-20260623-02-validation-target-set-enumerates-all-kinds.md) — valid-target 集合は全 kind 列挙。multimap も `collectContainableIds` の全 kind 集合を踏襲。

**参考（却下した案 B の構造的先例、復活時に再訪）**: [TPL-20260714-01](../test-perspectives/TPL-20260714-01-cross-domain-entity-reference-qualified.md)（修飾参照）、[TPL-20260512-01](../test-perspectives/TPL-20260512-01-composite-key-must-cover-all-distinguishing-dimensions.md)（区別属性 = path をキーに）。

**新規 proactive TPL — 本ブランチでは起こさない（判断と理由）**

候補は「**フラット名前空間の bare-id membership 参照（`contains`/`owns`）は >1 ノードの曖昧性を検出し surface する**」。probe で実証した cross-cutting invariant だが、(1) 双方向 spec back-ref は `syntax.md` に該当節を追加する**実装 PR** でしか閉じられない（本 PR は docs/design のみ）、(2) 母体 P2b design doc も同じ deferral 先例（[`system-view-grouping.md`](./system-view-grouping.md) L357）、(3) 本設計は当該原則を **uphold する側**（違反ではなく是正）。よって**実装 PR で** 起票（or [TPL-20260714-01](../test-perspectives/TPL-20260714-01-cross-domain-entity-reference-qualified.md) を当該 syntax 節に back-ref）を推奨。ドラフト: title「bare-id membership 参照はフラット名前空間の >1 ノード曖昧性を検出する」、known_consumers = `validateContainsReferences` / `validateOwnsReferences` / `collectContainableIds`。

## AT 案（人間の目視が必要な項目のみ、実装 PR で `docs/acceptance/` に起票）

- **`contains` / app**: 同 id 衝突を持つ `index.krs`（service `Payment` + 別 service 配下 domain `Payment` + `boundary b { contains Payment }`）を開き、WarningPanel に `contains-target-ambiguous` が **warning severity** で 1 件出て、両ノードの path（locations）が読めること（目視）。
- **`owns` / app**: 同構造 + `organization { team T { owns Payment } }` で `owns-target-ambiguous` が warning で出ること（目視）。

## 未解決の問い / 決めないこと

- **断片化 hint への拡張（任意）**: 案 A は id 衝突（>1 一致）を拾うが、**distinct id の cross-depth 断片化**（probe 2 の PCI: 各 member は 1 ノードに一致するが深さがバラバラで枠が割れる）は拾わない。これを別診断/hint（「この contains member は他 member と別レベルに render する＝枠が断片化する。cross-cutting concern なら tag を検討」→ [#2065](https://github.com/kompiro/karasu/issues/2065) への誘導）として足すかは任意検討。恒久的発火条件の設計が要る（member の render レベルの列挙）ため、要否は corpus と #2065 の結論を見てから。
- **既存ドリフト（実装 PR で拾う）**: `duplicate-boundary-id` は syntax.md L1004 が error と記すが diagnostics.md / 実装に未登録（completeness テストは code→doc 方向のみ保証、doc→code は非保証）。本設計の責任外だが、Phase A で diagnostics.md に触れるついでに拾うとよい。
- **multi-file（[#2032](https://github.com/kompiro/karasu/issues/2032)）との解決順序** — cross-file の contains 存在判定が merge 後 tree に依存する点。案 A の multimap 化と同経路なので実装時に併せて確認。
