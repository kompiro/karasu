# AT-2172: builtin 語彙の拡張 — `[cache]` / `[analytics]` / `@planned`

- **日付**: 2026-08-09
- **関連 Issue**: [#2172](https://github.com/kompiro/karasu/issues/2172)（builtin vocabulary review）、[#2159](https://github.com/kompiro/karasu/issues/2159)（`tag-not-builtin` / `annotation-not-builtin`）、[#2225](https://github.com/kompiro/karasu/issues/2225)（`tag-not-applicable`）
- **関連 ADR**: [ADR-1718](../adr/1718-vector-store-vs-database.md)（役割はタグ・技術は物理層）、[ADR-1935](../adr/1935-wrangler-translate-adapter.md)（KV の degrade — 本 PR で閉じる）、[ADR-1314](../adr/1314-krs-spec-v1-freeze.md)（追加は後方互換）、[ADR-1508](../adr/1508-annotation-badge-label-i18n.md)（badge label の i18n）
- **Related TPLs**: [TPL-2172](../test-perspectives/TPL-2172-builtin-vocabulary-addition-gate.md)（3 問 gate と却下の記録）、[TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)（受理する語彙は効果を持つ）、[TPL-1296](../test-perspectives/TPL-1296-spec-doc-reference-data-sync.md) / [TPL-1415](../test-perspectives/TPL-1415-shared-vocabulary-dual-representation.md)（`reference-data.ts` と spec 表の同期）
- **対象**: `packages/core/src/builtins/reference-data.ts` / `default-style.ts`、`packages/core/src/resolver/warnings.ts`、`packages/core/src/translate/wrangler.ts`、`packages/i18n`、`packages/app/src/i18n`

## 概要

`tag-not-builtin` / `annotation-not-builtin`（#2159）が案内する「builtin 追加要望」経路の最初の行使。
ストアの役割軸を `[index]` / `[cache]` / `[analytics]` の 3 タグ（タグ無し = 正本）で閉じ、
lifecycle に「まだ実在しない」を表す `@planned` を足す。同時に `[kv]` / `[bff]` / `@canary` /
`@sunset` / `[graph]` / `[timeseries]` / `[replica]` を理由付きで却下し、**却下が挙動として現れる**
ことをテストで固定する。

## 受け入れ条件

### AC-1: 新語彙が警告なく受理される

- [x] `database X [cache]` / `database X [analytics]` と `storage X [cache]` / `storage X [analytics]` が警告ゼロでパースされる

> ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › `accepts [cache] / [analytics] on both database and storage`

- [x] `@planned` が親ノードにも子ノードにも警告なく付けられる

> ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › `accepts @planned anywhere a lifecycle annotation goes`

### AC-2: 受理した語彙が既定描画の効果を持つ

- [x] light / dark 両シートで `database` / `storage` 双方の `[cache]` / `[analytics]` に badge があり、`[index]` を含む 3 役割の badge-color が互いに異なる

> ✅ Automated — `packages/core/src/builtins/default-style.test.ts` › `dark theme gives each role a distinct badge` / `light theme gives each role a distinct badge`

- [x] 追加した badge 規則が light / dark とも canvas 背景に対して WCAG AA（≥ 4.5:1）を満たす

> ✅ Automated — `packages/core/src/builtins/default-style-contrast.test.ts` › `badge-color of %s is AA-legible on the canvas`

- [x] badge 規則の総数が期待どおり（両シートから規則が落ちても気づける）

> ✅ Automated — `packages/core/src/builtins/default-style-contrast.test.ts` › `finds the deploy kind and annotation badge rules`

### AC-3: `appliesTo` の内側が inert にならない（TPL-2172 の失敗モード）

- [x] 効果なしと宣言したタグ（`[human]` / `[ai]` / `[sync]` / client form-factor 7 種）以外は、`appliesTo` に挙げた**すべての kind** に既定スタイルのセレクタがある — light / dark 両方で

> ✅ Automated — `packages/core/src/builtins/default-style.test.ts` › `getBuiltinStyleSheet — every appliesTo kind carries the tag's effect (#2172) > dark theme` / `light theme`

### AC-4: 却下した候補が挙動として却下されている

- [x] `[kv]` は `tag-not-builtin`、`@canary` は `annotation-not-builtin` の warning が出続ける

> ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › `keeps warning on the rejected candidates [kv] and @canary`

- [x] `service Api [cache]` / `queue Events [analytics]` は `tag-not-applicable`（役割軸はストアの話）

> ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › `warns on a role tag outside the store kinds — the role axis is about stores`

### AC-5: 共有ストア診断が役割タグを対象外にする

- [x] `[cache]` / `[analytics]` のストアを複数サービスが読んでも `shared-infra-fan-in` が出ない

> ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › `excludes [cache] stores on the same grounds (#2172)` / `excludes [analytics] stores on the same grounds (#2172)`

- [x] タグ無しの共有ストアでは引き続き `shared-infra-fan-in` が出る（除外の根拠は役割タグであって共有ではない）

> ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › `still fires on an untagged store — the exclusion is the role tag, not the sharing`

### AC-6: wrangler adapter が KV に `[cache]` を出す

- [x] `karasu translate --from wrangler` が KV binding を `database <id> [cache]` として出力し、具体技術は `deploy` の `store { type "Cloudflare KV" }` にのみ現れる

> ✅ Automated — `packages/core/src/translate/wrangler.test.ts` › `maps KV to database [cache]`

### AC-7: spec 表と `reference-data.ts` の一致・i18n

- [x] `docs/spec/tags-annotations.md`（+ ja）の生成表が `reference-data.ts` の tag / annotation 集合と一致する

> ✅ Automated — `packages/core/src/builtins/reference-spec-sync.test.ts` › `tags-annotations.md: every documented author tag is in getReference().tags` / `tags-annotations.md: every documented annotation is in getReference().annotations`

- [x] `badge.planned` が en / ja 双方の catalog にあり、既定 compile が en ラベルを描画する

> ✅ Automated — `packages/app/src/i18n/locale-coverage.test.tsx` › `default compile renders the en label for @planned (= translate("en", "badge.planned"))`

## 手動確認

判定に実機が要るのはバッジの見え方だけである。下のモデルを `index.krs` として
`https://karasu.kompiro.dev/` で開き、light / dark を切り替えて確認する。
このモデルは診断ゼロ件なので、バッジ以外に目を引くものは出ない。

- [ ] `[cache]` / `[analytics]` badge が `[index]` と一目で区別できる（light / dark 両方）
- [ ] `@planned` の `◇` badge が既存 5 種（⚠ / ✦ / ⚗ / → / ✎）と字形・色の双方で区別できる
- [ ] 色に頼らず label 文字列だけでも読み分けられる
- [ ] Reference パネルの Tags / Annotations タブに 3 語彙が説明付きで並ぶ（en / ja）

```krs
system Payments {
  service Ledger {
    label "Ledger"
    domain Posting {
      usecase Post {
        resource Orders.rows { operations create }
      }
    }
  }

  service Reconciliation @planned {
    label "Reconciliation"
    domain Settlement {
      usecase Reconcile {
        resource Warehouse.facts { operations read }
      }
    }
  }

  database Orders { table rows }
  database Sessions [cache]
  database Warehouse [analytics] { table facts }
  database Search [index]
  storage Thumbnails [cache]
  storage Lake [analytics]

  Ledger --> Sessions
  Ledger --> Search
  Ledger --> Thumbnails
  Reconciliation --> Lake
}

deploy "production" {
  function "ledger" { runtime "nodejs"; realizes Ledger }
  function "reconciliation" { runtime "nodejs"; realizes Reconciliation }
  store "orders" { type "PostgreSQL 16"; realizes Orders }
  store "sessions" { type "Redis 7"; realizes Sessions }
  store "warehouse" { type "BigQuery"; realizes Warehouse }
  store "search" { type "OpenSearch 2"; realizes Search }
  store "thumbnails" { type "S3"; realizes Thumbnails }
  store "lake" { type "S3"; realizes Lake }
}
```
