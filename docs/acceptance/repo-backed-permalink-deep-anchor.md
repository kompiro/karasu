# AT: repo-backed permalink — deep-anchor drill + SHA-keyed cache (#1828 slice c)

- **日付**: 2026-07-15
- **関連 Issue**: [#1958](https://github.com/kompiro/karasu/issues/1958)（親 #1828 permalink layer / epic #1826）
- **設計 (ADR)**: [ADR-1828](../adr/1828-repo-backed-ref-pinned-permalink.md)（repo-backed + ref-pinned permalink、caching / deep-anchor）
- **関連 ADR**: [ADR-1783](../adr/1783-karasu-nest-hosted-preview.md)（stateless、Cache API は新ストアではない）
- **Related TPLs**: [TPL-20260630-01](../test-perspectives/TPL-20260630-01-deep-link-anchor-cross-surface-parity.md)（deep-link anchor は単一 grammar — `?krs=` を `parseHash` で検証し fork しない）
- **対象ファイル**:
  - `packages/app/src/render/share-page.ts`（`/s` bounce が `#krs-…` を `?krs=` に載せ替え）
  - `packages/app/src/utils/deep-link-anchor.ts`（`resolveDeepLinkHash` — 正規化 + precedence）／`packages/app/src/App.tsx`（mount 前正規化）
  - `packages/app/src/render/repo-permalink.ts`（`immutable` フラグ）／`functions/r/[[path]].ts`（Cache API + `Cache-Control`）

> repo-backed permalink `…/r/<owner>/<repo>@<sha>#krs-<view>-<id>` を、要素にドリル／フォーカスした状態で開く（slice 1 は whole-model だった）。fragment は server 不可視なので、`/s` bounce が `location.hash` の `#krs-…` を **`?krs=` query** に載せ替え（payload は `#s=` fragment に据え置き）、SPA が mount 前に canonical `#krs-…` へ正規化する。加えて `@<sha>`（immutable）応答を Cloudflare Cache API で長 TTL キャッシュ（新ストアなし、stateless）。

## 受け入れ条件

### AC-1: SHA-keyed cache TTL selector（resolver）

- [x] AT-A: **full 40-hex SHA** のみ `immutable=true`、abbreviated SHA（7–39 hex）/ `@<branch>` / ref-less HEAD は `false` を返す（Function の `Cache-Control` 選択に使う。abbreviated SHA は hex-branch と区別できないため保守的に mutable 扱い）

  > ✅ Automated — `packages/app/src/render/repo-permalink.test.ts` › `resolveRepoPermalink` › `flags immutable=true only for a SHA-pinned ref (cache TTL selector)`

### AC-2: `/s` bounce が deep anchor を `?krs=` に載せ替える

- [x] AT-B: bounce script は `location.hash` の `#krs-…`（grammar `#(krs-[\w:-]+)`）を検出し `?krs=<anchor>` を付けて bounce する。anchor 無しは従来どおり `/#s=<payload>`。payload は常に `#s=` fragment に残る

  > ✅ Automated — `packages/app/src/render/share-page.test.ts` › `buildSharePage` › `emits OGP meta pointing at the system PNG and bounces to the fragment`

### AC-3: SPA が `?krs=` を canonical `#krs-…` に正規化（precedence + tolerant）

- [x] AT-C: `?krs=<anchor>` が有効なら canonical `#krs-…` を返す（`payload.target` より優先）。無効なら payload target、無ければ null（whole-model）にフォールバック。検証は既存 `parseHash` grammar を流用し fork しない（TPL-20260630-01）

  > ✅ Automated — `packages/app/src/utils/deep-link-anchor.test.ts` › `resolveDeepLinkHash`（7 ケース）

### 手動確認（実デプロイでのみ検証可能）

- [ ] M-1: `https://<host>/r/kompiro/karasu/examples/en/getting-started/index.krs@<sha>#krs-system-<id>` を開くと、nest SPA がその要素にドリル／フォーカスした状態で開く（whole-model ではなく）。`#krs-` 無しは従来どおり whole-model
- [ ] M-2: 存在しない / rename された anchor は whole-model（または nearest-resolvable）で開き、throw しない（tolerant）
- [ ] M-3: full 40-hex `@<sha>` の `/r/...` 応答が `Cache-Control: public, max-age=31536000, immutable` を返す。`HEAD`/branch/abbreviated-SHA は `public, s-maxage=60, max-age=0, must-revalidate`（CDN は 60s キャッシュ、ブラウザは stale redirect を握らない）。`curl -s -D - -o /dev/null <url>`（GET）で確認 — `curl -I` は HEAD で GET-only Function に当たらない
- [ ] M-4: 既存の inline share（`/s?s=` → `/#s=`、`#krs-` 無し）が従来どおり動作する（回帰なし）
