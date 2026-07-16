---
id: ADR-20260716-02
title: repo-backed + ref-pinned permalink（nest Phase 2 resolver）
status: accepted
date: 2026-07-16
topic: navigation
scope:
  packages: [app]
  concerns: [deployment, security]
depends_on: [ADR-20260630-01]
refines: [ADR-20260626-01]
related_to:
  - ADR-20260702-01
  - ADR-20260713-02
  - ADR-20260407-04
  - ADR-20260404-06
  - ADR-20260330-04
assumptions:
  - "file: functions/r/[[path]].ts"
  - "file: packages/app/src/render/repo-permalink.ts"
  - "file: packages/app/src/utils/deep-link-anchor.ts"
  - "grep: adr.config.json :: repoBackedHosts"
  - "file: docs/spec/permalink.md"
---

# ADR-20260716-02: repo-backed + ref-pinned permalink（nest Phase 2 resolver）

- **日付**: 2026-07-16
- **ステータス**: 決定済み
- **関連**:
  - Issue #1828（親エピック #1826 permalink layer）、子スライス #1959（`@<sha>` 推奨検証）
  - PRD [`docs/prd/keystone-primary-path.md`](../prd/keystone-primary-path.md)（#1825）
  - [ADR-20260626-01](20260626-01-karasu-nest-hosted-preview.md)（nest v1 = inline `?s=`、`/<owner>/<repo>` を Phase 2 として後続化。本 ADR がその Phase 2 を具体化）
  - [ADR-20260630-01](20260630-01-permalink-deep-element.md) / [`docs/spec/permalink.md`](../spec/permalink.md)（deep anchor grammar `#krs-<view>-<id>`）
  - [ADR-20260702-01](20260702-01-adr-permalink-convention.md)（`short` + 必須 `source`）、[ADR-20260713-02](20260713-02-adr-permalink-validation.md)（検証は adr-tools `krs` kind）
  - [ADR-20260407-04](20260407-04-cloudflare-deployment-and-byok-ai.md)（BYOK 原則）、[ADR-20260404-06](20260404-06-github-markdown-render-service.md)（`isSafeUrl()` SSRF 対策）
  - 実装 PR: #1945（slice a resolver）/ #1965（slice c deep-anchor + cache）/ #1981（slice d `@<sha>` 推奨検証）
  - TPL: [TPL-20260510-17](../test-perspectives/TPL-20260510-17-trust-boundary-input-validation.md) / [TPL-20260630-01](../test-perspectives/TPL-20260630-01-deep-link-anchor-cross-surface-parity.md) / [TPL-20260630-03](../test-perspectives/TPL-20260630-03-adr-permalink-records-source.md) / [TPL-20260520-02](../test-perspectives/TPL-20260520-02-consistency-check-triggers-on-both-sides.md)

## 背景

keystone PRD（#1825）が定めた retained loop の backbone が permalink layer（#1826）である: 設計判断をする → 結果の構造を in-repo `.krs` に記録する → その構造を **karasu permalink で指す** ADR を書く。

near-term の permalink（inline `?s=` snapshot + taka 短縮）は今日動くが、payload を URL に凍結しているため **repo 非連動**で、`.krs` の version 管理された正本と切れている。また immutability が「URL に凍結したから」であって「ある git ref の内容だから」ではない。ADR が指したいのは「**その決定時点の committed 構造**」である。

#1828 が解く permalink 属性は **repo-backed（GitHub repo の `.krs` を解決して描画）** かつ **ref-pinned（特定 SHA に固定して immutable に描画）**。ADR-20260626-01 が「Phase 2」として明示的に後続化していた `/<owner>/<repo>` resolver を、keystone 決定が funnel-only の後回し項目から retained-product backbone へ格上げした。本 ADR はその resolver の設計を確定する。

## 決定

nest（`packages/app` + Cloudflare Pages Functions）に **permissive な repo-backed permalink resolver** を実装し、URL 形を `…/r/<owner>/<repo>[/<path>][@<ref>]#krs-<view>-<id>` とする。immutability は resolver ではなく **ADR 執筆規約 + `adr:check-permalinks`（adr-tools `krs` kind）の `@<sha>` 推奨検証**で担保する。新パッケージ・新 DB・新描画層・新 anchor grammar は作らず、既存資産（`/render` の fetch+SSRF、Phase 1 の `.krs` 合成、permalink deep anchor、Cache API）の合成で構成する。

## 理由

