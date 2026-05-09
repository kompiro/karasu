---
id: ADR-20260509-04
title: "edge `label-position` / `label-offset` プロパティ — fractional 位置と 1 軸 perpendicular ずらし"
status: accepted
date: 2026-05-09
topic: edges
related_to:
  - ADR-20260506-01
  - ADR-20260506-03
scope:
  packages: [core]
---

# ADR-20260509-04: edge `label-position` / `label-offset` プロパティ — fractional 位置と 1 軸 perpendicular ずらし

- **日付**: 2026-05-09
- **ステータス**: 決定済み
- **関連**:
  - 親 Issue [#1184](https://github.com/kompiro/karasu/issues/1184)（親 #1071 — 既に close）
  - 関連 ADR: [ADR-20260506-03](./20260506-03-edge-direction-style.md)（同じ append-only `.krs.style` プロパティのパターンを踏襲）

## 背景

#1071（edge readability brainstorm）の "direction A — author-controlled
label position" を具体化したもの。dense diagram で edge label 同士や
node とのオーバーラップが起きやすく、midpoint 固定では避けられない
ケースがある。

`direction` プロパティ（ADR-20260506-03）と同じく、**`.krs.style` で
author が明示的に指定できるヒント**として位置決定の自由度を提供する
方針。

## 決定

`.krs.style` に edge 用の 2 プロパティを追加:

- **`label-position: start | middle | end | <0.0..1.0>`**
  - キーワードは `0` / `0.5` / `1` に正規化
  - fractional 値はそのまま使用、`[0, 1]` 範囲外はクランプ
  - default: `middle` (= `0.5`)
- **`label-offset: <dy>px` または `<dx>px <dy>px`**
  - screen-axis でのずらし（CSS shorthand 構文）
  - 1 値 = `dx=0`, `dy=<value>`（典型ケースの「label を下に」）
  - 2 値 = `dx`, `dy`
  - 正の値は右 (x) / 下 (y)、負の値は左 / 上
  - default: `0 0`

renderer 挙動:

- `labelPosition === 0.5 && labelOffset === 0` のときは **既存の "最長
  セグメント中点" ヒューリスティクスを維持** → 既存図の SVG 出力が
  byte-stable
- いずれかが非デフォルト値になった瞬間、polyline 全長を辿って
  `position × totalLength` の点を anchor にする経路に切り替わる

## 理由

- **author intent を直接表現できる**: 自動配置（collision avoidance、
  ADR 案 B）よりまず安価で、明示的に「ここに置きたい」を伝えられる
- **`direction` と同じ append-only / cascade-tail-wins パターン**: GUI
  編集器（ADR-20260506-01）にも素直に乗る。将来 right-click メニューに
  `Label position ▸ Start / Middle / End` を追加する経路も既に整っている
- **既存図の互換性を最優先**: デフォルト値経路では既存の中点ヒューリスティクスを
  壊さない。`label-position: middle` を明示的に書いても byte-stable
- **screen-axis (CSS shorthand) を採用**: 初版では 1 軸 perpendicular で
  実装したが、`edge { label-offset: 8px; }` のようにグローバルに当てた
  ときに各 edge の傾きで方向がバラバラになる UX 問題を実装直後の動作確認
  で踏んだ。CSS の `padding`/`margin` 風の 1 値 / 2 値 shorthand に
  切り替え、screen-axis で統一することで「全 label を 8px 下にずらす」が
  予測可能に書けるようにした
- **fractional もキーワードも両方受ける**: GUI からは start/middle/end
  の 3 択で十分だが、上級ユーザーが `0.25` のような精密値を書きたいケース
  にも応える。実装コストは parse 時のみで、内部表現は `[0, 1]` 一本
- **invalid silent fallback**: warning を増やさない。ADR-20260506-03 の
  `direction` と同様の方針

## 却下した案

### 案: 1 軸 perpendicular offset
edge の進行方向に対して垂直なずらし（初版で採用していた案）。
- 却下理由: `edge { label-offset: 8px; }` のように複数 edge にまたがる
  ルールを書いたとき、edge の傾きごとに視覚的な方向がバラバラになる。
  「全 label を統一して下にずらしたい」のような典型ケースに応えられず
  ユーザーから "どう使ったらいいか分からない" との指摘で実装直後に撤回

### 案: GUI 主導で開始（spec を後から追加）
right-click → Position プリセット → `.krs.style` に書き戻す flow を先に
作る。
- 却下理由: spec / parser / resolver / renderer が揃わないと GUI も
  書く先が無い。本 ADR でフロー基盤を整えてから、GUI 側を別 issue で乗せる

### 案: 自動 collision detection を待つ
Issue #1071 の direction B（auto-placement）が landing するまで manual
control を入れない。
- 却下理由: auto-placement は graph drawing としての設計が必要で重い。
  manual control は安価で即効性があり、両者は補完的（manual で押さえ
  きれない場合に auto を使う）。先に manual を入れるのは合理的

### 案: `label-position` だけ入れて `label-offset` は後回し
最小限のスコープ。
- 却下理由: position だけだと「同じ位置で 2 つの label が重なる」典型
  ケースが解けない。perpendicular offset まで揃って初めて実用的。両方
  同時に入れる方が spec も小さい

## スコープ外（フォローアップ）

- **GUI 右クリックメニュー対応**: `Label position ▸ Start / Middle / End`
  の追加。`direction` 統合（ADR-20260506-01）と同じパターンで実装可能
- **2 軸 offset**: 上記の理由で defer
- **Auto label collision detection**: #1071 の direction B、本 ADR の
  manual control が広く使われるようになってから設計
- **Multi-line label の per-line offset**: 現状 single line のみ
