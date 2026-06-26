# AT: karasu-nest static SVG render endpoint

- **日付**: 2026-06-25
- **関連 Issue**: [#1783](https://github.com/kompiro/karasu/issues/1783)（karasu-nest 壁打ち）
- **関連 Design Doc**: [karasu-nest-hosted-preview](../design/karasu-nest-hosted-preview.md)（Phase 1 / PR 3）
- **対象ファイル**:
  - `packages/app/src/render/share-render.ts`（フレームワーク非依存のレンダリングハンドラ）
  - `functions/render.ts`（Cloudflare Pages Function アダプタ）
  - `.github/workflows/deploy.yml`、`.github/workflows/preview.yml`（Functions 配線）
  - `wrangler.toml`

> 共有 payload（`?s=<encoded {krs, style}>`）を SVG にレンダリングする静的エンドポイント。README 埋め込み / OGP 用。**SVG 先行**、PNG は別 PR。入力は inline-share の fragment と違い **query**（サーバに届く）。

## 受け入れ条件

- [x] AT-A: `?s=<payload>` だけで全ビュー束ね SVG が 200 で返る

  > ✅ Automated — `packages/app/src/render/share-render.test.ts` › `renders the bundled all-views SVG by default (200)`

- [x] AT-B: `?view=system|deploy|org` で単一ビュー SVG が返る

  > ✅ Automated — `share-render.test.ts` › `renders the %s view`（system/deploy/org）

- [x] AT-C: バンドルされた `.krs.style` が適用される（`edge[from=…]` の色が SVG に届く）

  > ✅ Automated — `share-render.test.ts` › `applies the bundled style (edge[from=...] color reaches the SVG)`

- [x] AT-D: `s` 欠落 → 400

  > ✅ Automated — `share-render.test.ts` › `400 when 's' is missing`

- [x] AT-E: `s` 破損 → 400

  > ✅ Automated — `share-render.test.ts` › `400 when 's' is corrupt`

- [x] AT-F: 不正な `view` → 400

  > ✅ Automated — `share-render.test.ts` › `400 when 'view' is invalid`

- [x] AT-G: 共有元にエラーがある → 422

  > ✅ Automated — `share-render.test.ts` › `422 when the shared source has errors`

### 手動確認（実デプロイでのみ検証可能）

- [ ] M-1: Cloudflare Pages デプロイ後、`https://<host>/render?s=<payload>&view=system` が `image/svg+xml` を返す
- [ ] M-2: その URL を `<img src>` で README/Markdown に埋め込むと図が表示される
- [ ] M-3: `.krs.style` を持つ共有で、レンダリング画像に作者のスタイル（エッジ色等）が反映される
- [ ] M-4: `?theme=light` / `?displayMode=icon` が反映される
- [ ] M-5: `/render` 以外のパスは従来どおり SPA が配信される（Functions が `_redirects` の `/*` フォールバックより優先）
- [ ] M-6: PR プレビュー（preview.yml）でも `/render` が動作する
