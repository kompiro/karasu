---
type: product
---

# AT-0833: Diagram legend syntax (legend block)

## 概要

`.krs` の `legend` ブロックが各ビューの SVG にフッター帯として描画され、
`swatch` / `ref` 両方のエントリ種別、scope 省略・指定、未解決 ref の警告が
期待通りに動作することを確認する
（Issue [#833](https://github.com/kompiro/karasu/issues/833)、
設計は `docs/design/diagram-legend.md`）。

Phase 5 の deliverable として `examples/feature-samples/legend.krs` を追加した。

## 前提条件

- main または PR ブランチに Phase 1〜4 がマージされている（#881 / #932 / #937 / #943）
- ブラウザでアプリが起動できる状態
- `examples/feature-samples/legend.krs` をエディタにペーストできる状態

## 受け入れ条件

### AT-0833-1: parser が legend ブロックを AST に積む（自動）

`packages/core/src/parser/parser.test.ts` の `legend block` describe で
9 ケースが green であること。Phase 2 (#932) で導入済み。

```sh
pnpm --filter @karasu-tools/core test -- parser.test
```

### AT-0833-2: swatch エントリが renderer の出力に色サンプル＋ラベルとして現れる（自動）

`packages/core/src/renderer/legend-footer.test.ts` の以下の assertion で
担保:

- "emits a footer in the system view for an unscoped legend with a swatch entry"
- 出力 SVG が `Team Backend` テキストと `fill="#2563EB"` を含む

### AT-0833-3: ref エントリが `.krs.style` の色で描画される（自動）

`legend-footer.test.ts` の以下の assertion で担保:

- "resolves a ref @annotation through the builtin style sheet"
  （`@deprecated` のバッジ色 `#EF4444` を fill に使う）
- "resolves a ref [tag] through the builtin style sheet"

### AT-0833-4: 未解決 ref は警告 + フッターから省略（自動）

`packages/core/src/resolver/warnings.test.ts` の `legend-ref-unresolved warning`
describe（Phase 3、#937）と `legend-footer.test.ts` の以下が担保:

- "skips an unresolved ref instead of emitting a colorless swatch"
- "does not emit a footer when every entry is unresolved"

### AT-0833-5: viewBox がフッターぶん拡張され、ノードと重ならない（手動）

1. `examples/feature-samples/legend.krs` をアプリの新しいプロジェクトにペースト
2. **System** タブを開く
3. ECPlatform の system 図とその下に区切り線つきのフッター帯が見える
4. 図のノード（ECommerce / Payment / Legacy）はフッター帯と重なっていない
5. 凡例には以下の 7 行が縦に並ぶ:
   - 🟦 Team Backend
   - 🟩 Team Frontend
   - 🟥 Third-party
   - 🔴 Deprecated（`@deprecated` の builtin バッジ色）
   - 🟫 External system（`[external]` の builtin スタイル色）
   - ⚪ Service（`service` 型のデフォルト背景色）
   - 🟦 EC site (focus)（`#ECommerce` の解決済み色）
6. 凡例の上に "Owner team" タイトルが表示されている

### AT-0833-6: legend deploy "..." は deploy 図にだけ描画される（自動 + 手動）

**自動**: `legend-footer.test.ts` の "scopes a deploy-only legend to the deploy view".

**手動**:

1. アプリで **Deploy** タブを開く
2. フッターに **2 つの凡例ブロック**が縦に並ぶ:
   1. "Owner team"（unscoped、System と同じ内容）
   2. "Hosting tier"（deploy 限定、Cloud Run / On-prem の 2 swatch）
3. **System** タブに戻ると "Hosting tier" は出ていない（"Owner team" のみ）
4. **Org** タブも "Owner team" のみが表示される

### AT-0833-7: 同ビュー対象の複数 legend は宣言順に縦並び（自動 + 手動）

**自動**: `legend-footer.test.ts` の "stacks multiple legend blocks in
declaration order on the same view".

**手動**: Deploy タブで "Owner team" が "Hosting tier" の上に表示されている
（`.krs` 内で `legend "Owner team"` が `legend deploy "Hosting tier"` より先に
書かれている順序を保つ）。

## 自動チェック

```sh
pnpm --filter @karasu-tools/core test -- parser.test legend-footer warnings
```

## 関連

- 設計ドキュメント: `docs/design/diagram-legend.md`
- 親 Issue: [#833](https://github.com/kompiro/karasu/issues/833)
- Phase 1 PR: [#881](https://github.com/kompiro/karasu/pull/881)
- Phase 2 PR: [#932](https://github.com/kompiro/karasu/pull/932)
- Phase 3 PR: [#937](https://github.com/kompiro/karasu/pull/937)
- Phase 4 PR: [#943](https://github.com/kompiro/karasu/pull/943)
