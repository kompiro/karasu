---
id: TPL-2032
title: "参照存在チェック（contains / owns 等）は per-file ではなくマージ後の id 空間で検証する"
status: active
date: 2026-07-18
applicable_to:
  - "ある id が「宣言されているか」を検証する診断（`*-target-not-found` 系）を追加・変更するとき"
  - "Parser の per-file 検証を ImportResolver 経由の project mode でも動かすとき"
  - "boundary `contains` / team `owns` / その他クロス参照の解決規則に関わるコードを変更するとき"
known_consumers:
  - import-resolver
  - parser
discovered_from:
  - issue: "#2032"
  - issue: "#2036"
  - issue: "#2082"
  - root_cause_file: "packages/core/src/fs/import-resolver.ts"
related_to:
  - TPL-1608
  - TPL-2221
topic: resolver
scope:
  packages:
    - core
---

# TPL-2032: 参照存在チェックはマージ後の id 空間で検証する

## 観点

「この id は宣言されているか？」を判定する診断（`contains-target-not-found` /
`owns-target-not-found` など存在検証系）は、**その id が解決されうる最終的な
id 空間**に対して評価しなければならない。karasu の project mode では id 空間は
複数ファイルを import でマージした後に初めて確定する（[[TPL-1608]] と
同じ「resolution はマージ後」原則、ADR-1381）。

Parser は 1 ファイル単位で走るため、per-file の存在検証は「別ファイルで宣言され
他ファイルから参照される id」を知らない。この per-file の判定を ImportResolver が
そのまま横流しすると、single file では出ない偽の warning が project mode でだけ
出る（#2032: `boundary contains` の member が import 先ファイルにあるケース）。
グルーピング側（`boundaryIndex` / `nodePathIndex`）はマージ後に組まれるので frame
は正しく、**診断だけが嘘をつく** — 見た目が合っているぶん気づきにくい。

正しい構造は「存在検証を per-file から切り離し、マージ後の `KrsFile` に対して
1 度だけ再評価する」。純粋関数として抽出し、Parser（single file = 自ファイルが
最終空間）と ImportResolver（project = マージ後が最終空間）の双方が同じロジックを
それぞれ正しい空間で呼ぶ。

**「マージ後に再評価する」だけでは足りない — 何に対して評価するかまで指定する。**
検証に使う id 集合は**マージ後のツリーから導出**する。既にある index
（`nodePathIndex` 等）を覗くと、検証の正しさが「その index をどの merge 経路が
運んだか」に依存する。#2082 はこれで再発した: ImportResolver はマージ後に
`owns` を再評価していたが、参照した `nodePathIndex` は per-file build の union で、
`mergeNamedImport` が運ばない（`mergeWildcardResolved` だけが運ぶ）。結果、
**同じ宣言が `import "…"` なら解決し、`import { X }` なら偽陽性**という経路依存の
嘘になった。`contains` が無傷だったのは、最初からマージ済みツリーを歩いていたから
（`collectContainableIds`）。

存在検証（id が在るか）と種別検証（kind が妥当か / `invalid-contains` の類）は
分けて考える。後者は宣言そのものの静的性質なので per-file で確定してよい。
per-file で消してよいのは **他ファイルの宣言で解決が変わりうる診断だけ**。

**重複・多重所属・件数を述べる診断はこの TPL の対象ではない** — 同じ「マージ後で判定する」
結論に至るが、per-file 判定が生む失敗が偽陽性ではなく**見落とし（沈黙）**で、気づき方が
まったく違う。そちらは [[TPL-2221]] を参照する（#2221 は本 TPL を引用した PR で作り込まれた）。

## 想定される失敗モード

- single file では 0 件なのに、同じモデルを import で分割すると `*-target-not-found`
  が出る（#2032: cross-file member への `contains` 偽陽性）。frame は正しいので
  「診断が過剰」であることに気づくのが遅れる。
- 逆に per-file 診断を project mode で丸ごと抑止すると、本当に存在しない id への
  参照まで黙る。抑止してよいのは「マージで解決されうる」存在検証系だけで、
  種別・構文レベルの per-file 診断まで巻き込んではならない。
- 新しいクロス参照診断（例: 将来 `realizes-target-not-found` 相当）を per-file
  検証として足したとき、マージ後の再評価を用意し忘れ、同じ偽陽性を再生産する。
  **再発実例**（#2036 slice A）: スコープ内 `boundary` の `contains-target-not-found` を
  per-file 検証で足したところ、ImportResolver に strip され再導出も無く、`compile()` 経由では
  診断が一切出なかった — parser 直呼びのテストだけでは見えない（assert はユーザーが実際に
  通る surface で行う）。
