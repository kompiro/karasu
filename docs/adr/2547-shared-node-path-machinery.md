---
id: ADR-2547
title: node 参照の dotted path 読み取りを共有ヘルパーへ集約し、suffix 規則を定義する
status: accepted
date: 2026-08-19
topic: parser
related_to:
  - ADR-2088
  - ADR-927
  - ADR-104
  - ADR-1911
  - ADR-316
  - ADR-2522
scope:
  packages: [core]
assumptions:
  - "file: packages/core/src/parser/node-path.ts"
  - "symbol: packages/core/src/parser/node-path.ts :: readNodeIdPathTail"
  - "symbol: packages/core/src/parser/node-path.ts :: nodePathMatchesSuffix"
  - "symbol: packages/core/src/parser/node-path.ts :: resolveNodePathBySuffix"
  - "symbol: packages/core/src/types/ast.ts :: NodeIdPath"
  - "file: packages/core/src/parser/node-path.test.ts"
---

# ADR-2547: node 参照の dotted path 読み取りを共有ヘルパーへ集約し、suffix 規則を定義する

- **日付**: 2026-08-19
- **ステータス**: 決定済み・実装完了
- **関連**:
  - Issue: [#2547](https://github.com/kompiro/karasu/issues/2547)（[#2088](https://github.com/kompiro/karasu/issues/2088) の slice A。プログラム全体の決定は [ADR-2088](2088-node-reference-path-notation.md)）
  - 関連 ADR: [ADR-927](927-import-system-nested.md)（import path）, [ADR-104](104-system-selector-not-adopted.md)（cross-system edge 参照）, [ADR-1911](1911-cross-domain-ghost-entities.md)（cross-domain entity relation）, [ADR-316](316-database-as-first-class-node.md)（`resource OrderDB.Orders`）, [ADR-2522](2522-vocabulary-census-drift.md)（最小 cursor interface による字句ヘルパー抽出の前例、kebab-name）
  - 関連 TPL: [TPL-2088](../test-perspectives/TPL-2088-id-reference-notation-uniform-across-sites.md)（参照記法はサイト間で 1 規則）, [TPL-2133](../test-perspectives/TPL-2133-parser-acceptance-documented-in-spec.md), [TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md)

## 背景

`A.B.C` 形の node 参照を受理するサイトが parser 内に 4 つ（import entry、
cross-system edge endpoint、cross-domain entity relation、`resource` の
dot-notation。edge と entity relation は `parseEdge` を共有するため実装は
3 箇所）+ 準同型の 1 つ（entity の `table Infra.sub` mapping）あり、それぞれが
手書きのトークンループを持っていた。受理条件（セグメント数上限、StringLiteral
の可否）も失敗時の回復（bad token を消費するか、joined 値に含めるか）も
サイトごとに微妙に異なり、#2088（owns / contains / realizes / handles への
path 記法拡張）でサイトが増えると drift が加速する状態だった（TPL-2088）。

## 決定

1. dotted path の**字句読み取り**を `packages/core/src/parser/node-path.ts` の
   `readNodeIdPathTail(first, cursor, opts)` に集約する。kebab-name.ts（ADR-2522）
   と同じく最小 `TokenCursor` interface 越しに動き、**診断を発しない**。
   dot の後に有効なセグメントが無い場合は、その token を**消費せず**
   `dangling` として返し、報告と回復は呼び出しサイトに残す。
2. path 参照の**意味**を suffix 規則として定義する:
   参照 path が node の full path の末尾（tail）と一致するとき、その node に
   match する。bare id は length-1 の特殊ケース（= 全同名 node への broadcast）。
   実装は pure 関数 `nodePathMatchesSuffix` / `resolveNodePathBySuffix`
   （table-driven テストで規則を直接検証）。
3. `ImportIdPath` を `NodeIdPath` に一般化する（`string[]` のまま、import 専用の
   名前を降ろすだけ）。
4. 既存 4+1 サイトは **parse 側のみ**ヘルパーへ移行し、挙動変更ゼロとする。
   各サイトの**解決**側（import-resolver の root-anchored walk、view-extract の
   anchored match、`resolveQualifiedEntity` の first-domain-wins index）は
   generic suffix matcher ではなく、置き換えると挙動が変わるため対象外。
   suffix resolver の production 消費者は slice B/C（#2548 / #2549）。

## 理由

- 受理語彙の字句規則を 1 箇所にすることで、サイト追加時の drift を構造的に
  防げる（TPL-2088。kebab-name の前例 TPL-2509 と同じ構図）
- 診断と回復をヘルパーに吸い上げないことで、既存サイトの観測可能な挙動
  （エラーコード、bad token の消費有無、joined 値の quirk）を verbatim に
  維持できる。挙動同一性は既存 suite 無変更 green に加えて、
  `examples/**/*.krs` 全 84 ファイルの AST + diagnostics JSON が main と
  byte-identical であること（parse 84/84 + ImportResolver 84/84）で確認した
- suffix 規則を parse ヘルパーと同じモジュールに置くことで、#2088 の後続
  slice が「同じ字句・同じ意味」を 1 import で得られる

## 却下した案

- **解決側も含めて共通 suffix resolver に一本化する**: `resolveQualifiedEntity`
  は「最初に見つかった domain が index を勝ち取る」等のサイト固有の
  tie-break を持ち、suffix scan に置き換えると重複 id 時の解決結果が変わる。
  slice A は pure swap という契約（受け入れ基準）に反するため見送り
- **dangling 時にヘルパー内で診断を出す**: サイトごとにコードも回復も違う
  （import は `expected-identifier` + 消費、edge / resource は
  `expected-id-or-string` + 非消費 + 値 join）。共通化すると挙動変更になる
- **`ImportIdPath` の alias 温存**: 型は core barrel 非公開で外部使用ゼロ
  （`grep` で確認）。alias は死蔵語彙になるだけなので単純 rename とした

## 備考

- 移行済みサイトの回復挙動（`A -> B.` が `to: "B.}"` になる等）は
  `node-path.test.ts` の「pinned behavior」suite が main の実測値で固定して
  いる。これらの形の診断改善は slice C（#2549）が扱う
- `resolveNodePathBySuffix` は slice B が着地するまでテスト以外の消費者を
  持たない（knip には `@public` タグで宣言済み）
