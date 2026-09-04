# nodePathIndex を merged model 上で再構築する

- **日付**: 2026-09-04
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2596](https://github.com/kompiro/karasu/issues/2596)
  - 本 Design Doc の PR: [#2697](https://github.com/kompiro/karasu/pull/2697)
  - 関連 ADR: [ADR-2550](../adr/2550-order-independent-node-path-index.md)（ファイル内の順序非依存化。本件はその「スコープ」節が名指しした follow-up）, [ADR-110](../adr/110-permanent-link.md)（`nodePathIndex` の由来）, [ADR-2410](../adr/2410-import-coupled-diagnostics-decline-and-invalid-owns-kind-only.md)（import 結合診断の判定空間）, [ADR-2161](../adr/2161-boundary-membership-1n.md)（membership を merged で再構築した先例）
  - 関連 TPL: [TPL-2221](../test-perspectives/TPL-2221-merge-only-facts-decided-on-merged-model.md), [TPL-1583](../test-perspectives/TPL-1583-migration-priority-index-winner.md), [TPL-2032](../test-perspectives/TPL-2032-reference-existence-validated-on-merged-space.md), [TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md), [TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md)
  - コード: `packages/core/src/parser/parser.ts`（`buildNodePathIndex`）, `packages/core/src/fs/import-resolver.ts`, `packages/core/src/parser/reference-validation.ts`

## 背景・課題

`buildNodePathIndex` は #2550 で collect-then-decide になり、`node-id-multiple-locations`
の判定と `nodePathIndex` の勝者選定はファイル内の宣言順に依存しなくなった。ただし
その保証は **1 ファイルの中だけ**である。ImportResolver は per-file の index を
first-wins で union するだけで、マージ後のモデルで index を作り直さない。

本 Design Doc の作成にあたり、in-memory FS 上の ImportResolver で 3 つの失敗を実測した。

**失敗 1: cross-file の migration 判定が黙って逆転する。**

```krs
// index.krs
import "./next.krs"
system Legacy {
  service Search @deprecated {}
}
// next.krs
system Next {
  service Search @migration_target {}
}
```

| 配置 | `nodePathIndex.get("Search")` | `node-id-multiple-locations` |
| --- | --- | --- |
| 2 ファイル（上記） | `["Legacy", "Search"]`（@deprecated 側） | 0 件 |
| 同じ内容を 1 ファイル | `["Next", "Search"]`（@migration_target 側） | 1 件 |

**失敗 2: cross-file の同名衝突が完全に沈黙する。** `system A { service Search {} }` と
import 先の `system B { service Search {} }` は 1 ファイルなら warning 1 件、
2 ファイルなら 0 件。ブロックをファイル間で移動しただけで判定と deep permalink の
着地点が変わる。これは #2550 がファイル内で除去した失敗モードそのもので、
[TPL-2221](../test-perspectives/TPL-2221-merge-only-facts-decided-on-merged-model.md)
が「沈黙して落ちるので誰も苦情を出さない」と述べている形である。

**失敗 3（Issue 未記載）: named import で入ったノードは index に 1 件も載らない。**
`mergeNamedImport` は `nodePathIndex` に触れない。union しているのは
`resolveKrsFromMap` の自ファイル分（`import-resolver.ts:389`）と
`mergeWildcardResolved`（同 `:566`）の 2 箇所だけである
（Issue 本文は前者を「id-import の merge 経路」と書いているが、実際には自ファイル
コンテンツのマージ位置）。実測:

```krs
// index.krs
import { Payments } from "./billing.krs"
system Shop {
  service Payments      // スタブ。定義で補完される
  service Orders {}
}
// billing.krs
service Payments {
  domain Ledger {}
}
```

マージ後の tree は `Shop.Payments.Ledger` を持つのに、`nodePathIndex.get("Ledger")`
は `undefined`。`Ledger` への bare id permalink / `viewPath` 解決は、モデルに
存在するノードに対して失敗する。

## 現状（インベントリ）

`resolve()` が返す merged `KrsFile` の派生 index の作られ方:

| index | 構築方法 | 根拠 |
| --- | --- | --- |
| `facetIndex` | merged model から再構築 | #2065 Part B |
| `ownerIndex` | merged model から再構築（path-keyed） | #2548 |
| `boundaryMembership` | merged model から再構築 | #2221 |
| `scopedBoundaryMembership` | merged model から再構築 | #2246 |
| `nodeFileIndex` | first-wins union（意図的。ファイル対応表なのでマージ不能） | ADR-429 |
| **`nodePathIndex`** | **first-wins union** | 本件 |

再構築組はいずれも `reference-validation.ts` の export された純粋関数
（`buildFacetIndex` / `buildOwnerIndex` / `buildBoundaryMembership`）を Parser と
ImportResolver の双方が呼ぶ形になっている。`buildNodePathIndex` だけが Parser の
private のままで、resolver から呼べない。

## 制約・前提

- **判定規則そのものは変えない。** ADR-2550 が決めた候補・勝者・警告の規則
  （論理層限定、`@migration_target` 優先、同点は traversal 順、同一 path の畳み込み、
  all-domain の沈黙）はそのまま。本件が変えるのは**どの空間で判定するか**だけ。
- **LSP は Parser を直接呼ぶ**（`packages/lsp/src/diagnostics.ts` は
  `Parser.parse(text)`。ImportResolver を通らない）。したがって per-file の
  `node-id-multiple-locations` は Parser 側に残す必要がある。
- **単一ファイルで二重に出さない。** resolver 経路では per-file の判定を落とし、
  マージ後に 1 回だけ出す（`MERGED_SPACE_REFERENCE_CODES` の既存パターン）。
- `buildNodePathIndex` は walk の途中で `collectNodeIds`（`duplicate-node-id-parent`）
  を呼んでおり、index 構築と per-file の重複検査が混ざっている。前者だけを純粋関数に
  切り出す必要がある。
- **Out of scope**: 警告文言、勝者規則の変更、`nodeFileIndex` の扱い、
  merged 診断の `loc` がどのファイルの行かを Diagnostic が持たない件
  （`duplicate-facet-id` / `duplicate-owner-assignment` などと共通の既存性質。
  本件で新しく壊れるものではない）。

## 検討した選択肢

### 案1: 純粋関数として切り出し、merged model で再構築する

`buildNodePathIndex` を `reference-validation.ts` へ移して
`buildNodePathIndex(file: KrsFile): MembershipResult<Map<string, string[]>>` として
export し、Parser（自ファイル = 最終空間）と ImportResolver（マージ後 = 最終空間）が
それぞれ正しい空間で呼ぶ。resolver は `node-id-multiple-locations` を
`MERGED_SPACE_REFERENCE_CODES` に登録して per-file 分を落とし、`facetIndex` /
`ownerIndex` / `boundaryMembership` と並べて再構築する。union の 2 ループは削除する。

**メリット**

- 3 つの失敗すべてが 1 つの変更で閉じる（失敗 3 は「マージ後の tree を歩く」ことの
  副産物として自動的に直る）
- index と診断の導出が 1 本になる。片方だけ直る drift（TPL-1032）が構造的に起きない
- `facetIndex` / `ownerIndex` / `boundaryMembership` と同じ形になり、次に index を
  足す人が読む前例が 4 件揃う
- TPL-2221 の「既知の対処パターン」3 項目をそのままなぞる

**デメリット**

- 変更が parser / reference-validation / import-resolver の 3 ファイルに跨る
- マージ後にもう 1 回全ノードを walk する（O(nodes)。`facetIndex` 等と同じオーダーで、
  すでに同じ walk を 4 回している経路に 1 回足す形）

### 案2: union のマージ規則を賢くする（priority 付き union）

union のときに `migrationPriority` を比較して勝者を選び直す。

**メリット**

- 変更が import-resolver に閉じる

**デメリット**

- **警告が出せない。** 非勝者ごとにその `loc` で warning を出す規則なので、
  候補集合がファイルごとに分断されていると「負けた宣言の一覧」を復元できない。
  失敗 2（沈黙）は直らない
- traversal 順の tie-break が **merge 順**に化ける。ADR-2550 が却下した「loc 順の
  tie-break」と同型の、書いた場所で勝者が変わる規則に戻る
- 失敗 3（named import でエントリが載らない）は union をどう賢くしても直らない。
  そもそも union する index が無い
- index と診断の導出が 2 本のままで、TPL-1032 の drift が残る

### 案3: index は union のまま、resolver に cross-file 専用の重複チェックを足す

**メリット**

- 既存の union を触らないので既存挙動への影響が小さい

**デメリット**

- 同じ事実に対して判定ロジックが 2 本になる（TPL-1032 が名指しする形）。
  ADR-2550 の規則を将来変えるとき、両方を同期させないと片方だけ直る
- 「index の勝者」と「警告の非勝者」が別ロジックになり、警告が指す宣言と
  実際に index から漏れた宣言がずれうる
- 失敗 3 は直らない

## 比較

| 観点 | 案1 再構築 | 案2 賢い union | 案3 別チェック |
| --- | --- | --- | --- |
| 失敗 1（migration 逆転） | 直る | 直る | 直らない（index は union のまま） |
| 失敗 2（沈黙） | 直る | 直らない | 直る |
| 失敗 3（named import 欠落） | 直る | 直らない | 直らない |
| 導出の本数 | 1 本 | 1 本 | 2 本 |
| tie-break の安定性 | traversal 順 | merge 順に劣化 | traversal 順 |
| 変更ファイル数 | 3 | 1 | 2 |

## Related TPLs

- [TPL-2221](../test-perspectives/TPL-2221-merge-only-facts-decided-on-merged-model.md) —
  本件の主観点。チェックリスト 5 項目をそのまま実装の受け入れ条件にする。
  `node-id-multiple-locations` は「同じモデルを 2 ファイルに分けると答えが変わる」
  診断であり、per-file 判定は沈黙で落ちる
- [TPL-1583](../test-perspectives/TPL-1583-migration-priority-index-winner.md) —
  1:1 index の勝者規則。マージ後でも `@migration_target` 優先・同点は traversal 順を
  保つ（失敗 1 はこの観点の cross-file 版の failure mode）
- [TPL-2032](../test-perspectives/TPL-2032-reference-existence-validated-on-merged-space.md) —
  「resolution はマージ後」。参照検証側の同型（失敗の向きが逆で、あちらは偽陽性）
- [TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md) —
  派生状態の導出を 1 本にする。案2 / 案3 の却下理由
- [TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md) —
  **非該当であることの確認**: `nodePathIndex` は ADR-110 以来 1:1 で、多値の宣言事実を
  切り捨てているわけではない（多重は warning で surface され、`domain-dispersal` /
  `duplicate-node-id-parent` が別の register で述べる）。再構築で消えるエントリは
  「マージ後のモデルに存在しないノード」だけなので、宣言された事実は失われない

proactive TPL の新規起票は不要と判断した。本件は TPL-2221 が既に記述している失敗の
新しい実例であり、3-Yes ルールの「既存 TPL に未掲載」を満たさない。代わりに
TPL-2221 の「関連テスト」節に本件のテストを追記し、`docs/spec/diagnostics.md` の
Identifier uniqueness 節の `> Related TPLs:` に TPL-2221 を back-ref する。

## 現時点の方針

**案1 を採用する。** 失敗 3 つすべてを閉じる唯一の案であり、リポジトリに 4 件の前例が
ある確立したパターンで、ADR-2550 の「スコープ」節が本 Issue に予告した方向そのもの
である。案2 は最小変更に見えて、警告を出せず tie-break を劣化させるため、
#2550 が消した失敗モードを別の形で持ち込む。

### 実装の指針

1. **抽出**: `buildNodePathIndex` を `parser.ts` から
   `reference-validation.ts` へ移し、`buildNodePathIndex(file: KrsFile):
   MembershipResult<Map<string, string[]>>` として export する。候補収集・勝者選定・
   警告の規則は変更しない（diagnostic の push 先がローカル配列になるだけ）。
   walk に混ざっていた `collectNodeIds` 呼び出し（system の children、top-level domain の
   children）は `parseFile` 側へ引き上げる。`duplicate-node-id-parent` は per-file・
   per-parent の判定であり、マージ後に再判定するものではない。引き上げ位置は index 構築の
   直前とし、診断の並び順（ADR-2550「意図的な差分」が観測可能と記録した順序）を保つ。
2. **Parser**: `parseFile` が新しい関数を呼び、返ってきた diagnostics を push する。
3. **ImportResolver**:
   - `MERGED_SPACE_REFERENCE_CODES` に `node-id-multiple-locations` を追加する
   - `resolveKrsFromMap` / `mergeWildcardResolved` の union ループ 2 箇所を削除し、
     `ownerIndex` と同じ体裁のコメントに置き換える
   - `resolve()` の `facetIndex` / `ownerIndex` / `boundaryMembership` 再構築の並びに
     `nodePathIndex` の再構築を足す（`resolve()` 内に `nodePathIndex` の読み手は無いので
     並び順の制約は無い）
4. **テスト**（`import-resolver.test.ts` に #2221 のブロックと同じ体裁で追加。
   TPL-2221 のチェックリストに 1:1 で対応させる）:
   - 失敗 1: cross-file の migration ペアが `["Next","Search"]` に解決し、warning が **1 件**出る
   - 失敗 2: cross-file の素の重複が warning **1 件**（沈黙しない）
   - 分け方非依存: 同じモデルを 1 ファイル / 2 ファイルで書いて index と件数が一致する
   - 二重報告なし: resolver 経路の単一ファイルで **1 件**
   - `compile()`（Parser 直呼び）では従来どおり per-file の判定が出る
   - 失敗 3: named import で入った子孫（`Ledger`）が index に載る
   - 既存の `node-path-index.test.ts`（Parser 単位）は変更しない
5. **ドキュメント**:
   - `docs/spec/diagnostics.md` / `.ja.md`: 「cross-file collisions still resolve
     first-file-wins（#2596 tracks the rebuild）」を削除し、マージ後のモデルで判定すると
     書き換える。`> Related TPLs:` に TPL-2221 を追加
   - `docs/test-perspectives/TPL-2221-*.md`: 「関連テスト」に本件のテストを追記
6. **changeset**: `@karasu-tools/core` + `karasu`（patch）。利用者から見える診断の
   変更にあたる（`.claude/rules/changesets.md` の cascade 表に従い core は 2 つ名指し）。
7. **AT**: 新規の受け入れテスト記録は作らない。判定は決定的で unit テストで完全に固定でき、
   人間の実機確認を要する要素が無い（#2550 も AT を作っていない）。PR の
   Manual Verification には、2 ファイルの重複モデルを `karasu render` にかけて warning が
   1 件出ることの目視確認のみを置く。
8. **ADR 昇格**: 実装完了後に `docs/adr/2596-node-path-index-merged-model.md` として昇格し、
   本 Design Doc は同 PR で削除する。ADR-2550 の「スコープ」節（単一ファイル保証の但し書き）は
   昇格 PR で ADR-2596 を指すよう更新する。

### 影響範囲・マイグレーション

- **既存ユーザーへの影響**: 複数ファイルに同名の論理ノードを持つモデルで、これまで
  沈黙していた `node-id-multiple-locations` が新たに出るようになる。警告であり
  レンダリングは止まらない。逆に、`@migration_target` を付けた移行先が別ファイルに
  ある場合、bare id の permalink / `viewPath` の着地点が移行先へ変わる（#2550 が
  1 ファイル内で行った変更の cross-file 版）。
- **ドキュメント更新**: `docs/spec/diagnostics.md` / `.ja.md`, TPL-2221。
- **テスト・examples への影響**: `examples/` の複数ファイル構成モデルで新たに warning が
  出ないかを実装時に確認する（出る場合、それはモデル側の実際の重複なので examples の
  修正か、警告が正しいことの確認かを個別に判断する）。
