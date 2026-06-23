---
id: TPL-20260623-02
title: "cross-reference 検証の valid-target set は spec が許す全 kind を列挙し、重複する集合は同期させる"
status: active
date: 2026-06-23
applicable_to:
  - "`realizes` / `owns` / `handles` など他ノードの id を指す参照の解決可否を判定する valid-target set を構築するとき"
  - "新しい論理ノード kind（client / 将来の kind）を first-class node に追加するとき"
  - "同じ参照関係について parser と resolver が別々に valid-id 集合を持つとき（INDEXED_KINDS と detector が二重管理）"
discovered_from:
  - issue: "#1720"
  - root_cause_file: "packages/core/src/resolver/warnings.ts"
related_to:
  - TPL-20260510-10
  - TPL-20260511-02
topic: resolver
scope:
  packages:
    - core
---

# TPL-20260623-02: cross-reference 検証の valid-target set は spec が許す全 kind を列挙し、重複する集合は同期させる

## 観点

`unresolved-realizes` / `invalid-owns` のような cross-reference 検証は、「参照先 id が valid なノードか」を
**列挙した kind の集合（valid-target set）** で判定する。この集合に spec が許すはずの kind が 1 つでも抜けていると、
**正当な参照が false-positive warning になる**。[TPL-20260510-10](TPL-20260510-10-cross-reference-validation.md) は
「参照プロパティを追加したら validator を付ける」という観点だが、本 TPL はその逆 ——
**既存の validator が target kind を取りこぼす**失敗モードを扱う。

さらに karasu では同じ参照関係について解決集合が **複数箇所に重複** している:

- `detectUnresolvedRealizes`（resolver）の `validIds`
- `detectInvalidOwns`（resolver）の `validIds`
- parser `buildNodePathIndex` の `INDEXED_KINDS`（`owns-target-not-found` 用）

これらは互いに独立した列挙であり、共有の source-of-truth が無い。新しい論理 kind を first-class node に
追加したとき、**一部の集合だけ更新して残りを忘れる**と、resolver は通すのに parser が warn する（あるいはその逆）
という非対称が生じる。#1720 では `client` が 3 集合すべてから抜けており、図は描けるのに 3 種類の warning が出ていた。

## 想定される失敗モード

- **図は正しく描けるのに warning だけ出る** — レンダラ（deploy-view-extract / org-renderer）は id でグルーピングするので
  valid-target set と独立に描画してしまい、検証だけが実態に追従していない不整合に気づきにくい
- ユーザーは warning を消すために正当なモデリング（`realizes Web` / `owns Web`）を削るしかなくなる（hato ドッグフーディングで実発生）
- parser と resolver で valid-id 集合がずれ、「resolver は OK だが parser が warn」のような切り分け困難な非対称が出る
- 新 kind 追加時、片方の集合だけ更新して回帰テストが kind 網羅していないと、抜けがすり抜ける

## チェックリスト

valid-target set を構築・変更するとき、以下を確認する:

- [ ] valid-target set が **spec（`docs/spec/syntax.md`）が realize / owns 可能と定める全 kind** を列挙しているか（service / domain / client / infra …）。subset で済ませていないか
- [ ] 同じ参照関係について **複数箇所に valid-id 集合がある**なら、すべてに同じ kind を加えたか（resolver の各 detector + parser の `INDEXED_KINDS`）。理想は共通ヘルパ化して列挙を 1 箇所にする
- [ ] **system 内に nest した kind** と **top-level 宣言（`file.clients` 等）** の両方を集合に入れたか
- [ ] 反対方向のテスト（**正当な参照に warning が出ない**）を、追加した kind について parser・resolver の両レイヤーで入れたか
- [ ] レンダラが既に id ベースで描いている場合、検証を実態（描画される＝有効）に合わせたか。逆にレンダラを検証に合わせて描画を削る後退をしていないか

## 既知の対処パターン

- 新しい論理ノード kind を first-class node にする PR では、`grep -n "service" packages/core/src/resolver/warnings.ts packages/core/src/parser/parser.ts` 等で **既存 kind が列挙されている全箇所**を洗い出し、同じ場所すべてに新 kind を加える
- 将来的には valid-target kind の列挙を `LOGICAL_REALIZE_TARGET_KINDS` のような共通定数に集約し、parser / resolver が同じ定数を参照する形にすると同期忘れを構造的に防げる
- 回帰テストは kind を網羅する（service だけでなく client / domain / infra それぞれの positive ケース）

## 派生元 spec

- `docs/spec/syntax.md` / `docs/spec/syntax.ja.md` — §Writing physical diagrams（`realizes` の対象 kind）, §team node（`owns` の対象 kind）
- 関連決定: [ADR-20260623-02](../adr/20260623-02-client-realize-owns-target.md)（client を realizes / owns の valid-target に追加）

## 関連テスト

- `packages/core/src/resolver/warnings.test.ts`（`unresolved-realizes` / `invalid-owns` の client positive ケース）
- `packages/core/src/parser/parser.test.ts`（`owns-target-not-found` の client positive ケース）
