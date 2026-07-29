---
id: TPL-20260729-01
title: "宣言された多重所属を派生 index で捨てない — 単一値しか扱えないビューの都合は view 側で解決する"
status: active
date: 2026-07-29
applicable_to:
  - "宣言（所属・オーナーシップ・分類）を parse 時に派生 index（`Map<id, X>`）へ畳み込む機能"
  - "ある 1 つのビューが単一値を要求する（枠 1 つ・stub 1 つ・レーン 1 本）ために、モデル側の多値性を落としたくなる設計"
known_consumers:
  - boundary-axis
  - team-axis
discovered_from:
  - issue: "#2161"
  - root_cause_adr: "ADR-1974"
  - root_cause_file: "packages/core/src/parser/parser.ts:buildBoundaryIndex"
related_to:
  - TPL-20260510-08
  - TPL-20260510-05
  - TPL-20260610-01
  - TPL-20260514-08
topic: core-concepts
scope:
  packages:
    - core
---

# TPL-20260729-01: 宣言された多重所属を派生 index で捨てない — 単一値しか扱えないビューの都合は view 側で解決する

## 観点

`.krs` に書かれた宣言を parse 時に `Map<nodeId, groupId>` のような**派生 index** に畳み込むとき、下流の 1 つのビューが単一値しか扱えないことを理由に、**2 件目以降の宣言を index に載せない**実装をしがちである。これはレイヤ違反であり、**その事実はどのビューからも復元できなくなる**。

- モデル層の index は**宣言された事実を全量保持**する（多値なら多値のまま）。
- 「枠は 1 つ」「stub は 1 つ」「レーンは 1 本」といった**単一値要件はビューの制約**であり、ビュー側の解決（primary の選択・重なりの描画・集約）として表現する。
- 捨てるのではなく**選ぶ**。選んだ結果はビューのコードから読み取れ、他のビューは同じ元データから別の解決ができる。

判定は 1 つ: **その index を作る関数が、入力に書かれていた事実のうち出力に現れないものを持つか**。持つなら、その事実を必要とする別の消費者（詳細パネル・legend・export・監査・将来のビュー）が構造的に作れない。

karasu では `boundaryIndex`（`buildBoundaryIndex`）が実例である。[ADR-1974](../adr/1974-boundary-declaration-syntax.md) が記録した 1:1 の根拠は「開閉フレームの識別子は 1 ノード 1 値」= banded view の**配置**要件だったが、実装は所属そのものを 1 値に切り詰め、2 件目以降を `info` 診断に出すだけで捨てていた（[#2161](https://github.com/kompiro/karasu/issues/2161)）。`ownerIndex`（team 軸）も同じ形をしている。

## 想定される失敗モード

- **事実の消失**: 宣言が受理され、診断も出ず（または info だけ出て）、しかしどのビューにもその宣言の効果が現れない。[TPL-20260610-01](TPL-20260610-01-accepted-vocabulary-must-have-effect.md) の「受理・無効果」状態に落ちる。
- **群そのものの消失**: 群 B のメンバーが全員先行する群 A に取られると、B が派生 index に 1 件も現れず、**群の並び（`declaredGroupOrder` 等）を index から導いている**下流で B が存在しないものとして扱われ、枠もラベルも出ない。
- **診断の register ずれ**: 「A を採用し B を捨てた」というビューの解決結果を、モデル層の診断として述べてしまう。多値が正常状態になった瞬間に文言が嘘になる（[TPL-20260514-08](TPL-20260514-08-diagnostic-register-fact-vs-style.md)）。
- **merge での再発**: multi-file / diff の merge が「最初に見たものを保つ」で書かれていると、単一ファイルで直しても**ファイル横断で同じ切り詰めが復活**する。
- **並行 SoT**: 全量 index と 1:1 index を両方フィールドに持ち、片方だけ更新されて drift する（[TPL-20260510-08](TPL-20260510-08-derived-state-staleness.md)）。

## チェックリスト

宣言 → 派生 index → ビュー の経路を新設・変更するとき:

- [ ] index を作る関数が、**入力に書かれた事実をすべて出力に載せている**ことをテストする（同一要素に N 件宣言 → 出力に N 件）。
- [ ] 単一値が要る箇所は、index ではなく**ビュー側の 1 つの純関数**（primary の選択など）に閉じている。1:1 マップをフィールドとして併存させていない。
- [ ] **merge 経路すべて**（multi-file import / diff / scope 合成）が同じ多値の意味論に従うことをテストする。「最初に見たものを保つ」が残っていないか grep する。
- [ ] 群・カテゴリの**並びや存在判定を派生 index の値集合から導いていない**（全メンバーが他群と共有の群が消えないこと）。
- [ ] 診断の文言が**モデルの事実だけ**を述べ、ビューの解決規則（どれを primary にするか）を含んでいない。解決規則は spec に書く。

## 既知の対処パターン

- **index は多値、primary は純関数**: `Map<id, string[]>` を SoT にし、`primaryOf(ids) => ids[0]` のような 1 関数だけがビューの単一値要件を吸収する。並行フィールドを作らない。
- **並びは宣言から、所属は index から**: 群の並び・存在は宣言リスト（AST）から導き、メンバー解決だけを index に任せる。index が空の群でも存在は保てる。
- **merge の述語を 1 箇所に集約**: 和集合か上書きかの選択を merge ヘルパー 1 つに閉じ、import-resolver / diff / scope 合成がそれを共有する。

## 関連テスト

- （未確立 — [#2161](https://github.com/kompiro/karasu/issues/2161) slice A で `packages/core/src/parser/parser.test.ts` の boundary membership suite と merge 経路のテストを追加する）

## 派生元 spec

- `docs/spec/syntax.md` §「Grouping the system view (`boundary`)」 — 所属の多値性と banded view の解決規則。
- 設計: `docs/design/boundary-membership-1n.md`（[#2161](https://github.com/kompiro/karasu/issues/2161)）、[ADR-1974](../adr/1974-boundary-declaration-syntax.md) 決定 2 の refine 対象。
