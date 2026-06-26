# AT: karasu-nest /render PNG output (Workers-only)

- **日付**: 2026-06-26
- **関連 Issue**: [#1783](https://github.com/kompiro/karasu/issues/1783)（karasu-nest 壁打ち）
- **関連 ADR**: [ADR-20260626-01](../adr/20260626-01-karasu-nest-hosted-preview.md)（karasu-nest）（Phase 1 / PR 3 の続き）
- **関連 ADR**: [ADR-20260404-03](../adr/20260404-03-png-export-not-adopted.md)（CLI/app の PNG は入れない）— 本 PR は **覆さない**。PNG は Worker（Pages Function）でのみ生成し、core/cli/app は SVG のまま
- **対象ファイル**:
  - `functions/render.ts`（`?format=png` → resvg-wasm でラスタライズ、フォントを env.ASSETS で読み込み）
  - `packages/app/public/fonts/`（Noto Sans = Latin / Noto Sans JP = 日本語フォールバック / OFL.txt）
  - `package.json`（root に `@resvg/resvg-wasm`）、`knip.json`（root の ignoreDependencies）

> `/render?format=png` で共有 payload を PNG にして返す。OGP / 画像埋め込み用。**Worker のみ**（resvg-wasm = WebAssembly）。SVG 経路は `renderSharePayload`（既存・テスト済み）で生成し、その SVG を Worker でラスタライズする。
>
> **フォント**: resvg は Worker にシステムフォントが無いため、Noto Sans（Latin, 570KB）と Noto Sans JP（日本語サブセット, 4.3MB, Latin も内包）を**静的アセット**として配信し、`env.ASSETS` 経由で取得して `fontBuffers` に渡す（module scope で1回キャッシュ）。`sansSerifFamily="Noto Sans"`＋日本語はフォールバックで Noto Sans JP。Node + resvg-wasm で英語・日本語の両描画を事前確認済み。
>
> **配給方針の根拠**: フォントは **vendor（静的アセット）** で固定する。CDN fetch / Cloudflare Fonts も検討したが、画像生成パイプラインに外部実行時依存を持ち込まず（jsDelivr 等のダウン/URL 変更で OGP 画像が壊れない）、描画を決定的に保つため。Noto は更新が稀で再取り込みコストはほぼゼロ。woff2 は resvg-wasm でも描画可だが CJK は CFF で圧縮が効きにくく削減は中程度のため TTF/OTF のまま。

## 受け入れ条件

> PNG ラスタライズは Worker ランタイム（resvg-wasm）でのみ動くため、CI の vitest では検証できない。**Cloudflare プレビューデプロイに対する curl / ブラウザで検証**する（SVG エンドポイントと同じ方式）。SVG 経路は既存の自動テストで担保済み。

### 自動（既存）

- [x] AT-A: SVG 経路（`format` 省略 / `format!=png`）は従来どおり 200 SVG / 400・422 を返す

  > ✅ Automated — `packages/app/src/render/share-render.test.ts`（`renderSharePayload`）

### 手動（プレビューデプロイで検証）

- [ ] AT-B: `GET /render?s=<payload>&view=system&format=png` が **200 `image/png`** を返し、先頭が PNG マジックバイト（`\x89PNG`）
- [ ] AT-C: バンドルされた `.krs.style`（`edge[from=…]` 等）が PNG 画像にも反映される（SVG→raster の一貫性）
- [ ] AT-C2: **ラベルのテキストが描画される**（Latin = Noto Sans）。図にノード名・エッジラベルが見える
- [ ] AT-C3: **日本語ラベルが描画される**（Noto Sans JP フォールバック。例: `店舗` / `注文サービス`）
- [ ] AT-D: `?width=<N>` で出力解像度がスケールする（上限 4096）
- [ ] AT-E: `?format=png` でも `view=deploy|org` が効く
- [ ] AT-F: `format` 省略時は従来どおり `image/svg+xml`（PNG 化されない）
- [ ] AT-I: `?format=png` で **`view` 省略時は `system` にフォールバック**して単一ビューを描く（all-views 束ね SVG は CSS `:target` タブ前提で、PNG にするとタブバーのみ・本体空白になるため。all-views は SVG 専用）
- [ ] AT-G: **コンパイル後 Worker のバンドルサイズ上限**に収まり、デプロイが成功する（resvg-wasm の wasm は ~2.4MB。Pages Functions の上限内で動くこと。超える場合はプラン/最適化を検討）
- [ ] AT-H: `<img src="…/render?...&format=png">` で README / OGP に埋め込んで表示される
