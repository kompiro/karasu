---
id: TPL-20260716-01
title: "view-state オプションの適用範囲制限（gate）は全 render surface で同一条件に揃える"
status: active
date: 2026-07-16
applicable_to:
  - "view-state オプション（groupBy / collapsedCategories / collapsedGroups / expandedContainers など）の適用範囲を制限する gate を導入・変更・撤去するとき"
  - "render surface（interactive compile、静的 export / bundle、diff、entity view、LSP プレビューなど）を追加して既存 view-state オプションを受けるとき"
  - "spec に「この機能は view / レベル X でのみ効く」という適用範囲を明文化するとき"
known_consumers:
  - group-by-axis
  - layer-toggles
discovered_from:
  - issue: "#1983"
  - root_cause_file: "packages/core/src/renderer/drill-down-svg.ts:133"
related_to:
  - TPL-20260510-11
  - TPL-20260510-06
topic: renderer
scope:
  packages:
    - core
    - app
---

# TPL-20260716-01: view-state オプションの適用範囲制限（gate）は全 render surface で同一条件に揃える

## 観点

[TPL-20260510-11]（parallel-function-parity）は「新しいオプションを全 call site に**通す**」
方向の漏れ（通し漏れで機能が黙って落ちる）を守る。本観点はその**逆方向**:
オプションの適用範囲を**制限する** gate を一部の render surface にだけ入れると、
gate の無い surface では制限されていない挙動が生き残り、**undocumented のまま出荷される**。

spec が「view X でのみ効く」と適用範囲を約束するとき、その約束は
「効く側の surface で効く」と「効かない側の surface で効かない」の**両方**を含む。
gate の配置が surface 間で非対称だと、spec・gate 済み surface・gate 漏れ surface の
三者が食い違い、後から「仕様化して認める」か「挙動を撤回する」かの判断を迫られる。

発見事例（#1983）: `groupBy` の「root system-view level のみ」制限（#1879）は
静的 export surface（`buildDrillDownSvg` / `buildAllLayersSvg` — `drill-down-svg.ts:133`、
`all-layers-svg.ts:254`）にのみ gate として入り、interactive の `compile()` + `viewPath`
経路には最初から存在しなかった。その結果、spec（`docs/spec/syntax.md` § Grouping the
system view）は「system-view top tier のみ効く」と約束したが、interactive preview の
drill-down ビューでは boundary / team のフレームと collapse が動作しており、
surface 間で挙動が割れたまま誰も気づかなかった。

## 想定される失敗モード

- spec が「効かない」と書く文脈で機能が動いている（またはその逆）— ユーザーの観測と
  ドキュメントが一致しない
- 挙動が surface によって割れているのに、テストが片方の surface（典型的には gate を
  入れた側）しか assert しておらず、乖離が検出されない
- 「制限したつもり」の挙動が別経路から観測され続け、後続の設計（診断の発火条件、
  spec の文言）が誤った前提の上に積まれる
- 制限を緩和・撤去するとき、gate の複製が別 surface に残って片方だけ緩む（逆向きの再発）

## チェックリスト

view-state オプションに適用範囲の制限を導入・変更・撤去するとき:

- [ ] そのオプションが届く**全経路**を列挙したか（オプション名で repo-wide grep し、
      interactive compile / 静的 bundle・export / diff / 特殊 view の各 surface を確認）
- [ ] gate の判定は共有ヘルパ・単一地点に置いたか（surface ごとに gate を複製すると、
      surface 追加時・撤去時に漏れる）
- [ ] spec に書いた適用範囲と全経路の実挙動が一致することを、**効く側と効かない側の両方**で
      assert するテストがあるか
- [ ] 制限の緩和・撤去でも同じ全経路リストを再訪したか（片側だけ緩めない）

## 既知の対処パターン

- 適用可否の判定を pure 関数に切り出し、全 surface がそれを呼ぶ（#1983 の事例では
  `legendScopeForLogicalSlice` の転用で「判定の共有」はできていたが、そもそも gate を
  置く場所が export 側だけで「適用の網羅」が漏れた — 判定の共有と適用の網羅は別物）
- 「オプション × surface」のマトリクスを列挙するメタテスト（[TPL-20260510-06] が
  display-mode / locale で行う全描画面横断チェックと同型。軸が mode ではなく
  「制限付きオプション」になったもの）

## 関連テスト

- `packages/core/src/renderer/group-by-boundary-render.test.ts` — boundary 軸が「効く側」の柵。
  「効かない側 / 全 surface 一致」の柵は #1983 実装（正規化）で追加予定
  （`docs/design/boundary-drilldown-grouping.md` テスト計画を参照）

## 派生元 spec

- `docs/spec/syntax.md` § Grouping the system view (`boundary`) — 同節の適用範囲規定
  （「grouping takes visible effect only on nodes that render at the grouped level」）と
  interactive 実装の乖離を #1983 の design 調査（compile probe）で検出したことから起票した
  proactive TPL。#1983 実装 PR が同節を改訂する際に `> Related TPLs:` で本 TPL を back-ref する
