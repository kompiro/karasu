# AT: keystone・permalink 用語の恒久的な用語集ホーム（#1831）

- **日付**: 2026-07-16
- **関連 Issue**: [#1831](https://github.com/kompiro/karasu/issues/1831)（epic: permalink-layer / #1826）
- **Related TPLs**: [TPL-2005](../test-perspectives/TPL-2005-keystone-terms-single-home.md)（coined 用語は単一の正典を持ち、他 doc は再定義せず参照する）
- **対象ファイル**:
  - `docs/glossary.md` / `docs/glossary.ja.md`（新設 — keystone・permalink 用語集）
  - `docs/prd/keystone-primary-path.md`（用語集節を back-ref に置換）
  - `docs/roadmap.md`（keystone 節に用語集への back-ref）
  - `docs/spec/glossary.md` / `docs/spec/glossary.ja.md`（See also で相互リンク）
  - `packages/docs-site/scripts/lib/site-map.ts`（PUBLISHED_EN_FILES に `glossary.md`）
  - `packages/docs-site/astro.config.mjs`（sidebar に "Keystone glossary" リンク）

> keystone 壁打ちが coin した load-bearing な用語（read/record split・funnel/retained・record-as-byproduct ほか）と permalink family（deep / repo-backed / ref-pinned / inline snapshot）を、恒久的な定義場所 `docs/glossary.md` に一本化する。PRD/roadmap は定義を再掲せず用語集を参照し、モデリング言語用語集 `docs/spec/glossary.md` とは相互リンクで役割を区別する。

## 受け入れ条件

### AC-1: in-site リンク・アンカーが解決し、用語集が sync される

- [x] AT-A: 2 つの用語集の相互リンク、および用語集 → spec/glossary の published リンクが解決する。`glossary.md` が PUBLISHED_EN_FILES に含まれ、EN+JA が sync される

  > ✅ Automated — `pnpm --filter docs-site check-links`（34 pages, all resolve）／`pnpm --filter docs-site sync`（34 pages — EN+JA glossary を含む）

### AC-2: docs-site のページ配線が壊れていない

- [x] AT-B: site-map / rewrite / sync のユニットテストが通る（PUBLISHED_EN_FILES 追加後も route/contentPath 生成が健全）

  > ✅ Automated — `pnpm --filter docs-site test`（52 passed）

### 手動確認（doc 内容・ビルド済みサイトで検証）

- [ ] M-1: `docs/glossary.md` / `.ja.md` が製品方向（read/record split・funnel/retained・record-as-byproduct・source of truth/描画層・supply→share→explore）と permalink family（permalink・deep・repo-backed・ref-pinned・inline snapshot）を過不足なく定義している
- [ ] M-2: `docs/prd/keystone-primary-path.md` の「用語集」節が定義リストを持たず `docs/glossary.md` への back-ref のみ、`docs/roadmap.md` keystone 節が用語集を正典として参照する 1 行を持つ（定義は 1 箇所のみ）
- [ ] M-3: `pnpm --filter docs-site build` 後、`/glossary/`（EN）と `/ja/glossary/`（JA）が描画され、sidebar に "Keystone glossary" が Concepts の下に出る
- [ ] M-4: Reference 配下の既存 "Glossary"（`spec/glossary`）と新 "Keystone glossary" が別ページとして共存し、タイトルで区別できる（H1: "Keystone & permalink glossary" vs "Glossary"）
- [ ] M-5: 用語集内の PRD / roadmap / permalink.md / design doc へのリンク（unpublished → GitHub URL に rewrite）が正しい GitHub パスに解決する
