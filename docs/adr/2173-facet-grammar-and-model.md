---
id: ADR-2173
title: facet の文法と model 層 — 診断は resolver 側、カタログには載せる、merge は union
status: accepted
date: 2026-08-04
topic: parser
depends_on: [ADR-2065]
related_to: [ADR-19, ADR-832, ADR-1314, ADR-1386, ADR-1820, ADR-1974, ADR-2036, ADR-2161, ADR-2174]
scope:
  packages: [core, i18n]
assumptions:
  - "grep: packages/core/src/types/ast.ts :: facetIndex"
  - "grep: packages/core/src/resolver/warnings.ts :: detectFacetsNotDeclared"
  - "grep: packages/core/src/builtins/reference-data.ts :: \"facets\""
  - "file: packages/core/src/formatter/facet-round-trip.test.ts"
---

# ADR-2173: facet の文法と model 層 — 診断は resolver 側、カタログには載せる、merge は union

- **日付**: 2026-08-04
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#2173](https://github.com/kompiro/karasu/issues/2173)（Part B slice 1）。親 [#2160](https://github.com/kompiro/karasu/issues/2160)、program [#2065](https://github.com/kompiro/karasu/issues/2065)
  - 実装 PR: [#2186](https://github.com/kompiro/karasu/pull/2186)
  - 上位 ADR: [ADR-2065](2065-tags-and-facets.md)（register の確定と facet の**形**。本 ADR はその Part B を**どう実装するか**に限定する）
  - 関連 ADR: [ADR-832](832-no-runtime-authz-modeling.md)（値言語を入れない fence）、[ADR-19](19-required-id-label-as-property.md)（id 必須 + `label`）、[ADR-1820](1820-notation-promotion-gate.md)、[ADR-1314](1314-krs-spec-v1-freeze.md)、[ADR-1386](1386-style-prescription-stance.md)（warning / info の register）、[ADR-2036](2036-scoped-boundary-declaration.md) / [ADR-1974](1974-boundary-declaration-syntax.md)（実装パターンの雛形）
  - AT: [`docs/acceptance/2173-facet-grammar.md`](../acceptance/2173-facet-grammar.md)
  - 設計過程: `docs/design/facet-grammar-and-model.md`（本 ADR に昇格して削除）

## 背景

[ADR-2065](2065-tags-and-facets.md) は facet の**形**（宣言 + 要素側プロパティ）を決めた。
残るのは実装配置の 4 論点で、どれも「boundary のコードを雛形にすると機械的に間違った形を
書き写す」危険を持っていた。

## 決定

1. **`facet-not-declared` は resolver の Warning kind**（parser の Diagnostic ではない）。
2. **`facets` は全 node kind の `properties` カタログに載せる**（experimental でも例外を作らない）。
3. **`facetIndex` の multi-file merge は union**（first-wins にしない）。
4. **`facet` / `facets` を lexer キーワードに足す**。語の選び直しはしない。

## 理由

- **(1) `analyze()` は import マージ済みモデルに対して走る。** 「宣言が A、参照が B」という正常な
  multi-file 構成が構造的に解決される（[TPL-2032](../test-perspectives/TPL-2032-reference-existence-validated-on-merged-space.md)
  を機構で満たす）。parser Diagnostic 側を採ると、LSP が parse diagnostics を無条件に出すため
  同じ構成で**偽陽性**が出て、抑止フックの新設が要る。加えて
  [TPL-907](../test-perspectives/TPL-907-cross-reference-validation.md) が「新しい cross-reference
  プロパティには resolver-side 検証と unresolved warning を必ず付ける」と規定しており、
  `facets <id>` はまさにそれ。`warningSeverity` の register エントリを持てる点も効く。
  - **LSP の単一ドキュメント文脈では抑止しない。** 抑止すると `facets pcl` にエディタで波線が
    出なくなり、この診断の主用途（宣言集合に対する完全な typo 検出）が**最も効く場所で無効**に
    なる。`invalid-owns` / `unresolved-handles` も同じ性質で抑止していない。
  - **検出は `facetIndex` ではなく宣言サイトを歩く。** index は bare node id で keying するため、
    同名ノードが 2 つあると最初の 1 つの位置を報告してしまう（[TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)）。
- **(2) 載せないと双方向 drift ガードに恒久的な穴が空く。** `reference-parser-sync.test.ts` は
  「広告 ≡ 受理」を両向きに検査する。除外を足すのは「あとで消す」約束に依存する形で、#2158 は
  まさにこの種の穴（カタログが parser から乖離）が 1 年隠れた事例だった。experimental である旨は
  spec の facet 節が明示する（表の列で表現しようとしない）。
- **(3) first-wins は所属情報を捨てる。** ファイル A で `facets pii`、B で同要素に `facets gdpr` と
  書いたとき 2 件目が消える。[TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md)
  が「merge 経路すべてが同じ多値の意味論に従うこと」を規定しており、boundary 側もこの後
  [ADR-2161](2161-boundary-membership-1n.md) で first-wins を撤回した。
- **(4) 新キーワードは既存モデルの bare id を壊しうる**（`service facets {}`）が、`contains` /
  `owns` / `team` と同型で、逃げ道は quoted id（`service "facets" {}`）。
  [TPL-1281](../test-perspectives/TPL-1281-keyword-lexical-ambiguity-fence-vs-deprecate.md) が問う
  「新キーワードは将来の実装側関心に引かれるか」については、引力があるのは「所属 → ルール」方向で
  あり、そこは **ADR-832 が外部 fence** として既に塞いでいる。spec の facet 節に ADR-832 へのリンクを
  1 行埋める（外部 fence パターン）。

## 却下した案

- **`facet-not-declared` を parser の Diagnostic にする**（`contains-target-not-found` と同型）:
  1 ファイルに facet の検証 2 種がまとまる点は魅力だが、LSP の偽陽性と severity register の不在で
  却下。診断が parser（`duplicate-facet-id`）と resolver（`facet-not-declared`）に分かれるのは
  受け入れたコスト。
- **`facets` をカタログに載せず、テストに experimental 除外を足す**: 生成表は変わらないが、
  #2158 が実証した穴を自分で開けることになる。
- **`facet` を `concern` に改名する**: ADR-2065 の命名節で決着済み。

## 波及

- 診断 2 種: `facet-not-declared`（warning、merged 空間）/ `duplicate-facet-id`（error、
  `duplicate-team-id` の雛形）。
- fmt round-trip は 2 面で守る — 宣言ブロックは top-level 配列由来の網羅性ガード、per-node の
  `facets` プロパティは**専用の round-trip テスト**（`facet-round-trip.test.ts`）。ネスト構文は
  top-level 由来のガードでは守れない（[TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md)）。
- この slice の時点では facet に**描画上の効果が無い**（診断のみ）。TPL-1503 が禁ずる interim-inert
  状態であり、[ADR-2174](2174-facet-overlay.md) が直後の follow-up であって defer 可能ではない、と
  いう位置づけで受け入れた。
