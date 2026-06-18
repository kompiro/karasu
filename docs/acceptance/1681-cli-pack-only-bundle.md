# AT: `karasu` CLI が publish する tarball はバンドル単体に固定される

- **日付**: 2026-06-18
- **関連 Issue**: [#1681](https://github.com/kompiro/karasu/issues/1681)
- **対象ファイル**:
  - `packages/cli/package.json`（`files` を `dist/index.js` に限定）
  - `packages/cli/src/packaging.test.ts`（新規・回帰ガード）
- **関連 ADR**: ADR-20260512-05（changesets リリース自動化）, ADR-<番号>（cli-pack-only-bundle）
- **関連 TPL**: [TPL-20260618-02](../test-perspectives/TPL-20260618-02-publishable-tarball-completeness.md), [TPL-20260510-15](../test-perspectives/TPL-20260510-15-dev-vs-packaged-mode-parity.md)

## 受け入れ条件

- [x] `package.json` の `files` が `["dist/index.js", "THIRD_PARTY_NOTICES.md"]` と完全一致する（ディレクトリ全体の `"dist"` glob には退行しない）
  > ✅ Automated — `packages/cli/src/packaging.test.ts` › `ships only the bundle and the third-party notices` / `never falls back to a whole-directory dist glob`

- [x] `bin.karasu` が `./dist/index.js` を指し、その対象が `files` に含まれる
  > ✅ Automated — `packages/cli/src/packaging.test.ts` › `points the bin at the bundle that files ships`

- [ ] `cd packages/cli && pnpm build && npm pack --dry-run` の一覧が `dist/index.js` / `THIRD_PARTY_NOTICES.md` / `LICENSE` / `README.md` / `package.json` のみで、`*.test.*` / `*.d.ts` / `*.map` を一切含まない
  > 🧑 Manual — クリーンな `dist/` で `npm pack --dry-run` を実行し Tarball Contents を目視確認する。

- [ ] `dist/` に stale な tsc 出力（`*.test.js` / `*.d.ts` / `*.map`）が残っていても tarball には混入しない（決定論性）
  > 🧑 Manual — `dist/foo.test.js` `dist/foo.d.ts` `dist/index.js.map` を作ってから `npm pack --dry-run` し、いずれも Tarball Contents に現れないことを確認する。

## 補足

- `karasu` の build は esbuild の単一バンドル（`dist/index.js`）。型定義・sourcemap・テスト JS は CLI の実行に不要で、配布物に含めない。
- 実際の npm publish は `NPM_TOKEN` / OSS launch（#1315）にゲートされておりここでは検証しない。本 PR の `karasu: patch` changeset により、次回 release で pending minor 群とともに `0.1.0` に上がり、build を含む正しい tarball で（name reservation 用に publish された）`0.0.1` を上書きする。
