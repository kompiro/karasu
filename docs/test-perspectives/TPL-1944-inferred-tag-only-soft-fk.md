---
id: TPL-1944
title: "`translate --from db` は Soft FK 由来の関連にのみ `[inferred]` を付け、Explicit FK 由来は無タグ（確定）にする"
status: active
date: 2026-07-14
applicable_to:
  - "translate --from db の entity / 関連スキャフォールド生成を追加・変更するとき"
  - "システム自動付与タグ（`[inferred]` など）を新設・改訂するとき"
  - "自動付与タグの既定スタイルを追加・変更するとき"
known_consumers:
  - translate/db
  - style-resolver
  - default-style
discovered_from:
  - root_cause_file: "packages/core/src/translate/db.ts"
  - root_cause_file: "docs/spec/tags-annotations.md"
related_to:
  - TPL-510
  - TPL-1503
topic: edges
scope:
  packages:
    - core
---

# TPL-1944: `[inferred]` は Soft FK 由来の関連にのみ付き、Explicit FK 由来は無タグ

## 観点

`translate --from db` は集約をまたぐ FK リンクから entity 間の関連 edge を導出する。
このとき FK の由来（Explicit / Soft）が **確定 / 推論** の区別を担い、`[inferred]`
タグで表現される。区別が崩れると、確定した参照が「推測」に見えたり、推測が確定に
見えたりして、キュレーションの判断材料が壊れる。

- **`[inferred]` が付くのは、その関連に寄与する FK が全て Soft FK のときだけ**
  （`<stem>_id` / `<stem>_code` 列で `REFERENCES` / `FOREIGN KEY` 宣言が無いもの）。
- **Explicit FK が 1 本でも寄与すれば無タグ（確定）** にする。Explicit が勝つ。
- 畳まれた子テーブルの FK は集約ルート entity に**畳み上げてから**同じ規則で判定する
  （複数 FK が同じ target に寄与するとき、1 本でも Explicit なら確定）。
- `[inferred]` は resolver が描画時に合成する `[implicit]` 等と異なり、**translate が
  ソースに書き込んで永続する**タグ。確認後にタグ 1 個を消すと確定 edge になる。

## 失敗パターン

1. **Soft と Explicit を一律に扱う** — 全関連に `[inferred]` を付ける／全く付けない。
   確定と推論の区別が消える。
2. **畳み上げで由来を落とす** — 子テーブルの Explicit FK をルート entity に畳み上げる
   ときに `kind` を捨て、確定関連が `[inferred]` に化ける（逆も同様）。
3. **同一 target への複数 FK でタグ判定が寄与の順序に依存** — 先に見た FK の kind で
   決めてしまい、後から来た Explicit を無視して `[inferred]` のまま残す。
4. **タグが描画に効かない** — `[inferred]` を doc・出力に載せたのに `edge[inferred]`
   既定スタイルが無く、確定関連と見分けられない（[TPL-1503](TPL-1503-accepted-vocabulary-must-have-effect.md)）。
5. **線種で区別して `[async]` と衝突** — `[inferred]` を dashed にすると、推論由来の
   async 関連が「二重に dashed」で kind の区別が消える（[TPL-510](TPL-510-derivation-tag-semantics.md)）。既定スタイルは色のみにする。

## 検証の指針

- Explicit FK（`REFERENCES`）由来の関連 → `A -> B` に `[inferred]` が **付かない**。
- Soft FK（列名規約・`REFERENCES` 無し）由来の関連 → `A -> B [inferred]`。
- 同じ target に Explicit と Soft の両方が寄与 → 無タグ（Explicit が勝つ）。
- 全列 FK ジャンクションの 2 本の Explicit FK → どちらの関連も無タグ。
- 集約内の child→root FK（内部リンク）→ 関連として出力しない（自己参照も同様）。
- `edge[inferred]` 既定スタイルが色のみを設定し、`[sync]` / `[async]` の線種を
  上書きしない。

## 派生元 spec

- [`docs/spec/tags-annotations.md`](../spec/tags-annotations.md) § Automatic tags on
  edges → `[inferred]` 行および注記（本 TPL への `> Related TPLs:` back-ref あり）。
- 設計経緯: [ADR-1870](../adr/1870-domain-entity-modeling.md) §7
  「translate --from db が entity + 関連スキャフォールドを吐く」および「却下した案」
  （translate-db-entity-scaffold design doc を #1910 で本 ADR に昇格）。
