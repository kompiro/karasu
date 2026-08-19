---
id: TPL-2088
title: "ノード id を指す参照サイトは受理する記法と解決規則を全サイトで共有する"
status: active
date: 2026-08-17
applicable_to:
  - "id でノードを指すプロパティ・構文を新設、または既存のものの受理形を変更するとき"
  - "参照の解決規則（どのスコープの何に一致させるか）を実装・変更するとき"
  - "id をキーにした Map に参照の解決結果を格納するとき"
known_consumers:
  - owns
  - contains
  - realizes
  - handles
  - resource
  - entity-relation
  - edge-endpoint
  - import-path
discovered_from:
  - root_cause_adr: "ADR-927"
  - root_cause_file: "packages/core/src/parser/parser.ts"
related_to:
  - TPL-1936
  - TPL-1720
  - TPL-1503
  - TPL-1352
  - TPL-2133
  - TPL-2161
  - TPL-2221
topic: parser
scope:
  packages:
    - core
---

# TPL-2088: ノード id を指す参照サイトは受理する記法と解決規則を全サイトで共有する

## 観点

判定は 1 つ — **そのサイトが受理する id 記法は、既に存在する他の参照サイトと同一か。**

karasu には「ノードを指す」構文が多数ある（`owns` / `contains` / `realizes` / `handles` /
`resource` / entity 関連 / edge endpoint / `import`）。これらは**同じ行為**をしており、
author から見て記法が違う理由は無い。にもかかわらず、実装は property ごとに parse を
書くため、**片方が `A.B.C` を受理し片方が拒否する**状態に容易に分岐する。

- **記法は 1 つ**。`Segment(.Segment)*`（[ADR-927](../adr/927-import-system-nested.md) の
  `ImportIdPath` が原型）。新しい参照サイトを足すときに独自の形を作らない
- **解決規則も 1 つ**。karasu の既存用例はすべて「対象ノードの full path の**接尾辞**に
  一致する」で説明でき、bare id はその長さ 1 の場合である。サイトごとに
  「絶対 path」「相対 path」「bare のみ」と規則を分けない
- **parse も resolve も共有ヘルパーに閉じる**。property ごとに書けば必ず分岐する

「このサイトでは修飾する必要が無いから bare だけで足りる」は理由にならない。
必要かどうかは author のモデルが決めるものであり、**受理しないことは author の
選択肢を奪う**。

## 想定される失敗モード

- **黙って別の意味になる** — 拒否側のサイトは parse error を出しつつ**先頭セグメントだけを
  有効な参照として記録する**。`owns Shop.Checkout.Payment` は `owns Shop` に、
  `realizes Shop.Api` は `realizes Shop` に、`handles Backend.Order` は `handles Backend` に
  なる。結果として出る診断（`invalid-owns` / `contains-target-not-found`）は根本原因
  （記法が受理されていない）をどこも指していない。[[TPL-1503]] の「受理したのに
  効果が違う」の一形態
- **サイトを 1 つずつ直して残りが取り残される** — [[TPL-1720]] が記録した失敗の形。
  ADR-1720 は `client` を 3 つの集合すべてに足したが集合は 3 つのまま残り、次の kind で
  1 つ取り残された。記法も同じで、「今困っているサイトだけ」直すと分岐が 1 つ減って
  残りが温存される
- **bare id が黙って複数ノードを主張する** — 修飾手段が無いサイトでは、bare id が
  一致する全ノードに及ぶ（`ownerIndex` / `boundaryMembership` は id キーなので構造的に
  そうなる）。author には「1 つに絞る」表現が無く、図は黙って過剰な主張を描く
- **修飾を受理したのに narrowing が効かない** — 記法だけ通して索引を id キーのまま
  残すと、`A.B.C` と書いても解決先は bare と同じ集合になる。受理と効果は同じ出荷単位に
  入れる（[[TPL-1503]] / [[TPL-1352]]）
- **解決規則がサイトごとに食い違う** — 同じ `Customers.Customer` が、あるサイトでは
  相対、別のサイトでは「トップレベルに `Customers` が無い」として未解決になる

## チェックリスト

id でノードを指す構文を新設・変更するとき:

- [ ] 既存の参照サイトが受理する形を**実測で**棚卸ししたか（spec の記述ではなく
      最小 `.krs` を parse して確かめる。[[TPL-2133]] と同じ手法）
- [ ] 新サイトの受理形はその棚卸し結果と一致するか。一致しないなら、揃えない理由を
      spec に書いたか
- [ ] parse と解決を共有ヘルパーに通したか（property ごとの実装になっていないか）
- [ ] 拒否する形を書いたとき、**部分的に記録されて別の意味にならない**か。
      エラー時は何も記録しないか、全体を未解決として記録する
- [ ] 修飾を受理するなら、解決結果を格納する索引も区別可能なキーを持つか
      （[[TPL-1352]]）。受理と narrowing は同じ出荷単位に入れる
- [ ] 一致が複数になりうるか。なりうるなら、それが正当な並行モデリング
      （移行共存・マルチテナント — [ADR-927](../adr/927-import-system-nested.md) /
      [ADR-1566](../adr/1566-ownership-during-migration.md)）か事故かを
      (kind, 深さ) で切り分けて、前者では沈黙するか

## 既知の対処パターン

`ImportIdPath = string[]`（[ADR-927](../adr/927-import-system-nested.md)）を汎用の
`NodeIdPath` に置き直し、`Identifier (Dot Identifier)*` を読む parse ヘルパーを 1 つ、
接尾辞一致の resolver を 1 つ用意して全サイトが引く。候補集合は
`collectDeclaredIds`（`packages/core/src/parser/reference-validation.ts`）と同じ walk から
`Map<id, Array<{ kind, path }>>` として派生させる — walk を 2 本に分けない
（[ADR-2442](../adr/2442-owns-existence-any-declared-node.md) が 1 本に畳んだ理由と同じ）。

多重一致の切り分けは合成キー `${kind}:${path.length}` の集合サイズで行う。1 なら
正当な並行モデリング（沈黙）、2 以上なら事故（`*-target-ambiguous` で候補 full path を
列挙）。多重度がマージ後にしか確定しない点は [[TPL-2221]]、1 参照が複数ノードに
解決する向きと 1 ノードが複数グループに属する向きの違いは [[TPL-2161]] を参照。

## 派生元 spec

- `docs/spec/syntax.md` / `.ja.md` — ノード参照の path 記法（`owns` / `contains` /
  `realizes` / `handles` / `resource` / entity 関連 / edge endpoint / `import`）
- `docs/spec/diagnostics.md` / `.ja.md` — `*-target-not-found` / `*-target-ambiguous`
- `docs/concepts.ja.md` / `docs/concepts.md` — 「`owns` による組織と論理/物理の対応付け」節

## 関連テスト

- `packages/core/src/parser/node-path.test.ts` — 字句（`readNodeIdPathTail`）と
  接尾辞規則（`nodePathMatchesSuffix`）の table-driven テスト + 既存 4 サイトの
  回復挙動の pin（slice A, #2547）
- `packages/core/src/parser/node-reference-paths.test.ts` — `owns` / `contains` の
  受理・絞り込み・broadcast 不変・`*-target-ambiguous`・宣言順非依存（slice B, #2548）
- slice C（#2549）が `realizes` / `handles` の分を足し、9 サイトの列挙を完成させる
