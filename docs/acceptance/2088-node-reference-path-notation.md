# AT-2088: ノード参照の path 記法（接尾辞規則）

- **日付**: 2026-08-19
- **Issue**: [#2088](https://github.com/kompiro/karasu/issues/2088)（親） / slice A [#2547](https://github.com/kompiro/karasu/issues/2547) / slice B [#2548](https://github.com/kompiro/karasu/issues/2548) / slice C [#2549](https://github.com/kompiro/karasu/issues/2549)
- **関連 ADR**: [ADR-2547](../adr/2547-shared-node-path-machinery.md)（slice A: 共有 parse ヘルパーと接尾辞規則）
- **Related TPLs**:
  - [TPL-2088](../test-perspectives/TPL-2088-id-reference-notation-uniform-across-sites.md)（記法はサイト間で 1 規則）
  - [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)（受理・無効果の禁止 — 記法と絞り込みは同時に出す）
  - [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)（path 受理は path キー索引を要求）
  - [TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md)（宣言された事実を派生 index で捨てない）
  - [TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md)（`karasu fmt` は著者の書いた path を保つ）
- **対象**: `packages/core/src/parser/node-path.ts` / `parser.ts` / `reference-validation.ts`、`packages/core/src/fs/import-resolver.ts`、`packages/core/src/renderer/layout*.ts`、`packages/core/src/compile/compile*.ts`、`packages/i18n`

## 概要

ノードを id で指す参照サイトに、共通の path 記法（`Segment(.Segment)*`）と接尾辞
解決規則を導入する（#2088、`docs/spec/syntax.md`「Node reference path notation」）。
bare id は長さ 1 の接尾辞（broadcast、後方互換）で、より長い path は指した 1 ノードに
絞る。(kind, 深さ) の揃わない多重一致は `*-target-ambiguous` warning が候補 full path を
列挙する。

- slice A（#2547）: 既存 4+1 受理サイトの字句を共有ヘルパーへ移行（挙動不変）
- slice B（#2548）: `owns` / `contains` を受理側に追加し、`ownerIndex` /
  `boundaryMembership` を full path キーに張り替え
- slice C（#2549）: `realizes` / `handles` を受理側に追加。拒否形は先頭セグメントを記録しない

## 受け入れ条件

### slice A（#2547）— 挙動不変の載せ替え

- [x] 既存 4 サイト（import / cross-system edge / entity 関連 / `resource`）の受理形と解決結果が不変（既存 suite 無変更 green + `examples/**/*.krs` 84 ファイルの AST + diagnostics が main と byte-identical）
  > ✅ Automated — packages/core/src/parser/node-path.test.ts › dotted-path site recovery (pinned behavior)
- [x] 接尾辞規則そのものの table-driven 検証（full path / 真の接尾辞 / bare id / 不一致 / 過長 ref / 非末尾）
  > ✅ Automated — packages/core/src/parser/node-path.test.ts › nodePathMatchesSuffix

### slice B（#2548）— `owns` / `contains`

- [x] `owns Shop.Checkout.Payment` がちょうどその 1 ノードに解決され、team チップも *Group by: team* のフレームも指したノードだけに付く
  > ✅ Automated — packages/core/src/parser/node-reference-paths.test.ts › path-qualified owns narrows rendering (#2548)
- [x] bare id の解決は不変（broadcast 込み — `owns Payment` は全 `Payment` を主張する）
  > ✅ Automated — packages/core/src/parser/node-reference-paths.test.ts › a bare id still claims every node (broadcast unchanged) and warns on the mixed match
- [x] `contains` が top-level 形とスコープ形で同一の記法を受理する
  > ✅ Automated — packages/core/src/parser/node-reference-paths.test.ts › contains accepts suffix paths (#2548)
- [x] cross-layer 衝突（kind / 深さの混在）は候補 full path つきで warning、同 kind 同深さの衝突は沈黙
  > ✅ Automated — packages/core/src/parser/node-reference-paths.test.ts › a uniform (kind, depth) multi-match stays silent — intentional broadcast
- [x] 宣言順を入れ替えても判定が変わらない
  > ✅ Automated — packages/core/src/parser/node-reference-paths.test.ts › the ambiguity verdict does not depend on declaration order
- [x] `karasu fmt` が著者の書いた path を保つ（正規化しない）
  > ✅ Automated — packages/core/src/formatter/formatter.test.ts › preserves owns and contains path references as written

### slice C（#2549）— `realizes` / `handles`

- [x] `realizes Shop.Api` / `handles Backend.Order` が parse され、指したノードに解決される
  > ✅ Automated — packages/core/src/parser/node-reference-paths.test.ts › realizes / handles accept suffix paths (#2549)
- [x] bare id の解決は両サイトで不変
  > ✅ Automated — packages/core/src/parser/node-reference-paths.test.ts › handles Backend.Order parses as a path and the expose rule evaluates the resolved node
- [x] 拒否される形は先頭セグメントを記録せず、診断はちょうど 1 件
  > ✅ Automated — packages/core/src/parser/node-reference-paths.test.ts › a rejected realizes form records nothing rather than its first segment
- [x] `handles` の one-hop expose 規則は path テキストでなく解決先ノードに対して評価される
  > ✅ Automated — packages/core/src/parser/node-reference-paths.test.ts › handles Backend.Order parses as a path and the expose rule evaluates the resolved node
- [x] ambiguity は slice B と同じ (kind, 深さ) 判別を同じヘルパーで使う
  > ✅ Automated — packages/core/src/parser/node-reference-paths.test.ts › realizes ambiguity follows the shared (kind, depth) rule

## 手動確認

`🧑 Manual` の到達先: <https://karasu.kompiro.dev/>（main への push で更新）。
次のモデルをエディタに貼って確認する:

```krs
system Shop {
  service Payment {}
  service Checkout {
    domain Payment {}
  }
}
organization Org {
  team Platform {
    owns Shop.Payment
  }
}
```

- [ ] 🧑 Manual: system view で team チップ（`Platform`）が **service `Payment` のカードだけ**に
  付き、`Checkout` のドリルダウンで domain `Payment` にチップが付かない
- [ ] 🧑 Manual: *Group by: team* で `Platform` の枠が service `Payment` だけを囲む
