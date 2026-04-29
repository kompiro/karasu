# Auto-layout: orthogonal edge routing that avoids intermediate node cards

- **日付**: 2026-04-28
- **ステータス**: 検討中
- **関連**:
  - 親 Issue: [#966](https://github.com/kompiro/karasu/issues/966) — Auto-layout: actors that bypass intermediate clients render with crossing edges
  - Issue: [#968](https://github.com/kompiro/karasu/issues/968) — B. edge routing should avoid intermediate node cards
  - 兄弟: [auto-layout-actor-row-by-target](./auto-layout-actor-row-by-target.md)（A）, [#969](https://github.com/kompiro/karasu/issues/969)（C. presentation-only layout hints）
  - 既存実装: `packages/core/src/renderer/edge-routing.ts`, `packages/core/src/renderer/layout.ts`

## 背景・課題

karasu の現在のエッジ描画は、`computeEdgePoints()` で算出した `fromPoint` /
`toPoint` の 2 点を **直線**（`<line>`）でつなぐだけである
（`packages/core/src/renderer/edge-routing.ts:5-26`）。

このため次の 2 種類の崩れが起きる:

1. **中間ノードを貫通する**: 同じ列に並ぶ 3 段の `src → mid → dst` で
   `src → dst` を直線で引くと、`mid` カードを横切る。
   親 Issue [#966](https://github.com/kompiro/karasu/issues/966) の A
   （actor の row 再配置）で多くは解決するが、A だけでは救えない
   ケース（深いファンアウト・サブシステム横断・ghost domain edge 等）が
   残る。
2. **平行エッジのラベルが重なる**: `EC Site` から複数の依存先へ伸びる
   5 本のエッジが、ほぼ同じ角度で重なり、ラベル
   （"Open the app" / "Call the API" / ...）が同じ y 座標に積み上がる。

EC Platform 例で実際に発生している現象が Issue #968 の動機。

## 制約・前提

- `.krs` / `.krs.style` の語彙は変えない（純粋にレンダリング層の改善）
- 既存の `LayoutEdge` インタフェース（`fromPoint` / `toPoint` の 2 点）が
  あらゆる箇所（org-renderer, deploy-renderer, paste-compare の SVG 比較等）で
  参照されているので、互換のため点情報は残しつつ経路を加える形にする
- A（actor row 再配置）は #968 と独立に進められること（B は A に依存しない）
- 出力 SVG はテキスト diff にも使われている（snapshot test 多数）ため、
  決定的な経路計算が必要（乱数や DOM ベースの metric は不可）

## 決定

karasu のレイアウトは Sugiyama 風の **層構造**（layer 0..N が上から下、または
左から右に並ぶ）であることを前提に、**チャネルベースの直交経路（orthogonal
channel routing）** を採用する。完全な A* / 障害物グリッドではなく、
レイヤ間の空き帯（channel）を介した stub-and-bend 方式に絞る。

### アルゴリズム概要

1. **エッジを 3 種に分類**
   - **same-layer**: `fromLayer == toLayer` → 既存の水平直線を維持
     （層内では中間ノード貫通は発生しないので変更不要）
   - **adjacent-layer**: `|fromLayer - toLayer| == 1` → 既存の直線を維持
     （層間に他ノードはない）
   - **skip-layer**: `|fromLayer - toLayer| >= 2` → 新ロジックで直交経路化

2. **skip-layer の経路（垂直層スタックの場合）**
   - source の **bottom 中央** から短い垂直 stub を出す
   - source 行と次の行の間にある **inter-layer channel** に入る
   - channel を**水平に**移動して target の x 中央に到達する
   - 必要なら順方向の各 channel を経由して target 行直前まで降りる
   - target の **top 中央** に垂直に進入する
   - 結果は polyline（4〜6 点）になる

3. **ポート分散（multiple edges from/to the same node）**
   - 同じノード側面（top / bottom / left / right）に複数のエッジが付く場合、
     その辺を等分してポートを割り当てる。例: 3 本が下辺に付くなら
     `width * [1/4, 2/4, 3/4]`。
   - 割り当ては「対岸の方向」で安定ソートする（左の対岸を持つエッジは左端に、
     右の対岸を持つエッジは右端に）。これでエッジが交差せず、ラベルも
     横方向に分散する。

4. **チャネル内のレーン分散**
   - 同じ inter-layer channel を水平に通過するエッジが複数あるとき、
     channel の高さを N 等分して各エッジに「レーン」を割り当てる。
   - 割り当て順は (左端 x の昇順, 右端 x の昇順) の決定的キー。
   - これで重なる水平セグメントが上下にずれ、ラベルが分離する。

5. **ラベル位置**
   - 単一直線時代の「中点に置く」を、polyline の **最長水平セグメントの
     中点** に置く方式へ変更する。これでラベルが直交経路上の見やすい
     場所に乗る。

### LayoutEdge の拡張

```ts
export interface LayoutEdge {
  // 既存フィールド（互換のため残す）
  from: string;
  to: string;
  label?: string;
  fromPoint: { x: number; y: number };
  toPoint: { x: number; y: number };
  ghost?: boolean;
  cyclic?: boolean;
  domainEdges?: DomainEdgeDetail[];

  // 追加: skip-layer エッジが直交経路を持つ場合の中間点列
  // undefined または空配列のときは fromPoint→toPoint の直線を引く（既存挙動）
  waypoints?: { x: number; y: number }[];
}
```

`renderEdge()` は `waypoints` があれば `<polyline>` を描き、なければ
従来通り `<line>` を描く。これで snapshot test の差分は **直交経路化が
必要な図のみ** に局所化できる。

### レンダラー変更

- `packages/core/src/renderer/edge-routing.ts`:
  - `<line>` を `<polyline>` 系の経路描画に拡張する関数を追加
  - ラベル位置算出を「polyline の最長水平セグメント中点」に変更
  - hit rect も同じ位置を使う
- `packages/core/src/renderer/layout.ts`:
  - `computeLayoutEdges()` の後段に **`routeOrthogonalEdges()` パス** を追加
  - skip-layer エッジに `waypoints` を埋める
  - ポート分散はノード単位で集計してから割り当てる

新ロジックは `packages/core/src/renderer/edge-routing-channels.ts`
（仮）に分離し、`layout.ts` から呼び出す。テストも独立させる。

## 理由

1. **障害物グリッド A* を避けて軽量に保つ**: karasu のレイアウトは
   Sugiyama 風の層配置に固定されているので、層間チャネルが必ず空いている
   ことが保証できる。一般的な平面ルーティング問題を解く必要はない。
2. **決定論性**: 全ての分散・割り当てキーが構造から一意に決まる
   （x 座標・対岸方向の安定ソート）。snapshot test と相性が良い。
3. **最小侵襲**: `LayoutEdge` の追加フィールドはオプショナルで、
   既存の同層・隣接層エッジは現行コードパスをそのまま通る。
   org-renderer / deploy-renderer 等の他レンダラーへ影響を波及させない。
4. **A と直交**: A（actor row 再配置）が走っても走らなくても、B は B 単独で
   skip-layer エッジを綺麗にする。両方走った状態が最も望ましい。
5. **ELK や Graphviz の `splines=ortho` と同じ系譜**: 将来 ELK ベースの
   レイアウトに置き換えるとしても、概念とインタフェース（waypoints）が
   揃っているので移行コストが小さい。

## 却下した案

### 案 B1: 障害物グリッド + A* 探索
- ノード矩形を膨らませた障害物マップ上で A* を実行し、ベンドコストで
  直交経路を選ぶ。
- 却下理由:
  - 計算量とテスト工数が大きい。karasu の層構造に対しては overkill。
  - 決定論性を保つには tie-breaking を厳密化する必要があり、コードが
    膨らむ。
  - レイアウトが既に層に整列している以上、グリッド探索が見つける
    最適解は概ねチャネル方式と同じ経路になる。

### 案 B2: スプライン（Bezier）経路
- Graphviz の `splines=true` 相当。曲線で滑らかに障害物を避ける。
- 却下理由:
  - 障害物回避を曲線で表現するには制御点を最適化する必要があり
    結局 A* 級の探索がいる。
  - 直交線の方がアーキ図として読みやすい（C4 / PlantUML 系の慣習）。
  - SVG diff としてもベジエは座標比較が難しい。

### 案 B3: ELK.js を取り込む
- TypeScript 移植版の ELK をビルドに含めて全体レイアウトを委譲。
- 却下理由:
  - bundle size が大幅に増える（数百 KB 級）。
  - karasu のレイアウト判断（ティア定義・ghost / domain edge の扱い等）を
    捨てて ELK モデルに合わせ直す必要があり、A・C との整合が崩れる。
  - 将来の選択肢としては残すが、まずは自前のチャネルルーティングで
    Issue #968 の許容ラインに乗せる。

### 案 B4: ノードの x 座標を再配置して直線でも貫通しないようにする
- 中間層ノードを左右にずらして、上下の直線が間を抜けるように並べる。
- 却下理由:
  - x 座標の意味（barycenter による親子隣接）が壊れ、A / C の前提と矛盾する。
  - エッジ追加で頻繁に再配置されるとアニメーションも崩れる。
  - 「中間ノードがエッジを避ける」より「エッジが中間ノードを避ける」方が
    モデル的に正しい（エッジは経路、ノードは存在）。

## 影響範囲

| 領域                                                | 影響                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `packages/core/src/renderer/edge-routing.ts`        | `<line>` → `<polyline>` 対応、ラベル位置算出変更                                       |
| `packages/core/src/renderer/edge-routing-channels.ts` (新規) | チャネルレーン割り当て・ポート分散・waypoints 計算                              |
| `packages/core/src/renderer/layout.ts`              | `computeLayoutEdges()` 後段に `routeOrthogonalEdges()` 呼び出し追加                    |
| `packages/core/src/renderer/layout.ts (`LayoutEdge`)`| `waypoints?: Point[]` を追加（オプショナル）                                          |
| `.krs` / `.krs.style` 構文                          | 変更なし                                                                              |
| Snapshot tests                                      | skip-layer エッジを含む図（EC Platform 等）で SVG が変わる。期待値を更新する          |
| `org-renderer` / `deploy-renderer`                  | 直接の変更なし。`waypoints` 未設定なら従来挙動                                        |

## 検証（アクセプタンステスト）

`/acceptance-test` で記録する受け入れ項目:

1. **AT-edge-routing-no-cross**: skip-layer エッジが中間ノードのバウンディング
   ボックスを横断しないこと（自動: SVG 経路 vs ノード矩形の交差判定）。
2. **AT-edge-routing-fanout-labels**: 同一ノードから複数エッジが伸びるとき、
   ラベル間の最小距離が閾値（例: 12px）以上であること（自動: ラベル
   bbox 重なり検査）。
3. **AT-edge-routing-ec-platform**: EC Platform 例で 5 本の `EC Site` 周辺
   エッジがすべて legible に描画されること（手動: 視覚的確認、Preview URL）。
4. **AT-edge-routing-no-regression**: same-layer / adjacent-layer のみで
   構成される既存図で、SVG 経路が直線のままであること（自動: snapshot diff
   が waypoints 関連箇所のみに限定）。

> AT は人間確認が必要なもの（#3）と自動検証で済むもの（#1, #2, #4）を
> 区別して記録する。

## 段階的リリース計画

1. **Phase 1**: `LayoutEdge.waypoints` 追加 + `<polyline>` レンダリング対応
   （まだ waypoints は誰も書き込まないので挙動不変）。snapshot test に
   影響なし。
2. **Phase 2**: `routeOrthogonalEdges()` 実装、skip-layer のみ waypoints を
   設定。snapshot を更新し、目視で EC Platform を確認。
3. **Phase 3**: ポート分散 + チャネルレーン分散を有効化。fan-out が密な
   図でラベル重なりを除去。

各 Phase ごとに別 PR を切るかは実装中の差分量を見て判断する。

## スコープ外（別 Issue で扱う）

- **ghost domain edge / cyclic edge は対象外**。これらは現行通りの直線描画を
  維持する。理由:
  - ghost domain edge はシステム横断の implicit edge で、共有レイヤスタックの
    概念が成立しない（`fromIsAbove` ヒューリスティクスで top/bottom anchor を
    切り替える既存ロジックを温存する）。
  - cyclic edge は `krs-edge--cyclic` クラスで back-arc として視覚的に区別
    されている。同じ channel に直交化すると forward edge と衝突して
    back-arc セマンティクスが見えにくくなる。
  - 必要があれば本 Issue 完了後に follow-up Issue を立てる。

## 方向抽象化（YAGNI）

karasu には現状「横方向 layered モード」は無い（行は上から下に積まれる）。
本実装はこの **垂直スタック前提でハードコード** する（channel は水平、port は
top/bottom）。横方向モードが将来導入された場合は `edge-routing-channels.ts`
モジュール単位でリファクタする。今はロードマップに無いので投機的抽象化を
避ける。

## レーン数上限（Phase 3 で確定）

同一 channel のレーン数上限は **Phase 3 で実データを見てから決める**。
Phase 1–2 は上限なしで実装し、Phase 3 で密な fan-out を持つ実例
（EC Platform 等）の必要レーン数を観測してから次のいずれかを選ぶ:

- 上限なしで chanel を必要なだけ拡張
- N 本までは個別レーン、超過分は単一バンドルに集約して `+N more` 風に表示

判断材料が無い段階で先に決めると外す可能性が高いので、Phase 1–2 の
PR に判断を含めない。
