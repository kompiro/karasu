---
id: ADR-20260429-01
title: Skip-layer エッジの直交チャネルルーティング
status: accepted
date: 2026-04-29
topic: edges
related_to: [ADR-20260411-05]
assumptions:
  - "file: packages/core/src/renderer/edge-routing-channels.ts"
  - "symbol: packages/core/src/renderer/edge-routing-channels.ts :: routeOrthogonalEdges"
  - "grep: packages/core/src/renderer/layout.ts :: waypoints"
---

# ADR-20260429-01: Skip-layer エッジの直交チャネルルーティング

- **日付**: 2026-04-29
- **ステータス**: 決定済み
- **関連**:
  - Issue [#968](https://github.com/kompiro/karasu/issues/968)（親 [#966](https://github.com/kompiro/karasu/issues/966)）
  - 兄弟 PR [#971](https://github.com/kompiro/karasu/pull/971)（Direction A — actor row 配置）
  - Follow-up Issue [#996](https://github.com/kompiro/karasu/issues/996)（Phase 3 — port / lane distribution）
  - 実装 PR [#989](https://github.com/kompiro/karasu/pull/989)
  - 設計経緯: 旧 Design Doc は本 ADR で置き換え

## 背景

karasu のエッジ描画は元々 `fromPoint → toPoint` を単一の直線（`<line>`）で繋ぐだけだった
（`packages/core/src/renderer/edge-routing.ts`）。Sugiyama 風の層配置（`packages/core/src/renderer/layout.ts`）と
組み合わさり、層を 2 段以上飛ぶ skip-layer の downward edge が中間ノードカードを貫通する崩れ方を起こす。

Direction A（[#971](https://github.com/kompiro/karasu/pull/971)）が
「outgoing edge を持つ actor を target の直前 row に降ろす」配置改善を
入れたことで、典型的な EC Platform 例では skip-layer が解消されたが、

- actor が複数の異なる深さに edge を持つ場合
- 大規模な独自ダイアグラムで層が密に積まれている場合

など、A だけでは救いきれない残ケースが残る。
さらに親 Issue [#966](https://github.com/kompiro/karasu/issues/966) が
A・B・C の三方向で並行解決する方針だったため、B（エッジルーティング）として
独立に Phase 2 を実装する。

## 決定

`packages/core/src/renderer/edge-routing-channels.ts` を新設し、
`computeLayoutEdges()` の後段に **チャネルベースの直交ルーティング**
パスを追加する。

- skip-layer downward edge の直線が他ノードのバウンディングボックスを
  strict-interior で横断する場合、L 字型 polyline に置き換える:
  - `(src.x, src.bottom) → (src.x, channelY) → (target.x, channelY) → (target.x, target.top)`
  - `channelY` は target の直前の行と target の間にある空き帯の中央
- 候補 polyline の 3 セグメント全てを obstacle 集合に対して再判定し、
  まだ衝突するセグメントが残る場合は **直線にフォールバック** する。
  最悪でも現状以上に崩れない（strictly monotonic）。
- 同層・隣接層・ghost edge・cyclic edge は対象外で従来の `<line>` を維持する。
- `LayoutEdge` に optional `waypoints?: Point[]` を追加する。
  set されている場合のみ `<polyline>` でレンダリング、未 set なら従来どおり `<line>`。
  既存の他レンダラー（org-renderer / deploy-renderer / paste-compare 等）は
  `waypoints` を渡さない限り影響を受けない。

判定アルゴリズムは Liang-Barsky の clip ロジックを strict-interior 用に
調整したもの（`p[i]=0 ∧ q[i]≤0` で「セグメントが矩形辺上または外」と
判定して衝突なしとする）を使う。座標のみから決定論的に経路が決まり、
snapshot test と整合する。

## 理由

- **karasu のレイアウトは Sugiyama 風で層間に必ず空き帯がある** ため、
  汎用の障害物グリッド A* 探索ではなく、空き帯（channel）を経由する
  軽量な stub-and-bend で十分。実装も小さい。
- **決定論性**: 並べ替えキー・channel y はすべてノード座標から導出される。
  乱数や DOM metric に依存しないので snapshot diff が安定する。
- **後方互換**: `LayoutEdge.waypoints` は optional。既存図で waypoints が
  set されないため、snapshot test に regression が出ない（実測 1062 → 1063 件、
  既存 1062 件は無変更で通過）。
- **将来の Phase 3 / 横方向 layout / ELK 移行と直交**: `waypoints` という
  概念は ELK の orthogonal routing と同じ抽象なので、将来 ELK に乗り換える
  際にも移行コストが小さい。

## 却下した案

### 案 B1: 障害物グリッド + A* 探索
ノード矩形を膨らませた障害物マップ上で A* を実行しベンドコストで経路を選ぶ。
karasu の層構造に対しては overkill であり、決定論性確保のため
tie-breaking を厳密化するとコードが膨らむ。層に整列している以上、
グリッド探索が見つける最適解は概ねチャネル方式と同じ経路になる。

### 案 B2: スプライン（Bezier）経路
障害物回避を曲線で表現するには制御点最適化が必要で、結局 A* 級の探索が要る。
直交線の方がアーキ図として読みやすい（C4 / PlantUML 系の慣習）。
また SVG diff における座標比較も曲線では難しい。

### 案 B3: ELK.js を取り込む
TypeScript 移植版 ELK で全体レイアウトを委譲する案。bundle size が
数百 KB 増えるうえ、karasu のレイアウト判断（ティア定義・ghost / domain edge の
扱い等）を捨てて ELK モデルに合わせ直す必要があり A・C との整合が崩れる。
将来の選択肢としては残すが、まずは自前のチャネルルーティングで
[#968](https://github.com/kompiro/karasu/issues/968) の許容ラインに乗せる。

### 案 B4: ノード x 座標を再配置して直線でも貫通しないようにする
中間層ノードを左右にずらして直線が抜けるように並べる。x 座標の意味
（barycenter による親子隣接）が壊れ、A / C との前提と矛盾する。
「ノードがエッジを避ける」より「エッジがノードを避ける」方がモデル的に
正しい（エッジは経路、ノードは存在）。

## スコープ外（フォローアップ）

以下は本 ADR の範囲外で、別 Issue / 別 ADR で扱う:

- **Phase 3 — port distribution + per-channel lane allocation**:
  ファンアウトしたエッジのラベル重なり解消（Issue [#996](https://github.com/kompiro/karasu/issues/996)）
- **ghost domain edge / cyclic edge の直交化**:
  back-arc 表示と ghost anchor ロジックを保つため当面直線のまま
- **横方向 layered モード**:
  現状ロードマップに無いので垂直スタック前提でハードコード
