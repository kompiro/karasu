# AT: boundary / facet を Reference から到達可能にする

- **日付**: 2026-08-04
- **関連 Issue**: [#2316](https://github.com/kompiro/karasu/issues/2316)
- **関連 ADR**: **新規** [ADR-2316](../adr/2316-experimental-notation-in-reference.md)（experimental notation は載せる + 明示する）。refine 対象は [ADR-1820](../adr/1820-notation-promotion-gate.md)
- **関連 spec**: [`docs/spec/syntax.md`](../spec/syntax.md) §Grouping the system view (`boundary`) / §Cross-cutting membership (`facet`)（+ja）
- **関連 TPL**: **新規** [TPL-2316](../test-perspectives/TPL-2316-declarable-construct-reachable-from-reference.md)、[TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)、[TPL-1296](../test-perspectives/TPL-1296-spec-doc-reference-data-sync.md)、[TPL-2158](../test-perspectives/TPL-2158-catalog-fenced-against-parser-not-generated-doc.md)
- **対象ファイル**:
  - `packages/core/src/builtins/reference-data.ts` / `reference.ts` / `index.ts`
  - `packages/app/src/components/ReferenceContent.tsx`、`packages/app/src/styles/components/panels.css`
  - `packages/i18n/src/{types,en,ja}.ts`

## 受け入れ条件

- [x] AT-A: `getReference()` が `boundary` / `facet` を返し、どちらも `experimental: true` を持つ

  > ✅ Automated — `packages/core/src/builtins/reference-top-level-coverage.test.ts` › `experimental notation is listed AND flagged (ADR-2316)` › `marks boundary and facet experimental`

- [x] AT-B: `KrsFile` の**全** array フィールドが `getReference()` から到達できる（新しい top-level 構文を足したら、到達経路を宣言するまで型エラーで落ちる）

  > ✅ Automated — 同ファイル › `every top-level construct is reachable from getReference() (TPL-2316)`。経路表は `satisfies Record<ArrayKeys<KrsFile>, Surface>` で `KrsFile` に縛られており、宣言と検証を分けている（表は「どこから到達できるはず」を主張するだけで、テストが実際に `getReference()` を引いて確かめる）

- [x] AT-C: `facets` を広告する node kind が 1 つでもあるなら、それが指す `facet` 構文がカタログにある（#2316 が報告した非対称そのものを assert する）

  > ✅ Automated — 同ファイル › `the facets property and the facet declaration are both findable`。片側ずつのカバレッジ検査では両方 green になるため、非対称を直接書いている

- [x] AT-D: `boundary` / `facet` が広告するプロパティは実際に parse し、parse するプロパティはすべて広告されている（双方向）

  > ✅ Automated — `packages/core/src/builtins/reference-parser-sync.test.ts` › `REFERENCE_DATA.groupingConstructs ↔ parser`。TPL-2158 の実測マトリクスパターンを踏襲

- [x] AT-E: `docs/spec/syntax.md` の該当節と、カタログの `experimental` フラグが一致する

  > ✅ Automated — `packages/core/src/builtins/reference-spec-sync.test.ts` › `syntax.md: every grouping construct has its own section, and the section agrees on experimental`。spec 側は**生成していない**手書き節なので、この照合は循環しない（TPL-2158）

- [x] AT-F: spec の宣言ブロックのスニペットが書くプロパティは、すべてカタログに載っている

  > ✅ Automated — 同ファイル › `syntax.md: every documented grouping-construct property is in the catalog`。抽出器が実際に何か取れたことも先に assert しており、「何も抽出できなかったから green」にならない

- [x] AT-G: Reference パネルの Syntax タブに `Grouping & Membership` 表が出て、`boundary` / `facet` / `contains` / `facets` が読める

  > ✅ Automated — `packages/app/src/components/ReferenceContent.test.tsx` › `Syntax tab reaches boundary and facet, and says how membership is written (#2316)`

- [x] AT-H: experimental な節にだけ experimental バッジが付き、バッジは見出しの中にある（記法を見た人が必ず但し書きも見る）

  > ✅ Automated — 同ファイル › `marks the experimental Syntax sections with a badge, and only those`。`Node Kinds`（v1.0-stable）にバッジが付いていないことも同時に確認する

- [x] AT-I: `import` / `@import` の 4 形式が Syntax タブに出る

  > ✅ Automated — 同ファイル › `Syntax tab documents the import forms (#2316)`

- [ ] AT-J: 🧑 Manual — <https://karasu.kompiro.dev/> で Reference を開き（ツールバーの Docs → Reference）、Syntax タブの `Grouping & Membership` の表とスニペットが**読んで理解できる**こと。とくに「boundary は宣言側から `contains`、facet は要素側に `facets`」という違いが表の Membership 列だけで伝わるか

- [ ] AT-K: 🧑 Manual — experimental バッジが light / dark 双方で見出しと判別でき、かつ見出しより目立ちすぎないこと（バッジが主役になると表が読めなくなる）。バッジに hover して説明 tooltip が出ることも確認する

- [ ] AT-L: 🧑 Manual — 言語を `ja` に切り替え、表のヘッダ（構文 / 説明 / 所属の書き方 / プロパティ）と説明文が日本語で出ること。構文キーワード（`boundary` / `facets`）は英語のままであること

## 補足 — 自動化しなかったもの

**「表を読んで構文が書けるか」**（AT-J）は自動化していない。テストが言えるのは
「文字列が存在する」までで、Membership 列 1 行で違いが伝わるかは読む人にしか判定
できない。experimental が出荷されている間の実測フィードバックで文言を調整する前提。

`packages/vscode` の WebView は #2316 の本文が示唆する `getReference()` の consumer に
**現時点では入っていない**（grep で 0 件）。将来 consumer になったときは、本 AT の
AT-G / AT-H が VS Code 側にも要ることになる。
