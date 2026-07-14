---
id: TPL-20260714-01
title: "cross-domain entity 関連は限定子付き `DomainId.EntityId` で参照し、bare id は intra-domain 専用であることを検証する"
status: active
date: 2026-07-14
applicable_to:
  - "entity view（`extractEntityView`）の関連解決を追加・変更するとき"
  - "cross-domain の entity 参照（ghost entity）を扱うコードを追加・変更するとき"
  - "entity 関連の解決規則（bare id / 限定子付き）に関わる spec を改訂するとき"
known_consumers:
  - view-extract
  - layout
discovered_from:
  - root_cause_file: "docs/spec/syntax.md"
  - root_cause_adr: "docs/design/cross-domain-ghost-entities.md"
related_to:
  - TPL-20260630-01
topic: edges
scope:
  packages:
    - core
---

# TPL-20260714-01: cross-domain entity 関連は限定子付き `DomainId.EntityId`、bare id は intra-domain 専用

## 観点

entity view の関連 edge のターゲット解決は **スコープで分岐する**。この分岐が崩れると、
関連が黙って消える／誤った相手を指す。

- **bare id**（`Order -> LineItem`）は **intra-domain 専用**。同一ドメインのローカル
  entity に一致しなければ **ドロップ**する（cross-domain へ勝手に解決してはならない）。
- **cross-domain** 参照は **限定子付き `DomainId.EntityId`**（`Order -> Customers.Customer`）。
  限定子付きのときだけ foreign entity を ghost として surface する。

なぜ限定子必須か: **entity id は warning 級一意性しかない**（`entity-anchor-collision`。
domain id の error 級一意性とは異なる）。bare id では foreign entity を一意特定できない。
`DomainId` は system 内で error 級に一意なので `DomainId.EntityId` は曖昧性なく解決できる。

## 失敗パターン

1. **bare id を cross-domain に解決してしまう** — `Order -> Customer`（別ドメインの
   Customer）を勝手に ghost 化する。同名 entity が複数ドメインにあると誤った相手を指す。
2. **限定子付き参照を取りこぼす** — `Order -> Customers.Customer` を intra として扱い、
   ローカルに一致せずドロップ → cross-domain 関連が entity view から消える。
3. **endpoint キーの不整合** — ghost node を bare id で、ghost edge の endpoint を
   限定子キーで置くなど、layout のキーがずれて edge が描画されない（ghost node は
   `DomainId.EntityId` キー、edge の foreign endpoint も同キー、local endpoint は bare、で揃える）。
4. **resource dot-notation を誤って ghost 化** — `Order -> OrderDB.orders`（infra 参照）の
   `OrderDB` を domain と誤解して ghost 化する。domain index で解決できないものはドロップする。

## 検証の指針

- outgoing `D1 の entity -> D2.Foreign` → Foreign が `ghostEntities`（キー `D2.Foreign`）、
  `childNodes` に無い、edge が `ghostEntityEdges` に正規化されて入る。
- incoming `D2.x -> D1.local` → x が ghost、edge が正規化される。
- 同一 foreign を両方向で参照 → ghost は 1 つに dedup、edge は両方残る。
- bare の cross-domain 参照 → ドロップ（ghost 化しない）。
- 限定子付きでも resource / 未定義ターゲット → ドロップ。
- 限定子付きの自ドメイン参照（`Order -> ThisDomain.LocalEntity`）→ intra として bare に正規化。

## 派生元 spec

- [`docs/spec/syntax.md`](../spec/syntax.md) § `entity` declaration →「Intra- vs
  cross-domain targets — bare id vs `DomainId.EntityId`」節（本 TPL への back-ref あり）。
- 設計経緯: [`docs/design/cross-domain-ghost-entities.md`](../design/cross-domain-ghost-entities.md)
  （ADR 昇格後は対応 ADR に差し替え）。
