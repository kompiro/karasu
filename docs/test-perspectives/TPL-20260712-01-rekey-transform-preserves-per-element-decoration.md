---
id: TPL-20260712-01
title: "端点 id を書き換える集約/畳み込み変換は、元 id にキーされた per-要素の装飾（diff state 等）を再導出する（retarget 後も装飾が残ることを assert）"
status: active
date: 2026-07-12
applicable_to:
  - "複数の要素/エッジを 1 つの stub / 代表 / トランクに畳み込み、端点 id を書き換える変換"
  - "要素の装飾（diff state / style / badge）を、変換前の元 id をキーにした別 map で引いて描画する機能"
known_consumers:
  - renderer
discovered_from:
  - issue: "#1886"
  - root_cause_file: "packages/core/src/renderer/group-collapse.ts:collapseGroups"
related_to:
  - TPL-20260624-02
  - TPL-20260618-01
topic: renderer
scope:
  packages:
    - core
---

# TPL-20260712-01: 端点 id を書き換える集約/畳み込み変換は、元 id にキーされた per-要素の装飾（diff state 等）を再導出する

## 観点

[TPL-20260624-02](TPL-20260624-02-relayout-into-group-preserves-placement-and-edges.md) は
「再配置/畳み込みで**トポロジ**（配置の全域性・エッジ端点）を保つ」ことを柵にする。本 TPL は
その**直交する第 2 面**を扱う: **要素に紐づく装飾**（diff state・style・badge など、要素 id を
キーにした別 map で引く付加情報）が、**id を書き換える変換**を跨いで生き残るか。

トポロジ（端点解決）が正しくても、装飾は別 map を **元 id で引く**設計だと静かに落ちる:

- 畳み込み変換（fold → stub / aggregate → trunk）が端点 id を `stub id` に書き換える。
- 描画側は装飾を `map.get(renderedKey)` で引く（`renderedKey` は書き換え後の stub id 由来）。
- 装飾 map は**変換前の元 id**でキーされているので lookup が **miss** し、要素は**装飾なし**で描かれる。

これは「エッジは消えていない（トポロジ OK）が、diff の色/state が消えた」という、
TPL-20260624-02 のチェックリストを全部通しても**すり抜ける**劣化。

さらに畳み込みは **1 対多**（1 stub が複数の元要素を集約）なので、装飾は単純な写像では
再キーできず、**集約規則**（複数元 state の fold）を明示的に決める必要がある。

## 想定される失敗モード

- 端点 id を stub に書き換えた集約エッジ/ノードが、diff state map を**元端点キー**で引けず
  `data-diff-state` 装飾なしで描かれる（追加/削除が畳むと不可視になる）。#1886 point 2。
- 装飾 map のキー形（`${from}->${to}`）とレイアウト id 形（stub id 由来）が**ずれ**、
  lookup が silent miss する（[TPL-20260618-01] の「style lookup がレイアウト id 形と一致」を
  diff 装飾に一般化した形）。
- 集約で複数元要素の装飾が**衝突**するのに fold 規則が未定義で、たまたま最初/最後の 1 件だけが
  残る（順序依存の非決定的挙動）。
- 元 id → 新 id の remap をトポロジ（端点）にだけ適用し、装飾 map に適用し忘れる（トポロジ柵は
  通るが装飾は落ちる）。

## チェックリスト

端点 id を書き換える集約/畳み込み変換を実装/変更するとき（トポロジ柵 TPL-20260624-02 に**加えて**）:

- [ ] 変換後の要素が担う装飾（diff state / style / badge）を、**変換後のキー**で引けるよう
      再導出（re-key）することをテストする。畳んだ stub エッジ/ノードが `data-diff-state` を
      **保持**することを assert（装飾なしにならない）。
- [ ] 集約が 1 対多なら、複数元装飾の **fold 規則を明示的に定義**しテストする（例: 単一 state は
      踏襲・混在は `changed`）。混在ケースを最低 1 つ assert する。
- [ ] 装飾 map のキー形が、レイアウト後の要素 id 形と**一致**することを確認する（[TPL-20260618-01]）。
- [ ] 退化ケース（畳み込み対象ゼロ / 全 unchanged / 単一元）で装飾が破綻しないことを確認する。

## 既知の対処パターン

- **remap を装飾にも通す**: 端点 remap（`collapseGroups` の endpoint remap）と同じ写像で、
  装飾 map のキーも書き換える。集約（dedup）が起きる箇所で、畳まれた元エッジ群の装飾を
  fold して**変換後キーの新 map**を返し、呼び出し側で元 map に上書きマージする。
- **fold 規則を単一の純関数に集約**: 「単一 state → 踏襲 / 混在 → `changed`」のような集約規則を
  1 箇所（例: `foldEdgeDiffState(states)`）に置き、順序非依存・決定的にする。
- **装飾の再導出を変換と同じ関数で行う**: トポロジ（端点）と装飾（state）を別経路で処理せず、
  畳み込みを行う関数（`collapseGroups`）が両方を一括で返すことで「片方だけ remap した」漏れを防ぐ。

## 関連テスト

- `packages/core/src/renderer/group-by-diff.test.ts`（team を畳んだ集約 stub エッジが diff state を
  保持・単一踏襲/混在 `changed` の fold・除去ノードが former team フレームに配置 — #1886）

## 派生元 spec

- `docs/design/system-view-grouping.md` § 「差分モードの grouping — 除去ノード配置と集約エッジ diff state（#1886）」
