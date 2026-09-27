---
id: ADR-2678
title: boundary を言語 v2.0 で core に昇格し、言語版の切り替えは全 act の着地後に 1 回だけ行う
status: accepted
date: 2026-09-27
topic: core-concepts
authors: [kompiro]
depends_on:
  - ADR-1820
  - ADR-2065
  - ADR-2124
related_to:
  - ADR-1314
  - ADR-1974
  - ADR-2036
  - ADR-2161
  - ADR-2234
  - ADR-2316
  - ADR-2522
scope:
  packages: [core]
assumptions:
  - "grep: docs/spec/syntax.md :: Core notation from `.krs language v2.0`"
  - "grep: docs/spec/syntax.ja.md :: 言語 v2.0 から core notation"
  - "symbol: packages/core/src/builtins/reference-data.ts :: groupingConstructs"
---

# ADR-2678: boundary を言語 v2.0 で core に昇格し、言語版の切り替えは全 act の着地後に 1 回だけ行う

- **日付**: 2026-09-27
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2678](https://github.com/kompiro/karasu/issues/2678)（`epic: boundary` の v2.0 act）。姉妹の act: [#2677](https://github.com/kompiro/karasu/issues/2677)（tag / annotation の閉鎖 + `facet` 昇格）、[#2924](https://github.com/kompiro/karasu/issues/2924)（`node-not-in-context` の error 化）
  - 昇格の gate: [ADR-1820](1820-notation-promotion-gate.md)。昇格先の決定: [ADR-2065](2065-tags-and-facets.md) 決定事項 3。版語彙: [ADR-2124](2124-version-vocabulary.md)。v1.0 freeze: [ADR-1314](1314-krs-spec-v1-freeze.md)
  - 昇格する形: [ADR-1974](1974-boundary-declaration-syntax.md)（宣言構文）、[ADR-2036](2036-scoped-boundary-declaration.md)（スコープ宣言）、[ADR-2161](2161-boundary-membership-1n.md)（所属 1:N + 多重包含 banded 描画）、[ADR-2234](2234-boundary-style-selector.md)（frame colour セレクタ + legend）
  - reference パネルの experimental 表示: [ADR-2316](2316-experimental-notation-in-reference.md)
  - spec: [`docs/spec/syntax.md` §Grouping the system view](../spec/syntax.md#grouping-the-system-view-boundary)、[`docs/spec/style.md` §Boundary frame selectors](../spec/style.md#boundary-frame-selectors-boundary--boundaryid)
  - TPL: [TPL-2316](../test-perspectives/TPL-2316-declarable-construct-reachable-from-reference.md)（reference の experimental フラグと spec 見出しの一致）、[TPL-1296](../test-perspectives/TPL-1296-spec-doc-reference-data-sync.md)

## 背景

`boundary` は [ADR-1974](1974-boundary-declaration-syntax.md) で experimental notation として入った。[ADR-2065](2065-tags-and-facets.md) 決定事項 3 は `boundary` と `facet` を構文 2.0 の主軸に据え、両者の行き先を言語 v2.0 の core と決めている。したがって [ADR-1820](1820-notation-promotion-gate.md) の gate が問うのは「昇格するか」ではなく「v2.0 core の形として妥当か」になる。

`epic: boundary` が宣言した v1.x スライスはすべて着地した（所属 1:N #2161、多重包含の描画 #2179、collapse duality #2180、ファイル横断の修正 #2221 / #2246、frame colour の override + legend #2234）。v1.x の最終リリースは `boundary` / `facet` を experimental のまま出し切っており、残るのは tier の切り替えそのものである。

一方で言語 v2.0 の act は `boundary` だけではない。tag / annotation の閉鎖と `facet` の昇格（#2677）、`node-not-in-context` の error 化（#2924）も同じ版に登録されている。版定数 `KRS_LANGUAGE_VERSION` をいつ `2.0` にするかを決めないと、act ごとの PR が版を中途半端に動かすことになる。

## 決定

1. **`boundary` を core に昇格する。** 対象は宣言（`boundary <id> { … }`）、`contains`、node block 内のスコープ宣言の 3 つで、形は ADR-1974 / ADR-2036 / ADR-2161 / ADR-2234 が定めたものをそのまま凍結する。以降この形は後方互換を約束し、破壊的変更は言語の major でのみ入る。`boundary` / `boundary#<id>` の style セレクタも、スタイルを当てる構文と同じ tier に入る。
2. **tier の切り替えを spec・reference・roadmap に反映する。** spec 見出しから `— experimental` を外し（`syntax.md` / `syntax.ja.md`）、見出しを指すアンカーをすべて張り替える。reference の `groupingConstructs` で `boundary` の `experimental` を `false` にする。Syntax タブの「Grouping & Membership」2 節は `facet` も描くので、#2677 まで experimental 表示を残す。roadmap の watch 登録から `boundary` の行を外す（watch 登録は互換を約束しない notation だけを持つ）。
3. **言語版の切り替えは、言語 v2.0 の act がすべて main に着地した後に 1 回だけ行う。** 各 act の PR は `KRS_LANGUAGE_VERSION` を動かさない。spec はその act を「`.krs language v2.0` から」と前方参照で書く（`language-version.test.ts` の drift ガードは前方参照を許す）。切り替えの PR が版定数と spec 4 文書の版トークンを `2.0` にし、changeset / CHANGELOG に言語版遷移（言語 v1.x → v2.0）を明記する。

## 理由

- **gate の問いに答える証拠がある。** 昇格先は ADR-2065 で決まっているので、問うのは形の妥当性である。初回の証拠は #2079（hato: 21 domain / 215 usecase）。第三者の corpus は実在しない（[ADR-2522](2522-vocabulary-census-drift.md) 決定 3）ので、実際の観測面はトリガー (iii) と自前モデルになる。昇格時点で `boundary` に関する混乱 / bug Issue は open に 0 件で、`examples/` の feature-samples 4 本（`boundary-clusters` / `scoped-boundary` / `boundary-multi-membership` / `tag-facet-registers`）が形をそのまま使っている。
- **v1.x に出せる宿題が残っていない。** 1:N 所属・多重包含・style override・legend は昇格前に済ませると roadmap に書いてあった宿題で、すべて着地している。形を後から変える予定がないので、互換を約束しても失うものがない。
- **版の切り替えを 1 回にまとめる（決定 3）のは、版番号が「その言語で何が起きたか」を 1 つの意味で指すためである。** act ごとに版を動かすと、閉鎖（#2677）が入る前のリリースが `v2.0` を名乗ってしまう。そのあと閉鎖が入れば、それは v2.0 後の破壊的変更になり、ADR-1314 / ADR-2124 の「破壊は major でのみ」に反する。昇格そのものは互換の約束を足すだけなので、版を動かす前に main へ入っても既存の `.krs` を壊さない。途中でリリースを切っても言語 v1.x のままで、害はない。

## 却下した案

### この PR で `KRS_LANGUAGE_VERSION` を `2.0` にする

Issue の scope（「リリースが言語版遷移を明記する」）に最も素直だが、決定 3 の理由で却下した。閉鎖（#2677）と error 化（#2924）がまだ main にない状態で版を `2.0` にすると、その間のリリースが不完全な v2.0 を出荷してしまう。

### v1.x minor で昇格する

stable への昇格は互換の約束を足すだけなので、技術的には v1.x minor にも載る。ただし ADR-2065 決定事項 3 が `boundary` と `facet` を揃って v2.0 の core にすると決めており、Issue #2678 も「v1.x minor に滑り込ませない」と明記している。二本柱を別の版で昇格させる理由がないので却下した。

### #2677 と同じ PR で両柱を同時に昇格する

閉鎖は警告件数の実測・concepts.md の改訂・リスク台帳の履行を前提条件に持ち（roadmap §閉鎖の前提条件）、`boundary` の昇格はそのどれにも依存しない。両者を束ねると `boundary` 側が閉鎖の前提条件に足止めされる。版の切り替えを決定 3 で分けたので、act は独立に着地できる。
