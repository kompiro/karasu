---
id: ADR-20260624-06
title: system-view の external サービスをサイド列に配置してエッジ交差を減らす
status: accepted
date: 2026-06-24
topic: renderer
refines: [ADR-20260623-06]
related_to: [ADR-20260429-01, ADR-20260429-02, ADR-20260624-04]
assumptions:
  - "symbol: packages/core/src/renderer/layout.ts :: placeExternalServicesOnSides"
  - "symbol: packages/core/src/renderer/layout.ts :: systemTier"
  - "grep: packages/core/src/renderer/layout.ts :: sideExternals"
---

# ADR-20260624-06: system-view の external サービスをサイド列に配置してエッジ交差を減らす

- **日付**: 2026-06-24
- **ステータス**: 決定済み
- **関連**:
  - Issue [#1728](https://github.com/kompiro/karasu/issues/1728)（system view のエッジが追いにくい）
  - 実装 PR [#1761](https://github.com/kompiro/karasu/pull/1761)
  - refines: [ADR-20260623-06](./20260623-06-system-view-infra-external-tier-split.md)（external の配置を最下段バンドからサイド列へ）
  - 関連: [ADR-20260429-01](./20260429-01-orthogonal-edge-routing-skip-layer.md), [ADR-20260429-02](./20260429-02-infra-row-by-deepest-consumer.md), [ADR-20260624-04](./20260624-04-edge-from-to-selectors.md)（color-by-source selector、本件の補助）
  - TPL: [TPL-20260624-04](../test-perspectives/TPL-20260624-04-external-side-placement-invariant.md)（サイド配置の不変条件）, [TPL-20260623-04](../test-perspectives/TPL-20260623-04-tier-split-no-edge-penetration.md)
  - AT: [AT-1728](../acceptance/1728-external-on-sides.md)
  - コード: `packages/core/src/renderer/layout.ts`（`placeExternalServicesOnSides`）

## 背景

[ADR-20260623-06] が dep ティアを infra 行と external 行に分割して横幅を半減したが、エッジの**交差**は減らなかった。`hato` の system view は 17 エッジ / 33 交差で、線が放射状に重なって追えない。実座標で交差を分解すると **28/33 が cross-hub 交差**（HatoApi × HatoMcp × WebApp など別ハブのファンアウト同士）だった。

PoC で複数の手法を実測し、自動的に交差を「消す」ルーティング（直交トランク・同一トポロジの barycenter 再配置）はいずれも効かない（cross-hub が支配的で一部は縦積みトポロジに内在）ことを確認した。

## 決定

system-view で `[external]` サービスを**最下段バンドではなく左右のサイド列**に配置し、`service → external` エッジを水平化して infra への下向きファンアウトと分離する（[ADR-20260623-06] の「external は最下段 tier」を refine）。`placeExternalServicesOnSides` を `computeLayoutEdges` の前に走らせ、以下を行う:

- **consuming-hub barycenter でサイド振り分け**: 各 external を「それを consume するハブの x 重心」で median 分割して左右に振り分ける。別ハブの束が左右に分かれ cross-hub 交差が激減する。同側内は hub-x → consuming-hub-y → 宣言順で安定ソート（決定的）。
- **`column: left/right` で override**: 既存の `column` ヒントを再利用。作者が左右を固定できる（新規プロパティなし）。`column: center`／未指定は自動振り分けに委ねる。
- **≥2 ハブ gate**: external エッジを持つハブが 2 以上のときだけサイド化する（cross-hub 交差が生じる条件）。単一ハブ図は従来の最下段バンドを維持（横に広げない）。明示 `column` は gate を迂回。
- **内側アンカー**: サイド external へのエッジは external の内側の辺（左サイド→右辺、右サイド→左辺）に着地させ矢印を内向きにする。tier index ベースの上下アンカーを上書きする。
- **overflow はサイド縦積み**（上限・最下段フォールバックなし）。
- multi-system root view でも `layoutMultipleSystems` が system ごとに適用する。

`hato` 実モデル（`examples/en/hato`、`CloudflareAccess` を `column: right` で override）で **33 → 0 交差**。

## 理由

- **directional 分離が cross-hub 交差を構造的に回避**: infra は上下・external は左右に束が分かれる。実レンダリングで実証（半々割り当て 14 → consuming-hub 8 → 内側アンカーで 0）。
- **consuming-hub 基準は意味的に最適に肉薄**: brute-force 最適（中心モデル 7）に対しヒューリスティックで 8、機械的半々（14）から半減。最適なグループ化（ハブ単位）を作者の知識（`column`）で上書きできる。
- **既存挙動を壊さない**: infra の tier 配置（#1724）と infra pull-up（#974）は無変更。境界ルール（`database [external]` は infra 行）も維持。
- **gate で単純図の退行を防ぐ**: 単一ハブ図はサイド化しても交差が減らず横長になるだけ（ガイド図で確認）→ 従来配置を維持。
- **補助の color-by-source**（[ADR-20260624-04] の `edge[from=X]`/`edge[to=X]`）は配置で消せない残り交差の見分けに使える。

## 却下した案

- **直交トランク/バス・ルーティング**（[ADR-20260429-01] 拡張）: PoC で 33〜53 交差。cross-hub を対象にせず、ハブが infra 直上のため external は infra 帯を必ず縦断、素朴トランクは悪化。
- **同一トポロジの barycenter 再配置**: 33 交差のまま。cross-hub は 2 ハブが散ったターゲットを共有する構造に内在し縦積みのままでは消えない。
- **service を斜めに staggered**: 単独で効果なし、サイド化に重ねても改善せず。
- **作者側 styling のみ**（旧ドラフト）: 配置で減らせるものを手作業に押し付ける。不十分。
- **`placement: bottom`（個別 external を最下段へ戻すヒント）**: v1 では入れない。実需要が出たら後追い。

## 影響・既知の制限

- 既存 `.krs` は変更不要だが system-view の見た目が変わる（external がサイドへ）。examples / guide 図を再生成済み。サイド化で図は横長になる（交差最小を優先した帰結として許容）。
- **multi-system のクロスシステムエッジ**: `viewSlice.crossSystemEdges` は per-system ループ後に独自の右→左アンカーで描画され side 情報を受け取らない。クロスシステムエッジが side 配置された external を指す稀なケースでは内側アンカーにならないが、システム間リンクは横方向の system-flow 規約で描くのが自然なので許容する（必要なら per-system の side map を集約して渡す）。
