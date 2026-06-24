---
id: TPL-20260624-02
title: "要素を主構造から抜き出して別グループに再配置するとき、全要素ちょうど一度配置 + 参照エッジの端点保持を検証する"
status: active
date: 2026-06-24
applicable_to:
  - "レイアウトで一部の要素を主構造（DAG / 層 / 親コンテナ）から抜き出して別グループ（帯 / レーン / 別行）に再配置する機能"
  - "再配置対象を端点に持つエッジ / 関係を、主構造の外へ移したあとも描画する機能"
known_consumers:
  - deploy-layout
  - renderer
discovered_from:
  - issue: "#1738"
  - root_cause_file: "packages/core/src/renderer/deploy-layout.ts:layoutDeploy"
related_to:
  - TPL-20260519-02
  - TPL-20260510-21
topic: renderer
scope:
  packages:
    - core
---

# TPL-20260624-02: 要素を主構造から抜き出して別グループに再配置するとき、全要素ちょうど一度配置 + 参照エッジの端点保持を検証する

## 観点

レイアウトで一部の要素を主構造（依存 DAG・層・親コンテナ）から **抜き出して別グループ**（kind 帯・スイムレーン・bottom row など）に再配置する変更は、2 つの不変条件を壊しやすい:

1. **配置の全域性 / 一意性** — 抜き出した要素が「主構造側でスキップされたが帯側でも置かれなかった（drop）」または「両方で置かれた（duplicate）」状態になりうる。要素は **ちょうど一度** 配置されなければならない。
2. **参照エッジの端点保持** — 抜き出した要素を端点に持つエッジ / 関係は、その要素が主構造の外に出ても **両端点が解決し描画される**（帯をまたいでルーティングされる）必要がある。フィルタの掛け方を誤ると、エッジ解決マップから端点が落ちて静かに消える。

deploy view の job 帯（#1738）では、job-only container を Longest Path Layering から除外して専用帯に移す。除外フィルタ（DAG 側）と再配置（帯側）が別経路なので、両方が同じ集合分割に基づいていないと drop / dup が起きる。ghost edge は container id で端点解決するため、container を帯に移しても id を保てばエッジは生き残る — が、id を書き換えたり edge を DAG 集合でフィルタすると消える。

## 想定される失敗モード

- 主構造のフィルタ（例: `dagGroups = all.filter(notBanded)`）と帯のフィルタ（`band = all.filter(banded)`）の述語が non-complement になり、ある要素がどちらにも入らず **消える** / 両方に入って **二重描画**。
- 帯に移した要素を端点に持つエッジが、DAG 集合でフィルタした `predecessorsMap` / id セットに依存していて **端点解決に失敗 → エッジが消える**。
- 帯が空のときに帯ラッパー（caption / bounding box）だけ描かれる、または主構造が空（全要素が帯対象）のときに座標原点や empty 判定が壊れる。

## チェックリスト

主構造からの抜き出し再配置を実装/変更するとき:

- [ ] 主構造側と別グループ側の述語が **相補的**（complement）で、全要素がちょうど一度どちらかに入ることをテストする（drop / dup なし）。
- [ ] 配置後のノード総数が入力ユニット総数と一致することを assert する。
- [ ] 抜き出した要素を端点に持つエッジ / 関係が、再配置後も両端点を解決して描画されることをテストする（帯をまたぐケース）。
- [ ] 退化ケース（別グループが空 / 主構造が空 / 両方に要素）でレイアウトが破綻しないことを確認する。

## 既知の対処パターン

- **単一の集合分割を共有する**: `kindBand` のような 1 つのメタ値で `filter(x => x.band)` と `filter(x => !x.band)` に分け、両者を同じ述語の補集合として導出する（deploy-layout の `dagGroups` / `jobBandGroups`）。
- **id を保ったまま container を移す**: エッジは container id で端点解決するため、再配置で id を変えなければ帯越しエッジは自動的に生き残る（deploy ghost edge）。
- **配置ロジックを 1 箇所に集約**: 主構造の行も別グループも同じ配置ヘルパー（`placeGroupBlock`）を通すことで、wrap / grid 規則の drift を防ぐ（[TPL-20260519-02] と同趣旨）。

## 関連テスト

- `packages/core/src/renderer/deploy-layout.test.ts` › `layoutDeploy job band (#1738)`（帯配置・全ユニット一度・帯越しエッジ・退化ケース）
- `packages/core/src/view/deploy-view-extract.test.ts` › `job band classification (#1738)`（job-only 判定の相補性）
- `packages/core/src/renderer/deploy-renderer.test.ts` › `job band (#1738)`（帯ラッパー描画・非該当時の不在）
