# AT: karasu-nest /render PNG output (Workers-only)

- **日付**: 2026-06-26
- **関連 Issue**: [#1783](https://github.com/kompiro/karasu/issues/1783)（karasu-nest 壁打ち）
- **関連 Design Doc**: [karasu-nest-hosted-preview](../design/karasu-nest-hosted-preview.md)（Phase 1 / PR 3 の続き）
- **関連 ADR**: [ADR-20260404-03](../adr/20260404-03-png-export-not-adopted.md)（CLI/app の PNG は入れない）— 本 PR は **覆さない**。PNG は Worker（Pages Function）でのみ生成し、core/cli/app は SVG のまま
- **対象ファイル**:
  - `functions/render.ts`（`?format=png` → resvg-wasm でラスタライズ）
  - `package.json`（root に `@resvg/resvg-wasm`）、`knip.json`（root の ignoreDependencies）

> `/render?format=png` で共有 payload を PNG にして返す。OGP / 画像埋め込み用。**Worker のみ**（resvg-wasm = WebAssembly）。SVG 経路は `renderSharePayload`（既存・テスト済み）で生成し、その SVG を Worker でラスタライズする。

## 受け入れ条件

> PNG ラスタライズは Worker ランタイム（resvg-wasm）でのみ動くため、CI の vitest では検証できない。**Cloudflare プレビューデプロイに対する curl / ブラウザで検証**する（SVG エンドポイントと同じ方式）。SVG 経路は既存の自動テストで担保済み。

### 自動（既存）

- [x] AT-A: SVG 経路（`format` 省略 / `format!=png`）は従来どおり 200 SVG / 400・422 を返す

  > ✅ Automated — `packages/app/src/render/share-render.test.ts`（`renderSharePayload`）

### 手動（プレビューデプロイで検証）

- [ ] AT-B: `GET /render?s=<payload>&view=system&format=png` が **200 `image/png`** を返し、先頭が PNG マジックバイト（`\x89PNG`）
- [ ] AT-C: バンドルされた `.krs.style`（`edge[from=…]` 等）が PNG 画像にも反映される（SVG→raster の一貫性）
- [ ] AT-D: `?width=<N>` で出力解像度がスケールする（上限 4096）
- [ ] AT-E: `?format=png` でも `view=deploy|org` が効く
- [ ] AT-F: `format` 省略時は従来どおり `image/svg+xml`（PNG 化されない）
- [ ] AT-G: **コンパイル後 Worker のバンドルサイズ上限**に収まり、デプロイが成功する（resvg-wasm の wasm は ~2.4MB。Pages Functions の上限内で動くこと。超える場合はプラン/最適化を検討）
- [ ] AT-H: `<img src="…/render?...&format=png">` で README / OGP に埋め込んで表示される
