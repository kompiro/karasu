---
id: TPL-2221
title: "マージ後にしか成立しない事実を述べる診断は、マージ後のモデルで判定する — per-file 判定は沈黙して落ちる"
status: active
date: 2026-08-02
applicable_to:
  - "複数の宣言を突き合わせて初めて成立する事実（重複・多重所属・件数・競合）を述べる診断を追加・変更するとき"
  - "Parser（ファイル単位）で診断を出しつつ、ImportResolver 経由の project mode でも同じ診断を成立させたいとき"
  - "index / membership を per-file に構築してから merge するコードを書くとき"
known_consumers:
  - import-resolver
  - parser
  - boundary-axis
  - facet
discovered_from:
  - issue: "#2221"
  - root_cause_file: "packages/core/src/parser/parser.ts:buildBoundaryMembership"
related_to:
  - TPL-2032
  - TPL-2161
  - TPL-1386
topic: resolver
scope:
  packages:
    - core
---

# TPL-2221: マージ後にしか成立しない事実を述べる診断は、マージ後のモデルで判定する

## 観点

診断が述べる事実には、**1 ファイルの中で完結するもの**と、**複数の宣言を突き合わせて初めて成立するもの**がある。後者を per-file で判定すると、どのファイルも単独では条件を満たさないため、**診断は 1 件も出ない**。

判定は「その事実が成立しうる最小の空間」で行う。karasu の project mode では、それは import をマージした後の `KrsFile` である（[[TPL-2032]] と同じ「resolution はマージ後」原則、ADR-1381）。

判定の基準は 1 つ: **同じモデルをファイルに分けたとき、この診断の答えは変わりうるか。** 変わりうるなら per-file では判定できない。

- **重複・多重所属・件数・競合**を述べる診断は、ほぼすべてこれに当たる（`duplicate-*`、「N 個に所属する」「複数から参照される」の類）。宣言 2 件が別ファイルに散れば、per-file の視界には 1 件ずつしか映らない。
- **単一宣言の静的性質**（kind が妥当か・構文が正しいか・位置が許されるか）は per-file で確定してよい。他ファイルの宣言で答えが変わらないため。

[[TPL-2032]] は同じ「マージ後で判定する」を**存在検証**（`*-target-not-found`）について述べたもので、**失敗の向きが逆**である。存在検証の per-file 判定は**偽陽性**（他ファイルにある id を「無い」と言う）を生み、誰かが「変な警告が出る」と気づく。本観点の per-file 判定が生むのは**見落とし**で、何も出ないため誰も気づかない。**沈黙は苦情を生まない**ので、テストで明示的に固定するしかない。

## 想定される失敗モード

- **同じモデルなのにファイルの分け方で診断が消える。** 1 ファイルに書けば出る診断が、`import` で 2 ファイルに分けると 0 件になる。モデルの内容ではなくファイル整理の都合に結果が依存する。
  **実例**（#2221）: `boundary payments { contains Billing }` と `boundary finance { contains Billing }` を別ファイルに置くと、membership は正しく `["payments","finance"]` になるのに `duplicate-boundary-assignment` は 1 件も出ない。CLI / app / LSP が通る `compileProject` 経路で観測ゼロ。
- **モデルは正しいので気づく手がかりが無い。** [[TPL-2032]] の偽陽性は「図は合っているのに診断が嘘」という違和感が残るが、こちらは図も index も正しく、欠けているのは観測手段だけ。レビューでもテストでも目に留まらない。
- **既存 TPL を引用していても防げない。** #2213 は [[TPL-2032]] を PR description で引用したうえで、この穴を新たに作った（1:N 化で cross-file 多重所属が初めて到達可能になった）。存在検証の観点を読んでも、重複検出を書いている人は自分に当てはまると判断しにくい。
- **merge が「index だけ」を対象にして診断を置き去りにする。** per-file の index を union / overwrite でマージする実装は、値は正しく合流させるが「合流の結果として初めて成立した事実」は誰も再判定しない。

## チェックリスト

事実系の診断（重複・多重・件数・競合）を追加・変更するときに確認する:

- [ ] その診断の答えは、**同じモデルを 2 ファイルに分けたときに変わるか**。変わるなら per-file で判定していないか
- [ ] 判定ロジックは per-file / merged の双方から呼べる純粋関数か（Parser の private に閉じていないか）
- [ ] ImportResolver が該当コードを per-file から抑止し（`MERGED_SPACE_REFERENCE_CODES`）、マージ後に再導出しているか
- [ ] **cross-file で「1 件出る」ことを assert したか**（沈黙する失敗なので、absence assertion だけでは検出できない）。単一ファイルで「二重に出ない」ことも併せて固定する
- [ ] assert は利用者が実際に通る surface（`compileProject` / `compile`）で行ったか。Parser 直呼びのテストは per-file の答えしか見ない

## 既知の対処パターン

- **判定を宣言リストに対する純粋関数として `packages/core/src/parser/reference-validation.ts` に置く。** Parser（single file = 自ファイルが最終空間）と ImportResolver（project = マージ後が最終空間）が同じ関数をそれぞれ正しい空間で呼ぶ。
- **`MERGED_SPACE_REFERENCE_CODES` に診断コードを登録する。** ImportResolver が Pass 1 で per-file の判定を落とし、Pass 2 のマージ後に再適用する。抑止しないと per-file 分と再導出分で二重に出る。
- **index も同じ空間で再構築する。** per-file に構築して merge するのではなく、マージ後のモデルから作り直す（`buildFacetIndex` が先例）。診断と index の導出経路が 1 本になり、片方だけ直る drift（[[TPL-1032]]）が構造的に起きない。

## 関連テスト

- `packages/core/src/fs/import-resolver.test.ts` §「cross-file multi-membership is reported on
  the merged model (#2221)」— cross-file で **1 件**、単一ファイルで **1 件**（二重報告なし）、
  ファイルの分け方を変えても答えが同じであること、単一ファイル `compile()` 経路で従来どおり出ること、
  `duplicate-boundary-id` は per-file のままであること。
- 先例: `duplicate-facet-id` の cross-file 重複（#2173 / #2199）

## 派生元 spec

- `docs/spec/diagnostics.md` — 診断コードの一覧。ここに載る診断のうち「複数宣言を突き合わせて成立する事実」を述べるものが本観点の対象。
- 設計: `docs/design/boundary-membership-1n.md`（#2161 slice A で cross-file 多重所属が到達可能になった経緯）。
