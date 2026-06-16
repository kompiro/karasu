# AT: Client capability axis (`capability <name>`)

- **日付**: 2026-04-29
- **関連 Issue**: [#837](https://github.com/kompiro/karasu/issues/837)
- **対象ファイル**:
  - `packages/core/src/lexer/lexer.ts`
  - `packages/core/src/parser/parser.ts`
  - `packages/core/src/types/ast.ts`
  - `packages/core/src/resolver/warnings.ts`
  - `packages/core/src/renderer/svg-renderer.ts`
  - `packages/core/src/renderer/layout.ts`
  - `examples/ja/getting-started/index.krs`, `examples/en/getting-started/index.krs`, `examples/en/client-mcp/index.krs`
  - `docs/spec/syntax.md`, `docs/spec/tags-annotations.md`
- **関連 Design Doc**: [client-capability-modeling.md](../design/client-capability-modeling.md)
- **関連 ADR**: [ADR-20260428-06](../adr/20260428-06-client-mcp-modeling.md) (`client` kind / `resource <storageKind>`)

## 受け入れ条件

- [x] AT-A: `client X [mobile] { capability camera }` がフラット形式で parse でき、AST の `properties.capabilities` に 1 件入る
  > ✅ Automated — `packages/core/src/parser/parser.test.ts` › `parses flat client capabilities`

- [x] AT-B: `capability camera { label "QR" description "..." }` ブロック形式で parse でき、`label` / `description` が AST に保持される
  > ✅ Automated — `packages/core/src/parser/parser.test.ts` › `parses block-form capability with label and description`

- [x] AT-C: 推奨集合外の識別子（`capability remote-config-fetch`）でも parse / render が成功し、警告が出ない
  > ✅ Automated — `packages/core/src/parser/parser.test.ts` › `accepts capability identifiers outside the recommended set without warnings`

- [x] AT-D: 同 capability の重複宣言で `client-capability-duplicate` warning を発行する
  > ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › `warns when a client declares the same capability twice`

- [x] AT-E: `examples/ja/getting-started/` と `examples/en/getting-started/` の MobileApp client に `capability notification` が追加され、render 結果に capability badge が出る
  > ✅ Automated — `packages/core/src/renderer/svg-renderer.test.ts` › `renders a capability count badge on the client card`、および両 examples の Parser.parse() による diagnostics-zero スモーク

- [x] AT-F: `examples/en/client-mcp/` にブロック形式の capability（`camera { label "..." description "..." }`）を含むクライアントが追加される
  > ✅ Automated — `examples/en/client-mcp/index.krs` の Parser.parse() による diagnostics-zero スモーク（既存 examples テストでカバー）

- [x] AT-J: NodeDetailPanel が `🔐 Capabilities` セクションを表示し、`capability` の `name` / `label` / `description` がフルリストで読める
  > ✅ Automated — `packages/app/src/components/NodeDetailPanel.test.tsx` › `lists every client.capability entry with optional label and description` / `omits the section when the client has no capabilities` / `omits the section for non-client kinds`

- [ ] AT-G: `docs/spec/syntax.md` / `docs/spec/tags-annotations.md` に `capability` の構文と推奨集合が追加される
  > 🧑 Manual — 本 PR の syntax.md / tags-annotations.md 差分をレビューして、構文と推奨集合が正しく載っているか確認する

- [ ] AT-H（manual）: ドキュメントを読んだ第三者が `capability` と `resource` の役割の違い（device feature vs operation-tied storage）を理解できる
  > 🧑 Manual — `docs/spec/syntax.md` の `client capability` セクションと `docs/spec/tags-annotations.md` の "What `capability` is NOT" 表を読み、4 軸（resource / capability / credential / authorization）の分離が伝わるかをレビュー

- [ ] AT-I（manual）: Preview で MobileApp client を開いたとき、`🔐 ×N` capability badge が `📦 ×N` resource badge と並んで表示される（getting-started / client-mcp）
  > 🧑 Manual — Preview URL でカードを目視確認する

## 補足

- 識別子集合は **オープン**: typo は LSP の補完で支援する想定で validator は黙って通す。subtype mismatch（`[cli] + camera` 等）の警告も入れない。
- `@when` / `@scope` annotation は MVP では採らない（design doc 案 C は将来 reserved）。
- Native manifest（`AndroidManifest.xml` / `Info.plist` / `manifest.json`）連携はスコープ外。構文側で塞いでいないので将来 opt-in tooling で対応可能。
