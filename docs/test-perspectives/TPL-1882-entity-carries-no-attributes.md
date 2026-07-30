---
id: TPL-1882
title: "`entity` は名前・関連・物理対応のみを受け付け、属性を持たせない"
status: active
date: 2026-07-11
applicable_to:
  - "`entity` ノードのパース・拡張・プロパティ追加を行うとき"
  - "`entity` に新しいプロパティ / 子宣言を足したくなったとき（型・カラム・主キー・制約など）"
  - "`translate --from db` が entity スキャフォールドを吐く出力形を決めるとき"
discovered_from:
  - root_cause_file: "docs/spec/syntax.md#entity-declaration--conceptual-domain-entities"
  - root_cause_file: "docs/concepts.md"
related_to:
  - TPL-2166
  - TPL-1720
topic: parser
scope:
  packages:
    - core
    - cli
---

# TPL-1882: `entity` は名前・関連・物理対応のみを受け付け、属性を持たせない

## 観点

`entity`（`domain` の子）は概念レベルのドメインエンティティを表す語彙で、
保持できるのは **名前・関連（edge）・物理対応（`table <Infra>.<sub>`）・
label / description** のみである。**属性（カラム・型・インデックス・
主キー・外部キー制約の定義）は持たない**。

この「属性を持たない」線は飾りではなく、DB スキーマ非目標
（[`docs/concepts.md`](../concepts.md) の「物理データベーススキーマの
モデリングはしない」節）を破らないための構造的ガードである。物理スキーマは
実装詳細（速く変わる）で、entity が表すのは集約・中核エンティティとその関連という
**ゆっくり変化する構造的事実**である。属性を 1 つでも受け入れると、
「型だけ」「主キーだけ」という隣接する誘惑への一貫した答えが崩れ、
モデルがスキーマツールへ滑り落ちる（情報が詳細化方向 = down に流れ始める —
[TPL-2166](TPL-2166-information-flows-up.md)）。

## 想定される失敗モード

- `entity` に「便利そうだから」と型・カラム・主キー等のプロパティを足す PR が出て、
  レビューで非目標との整合が問われないまま入る。以後 entity が物理スキーマの
  重複物になり、コードと二重管理になる。
- `table <Infra>.<sub>` の物理対応を「entity が属性を持ってよい」根拠と誤読し、
  カラム列挙を description に構造化して押し込む（属性の裏口導入）。
- `translate --from db` が集約畳み込みの過程で持っている **カラム情報**を
  entity 出力に混ぜて吐き、生成物経由で属性が定着する。
- entity の関連 edge に、多重度を超えて型・制約などスキーマ由来の情報を
  タグ / プロパティで載せる。

## チェックリスト

- [ ] `entity` ブロックが受け付けるのは label / description / link /
  `table <Infra>.<sub>` 物理対応 / 関連 edge のみか。型・カラム・主キー・
  制約などの属性的プロパティを **パーサが拒否**するか（新プロパティを足すなら、
  それが「ゆっくり変化する構造」側か詳細実装側かを非目標フィルタで判定したか）。
- [ ] `table` 物理対応は infra サブリソースへの **参照**（`<Infra>.<sub>`）に
  留まり、カラム列挙の受け皿になっていないか。
- [ ] `translate --from db` の entity 出力に **カラム情報が混ざっていない**か
  （出力は名前・関連・物理対応のみか）。
- [ ] 関連 edge に載せる情報が、v1 ではラベル（将来は多重度タグ）に留まり、
  型・制約などスキーマ詳細を持ち込んでいないか。

## 既知の対処パターン

- パーサテスト（`packages/core/src/parser/parser.test.ts` の
  "entity declarations" describe）で、属性なしの entity がパースされること・
  物理対応が `tableRef` に入ることを固定する。属性的プロパティを足す変更は
  ここに「拒否される」ケースを追加してからにする。
- 非目標フィルタ（[`docs/concepts.md`](../concepts.md)）を判定の一次ソースにする。
  「情報が抽象化方向（up）か詳細化方向（down）か」で切る
  （[TPL-2166](TPL-2166-information-flows-up.md)）。

## 派生元 spec

- [`docs/spec/syntax.md`](../spec/syntax.md) — 「`entity` 宣言 — conceptual domain entities」節（entity が持てるものを名前・関連・物理対応に限定し、属性を明示的に排除する規定）。破られたとき、本 TPL のチェックリストとパーサテストが検出する。
- [`docs/concepts.md`](../concepts.md) — 非目標「物理データベーススキーマのモデリングはしない（概念エンティティは目標内）」節（線引きの理由の層）。
