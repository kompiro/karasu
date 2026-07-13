# AT: 記法クックブック / idiom カタログ（KV store を entry #1）

- **日付**: 2026-07-13
- **関連 Issue**: [#1818](https://github.com/kompiro/karasu/issues/1818)（notation watch round 2 item 1、親 [#1816](https://github.com/kompiro/karasu/issues/1816)）
- **関連 ロードマップ**: [`docs/roadmap.md`](../roadmap.md) §post-v1.0 horizon / notation watch (round 2)（cookbook 新設・KV entry #1・`@kv` 却下）
- **関連 ADR**: [ADR-20260623-04](../adr/20260623-04-vector-store-vs-database.md)（`[index]` = 役割タグ、技術は物理層 — idiom #2 の裏付け）
- **対象ファイル**:
  - `docs/guide/notation-cookbook.md` / `docs/guide/notation-cookbook.ja.md`（新規クックブック）
  - `docs/guide/reverse-engineering-with-ai.md` / `.ja.md`（"what to feed the model" にクックブックを追加）
  - `docs/guide/README.md` / `.ja.md`（Recipes 表に追加）
  - `packages/docs-site/scripts/lib/site-map.ts`（`PUBLISHED_EN_FILES` に登録 — docs-site で公開）
  - `CLAUDE.md`（ドキュメント表の guide 行を更新）

> スコープは **docs のみ**（記法変更なし）。KV = leaf-less `database` + ノード粒度エッジ +
> 物理層 `store` は既存文法で表現済み。`@kv` はアノテーション（lifecycle 標識）であり
> kind ではないため却下。配置は `docs/guide/` の Recipe とし、docs-site の Guides に公開する。

## 受け入れ条件

- [x] AT-A: クックブックが en / ja 両ロケールで存在し、相互リンクを持ち、単一 H1 を持つ（docs-site が title に昇格）

  > ✅ Automated — `docs/guide/notation-cookbook.md` / `.ja.md` の存在・相互リンク・アンカーは docs-site の `check-links`（`pnpm --filter @karasu-tools/docs-site build`）が検証する

- [x] AT-B: クックブックが docs-site で公開される（`PUBLISHED_EN_FILES` に登録され、ja スラッグが生成され、Guides サイドバーに現れる）

  > ✅ Automated — `packages/docs-site/scripts/lib/site-map.ts` の `PUBLISHED_EN_FILES` に `guide/notation-cookbook.md` を含み、docs-site `sync` + `build` が en/ja ページを生成する

- [x] AT-C: reverse-engineering guide の "give the model the syntax" 節と See also が、文法と一緒に渡す資料としてクックブックを参照している（en / ja 両方）

  > ✅ Automated（リンク） — `docs/guide/reverse-engineering-with-ai.md` / `.ja.md` の内部リンクは `check-links` が解決性を検証する

- [x] AT-D: entry #1（KV store）が leaf-less `database` + ノード粒度エッジ（`Service --> Store`）+ 物理層 `store { type … }` を示し、`resource` dot-path ではなくエッジで参照する理由（leaf が無いと未割り当て warning になる）と `@kv` 却下の理由を説明している

  > ✅ Verified — クックブックの idiom #1 スニペットを `render --view system` / `--view deploy` で描画し、warning ゼロ・edge が描画されることを確認済み（`resource SessionStore` 形は `not assigned to any database` warning + orphan になることも確認）

- [x] AT-E: entry #4（shared-infra fan-in）が `resource <Db>.<Leaf>` dot-path による共有と `shared-infra-fan-in` info 診断を示す

  > ✅ Verified — idiom #4 スニペットを `render` で描画し `Info: database "ArticleDB" is shared by 2 services` が出ることを確認済み

### 手動確認（CI で検証できない項目）

- [ ] M-1: クックブックの idiom #1（KV store）スニペットを `index.krs` として karasu app / VS Code 拡張で開くと、system ビューに leaf-less `database`（Session store）と `ApiGateway --> SessionStore` エッジが、deploy ビューに `store "session-kv"`（type "Redis 7"）が realize として描画されること
- [ ] M-2: docs-site（`kompiro.github.io/karasu/`）の Guides サイドバーにクックブックが en / ja 両ロケールで現れ、reverse-engineering guide からのリンクをたどって到達できること
- [ ] M-3: `syntax.md` + このクックブックを LLM に渡すと、KV store を（`@kv` や新 kind を発明せず）leaf-less `database` + 物理層 engine として idiom 通りにモデル化すること（[#638](https://github.com/kompiro/karasu/issues/638) のユーザーテストに合流する定性評価）
