# AT-1858: Group by team — dependency-ordered bands + boundary frames (system view)

- **日付**: 2026-07-11
- **Issue**: #1858（親 #1822 / Epic #1817 comprehension）
- **PR**: (slice A — core layout)
- **設計**: [docs/design/system-view-grouping.md](../design/system-view-grouping.md)
- **Related TPLs**: [TPL-20260624-02](../test-perspectives/TPL-20260624-02-relayout-into-group-preserves-placement-and-edges.md)（要素を別グループへ再配置 → 全要素ちょうど一度配置 + 参照エッジ端点保持）, [TPL-20260623-04](../test-perspectives/TPL-20260623-04-tier-split-no-edge-penetration.md)（段跨ぎ edge がカードを貫通しない）
- **対象**: `packages/core/src/renderer/group-layout.ts`（新規） / `layout.ts` / `svg-renderer.ts` / `layout-types.ts`

## 概要

system view の `groupBy: "team"` オプション（P2a・slice A / core のみ）。`organization` / `owns` で宣言された所有チームごとにノードを束ね、チームを依存順（min feedback-arc-set）に縦積みし、各チームを破線の境界フレームで囲む。`.krs` は変更しない描画オプション。**opt-in** で、指定しなければ既存の kind-tier レイアウトのまま（byte 単位で不変）。app の Group-by セレクタ・折り畳み操作は後続スライス（B: collapse / C: app UI）。

## 受け入れ条件

### AC-1: グループ順序付けとレイヤ割当（core, pure）

> ✅ Automated by `packages/core/src/renderer/group-layout.test.ts` (suite-wide)

- [x] `orderGroups` はグループを依存が下向きに流れる順に並べる。無循環グラフは宣言順を保つ
- [x] 集約でグループグラフが循環しても（SCC）全順序を返す — backward-edge weight 最小、同点は宣言順で決定的
- [x] グループ数 > 8 では greedy（Eades–Lin–Smyth）に切替、決定的（同入力 → 同出力）
- [x] `assignGroupedLayers` は各ノードをちょうど一度配置し、各グループに**連続・非重複**のレイヤ帯を与える（フレームが構造的に重ならない）
- [x] グループ内はメンバーを intra-group longest path で層化する
- [x] 未所有ノードは全グループの下の trailing band に `ungroupedRank` 順（infra → external）で置く
- [x] グループが1つも無ければ `null`（呼び出し側は既存レイアウトへフォールバック）

### AC-2: 描画統合（core, compile e2e）

> ✅ Automated by `packages/core/src/renderer/group-by-render.test.ts` (suite-wide)

- [x] `groupBy: "team"` で所有チームごとに境界フレーム（`data-container-id="__group_<team>__"` / `data-group="true"`、破線）が1つずつ出る
- [x] grouped でも全ノードがちょうど一度描かれる（TPL-20260624-02 の全域性）
- [x] 未所有の infra / external はフレームに入らず trailing band に残る
- [x] `groupBy` 未指定は option 無しと **byte 一致**（opt-in・後方互換・回帰なし）
- [x] `owns` の無いモデルでは grouped 指定でも既定レイアウトに一致（フォールバック）

### AC-3: 既定パスの温存（回帰）

> ✅ Automated — 既存 core スイート全体（2067 tests）が `groupBy` 追加後も無変更で通過。既存の layout / svg スナップショットが不変であることが `groupBy` 未指定パスの byte 不変を担保する（ADR-20260623-06 の tier 体系は既定ビューで不変）

- [x] `assignForcedSystemLayers` / `systemTier` の既定ビュー挙動は無改変
- [x] Group-by は `groupBy` 指定時のみ分岐する view-mode 局所の override

### AC-4: 手動（描画の目視確認）

`organization` / `owns` を持つ密なモデル（例: 20 service / 5 team）を `compile({ groupBy: "team" })` でレンダリングし SVG/PNG を目視:

- [ ] チームが依存順（上流 → 下流）に縦積みされ、各チームが破線フレーム＋ラベルで囲まれる
- [ ] フレーム同士が重ならない（縦に分離している）
- [ ] cross-team edge が失われず両端点に接続している（TPL-20260624-02）
- [ ] 未所有の infra / external が最下段の帯に並ぶ
- [ ] `groupBy` 無しの出力が従来と同一（フレームが出ない）

> 注: 展開時のグループビューは縦に長くなる（設計 P1 の既知の性質 — 可読性の主利得は折り畳みで、slice B の collapse で解消する）。段跨ぎ edge の貫通削減の磨き込みは slice C（#1859）の直交ルーティングで扱う。