- マージ後に再評価してはいるが、**評価先が per-file index の union** になっている。
  index を運ぶ merge 経路と運ばない経路があるため、**import の書き方だけで診断が変わる**
  （#2082: `import "shop.krs"` は解決、`import { Orders } from "shop.krs"` は偽陽性）。
  wildcard import のテストしか無いと丸ごと見逃す — import 形ごとにケースを持つ。
- 検証の 2 つの呼び出し側（Parser / ImportResolver）が**別々に id 集合を組み立てて**いて、
  片方だけ直す。集合の導出を関数の内側に閉じ込め、呼び出し側は `KrsFile` を渡すだけに
  すると構造的に食い違えない（#2082 の修正で `validateOwnsReferences(file)` に畳んだ）。

## チェックリスト

存在検証系の診断を追加・変更するときに確認する:

- [ ] 検証している id は、別ファイルの宣言で解決が変わりうるか（yes ならマージ後で評価）
- [ ] 検証ロジックは per-file / merged の双方から呼べる純粋関数か（Parser 内 private に閉じていないか）
- [ ] ImportResolver は該当診断コードを per-file から抑止し、マージ後に再評価しているか
- [ ] **valid-target 集合をマージ後のツリーから導出しているか**（既存 index を覗いていないか）。
      index を使うなら、それを**全 merge 経路**（`mergeWildcardResolved` / `mergeNamedImport` /
      ディレクトリ import）が運んでいることを確認する
- [ ] 集合の導出は 1 箇所か（呼び出し側が各自組み立てていないか）
- [ ] 抑止対象は存在検証系だけに絞れているか（種別・構文診断を巻き込んでいないか）
- [ ] 「cross-file で在る → 出ない」「どこにも無い → 出る」の両方を、code + severity を
      明示した absence/presence assertion で固定したか（[[TPL-1608]]）
- [ ] **import 形ごとにケースがあるか** — wildcard / named（bare id・path 形）/ ディレクトリ。
      wildcard だけ緑で named が赤という経路依存を、テストの形で禁止する

## 既知の対処パターン

- `packages/core/src/parser/reference-validation.ts` に存在検証を純粋関数として置き、
  Parser と ImportResolver が同じ関数を各自の空間で呼ぶ。**引数は `KrsFile` そのもの**にし、
  valid-target 集合の導出（`collectContainableIds` / `collectOwnsResolvableIds`）を関数の内側に置く。
  両者は #2442 で 1 つの walk（`collectDeclaredIds`）に畳まれ、違いは system id を含めるか
  だけになった — 存在検査が「どの kind か」を見なくなれば、集合は 1 つの問いに収束する。
- ImportResolver は per-file の `parseResult.diagnostics` から存在検証系コードを
  `filter` で落とし（`MERGED_SPACE_REFERENCE_CODES`）、Pass 2 のマージ後に
  マージ済み `KrsFile` へ再適用する。

## 関連テスト

- `packages/core/src/fs/import-resolver.test.ts`（cross-file `contains` / `owns` の
  偽陽性なし・真の欠落は warning の両側面。`owns` は wildcard / named（bare・path 形）/
  top-level service の 4 形 + ghost control — #2082）
- `packages/core/src/renderer/group-by-drilldown-render.test.ts`（cross-file member の
  frame と診断沈黙を同居で固定）

## 派生元 spec

- `docs/spec/syntax.md` §「Grouping the system view (`boundary`)」/「Scoped declaration」—
  スコープ宣言の `contains-target-not-found` も他の存在検証と同様マージ後モデルで再導出する
  規定（#2036 slice A の再発事例が「想定される失敗モード」にある）。同節末尾に本 TPL への
  `> Related TPLs:` back-ref あり。
- `docs/spec/syntax.md` §「Cross-cutting membership (`facet`)」— `facet-not-declared` は
  マージ後モデルで判定する（宣言と参照が別ファイルにありうる）。`duplicate-facet-id` は逆向きの
  理由で同じ扱い: per-file 評価は偽陽性ではなく**ファイル横断の重複の見落とし**を生むため、
  ImportResolver が per-file を抑止しマージ後に再導出する（#2173）。同節末尾に本 TPL への
  `> Related TPLs:` back-ref あり。
