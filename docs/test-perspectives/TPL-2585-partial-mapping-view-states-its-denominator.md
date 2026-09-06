---
id: TPL-2585
title: "部分的な写像を通した派生ビューは、写らなかった分母を同じ面で示す"
status: active
date: 2026-09-04
applicable_to:
  - "あるレベルの要素を別のレベルへ写して描く派生ビュー（`entity` 関連 → `table` 間関連、論理ノード → 物理ノード など）"
  - "写像が任意（optional）である関係を辿る集計・カバレッジ・レポート"
  - "既存の完成された図法（ER 図・クラス図・シーケンス図）に見た目が似る新しいビュー"
known_consumers:
  - view-extract
  - coverage-extract
  - renderer
discovered_from:
  - issue: "#2585"
  - root_cause_adr: "ADR-1870"
related_to:
  - TPL-1223
  - TPL-2200
  - TPL-1995
  - TPL-999
topic: core-concepts
scope:
  packages:
    - core
    - cli
---

# TPL-2585: 部分的な写像を通した派生ビューは、写らなかった分母を同じ面で示す

## 観点

karasu の論理/物理分離では、レベルをまたぐ写像の多くが**任意**である。`entity` の
`table <InfraId>.<subId>` 対応はその代表で、対応を持たない entity は欠陥ではなく正常な状態である
（read model の射影・KV backed の集約・外部 SaaS に記録がある entity・前向き設計の途中）。

この**任意の写像を辿って別レベルに要素を写す派生ビュー**を作ると、写像を持たない要素は
静かに落ちる。落ちること自体は正しい。問題は、**落ちた分が読み手に見えないまま、ビューが
完全な図に見えてしまう**ことである。

とくに危険なのは、そのビューが既存の完成された図法に**似ている**ときである。ER 図に見える
ものを見せられた読み手は「このスキーマの関連はこれで全部」と読む。実際には分母が
「写像を持つ要素」に絞られており、しかもその絞り込みはビューのどこにも書かれていない。

したがって、部分的な写像を通した派生ビューは次の 2 つを負う:

1. **落ちた分を数える経路がある**（カバレッジ／レポートに分母と欠落が出る）
2. **完全であると主張しない**（spec とビュー上の文言が、何を写し何を写さないかを名指す）

## 想定される失敗モード

- 派生ビューが「そのストアの ER 図」として読まれ、写像を持たない要素の関連が**存在しない**と
  誤読される。設計レビューや影響調査がその誤読の上で進む
- 写像の付け忘れ（機械的に修復可能な欠落）と、写像を持たないことが正しい要素（設計上の
  tableless）が同じ「出てこない」として混ざり、どちらも直せない
- 分母が絞られていることに気付かないまま、派生ビューのエッジ数を「関連の総数」として
  レポートや issue に引用する
- 元レベルで要素を直しても派生ビューが変わらず（写像が無いため）、「壊れている」と
  バグ報告される
- 後から写像を足したときに派生ビューが急に増え、変更していないはずの図が動いたように見える

## チェックリスト

任意の写像を辿る派生ビュー／レポートを追加するとき、以下を確認する:

- [ ] 写像を持たない要素の集合を**数えて出す経路**があるか（`coverage` 等。ゼロ件でも
      「分母 N のうち M が写った」が言えるか）
- [ ] 機械的に修復可能な欠落（写像の付け忘れ）と、**欠落が正しい**ケースが別々に報告されるか
      （まとめると片方の修復手段が失われる。TPL-999）
- [ ] spec に「このビューが写すもの／写さないもの」が書かれ、**完全な図であると主張していない**か
- [ ] 派生ビューが名乗る水準（何のビューか）が spec とコードで一致しているか（TPL-2200）
- [ ] 派生要素が元の semantic 区別（kind・タグ・方向）を保存しているか（TPL-510）

## 既知の対処パターン

- **カバレッジで分母を出す**: `packages/core/src/view/coverage-extract.ts` の
  `InfraCoverage.mappedByEntity` / `unmappedButReferenced` / `unreferenced` と
  `PhysicalCoverage.tablelessEntities`。とくに `TablelessEntity` は
  「Reported as a fact, never as a defect」とコード上で明記され、修復可能な欠落と
  正常な非対応を分けている
- **spec 側で lossy を明言する**: `docs/spec/syntax.md` の `entity` 節が
  「physical mapping は optional で、対応の無い entity は正当な前向き設計／ボトムアップの状態」
  と書いている。派生ビューを足すときは同じ節に「よって派生ビューには写らない」まで書く
- **ghost で境界だけ残す**: 落とすのではなく半透明のプレースホルダで存在だけ示す
  （ADR-1911 の cross-domain ghost）。分母を見せる別解

## 関連テスト

- `packages/core/src/view/coverage-extract.test.ts`（`tablelessEntities` / `unmappedButReferenced` の分離）

まだ書かれていない検証は、そのスライスと一緒に着地する（[#2585](https://github.com/kompiro/karasu/issues/2585)
スライス A の受け入れテストが、tableless entity 間の関連がストアキャンバスに出ないことを
確認する TC を持つ）。**未作成のファイルは本節に列挙しない** — 存在しない address を
指す記録は、読み直したときに壊れている記録と区別できない（TPL-2254）。

## 派生元 spec

- `docs/concepts.md` 「[No physical database schema modeling (conceptual entities *are* in scope)](../concepts.md#no-physical-database-schema-modeling-conceptual-entities-are-in-scope)」節
  （論理/物理の線と、写像が任意であること）。同節末尾に本 TPL への `> Related TPLs:` 注釈がある
- [ADR-1870](../adr/1870-domain-entity-modeling.md) 決定 3（`table` 対応は optional。対応の無い
  entity は論理的には解決するがストアエッジを導出しない）
- Design Doc `docs/design/store-scoped-er-view.md`（本 TPL を起こした設計。ADR 昇格時に削除される）
