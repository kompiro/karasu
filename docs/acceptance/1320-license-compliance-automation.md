---
type: process
---

# AT-1320: license-compliance automation（allowlist CI + THIRD_PARTY_NOTICES）

- **日付**: 2026-05-12
- **関連 Issue**: [#1320](https://github.com/kompiro/karasu/issues/1320)
- **対象ファイル**:
  - `scripts/ci/license-allowlist.ts` / `scripts/ci/license-allowlist.test.ts`（allowlist 定数 + SPDX 式評価 + `findDisallowed`）
  - `scripts/ci/check-license-allowlist.ts`（CI エントリ — `pnpm licenses list --prod --json` を照合）
  - `scripts/ci/generate-third-party-notices.ts` / `scripts/ci/generate-third-party-notices.test.ts`（`THIRD_PARTY_NOTICES.md` 生成）
  - `package.json`（`check:licenses` / `gen:notices` scripts）
  - `.github/workflows/ci.yml`（`License allowlist` ステップ）
  - `packages/cli/package.json` / `packages/vscode/package.json`（`prebuild` で notices 生成、cli の `files` / `prepack`）
  - `.gitignore`（`THIRD_PARTY_NOTICES.md` を除外）
  - `.github/PULL_REQUEST_TEMPLATE.md`（`Dependency & license impact` セクション）
  - `CONTRIBUTING.md`（新規 — `License compliance` 節）
  - `docs/design/license-compliance-automation.md`
- **ADR**: 実装完了後に昇格予定（`docs/design/license-compliance-automation.md` 参照）

## 受け入れ条件

- [ ] AT-A: `pnpm licenses list --prod --json` の出力に対し、allowlist 外のライセンス（`GPL-3.0`、`Unknown` 等）を持つ依存があると `check:licenses` が非ゼロ終了し、依存名・バージョン・該当 SPDX・対処先（CONTRIBUTING.md）を出力する。SPDX 式（`(MPL-2.0 OR Apache-2.0)`、`MIT AND ISC`、`Apache-2.0 WITH ...`、ネストした括弧）は OR=いずれか許可で可 / AND=全部許可で可 として評価し、不正な式は fail-closed で拒否する
  > ✅ Automated — `scripts/ci/license-allowlist.test.ts`（`isLicenseAllowed` / `findDisallowed`）

- [ ] AT-B: `generate-third-party-notices.ts` が依存パッケージのディレクトリから `LICENSE` / `LICENCE` / `COPYING` / `NOTICE`（拡張子付き含む、大文字小文字無視）を検出し、`LICENSE` を優先して全文を読む。見つからない場合は SPDX のみ記載。`@karasu-tools/*` の workspace 内部パッケージは除外。出力 markdown は依存ごとに見出し + `name@version` + `License: <spdx>` + ライセンス全文（fenced）を含む
  > ✅ Automated — `scripts/ci/generate-third-party-notices.test.ts`（`readLicenseFile` / `renderNotices`）

- [ ] AT-C（manual）: `GPL-3.0` 等の copyleft 依存を一時的に追加したブランチで CI を回し、`License allowlist` ジョブが「分かりやすいメッセージ」（依存名・SPDX・CONTRIBUTING.md への誘導）とともに落ちることを確認する
  > 🧑 Manual — copyleft 依存を入れた PR で CI 失敗とメッセージ内容を目視確認

- [ ] AT-D（manual）: `pnpm --filter karasu-vscode run build` を実行すると `packages/vscode/THIRD_PARTY_NOTICES.md` が生成され、`marked` / `vscode-languageclient` 等のバンドル依存の LICENSE 全文を含むこと、続けて `vsce package` で生成した `.vsix` を展開すると `THIRD_PARTY_NOTICES.md` が同梱されていることを確認する
  > 🧑 Manual — `.vsix` 内の notices ファイルの存在と可読性を目視確認

- [ ] AT-E（manual）: PR テンプレートに `Dependency & license impact` セクションが表示され、prod 依存追加・major bump 時のチェック項目（allowlist 通過 / Apache-2.0 の NOTICE 確認）が機能することを、実際の依存追加 PR で確認する
  > 🧑 Manual — 依存追加 PR でテンプレートのセクション表示を目視確認
