# AT-1943: `karasu translate --from wrangler` — Cloudflare Workers physical layer

- **日付**: 2026-07-14
- **Issue**: #1943（設計方向 #1935 / design doc #1941）
- **PR**: feat/translate-from-wrangler
- **設計**: [ADR-20260714-03](../adr/20260714-03-wrangler-translate-adapter.md)（元 Design Doc `wrangler-translate-adapter.md` を昇格・集約）
- **Related TPLs**: [TPL-20260510-02](../test-perspectives/TPL-20260510-02-round-trip-guarantee.md)（生成 `.krs` が round-trip する）, [TPL-20260510-16](../test-perspectives/TPL-20260510-16-convenience-vs-principled-api.md)（round-trip は parser 経由の principled API で検証）, [TPL-20260510-20](../test-perspectives/TPL-20260510-20-id-not-label-for-identity.md)（id 同一性 — binding 名から id を導出）
- **対象**: `packages/core/src/translate/wrangler.ts` / `wrangler.test.ts`、`packages/core/src/translate/translate.ts`（format 登録・self-wrap）、`packages/cli/src/index.ts`（`--from wrangler`）、`packages/cli/src/translate/translate.e2e.test.ts`、`packages/app/src/components/TranslateDialog.tsx`、`packages/i18n`（format label）

## 概要

Cloudflare Workers アプリの物理層を `wrangler.toml` から決定的に抽出する translate adapter。compose / k8s が「deploy のみ」を出力するのと異なり、`wrangler.toml` は論理ストアと物理実体の唯一のソースなので、engine-neutral な論理 `system`（Worker `service` + binding 由来の infra + edge）と物理 `deploy`（具体 Cloudflare 技術は `store { type ... }` に、論理ラベルには出さない）を自己完結で出力する。新規 `.krs` 構文はゼロ（v1 freeze / ADR-20260616-06）。

## 受け入れ条件

### AC-1: engine-neutral な論理 infra + 物理 store（技術はラベルに漏らさない）

> ✅ Automated by `packages/core/src/translate/wrangler.test.ts` (suite-wide)

- [x] D1 → `database` / R2 → `storage` / Queues（producers）→ `queue` に落ちる
- [x] 具体 Cloudflare 技術は `deploy` の `store { type "Cloudflare ..." }` に置かれ、論理 `label` には `"Cloudflare ..."` が出ない
- [x] Worker は `function "<name>" { runtime "cloudflare-workers"; realizes <Worker> }` として実体化される
- [x] `system <Name>` は `wrangler.toml` の `name`（PascalCase）から導出される

### AC-2: 既存語彙へのマッピング（新構文なし）

> ✅ Automated by `packages/core/src/translate/wrangler.test.ts` (suite-wide)

- [x] Vectorize → `database [index]`（既存 `[index]` role を再利用）
- [x] KV → 素の `database`（`[cache]` は付けない — notation-watch #1816）
- [x] Workers AI → `service [external]` + `->` edge
- [x] Durable Object → `service [external]` + `->` edge（不透明な stateful actor）
- [x] service binding → `->` の Worker→Worker communication edge
- [x] 所有 infra への edge は `-->`、外部 service への edge は `->`

### AC-3: 未知 binding の安全な degrade（推測しない）

> ✅ Automated by `packages/cli/src/translate/translate.e2e.test.ts` (suite-wide)

- [x] 未対応の binding 種別（例: `hyperdrive`）はノードを出さず、`Warning: Unsupported wrangler binding "..."` を stderr に出す（silent drop しない）
- [x] 同じファイル内の対応済み binding はそのまま出力される

### AC-4: CLI / system 名 / round-trip

> ✅ Automated by `packages/core/src/translate/translate.test.ts` (suite-wide)

- [x] `--from wrangler` が受理される（不正値は `--from must be "compose", "k8s", "openapi", "db", or "wrangler"`）
- [x] `--system <Name>` は wrangler が自己 wrap した `system` 名を override し、warning を出さない
- [x] 出力が `Parser.parse` で error 診断ゼロで round-trip する（TPL-20260510-02）
- [x] 不正な TOML は `Failed to parse wrangler.toml` で失敗する

### AC-5: App の translate ダイアログ

> ✅ Manual — App の Translate ダイアログで "Cloudflare wrangler.toml" を選択

- [ ] format ドロップダウンに "Cloudflare wrangler.toml" が出る（en/ja）
- [ ] wrangler 選択時は system 名フィールドが表示され、mapFile / granularity / bindings は隠れる

## 手動確認

App（`pnpm --filter @karasu-tools/app dev`）で Translate ダイアログを開き、format に "Cloudflare wrangler.toml" を選択、AC-1 のサンプル `wrangler.toml` を貼り付けて translate。system + deploy が出力され、`store` に技術名が入り論理ラベルに漏れないことを目視する。
