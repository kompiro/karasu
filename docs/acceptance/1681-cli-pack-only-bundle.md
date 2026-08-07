# AT: `karasu` CLI が publish する tarball はバンドル単体に固定される

- **日付**: 2026-06-18
- **関連 Issue**: [#1681](https://github.com/kompiro/karasu/issues/1681)
- **対象ファイル**:
  - `packages/cli/package.json`（`files` を `dist/index.js` に限定）
  - `packages/cli/src/packaging.test.ts`（新規・回帰ガード）
- **関連 ADR**: ADR-1315（changesets リリース自動化）, ADR-<番号>（cli-pack-only-bundle）
- **関連 TPL**: [TPL-1681](../test-perspectives/TPL-1681-publishable-tarball-completeness.md), [TPL-1024](../test-perspectives/TPL-1024-dev-vs-packaged-mode-parity.md)

## 受け入れ条件

- [x] `package.json` の `files` が `["dist/index.js", "THIRD_PARTY_NOTICES.md"]` と完全一致する（ディレクトリ全体の `"dist"` glob には退行しない）
  > ✅ Automated — `packages/cli/src/packaging.test.ts` › `ships only the bundle and the third-party notices` / `never falls back to a whole-directory dist glob`

- [x] `bin.karasu` が `./dist/index.js` を指し、その対象が `files` に含まれる
  > ✅ Automated — `packages/cli/src/packaging.test.ts` › `points the bin at the bundle that files ships`

## 補足

- `karasu` の build は esbuild の単一バンドル（`dist/index.js`）。型定義・sourcemap・テスト JS は CLI の実行に不要で、配布物に含めない。
- `npm pack --dry-run` の目視確認は置かない。tarball の中身を決めているのは `files` の allowlist そのもので、`packaging.test.ts` がそれを完全一致で固定している。stale な `dist/*.test.js` / `*.d.ts` / `*.map` が混ざらないのも同じ allowlist の帰結であり、手で pack しても CI が既に主張している以上のことは観測できない。
- 実際の npm publish は `NPM_TOKEN` / OSS launch（#1315）にゲートされておりここでは検証しない。本 PR の `karasu: patch` changeset により、次回 release で pending minor 群とともに `0.1.0` に上がり、build を含む正しい tarball で（name reservation 用に publish された）`0.0.1` を上書きする。
