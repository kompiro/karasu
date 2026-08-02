# boundary 所属の 1:N 一般化と、banded view の多重包含描画（ADR-1974 refine）

- **日付**: 2026-07-30
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2161](https://github.com/kompiro/karasu/issues/2161)（`docs/design/tags-and-facets.md` §「所属モデルの一般化」/ PR [#2155](https://github.com/kompiro/karasu/pull/2155) からの分離。親 [#2065](https://github.com/kompiro/karasu/issues/2065)、boundary 系譜 [#1822](https://github.com/kompiro/karasu/issues/1822) / [#1974](https://github.com/kompiro/karasu/issues/1974) / [#2036](https://github.com/kompiro/karasu/issues/2036)）
  - follow-up: [#2176](https://github.com/kompiro/karasu/issues/2176)（seam 配置 + co-membership band 順 — slice B から分離）
  - **refine 対象 ADR**: [ADR-1974](../adr/1974-boundary-declaration-syntax.md)（決定 2 の「1:1 + first-wins」）
  - 関連 ADR: [ADR-2036](../adr/2036-scoped-boundary-declaration.md)（スコープ宣言 — identity =（宣言スコープ, id）、collapse 独立）、[ADR-1983](../adr/1983-boundary-drilldown-grouping.md)（軸 index × 描画レベルの交差。「nested `boundary`」を *1:1 前提が壊れる* ことを理由の一つに deferred）、[ADR-1858](../adr/1858-system-view-group-by-team.md)（team 軸 = 本件が触らない先行機構）、[ADR-1884](../adr/1884-group-by-team-multi-system-root-per-system-frames.md)（multi-system root の per-system フレーム）、[ADR-1886](../adr/1886-group-by-diff-removed-node-placement-and-aggregated-edge-state.md)（diff の grouping / backfill）、[ADR-1859](../adr/1859-system-view-p2c-grouped-edge-routing-and-marks.md)（P2c grouped routing — frame を障害物として使う側）、[ADR-2120](../adr/2120-group-by-bulk-collapse.md)（bulk collapse）、[ADR-1820](../adr/1820-notation-promotion-gate.md)（promotion gate — `boundary` は experimental）、[ADR-1314](../adr/1314-krs-spec-v1-freeze.md)（`.krs` v1.0 freeze / TS API は 0.x）
  - 関連 TPL: [TPL-1738](../test-perspectives/TPL-1738-relayout-into-group-preserves-placement-and-edges.md)（**全要素ちょうど一度配置** — 本設計の最重要制約）、[TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)、[TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)（派生 state の二重持ち）、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)（軸を全 call site に通す）、[TPL-1983](../test-perspectives/TPL-1983-view-state-gate-parity-across-surfaces.md)、[TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)、[TPL-1386](../test-perspectives/TPL-1386-diagnostic-register-fact-vs-style.md)、**新規 proactive** [TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md)
  - コード: `packages/core/src/parser/parser.ts:2146`（`buildBoundaryIndex`）/ `:2178`（`buildScopedBoundaryIndex`）、`packages/core/src/types/ast.ts:495`（`KrsFile.boundaryIndex`）、`packages/core/src/renderer/layout.ts:74`（`buildGroupFrames`）/ `:1014`（`boundaryAxisFor`）/ `:1029`（`collapseAndAssignGroupLayers`）、`packages/core/src/renderer/group-layout.ts:248`（`assignGroupedLayers`）、`packages/core/src/renderer/group-collapse.ts:85`（`collapseGroups`）、`packages/core/src/renderer/edge-routing-groups.ts:771`（`buildFrameOfNode`）、`packages/core/src/fs/import-resolver.ts:263`、`packages/core/src/compile/compile-diff.ts:232`

## 背景・課題

[ADR-1974](../adr/1974-boundary-declaration-syntax.md) 決定 2 は `boundaryIndex` を **1:1（node id → boundary id）** と定め、多重所属を宣言順 first-wins で解決し、捨てた側を info 診断 `duplicate-boundary-assignment` で観測することにした。根拠として記録されているのは「**開閉フレームの識別子は 1 ノード 1 値でなければならない**」であり、これは collapse が 1 stub・banded 配置が 1 band であるという **配置（view）の要件**である。同じ ADR は「多重所属は許容し、precedence で primary を選ぶ」とも明記しており、**所属（model）を 1 値に限るとは決めていない**。

現実装はこの view 要件を model 層の index 導出に焼き付けている。`buildBoundaryIndex` は 2 つ目以降の所属を `index.set` せずに捨てるため、**宣言された事実がパース時に失われ、どのビューからも復元できない**。banded view 以外（詳細パネル・legend・監査/export・将来の overlay）が full membership を必要としても、供給源が無い。これはレイヤ違反であり、[#2065](https://github.com/kompiro/karasu/issues/2065) の設計レビュー（2026-07-28）で **所属は model 層で 1:N（boundary / facet 共通）、各ビューが必要な解決を行う**という原則として確定した。

副作用として、今日は次の観測可能な欠落がある:

- **完全に影に入った boundary はフレームごと消える。** `collapseAndAssignGroupLayers` は `declaredGroupOrder = [...new Set(groupIndex.values())]` で軸 index から群の並びを導く。boundary B のメンバー全員が先行する A に取られると B は index に 1 件も現れず、`assignGroupedLayers` の対象にならないため **band もフレームも生まれない**。宣言された `boundary` が受理され、label まで解決され（`buildBoundaryLabelIndex` は宣言から作る）、それでも図に何も出ない — [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md) が禁ずる「受理・無効果」状態に隣接する。
- **診断の register がずれている。** `duplicate-boundary-assignment` の現メッセージは「最初に宣言された boundary を採用」＝捨てた事実を述べており、読み手には smell に見える。多重所属が正常状態になる以上、事実（「複数の boundary に所属する」）を述べる register に直す必要がある（[TPL-1386](../test-perspectives/TPL-1386-diagnostic-register-fact-vs-style.md)）。
- **banded view の描画理想が未達。** [#2065](https://github.com/kompiro/karasu/issues/2065) レビューは「多重所属ノードは、宣言されている**すべての**フレームに包含されて描かれる（Euler 図的な重なり）。ノードの配置は 1 回のまま（[TPL-1738](../test-perspectives/TPL-1738-relayout-into-group-preserves-placement-and-edges.md)）」を到達点と定め、**first-wins primary 配置は暫定**と位置づけた。

## 現状（インベントリ）

| 層 | 場所 | 現状 | 1:N 化での扱い |
| --- | --- | --- | --- |
| parser（top-level） | `parser.ts:2146` `buildBoundaryIndex` | `Map<nodeId, boundaryId>`。2 件目以降を捨て info 診断 | full membership を返す |
| parser（scoped #2036） | `parser.ts:2178` `buildScopedBoundaryIndex` | `Map<scopeKey, Map<childId, boundaryId>>`。同上 | 値を配列化 |
| AST | `ast.ts:495` / `:508` | `boundaryIndex` / `scopedBoundaryIndex` | 型を配列に変更（0.x TS API） |
| multi-file merge | `import-resolver.ts:263` | 「first mapping seen を保つ」= ファイル横断でも first-wins | 和集合（重複は冪等） |
| diff merge | `compile-diff.ts:232` / `:244` | after を基に removed ノードの before 所属を backfill | 配列単位で同じ backfill |
| 軸の解決 | `layout.ts:1014` `boundaryAxisFor` | scoped が同一 node を指すと top-level を上書き（より具体的が勝つ） | **この上書き規則は維持**（下記） |
| 群の並び | `layout.ts:1066` | `[...new Set(groupIndex.values())]` | 配列を flatten して first-appearance 順 |
| 配置 | `group-layout.ts:248` `assignGroupedLayers` | `groupId: string \| null` で 1 群 1 band | primary で band を決める（slice A）→ seam 配置（slice B） |
| フレーム | `layout.ts:74` `buildGroupFrames` | メンバーの bbox。「frames are disjoint by construction」 | 矩形直交ポリゴンへ（slice B） |
| collapse | `group-collapse.ts:85` `collapseGroups` | `ownerIndex.get(id)` が collapsed 集合にあれば畳む | 「全所属が collapsed のときだけ畳む」（slice C） |
| routing | `edge-routing-groups.ts:771` `buildFrameOfNode` | 「disjoint なので高々 1 つ一致」で `break` | ノード → フレーム**集合**へ（slice B） |
| label | `group-labels.ts:103` | 宣言から構築（membership 非依存） | 変更なし |

## 制約・前提

- **配置はちょうど一度**（[TPL-1738](../test-perspectives/TPL-1738-relayout-into-group-preserves-placement-and-edges.md)）。多重所属を「ノードを複製して各フレームに置く」で解いてはならない。重なるのは**フレームの側**。
- **`boundary` は experimental のまま**（[ADR-1820](../adr/1820-notation-promotion-gate.md)）。本件は experimental 層内の refine であり stable 昇格ではない。
- **文法変更ゼロ。** `.krs` の書き方は一切変わらない。変わるのは受理済みの記述の解釈（捨てない）と描画。
- **team 軸（`ownerIndex`）は触らない。** 構造は同型（1:1 first-wins + `duplicate-owner-assignment`）だが、team の precedence は `@migration_target` による意味づけを持ち（ADR-1566）、`organization` / `owns` は stable 構文である。同じ一般化を stable 軸に波及させる判断は本設計の範囲外とし、新規 proactive TPL が将来の再訪点を保持する。
- **`.krs` v1.0 freeze との関係**: 言語仕様は不変。`@karasu-tools/core` の TS API は 0.x で minor 破壊可（[ADR-1314](../adr/1314-krs-spec-v1-freeze.md)）なので、`KrsFile` のフィールド型変更は許容される。
- out of scope: boundary の入れ子（[ADR-1983](../adr/1983-boundary-drilldown-grouping.md) で deferred のまま — 本件は boundary 同士の**階層**ではなく**重なり**を扱う）、cross-system boundary、deploy / org view への適用、facet overlay（[#2065](https://github.com/kompiro/karasu/issues/2065) Part B が独立に持つ）。

## Part A — model 層を 1:N にする

> **実装時の訂正**: 下記 A-4 の「band とフレームを得る」は成り立たなかった（`presentGroups` が
> メンバーのいない群を落とすため）。到達点は「群の**並び**に復活する」までで、枠は
> [#2176](https://github.com/kompiro/karasu/issues/2176) が受け持つ。導出元も flatten ではなく
> 「軸の値順 + 宣言リストで補完」に変更した。経緯は `docs/design/boundary-membership-slice-a.md`。

### A-1. index の形

```ts
/** 宣言されたすべての所属を宣言順で保持する。banded view の primary は [0]。 */
boundaryMembership: Map<string, string[]>;
scopedBoundaryMembership: Map<string, Map<string, string[]>>;
```

**`boundaryIndex` を残して二本立てにはしない。** 派生 1:1 マップを併存させると SoT が 2 つになり、片方だけ更新される drift を招く（[TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)）。primary が要るのは banded 配置の 1 箇所だけなので、**純関数 1 つ**に閉じる:

```ts
export const primaryBoundaryOf = (ids: readonly string[] | undefined): string | undefined => ids?.[0];
```

`boundaryIndex` → `boundaryMembership` の改名は、`svg-renderer` / `drill-down-svg` / `all-layers-svg` / `compile` / `compile-diff` / `import-resolver` / `layout` の各 option と受け渡しに波及する。**軸を一箇所でも通し漏らすと軸が黙って落ちる**既知の失敗クラスなので、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md) を柵にして call site を列挙する。

### A-2. merge の意味論

- **multi-file**（`import-resolver.ts:263`）: first-wins をやめ **和集合**にする。同じ (node, boundary) の重複は冪等にマージし、順序は最初に現れたファイルの宣言順を保つ（決定論）。
- **diff**（`compile-diff.ts:232`）: 現在の backfill 規則（*removed* なノードだけ before 側の所属を復元し、after に所属があるノードは触らない）を配列単位でそのまま踏襲する。[ADR-1886](../adr/1886-group-by-diff-removed-node-placement-and-aggregated-edge-state.md) の「stale な before を継承させない」ガードは維持。
- **top-level × scoped の重なり**（`boundaryAxisFor`）: **現行の「scoped が勝つ」規則を維持する。** これは「より具体的な宣言が、その canvas 上での所属を述べ直す」という [ADR-2036](../adr/2036-scoped-boundary-declaration.md) の意味論であって、捨てられた事実ではない（top-level の所属は他の canvas では生きている）。1:N 化しても両者を無条件に和集合にはしない。

### A-3. 診断の register

`duplicate-boundary-assignment`（info）は**コードも severity も維持**し、メッセージだけ事実の register に直す。

| | 現在 | 変更後 |
| --- | --- | --- |
| ja | 「node が複数の `boundary` に含まれる（事実。最初に宣言された boundary を採用）」 | 「node が複数の `boundary` に所属する」 |
| en | "A node is listed in more than one `boundary` (a fact; the first-declared boundary is kept)." | "A node belongs to more than one `boundary`." |

**ビューがどう解決するかをメッセージに書かない。** 書くと slice B（多重包含描画）で必ず陳腐化する。解決規則の説明は `docs/spec/syntax.md` の boundary 節に置く。params `{ nodeId, existingBoundary }` は i18n 互換のため維持する（`existingBoundary` = primary、文中では「他の boundary」の一例として提示）。

### A-4. 影に入った boundary の復活

`declaredGroupOrder` を membership 配列の flatten から作れば、全メンバーが他 boundary と共有の boundary も群として現れ、band とフレームを得る。slice A の時点では primary 配置のままなので、**そのフレームは共有メンバーを含まない部分集合の枠**になる（メンバーが 1 人も primary でなければ band は空 → フレーム無し）。完全な解消は配置の問題であり [#2176](https://github.com/kompiro/karasu/issues/2176) に属する。slice A では「今日消えていたものが（部分的にでも）出る」までを担保し、テストで固定する。

> slice A 単独でのユーザー可視の変化は、この A-4 と A-3 の文言のみ。ノードの配置・フレーム形状は不変。

## Part B — banded view の多重包含描画

### 検討した選択肢

#### 案 1: 矩形直交ポリゴン frame（採用候補）

フレームを `ContainerRect`（単一矩形）から**矩形直交ポリゴン**（メンバーが占めるセルの矩形和）に一般化する。多重所属ノードの位置でフレーム同士が自然に重なる。あわせて `orderGroups` のコスト関数に **co-membership 項**（共有メンバーを持つ群を隣接させたい）を加え、共有ノードを 2 つの band の**継ぎ目（seam）**行に寄せることで、重なりを小さな L / T 字に収める。

```
┌─ A ─────────────┐
│  n1    n2       │
│   ┌─────────────┼──── B ──┐
│   │  X (A∩B)    │   n3    │
└───┼─────────────┘         │
    │       n4              │
    └───────────────────────┘
```

**メリット**

- 「宣言されたすべてのフレームに包含される」という #2161 の到達点をそのまま実現する。ノードの配置は 1 回（TPL-1738 を満たす）。
- 所属の**任意の重なり方**（3 重、部分重複）を原理的に表現できる。縮退は品質の問題であって表現可能性の問題にならない。
- 群の並び最適化（co-membership 隣接）は既存の min-feedback-arc-set の tie-break にコスト項を足すだけで、`orderGroups` の構造を変えない（実施は [#2176](https://github.com/kompiro/karasu/issues/2176)）。

**デメリット**

- フレームのプリミティブ変更が広い: `ContainerRect` の生産（`buildGroupFrames`）・描画（SVG `<path>` + 角丸）・ラベル配置・**P2c routing の障害物判定**（`buildFrameOfNode` の「高々 1 つ一致 / `break`」が前提ごと崩れる）。
- 重なり領域では「どちらのフレームの内側か」が一意でなくなり、[TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md) の penetration 計測の定義を見直す必要がある（同一 boundary 内エッジが重なり領域を通るのは penetration ではない、等）。
- 非隣接 band 間の共有（band 順の最適化でも隣接させられないケース）では、細い回廊（corridor）を引くか縮退に落ちるかの判断が要る。
- **単色のままでは重なりが「入れ子」に読める**（spike 実測。下記「spike の実測」）。多重包含を成立させるには boundary ごとの識別が要る。

#### 案 2: 共有ノード専用の intersection band

隣接する 2 つの boundary の間に共有ノード専用の帯を挿入し、**両フレームを矩形のままその帯まで伸ばす**。

**メリット**

- `ContainerRect` を維持でき、描画・routing・ラベルに手を入れずに済む。実装量が案 1 の数分の一。
- 「重なり = 中央の帯」という読み方が明快。

**デメリット**

- **3 重所属・非隣接ペアを原理的に表現できない**。縮退が表現可能性の欠落として恒久的に残る。
- 帯の挿入が band 順を強制するため、依存の流れ（min-FAS で決まる縦順）と競合する。共有ペアが複数あると帯が乱立し、縦方向の情報密度が落ちる。
- 「フレームは矩形」という前提を温存するので、将来 facet overlay（[#2065](https://github.com/kompiro/karasu/issues/2065)）や nested boundary（[ADR-1983](../adr/1983-boundary-drilldown-grouping.md) deferred）で同じ壁に再度ぶつかる。

#### 案 3: primary 配置 + 副次インジケータ（現状の延長）

ノードは primary フレームに置き、他の所属はカード上のバッジや副次フレームへの破線 tether で示す。

**メリット**: 実装が最小。多重所属が「読める」ようにはなる。
**デメリット**: #2161 が明示的に「first-wins primary は理想ではない」と決めた地点に留まる。包含関係を図形で示さないため、フレームを collapse したときに何が畳まれるのかが図から読めない。

#### 案 4: 各フレームにノードを複製して置く（却下）

[TPL-1738](../test-perspectives/TPL-1738-relayout-into-group-preserves-placement-and-edges.md) の「全要素ちょうど一度配置」を正面から破る。エッジ端点がどの複製に付くかが決まらず、drill / permalink / diff の identity も壊れる。検討対象にしない。

### 比較

| 観点 | 案 1 直交ポリゴン | 案 2 intersection band | 案 3 副次インジケータ |
| --- | --- | --- | --- |
| #2161 の到達点（全フレームが包含） | ○ | △（隣接 2 重のみ） | ✕ |
| 3 重以上・非隣接の表現 | ○ | ✕ | △（記号として） |
| 配置ちょうど一度（TPL-1738） | ○ | ○ | ○ |
| 変更範囲 | frame 生産 / 描画 / label / routing 障害物 / penetration 計測 | band 挿入のみ | カード装飾のみ |
| band 順（min-FAS）との干渉 | 小（tie-break にコスト項） | 大（帯の挿入が順序を強制） | 無し |
| 将来（facet overlay / nested boundary） | 同じ機構を再利用できる | 同じ壁に再度ぶつかる | — |

### 採用と縮退規則

**案 1（矩形直交ポリゴン frame）を採る。** 案 2 は安いが、表現可能性の欠落が恒久的に残り、#2161 が到達点として決めた「すべてのフレームが包含する」を条件付きでしか満たせない。案 1 の重い部分（routing の障害物判定）は、どのみち nested / overlay の方向で一度は通る道である。

ただし v1 の品質保証は次の縮退規則で明示的に限る:

1. **配置は変えない。** 共有ノードは今までどおり primary の band に置かれる。フレームが他 band のメンバーに届くかどうかは**そのときの band 順次第**であり、v1 の多重包含は日和見的（opportunistic）である。band 順への co-membership 項と seam 行配置は
   [#2176](https://github.com/kompiro/karasu/issues/2176) に切り出した（2026-07-30 決定 — 下記「spike の実測」を受けて slice B から外した）。
2. 届かない共有は、**primary フレームのみが包含し、他の所属はカード下端の破線タブで示す**（spike の案 B）。タブはフレームと同じ破線言語で描き、`◇ <boundary>` を載せる。落ちた事実は info 診断としても観測可能にする（コード名は実装時に決める。`duplicate-boundary-assignment` とは別 — あちらは model の事実、こちらは view の解決結果）。
3. **boundary ごとに識別色を与える**（2026-07-30 決定）。単色では重なりが入れ子に読めることが spike で実測されたため、色は装飾ではなく多重包含の成立条件である。フレームの見た目は
   [ADR-1858](../adr/1858-system-view-group-by-team.md) / [ADR-1974](../adr/1974-boundary-declaration-syntax.md) が「全フレーム同じ破線」で確定させているので、**昇格 ADR でこの変更を明記する**。team 軸のフレームは単色のまま（本設計は boundary 軸のみを変える）。
4. **偽の包含は作らない。** フレームが非メンバーを図形的に囲む形（bbox の素朴な拡張）は、いかなる縮退でも採らない。

### spike の実測（2026-07-30）

`spike/boundary-multi-containment` ブランチで Part B を実装し、`compile(src, { groupBy: "boundary" })` の
出力で確認した。フィクスチャは 3 つの boundary が総当たりでメンバーを共有するモデル（`payments ∩ ledger`・
`ledger ∩ risk` は帯が隣接、`risk ∩ payments` はあいだに ledger が入る）。

- **伸ばしたフレームは L / T 字にならず矩形に潰れる。** ledger のフレームの実測値は、伸ばした部分が
  `x 55–245`、帯の本体が `x 54–246`。カード幅が帯幅とほぼ同じなので、切り欠きが視認できるほどの差が出ない。
  本設計の前版が想定していた「1 行分の小さな L / T 字」はこの配置では現れず、**背の高い矩形が 2 つ重なる**形になる。
  重なりを伝えるのは切り欠きの形ではなく、**2 つのフレームの縦の範囲がずれて同じカードを囲むこと**である。
- **単色では入れ子に見える。** ジオメトリが完全に同一で線の色だけが違う 2 枚を比べると、単色では
  「payments の中に ledger が入っている」と読めてしまう。識別色で初めて「別々の枠が 1 枚のカードで重なる」と読める（決定 3 の根拠）。
- **自前の band を持たない boundary には伸ばす元の矩形が無い。** メンバー全員が他 boundary と共有の boundary は
  primary 軸に 1 件も現れず、フレームもラベルも描かれなかった（背景の指摘が実測で再現）。slice A は群の並びに
  その boundary を復活させるが、**body を与えるわけではない** — 解消は配置の問題であり [#2176](https://github.com/kompiro/karasu/issues/2176) が受け持つ。
- **フレームのタイトルは帯の本体に置く。** 伸ばした分だけ記録上の矩形を広げると、タイトルが伸びた先のカードに重なった。
  記録する矩形は band の本体のままにして、描画だけポリゴンにする。
- **グリフは同梱フォントの範囲で選ぶ。** タブの当初案 `⧉`（U+29C9）は同梱 Noto の範囲外で PNG 書き出しが豆腐になった。
  `◇`（U+25C7）に変更。実装時に `packages/app/src/render/png-font-coverage.test.ts` のカバレッジ集合へ追加する
  （[TPL-1799](../test-perspectives/TPL-1799-raster-pipeline-glyph-coverage.md)）。

## Part C — collapse の二重性

boundary A が collapsed、B が expanded で、ノード X が A ∩ B のとき X をどうするか。

| 案 | 規則 | 評価 |
| --- | --- | --- |
| **C-1（採用）** hide-when-**all**-collapsed | X はその canvas 上の**所属がすべて collapsed のときだけ**畳まれる。1 つでも expanded なら X は可視のまま、その expanded フレームの中に描かれる | collapse を「その群のメンバーを隠す操作」ではなく「その群のフレームを畳む操作」と読む。expanded な B のフレームは自分のメンバーを引き続き全部囲む — 「各フレームはそのレベルの member でフレームを組む」（[ADR-1983](../adr/1983-boundary-drilldown-grouping.md)）と整合 |
| C-2 hide-when-**any**-collapsed | X は最初に collapsed な所属の stub に畳まれる | A を畳むと、無関係な B のフレームから黙ってノードが消える。ユーザーの操作対象（A）と結果（B の中身が減る）が一致せず、[ADR-2036](../adr/2036-scoped-boundary-declaration.md) が確立した collapse 独立性とも噛み合わない |
| C-3 stub の中にゴースト複製 | X を可視のまま、A の stub にも小さく複製 | 配置ちょうど一度に違反（TPL-1738） |

C-1 の帰結として決めること:

- **stub のカウント**: `<Boundary> (N)` の N は **実際に畳まれた（不可視になった）ノード数**とする。今日の `collapseGroups` の数え方（畳んだノードを数える）をそのまま維持でき、「N 個が隠れている」という stub の意味とも一致する。model 上の総メンバー数は詳細パネル側の情報。
- **0 件の stub は出さない**: collapsed な A のメンバーが全員 expanded な他フレームで可視なら、畳むものが無い。`A (0)` を描かず **stub を生成しない**（A のフレームは collapsed の間ただ描かれない）。
- **エッジの再ターゲット**: `collapseGroups` の remap は「不可視になったノード」だけに適用する。可視のまま残る X を端点に持つエッジは id が変わらないので、[TPL-1886](../test-perspectives/TPL-1886-rekey-transform-preserves-per-element-decoration.md) / [TPL-1738](../test-perspectives/TPL-1738-relayout-into-group-preserves-placement-and-edges.md) の端点保持はむしろ易しくなる。ただし `remapEndpoint` を使う **ghost edge を含む全 parallel edge リスト**が同じ述語を通ることは従来どおり柵にする。
- **bulk collapse**（[ADR-2120](../adr/2120-group-by-bulk-collapse.md)）: 全群 collapsed は「すべての所属が collapsed」を自動的に満たすので、今日の「群依存 DAG ビュー」は不変。共有ノードは、どの stub に畳まれるかを決める必要がある — **配置された群の stub に畳む**。畳まれたノードは 1 つの stub にだけ数えられる（重複カウントしない）。
  > **実装時の訂正**（#2180）: 本節は当初「primary の stub」と書いていたが、[#2176](https://github.com/kompiro/karasu/issues/2176) の `resolvePlacementAxis` は body を持たない boundary に体を与えるためノードを primary 以外へ claim しうる。stub はそのノードが占めていた帯に置かれるので、畳み先は**配置された群**とした。claim が起きていなければ両者は一致する。

## 現時点の方針

**Part A（1:N 化）→ Part B（直交ポリゴン frame）→ Part C（collapse 二重性）の順に、独立して出荷できる 3 スライスで積む。** 各スライス単体でも図が悪化しないことを [ADR-1974](../adr/1974-boundary-declaration-syntax.md) の実装分割（A/B/C）と同じ規律で守る。

### スライス別の切り方

各スライスを独立に出荷できると判断した根拠と、依存関係だけをここに置く。
**各スライスで何ができるようになるか / その時点でまだできないことは、親 Issue
[#2161](https://github.com/kompiro/karasu/issues/2161) の `## Slice status` を参照する**
（`docs/process.md`「複数スライスに分けるときの追跡」— 到達点の一覧は本 Doc が
ADR 昇格で削除されても残る場所に置く）。

| スライス | 前提 | 独立に出荷できる理由 |
| --- | --- | --- |
| **A** model 層の 1:N 化（[#2178](https://github.com/kompiro/karasu/issues/2178)） | — | 描画は primary で従来どおり。モデルが多値を保持しても banded view の見た目は変わらないため、A 単体で図が悪化しない |
| **B** 多重包含 geometry（[#2179](https://github.com/kompiro/karasu/issues/2179)） | A | 届かない共有は縮退タブに落ちるので、band 順が味方しないケースでも「囲めていない」ことが図の上で明示され、壊れた見え方にならない |
| **配置** seam 配置 + band 順（[#2176](https://github.com/kompiro/karasu/issues/2176)） | A（**B より先に実施した** — 下記「#2176 を B より先に実施した」節） | 枠は矩形のまま隣接と行位置だけを動かすので、B 未達でも図として成立する。共有が無いモデルではコスト項が全 permutation で 0 になり band 順が完全に不変 |
| **C** collapse 二重性（[#2180](https://github.com/kompiro/karasu/issues/2180)） | A | 判定は membership だけで決まり geometry に依存しない。ただし stub と枠の見え方は B と併せて確認する |

> **途中スライスの縮退は仕様である。** slice A で多重所属ノードが 1 つの枠にしか
> 現れないのは banded layout が 1 ノード 1 band だからで、モデルは両方の所属を持っている。
> 検証用サンプル `examples/en/feature-samples/boundary-multi-membership.krs` は
> この点を先頭のコメントで明示している。

### 実装の指針

本 Design Doc の合意後、次の 3 Issue に分割起票する（#2161 は親として残す）。

**slice A — model 層の 1:N 化（[#2178](https://github.com/kompiro/karasu/issues/2178) / PR [#2213](https://github.com/kompiro/karasu/pull/2213)）**

> 実装粒度の設計と、A-4 の到達点の決め直しは `docs/design/boundary-membership-slice-a.md` にある。

1. `buildBoundaryIndex` / `buildScopedBoundaryIndex` を full membership に変更、`KrsFile` のフィールドを `boundaryMembership` / `scopedBoundaryMembership` に改名・型変更、`primaryBoundaryOf` を追加。
2. merge 3 箇所（import-resolver 和集合 / compile-diff backfill / `boundaryAxisFor` の scoped 優先維持）。
3. 軸の受け渡し call site を列挙して通す（`svg-renderer` / `drill-down-svg` / `all-layers-svg` / `compile` / `compile-diff` / `layout`）— TPL-219 の parity テスト。
4. 群の並びに宣言由来の補完を入れる（A-4）。**flatten は採らなかった** — 宣言順を壊すことが実測で判明し、
   「軸の値順 + 宣言リストで補完」に変更した（`docs/design/boundary-membership-slice-a.md`）。
5. 診断文言の差し替え（`packages/i18n` en/ja）+ `docs/spec/diagnostics.md`（+ja）+ `docs/spec/syntax.md`（+ja）の boundary 節に「所属は 1:N、banded view は primary を枠に入れる」を明記。
6. changeset: `@karasu-tools/core` + `karasu` の minor（診断文言と TS API の変更）。

**slice B — 多重包含 geometry（配置は含まない）**

1. `ContainerRect` を矩形直交ポリゴン対応に一般化（既存の単一矩形はその退化形）。SVG 描画・ラベル配置・drawio export の扱いを確認。記録する矩形は band 本体のまま（タイトル位置のため）。
2. `buildGroupFrames` をセル和ベースに置換し、他 band のメンバーへ届く場合はポリゴンにする。
3. boundary ごとの識別色（縮退規則 3）。legend との整合を確認する。
4. 縮退タブ（縮退規則 2）+ font coverage テストへのグリフ追加 + info 診断。
5. `edge-routing-groups.ts` の `buildFrameOfNode` を frame **集合**に一般化し、P2c の「同一群内か」判定と penetration 計測の定義を更新（TPL-1927 の計測で退行がないことを確認）。

> 配置（`orderGroups` の co-membership 項・seam 行）は **slice B に含めない** — [#2176](https://github.com/kompiro/karasu/issues/2176)。
> したがって slice B 時点の多重包含は日和見的で、届かない共有は縮退タブで示される。

**配置 — seam 配置 + co-membership band 順（[#2176](https://github.com/kompiro/karasu/issues/2176)）**

1. `orderGroups` のコスト tuple を `(逆流エッジ重み, 逆流エッジ本数, co-membership 分離, 総スパン)` にする。
   min-FAS を先頭、宣言順を最終 tie-break に据えたまま、共有メンバーを持つ群を隣接させる項を
   span の**上**に挟む。共有が無いモデルでは全 permutation で 0 になり比較を素通りするので、
   **今日の band 順は完全に不変**。群が 8 を超える greedy 分岐は、`(w, n)` を悪化させない
   隣接スワップ改善パスのみの best-effort（保証しない — 到達できない共有は縮退に落ちる）。
2. band 内の seam bias。共有ノードは、相手の band が**真上**なら先頭行、**真下**なら最終行へ寄せる。
   ただし band 内の依存エッジが許すときだけ（最終行へは band 内の後続を持たないとき、先頭行へは
   band 内の先行を持たないとき）。**依存の流れが優先**する。行 index を書き換えるだけで
   entry の増減が無いため「全要素ちょうど一度」は構造的に保たれる（[TPL-1738](../test-perspectives/TPL-1738-relayout-into-group-preserves-placement-and-edges.md)）。
3. 自前の band を持たない boundary（下記「#2176 決定 3」）。
4. P2c routing の再計測（[TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)）:
   共有ありフィクスチャで penetration == 0 / collinear overlap 0 を維持、crossings は観測値として記録。

### #2176 決定 3 — 自前の band を持たない boundary は共有メンバーを 1 つ引き取る

メンバー全員が先行 boundary に取られた boundary は primary 軸に 1 件も現れず、
`presentGroups` に落とされて **band もフレームもラベルも出ない**（spike 実測で再現、
[TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md) が禁ずる
「受理・無効果」に隣接）。検討した案:

| 案 | 内容 | 評価 |
| --- | --- | --- |
| **採用: 共有メンバーの引き取り** | その canvas に限り、共有メンバー 1 つを model-primary ではなくこの boundary に配置する | slice B 無しで枠とラベルが出る。配置はちょうど一度のまま。placement-primary が model-primary と乖離する |
| 報告のみ | info 診断で「band を持てなかった」と述べ、body は slice B の reaching outline に委ねる | 正直だが図からは消えたまま。#2176 の決定ではなく先送りになる |
| 空 band | メンバーのいない群にも band を割り当てる | slice A 設計で却下済み — 空行が空くだけで枠は出ず、今日より悪化 |

引き取りの境界条件（`resolvePlacementAxis`）:

- **その canvas に描かれているメンバーだけ**が候補（軸は model-wide、band 機構は per-canvas）。
- **元の boundary に別の present メンバーが残る**メンバーだけを取る。片方を埋めて他方を空にしない。
- band 無し boundary は宣言順、候補は membership 順で解決し、各引き取りが次の判定に反映される
  （決定的・同じメンバーを二度取らない）。
- 候補が 1 つも無ければ band を持たないままにする（唯一の候補が自分の band の最後の 1 人のとき）。
- **diff / compare モードの `removed` ノードは primary だけに切り詰める。** removed ノードの所属は
  「元のフレームに戻すため」だけに before 側から backfill されている（[ADR-1886](../adr/1886-group-by-diff-removed-node-placement-and-aggregated-edge-state.md)）。
  この配列が #2176 の機構に届くと、**モデルから消えたノードが生きているノードの配置を決める**:
  (1) band 無し boundary に body を与える、(2) 生きた band 同士を co-membership で隣接させる、
  (3) seam bias で行を寄せる。いずれも after 単独のレンダリングには現れない枠・並びになる。
  そこで `placementMembership` で removed ノードの所属を primary 1 件に落とす（`nodeDiffState` を
  `layout()` まで通す）。primary は残るので**元のフレームには従来どおり戻る** — 他者の配置を
  決めなくなるだけ。

  > **ノード集合を絞るのではなく membership を絞る。** 最初の実装は removed ノードを
  > `presentNodeIds` から外したが、この集合は「引き取り候補か」と「その群は既にメンバーを
  > 持っているか（`held`）」の 2 つの判定を兼ねている。removed ノードは元のフレームの中に
  > 現に描かれている以上、後者では**数えなければならない**。外すと群が空に見えて、
  > 危険でもない群から band 無し boundary が横取りする / 安全な引き取りが拒否される、の
  > 両方が起きた（レビューで実測）。判定を分けるより、所属側を 1 つの規則で切る方が短い。

**band の並びは引き取り前の primary 軸から seed する。** 群の並びは軸の値の初出順（= 宣言順）から
導かれるので、引き取った値をそのまま並びの導出に使うと **body を与えた副作用で stack が並び替わる**
（実装時に実測）。`resolvePlacementAxis` が `{ axis, groupOrder }` を返し、`groupOrder` は
引き取り前の primary 軸 + 宣言リスト補完（slice A 案 2'）で作る。

引き取りは **collapse より前**に軸へ適用する。フレームと「collapse が畳む先の群」が食い違わないため。

### #2176 を B より先に実施した

当初の順序は A → B → 配置 だったが、実装は A → 配置 → B の順になった（2026-08-01、ユーザー判断）。
影響:

- 配置単体でも**目に見える成果が出る**: 共有する boundary が隣り合い、共有ノードが継ぎ目に座り、
  消えていた boundary が枠を得る。
- ただし枠は矩形のままなので、**隣り合わせた先で枠が相手のカードに届くのは B 待ち**。
  #2176 は「B の日和見性を解消する」のではなく「B が届く条件を先に整える」回になった。
- B の受け入れ条件（隣接する共有が両方の枠に囲まれる）は、本スライスが作った band 順の上で測る。

**slice C — collapse 二重性**

1. `collapseGroups` の判定を「全所属が collapsed」に変更、0 件 stub の抑止、bulk collapse 時の primary stub への集約。
2. 端点 remap の述語変更に伴う ghost edge の parity テスト。

**AT**: `docs/acceptance/2161-boundary-multi-membership.md` を新規作成。目視観点（人間確認が必要なもののみ）:

- 帯が隣接する共有で、ノードが**両方の枠に囲まれて**見えること（枠が重なる）。
- ノードが図中に**ちょうど 1 つ**しか現れないこと。
- boundary ごとの識別色で、重なりが**入れ子ではなく重なりとして**読めること。
- 縮退したノードに `◇ <boundary>` のタブが出て、そのグリフが PNG 書き出しでも豆腐にならないこと。
- 一方の boundary を畳んでも、他方が expanded ならそのノードが消えないこと。両方畳むと消えること。
- 縮退に落ちたケースで、偽の包含（非メンバーが枠に入る）が起きていないこと。

**ADR 昇格**: 3 スライス完了後、`docs/adr/2161-boundary-membership-1n.md` として昇格し（`refines: [ADR-1974]`）、本 Design Doc を同 PR で削除する。[ADR-1974](../adr/1974-boundary-declaration-syntax.md) は書き換えない（refine は非破壊）。

### 影響範囲・マイグレーション

- **既存ユーザーへの影響**: `.krs` の書き方は不変。多重所属を書いていないモデルは描画・診断とも完全に不変。多重所属を書いているモデルは、slice A で診断文言が変わり、slice B/C で描画と collapse 挙動が変わる（experimental notation の範囲内の挙動変更）。
- **ドキュメント**: `docs/spec/syntax.md`（+ja、boundary 節）、`docs/spec/diagnostics.md`（+ja）。`docs/roadmap.md` は [#2164](https://github.com/kompiro/karasu/pull/2164) が本件を **v2.0 core 昇格の宿題**として既に登録済み（watch item + Syntax 2.0 プログラム表）— slice A で watch item の観測項目「first-wins 多重所属が実利用で噛み合うか」だけを、決定済みの事項として書き換える。
- **examples**: 専用 feature-sample `examples/en/feature-samples/boundary-multi-membership.krs` を slice A で追加済み（AT の目視項目の対象）。slice B で描画が変わったら同ファイルのコメントを更新する。
- **`docs/design/tags-and-facets.md`**: §「所属モデルの一般化」が本件を (B4) follow-up として参照している。ADR 昇格時に相互リンクを張る。

## 未解決の問い / 決めないこと

- **team 軸（`ownerIndex`）の 1:N 化**: 構造は同型だが stable 構文であり、precedence に意味づけがある。本設計では決めない。新規 [TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md) が再訪点を保持する。
- **識別色のパレットと、重なり領域の扱い**: 色の選び方（固定パレットの循環か、style シートで指定可能にするか）と、重なり領域を塗りで区別するか（ハッチ等）は slice B の実装時に決める。角丸・線種も同様。
- **非隣接共有の回廊（corridor）描画**: v1 では縮退（規則 3）に落とす。corridor を引くかは corpus で必要性が観測されてから。
- **boundary の入れ子**: [ADR-1983](../adr/1983-boundary-drilldown-grouping.md) で deferred のまま。本件で 1:1 前提が外れることは、同 ADR が挙げた却下理由の 1 つを取り除くが、**解禁の動機（corpus 証拠）は別途必要**であり本設計では扱わない。
- **`boundary` の stable 昇格**: [ADR-1820](../adr/1820-notation-promotion-gate.md) の gate は corpus evidence 待ちのまま。本件は experimental 層内の refine。
