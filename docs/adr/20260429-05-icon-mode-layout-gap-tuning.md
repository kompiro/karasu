---
id: ADR-20260429-05
title: "Icon display mode 用の auto-layout gap 定数を別系統に分ける"
status: accepted
date: 2026-04-29
topic: renderer
related_to: [ADR-20260411-01, ADR-20260429-01, ADR-20260429-04]
assumptions:
  - "file: packages/core/src/renderer/layout.ts"
  - "symbol: packages/core/src/renderer/layout.ts :: getLayoutConstants"
  - "symbol: packages/core/src/renderer/layout.ts :: DisplayMode"
---

# ADR-20260429-05: Icon display mode 用の auto-layout gap 定数を別系統に分ける

- **日付**: 2026-04-29
- **ステータス**: 決定済み
- **関連**:
  - Issue [#1000](https://github.com/kompiro/karasu/issues/1000)
  - 実装 PR [#1019](https://github.com/kompiro/karasu/pull/1019)
  - 設計 PR [#1015](https://github.com/kompiro/karasu/pull/1015)
  - 関連 ADR:
    - [ADR-20260411-01](./20260411-01-arch-layout-barycenter-wrap-scope-reduction.md)（barycenter ordering + sub-row wrapping）
    - [ADR-20260429-01](./20260429-01-orthogonal-edge-routing-skip-layer.md)（skip-layer 直交ルーティング）
  - 設計経緯: 旧 Design Doc は本 ADR で置き換え

## 背景

karasu の auto-layout（tier 割当 → barycenter ordering → sub-row wrap →
port distribution → channel routing）は **shape display mode**（可変幅
カード）を前提に gap 定数が選ばれていた:

| 定数             | 値    |
| ---------------- | ----- |
| `LAYER_GAP`      | 120   |
| `NODE_GAP`       | 60    |
| `MAX_LAYER_WIDTH`| 1200  |

`displayMode = "icon"` ではカード寸法が固定（160×56 / 160×100）に
切り替わるが、gap・wrap 閾値・edge routing パラメータは両モード共通で、
icon mode では「カードが小さくなったのに余白だけ shape 基準のまま」という
**疎な配置**になっていた。数値で表すと:

- 水平方向 NODE_GAP / カード幅: shape 24% / icon 37.5%（約 1.5 倍ゆるい）
- 垂直方向 LAYER_GAP / カード高さ: shape ≈100% / icon (説明なし) ≈214%
- 折り返し: MAX_LAYER_WIDTH=1200 で shape は約 4 ノード／行、icon は 5
  ノード／行 — 折返し件数自体は近いが見えの密度が大きく異なる

Issue #1000 の "Render representative diagrams in Icon mode" 観察と、
「icon mode は typology を強調すべきで、tier 揃えはむしろ弱くて良い」と
いう設計意図に対し、現状は逆に余白が悪目立ちしていた。

## 決定

`layout.ts` に **`getLayoutConstants(displayMode)`** を追加し、
`LAYER_GAP` / `NODE_GAP` / `MAX_LAYER_WIDTH` を mode 別 lookup に切り替える:

| 定数             | shape | icon |
| ---------------- | ----- | ---- |
| `LAYER_GAP`      | 120   | 80   |
| `NODE_GAP`       | 60    | 36   |
| `MAX_LAYER_WIDTH`| 1200  | 1040 |

実装は以下の構成:

- `getLayoutConstants(displayMode)` が icon モードのとき icon 値、それ以外
  で shape 値を返す。トップレベルの module 定数は廃止（shadow を避ける）。
- `displayMode` を受け取る各 layout 関数（`layout` /
  `layoutMultipleSystems` / `layoutGhostSystem` / `placeGhostUsers` /
  `placeGhostDomains` / `computeTotalDimensions`）は冒頭で
  `const { LAYER_GAP, NODE_GAP, MAX_LAYER_WIDTH } = getLayoutConstants(displayMode);`
  を destructure して使う。
- `computeTotalDimensions` には新たに `displayMode` を渡し、外周マージン
  も mode に追従させる。

選定値の根拠:

- `NODE_GAP=36`: shape の 60/250 ≈ 24% 比率を icon カード幅 160 に揃えると
  約 36（160 × 0.225）。視覚的に shape と同じ密度感になる。
- `LAYER_GAP=80`: 56px カードに対して 143%。LANE_BAND=18 を中央に乗せても
  上下 31px ずつの clearance があり、orthogonal channel routing
  （ADR-20260429-01）と非干渉。
- `MAX_LAYER_WIDTH=1040`: icon mode で 5 ノード／行（5×160+4×36=944）に
  収まり、6 ノード（1140）で折り返す閾値。shape mode の折返し挙動と
  視覚的に揃う。

## 理由

- **数値ミスマッチが定量的に説明できる**: 垂直 +114%、水平 +56% という
  実測値があり、定数調整で直接対応できる。
- **既存パイプラインを温存**: tier + barycenter + Phase 2/3 routing を
  icon mode でも再利用できる。専用レイアウト戦略へ分岐させると Phase 2/3
  の恩恵を再実装することになり、投資対効果が見えない。
- **ロールバック容易**: 定数値の変更のみで挙動が戻る。AT で目視確認した
  結果、icon mode の典型例で破綻が出れば値の再調整、それでも崩れる場合は
  別 ADR で専用戦略を検討する余地が残る。
- **column hint との粒度差を明確化**: `.krs.style` 経由で公開するか
  という議論は別。column hint（[ADR-20260429-04](./20260429-04-style-column-layout-hint.md)）が
  per-node であるのに対し、gap は diagram-wide 定数のため
  `ResolvedStyles.layoutHints` の Map<nodeId, hint> 構造には乗らない。
  必要が出た時点で `layoutDefaults`（diagram スコープ）として続編 ADR で
  扱う。

## 却下した案

### 案2: icon mode 専用レイアウト戦略にブランチする

tier ベースを捨てて icon mode は密グリッドパッキング（kind/annotation で
グループ化、固定セルに敷き詰め）にする。

- 却下理由:
  - 新コードパスを 1 本増やす。Phase 2/3 routing の恩恵を再実装するか、
    片肺だけ improvement されないか、どちらかになる。
  - icon mode↔shape mode 切替で配置が大きく変わるとレビュー・差分が
    読みづらくなる（同じトポロジが mode で別の絵に見える）。
  - 案 1 で十分まともになる可能性が高く、投資対効果が見えにくい。

### 案3: 現状維持 + 文書化

「icon mode はサムネイル・全景把握用途で、密度を求める利用は shape mode」
と `docs/spec/style.md` に明記する。

- 却下理由:
  - Issue #1000 の "Icon mode looks worse" 観察への直接の解は得られない。
  - ユーザーがデフォルト値で違和感を持つたびに同じ Issue が再提起される。

### 案 1 の hint 公開派生案: `.krs.style` 経由でユーザー上書き可能にする

- 却下理由（当面は内部定数に閉じる）:
  - column hint と粒度が違い（per-node vs diagram-wide）、既存
    `layoutHints` Map に素直には乗らない。`layoutDefaults` のような新
    階層が必要で、要望が具体化していない段階で増やすのは早い。

## スコープ外（フォローアップ）

- **fixed-N 折返し**: 「アイコン何枚で揃える」（例: 4 枚単位の格子）の
  方が読みやすいかは実例で目視判断する。AT (`docs/acceptance/1000-icon-mode-layout-tuning.md`)
  の手動検証項目で扱い、明らかに良ければサブ調整として fixed-N を採用する
  別 Issue を立てる。
- **ユーザー側 gap 上書き**: 上記の通り `layoutDefaults` の枠で別途。
- **edge routing 側の icon-mode 適応**: `LANE_BAND` は現行 18px 固定だが
  LAYER_GAP=80 の中で十分な clearance を保つ。問題が出れば別 ADR で
  mode 別化する。
