# AT: repo-backed + ref-pinned permalink resolver (karasu-nest Phase 2)

- **日付**: 2026-07-14
- **関連 Issue**: [#1828](https://github.com/kompiro/karasu/issues/1828)（親エピック #1826 permalink layer）
- **設計**: [docs/design/repo-backed-ref-pinned-permalink.md](../design/repo-backed-ref-pinned-permalink.md)
- **関連 ADR**: [ADR-20260626-01](../adr/20260626-01-karasu-nest-hosted-preview.md)（karasu-nest / Phase 2 を後続化）, [ADR-20260404-06](../adr/20260404-06-github-markdown-render-service.md)（`isSafeUrl` SSRF 対策）, [ADR-20260407-04](../adr/20260407-04-cloudflare-deployment-and-byok-ai.md)（BYOK）
- **Related TPLs**: [TPL-20260510-17](../test-perspectives/TPL-20260510-17-trust-boundary-input-validation.md)（外部 input を trust boundary 越え前に validate / canonicalize）
- **対象ファイル**:
  - `packages/app/src/render/repo-permalink.ts`（フレームワーク非依存の resolver + GitHub-raw FileSystemProvider）
  - `functions/r/[[path]].ts`（Cloudflare Pages Function アダプタ、`/r/*` にスコープ）

> `<owner>/<repo>[/<path>]@<ref>` の permalink から、その repo の committed `.krs` を pinned ref 時点で GitHub raw から取得・合成（import inline）し、既存の inline-share payload に畳んで `/s?s=` へ 302 する。**public repo のみ**・**whole-model open**（deep anchor と SHA-keyed cache は後続スライス）。SPA を shadow しないよう resolver は `/r/` prefix にスコープする。

## 受け入れ条件

### AC-1: permalink パースと入力検証（TPL-20260510-17）

- [x] AT-A: `<owner>/<repo>@<ref>`（path 省略）をパースし、default entry にフォールバックする

  > ✅ Automated — `packages/app/src/render/repo-permalink.test.ts` › `parseRepoPermalink` › `parses owner/repo@ref with default entry`

- [x] AT-B: 明示 `.krs` path 付き `<owner>/<repo>/<path>@<ref>` をパースする

  > ✅ Automated — `repo-permalink.test.ts` › `parseRepoPermalink` › `parses an explicit .krs path`

- [x] AT-C: ref は**最後の** `@` で分割する（path に `@` を含んでも壊れない）

  > ✅ Automated — `repo-permalink.test.ts` › `parseRepoPermalink` › `splits the ref on the LAST @`

- [x] AT-D: 不正な入力（`@ref` 欠落 / segment 不足 / ref に空白 / path traversal / 非 `.krs` path / owner charset 違反）を 400 で拒否する

  > ✅ Automated — `repo-permalink.test.ts` › `parseRepoPermalink` › `rejects %s (%s)`（6 ケース）

### AC-2: GitHub-raw FileSystemProvider（SSRF host-pin・traversal 防御・memoize）

- [x] AT-E: repo-relative path を `raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>` にマップし、同一 path の再読込は memo で 1 fetch に抑える

  > ✅ Automated — `repo-permalink.test.ts` › `GitHubRawFileSystemProvider` › `maps repo-relative paths to raw.githubusercontent.com and memoizes`

- [x] AT-F: repo root を脱出する import（`../..`）を拒否する（defense in depth）

  > ✅ Automated — `repo-permalink.test.ts` › `GitHubRawFileSystemProvider` › `rejects an import that escapes the repo root`

- [x] AT-G: directory / wildcard import（`readDir`）は v1 未対応として明示エラーにする

  > ✅ Automated — `repo-permalink.test.ts` › `GitHubRawFileSystemProvider` › `readDir is unsupported (no directory listing in v1)`

### AC-3: 解決とエラーマッピング（single/multi-file・status）

- [x] AT-H: single-file repo を default `index.krs` 経由で解決し 200 + payload を返す

  > ✅ Automated — `repo-permalink.test.ts` › `resolveRepoPermalink` › `resolves a single-file repo via the default index.krs (200)`

- [x] AT-I: `index.krs` 不在時は `karasu.krs` にフォールバックする

  > ✅ Automated — `repo-permalink.test.ts` › `resolveRepoPermalink` › `falls back to karasu.krs when index.krs is absent`

- [x] AT-J: multi-file import を repo FS 越しに解決し、単一の self-contained payload に inline する（元 import 文は落ちる）

  > ✅ Automated — `repo-permalink.test.ts` › `resolveRepoPermalink` › `inlines a multi-file import (import resolution across the repo FS)`

- [x] AT-K: ref に `.krs` が無ければ 404

  > ✅ Automated — `repo-permalink.test.ts` › `resolveRepoPermalink` › `404s when no .krs is found at the ref`

- [x] AT-L: 明示 path が存在しなければ 404

  > ✅ Automated — `repo-permalink.test.ts` › `resolveRepoPermalink` › `404s when an explicit path is missing`

- [x] AT-M: 不正な permalink は 400

  > ✅ Automated — `repo-permalink.test.ts` › `resolveRepoPermalink` › `400s on a malformed permalink`

- [x] AT-N: GitHub の非 404 上流失敗（5xx / rate limit）は 404 と区別して 502

  > ✅ Automated — `repo-permalink.test.ts` › `resolveRepoPermalink` › `502s on an upstream GitHub failure (non-404)`

### 手動確認（実デプロイでのみ検証可能）

- [ ] M-1: Cloudflare Pages デプロイ後、public repo（例 `index.krs` を持つ karasu 自身）に対し `https://<host>/r/<owner>/<repo>@<sha>` を開くと、nest SPA がそのモデルを drill-down 付きで表示する（302 → `/s?s=` → `/#s=` の bounce 経由）
- [ ] M-2: 存在しない ref / repo は 404、不正な permalink は 400 のプレーンテキストを返す
- [ ] M-3: `/r/` 以外のパス（`/s`・`/render`・SPA ルート）は従来どおり配信される（resolver が `_redirects` の `/*` フォールバックや静的アセットを shadow しない）
- [ ] M-4: PR プレビュー（preview.yml）でも `/r/...` が動作する
