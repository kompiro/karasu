---
id: ADR-1974
title: system view の意味的クラスタを宣言する `boundary` 構文と `boundaryIndex` — team に続く第二の Group-by 軸
status: accepted
date: 2026-07-24
topic: parser
depends_on: [ADR-1858, ADR-1820]
related_to: [ADR-1314, ADR-1859, ADR-1884, ADR-1886, ADR-1983, ADR-2076]
scope:
  packages: [core, app]
  concerns: []
assumptions:
  - "symbol: packages/core/src/parser/parser.ts :: parseBoundaryBlock"
  # Renamed by #2178: the index became 1:N (`buildBoundaryMembership`). The
  # decision text below is left as written — the refine is recorded separately
  # (#2161), and only this code pointer is retargeted.
  - "symbol: packages/core/src/parser/parser.ts :: buildBoundaryMembership"
  - "symbol: packages/core/src/types/ast.ts :: BoundaryBlock"
  - "symbol: packages/core/src/renderer/layout.ts :: groupIdOf"
  - "file: packages/core/src/renderer/group-by-boundary-render.test.ts"
---

# ADR-1974: system view の意味的クラスタを宣言する `boundary` 構文と `boundaryIndex` — team に続く第二の Group-by 軸

- **日付**: 2026-07-24
- **ステータス**: 決定済み
- **関連**:
  - Issue: [#1974](https://github.com/kompiro/karasu/issues/1974)（P2b 実行 Issue）、起点 [#1822](https://github.com/kompiro/karasu/issues/1822)（意味的クラスタの宣言）、親 epic [#1817](https://github.com/kompiro/karasu/issues/1817)（comprehension pillar）
  - 実装 PR: [#1966](https://github.com/kompiro/karasu/pull/1966)（P2b-A 文法 + index + 診断）、[#1973](https://github.com/kompiro/karasu/pull/1973)（P2b-B 軸配線）、[#1980](https://github.com/kompiro/karasu/pull/1980)（P2b-C spec + examples + roadmap）。設計 PR: [#1951](https://github.com/kompiro/karasu/pull/1951)
  - 設計（本 ADR に昇格。母体 doc は P1 検証 evidence を継続保持）: `docs/design/system-view-grouping.md` §「P2b 詳細設計」
  - ADR: [ADR-1858](1858-system-view-group-by-team.md)（P2a team 軸 — 本 ADR が再利用する grouping 機構と排他セレクタの決定）、[ADR-1820](1820-notation-promotion-gate.md)（notation promotion gate — experimental 着地の根拠）、[ADR-1859](1859-system-view-p2c-grouped-edge-routing-and-marks.md)（P2c ルーティング — 軸非依存で継承）、[ADR-1884](1884-group-by-team-multi-system-root-per-system-frames.md)（multi-system root の per-system フレーム）、[ADR-1886](1886-group-by-diff-removed-node-placement-and-aggregated-edge-state.md)（差分モードの grouping）、[ADR-1983](1983-boundary-drilldown-grouping.md)（本 ADR の直接の follow-up — per-view セマンティクスの正規化）、[ADR-1314](1314-krs-spec-v1-freeze.md)（`.krs` v1.0 凍結 — experimental tier が必要な理由）、[ADR-2076](2076-formatter-top-level-exhaustiveness.md)（formatter の top-level 網羅 — `boundary` 追加時に露呈した欠落クラス）
  - spec: [`docs/spec/syntax.md` §Grouping the system view (`boundary`)](../spec/syntax.md#grouping-the-system-view-boundary--experimental)、[`docs/spec/diagnostics.md`](../spec/diagnostics.md)
  - AT: [1822-system-view-group-by-boundary.md](../acceptance/1822-system-view-group-by-boundary.md)
  - examples: `examples/en/feature-samples/boundary-clusters.krs`
  - roadmap: [`docs/roadmap.md` §promotion gate](../roadmap.md) の watch item（`boundary`）
  - follow-up: [#2036](https://github.com/kompiro/karasu/issues/2036)（bare-id `contains` の曖昧性）、[#2079](https://github.com/kompiro/karasu/issues/2079)（usecase 整理における人間工学的評価 — gate への evidence）、[#2065](https://github.com/kompiro/karasu/issues/2065)（cross-cutting concern は tag の領域）

> 本 ADR は 2026-07-14/15 に確定し 07-15〜16 に実装完了した決定を、2026-07-24 に遡って昇格させたものである。周辺（P2a / P2c / diff / multi-system / drill-down）は先に ADR 化されていたが、`boundary` 宣言構文そのものの決定だけが design doc に残置されていた。

## 背景

[ADR-1858](1858-system-view-group-by-team.md)（P2a）は「入れ物を作って畳むと system view が読める」という仮説を **team 軸（`organization` / `owns` → `ownerIndex`）** で実証した。文法変更ゼロで grouping 機構（二段 topological layout / 境界フレーム / 折り畳み）を先に作り、価値を測ってから構文を決める、という順序規律（P1 検証 → P2 宣言機構 → P3 語彙）に沿った成果である。

しかし team 軸だけでは要素数問題が残る:

1. **1 チームが多数の service を持つと、チーム内の密度は下がらない。** team 枠の中がまた過密になる。
2. **組織と一致しない意味的まとまり**（「決済まわり」「認証まわり」）を表現できない。`owns` は組織の面であって bounded-context の面ではない。

[#1822](https://github.com/kompiro/karasu/issues/1822) が当初から求めていたのはこの 2 番目 —「著者が任意に引く境界」である。P1 の検証で、その形は構造的制約から既に導かれていた: **containment ではなく参照**（ファイル横断できる。「file は単位ではない」）、**単一値**（開閉フレームの識別子は 1 ノード 1 値でなければならない）、**多重所属は precedence + info 診断**。組み込みタグは多値であり折り畳み軸にならないことも P1 で検証済みで、既存構文では表現しきれない。

したがって P2b は「新レイアウトを作る」仕事ではなく、**`ownerIndex` と同型の第二の `Map<string, string>` を供給し、Group by セレクタで切り替えるだけ**の仕事になる。

## 決定

**`boundary <id> { contains <id> … }` を top-level の experimental 宣言構文として追加し、parse 時に構築する 1:1 の `boundaryIndex`（node id → boundary id）を、team 軸と排他な第二の Group-by 軸として既存の grouping 機構に供給する。レイアウト・描画・折り畳み・ルーティングのコードは一切増やさない。**

```krs
boundary payments {
  label "Payments"
  contains Billing
  contains Wallet
}
```

### 決定 1 — 構文（語彙 = `boundary`、メンバー動詞 = `contains`）

- **top-level 宣言**。`organization` と同じく system / domain の外に置く。メンバーは containment ではなく **id 参照**なのでファイル横断できる（`owns` と同じ性質）。
- **`contains <id>` を 1 行 1 メンバー**で並べる（`owns <id>` の綴りに厳密に揃える）。カンマ列挙（`contains A, B`）は `owns` と idiom がずれ parser 分岐も増えるため採らない。
- `label` / `description` / `link` は `organization` と同じく受け付ける。

語彙が `boundary` である理由（母体 design doc の P3 vocab 分析は当初 `group` を推していた。その lean を覆す）:

| 論点 | `boundary` | `group` |
| --- | --- | --- |
| セレクタの自己言及 | 「**Group by: boundary**」=「宣言した boundary で束ねる」と読め、team 軸と対等に並ぶ | 「Group by: **group**」は自己言及で不明瞭（機構そのものが group） |
| 既存語との整合 | design doc 全体と `docs/guide/` の**「境界フレーム / boundary frame」**語彙に一致。読者が見る対象（描かれる枠）を名指す | 中立だが機構名と重複 |
| 構文 vs 機構の分離 | **構文 = `boundary`（著者が引く線）／機構 = group（team でも boundary でも生む枠）** と分離でき、`ownerIndex` ↔ `boundaryIndex` の命名も源構文に揃う（owns→owner, boundary→boundary） | 構文と機構が同語で混線 |
| DDD の含意 | 「bounded context」を薄く連想させるが、`contains` で「ただのまとまり」に留める | baggage なし |

`group` の唯一の優位（baggage の無さ）より、**セレクタの自己言及回避**と**boundary-frame 語彙との一致**が勝ると判断した。内部機構は既に `group`（`groupBy` / `collapseGroups` / `assignGroupedLayers`）で統一されており、「構文 = boundary / 機構 = group」の二層命名はコードの現状とも噛み合う。

メンバー動詞が `contains` である理由: `member` は organization の team メンバーブロックで**既に予約語**のため衝突する。`contains` / `includes` は共に空き。`contains` は「boundary payments contains Billing」と自然に読め、karasu の参照動詞（owns / realizes / delivers / handles = 三単現）とも語形が揃う。

### 決定 2 — `boundaryIndex` は `ownerIndex` の構造的ミラー

parse 時に `boundaryIndex: Map<string, string>`（node id → boundary id）を構築する（`buildBoundaryIndex`。`buildOwnerIndex` と同型）。

- **1:1**（node はちょうど 1 boundary に属する）。開閉フレームの単一値要件を最初から満たす。
- **多重所属は許容し、precedence で primary を選ぶ。** ただし boundary には `@migration_target` / `@deprecated` のような組織アノテーションが意味を持たないため、precedence は **宣言順の first-wins**（最初に `contains` した boundary が勝つ）に単純化する。`ownerIndex` の `migrationPriority` は流用せず tie-break だけを踏襲する。
- **重複は error ではなく info 診断** `duplicate-boundary-assignment`（`duplicate-owner-assignment` のミラー。params `{ nodeId, existingBoundary }`）。「事実を述べ、判断は読み手に委ねる」register（[TPL-1386](../test-perspectives/TPL-1386-diagnostic-register-fact-vs-style.md)）に従う。
- **存在しない id を指す `contains` のみ inert** とし、`contains-target-not-found`（warning）で観測する。kind による制限は設けない（`owns` と違い任意 id を受ける）。

### 決定 3 — 軸の配線（team 軸への完全パリティ）

Group by セレクタを **排他**（none / team / **boundary**）に拡張する（[ADR-1858](1858-system-view-group-by-team.md) 決定 3「共存 = 排他」を踏襲）。既存 team 軸の機構をそのまま再利用し、`groupIdOf` が `groupBy` に応じて `ownerIndex` か `boundaryIndex` を選ぶ。

軸を通す先は core（`groupBy?: "team"` → `"team" | "boundary"`。layout / svg-renderer / all-layers / drill-down / multi-system layout）と app（`GroupByMode` への `"boundary"` 追加、**off-sentinel gate の拡張**、ドロップダウンの選択肢）。CLI は現状 `groupBy` の call site が無く、P2b でも露出を追加しない。**一箇所でも漏らすと軸が黙って落ちる**ため、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)（parallel-function-parity）を柵にする。

**team 軸と boundary 軸の関係は独立**である。あるノードが team A に `owns` され boundary B に `contains` されることは普通にあり、「Group by: team」では A 枠、「Group by: boundary」では B 枠に入る（排他セレクタなので枠は同時に重ならない）。組織と意味的クラスタが一致しないことこそ P2b の動機であり、これは意図した挙動である。

### 決定 4 — notation gate: experimental で着地（stable 昇格は corpus 待ち）

`boundary` は**新規 experimental notation** として追加する（[ADR-1820](1820-notation-promotion-gate.md)）。`.krs` v1.0 は凍結されている（[ADR-1314](1314-krs-spec-v1-freeze.md)）ため、新構文は experimental tier でしか出せない。

- **後方互換は明示的に約束しない**（experimental tier の定義）。`docs/roadmap.md` の promotion gate 節に watch item として登録し、promotion trigger（corpus 上で `boundary` がどう使われるか）を書く。
- gate を「絵に描いた餅」にしないため、`docs/process.md` のリリース運用 touchpoint（experimental notation に触れる changeset）に乗せる。
- **決定時点で corpus（karasu-nest, [#1783](https://github.com/kompiro/karasu/issues/1783)）は未実在**。よって P2b の目的は「価値検証のための experimental 構文を出す」ことであり、stable 化は当面しない。この順序（P2a で team 軸の価値実証 → P2b で宣言構文を experimental 提供 → corpus で使用実感 → gate で stable 判断）は母体 doc の P1 → P2 → P3 の順序規律と一致する。

### 決定 5 — スコープ（P2a / P2c 機構の再利用に徹する）

- **新規に書くもの**: 文法（lexer keyword / token / parser dispatch + `parseBoundaryBlock` / AST `BoundaryBlock` + `KrsFile.boundaryIndex`）、`buildBoundaryIndex`、軸値の配線、app セレクタ、診断、spec、TPL contract。
- **再利用（変更しない）**: `collapseGroups` / `assignGroupedLayers` / `group-layout.ts` / 境界フレーム描画 / P2c ルーティング（[ADR-1859](1859-system-view-p2c-grouped-edge-routing-and-marks.md)）。これらは軸が `Map<string, string>` でありさえすれば boundary 軸でもそのまま動く。差分モード（[ADR-1886](1886-group-by-diff-removed-node-placement-and-aggregated-edge-state.md)）と multi-system root（[ADR-1884](1884-group-by-team-multi-system-root-per-system-frames.md)）も同様に軸非依存で継承する。
- **out of scope**: boundary の入れ子、boundary 単位の drill-down、cross-system boundary、deploy / org view への boundary 適用。

実装は各 PR 単独でも図が悪化しない独立スライスで積んだ: **A** 文法 + index + 診断（[#1966](https://github.com/kompiro/karasu/pull/1966)）／ **B** 軸配線（[#1973](https://github.com/kompiro/karasu/pull/1973)）／ **C** spec + examples + AT + roadmap 登録（[#1980](https://github.com/kompiro/karasu/pull/1980)）。

## 理由

- **既存構文で表現しきれず、かつ機構は既にある。** タグは多値で単一値の開閉識別子にならないことは P1 で検証済み。一方 grouping 機構は P2a/P2c が軸を `Map<string, string>` としか見ない形で実装済みだったため、新構文の追加コストは文法と配線に限定される。「新構文を足す」判断としては最も安い部類にある。
- **team 軸の穴を、team 軸を壊さずに埋められる。** 排他セレクタなので既存の Group by: team の挙動は不変で、boundary を宣言しないモデルは現行挙動にそのまま退化する。
- **`ownerIndex` のミラーにすることで、precedence・診断・折り畳み・ルーティングの既存の正しさがそのまま継承される。** 新しい不変条件をほとんど発明していない。
- **experimental 着地により、構文の恒久コミットを corpus evidence の後ろに置ける。** [ADR-1820](1820-notation-promotion-gate.md) の既定（experimental 据え置き・証拠源は karasu-nest corpus）に従い、価値検証と互換約束を分離した。
- **柵は既存 TPL で足りる。** 本件の失敗クラス（新軸を全 call site に通さないと黙って落ちる／受理された語彙が枠を生まない）は [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md) と [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md) が既に覆うため、新規 proactive TPL は起こさず spec 節から back-ref する方針とした（`docs/spec/syntax.md` の boundary 節末尾の `> Related TPLs:` がこれにあたる）。

## 却下した案

**語彙**:

| 語 | 却下理由 |
| --- | --- |
| `cluster` | `docs/concepts.md` / `docs/spec/syntax.md` が "regions, AZs, **clusters**, nodes" を **out of scope な物理トポロジ**として名指しており、論理グルーピングに使うと自分の spec と衝突する。コードでも近接クラスタリングと二重化する。統計的にも cluster は *discover* するもので「宣言する」と矛盾 |
| `namespace` | 中核の意味は**識別子のスコープ**（`payments.Billing` のように id を修飾する）。今回 id は変えないので過剰約束 |
| `partition` | 数学的には**互いに素かつ全体を覆う**分割。どの boundary にも属さないノードが普通にありえるので全域性が成り立たない |
| `subsystem` | 階層段（`system > ? > service`）を足すことを含意する。段を作らない限り事実に忠実でない |
| `group` | baggage は無いが、セレクタが自己言及になり（「Group by: group」）、内部機構名と混線する（決定 1 の表を参照） |

**綴り方**:

| 案 | 却下理由 |
| --- | --- |
| bare tag `[payments]` / keyed tag `[cluster: payments]` | **構造的に不適** — `[...]` は多値コンテナで、開閉の単一値識別子にならない。加えて `parseTags()` は `:` を扱わず `[cluster: payments]` は 3 タグに誤解釈される |
| sigil `$payments` | 字句的には空きだが、**恒久記号の新設**は最も重い notation commitment。`$` は多くの言語で「変数」を意味し語感がずれる |
| UML 風 `<<payments>>` | karasu では `[tag]` が既に UML stereotype の座（style specificity が Kind / Tag / ID = 1 / 10 / 100 で CSS に一致）。分類用の括弧が二重化する。`<` `>` は将来の双方向 edge に使いたい文字でもある |
| `#payments` | **不可**。`#` は karasu では **identity**（ID selector `#ECommerce`、edge id `#criticalWrite`）。CSS の `#id` に対応し、グループとは逆の意味 |

**その他**:

- **カンマ列挙 `contains A, B`**: `owns` の idiom とずれ、parser 分岐も増える。1 行 1 メンバーで揃える。
- **`contains` の kind 制限**: `owns` は所有できる kind を絞るが、boundary は「著者が引く任意の線」なので制限する理由がない。存在しない id だけを inert として warning する。
- **多重所属を error にする**: `ownerIndex` が precedence 解決（error でない）である以上、ミラーである `boundaryIndex` だけ error にするのは非対称。事実系診断は info register に置く。
- **stable notation として出す**: corpus evidence がゼロの時点で `.krs` v1.0 の後方互換約束に載せることになり、[ADR-1820](1820-notation-promotion-gate.md) の gate 規律に反する。

> **補足 — 本 ADR 以後に判明した事項（2026-07-24 時点）**
>
> - **per-view セマンティクスの正規化**: 本 ADR の spec 記述は当初「grouping は system view のトップ階層に描画されるノードにのみ効く」としていたが、実測で interactive 経路は P2a 以来 drill レベルでもグルーピングしており、静的 export だけが root-only gate を持つ surface 間不整合だったと判明した。[ADR-1983](1983-boundary-drilldown-grouping.md) が「軸 index × 描画レベルの交差」として正規化し、spec を書き換えている（文法変更はゼロ）。
> - **`duplicate-boundary-id` の spec ドリフト**: `docs/spec/syntax.md` の boundary 節は `duplicate-boundary-id`（error）を列挙するが、この診断は `docs/spec/diagnostics.md` に未登録かつ parser に未実装である。本 ADR が決定したのは `duplicate-boundary-assignment`（info）と `contains-target-not-found`（warning）の 2 つのみで、id 重複そのものの扱いは決定していない。[#2036](https://github.com/kompiro/karasu/issues/2036) が boundary の identity（宣言スコープ + id）を再検討しており、その決定に合わせて spec を正す。
> - **bare-id `contains` の曖昧性**: id は「フラット名前空間 + 段階 severity の一意性」モデル（sibling のみ error 一意）を採るため、階層違いの同名 id を `contains` が黙って複数 frame しうる。[#2036](https://github.com/kompiro/karasu/issues/2036) に切り出し済み。
> - **formatter の欠落**: `karasu fmt` が top-level の `boundary` ブロックを黙って削除するデータ損失があった。真因は formatter の top-level 列挙漏れで `boundary` を含む 6 構文に及んでおり、[ADR-2076](2076-formatter-top-level-exhaustiveness.md) が `KrsFile` からの導出で再発を止めている。
> - **promotion gate への evidence**: [#2079](https://github.com/kompiro/karasu/issues/2079) が実モデル（21 domains / 215 usecases）の実測から、usecase 整理の用途では top-level by-reference の冗長さ・global id 圧力・1:1 単一軸が噛み合わないと記録している。stable 昇格の判断材料であり、構文変更要求ではない。
