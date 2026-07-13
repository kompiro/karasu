# コンテナのその場展開（in-place expansion）— 兄弟を畳んだまま内部と越境エッジを見る

- **日付**: 2026-07-13
- **ステータス**: 検討中
- **関連**:
  - 引き金 / tracking Issue: [#1815](https://github.com/kompiro/karasu/issues/1815)（親 epic [#1817](https://github.com/kompiro/karasu/issues/1817) comprehension / explorable viewer pillar、milestone [#1814](https://github.com/kompiro/karasu/issues/1814)）
  - 実装 Issue（フェーズ分割）: [#1921](https://github.com/kompiro/karasu/issues/1921)（Phase 1 = 案3 単一 in-frame）/ [#1923](https://github.com/kompiro/karasu/issues/1923)（Phase 2 = 案1 一般 mixed-LOD、#1921 に依存）
  - 先行 drill-down: [#21](https://github.com/kompiro/karasu/issues/21)（replace-context ナビゲーション）
  - 横方向密度制御の先行実装: [#1186](https://github.com/kompiro/karasu/issues/1186)（edge focus/dim）, [#1821](https://github.com/kompiro/karasu/issues/1821)（layer toggle）, [#1858](https://github.com/kompiro/karasu/issues/1858)（group-by team）
  - 関連 ADR:
    - [ADR-20260711-03](../adr/20260711-03-system-view-group-by-team.md)（team 軸グループ化 + 折り畳み可能な境界フレーム — **本設計が再利用する機構**）
    - [ADR-20260712-01](../adr/20260712-01-category-collapse-retarget-edges.md)（collapse 時に越境エッジを stub へ re-target）
    - [ADR-20260630-02](../adr/20260630-02-layer-toggles.md)（on-SVG affordance + interactive-only 描画）
    - [ADR-20260403-01](../adr/20260403-01-drill-down-adapter-hierarchy-node.md)（drill-down 収集 `HierarchyNode`）
    - [ADR-20260404-05](../adr/20260404-05-browser-history-navigation.md)（URL hash による drill-down 同期）
  - 関連 TPL:
    - [TPL-20260510-21](../test-perspectives/TPL-20260510-21-scoped-glance-drill-down.md)（**scoped glance を first-class に保つ — 本設計の主たる制約**）
    - [TPL-20260624-02](../test-perspectives/TPL-20260624-02-relayout-into-group-preserves-placement-and-edges.md)（要素を再配置しても全要素ちょうど一度配置 + 端点保持）
  - コード: `packages/core/src/renderer/drill-down-svg.ts`, `category-collapse.ts`, `group-collapse.ts`, `layout.ts`, `svg-renderer.ts`；`packages/app`（`useSystemView`, `NodeDetailPanel`）

## 背景・課題

生成された（あるいは大きな）図を読むとき、しばしば **あるコンテナの内部を「兄弟や越境エッジとの関係のなかで」見たい**ことがある。例:「`OrderService` のドメイン構成はどうなっていて、*それが* `PaymentService` や共有ストアと *どう繋がっているか*」。

現在の drill-down（#21）はこれを表現できない。drill-down は **replace-context 型のナビゲーション**である。`drill-down-svg.ts` は root / service-scope / domain-scope といった **離散的な完全レベル**をそれぞれ別の `.krs-view` グループとして焼き込み、CSS `:target` + `:has()` で丸ごと入れ替える（`drill-down-svg.ts:31-33`）:

```css
.krs-view { display: none; }
svg:not(:has(.krs-view:target)) .krs-root-level { display: block; }
.krs-view:target { display: block; }
```

各レベルは独立した完全な `render()` パスで生成される（`buildDrillDownSvg` `drill-down-svg.ts:92`）。したがって読み手が見るのは **root レベル *か* 掘った先の 1 レベル**のどちらかであり、両方は決して同時に見えない。service に潜ると兄弟 service と越境エッジは視界から消える — これは comprehension が依存する関係文脈そのものである。

#1817 が整理したとおり、縦軸（浅い ↔ 深い）は drill-down が、横軸（同一 LOD での密度）は #1186 / #1821 / #1858 がカバー済み。**残る欠落は「一部だけ深く見つつ周囲の構造を保つ」= 単一フレーム内の混在 LOD（mixed level-of-detail）**である。

### 用語: LOD と mixed LOD

**LOD（level of detail / 詳細度）** = 図が今どの階層段を描いているか。karasu の階層 `system → service → domain → usecase → resource` は詳細度の段階でもある。root system-view は「service を中身のない箱として描く」＝粗い LOD、service に drill-down すると「その内部 domain を描く」＝細かい LOD。

現状の drill-down は **図全体が常に単一 LOD** — root ではすべての service が箱（粗い）で揃い、掘るとすべてが domain 段（細かい）に揃う。「部分ごとに詳細度を変える」ことはできない。

**mixed LOD（混在詳細度）** = 1 枚の図の中で部分ごとに異なる詳細度を同時に描くこと。例: `OrderService` だけ内部 domain まで展開（細かい LOD）し、兄弟 `PaymentService` / `Inventory` は畳んだ箱のまま（粗い LOD）。

さらに「どこで」混在させるかで 2 通りに分かれ、これが後述の案を分ける軸になる:

- **見かけの混在**（案2）— 俯瞰図自体は単一 LOD のまま変えず、展開ノードの内部は横の別パネルに逃がす。混在は画面レイアウト上でしか起きない。
- **true mixed-LOD（真の混在, 案1 / 案3）** — **1 つのレイアウトパス・1 つのフレームの中に**、展開した内部と畳んだ兄弟を同居させる。詳細度の異なるノードが同じ座標空間に配置され、越境エッジがサイズの違う箱をまたいで実際に繋がる。"true" は「別サーフェスへの逃がしではなく、同一フレーム内で本当に詳細度を混ぜる」ことを指す。Issue の中核要求（越境エッジを *関係のなかで* 見る）を満たすのはこちらだが、レイアウトエンジンが異なる詳細度のノードを同時配置し、サイズ不連続をまたいでエッジを再ルートする必要があり、実装は最も重い。

## 現状（インベントリ）

| 観点 | 現状 | 位置 |
| --- | --- | --- |
| drill-down のレベル合成 | 各レベルを独立 `render()` し `<g class="krs-view">` として並べ、CSS `:target` で swap。JS 不要 | `drill-down-svg.ts:46-92` |
| 折り畳み機構（node） | `collapseNodeList` がカテゴリの実ノードを 1 つの ⊕ stub に置換 | `category-collapse.ts` → `layout.ts` |
| 折り畳み機構（edge re-target） | `collapseCategories` / `collapseGroups` が越境エッジを stub へ re-target（drop しない、ADR-20260712-01） | `category-collapse.ts`, `group-collapse.ts` |
| **境界フレーム描画（＝内部を持つ箱）** | `renderContainer()`（タイトル付き箱・`group`/ghost frame は破線）/ `buildGroupFrames`（メンバー最終位置から team フレームを生成）。**ノードを「子を内包するフレーム」として描く機構は既にある**。ただし現状 focus コンテナの子を包む用途と、祖先を**空の ghost フレーム**で包む用途に限られる | `svg-renderer.ts`, `layout.ts` |
| コンテナの子フィットサイズ | focus コンテナは `CONTAINER_PADDING(40)` + `CONTAINER_LABEL_HEIGHT(30)` で子を囲む矩形に。祖先は `GHOST_MARGIN(30)` ずつ大きい入れ子 ghost。**実兄弟を内包する用途はまだ無い** | `layout.ts` |
| 二段トポロジカルレイアウト | group-by team が `assignGroupedLayers`（min feedback-arc-set で team 順、`longestPathLayers` で team 内サブ層）でバンド内に子を配置し、外側フローを保存 | `group-layout.ts`, `layout.ts` |
| collapse の逆＝展開の同型性 | `collapseGroups` は team メンバーを 1 stub に**畳む**。in-place expansion はこの**逆**（1 ノードを実サブレイアウトに**開く**）で、`remapEndpoint` / `buildGroupFrames` / `assignGroupedLayers` が候補再利用点 | `group-collapse.ts`, `group-layout.ts` |
| interactive-only 描画 | `RenderOptions.interactive` が true のときだけ ⊖/⊕ affordance を描く。static 出力には出さない | ADR-20260630-02 |
| **app 側の drill / collapse 状態** | drill は React state（`viewPath: string[]` in `app-reducer.ts`、`SET_VIEW_PATH`）。**live app は `:target` を使わない**（`:target` は export SVG 専用）。collapse / group は `useCollapsibleSet` in `useSystemView` が保持し、`data-collapse-*` の click delegation（`PreviewPane`）→ 再コンパイル。`.krs` は不変 | `app-reducer.ts`, `useSystemView.ts`, `useCollapsibleSet.ts`, `PreviewPane.tsx` |
| **既存の詳細パネル** | `NodeDetailPanel` / `EdgeDetailPanel` が選択ノード / 集約エッジの内訳を横のパネルに表示 | `packages/app/src/components/NodeDetailPanel.tsx` ほか |
| 集約 → 詳細パネルの原則 | 「俯瞰時は畳み、必要な詳細は drill-down と**詳細パネル**に委ねる」 | `docs/concepts.ja.md`「集約」節 |

**重要な観測**: group-by team（ADR-20260711-03）は既に「あるノードを、子を内包する境界フレームとして、畳んだ兄弟ノードの隣に描く」ことを実現している。これは in-place expansion が必要とする機構とほぼ同型である。欠けているのは「**任意の 1 ノードだけをその内部レイアウトに合わせて拡大し、周囲の兄弟は畳んだまま、越境エッジをサイズ不連続をまたいで再ルートする**」レイアウトパスである。

## 制約・前提

### C1. scoped glance を first-class に保つ（最重要）

`docs/concepts.ja.md`「ドリルダウン型アーキテクチャ把握」「目標と非目標」節が定める karasu の中核認知モデルは **scoped glance + drill-down** — 「一度に見せる情報量を常に絞り、必要な詳細はその場所へ drill-down して降りる」。これは [TPL-20260510-21](../test-perspectives/TPL-20260510-21-scoped-glance-drill-down.md) が proactive に守っている原則で、**「expand-all トグル」「深さ無制限の inline 展開」を明示的に失敗モードとして名指ししている**。

in-place expansion は本質的に「一度に見せる量を増やす」機能であり、この原則と緊張関係にある。したがって本設計は次を不変条件とする:

- **同時に展開できるコンテナ数に上限を設ける**（無制限の mixed-LOD は scoped glance の否定）。第一候補は **「一度に 1 ノードだけ展開」**。
- **常に scoped glance へ戻れる**（展開状態は view-state であって既定ではない。閉じれば元の俯瞰に戻る）。
- **`.krs` 文法は変更しない**（view-mode 局所。drill-down / group-by / layer-toggle と同じ方針）。

### C2. 再配置の不変条件

展開に伴うレイアウト変更は [TPL-20260624-02](../test-perspectives/TPL-20260624-02-relayout-into-group-preserves-placement-and-edges.md) を満たす: **全要素はちょうど一度だけ配置され、展開ノードを端点に持つ越境エッジは端点を保持したまま再ルートされる**（drop しない）。ADR-20260712-01 の re-target 戦略と整合させる。

### C3. interactive-only（ADR-20260630-02 踏襲）

展開 affordance と mixed-LOD レンダリングは `interactive` プレビューのみ。static 出力（SVG export / `/render` / CLI / guide 図）には出さない。

### スコープと段階

- drill-down（#21）の置き換えはしない。**両者は共存する**（縦ナビ vs 文脈保持）。
- 複数ノードの同時展開（＝一般 true mixed-LOD, 案1）は **Phase 2** で扱う。Phase 1 は同時展開数 ≤ 1 に限定する。
- 新しい `.krs` / `.krs.style` 語彙は追加しない（view-mode 局所）。
- 本 doc は system view に限定。deploy / org view への適用は system view 検証後に判断。

## 検討した選択肢

比較の土台として、まず **comprehension 受け入れバー**を定義する（この設計が「価値あり」と言える最低条件）:

> **B1**: 展開したコンテナの内部要素から、それが依存する **具体的な兄弟ノード**へエッジを目で辿れる。
> **B2**: 展開中も兄弟（畳んだまま）と全体フローが視界に残る。
> **B3**: 展開/折り畳みの往復で scoped glance に戻れ、1 画面のノード数が上限内に収まる（C1）。

### 案1: 真の in-frame mixed-LOD レイアウト

展開対象を、その内部レイアウトに合わせて拡大した境界フレーム（`renderContainer` 相当）として描き、兄弟は畳んだ stub のまま隣に置く。越境エッジはサイズ不連続をまたいで再ルートする。group-by team の二段レイアウト + 境界フレーム + edge re-target をレイアウトエンジン側で一般化する。

**メリット**

- 受け入れバー **B1 / B2 を完全に満たす**（内部要素と兄弟が同一フレームにあり、エッジが実際に両者を結ぶ）。Issue の中核要求そのもの。
- 既存機構（`renderContainer` / group-layout / collapse re-target）の資産を最大活用。

**デメリット**

- レイアウトが最も重い。「異なる詳細レベルのノードを同時配置し、サイズ不連続をまたいでエッジを再ルート」は非自明なレイアウト変更（Issue の ROI caveat が名指し）。
- drill-down が前提とする「1 レベル = 1 完全 render」モデルを崩す。混在 LOD 用の中間表現が要る。
- C1 を守るには「1 ノードだけ展開」の制約を課す必要がある（無制限にすると爆発）。

### 案2: ピン留め詳細パネル近似（lighter approximation）

展開対象の内部を、俯瞰図の隣に**ピン留めした詳細パネル**として別レンダリングする。俯瞰図自体は畳んだまま完全に scoped に保つ。越境エッジは「パネル内要素 ↔ 俯瞰図の兄弟」を **相互ハイライト**（パネルに「→ PaymentService」の参照リスト、俯瞰側で該当兄弟を強調）で表現する。app の既存 `NodeDetailPanel` パターンと drill-down slice レンダリングを再利用する。

**メリット**

- **最も安い**。既存の詳細パネル資産（`NodeDetailPanel` / `EdgeDetailPanel`）とレベル別 render を組み合わせるだけ。新規レイアウトパス不要。
- concepts の「俯瞰時は畳み、詳細は drill-down と**詳細パネル**に委ねる」原則の直系の拡張。C1 と最も相性が良い。

**デメリット**

- **受け入れバー B1 を満たしにくい**。エッジが「同一フレーム内で兄弟へ物理的に繋がる」体験にならず、パネルと俯瞰が視覚的に分断される。これは Issue が「drill-down の弱点」として挙げた点そのもの（文脈が別サーフェスに切れる）。相互ハイライトで緩和はできるが、in-frame の関係把握には劣る。
- パネルと俯瞰の視線移動が発生。大きな内部だとパネル自体が過密になりうる。

### 案3: 単一ノードの制約付き in-frame 展開（推奨候補）

案1 を **「一度に展開できるのは 1 ノードだけ」に制約**した focus+context 版。展開ノードだけを境界フレームで in-frame 展開し、他の兄弟は畳んだまま。越境エッジは展開ノードの内部要素へ re-target を逆適用して繋ぐ。同時展開数を 1 に固定することで C1（scoped glance）とレイアウト複雑度の両方を抑える。

**メリット**

- **B1 / B2 を満たしつつ** C1（scoped glance）を構造的に守る（展開は常に高々 1 箇所、1 画面のノード数上限が算術的に決まる）。
- 案1 の資産流用はそのまま。レイアウトは「1 個だけ大きい箱 + 残りは stub」という扱いやすい特殊形に限定でき、汎用 mixed-LOD より実装が軽い。
- 「1 ノード展開 → 別ノード展開」は drill-down の縦移動と直交する横の focus 操作として自然に共存。

**デメリット**

- 「複数箇所を同時に開いて比較したい」には応えない（将来の複数展開は別途 gate）。
- それでも案2 よりレイアウト変更は重い（in-frame の再ルートは必要）。

## 比較

| 観点 | 案1 真 mixed-LOD（目標） | 案2 詳細パネル | 案3 単一 in-frame（Phase 1） |
| --- | --- | --- | --- |
| B1 越境エッジを in-frame で辿れる | ◎ | △（分断／ハイライト代替） | ◎ |
| B2 兄弟・全体フローが残る | ◎ | ○（俯瞰は残るが別サーフェス） | ◎ |
| B3 scoped glance 維持（C1） | △（要上限制約・戻り導線） | ◎ | ◎（1 展開で構造的に保証） |
| 実装コスト | 重 | 軽 | 中 |
| 既存資産の流用 | 高 | 高 | 高 |
| concepts 原則との整合 | 要注意（量が増える → ガード必須） | ◎ | ○（1 展開に限定して整合） |

**案3 は案1 の対立案ではなく最小ケース**である（同時展開数 = 1）。案3 で案1 と同じレイアウト機構を de-risk し、制約を外して案1 に到達する（後述「フェーズ分割」）。案2 は in-frame の B1 を満たせないため endpoint にしない。

## 現時点の方針

**案1（true mixed-LOD）を最終目標とし、案3（単一ノード in-frame 展開）をその第一歩（Phase 1）として段階実装する。** 案2（詳細パネル）は in-frame の関係把握（B1）を満たせないため direction からは外し、「設計空間の記録」として残す（将来 in-frame 展開の補助 UI に転用しうるが本線ではない）。

理由:

- Issue の中核要求（越境エッジを *関係のなかで* 見る、B1）を完全に満たすのは案1 だけ。案2 は drill-down と同じ「文脈が別サーフェスに切れる」弱点を引き継ぐため endpoint にしない。
- ただし案1 の難所は「異なる詳細度のノードを同時配置し、サイズ不連続をまたいでエッジを再ルートする」レイアウトにある（Issue の ROI caveat）。これをいきなり一般形で作るとリスクが高い。
- **案3 は案1 の最小ケースである。** 「大きい箱 1 つ + 兄弟 stub」という最も単純なトポロジで、案1 と同じレイアウト機構（in-frame band splice・越境エッジ逆 re-target・拡大フレーム描画）を実装・検証できる。ここで難所を de-risk し、comprehension 受け入れバー B1–B3 を計測してから、Phase 2 で「同時展開数 ≤ 1」の制約を外して一般 mixed-LOD（案1）へ広げる。
- **scoped glance との整合（C1 / TPL-20260510-21）**: Phase 1（高々 1 展開）は構造的に scoped-glance を保つ。Phase 2 で複数同時展開を解禁すると「一度に見せる量」が増え TPL-20260510-21 と正面衝突するため、Phase 2 は **常に scoped glance へ戻す affordance + 実用上のソフト上限/警告** を設計要件に含める（ここが Phase 2 の設計の核心になる）。

### フェーズ分割

| Phase | 中身 | 対応 Issue | 依存 |
| --- | --- | --- | --- |
| **Phase 1** | 単一ノードの in-frame 展開（同時展開数 ≤ 1）。案1 のレイアウト機構を最小ケースで実装し B1–B3 を計測 | [#1921](https://github.com/kompiro/karasu/issues/1921)（案3） | — |
| **Phase 2** | 同時展開数の制約を外した一般 true mixed-LOD（案1）。scoped-glance ガード（戻す affordance・ソフト上限）を設計要件に含む | [#1923](https://github.com/kompiro/karasu/issues/1923)（案1） | Phase 1 |

親 tracking は [#1815](https://github.com/kompiro/karasu/issues/1815)。Phase 2 は Phase 1 の計測結果を gate にして着手する。

### 実装の指針（Phase 1 — 単一ノード in-frame 展開 / 案3）

1. core: `LayoutOptions` / `RenderOptions` に `expandedContainers?: ReadonlySet<NodeId>`（Phase 1 は **size ≤ 1** の不変条件）を追加。`layout()` 内で、展開ノードは `extractView([…,id])` の子を親スライスへ **band として splice**（`buildGroupFrames` の矩形 + `assignGroupedLayers` 風の二段層）、他兄弟は stub のまま。越境エッジは `remapEndpoint` の逆で展開ノードの内部要素へ再アンカー。
2. renderer: 展開ノードを `renderContainer` の拡大フレームとして描画。`data-expand-node=<id>`（`data-collapse-group` と対）の on-SVG affordance を interactive 時のみ付与。
3. app: `useSystemView` に `expandedContainers`（`useCollapsibleSet`、size ≤ 1）を追加し、`PreviewPane` の click delegation で toggle → 再コンパイル。**live app は React state で駆動し `:target` は使わない**。`.krs` は不変。
4. 受け入れバーの計測: B1（内部→兄弟のエッジを辿れるか）・B2（兄弟とフローが残るか）・B3（ノード数上限・往復で俯瞰へ戻れるか）を、group-by P1 検証（ADR-20260711-03）と同様の **定量指標**（canvas 占有・交差数・1 画面ノード数）で評価し、結果を本 doc に追記。これが Phase 2 着手の gate。
5. AT: `docs/acceptance/<phase1-issue>-single-container-in-frame.md` に記録。TC は:
   - 展開時、展開ノードの内部要素と畳んだ兄弟が同一フレームに共存する（B1/B2）
   - 展開ノードの内部要素から兄弟 stub への越境エッジが端点を保って描かれる（C2 / TPL-20260624-02）
   - 2 つ目のノードを展開すると 1 つ目が畳まれる（Phase 1 は高々 1 展開、C1）
   - static 出力（export / render）には展開 affordance が出ない（C3）
   - **[人間確認]** 実際に大きめの生成図で「内部を兄弟との関係のなかで読めるか」の主観的可読性（受け入れバー B1）

### Phase 1 計測結果（Phase 2 の gate）

`examples/ja/payment-platform`（service 6 / うち `Gateway` は 2 domain、越境は
**explicit service edge** のみ）で `Gateway` を展開した実測（PR #1921 実装）:

| 指標 | baseline | Gateway 展開 | 評価 |
| --- | --- | --- | --- |
| 1 画面ノード数 | 9 | 10（`Gateway` 箱 → 内部 2 domain に置換、+1） | **B3 ✓** ノード数はほぼ不変・上限内 |
| 描画エッジ数 | 9 | 9（**drop ゼロ**） | **B1 ✓** 展開しても連結が消えない |
| canvas | 1467×652 | 1100×884（縦にフレーム帯が増える） | 妥当 |
| 兄弟の可視性 | — | `RiskEngine`/`Ledger`/外部群すべて残存 | **B2 ✓** |

得られた知見（Phase 2 へ申し送り）:

- **越境エッジの再アンカーは 2 系統で足りる**: (1) domain 由来の implicit edge は
  正確な内部 domain に、(2) **domain provenance を持たない explicit service edge /
  infra edge はフレーム境界にアンカー**（`computeEdgePoints` の container-border
  fallback を regular-edge にも拡張）。この 2 本立てで「展開して連結が消える」
  失敗を防げた（payment-platform は explicit のみなので後者が効いた）。
- **1 展開 = +1〜数ノード**に収まり、scoped glance を壊さない（C1 実証）。Phase 2
  で複数同時展開を解禁するときは、この加算がノード予算を食う速度を見ながら
  ソフト上限を決める（TPL-20260510-21）。
- レイアウトは group-band 機構（`assignGroupedLayers`/`buildGroupFrames`）の
  **完全再利用**で実現でき、専用レイアウトパスは不要だった。Phase 2 の複数展開も
  同じ機構に複数 band を通すだけで拡張できる見込み。

**gate 判断: 案3（Phase 1）は B1–B3 を満たし、レイアウト複雑度は許容範囲。案1
（Phase 2, #1923）へ進んでよい。**

### 実装の指針（Phase 2 — 一般 true mixed-LOD / 案1）

1. `expandedContainers` の **size ≤ 1 制約を外す**（複数コンテナを同時に in-frame 展開）。同一系列の展開ノードが複数あるときの band 配置・レイヤ割り当て・越境エッジ再ルートを一般化する。
2. **scoped-glance ガード（TPL-20260510-21 対応）**: 「すべて畳んで俯瞰へ戻る」affordance（bulk collapse の既存 UI 系譜）、1 画面ノード数がしきい値を超えたときの警告/抑制を設計要件にする。無制限展開が既定にならないようにする。
3. 深い入れ子展開（展開ノードの中の子をさらに展開）を扱うかを Phase 1 の計測を見て判断する。
4. AT: Phase 2 用に別記録。複数同時展開・戻り導線・ノード数ガードを TC に含める。
5. ADR 昇格: Phase 1 / Phase 2 が揃った時点（または各 Phase 完了時）に `docs/adr/<issue>-expand-container-in-place.md` として昇格し、本 Design Doc は同 PR で削除する。段階昇格する場合は `docs/design/system-view-grouping.md` の部分昇格運用に倣う。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（view-mode 局所・`.krs` 不変・interactive のみ・既定は従来俯瞰）。
- ドキュメント更新: 本実装時に `docs/concepts.ja.md`「ドリルダウン」節へ「文脈保持型展開は drill-down を補完する」旨を追記候補（hint view の記述と整合）。
- テスト・examples への影響: 新規 AT のみ。既存 examples は不変。

## 未解決の問い / 決めないこと

- **Phase 2（案1）の scoped-glance ガードの具体形**（戻り導線の UI・ノード数しきい値・警告 vs 抑制のどちらにするか）は Phase 1 の計測を見てから決める。
- **深い入れ子展開**（展開ノードの内部をさらに展開）を Phase 2 に含めるかは Phase 1 の計測次第。
- **export SVG サーフェスでの展開表現**（live app は React state で駆動するため無関係だが、`buildDrillDownSvg` / `buildAllViewsSvg` の `:target` 機構に「展開済みの姿」を焼き込むか、それとも export は常に非展開の完全構造を出すか — ADR-20260711-03 の「export は畳んだ姿でなく完全構造」方針と揃えるかを Phase 1 で決める）。

> **proactive TPL について**: 本設計が最も破りやすい原則（scoped glance を first-class に保つ）は既に [TPL-20260510-21](../test-perspectives/TPL-20260510-21-scoped-glance-drill-down.md) が proactive にカバーしている。新規 TPL は起こさず、C1 の不変条件として同 TPL を引用・遵守する。
