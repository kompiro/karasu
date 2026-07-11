---
id: ADR-20260711-03
title: system view を team（owns）軸でグループ化し、折り畳み可能な境界フレームで密度を下げる
status: accepted
date: 2026-07-11
topic: renderer
related_to: [ADR-20260623-06, ADR-20260630-02]
scope:
  concerns: []
---

# ADR-20260711-03: system view を team（owns）軸でグループ化し、折り畳み可能な境界フレームで密度を下げる

- **日付**: 2026-07-11
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#1858](https://github.com/kompiro/karasu/issues/1858)（親 epic [#1817](https://github.com/kompiro/karasu/issues/1817) comprehension）
  - 実装 PR: #1860（P2a-A レイアウト）/ #1861（P2a-C セレクタ）/ #1865（P2a-B core collapse）/ #1869（P2a-B app controls）
  - 設計: `docs/design/system-view-grouping.md`（P2b/P2c は同 doc に継続）
  - 関連: [ADR-20260623-06](20260623-06-system-view-infra-external-tier-split.md)（kind ティア分割 — 既定ビューでは不変）, [ADR-20260630-02](20260630-02-layer-toggles.md)（#1821 category collapse — 本 ADR が machinery を共有）
  - notation promotion gate: [#1820](https://github.com/kompiro/karasu/issues/1820) / P2c: [#1859](https://github.com/kompiro/karasu/issues/1859)
  - フォローアップ: #1872 / #1873 / #1874 / #1875 / #1876
  - TPL: [TPL-20260624-02](../test-perspectives/TPL-20260624-02-relayout-into-group-preserves-placement-and-edges.md)（要素を別グループへ再配置 → 全要素ちょうど一度配置 + 参照エッジ端点保持）
  - コード: `packages/core/src/renderer/group-layout.ts` / `group-collapse.ts` / `layout.ts` / `svg-renderer.ts`、`packages/app`（`useSystemView` ほか）

## 背景

comprehension 柱（#1817）が特定した壁は「**system view の要素過多で読めない**」こと。drill-down は縦（浅い↔深い）を、#1821 layer toggle は kind カテゴリ（external/infra）の折り畳みを解くが、密集の本体である **service 層**にはどちらも効かない（組み込みタグで service に付くのは `[external]` のみ）。

「意味的なまとまりで囲んで畳む」ことが次の一手だが、その前提となる仮説 —「**入れ物を作ると読みやすくなるのか**」— が未検証だった。`docs/design/system-view-grouping.md` はこの仮説を、構文・語彙を決める前に検証する優先順位で進めた（P1: 検証 → P2: 宣言機構 → P3: 語彙）。

## 決定

system view に **view-mode の「Group by: team」** を実装する。所有チーム（`organization`/`owns` の `ownerIndex`）でノードを束ね、チームを依存順（min feedback-arc-set）に並べた**境界フレーム**で囲み、フレーム単位で **⊖/⊕ 折り畳み**する。**`.krs` 文法変更ゼロ**（`ownerIndex` を軸に使う）。宣言構文（P2b `group`/`boundary`）とルーティング磨き込み（P2c, #1859）は本 ADR の範囲外とし、design doc で継続する。

確定した具体方針（P1 レビュー 2026-07-11）:

1. **メンバー範囲 = 全ノード種**（著者意図優先）。group 宣言されたノードは kind を問わず枠内。Group by ビュー内では **group 所属 > category（kind/tag）**、非所属の infra/external だけ従来 tier 帯に残る。既定ビュー（Group by: なし）の tier 体系（ADR-20260623-06）は不変 — override は view-mode 局所。
2. **全体フローの保存**: team バンドは service tier の位置に収め、user → client は上、（未所有 service→）infra → external は下。grouping しても縦フローが崩れない。
3. **共存 = 排他**（Group by セレクタ: なし / team / （将来）group）。枠の重なりを構造的に排除。#1821 layer toggle は直交機構として共存。
4. **既定は常に展開**。全折り畳み（group DAG ビュー）へは「すべて畳む」で到達（bulk 操作は #1872 で追加）。
5. **順序** = min feedback-arc-set。group 数 ≤ 8 は全探索、超は greedy（Eades–Lin–Smyth）、同点は宣言順（決定的・著者制御可）。
6. **折り畳み時のエッジ**は stub に**再ターゲット**（category collapse の drop と異なる）。intra-group は drop、stub エッジは dedup。retarget されたエッジのみ dedup し、展開ノード間の authored parallel edge / self-loop は保持する。

## 理由

- **仮説は「述べられた形のまま」では偽だった**（P1 計測、20 service/5 team の合成モデル）。枠を描いてグループ配置にするだけでは canvas 51%・交差は残存で利得が薄い。**読みやすさを生むのは折り畳み**（全折り畳みで canvas 31%・service 段 20→11・交差 21）。よって「枠は折り畳みを可能にするアフォーダンス」と位置づけ、collapse を機能の核にした。
- **owns 軸なら文法変更ゼロで即出せる**。`ownerIndex` は 1:1・precedence 解決済み・ファイル横断で、開閉に必要な**単一値**の所属を既に満たす。タグは多値で開閉識別子に不適だった。組織情報は既に system view の service カードに team バッジとして描画済みで、枠は新たな越境ではなく既存情報の強い視覚化。
- **既存機構の再利用で de-risk**: 描画・折り畳みは #1821 の `krs-cat-*` / on-SVG affordance / app 5-hop 配線を踏襲。TPL-20260624-02（全要素ちょうど一度配置 + 端点保持）を回帰の柵にした。
- **notation gate 整合**: 語彙・first-class 化を先に決めず experimental に留め、owns 軸で価値検証してから P2b（宣言構文）へ #1820 gate 経由で進める。

## 却下した案

- **語彙 `cluster`**: `docs/concepts.md` / `docs/spec/syntax.md` が「regions, AZs, **clusters**, nodes」を out-of-scope な物理トポロジとして名指しており衝突。コードでも `clusterByXGap`（近接クラスタリング）と二重化。統計的には cluster は *discover* するもので "Declare" と矛盾。`namespace`（識別子スコープの過剰約束）/ `partition`（全域性の過剰約束）も却下。将来語彙は P2b で #1820 gate 判断。
- **タグでメンバー表現**（`[payments]` / `[cluster: payments]`）: タグは**多値**で、開閉に必要な単一値の識別子にならない。`[cluster: value]` の `:` は `parseTags` が literal tag 化する実害もある。
- **sigil `$payments` / `<<payments>>`**: 恒久記号の新設は最も重い notation commitment。`[]` が既に karasu の stereotype 席（style specificity が CSS と一致）で二重化。`#` は identity（CSS `#id`）で意味が逆。
- **構文・語彙を先に決める**（syntax-first）: 中心仮説が未検証のまま構文を凍結する順序倒錯。検証を先に置いた（P1）。
- **折り畳みエッジを drop**（category collapse と同じ）: 全折り畳みで stub が孤立し group DAG が消える。cross-group を再ターゲットして DAG を残す。

## P2b / P2c との関係

本 ADR は **P2a（team 軸・文法変更ゼロ）**のみを確定する。`group`（あるいは `boundary`）宣言構文（P2b）と直交ルーティング・集約・hop/junction（P2c, #1859）は `docs/design/system-view-grouping.md` に検討中として残す。P2b の語彙・first-class 化は #1820 promotion gate で corpus evidence を見て判断する。
