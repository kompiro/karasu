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

- [x] `assignForcedSystemLayers` / `systemTier` の既定ビュー挙動は無改変（ADR-20260623-06 の tier 体系は既定ビューで不変）
> ✅ Automated by `packages/core/src/renderer/group-by-render.test.ts` — `groupBy` 未指定が option 無しと byte 一致
- [x] Group-by は `groupBy` 指定時のみ分岐する view-mode 局所の override
> ✅ Automated — 既存 core スイート全体（2067 tests）が `groupBy` 追加後も無変更で通過し、既存 layout / svg スナップショットが不変

### AC-4: 手動（描画の目視確認）

`organization` / `owns` を持つ密なモデル（例: 20 service / 5 team）を `compile({ groupBy: "team" })` でレンダリングし SVG/PNG を目視:

- [ ] チームが依存順（上流 → 下流）に縦積みされ、各チームが破線フレーム＋ラベルで囲まれる
- [ ] フレーム同士が重ならない（縦に分離している）
- [ ] cross-team edge が失われず両端点に接続している（TPL-20260624-02）
- [ ] 未所有の infra / external が最下段の帯に並ぶ
- [ ] `groupBy` 無しの出力が従来と同一（フレームが出ない）

> 注: 展開時のグループビューは縦に長くなる（設計 P1 の既知の性質 — 可読性の主利得は折り畳みで、slice B の collapse で解消する）。段跨ぎ edge の貫通削減の磨き込みは P2c（#1859）の直交ルーティングで扱う。

### AC-5: app の Group-by セレクタ（slice C）

system view の toolbar に「Group by: None / Team」セレクタを出し、`groupBy` を core に渡して再コンパイルする。`.krs` は変更しない view 操作（#1821 collapse と同じ view-state 配線）。

- [x] system view で「Team」を選ぶと `groupBy: "team"` で再コンパイルされ、SVG に team 境界フレーム（`data-group="true"` / `__group_<team>__`）が出る
> ✅ Automated by `packages/app/src/hooks/useSystemView.test.tsx` — `setGroupBy("team")` → 再コンパイルでフレーム出現
- [x] セレクタは system view のみに表示され、deploy / org / matrix には出ない。変更で `onGroupByChange` が発火する
> ✅ Automated by `packages/app/src/components/PreviewColumn.test.tsx` — view ゲート（deploy/org/matrix）+ `onGroupByChange("team")`
- [x] grouping が無意味な状態（org 宣言なし / compare モード）ではセレクタを出さない（no-op 回避、`groupByAvailable`）
> ✅ Automated by `packages/app/src/components/PreviewColumn.test.tsx` — `groupByAvailable: false` で非表示
- [x] ラベルは i18n 経由（`preview.groupBy.*`、en/ja 両方）
> ✅ Automated — `packages/i18n` の型で全ロケール網羅を強制（key 欠落は typecheck 失敗）
- [ ] **手動**: app で `examples/en/feature-samples/team-ownership.krs` を開き system view で「Group by」を Team に切り替える → 3 チームがフレームで囲まれる。None に戻すと従来表示に戻る

### AC-6: per-group 折り畳み（slice B）

Group-by: Team のとき、各 team 境界フレームに ⊖/⊕ トグルを出し、畳んだ team を `<Team> (N)` stub に折り畳む。cross-group エッジは stub に再ターゲット、全 team を畳むと group DAG ビューになる。`.krs` は不変。

- [x] `collapsedGroups` を渡すと team が `<Team> (N)` stub に畳まれ、cross-group エッジが stub に再ターゲットされる。全 team 畳みで stub のみになる
> ✅ Automated by `packages/core/src/renderer/group-collapse.test.ts` / `group-by-render.test.ts`
- [x] 無関係な team を畳んでも、展開中ノード間の authored parallel edge / self-loop は消えない（retarget されたエッジのみ dedup）
> ✅ Automated by `packages/core/src/renderer/group-collapse.test.ts`
- [x] `interactive` 時のみ team フレームに ⊖/⊕（`data-collapse-group`）が描かれ、static 出力には出ない
> ✅ Automated — `renderGroupControls` は `options.interactive` ゲート（`group-by-render.test.ts` の interactive 有無で確認）
- [x] `[data-collapse-group]` クリックで `onGroupToggle(<team>)` が発火し、再コンパイルで畳まれる
> ✅ Automated by `packages/app/src/components/PreviewPane.test.tsx`（delegation）/ `useSystemView.test.tsx`（`toggleGroup` → stub 化）
- [ ] **手動**: app で team-ownership.krs を Group by: Team にし、フレームの ⊖ をクリック → その team が `Team (N)` に畳まれ図が詰まる。⊕ で戻る（「すべて畳む」ボタンは follow-up）
