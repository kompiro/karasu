# AT: `database [index]` tag marks a derived search / vector index

- **日付**: 2026-06-23
- **関連 Issue**: [#1718](https://github.com/kompiro/karasu/issues/1718)
- **対象ファイル**: `packages/core/src/builtins/reference-data.ts`,
  `packages/core/src/builtins/default-style.ts`, `docs/spec/syntax.md`,
  `docs/spec/tags-annotations.md`(+`.ja.md`),
  `examples/{en,ja}/multi-file-system/infra.krs`

## 受け入れ条件

該当する観点は [TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md)（受理される語彙は効果を持つ）。設計の経緯は `docs/design/vector-store-vs-database.md`。

- [x] `database X [index]` をパースし、`tags` に `index` が入る

  > ✅ Automated — `packages/core/src/parser/parser.test.ts` › `database block` › `parses the [index] tag on a database block (#1718)`

- [x] `database [index]` ノードに builtin スタイルが `index` バッジを付与し、cylinder シェイプは維持する。素の `database`（正本）にはバッジが付かない

  > ✅ Automated — `packages/core/src/resolver/style-resolver.test.ts` › `resolveStyles` › `gives \`database [index]\` an \`index\` badge from the builtin stylesheet (#1718)`

- [x] `index` タグが `REFERENCE_DATA.tags` に登録され、生成される `docs/spec/tags-annotations.md`(+`.ja.md`) の表に反映される

  > ✅ Automated — `packages/core/src/examples.test.ts` / reference-data sync ガード（`pnpm gen:reference` のドリフトを検出）

- [x] examples の `multi-file-system/infra.krs`（en/ja）の `SearchIndex` が `[index]` で印付けされ、`examples.ts` と byte 一致する

  > ✅ Automated — `packages/core/src/examples.test.ts`（byte 一致ガード）

- [ ] App で `database [index]` を含む `.krs` を開くと、system 図上で当該 database ノードに `index` バッジが表示され、正本 database と視覚的に区別できる（dark / light 両テーマ）

  > 🧑 Manual — App（ProjectMode の `multi-file-system` サンプル）で infra ビューを開き、`SearchIndex` ノードに `index` バッジが出ること、テーマ切替で潰れないことを目視確認する。

## 備考（スコープ外 / follow-up）

- `index-without-source` 診断（派生 index が参照元を持たない場合の info 警告）は本 PR スコープ外。別 Issue で検討する。
- shared-infra-fan-in からの `[index]` 除外可否も未決定（design doc の未解決の問い）。
