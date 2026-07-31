# boundary 所属 1:N — slice A（model 層）の実装設計と、群の並びの導出元

- **日付**: 2026-07-30
- **ステータス**: 検討中
- **PR**: [#2195](https://github.com/kompiro/karasu/pull/2195)
- **関連**:
  - 引き金 Issue: [#2178](https://github.com/kompiro/karasu/issues/2178)（slice A。親 [#2161](https://github.com/kompiro/karasu/issues/2161)、後続 [#2179](https://github.com/kompiro/karasu/issues/2179) / [#2180](https://github.com/kompiro/karasu/issues/2180) / 配置 [#2176](https://github.com/kompiro/karasu/issues/2176)）
  - **上位設計**: `docs/design/boundary-membership-1n.md`（Part A / B / C の全体像。本 doc は **Part A を実装粒度に落とし、A-4 の到達点を実測にもとづいて決め直す**）
  - refine 対象 ADR: [ADR-1974](../adr/1974-boundary-declaration-syntax.md)（決定 2 の「1:1 + first-wins」）
  - 関連 ADR: [ADR-2036](../adr/2036-scoped-boundary-declaration.md)（スコープ宣言 — identity =（宣言スコープ, id）、scoped が勝つ）、[ADR-1886](../adr/1886-group-by-diff-removed-node-placement-and-aggregated-edge-state.md)（diff の backfill ガード）、[ADR-1858](../adr/1858-system-view-group-by-team.md)（team 軸 = 触らない先行機構）、[ADR-1884](../adr/1884-group-by-team-multi-system-root-per-system-frames.md)（multi-system の per-system フレーム）、[ADR-1983](../adr/1983-boundary-drilldown-grouping.md)（軸 index × 描画レベルの交差）、[ADR-1314](../adr/1314-krs-spec-v1-freeze.md)（`.krs` v1.0 freeze / TS API は 0.x）、[ADR-1820](../adr/1820-notation-promotion-gate.md)（`boundary` は experimental）
  - 関連 TPL: [TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md)（**本 doc の中心** — 宣言された多重所属を派生 index で捨てない／並びは宣言から、所属は index から）、[TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)（派生 state の二重持ち）、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)（軸を全 call site に通す）、[TPL-2032](../test-perspectives/TPL-2032-reference-existence-validated-on-merged-space.md)（merge 後の空間で再導出）、[TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)（scoped は (scope, id) でキー）、[TPL-1386](../test-perspectives/TPL-1386-diagnostic-register-fact-vs-style.md)（診断の register）、[TPL-1583](../test-perspectives/TPL-1583-migration-priority-index-winner.md)（1:1 index の勝者選択規則）、[TPL-1738](../test-perspectives/TPL-1738-relayout-into-group-preserves-placement-and-edges.md)（全要素ちょうど一度配置）、[TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)（受理・無効果の禁止）
  - コード: `packages/core/src/parser/parser.ts:2169`（`buildBoundaryIndex`）/ `:2201`（`buildScopedBoundaryIndex`）、`packages/core/src/types/ast.ts:525`（`KrsFile.boundaryIndex`）、`packages/core/src/renderer/layout.ts:1023`（`boundaryAxisFor`）/ `:1075`（`declaredGroupOrder`）、`packages/core/src/renderer/group-layout.ts:261`（`presentGroups`）、`packages/core/src/renderer/group-labels.ts:64`（`declaredGroupIds`）、`packages/core/src/fs/import-resolver.ts:263`、`packages/core/src/compile/compile-diff.ts:236`

## 背景・課題

上位設計 `boundary-membership-1n.md` の Part A（model 層を 1:N にする）を実装に落とす段で、
コードを読み実測したところ **A-4（影に入った boundary の復活）の記述が実装と食い違っている**ことが
分かった。A-4 は「`declaredGroupOrder` を membership 配列の flatten から作れば、全メンバーが他 boundary と
共有の boundary も群として現れ、**band とフレームを得る**」と書いているが、次の 2 点が成り立たない。

1. **flatten を渡しても band もフレームも得られない。** `assignGroupedLayers`
   （`group-layout.ts:261`）は `presentGroups = declaredGroupOrder.filter(g => nodes.some(n => n.groupId === g))`
   で、**そのバンドに置かれるメンバーを持たない群を落とす**。slice A は配置を変えない（primary 配置のまま）ので、
   全メンバーが共有の boundary は `groupId` として一度も現れず、`declaredGroupOrder` に足しても結果は不変である。
   これは同じ上位設計の「spike の実測」節が書いている「slice A は群の並びに その boundary を復活させるが、
   **body を与えるわけではない**」と一致し、A-4 の本文だけが強すぎる。
2. **flatten 由来の順序は宣言順を壊しうる。** 現行の `[...new Set(groupIndex.values())]` は
   **boundary の宣言順とちょうど一致する**（primary の初回獲得順 = 宣言順）。membership を flatten すると
   非 primary の所属が先に現れるため順序が入れ替わる。`orderGroups` は宣言順を最終 tie-break に使うので、
   これは多重所属モデルの band 順を（意図せず）変える。

したがって slice A では **「群の並びの導出元」を決め直す**必要がある。これは
[TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md)
のチェックリスト「群・カテゴリの並びや存在判定を派生 index の値集合から導いていない」と
対処パターン「**並びは宣言から、所属は index から**」が名指している論点そのものである。
Part A の他の決定（1:N 化・単一 SoT・`primaryBoundaryOf`・merge 意味論・診断 register）は動かさない。

## 現状（インベントリ）

実測は本 doc 作成時に `Parser.parse` と `assignGroupedLayers` を直接叩いて取った（下記の値は実測値）。

| 観点 | 実装 | 実測 |
| --- | --- | --- |
| 群の並びの導出 | `layout.ts:1075` `declaredGroupOrder = [...new Set(groupIndex.values())]` | `boundary A{N1}` / `C{N2}` / `B{N1,N3}` で **`A, C, B` = 宣言順**。membership flatten は `A, B, C` で不一致 |
| band を持てる群 | `group-layout.ts:261` `presentGroups` が `nodes.some(n => n.groupId === g)` で絞る | `A{N1,N2}` / `B{N2}`（B は全メンバー共有）で `declaredGroupOrder` に `B` を足しても `groupOrder=["A"]`・`groupBands={A:{0,1}}` で**不変** |
| 宣言の一覧 | `group-labels.ts:64` `declaredGroupIds(krsFile, groupBy)` が全宣言 id（scoped は scope 修飾）を **Set** で返す | 既に存在する。順序は「top-level を宣言順 → scoped を walk 順」。diff の label backfill が消費 |
| 軸の合成 | `layout.ts:1023` `boundaryAxisFor` が `new Map([...boundaryIndex, ...qualified])`（scoped 勝ち） | 上書きは既存キーの位置を保つので、キー順は top-level → scoped-only の順で安定 |

## 制約・前提

- **上位設計 Part A の決定は動かさない**: `boundaryMembership` / `scopedBoundaryMembership` への改名と配列化、1:1 の並行フィールドを作らない（[TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)）、`primaryBoundaryOf(ids) => ids[0]` 1 関数、multi-file は和集合・diff は removed 限定 backfill（[ADR-1886](../adr/1886-group-by-diff-removed-node-placement-and-aggregated-edge-state.md)）・`boundaryAxisFor` は scoped 勝ちを維持（[ADR-2036](../adr/2036-scoped-boundary-declaration.md)）、診断はコードと `info` を維持して文言のみ事実の register に直す。
- **slice A は配置を変えない**（[TPL-1738](../test-perspectives/TPL-1738-relayout-into-group-preserves-placement-and-edges.md)）。多重所属ノードは今までどおり primary の band に 1 回だけ置かれる。
- **多重所属を書いていないモデルの描画は byte-identical**（#2178 の受け入れ条件）。群の並びの導出元を替える案は、この条件で評価する。
- 文法変更ゼロ。`KrsFile` のフィールド型変更は TS API 0.x として許容（[ADR-1314](../adr/1314-krs-spec-v1-freeze.md)）。
- **team 軸（`ownerIndex`）は触らない**（stable 構文 + `@migration_target` の precedence、[TPL-1583](../test-perspectives/TPL-1583-migration-priority-index-winner.md)）。`boundary` 軸の primary は annotation precedence を持たないので `ids[0]` = first-wins（同 TPL の tie 規則 4 と一致）。
- out of scope: 影に入った boundary に **body（frame）を与えること**（配置の問題 = [#2176](https://github.com/kompiro/karasu/issues/2176)）、Part B（多重包含 geometry・[#2179](https://github.com/kompiro/karasu/issues/2179)）、Part C（collapse 二重性・[#2180](https://github.com/kompiro/karasu/issues/2180)）、`presentGroups` の意味論そのもの（バンドはメンバーを要する — view 側の正当な制約）。

## 検討した選択肢

論点は **`declaredGroupOrder` を何から導くか** の 1 点である。

### 案 1: membership の flatten（上位設計 A-4 の記述どおり）

`boundaryAxisFor` が返す membership 配列を flatten して first-appearance で dedupe する。

**メリット**

- 実装が 1 行。追加の配線が要らない（軸の受け渡しだけで済む）。
- 影に入った boundary が `declaredGroupOrder` に現れる（#2178 の受け入れ条件の字面を満たす）。

**デメリット**

- **宣言順を壊す**（実測: 宣言順 `A, C, B` に対し flatten は `A, B, C`）。`orderGroups` の最終 tie-break が
  宣言順なので、多重所属モデルの band 順が理由なく変わる。
- 「並びを派生 index の値から導く」構造は温存される。`contains` を 1 行足すと群の並びが動く結合が残り、
  [TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md)
  の対処パターン（並びは宣言から）に反する。
- メンバーが 1 人もいない `boundary`（`contains` ゼロ）は依然 index に現れないので、存在の導出は不完全なまま。

### 案 2: 宣言リスト（AST）由来の順序に置き換える

`declaredGroupIds` を順序付き（配列）に一般化し、`layout` の新オプションとして受け取って
`declaredGroupOrder` にそのまま使う。所属は index、並びは宣言から。

**メリット**

- [TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md)
  の対処パターンにそのまま一致する。`contains` ゼロの boundary も含めて**宣言された群がすべて並びに現れる**。
- 並びが index の畳み込み規則（first-wins / 和集合）から独立する。

**デメリット**

- **多重所属の無いモデルでも band 順が変わりうる**。宣言リストの順序は「top-level 宣言順 → scoped walk 順」
  だが、現行の軸キー順は同一 canvas 内で top-level と scoped が混ざる。混在 canvas で FAS コストが
  タイになると band 順が入れ替わる — #2178 の byte-identical 条件に反する。
- 新オプションを全 render call site に通す配線が増える（`svg-renderer` / `drill-down-svg` /
  `all-layers-svg` / `compile` / `compile-diff` / `layout`）。

### 案 2': 軸の値順（現状）を保ち、宣言リストで**補完**する（採用）

`declaredGroupOrder` を「現行の primary 軸の値順」+「そこに現れない宣言済み群を宣言順で末尾に追加」で作る。

```ts
// primaryAxis: node id → primary boundary id（= 今日の boundaryIndex 相当）
// declared: 宣言リスト由来の群 id（top-level 宣言順 → scoped walk 順）
const order = [...new Set(primaryAxis.values())]; // 今日と同じ = 宣言順
const seen = new Set(order);
for (const id of declared) if (!seen.has(id)) order.push(id); // 影に入った群・空の群
```

**メリット**

- **多重所属の有無にかかわらず、既存モデルの band 順が完全に不変**（先頭部分が今日と同一列、
  追加分は `presentGroups` が落とすので出力に触れない）。#2178 の byte-identical 条件を構造的に満たす。
- 宣言された群が並びから消えない（案 2 の狙いを満たす）。`contains` ゼロの boundary も含む。
- 案 1 の順序破壊が起きない。

**デメリット**

- 導出が 2 段（軸 + 宣言）で、単一の源から導くより説明が 1 行増える。
- 案 2 が持つ「並びは宣言だけから決まる」という完全な独立性は得られない。並びの**先頭部分**は依然
  軸の値順に依存する（ただしそれは今日の観測された挙動そのもので、宣言順と一致している）。
- 案 2 と同じ配線コスト（新オプションを全 call site に通す）。

### 案 3: `presentGroups` を緩めて空 band を作る（却下）

`assignGroupedLayers` が、メンバーのいない宣言済み群にも band を割り当てる。

**却下理由**: `groupBands.set(g, {min: base, max: base})` / `base += 1` により**空の行が 1 行予約される**。
実測どおりフレームはメンバー bbox から作るので**枠は出ないまま、縦に隙間だけが空く** — 今日より悪化する。
上位設計の縮退規則 4「偽の包含は作らない」に照らしても、body の無い枠を出す方向は採らない。

### 案 4: 現状維持（`[...new Set(groupIndex.values())]` のまま）

**却下理由**: 宣言された `boundary` が群として存在しないものとして扱われ続ける
（[TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md)
の失敗モード「群そのものの消失」）。slice B で配置が変わったとき、この導出が残っていると
「members を得たのに並びに居ない群」を生む。slice A で直しておくのが最も安い。

## 比較

| 観点 | 案 1 flatten | 案 2 宣言由来 | **案 2' 軸 + 宣言補完** | 案 3 空 band | 案 4 現状維持 |
| --- | --- | --- | --- | --- | --- |
| 宣言された群が並びに現れる | △（`contains` ゼロは不可） | ○ | ○ | ○ | ✕ |
| 既存モデルの band 順が不変 | ✕（多重所属で変わる） | ✕（混在 canvas で変わりうる） | **○** | ✕ | ○ |
| 図が悪化しない | ○ | ○ | **○** | ✕（空行が空く） | ○ |
| TPL-2161 の対処パターン | ✕ | ○ | ○（並びの存在は宣言由来） | ○ | ✕ |
| 変更量 | 最小 | 中（新オプション配線） | 中（同じ） | 小 | ゼロ |
| slice B / #2176 への準備 | △ | ○ | ○ | ✕ | ✕ |

## 現時点の方針

**案 2' を採用する** — 群の**存在**を宣言から取り戻しつつ、群の**並び**は今日の観測された順序
（= 宣言順）をそのまま保つ。#2178 が「多重所属の無いモデルは byte-identical」を受け入れ条件に
しているため、band 順を動かしうる案 1 / 案 2 はこのスライスでは採れない。影に入った boundary に
frame を与えるのは配置の問題であり [#2176](https://github.com/kompiro/karasu/issues/2176) が受け持つ
（`presentGroups` は緩めない）。

**slice A のユーザー可視の変化は診断の文言だけになる。** 上位設計 A-4 が期待した「消えていた枠が
出る」は slice A では起きない（上記実測 2）。この点は上位設計「spike の実測」節の記述の側が正しく、
A-4 本文の記述は本 doc の決定で置き換える（ADR 昇格時に一本化する）。

### 実装の指針

1. **model 層**（`types/ast.ts` / `parser/parser.ts`）
   - `KrsFile.boundaryIndex` → `boundaryMembership: Map<string, string[]>`、
     `scopedBoundaryIndex` → `scopedBoundaryMembership: Map<string, Map<string, string[]>>`。
     1:1 の並行フィールドは作らない（[TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)）。
   - `primaryBoundaryOf(ids) => ids[0]` を `ast.ts` に追加（`boundaryScopeKey` 等と同居）。
   - `buildBoundaryMembership` / `buildScopedBoundaryMembership`: 宣言順で全件保持し、同一
     (node, boundary) は冪等。`duplicate-boundary-assignment`(info) は **異なる** boundary が
     2 件目以降に現れたときだけ出す（同一ブロック内の `contains X` 重複では出さない — 今日は出るが、
     「複数の boundary に所属する」は偽になるため）。
2. **merge 3 経路**
   - `fs/import-resolver.ts:263`: first-mapping-wins をやめ和集合（冪等・first-seen 順）。scoped も同様。
   - `compile/compile-diff.ts:236`: 配列単位の backfill。`removed` 限定ガードを維持（[ADR-1886](../adr/1886-group-by-diff-removed-node-placement-and-aggregated-edge-state.md)）。
   - `layout.ts` `boundaryAxisFor`: scoped 勝ち（node 単位で scoped 配列が top-level 配列を置き換える）。
3. **軸の配線**（[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)）
   - `boundaryAxisFor` は `Map<string, string[]>` を返す。placement 用の 1:1 は
     `primaryAxisOf`（`primaryBoundaryOf` を全エントリに適用する純関数）で作る。
   - 新オプション `declaredGroupOrder?: readonly string[]` を `LayoutOptions` / `RenderOptions` に足し、
     `svg-renderer` / `drill-down-svg` / `all-layers-svg` / `compile` / `compile-diff` に通す。
     生産側は `group-labels.ts` の `declaredGroupIds` を順序付きに一般化した関数
     （`declaredGroupIds` はその配列から `Set` を作る形に寄せて SoT を 1 つにする）。
     まずは `groupBy === "boundary"` のときだけ渡し、team 軸は現状の導出を維持する（stable 軸を触らない）。
   - `collapseAndAssignGroupLayers` は `declaredGroupOrder` を引数で受け取る（team 軸は今日どおり
     `[...new Set(groupIndex.values())]`、boundary 軸は案 2' の合成結果）。
4. **診断**（`packages/i18n` en/ja/types。コードと `info` severity と params は不変）
   - en: `"X" belongs to more than one boundary (including "P")`
   - ja: `"X" は複数の boundary に所属しています（"P" を含む）`
   - ビューの解決規則は書かない（[TPL-1386](../test-perspectives/TPL-1386-diagnostic-register-fact-vs-style.md)）。
     解決規則は `docs/spec/syntax.md`（+ja）の boundary 節に置く。
5. **テスト**
   - `parser.test.ts` / `scoped-boundary.test.ts`: N 宣言 → N 件、冪等性、診断の register と params。
   - 新規 `packages/core/src/renderer/boundary-membership.test.ts`: merge 3 経路の一致
     （multi-file 和集合 / diff backfill / scope 合成、[TPL-2032](../test-perspectives/TPL-2032-reference-existence-validated-on-merged-space.md)）、
     案 2' の合成関数の単体テスト（影に入った群・`contains` ゼロの群が並びに現れる／先頭列は
     軸の値順のまま）、多重所属モデルが `compile` / diff / drill-down / all-layers の全経路で
     同じ枠を得る parity（軸の落下は silent、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)）。
   - 多重所属の無いモデルの描画不変（byte-identical）を固定する回帰テスト。
6. **ドキュメント / 記録**
   - `docs/spec/syntax.md` +ja: 「Membership indexes」の 1:1 記述を 1:N + banded view は primary を枠に入れる、に書き換え。
   - `docs/spec/diagnostics.md` +ja: `duplicate-boundary-assignment` の行を事実の register に。
   - `TPL-2161` の「関連テスト」節（現在「未確立」）を新規テストで埋める。
   - changeset: `@karasu-tools/core` + `karasu` の minor。
7. **AT**: `docs/acceptance/2161-boundary-multi-membership.md` を新規作成し、slice A 節を置く。
   自動化で判定できない項目だけを載せる:
   - [ ] 多重所属モデルを app の *Group by: Boundary* で開き、**配置とフレームが slice A 前と変わらない**こと。
   - [ ] `duplicate-boundary-assignment` が info として診断リストに出て、文言が model の事実だけを述べていること
         （「最初に宣言された boundary を採用」のような view の解決規則を含まない）。
8. **ADR 昇格**: 3 スライス完了後に `docs/adr/2161-boundary-membership-1n.md` として昇格し、
   上位設計 `boundary-membership-1n.md` と本 doc を同 PR で削除する（`refines: [ADR-1974]`）。

### proactive TPL の要否

本 doc の中心論点（群の並び・存在を派生 index の値集合から導かない）は
[TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md)
が失敗モード「群そのものの消失」と対処パターン「並びは宣言から、所属は index から」で**既に掲載済み**。
3-Yes ルールの「既存 TPL に未掲載」を満たさないため新規 TPL は起こさず、同 TPL の「関連テスト」節を
slice A の実装 PR で埋める（本 doc の実装指針 6）。

### 影響範囲・マイグレーション

- **既存ユーザーへの影響**: `.krs` の書き方は不変。多重所属の無いモデルは描画・診断とも不変。
  多重所属を書いているモデルは診断の文言が変わる（experimental notation の範囲内）。
- **TS API**: `KrsFile.boundaryIndex` / `scopedBoundaryIndex` の改名・型変更（0.x minor、[ADR-1314](../adr/1314-krs-spec-v1-freeze.md)）。
  `RenderOptions` に `declaredGroupOrder` が増える（任意フィールド）。
- **ドキュメント更新**: `docs/spec/syntax.md`（+ja）、`docs/spec/diagnostics.md`（+ja）、`TPL-2161`。
- **examples への影響**: なし（多重所属の例を足すかは slice B で判断 — 上位設計の記述を踏襲）。
