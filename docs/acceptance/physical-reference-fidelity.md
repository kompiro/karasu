---
type: product
---

# AT: 物理参照の存在検査と物理層の回復度計測（#2078）

- **日付**: 2026-08-17
- **関連 Issue**: [#2078](https://github.com/kompiro/karasu/issues/2078)
- **設計 (ADR)**: [ADR-2078](../adr/2078-reverse-synthesis-physical-fidelity.md)
- **Related TPLs**: [TPL-907](../test-perspectives/TPL-907-cross-reference-validation.md)（cross-reference には resolver 側の検証と unresolved warning を必ず付ける）, [TPL-2088](../test-perspectives/TPL-2088-id-reference-notation-uniform-across-sites.md)（id を指す参照サイトは記法と解決規則を全サイトで共有する — 本 AT はその**検証**側の適用）, [TPL-999](../test-perspectives/TPL-999-implicit-data-filtering.md)（集計層で暗黙に畳まない）, [TPL-1720](../test-perspectives/TPL-1720-validation-target-set-enumerates-all-kinds.md)（検証対象集合は spec が許す全 kind を列挙し、重複する集合は同期させる）
- **対象ファイル**:
  - `packages/core/src/spec/infra-index.ts`（`indexDeclaredInfra` — 宣言された物理の唯一の列挙）
  - `packages/core/src/parser/reference-validation.ts`（`validatePhysicalRefs`）
  - `packages/core/src/view/coverage-extract.ts`（`collectPhysical`）
  - `packages/cli/src/coverage.ts`（物理セクションの md 出力）
  - `docs/spec/diagnostics.md` / `.ja.md`、`docs/spec/syntax.md` §S6

> dot 記法の物理参照（`resource <Infra>.<Leaf>` と entity の `table <Infra>.<Leaf>`）だけが
> 存在検査を受けていなかった。bare `resource X` は解決できなければ `unassigned-resource` を
> 出すのに、dotted 形式は宣言の有無を問われずに解決済みとして扱われる — この**記法間の
> 非対称**が、`database` ブロックを丸ごと失ったモデルを無診断で通していた（#1991 では
> 35 テーブル中 9 本が消えた）。一方 `table` を持たない entity は正当な状態なので診断に
> しない。「宣言されていないものを指した」は defect、「まだ対応付けていない」は計測値、
> という register の切り分けが本 AT の主眼。
>
> [TPL-2088](../test-perspectives/TPL-2088-id-reference-notation-uniform-across-sites.md) は
> 参照サイト間で**受理する記法**を揃えることを求める。本件はその隣、**検証**を揃える側の
> 適用である（`resource X.Y` が受理する形は変えていない — 既存の infra-block.leaf 意味論の
> ままで、存在検査だけを bare 形式と同じ水準に引き上げた）。

## 受け入れ条件

### AC-1: 宣言されていない物理を指す参照が報告される

- [x] AT-A: `database` ブロックごと存在しないモデルで `resource Db.T` が `unresolved-resource-ref`（`missing: "block"`）を出す — #1991 で観測された形

  > ✅ Automated — `packages/core/src/parser/physical-ref-validation.test.ts` › physical reference existence › reports a resource whose infra block is not declared at all

- [x] AT-B: ブロックはあるが leaf が無い場合は `missing: "leaf"` になり、A と区別できる（修復手段が違うため、コードだけでは足りない）

  > ✅ Automated — `packages/core/src/parser/physical-ref-validation.test.ts` › physical reference existence › distinguishes a declared block missing only the leaf

- [x] AT-C: entity の `table Db.T` も同様に `unresolved-table-ref` を block / leaf の別付きで出す

  > ✅ Automated — `packages/core/src/parser/physical-ref-validation.test.ts` › physical reference existence › reports an entity table mapping that names an undeclared block ／ reports an entity table mapping that names an undeclared leaf

- [x] AT-D: メッセージに infra id・leaf id（`unresolved-table-ref` は entity id も）が en / ja 両方で現れる

  > ✅ Automated — `packages/i18n/src/render-diagnostic.test.ts`（`SAMPLES` / `IDENTIFIERS` の網羅検査。新コードを追加すると型エラーになる）

### AC-2: 正当な状態には出さない

- [x] AT-E: 正しく結線されたモデル（database / queue / storage の 3 種すべて）では 1 件も出ない

  > ✅ Automated — `packages/core/src/parser/physical-ref-validation.test.ts` › physical reference existence › stays silent on a fully wired model

- [x] AT-F: `table` を持たない entity（`entity Goal` / `entity X {}`）は報告されない — forward design・read-model projection・KV backed はいずれも正当

  > ✅ Automated — `packages/core/src/parser/physical-ref-validation.test.ts` › physical reference existence › says nothing about an entity that carries no table mapping

- [x] AT-G: `[external]` の resource / entity は対象外（`unassigned-resource` と同じ逃げ道）

  > ✅ Automated — `packages/core/src/parser/physical-ref-validation.test.ts` › physical reference existence › exempts [external] resources and entities

- [x] AT-H: import 未解決のドキュメントでは判定しない。§S4.5 の正準形（共有 infra を専用ファイルに置き各スライスが import する）で false positive を出さない

  > ✅ Automated — `packages/core/src/parser/physical-ref-validation.test.ts` › physical reference existence › does not decide a document that still has imports to resolve ／ resolves across an import once the project is merged

- [x] AT-I: 判定は merge 後のモデルで行う — import 先にも無い leaf は報告され、同一 id の infra reopen（§S4.5）は leaf の和集合として扱われる

  > ✅ Automated — `packages/core/src/parser/physical-ref-validation.test.ts` › physical reference existence › reports a dangling ref on the merged model, not per file ／ treats a same-id infra reopen as the union of its leaves (§S4.5)

- [x] AT-J: `examples/` 配下の全 `.krs`（ディレクトリを列挙せず再帰走査）が新 warning を 1 件も出さない — 自分たちの example に出る診断は、example を開いた全員に配る false positive

  > ✅ Automated — `packages/core/src/examples.test.ts` › examples: every shipped .krs is free of node-not-in-context warnings › %s leaves no physical reference dangling

### AC-3: 物理層の回復度が測れる

- [x] AT-K: `coverage` が「参照はされているが entity が対応付けていない leaf」と「対応付けも参照も無い leaf」を**別のリスト**で報告する（前者は機械的修復、後者は再 dive と修復手段が違うため畳まない）

  > ✅ Automated — `packages/core/src/view/coverage-extract.test.ts` › extractCoverage physical section › splits the two drop shapes apart

- [x] AT-L: `table` を持たない entity が所属 domain 付きで事実として列挙される

  > ✅ Automated — `packages/core/src/view/coverage-extract.test.ts` › extractCoverage physical section › lists tableless entities as a fact, with their domain

- [x] AT-M: 正準形（bare `resource Order` → `entity Order { table DB.orders }`）で参照された leaf も参照済みと数える — dotted 形式だけを見ると完全にモデル化された表を「未参照」と誤判定する

  > ✅ Automated — `packages/core/src/view/coverage-extract.test.ts` › extractCoverage physical section › counts a leaf reached through the canonical bare-resource form

- [x] AT-N: database だけでなく queue / storage の leaf も対象になる

  > ✅ Automated — `packages/core/src/view/coverage-extract.test.ts` › extractCoverage physical section › covers queue and storage leaves, not just database tables

- [x] AT-O: 物理宣言を持たないモデルでは物理セクションが空になり、md 出力にも現れない（「計測して 0 だった」と読まれないため）

  > ✅ Automated — `packages/core/src/view/coverage-extract.test.ts` › extractCoverage physical section › is empty for a model that declares no physical layer ／ `packages/cli/src/coverage.test.ts` › coverage CLI › omits the physical section for a model with no infra declarations

- [x] AT-P: `--format json` に `physical.infra` / `physical.tablelessEntities` が乗り、md には物理表と tableless entity の行が出る

  > ✅ Automated — `packages/cli/src/coverage.test.ts` › coverage CLI › carries the physical section through --format json ／ adds a physical table naming the unrecovered leaves

- [x] AT-Q: domain 側の `score` / `thin` / `threshold` が物理セクション追加の前後で変わらない（score は domain 間の相対正規化なので、次元を足すと既存の thin 判定が全部ずれる）

  > ✅ Automated — `packages/core/src/view/coverage-extract.test.ts` › extractCoverage physical section › leaves the per-domain scores untouched

## 手動確認

N/A — 自動テストですべて覆っている。
