---
id: ADR-2596
title: nodePathIndex はマージ後のモデルで再構築し、多重判定は宣言単位で行う
status: accepted
date: 2026-09-06
topic: resolver
related_to:
  - ADR-110
  - ADR-2161
  - ADR-2410
  - ADR-2550
scope:
  packages: [core]
assumptions:
  - "symbol: packages/core/src/parser/reference-validation.ts :: buildNodePathIndex"
  - "grep: packages/core/src/fs/import-resolver.ts :: node-id-multiple-locations"
  - "grep: packages/core/src/parser/reference-validation.ts :: c.node === node"
  - "file: packages/core/src/fs/import-resolver.test.ts"
  - "file: docs/test-perspectives/TPL-2221-merge-only-facts-decided-on-merged-model.md"
---

# ADR-2596: nodePathIndex はマージ後のモデルで再構築し、多重判定は宣言単位で行う

- **日付**: 2026-09-06
- **ステータス**: 決定済み・実装完了
- **関連**:
  - Issue: [#2596](https://github.com/kompiro/karasu/issues/2596)、実装 PR [#2712](https://github.com/kompiro/karasu/pull/2712)、Design Doc PR [#2697](https://github.com/kompiro/karasu/pull/2697)
  - 関連 ADR: [ADR-2550](2550-order-independent-node-path-index.md)（ファイル内の順序非依存化。その「スコープ」節が本 ADR を follow-up として予告した）, [ADR-110](110-permanent-link.md)（`nodePathIndex` の由来）, [ADR-2410](2410-import-coupled-diagnostics-decline-and-invalid-owns-kind-only.md)（import 結合診断の判定空間）, [ADR-2161](2161-boundary-membership-1n.md)（membership をマージ後に再構築した先例）
  - 関連 TPL: [TPL-2221](../test-perspectives/TPL-2221-merge-only-facts-decided-on-merged-model.md)（主観点）, [TPL-1583](../test-perspectives/TPL-1583-migration-priority-index-winner.md), [TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md), [TPL-2032](../test-perspectives/TPL-2032-reference-existence-validated-on-merged-space.md)
  - 派生 Issue: [#2715](https://github.com/kompiro/karasu/issues/2715)（マージ後診断の `loc` がファイル識別を持たない）

## 背景

ADR-2550 は `node-id-multiple-locations` の判定を collect-then-decide にして宣言順非依存に
したが、保証は 1 ファイル内に閉じていた。ImportResolver は per-file の index を
first-wins で union するだけで、マージ後のモデルで作り直していなかったためである。
`facetIndex` / `ownerIndex` / `boundaryMembership` / `scopedBoundaryMembership` は
すべて再構築側に移っており、`nodePathIndex` だけが union のまま残っていた。

実測した失敗は 3 つ:

1. **cross-file の migration 判定が黙って逆転する。** `system Legacy { service Search @deprecated }`
   と import 先の `system Next { service Search @migration_target }` で、entry が先に
   マージされるため `@deprecated` 側が index の entry を保持し、診断は 0 件。
   同じ内容を 1 ファイルに書くと `["Next","Search"]` に解決して warning が 1 件出る
2. **cross-file の同名衝突が完全に沈黙する。** 1 ファイルなら 1 件、2 ファイルなら 0 件
3. **named import で入ったノードが index に 1 件も載らない。** `mergeNamedImport` は
   `nodePathIndex` に触れておらず、union していたのは `resolveKrsFromMap`（自ファイル分）と
   `mergeWildcardResolved` の 2 箇所だけだった。マージ後の tree に `Shop.Payments.Ledger` が
   あるのに `nodePathIndex.get("Ledger")` は `undefined` で、モデルに存在するノードへの
   bare id permalink が解決できない

1 と 2 は「同じモデルでもファイルの分け方で答えが変わる」形で、TPL-2221 が
「沈黙して落ちるので誰も苦情を出さない」と述べているものそのものである。

## 決定

`buildNodePathIndex` を Parser の private メソッドから `reference-validation.ts` の
export された純粋関数へ移し、Parser（自ファイル = 最終空間）と ImportResolver
（マージ後 = 最終空間）がそれぞれ正しい空間で呼ぶ。resolver は
`node-id-multiple-locations` を `MERGED_SPACE_REFERENCE_CODES` に登録して per-file の
判定を落とし、`facetIndex` / `ownerIndex` / `boundaryMembership` と同じ位置で再構築する。
union の 2 ループは削除する。

これに伴い、判定について 3 つの境界を確定した。

1. **候補は「宣言」であって「出現」ではない。** マージは 1 つの宣言ノードを
   tree に複数回載せることがある。同じファイルを wildcard と named の両方で import すると
   `resolveBareIdImport` が同じ `ServiceNode` を `services` に 2 回 push し
   （`mergeWildcardResolved` は identity で dedup するが、こちらはしない）、
   edge で参照された named import の service は参照した system すべてに載る。
   どちらも著者が rename して解消できる衝突ではないので、候補は
   **ノードの identity** で数え、同じノードは 1 件とする。`loc` ではなく identity で
   判定するのは、別々の宣言は必ず別オブジェクトである一方、`Diagnostic` の `loc` は
   ファイル識別を持たず、2 ファイルの同一行の宣言を取り違えるためである
2. **判定の対象はマージ後のモデルに到達した宣言に限る。** named import は名指しした
   ものしか運ばないので、運ばれなかった部分に閉じた衝突は project では報告しない。
   そこでは描画も航法もされず、エディタは per-file で報告し続ける（LSP は
   `Parser.parse` を document 単位で呼ぶ）。保持しようとすると判定を二重に導出することになり、
   TPL-1032 が戒める drift を作る
3. **ファイル配置からの独立は priority が決めるケースの保証である。** warning は
   無条件に配置非依存だが、index の entry が配置非依存なのは candidate の priority が
   異なるとき、すなわち移行共存という本来の用途のときである。priority 同点の tie は
   traversal 順に落ち、それはマージ後のモデルの順（entry ファイル自身の宣言 →
   import されたもの）なので、無印の宣言 2 件はファイルを入れ替えると勝者も入れ替わる

`duplicate-node-id-parent` は per-file の判定として `parseFile` に残す。1 つの親の
children は 1 箇所で宣言されるので、マージ後に再判定するものではない。

## 理由

- ADR-2550 の判定規則（論理層限定、`@migration_target` 優先、同点は traversal 順、
  同一 path の畳み込み、all-domain の沈黙）は変えず、**どの空間で判定するか**だけを
  変えた。規則の議論をやり直さずに保証の範囲だけを広げられる
- index と診断の導出が 1 本になり、片方だけ直る drift（TPL-1032）が構造的に起きない。
  失敗 3 は「マージ後の tree を歩く」ことの副産物として直った。union をどれだけ賢くしても、
  union する index が無い経路は直らない
- 再構築は `facetIndex` / `ownerIndex` / `boundaryMembership` /
  `scopedBoundaryMembership` に続く 5 例目で、TPL-2221 の「既知の対処パターン」を
  そのままなぞる形になる
- 再構築を merge 直後（参照チェック群より前）に置いたのは、`nodePathIndex` が
  空の `Map` である窓を閉じるため。空の index は例外ではなく `undefined` を返す
  fail-open なので、その窓で index を引く検査が将来足されると黙って何も解決しなくなる。
  #2082 の `owns` はまさにその壊れ方だった

## 意図的な差分

- cross-file の同名衝突に warning が出るようになる。とくに whole-file import で
  top-level `service X` を持つファイルを取り込み、`system` 側が同名の `X` を宣言している
  レイアウトは、マージ後の tree に stub と parked 定義の 2 ノードが残るため報告される
  （wildcard 経路は stub を埋めない。同じ import は既に `service-outside-system` も出す）。
  named import は stub を埋めるので従来どおり沈黙する
- `@migration_target` が別ファイルにある場合、bare id の permalink / `viewPath` の
  着地点が移行先へ変わる（ADR-2550 が 1 ファイル内で行った変更の cross-file 版）
- named import で入ったノードとその子孫が index に載るようになる
- `migrationPriority` は module-local になった（最後の外部呼び出し元が同じファイルへ移ったため）

## 却下した案

- **priority 付き union（union のマージ規則を賢くする）**: 変更は import-resolver に
  閉じるが、非勝者ごとにその `loc` で warning を出す規則なので、候補集合がファイルごとに
  分断されていると「負けた宣言の一覧」を復元できず、失敗 2（沈黙）が直らない。
  tie-break が merge 順に化けるのは、ADR-2550 が却下した「loc 順の tie-break」と同型。
  失敗 3 も直らない
- **index は union のまま、resolver に cross-file 専用の重複チェックを足す**:
  同じ事実に判定ロジックが 2 本になり（TPL-1032）、「index の勝者」と「警告の非勝者」が
  別ロジックになって指す宣言がずれうる
- **`loc` による候補の重複排除**: identity より安価に見えるが、`Diagnostic` の `loc` は
  ファイル識別を持たないため、2 ファイルの同一行にある別々の宣言を 1 件に畳んで
  本物の警告を落とす
- **project 経路で Parser 側の per-file 構築を opt-out する**: N ファイルぶんの walk が
  捨てられるのは事実だが、再構築される 5 つの index すべてが同じ形をしている。
  1 つだけ opt-out を足すと例外になるので、消すなら 5 つまとめて扱う