- **URL 形（軸1）**: `/r/` プレフィックス + `/<owner>/<repo>[/<path>][@<ref>]`。source-path は root `index.krs`（無ければ `karasu.krs`）を既定とし、`/<path>` で override（1-A 既定 + 1-B override）。`/r/` プレフィックスは `/s`・`/render`・SPA ルートを shadow しないための route 優先順位確保（bare `/<owner>/<repo>` route は #1961 で別途検討）。
- **ref 指定と immutability（軸2、permissive）**: `@<ref>` は**任意**。省略時は `raw.githubusercontent.com/<owner>/<repo>/HEAD/<path>` が default branch を **GitHub API hop なし**で解決する（実測確認済み）。branch/tag/SHA いずれも描画するが、`@` を付けたら ref 必須（`@` の後が空はエラー）。「hot path で GitHub API を叩かない」決定を保つ。immutability を resolver パースで強制せず、ref-less HEAD（discovery 用、mutable）と `@<sha>`（ADR 用、immutable）を同じ resolver で賄う。resolver は「開く」責務に徹し、「ADR permalink は immutable であるべき」は上位規約に移す。
- **private repo（軸3）**: v1 は public repo のみ（raw fetch、サービスは token を一切保持しない）。private（BYO-token・per-reader 認証）は permalink の JTBD（読者が誰でもクリックして見える恒久リンク）と緊張関係にあるため後続に分離（#1960）。BYOK 原則（ADR-20260407-04）を維持。
- **caching（軸4）**: SHA-keyed ephemeral cache（Cloudflare Cache API）。full 40-hex `@sha` は内容不変なので `max-age=31536000, immutable`、`HEAD`/branch/短縮 SHA は `s-maxage=60, max-age=0, must-revalidate`（CDN はキャッシュ、browser は revalidate — stale redirect を出さない）。**永続ストアを新設しない**ことで ADR-20260626-01 のステートレス原則（保存型 paste は却下済み）を保つ。
- **deep anchor（軸2 の派生）**: `#krs-<view>-<id>` fragment を素通しし、`/s` バウンスで browser が運ぶ `#krs-…` を `?krs=` query に移して App の `resolveDeepLinkHash`（`utils/deep-link-anchor.ts`）が canonical に正規化する。新 grammar は作らず spec/permalink.md の単一 grammar を共有（TPL-20260630-01）。
- **`@<sha>` 推奨検証（slice d、軸1–3）**: ADR に貼る repo-backed permalink が mutable（ref-less / `@HEAD` / `@branch` / `@tag` / 短縮 SHA）のとき、`@<40-hex-sha>` 固定を**推奨する warning**を出す。判定は `permalink[].short` の host を `adr.config.json` の `permalink.repoBackedHosts`（`["karasu.kompiro.dev", "karasu.pages.dev"]`）と照合する **host allowlist 方式**で、#1961 の route 形（bare vs `/r/`）に非依存。pinned 形は full 40-hex SHA のみ（`/^[0-9a-f]{40}$/`）。**強度は推奨（warn）に留め CI は落とさない** — resolver を permissive にした philosophy と揃え、まだ誰も貼っていない規約を hard-fail で先行導入する premature な締め付けを避ける。将来 config でオプトインの hard-fail に上げる余地は残す。検証ロジックは ADR-20260713-02 に従い karasu-local script ではなく adr-tools `krs` kind（`>=0.0.9`）に置き、karasu は bump + config + docs で adopt する。
- **セキュリティ**: GitHub fetch を host 固定（`raw.githubusercontent.com`）+ ref/path canonicalize（path traversal・SSRF 対策、TPL-20260510-17）。slice d の URL 検査は `new URL()` ベースで ad-hoc regex に頼らない。
- **`source` は不変**: repo-backed URL が `@<sha>` で immutable でも、shortener/resolver/host が将来変わりうるため、復元元 in-repo `.krs` `source` は必須のまま残す（ADR-20260702-01 / TPL-20260630-03）。

## 却下した案

- **ref 必須 + SHA-required で resolver パースが immutability を強制（軸2-B）**: ref-less の自然な discovery 導線を潰し、`@branch` → SHA 解決に GitHub API hop が要り rate-limit を hot path に持ち込む。immutability を resolver で強制するのは責務の取り違え。上位規約 + 検証で足りる。
- **repo-backed 用の新フィールド `repo` / `pinned` を frontmatter に追加（slice d 軸1-B）**: pointer は 1 席（`short`）で足り、repo-backed か否かは URL 形で判別できる。スキーマ発明は受益者が薄い現状で時期尚早。
- **非-pinned を CI hard-fail（slice d 軸3-C）**: resolver の permissive 設計と philosophy がずれる。ref-less / branch も discovery の正当な形であり、「今の living な構造」を指す ADR も正当にありうる。premature な enforcement。
- **karasu-local の grep script で検証（ADR-20260713-02 の再確認）**: 守る repo を間違える（実受益者は下流 repo）・再利用できない。検証は adr-tools に置く。
- **保存型ストア / 永続 paste（ADR-20260626-01 で既に却下）**: SHA-keyed cache は ephemeral（Cache API の TTL 付き）に留め、永続レコードは taka（外部 D1）に閉じる。

## 実装状況

repo-backed permalink 決定は 4 スライスに分割して実装済み: (a) resolver Function `functions/r/[[path]].ts` + `packages/app/src/render/repo-permalink.ts`（PR #1945）、(c) deep-anchor seed + SHA-keyed cache（PR #1965）、(d) `@<sha>` 推奨検証（upstream adr-tools 0.0.9 + karasu adopt PR #1981）。private repo（#1960）と bare route（#1961）は後続。
