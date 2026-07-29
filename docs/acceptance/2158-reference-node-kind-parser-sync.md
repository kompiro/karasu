# AT: Reference node-kind catalog matches the parser

- **日付**: 2026-07-29
- **関連 Issue**: [#2158](https://github.com/kompiro/karasu/issues/2158)
- **対象ファイル**:
  - `packages/core/src/builtins/reference-data.ts`
  - `packages/core/src/builtins/reference-parser-sync.test.ts`
  - `packages/core/src/parser/parser.ts`（`LOGICAL_KEYWORDS` の export）
  - `docs/spec/syntax.md`, `docs/spec/syntax.ja.md`（生成表）
- **関連 ADR**: [ADR-1296](../adr/1296-reference-data-single-source.md)（reference-data.ts が単一の真実の源）、[ADR-14](../adr/14-organization-diagram.md)（`team` プロパティ廃止）、[ADR-1870](../adr/1870-domain-entity-modeling.md)（`entity` kind）
- **関連 TPL**: [TPL-20260729-01](../test-perspectives/TPL-20260729-01-catalog-fenced-against-parser-not-generated-doc.md)、[TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md)、[TPL-20260727-01](../test-perspectives/TPL-20260727-01-parser-acceptance-documented-in-spec.md)

## 受け入れ条件

- [x] AT-A: `nodeKinds` の kind 集合が parser の `LOGICAL_KEYWORDS` + infra leaf 3 種（`table` / `queue-item` / `bucket`）と一致する（= `entity` が載っている）
  > ✅ Automated — `packages/core/src/builtins/reference-parser-sync.test.ts` › `lists exactly the node kinds the parser declares`

- [x] AT-B: 各 kind について、catalog が列挙するプロパティはすべて実際に parse でき、parse できるプロパティはすべて列挙されている（双方向）
  > ✅ Automated — `packages/core/src/builtins/reference-parser-sync.test.ts` › ``​`%s`: every listed property parses, and every property that parses is listed``（全 14 kind を `it.each` で展開）

- [x] AT-C: `client` に `capability` が、`resource` に `operations` が載っている
  > ✅ Automated — AT-B のマトリクスに含まれる。加えて `packages/core/src/builtins/reference.test.ts` › `client kind exposes handles, resource, capability and link properties`

- [x] AT-D: `service` / `domain` から `team` が消えている（書くと `team-property-removed` error になるため）
  > ✅ Automated — AT-B のマトリクス（「列挙されているが parse できない」側の assert）

- [x] AT-E: `domain.canContain` に `entity` が含まれ、`entity` を受理しない kind は列挙していない
  > ✅ Automated — `packages/core/src/builtins/reference-parser-sync.test.ts` › `places 'entity' in the canContain of the only kind that may hold one`

- [x] AT-F: lexer に新しいプロパティ keyword が landed したとき、実測マトリクスの候補表が古いままなら CI が落ちる
  > ✅ Automated — `packages/core/src/builtins/reference-parser-sync.test.ts` › `covers every property keyword the lexer knows`（`KRS_KEYWORD_NAMES` との差分）

- [x] AT-G: `docs/spec/syntax.md` / `syntax.ja.md` の Logical structure 表に `entity` 行が生成され、`domain` の May contain が `usecase`, `entity` になる
  > ✅ Automated — `pnpm gen:reference --check`（lefthook pre-push / `ci.yml` / `reference-docs-check.yml` / `scripts/reference/gen-docs.test.ts`）

- [ ] AT-H: app の Reference パネル（Syntax タブ / system ビュー）の Node Kinds 表に `entity` 行が表示され、`client` 行に `capability` が、`resource` 行に `operations` が並び、`service` / `domain` 行から `team` が消えている
  > 🖐 手動確認 — `pnpm dev` で app を開き Reference パネルを表示。en / ja 両ロケールで確認する（`entity` の description は locale 別）

- [ ] AT-I: VS Code 拡張の webview でも同じ Node Kinds 表が更新されている
  > 🖐 手動確認 — 拡張ホストで preview を開き Reference パネルを確認

## 備考

`canContain` は `entity` を除いて parser が強制しないため（`client` の中の
`usecase` すら parse は通る）、実測で縛れるのは `entity` の配置規則のみ。残りの
containment 列はドキュメント上の記述として残る。`system` の `canContain` と
`docs/spec/syntax.md` §S2 の食い違い（§S2 は `domain` / `usecase` / `resource` も
system の子として列挙）は語彙の判断を要するため本 PR のスコープ外。
