---
id: ADR-2223
title: service ブロックに書いたエッジは、その service をノードとして描くビューに描画する
status: accepted
date: 2026-08-14
topic: edges
refines: [ADR-2075]
related_to: [ADR-1314, ADR-2184, ADR-681, ADR-1815, ADR-1955]
scope:
  packages:
    - core
assumptions:
  - "symbol: packages/core/src/view/view-extract.ts :: collectAnchoredPeerEdges"
  - "symbol: packages/core/src/view/view-extract.ts :: withChildAnchoredEdges"
  - "symbol: packages/core/src/resolver/warnings.ts :: detectEdgeEndpointsNotAtScope"
  - "grep: packages/core/src/renderer/layout.ts :: withChildAnchoredEdges"
  - "grep: docs/spec/syntax.md :: Edges inside a service block"
---

# ADR-2223: service ブロックに書いたエッジは、その service をノードとして描くビューに描画する

- **日付**: 2026-08-14
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#2223](https://github.com/kompiro/karasu/issues/2223)
  - 実装 PR: [#2459](https://github.com/kompiro/karasu/pull/2459)
  - 親 ADR: [ADR-2075](2075-edge-endpoint-scope-diagnostic.md)（宣言スコープで描画できない endpoint の診断。本 ADR はその「未解決」を閉じる）
  - 統治 ADR: [ADR-1314](1314-krs-spec-v1-freeze.md)（言語 v1.0 freeze）, [ADR-2184](2184-unassigned-domain-placement-parity.md)（同じ状態を表す配置は同じ扱いを受ける）, [ADR-681](681-top-level-service-rendering.md)（トップレベル service の描画 — `__unassigned__` 擬似 system）
  - 関連 TPL: [TPL-2075](../test-perspectives/TPL-2075-parsed-construct-renders-or-warns.md)
  - spec: `docs/spec/syntax.md` § Edge declaration — Edges inside a service block

## 背景

spec の **edge origin scope** 規則は、エッジを起点と同じブロックに置くことを正準形と
定めている。`service` ブロック内のエッジは、explicit に書くならその service 自身を
source に指さなければならず、別の source を指すと `edge-source-mismatch`（error）で
弾かれる。

ところが `service S1 { S1 -> S2 }` は **どのビューにも描画されず、診断も出なかった**。
view 抽出は描こうとしているコンテナの `container.edges` しか読まず、両端がその
コンテナの子であるものだけを残す。エッジは `S1.edges` に載るので S1 自身の canvas を
描くときにしか参照されないが、そこでの判定は「両端が S1 の子か」であり、origin scope
規則が source を `S1` に強制する以上、S1 が自分自身の子になることはない。**構造上
到達できない**エッジだった。

[ADR-2075](2075-edge-endpoint-scope-diagnostic.md) は silent drop 6 配置に診断を入れた
際、この配置だけを「描画できるようにするか、診断して spec を狭めるか」の判断ごと
#2223 に委ね、検出器は兄弟宛てを at-scope のまま扱う（過小報告側に倒す）ことにして
いた。

## 決定

**子ブロックに宣言されたエッジは、その子をノードとして描く親の canvas に描画する。
判定式は `edge-endpoint-not-at-scope` の peer 集合と同一にする。**

- 描画側 `collectAnchoredPeerEdges` は、コンテナの子に anchored なエッジのうち
  **両端がその canvas の peer であるもの**を残す。peer 集合は診断側 `peersOf` が
  数えるものと同じ（`{子の id} ∪ 宣言した親インスタンスの子`）
- 限定子付き target（`S1 -> Other.Svc`）は `withChildAnchoredEdges` が system スコープの
  エッジと同じ機構（ghost system / caller ghost / cross-system edge / ghost user）に流す
- anchored な explicit edge は、同じペアに対する暗黙 service edge の派生を抑止する
  （抑止のキーは arrow kind を含まない素のペア。描画の同一性は kind を含む）
- orphan は `__unassigned__` フレームで隣り合って描かれる（ADR-681）ので、その中の
  anchored edge も描画する。診断側 `peersOf` も、親を持たないブロックの peer を
  **その wrap 集合**（`synthesizeUnassignedSystem` から読む）に揃える
- `entity` の子は対象外。関連は entity ビューで描かれ、この canvas にノードが無い

## 理由

- **正準形が描画されないのは欠陥である**。ADR-2075 は「描画ではなく診断」を選んだが、
  それは *正準形でない綴り*（system スコープに持ち上げた domain 依存など）に対する
  判断だった。同じ関係に 2 つの綴りを与えないための却下であり、ここは逆に **spec が
  推奨する置き場所そのもの**が沈黙していた。
- **v1.0 freeze に触れない**（ADR-1314）。構文は 1 文字も変えていない。描画対象が
  増えるだけの追加的変更なので v1.x で許される。narrow（診断して spec を狭める）側は
  後方非互換な言語の狭めであり v2.0 を要した。
- **描画側と診断側を 1 つの規則の表と裏にする**。peer 集合を共有すると、片方だけ
  変えたときにテストが落ちる。TPL-2075 のチェックリスト「view 側の filter 条件を
  変更したとき、診断側の判定式も追随したか」を機械化したもので、
  `anchored-edge-render-or-warn.test.ts` が配置ごとに「描画される」か「報告される」かの
  **ちょうど一方**が成り立つことを表で縛る。
- **配置による割れを作らない**（ADR-2184）。system 配下の 2 service 間と、system を
  持たない orphan 2 つの間は同じモデリング状態なので、どちらも描画する。

## 実装上の落とし穴（レビューで判明）

- **抽出だけでは足りない**。multi-system ルートと `__unassigned__` ルートは
  `layoutMultipleSystems` を通り、そこは `ViewSlice.childEdges` ではなく各 system の
  `sys.edges` からレイアウトする。抽出を通ったエッジがレイアウト直前で再び落ちるため、
  `layout.ts` 側でも anchored edge を持ち上げる。回帰柵は**レイアウト出力**に対して
  張る（スライスに対する assert はこの落とし穴を素通りする）。
- **描画の同一性には arrow kind を含める**。素のペアで dedup すると、同じペアの
  sync と async のうち片方が黙って消える。派生エッジの抑止は「その依存が既に
  authored か」を問うので素のペアのままでよい。
- **wrap 集合に載らないブロックには peer が無い**。トップレベル `client` は
  `__unassigned__` に包まれないので、そこに anchored なエッジはどの canvas にも
  乗らない。診断側で「親を持たない」だけを条件にすると、描画されないのに報告も
  されない silent drop を新たに作る。

## 却下した案

- **診断して spec を狭める**（`edge-endpoint-not-at-scope` を service-anchored にも
  広げ、エッジは `system` か `domain` スコープに限ると spec に書く）— 後方非互換な
  言語の狭めで、ADR-1314 の freeze 規則により v2.0 待ちになる。その間、spec が正準形
  として教えている記法が使えないままになる。
- **service の canvas 側で解決する**（S1 自身のビューで S1 を疑似ノードとして描く）—
  origin scope 規則が source を自ブロックに強制する以上、S1 のビューには対向ノードが
  存在しない。描く相手がいない canvas を作ることになる。
