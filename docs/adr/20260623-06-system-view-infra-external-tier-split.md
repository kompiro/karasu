---
id: ADR-20260623-06
title: system-view の dep ティアを infra 行と external 行に分割する
status: accepted
date: 2026-06-23
topic: renderer
refines: [ADR-20260429-02]
related_to: [ADR-20260429-01, ADR-20260428-10]
assumptions:
  - "symbol: packages/core/src/renderer/layout.ts :: systemTier"
  - "symbol: packages/core/src/renderer/layout.ts :: assignForcedSystemLayers"
  - "symbol: packages/core/src/renderer/layout.ts :: SYSTEM_TIER_COUNT"
---

# ADR-20260623-06: system-view の dep ティアを infra 行と external 行に分割する

- **日付**: 2026-06-23
- **ステータス**: 決定済み
- **関連**:
  - Issue [#1724](https://github.com/kompiro/karasu/issues/1724)（system view が横に広がりすぎる）
  - 実装 PR [#1736](https://github.com/kompiro/karasu/pull/1736)
  - refines: [ADR-20260429-02](./20260429-02-infra-row-by-deepest-consumer.md)（infra/external の dep pull-up — 本 ADR で infra のみに scope を絞る）
  - 関連: [ADR-20260429-01](./20260429-01-orthogonal-edge-routing-skip-layer.md)（skip-layer 直交ルーティング）, [ADR-20260428-10](./20260428-10-auto-layout-actor-row-by-target.md)（actor pull-down）
  - TPL: [TPL-20260623-04](../test-perspectives/TPL-20260623-04-tier-split-no-edge-penetration.md)（proactive — ティア分割で段跨ぎエッジが中間カードを貫通しないこと）, [TPL-20260519-02](../test-perspectives/TPL-20260519-02-shared-vocabulary-dual-representation.md)（`database` 語彙と `[external]` タグの二重表現）
  - AT: [AT-1724](../acceptance/1724-system-view-infra-external-tier-split.md)
  - コード: `packages/core/src/renderer/layout.ts`（`systemTier` / `assignForcedSystemLayers`）

## 背景

system-view の forced layout は `systemTier()` でノードを kind ベースの 4 ティアに割り当てていた（[ADR-20260429-02](./20260429-02-infra-row-by-deepest-consumer.md) 背景節）:

- 0: `user` / 1: `client` / 2: `service`（内部）/ 3: **dep**（`database`/`queue`/`storage` + `[external]`）

dep ティアは infra と外部サービスを **同一の最下段** に詰め込む。ノード数の多いモデルでこれが横幅を爆発させる。`hato` の system view は dep 段に外部サービス 6 個 + infra 4 個 = 10 個が一列に並び、出力 viewBox が **3136 × 892（アスペクト比 3.52:1）** と、画面・ドキュメントで読めないほど横長になっていた。横幅の主因は dep 段の一列詰め込みであり、internal 段（domain 群）の折返しではないことを PoC で計測確認した。

## 決定

`systemTier()` を **5 ティア**（`user → client → service → infra → external`）に分割し、infra をその上側の dep 段、external を最下段の固定バンドとして縦に積む。

- **境界ルール**: infra kind（`database`/`queue`/`storage`）は `[external]` タグの有無に関わらず常に infra 行に置く（`systemTier` で infra kind を `external` タグより**先に**判定）。external 行は別 system で動くノード（`service [external]` 等）専用。
- **infra（tier 3）の #974 pull-up は不変**: [ADR-20260429-02](./20260429-02-infra-row-by-deepest-consumer.md) の「incoming edge を持つ dep を最深 consumer の直下へ strictly upward で引き上げる」挙動を infra にそのまま維持する。
- **external（tier 4）は pull-up させない**: `externalBase = max(external 以外の全ノードの最終 layer) + 1` の固定バンドに置く。infra pull-up が確定した後に計算する。
- actor pull-down（[ADR-20260428-10](./20260428-10-auto-layout-actor-row-by-target.md)）は infra pull-up と external バンド配置の**後**に走らせ、唯一の宛先が external のユーザが暫定行ではなく最終行を基準に引き下げられるようにする。

`hato` の system view は **1793 × 1096（1.64:1）** になり、幅 −43%。

## 理由

- **幅削減を PoC で実証**: 最広行のノード数が半減（hato: 10 → 6）。後述の代替案で唯一実効性が確認できた案。
- **意味的に明快**: 所有データストア（infra, 境界内）と第三者 SaaS（external, 別境界）が視覚的に分離される。read/write エッジも短くなる。
- **境界ルールの一貫性**: infra は定義上 system 境界の *内側* にあるデータストア。`[external]` の意味は「別の system で動く」。よって `database [external]` は「境界内のストアなのに別境界」という矛盾したモデリングであり、external 行へ昇格させるのは category error。外部 SaaS の DB であっても、自分の `system` 内で `database` として読み書き対象にモデリングした時点で境界内 infra として扱う（タグはスタイルを変えるがティアは変えない）。[TPL-20260519-02](../test-perspectives/TPL-20260519-02-shared-vocabulary-dual-representation.md) の二重表現観点に対応。
- **既存挙動の温存**: infra pull-up（#974）と column-hint（#969）の不変条件は無変更で通る。回帰テストで担保。
- **貫通リスクは routing で救済**: external を下段に分けると `service → external` が infra 行を skip するが、[ADR-20260429-01](./20260429-01-orthogonal-edge-routing-skip-layer.md) の直交ルーティングが救済する。この再燃リスクを検出する proactive TPL（[TPL-20260623-04](../test-perspectives/TPL-20260623-04-tier-split-no-edge-penetration.md)）を同 PR で起こした。

## ADR-20260429-02 との関係（refines）

本 ADR は [ADR-20260429-02](./20260429-02-infra-row-by-deepest-consumer.md) を **refine** する:

- **温存**: infra ノードを最深 consumer の直下へ strictly upward で引き上げる pull-up。
- **変更**: dep ティアを infra（tier 3）と external（tier 4）に分割。pull-up の対象を **infra のみ**に絞り、external は pull-up せず最下段固定バンドにする。ティア数は 4 → 5。

ADR-20260429-02 は引き続き有効（infra の pull-up はそのまま）。external の扱いと tier 数のみ本 ADR が上書きする。

## 却下した案

### 案B: dep 段に折返し（`MAX_LAYER_WIDTH`）を効かせる

dep 段が 1200px 超で sub-row に折返すようにする案。**PoC で無効と判明** — dep は pull-up で既に複数行に散っており各行は単独で 1200px 未満。折返しは発火せず、infra/external の意味的分離も得られない。

### 案C: アスペクト比ターゲットで広い層を自動再配置

target ratio（例 ≤16:9）超の層を複数 sub-row に再分配する汎用 post-pass。閾値の根拠付けが難しく（ADR-20260429-02 案 D2「N の根拠がない」と同型）、今回の症状には過剰。将来 [#1724](https://github.com/kompiro/karasu/issues/1724) の継続として再検討可。

### 当初 PoC の floor クランプ案

infra/external 両段を pull-up 対象にし、各段の `tierBase` を引き上げの下限にクランプする案。infra への floor が #974 pull-up を抑止してしまい（infra を内部行へ引き上げられない）、`pulls a dep up…` テストが壊れた。infra は触らず external だけ固定バンドにする方が変更が小さく、#974 系テストが無変更で通るため不採用。

## 影響

- 既存ユーザー: system view のレイアウトが変わる（infra/external が縦に分離）。`.krs` の書き換えは不要。
- scope 外: エッジ交差の低減は別系統の改修が必要で [#1728](https://github.com/kompiro/karasu/issues/1728) に分離。infra コンテナ（テーブル列挙）の圧縮は #1724 案 E として保留。
- 将来検討: `database`/`queue`/`storage` への `[external]` 付与を diagnostic で warn すべきか（境界の概念矛盾を作者に知らせる）は別 Issue とする。
