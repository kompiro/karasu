---
id: ADR-2036
title: boundary をスコープ内に宣言する — 「層ごとの関心事」としての boundary 再定義
status: accepted
date: 2026-07-27
topic: parser
depends_on: [ADR-1974, ADR-1983]
related_to: [ADR-927, ADR-1820, ADR-1827, ADR-1858, ADR-1884, ADR-2076, ADR-19]
scope:
  packages: [core]
  concerns: []
assumptions:
  - "symbol: packages/core/src/types/ast.ts :: boundaryScopeKey"
  - "symbol: packages/core/src/types/ast.ts :: scopedBoundaryGroupId"
  - "symbol: packages/core/src/types/ast.ts :: displayGroupId"
  - "symbol: packages/core/src/parser/parser.ts :: BOUNDARY_HOST_KIND"
  - "symbol: packages/core/src/renderer/group-labels.ts :: buildGroupLabelIndex"
  - "file: packages/core/src/renderer/scoped-boundary-render.test.ts"
  - "file: examples/en/feature-samples/scoped-boundary.krs"
---

# ADR-2036: boundary をスコープ内に宣言する — 「層ごとの関心事」としての boundary 再定義

- **日付**: 2026-07-27
- **ステータス**: 決定済み
- **関連**:
  - Issue: [#2036](https://github.com/kompiro/karasu/issues/2036)（parent [#1822](https://github.com/kompiro/karasu/issues/1822) comprehension）。顕在化元 [#1983](https://github.com/kompiro/karasu/issues/1983) / [#2034](https://github.com/kompiro/karasu/pull/2034)。実利用エビデンス [#2079](https://github.com/kompiro/karasu/issues/2079)（hato 21 domains / 215 usecases の人間工学報告）
  - 実装 PR: [#2128](https://github.com/kompiro/karasu/pull/2128)（slice A — 文法 + `scopedBoundaryIndex`）、[#2132](https://github.com/kompiro/karasu/pull/2132)（slice B — 描画）、[#2145](https://github.com/kompiro/karasu/pull/2145)（slice C — per-scope identity / collapse 独立 + spec / examples / AT）。設計 PR [#2058](https://github.com/kompiro/karasu/pull/2058)、前提 [#2133](https://github.com/kompiro/karasu/issues/2133) / [#2137](https://github.com/kompiro/karasu/pull/2137)（frame label 表示 — collapse 決定の依存）
  - ADR: [ADR-1974](1974-boundary-declaration-syntax.md)（P2b `boundary` / `contains` 構文の母体）、[ADR-1983](1983-boundary-drilldown-grouping.md)(per-view 交差 — スコープ形はこの上に乗る。「per-level axis」却下・「nested boundary」deferred の当事者)、[ADR-1884](1884-group-by-team-multi-system-root-per-system-frames.md)（top-level 形の collapse-everywhere 先例 — スコープ形は対照的に独立 collapse）、[ADR-927](927-import-system-nested.md)（層またぎ同 id の正当性）、[ADR-1858](1858-system-view-group-by-team.md)（`namespace` 語彙却下）、[ADR-1820](1820-notation-promotion-gate.md)（promotion gate — experimental 据え置き）、[ADR-1827](1827-permalink-deep-element.md)（permalink deep anchor = leaf id、不変）、[ADR-2076](2076-formatter-top-level-exhaustiveness.md)（fmt 網羅性 — 前提修正）
  - AT: [2036-scoped-boundary-declaration.md](../acceptance/2036-scoped-boundary-declaration.md)
  - TPL: [TPL-20260512-01](../test-perspectives/TPL-20260512-01-composite-key-must-cover-all-distinguishing-dimensions.md)（scoped index / group id は (scope, id) でキー — 本件の中核観点）、[TPL-20260716-02](../test-perspectives/TPL-20260716-02-view-state-gate-parity-across-surfaces.md)、[TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md)、[TPL-20260510-02](../test-perspectives/TPL-20260510-02-round-trip-guarantee.md)（ネスト構文の fmt round-trip）、[TPL-20260718-02](../test-perspectives/TPL-20260718-02-reference-existence-validated-on-merged-space.md)（scoped 診断の merged-space 再導出 — slice A の再発事例）
  - spec: `docs/spec/syntax.md` §「Grouping the system view (`boundary`)」/「Scoped declaration」
  - 昇格元: `docs/design/scoped-boundary-declaration.md`（本 PR で削除。詳細な分析・代替案・実測は設計 PR [#2058](https://github.com/kompiro/karasu/pull/2058) の履歴で追える）

## 背景

[#2036](https://github.com/kompiro/karasu/issues/2036) の当初報告は「`contains <id>` の bare-id 解決が、層をまたいで同 id を持つ複数ノードを黙って 1 つの boundary に取り込む」という曖昧性だった。課題認識は三段階で変遷した: (1) id 衝突が bug → 衝突は正当（[ADR-927](927-import-system-nested.md)）、(2) 参照サイトの修飾記法（`contains Checkout.Payment`）が無いことが課題 → 修飾は宣言サイトの表現力不足の代償、(3) **boundary の定義が曖昧なことが課題** — boundary を「層ごとの関心事」と定義し直し、**宣言をその層のスコープに置ける**ようにすれば、メンバは兄弟（error 一意）しか指さず、曖昧性は構造的に消える。

独立の経路から [#2079](https://github.com/kompiro/karasu/issues/2079)（実モデル hato での人間工学報告）が同じ 2 症状 — top-level 宣言の locality 欠如、`contains` bare-id 解決による事実上の global id 一意性圧力 — を報告しており、correctness 側と人間工学側の観測が同じ設計に収束した。

## 決定

**`boundary` ブロックをノードブロックの中に宣言できるようにし、スコープ宣言の identity を（宣言スコープ, id）とする。**

1. **配置**: 自身のキャンバスを持つ kind（`system` / `service` / `domain` / `usecase` / `database` / `queue` / `storage`）の中に置ける。キャンバスを持たない kind では error `boundary-not-in-context`。受理集合は `BOUNDARY_HOST_KIND` が全 kind 列挙で確定する。
2. **メンバは宣言ノードの直下の子のみ**を bare id で指す。兄弟 id は `duplicate-node-id-parent`（error）で既に一意なので曖昧性が発生しない。孫は不可 — 孫の親のブロックに書く。cross-file 参照は原理的に生じない。
3. **identity = 宣言スコープ + id**。membership は `scopedBoundaryIndex`（`Map<boundaryScopeKey(scopePath), Map<childId, boundaryId>>`）、描画上の group identity は `scopedBoundaryGroupId`（scope path + id の injective JSON エンコード）が担い、別スコープの同名 boundary は**フレーム・label・collapse 状態が独立**する。表示（frame title fallback・collapse stub）は `displayGroupId` が bare id に戻す。同一スコープ内の同 id 再宣言は error `duplicate-boundary-id`。
4. **修飾記法（FQCN / 最小接尾辞パス）は導入しない** — 案 S によって解くべき曖昧性が消えるため。
5. **top-level 形は挙動不変で存続**（system view トップ階層スコープの記法）。kind・レベル無制限、cross-file、per-view 断片化（[ADR-1983](1983-boundary-drilldown-grouping.md)）、1 宣言 = 1 identity の collapse-everywhere（[ADR-1884](1884-group-by-team-multi-system-root-per-system-frames.md) と同型）を維持。
6. `boundary` は **experimental のまま据え置き**（[ADR-1820](1820-notation-promotion-gate.md)）。

## 理由

- **曖昧性の除去を「診断の追加」でなく「書けなくする」形で達成する** — メンバ候補が兄弟に限定されるため、#2036 の多重取り込みも cross-depth 断片化も構造的に発生不能になる。
- **宣言位置と意味の一致** — 「この層の関心事」を「この層のブロック」に書く。#2079 が求めた inline sub-grouping が新語彙ゼロで得られる（既存ブロックを置ける場所が増えるだけ。構文表面積は修飾記法案より純減方向）。
- **identity を（scope, id）にしても壊れるものが無いことを機構ごとに検証済み** — permalink（boundary はアンカー名前空間に不参加、[ADR-1827](1827-permalink-deep-element.md)）、style（boundary セレクタ不在）、collapse（`groupStubId` の scope 引数 + scope-qualified group id）。キーのエンコードは `boundaryScopeKey` / `scopedBoundaryGroupId` に一元化し injective（separator join は quoted id で衝突しうる — [TPL-20260512-01](../test-perspectives/TPL-20260512-01-composite-key-must-cover-all-distinguishing-dimensions.md)）。
- **collapse 独立の順序制約**: group id のスコープ修飾は frame title に露出しうるため、[#2133](https://github.com/kompiro/karasu/issues/2133)（frame は宣言 `label` を表示、fallback は display id）を先行させてから確定した。
- **ノードの identity は不変** — スコープ付きになるのは boundary の identity だけで、bare-id 参照・permalink deep anchor は触らない。

## 却下した案

- **案 Q: membership 参照の修飾記法**（前版 design doc `node-reference-qualification.md` の主軸）— 案 S でメンバ候補が兄弟だけになり、解くべき曖昧性が存在しなくなる。問題が無いところに構文表面積を足さない（[ADR-1820](1820-notation-promotion-gate.md)）。
- **案 N: 現状維持** — 「この service 内の domain 群」を表現する手段が無いままで、#2036 の多重取り込みも残る。
- **hard global id 一意性 / identity の path 化 / `namespace` 語彙** — それぞれ [ADR-927](927-import-system-nested.md) / [ADR-1827](1827-permalink-deep-element.md) / [ADR-1858](1858-system-view-group-by-team.md) の既決に反する。本件はノード id を修飾しない。
- **同名 boundary の collapse 共有（#1884 準拠）** — slice B 時点の暫定挙動。team は 1 宣言が system をまたぐ（同一 identity）のに対し、スコープ boundary は**別々の宣言**であり、identity 規則（scope + id）に従い独立 collapse を採った（design doc の AT 期待どおり）。

## 決めないこと（意図的な未決）

- **タイポ検出**（同名 boundary の typo が黙って別 boundary になる）— 後方互換に warning を後付けできる。[#2065](https://github.com/kompiro/karasu/issues/2065) のタグ機構が吸収しうる。
- **「同名 = 同じ関心事」の意味論** — 現時点でどの挙動もこれに依存しない。concern overview / タイポ検出の導入時に決める。
- **top-level 形とスコープ形の最終統合**（top-level をスコープ規則に揃える破壊的変更）— experimental の余地として保留。
- **`owns`（team 軸）への同種適用** — [#2088](https://github.com/kompiro/karasu/issues/2088)。org は system ツリー外の横断オーバーレイでスコープ概念が効かない。
- **横断的関心事（PCI 等）の表現** — [#2065](https://github.com/kompiro/karasu/issues/2065)（tag の領分）。
