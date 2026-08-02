---
id: ADR-2161
title: boundary 所属を model 層で 1:N にし、多重包含を描く — ADR-1974 決定 2 の refine
status: accepted
date: 2026-08-02
topic: core-concepts
refines: [ADR-1974, ADR-2036]
related_to: [ADR-1314, ADR-1566, ADR-1820, ADR-1858, ADR-1884, ADR-1886, ADR-1983, ADR-2120]
scope:
  packages: [core]
  concerns: []
assumptions:
  - "symbol: packages/core/src/types/ast.ts :: primaryBoundaryOf"
  - "symbol: packages/core/src/parser/reference-validation.ts :: buildBoundaryMembership"
  - "symbol: packages/core/src/renderer/group-layout.ts :: resolvePlacementAxis"
  - "symbol: packages/core/src/renderer/group-collapse.ts :: collapseGroups"
  - "grep: packages/core/src/fs/import-resolver.ts :: duplicate-boundary-assignment"
  - "grep: packages/core/src/renderer/svg-renderer.ts :: boundary-membership-not-drawn"
  - "file: docs/acceptance/2161-boundary-multi-membership.md"
---

# ADR-2161: boundary 所属を model 層で 1:N にし、多重包含を描く — ADR-1974 決定 2 の refine

- **日付**: 2026-08-02
- **関連**:
  - Issue: [#2161](https://github.com/kompiro/karasu/issues/2161)（親）。実装スライス [#2178](https://github.com/kompiro/karasu/issues/2178)（model 層）/ [#2176](https://github.com/kompiro/karasu/issues/2176)（配置）/ [#2179](https://github.com/kompiro/karasu/issues/2179)（描画）/ [#2180](https://github.com/kompiro/karasu/issues/2180)（collapse）。派生 bug [#2221](https://github.com/kompiro/karasu/issues/2221) / [#2246](https://github.com/kompiro/karasu/issues/2246)。follow-up [#2234](https://github.com/kompiro/karasu/issues/2234)（色の上書きと legend）
  - 実装 PR: [#2213](https://github.com/kompiro/karasu/pull/2213)・[#2239](https://github.com/kompiro/karasu/pull/2239)・[#2248](https://github.com/kompiro/karasu/pull/2248)・[#2263](https://github.com/kompiro/karasu/pull/2263)・[#2247](https://github.com/kompiro/karasu/pull/2247)・[#2250](https://github.com/kompiro/karasu/pull/2250)・[#2240](https://github.com/kompiro/karasu/pull/2240)
  - **refine 対象**: [ADR-1974](1974-boundary-declaration-syntax.md) 決定 2（`boundaryIndex` は 1:1・first-wins）、[ADR-2036](2036-scoped-boundary-declaration.md) 決定 2 の末尾（「cross-file 参照は原理的に生じない」）
  - TPL: [TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md)（本 ADR の中核観点）、[TPL-2221](../test-perspectives/TPL-2221-merge-only-facts-decided-on-merged-model.md)、[TPL-2179](../test-perspectives/TPL-2179-derived-outline-measured-on-coverage-not-bbox.md)、[TPL-1738](../test-perspectives/TPL-1738-relayout-into-group-preserves-placement-and-edges.md)、[TPL-1386](../test-perspectives/TPL-1386-diagnostic-register-fact-vs-style.md)、[TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)
  - AT: [2161-boundary-multi-membership.md](../acceptance/2161-boundary-multi-membership.md)
  - spec: `docs/spec/syntax.md` §「Grouping the system view (`boundary`)」（+ja）
  - 昇格元: `docs/design/boundary-membership-1n.md` / `docs/design/boundary-membership-slice-a.md`（本 PR で削除。検討過程は設計 PR [#2166](https://github.com/kompiro/karasu/pull/2166) / [#2195](https://github.com/kompiro/karasu/pull/2195) / [#2232](https://github.com/kompiro/karasu/pull/2232) の履歴で追える）

## 背景

[ADR-1974](1974-boundary-declaration-syntax.md) 決定 2 は `boundaryIndex` を **1:1（node id → boundary id）** と定め、多重所属を宣言順 first-wins で解決した。根拠として記録されたのは「開閉フレームの識別子は 1 ノード 1 値でなければならない」であり、これは collapse が 1 stub・banded 配置が 1 band であるという **view の要件**である。同じ ADR は「多重所属は許容し、precedence で primary を選ぶ」とも書いており、**所属そのものを 1 値に限るとは決めていなかった**。

実装はこの view 要件を model 層の index 導出に焼き付けていた。`buildBoundaryIndex` は 2 件目以降の所属を捨てるため、**宣言された事実が parse 時に失われ、どのビューからも復元できない**。[#2065](https://github.com/kompiro/karasu/issues/2065) の設計レビュー（2026-07-28）で「所属は model 層で 1:N、各ビューが必要な解決を行う」が原則として確定し、本件はその boundary 軸への適用である。

観測されていた欠落は 3 つ: 全メンバーが他 boundary と共有の boundary が群ごと消える、診断が「捨てた」ことを述べる register になっている、そして多重所属ノードが 1 つの枠にしか入らない。

## 決定

**所属は model 層で 1:N とし、単一値を要求するのは view 側の解決に閉じる。banded view は多重所属ノードを 1 回だけ配置しつつ、届く限りすべての枠で囲む。** 実装は独立に出荷できる 4 つのスライスで積んだ。

1. **model 層（#2178）** — `KrsFile.boundaryIndex` / `scopedBoundaryIndex` を `boundaryMembership: Map<string, string[]>` / `scopedBoundaryMembership` に置き換え、宣言をすべて宣言順で保持する。1:1 の並行フィールドは作らず、view の単一値要件は純関数 `primaryBoundaryOf(ids) => ids[0]` 1 つが吸収する。
2. **群の存在は宣言から、所属は index から** — 群の並びを軸 index の値集合からではなく宣言リストから補完する（`declaredGroupOrderOf` + `groupOrderFor`）。全メンバーが共有の boundary も、`contains` ゼロの boundary も並びに残る。
3. **マージ後モデルが正** — 所属も診断もマージ後の宣言から再構築する。multi-file の union merge は廃し、`resolve()` が builder を再実行する。`duplicate-boundary-assignment`（#2221）と `duplicate-boundary-id`（#2246）は **merged-space の判定**とし、宣言そのもの（top-level ブロック・reopen された scope の scoped ブロック）もマージ経路で運ぶ。
4. **配置（#2176）** — 共有ノードを、共有相手の帯に接する行（seam）へ寄せる。ただし **group 内の依存の流れが勝つ**（intra-group の依存者がいるノードは動かさない）。body を持たない boundary は、他の帯を空にしない範囲で 1 メンバーを claim して体を得る。
5. **描画（#2179）** — frame を band の bbox から**矩形直交ポリゴン**（band 本体 + 到達したメンバーごとの strip）に一般化し、多重所属ノードを届く限りすべての枠で囲む。**boundary ごとの識別色**を宣言順の固定巡回で与える。伸長の判定は帯の隣接ではなく**回廊に非メンバーのカードが無いこと**とし、届かない共有は `◇ <boundary>` の破線タブと info 診断 `boundary-membership-not-drawn` に縮退する。
6. **collapse（#2180）** — ノードは **その canvas 上の所属がすべて collapsed のときだけ**畳まれる。1 つでも expanded ならノードは可視のまま、**その expanded な枠の中に**描かれる。畳み先は配置された群の stub、畳んだものが無い boundary は stub を出さない。

## 理由

- **1:1 は view の制約であって model の制約ではない。** 捨てた所属は復元できず、詳細パネル・legend・export・将来の overlay など banded view 以外の消費者が構造的に作れない（[TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md)）。並行 1:1 フィールドを持たないのは、同じ事実に導出経路が 2 本あると片方だけ更新される drift を招くため（[TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)）。
- **群の並びを flatten から作らない。** membership 配列を flatten すると宣言順が壊れる（実測: 宣言順 `A, C, B` に対し flatten は `A, B, C`）。`orderGroups` は宣言順を最終 tie-break に使うため、これは band 順を理由なく変える。軸の値順（＝今日の順序であり宣言順と一致する）を先頭に置き、宣言リストで補完する形にすると、既存モデルの band 順は不変のまま、消えていた群だけが並びに戻る。
- **同じモデルはファイルの分け方によらず同じ答えを返す。** 重複・多重所属は複数の宣言を突き合わせて初めて成立する事実なので、per-file 判定では**どのファイルも単独では条件を満たさず、診断が 1 件も出ない**。存在検証（[TPL-2032](../test-perspectives/TPL-2032-reference-existence-validated-on-merged-space.md)）と同じ「マージ後で判定する」だが、失敗の向きが偽陽性ではなく**沈黙**である点が異なる（[TPL-2221](../test-perspectives/TPL-2221-merge-only-facts-decided-on-merged-model.md)）。index も同じ空間で再構築することで、index と診断の導出が 1 本になる。
- **配置を変えずに枠だけ伸ばすと偽の包含が出る。** prototype の実測で、帯の隣接だけを条件にすると非メンバーのカードを 100%（および別モデルで 23%）覆った。#2176 の seam 配置はこれを狭めるが除去はしない（依存の流れが動かせないノードと、3 つ以上に共有されたノードが残る）。よって伸長は回廊の中身で判定し、届かない共有は縮退表示に落とす。この規則は機械チェック（`boundary-frame-containment.test.ts`）で柵にした。
- **単色では重なりが入れ子に読める。** prototype で、ジオメトリが同一で色だけ違う 2 枚を比べると、単色では「片方がもう片方の中に入っている」と読めた。識別色は装飾ではなく多重包含の成立条件である。色は**宣言順**で巡回させる — band 順で巡回させると、無関係な並び替えで色が動く。
- **collapse は「群のメンバーを隠す操作」ではなく「群の枠を畳む操作」。** 最初に collapsed な所属で畳むと、A を畳んだのに無関係な expanded B の中身が黙って減る。操作対象と結果が一致せず、[ADR-2036](2036-scoped-boundary-declaration.md) が確立した collapse 独立性とも噛み合わない。
- **文法変更ゼロ。** `.krs` の書き方は一切変わらない（[ADR-1314](1314-krs-spec-v1-freeze.md) の v1.0 freeze を維持）。変わるのは受理済みの記述の解釈と描画で、`boundary` は experimental のまま（[ADR-1820](1820-notation-promotion-gate.md)）。`@karasu-tools/core` の TS API は 0.x なのでフィールドの改名・型変更は許容される。

## 却下した案

- **共有ノード専用の intersection band を挿入する**（Part B 案 2）: `ContainerRect` を矩形のまま保てて実装は数分の一だが、**3 重所属・非隣接ペアを原理的に表現できない**。縮退が表現可能性の欠落として恒久的に残り、facet overlay や nested boundary で同じ壁に再びぶつかる。
- **primary 配置 + 副次インジケータのみ**（Part B 案 3）: 実装は最小だが、[#2161](https://github.com/kompiro/karasu/issues/2161) が「first-wins primary は理想ではない」と決めた地点に留まる。包含関係を図形で示さないため、枠を畳んだときに何が畳まれるのかが図から読めない。**ただし縮退時の `◇` タブとして部分的に採用**した。
- **各フレームにノードを複製して置く**（Part B 案 4）: 「全要素ちょうど一度配置」（[TPL-1738](../test-perspectives/TPL-1738-relayout-into-group-preserves-placement-and-edges.md)）を正面から破る。エッジ端点がどの複製に付くか決まらず、drill / permalink / diff の identity も壊れる。
- **hide-when-any-collapsed**（Part C 案 C-2）／ **stub の中にゴースト複製**（C-3）: 前者は上記の操作と結果の不一致、後者は配置ちょうど一度の違反。
- **群の並びを membership の flatten から導く**: 上記のとおり宣言順を壊す。当初の設計はこれを採る予定だったが、実装時の実測で覆した。
- **`ownerIndex`（team 軸）へ同じ一般化を波及させる**: 構造は同型だが、team の precedence は `@migration_target` による意味づけを持ち（[ADR-1566](1566-ownership-during-migration.md)）、`organization` / `owns` は stable 構文である。本 ADR の範囲外とし、[TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md) が再訪点を保持する。

## refine が触れた 2 つの ADR

- **[ADR-1974](1974-boundary-declaration-syntax.md) 決定 2** — 「1:1 + first-wins」は所属の表現としては置き換わった。**first-wins 自体は生きている**: banded view の primary 選択規則としてそのまま残り、`primaryBoundaryOf` がその 1 箇所になった。決定 1（構文）・決定 3（軸の配線）・決定 4（experimental 着地）は不変。
- **[ADR-2036](2036-scoped-boundary-declaration.md) 決定 2 の末尾** — 「cross-file 参照は原理的に生じない」は成り立たなくなった。決定の本体（メンバは宣言ノードの直下の子のみ）は有効だが、`system`（および infra ブロック）は別ファイルで再オープンでき、スコープ宣言の `contains` は**マージ後のノードの子**に対して解決される（#2247）。さらに scoped `boundary` ブロック自体も reopen をまたいで運ばれる（#2250）。したがってメンバも宣言も、読んでいるファイルとは別のファイル由来でありうる。`docs/spec/syntax.md`（+ja）は #2250 で修正済み。

## 実装時に設計を覆した点

昇格前の設計から、実装の実測で変わったものを記録する（同じ判断をやり直さないため）。

| 設計時 | 実装後 | 根拠 |
| --- | --- | --- |
| 影に入った boundary は band とフレームを得る | 得るのは**群の並び**まで。枠は配置の問題 | `assignGroupedLayers` の `presentGroups` がメンバー不在の群を落とす |
| 群の並びは membership の flatten 由来 | 軸の値順 + 宣言リストで補完 | flatten は宣言順を壊す（実測） |
| 共有ノードは **primary** の stub に畳む | **配置された群**の stub に畳む | #2176 の claim は primary 以外へ配置しうる。stub はノードが占めていた帯に置かれる |
| 伸長は帯が隣接していれば行う | 回廊に非メンバーのカードが無いときだけ行う | 隣接条件では非メンバーを 100% / 23% 覆った（実測） |

## 残っている宿題

- **色の上書きと legend** — 固定巡回は著者の入力を要さないが、スタイルシートで色を選べるようにすると「その色が何を意味するか」が生まれる。`legend` の `ref` は現在 boundary を名指せない（[#2234](https://github.com/kompiro/karasu/issues/2234)）。
- **stable 昇格** — [ADR-1820](1820-notation-promotion-gate.md) の gate は corpus evidence 待ちのまま。本 ADR は experimental 層内の refine であって昇格ではない。
- **boundary の入れ子** — [ADR-1983](1983-boundary-drilldown-grouping.md) で deferred のまま。本件が 1:1 前提を外したことは同 ADR の却下理由の 1 つを取り除くが、解禁の動機（corpus 証拠）は別途必要。
