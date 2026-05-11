---
type: tooling
---

# AT-1272: fast check that the vscode build bundles the LSP server

- **日付**: 2026-05-11
- **関連 Issue**: [#1272](https://github.com/kompiro/karasu/issues/1272)
- **対象ファイル**:
  - `packages/vscode/scripts/assert-server-bundled.mjs`（新規）
  - `packages/vscode/package.json`（`postbuild` スクリプト追加）
  - `.github/workflows/ci.yml`（`Build (vscode)` ステップ追加）
- **関連 TPL**: [TPL-20260510-15](../test-perspectives/TPL-20260510-15-dev-vs-packaged-mode-parity.md)（dev vs packaged mode parity — checklist items 1-2）
- **originating bug**: [#1024](https://github.com/kompiro/karasu/issues/1024)（LSP server module unreachable in installed extension）

## 背景

`packages/vscode/package.json` の build script は `cpSync('../lsp/out/server.js', 'out/server.js')` で
LSP server を拡張内にコピーする。これが壊れても `extension.ts` の dev-tree フォールバック
（`../lsp/out/server.js`）のおかげでローカル開発は動き続けるため、回帰の唯一の signal は
`vscode-e2e` ラベル gated の E2E スイートだった。本 AT はこの隙間を埋める **速い fail-early
チェック**（postbuild assertion + 通常 CI でのビルド）の受け入れ条件を記録する。

## 受け入れ条件

- [x] AT-A: `pnpm --filter karasu-vscode run build` 後、`packages/vscode/out/server.js` が存在し、サイズが 0 でない
  > ✅ Automated — `packages/vscode/scripts/assert-server-bundled.mjs`（`postbuild` で自動実行）

- [x] AT-B: 通常 CI（`vscode-e2e` ラベル無し）の `Check` ジョブが vscode をビルドし、`out/server.js` が欠落/空ならビルドが失敗する
  > ✅ Automated — `.github/workflows/ci.yml` › `Check` › `Build (vscode)` ステップ（`postbuild` 経由で assertion 実行）

- [ ] AT-C（manual / regression rehearsal）: `packages/vscode/package.json` の build script から `&& node -e "...cpSync..."` を一時的に削除して `pnpm --filter karasu-vscode run build` を実行すると、`postbuild` が `out/server.js is missing` を stderr に出して exit 1 する。削除を戻すとビルドが成功する
  > 🧑 Manual — cpSync ステップを削った状態でビルドが落ちることを一度確認する

## 補足

- `postbuild` は npm/pnpm のライフサイクルで `build` の直後に自動実行されるため、ローカル開発・
  `vscode-e2e` の事前ビルド・`vsce package` の前段など、拡張がビルドされるすべての経路で
  assertion が走る。CI ステップはそれを「通常 PR でも必ず走る」ようにするためのもの
  （root の `pnpm run build` は vscode を含まないため）
- スコープ外（Issue 参照）: `extension.ts` 内の dev-tree 相対パスを網羅列挙する meta-check、
  build script のリファクタリング、新規バンドルアセットの追加
