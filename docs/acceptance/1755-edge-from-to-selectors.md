---
type: product
---

# AT-1755: Source/target edge style selectors (`edge[from=<id>]` / `edge[to=<id>]`)

- **日付**: 2026-06-24
- **関連 Issue**: [#1755](https://github.com/kompiro/karasu/issues/1755)（本体）、[#1728](https://github.com/kompiro/karasu/issues/1728)（分離元 — color-by-source の動機）
- **対象ファイル**:
  - `packages/core/src/types/tokens.ts`
  - `packages/core/src/lexer/style-lexer.ts`
  - `packages/core/src/parser/style-parser.ts`
  - `packages/core/src/parser/style-parser.test.ts`
  - `packages/core/src/types/style.ts`
  - `packages/core/src/resolver/style-resolver.ts`
  - `packages/core/src/resolver/style-resolver.test.ts`
  - `packages/core/src/index.test.ts`
  - `packages/core/src/builtins/reference-data.ts`
  - `packages/core/src/types/ast.ts`、`packages/i18n/src/{render-diagnostic,en,ja}.ts`
  - `docs/spec/style.md`、`docs/spec/style.ja.md`、`docs/spec/diagnostics.md`、`docs/spec/diagnostics.ja.md`
- **関連 ADR / TPL**: [ADR-20260624-04](../adr/20260624-04-edge-from-to-selectors.md)、[TPL-20260624-03](../test-perspectives/TPL-20260624-03-edge-endpoint-selector-id-form.md)

## 受け入れ条件

- [x] AT-A: `edge[from=<id>]` が parse され、`StyleSelector.edgeFrom` に id が入る（`edgeTo` / `tags` は空）
  > ✅ Automated — `packages/core/src/parser/style-parser.test.ts` › `edge[from=<id>] / edge[to=<id>] selector › parses a source selector`

- [x] AT-B: `edge[to=<id>]` が parse され、`StyleSelector.edgeTo` に id が入る
  > ✅ Automated — `style-parser.test.ts` › `... › parses a target selector`

- [x] AT-C: dot-notation の端点（`edge[to=OrderDB.OrderTable]`）が 1 つの id として読まれる
  > ✅ Automated — `style-parser.test.ts` › `... › allows dot-notation endpoints (synthesized usecase->resource edges)`

- [x] AT-D: 端点述語とタグの併用（`edge[from=HatoApi][async]`）で `edgeFrom` と `tags` の両方が設定される
  > ✅ Automated — `style-parser.test.ts` › `... › combines a from predicate with a tag selector`

- [x] AT-E: 通常のタグセレクタ（`edge[external]`）が端点述語と誤認されない
  > ✅ Automated — `style-parser.test.ts` › `... › does not confuse a plain tag selector with an endpoint predicate`

- [x] AT-F: `from` / `to` 以外の属性（`edge[source=X]`）で `unknown-edge-selector-attribute` エラーが出る
  > ✅ Automated — `style-parser.test.ts` › `... › emits a diagnostic for an unknown attribute key`

- [x] AT-G: `edge[from=X]` / `edge[to=X]` の specificity が 11（`edge` 種別 1 + 端点述語 10）になる
  > ✅ Automated — `style-parser.test.ts` › `computeSpecificity › edge[from=X] / edge[to=X] = 11 (edge kind + endpoint predicate)`

- [x] AT-H: resolver が `edge[from=X]` を始点が `X` の全エッジに適用し、非該当エッジには影響しない
  > ✅ Automated — `packages/core/src/resolver/style-resolver.test.ts` › `edge[from=<id>] / edge[to=<id>] selector › colors every edge originating at the source node and leaves others untouched`

- [x] AT-I: resolver が `edge[to=X]` を終点が `X` の全エッジに適用する
  > ✅ Automated — `style-resolver.test.ts` › `... › colors every edge terminating at the target node`

- [x] AT-J: resolver が dot-notation 端点（合成 usecase→resource エッジ）に一致する
  > ✅ Automated — `style-resolver.test.ts` › `... › matches a dot-notation endpoint (synthesized usecase->resource edge)`

- [x] AT-K: end-to-end で `edge[from=A]` 1 ルールがハブ A の fan-out 全体を着色する
  > ✅ Automated — `packages/core/src/index.test.ts` › `compile — edge#<id> style selector (end-to-end) › colors a hub's whole fan-out with one edge[from=<id>] rule`

- [x] AT-L: specificity 表（`docs/spec/style.md` 生成部）に `edge[from=HatoApi]` 行（score 11）が載り、`reference-data.test.ts` の lock と整合する
  > ✅ Automated — `packages/core/src/builtins/reference-data.test.ts` › `SELECTOR_SPECIFICITY › every row's score matches what the style parser computes for its example`

- [ ] AT-M（manual）: 実際の Preview で、複数のエッジを持つハブ（例: `examples/ja/getting-started/index.krs` の中心ノード）に対し `.krs.style` で `edge[from=<Hub>] { color: #3B82F6; }` を書くと、当該ハブから出る全エッジだけが一括で青くなることを目視確認する
  > 🧑 Manual — `pnpm --filter @karasu-tools/app run dev` で Preview を起動し、`index.krs` + style を編集して確認

## 補足

- 端点セレクタは **color-by-source（始点別に色分け）** が主用途。read/write のような分類は引き続き `edge[write]` / `edge[read]`、単一エッジの surgical override は `edge#<id>` を使う。
- `<id>` は `edge.from` / `edge.to` と直接比較する。合成 usecase→resource エッジの端点は dot-notation 形（`OrderDB.OrderTable`）で格納されるため、その形で指定する（`edge#<from>-><to>` の base id と同じ規則）。id 形不一致による silent breakage の観点は TPL-20260624-03 を参照。
