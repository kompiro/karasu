---
type: product
---

# AT-1111: Edge ID style selector (`edge#<id>`)

- **日付**: 2026-05-05
- **関連 Issue**: [#1111](https://github.com/kompiro/karasu/issues/1111)（Phase B）、[#1096](https://github.com/kompiro/karasu/issues/1096)（親）、[#1110](https://github.com/kompiro/karasu/issues/1110)（Phase A）
- **対象ファイル**:
  - `packages/core/src/lexer/style-lexer.ts`
  - `packages/core/src/parser/style-parser.ts`
  - `packages/core/src/parser/style-parser.test.ts`
  - `packages/core/src/types/style.ts`
  - `packages/core/src/resolver/style-resolver.ts`
  - `packages/core/src/resolver/style-resolver.test.ts`
  - `packages/core/src/index.test.ts`
  - `docs/spec/style.md`、`docs/spec/style.ja.md`
- **関連 Design Doc**: [`docs/design/edge-id-selector.md`](../design/edge-id-selector.md)

## 受け入れ条件

- [x] AT-A: `.krs.style` の `edge#<author-id>` セレクタが parse され、`StyleSelector.edgeId` に当該識別子が入る
  > ✅ Automated — `packages/core/src/parser/style-parser.test.ts` › `edge#<id> selector › parses an edge selector with an author id`

- [x] AT-B: `edge#<from>-><to>`（sync の base 形式）が parse され、`StyleSelector.edgeId` が `<from>-><to>` の形で入る
  > ✅ Automated — `packages/core/src/parser/style-parser.test.ts` › `edge#<id> selector › parses an edge selector with a sync base id`

- [x] AT-C: `edge#<from>--><to>`（async の base 形式）が parse され、`StyleSelector.edgeId` が `<from>--><to>` の形で入る
  > ✅ Automated — `packages/core/src/parser/style-parser.test.ts` › `edge#<id> selector › parses an edge selector with an async base id`

- [x] AT-D: `edge#<id>[tag]` 形式（id とタグの併用）が parse され、`edgeId` と `tags` の両方が設定される
  > ✅ Automated — `packages/core/src/parser/style-parser.test.ts` › `edge#<id> selector › combines edge id with a tag selector`

- [x] AT-E: `edge#<id>` の specificity は 101（id 寄与 100 + 種別 `edge` 寄与 1）になる
  > ✅ Automated — `packages/core/src/parser/style-parser.test.ts` › `computeSpecificity › edge id = 100, edge#<id> with type = 101`

- [x] AT-F: resolver が `selector.edgeId` を持つルールを `edge.canonicalId` と一致するエッジにのみ適用する。一致しないエッジには影響を与えない
  > ✅ Automated — `packages/core/src/resolver/style-resolver.test.ts` › `edge#<id> selector › matches an edge by author id and beats a tag selector`

- [x] AT-G: `canonicalId` が `undefined`（base collision で曖昧解決を諦めたケース）のエッジは `edge#<base>` セレクタに一致しない
  > ✅ Automated — `packages/core/src/resolver/style-resolver.test.ts` › `edge#<id> selector › does not match an edge whose canonicalId was cleared by a base collision`

- [x] AT-H: end-to-end で `compile()` を呼び、`edge#<author-id>` が SVG 出力に反映される（author id 付きエッジを `.krs` で書き、`.krs.style` で `edge#<author-id> { color: ... }` を当てる）
  > ✅ Automated — `packages/core/src/index.test.ts` › `compile — edge#<id> style selector (end-to-end) › targets an edge by author id`

- [x] AT-I: end-to-end で base 形式の `edge#<from>-><to>` が反映される
  > ✅ Automated — `packages/core/src/index.test.ts` › `compile — edge#<id> style selector (end-to-end) › targets an edge by computed base id when no author id is present`

- [ ] AT-J（manual）: 実際の Preview で、`.krs` で `A -> B "primary" #criticalWrite` を書き、`.krs.style` で `edge#criticalWrite { color: #ef4444; stroke-width: 3px; }` を書くと、当該 edge だけが赤く太くなることを確認する
  > 🧑 Manual — `pnpm --filter @karasu-tools/app run dev` で Preview を起動し、複数 edge を含むサンプル（例: `examples/getting-started/index.krs`）に上記 author id を追加して目視確認する

- [ ] AT-K（manual）: `usecase` 内の `resource <ref> #<id> { operations ... }` で付けた author id が、合成された usecase→resource edge に伝搬し、`edge#<id>` で個別スタイルが当たることを確認する
  > 🧑 Manual — usecase view ドリルダウンで対象エッジを絞り込んで上書きが反映されているかを確認

## 補足

- `edge#<id>` は **per-edge surgical override 用**。read/write のような分類に応じた上書きは `edge[write]` / `edge[read]` を優先する（`docs/spec/style.md` §Edge ID selector）
- `canonicalId` は parse + view 抽出の後段（`assignEdgeCanonicalIds`）で確定する。author id 重複は error、base 衝突は warning + `canonicalId` クリアで silent breakage を防ぐ（`docs/design/edge-id-selector.md`、Phase A の AT-1110）
- 本 AT は GUI 編集器（#1076 / #1098）の前段。GUI からの append 書き戻しは別 AT で扱う
