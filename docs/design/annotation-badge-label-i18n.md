# 組み込みアノテーションバッジラベルの locale 注入

- **日付**: 2026-06-10
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1508](https://github.com/kompiro/karasu/issues/1508)（前段: [#1496](https://github.com/kompiro/karasu/issues/1496) / クローズした PR [#1507](https://github.com/kompiro/karasu/pull/1507)）
  - 関連 ADR: [ADR-20260425-01](../adr/20260425-01-i18n-default-policy.md)（i18n 既定ポリシー）, [ADR-20260522-01](../adr/20260522-01-svg-diagram-theming.md)（theme threading の前例）
  - 関連 TPL: [TPL-20260519-02](../test-perspectives/TPL-20260519-02-shared-vocabulary-dual-representation.md), [TPL-20260510-06](../test-perspectives/TPL-20260510-06-display-mode-cross-surface.md), [TPL-20260510-11](../test-perspectives/TPL-20260510-11-parallel-function-parity.md)
  - コード: `packages/core/src/builtins/default-style.ts`, `packages/core/src/builtins/reference-data.ts`, `packages/app/src/i18n/use-empty-state-labels.ts`
- **PR**: （作成後に記入）

## 背景・課題

組み込みデフォルトスタイルのアノテーションバッジラベル（`@deprecated` /
`@experimental` / `@migration_target`）は `BUILTIN_STYLE_SOURCE` /
`BUILTIN_STYLE_SOURCE_LIGHT` 内の文字列リテラルとしてハードコードされている。
2026-06-10 の spec 適合性監査（I-2 / #1496）で、同じ概念が 3 表記
（廃止予定 / Deprecated / 非推奨）に分かれていることが判明した。

PR #1507 はラベルを英語に統一する短期修正だったが、「en 固定になるだけで
locale に追従しない」ため不完全としてマージせずクローズした。バッジラベルは
SVG に埋め込まれるユーザー向け文字列であり、`docs/spec/i18n.md` のポリシー
（core は翻訳テーブルを import せず、locale 依存文字列は呼び出し側から注入する）
に従って **locale 注入可能** にするのが本筋である。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| ラベルの定義場所 | `default-style.ts` の dark / light 2 シートに各 4 アノテーション分のリテラル（現 main では日本語: 廃止予定 / NEW / 実験的 / 移行先） |
| 二言語の正典 | `reference-data.ts` の `annotations[].defaultBadge.label` に `{ en, ja }` が定義済み（Deprecated・非推奨 / NEW・NEW / Experimental・実験的 / Migration target・移行先）。ただしスタイルシートはこれを参照していない |
| バッジ色 | dark / light でシートごとに異なる（例: `@deprecated` は dark `#EF4444` / light `#DC2626`）。`reference-data.ts` の `defaultBadge.color` は dark 値のみ |
| シートの組み立て | `getBuiltinStyleSheet(theme)` がシート文字列を parse して theme ごとに 1 個キャッシュ（`default-style.ts:501`） |
| カスケード | builtin シートは最下層。ユーザー `.krs.style` の `@deprecated { badge-label: ... }` が常に勝つ |
| 文字列注入の前例 | `EmptyStateLabels`（#1494 / #1505）— app が `useEmptyStateLabels()` で locale → 文字列 を解決し、core にはプレーン文字列だけ渡す |
| theme threading の前例 | #1485 / ADR-20260522-01 — `theme` を全 SVG エントリポイント（15 箇所、`theme-meta.test.ts` が列挙）に通した |
| consumer | `compileProject` / `compileProjectOrgView` / `buildAllLayersSvg` 等が `getBuiltinStyleSheet(theme)` を呼ぶ（`index.ts` 581 / 608 / 1065 / 1178 / 1271, `all-layers-svg.ts:92`） |

## 制約・前提

- core は app の翻訳テーブルを import しない（`docs/spec/i18n.md`）。注入されるのは locale コードではなく **解決済みのプレーン文字列**（`EmptyStateLabels` と同じ流儀）
- ユーザー `.krs.style` の `badge-label` 上書きは引き続き常に勝つ（カスケード最下層という位置づけを変えない）
- バッジ **色・アイコン** は theme 次元（dark / light で異なる）、**ラベル** は locale 次元。今回 locale 化するのはラベルのみ
- builtin シートのキャッシュを退行させない（parse は毎レンダリングではなく locale / theme 変化時のみ）
- out of scope:
  - CLI / VS Code 拡張の locale 対応（注入口は作るが、デフォルト en のままにする。CLI `--locale` フラグ等は別 Issue）
  - ユーザー定義アノテーション（open set）のラベル — builtin デフォルトを持たないので対象外
  - `[external]` 等タグ系バッジ — 現状ラベルは記号/英略語のみで locale 依存文字列を持たない

## 検討した選択肢

### 案1: builtin シートのアノテーション節を reference-data から生成し、ラベルを注入可能にする

`getBuiltinStyleSheet(theme, badgeLabels?)` に拡張する。アノテーション節
（`@deprecated { ... }` 等 4 ブロック）をリテラルではなく
`reference-data.ts` の `defaultBadge` + theme 別色テーブル + 注入ラベルから
**文字列として組み立てて** からシート全体を parse する。

```ts
export interface AnnotationBadgeLabels {
  deprecated?: string;
  new?: string;
  experimental?: string;
  migrationTarget?: string;
}
// 省略時は reference-data の en ラベルを使用
```

- ラベルのデフォルトは `reference-data.defaultBadge.label.en` — シートと
  reference の en 表記が **構造的に一致** する（ドリフト不能）
- app は `useAnnotationBadgeLabels()`（`useEmptyStateLabels` と同型の hook）で
  locale → 文字列を解決し、`compileProject` 等のオプションで渡す
- キャッシュは `(theme, ラベル組)` キーの小さな Map（ラベル組は 4 文字列の
  join で安定キー化）

**メリット**

- カスケード意味論が無変更 — 「builtin 最下層、ユーザーが勝つ」がそのまま
- TPL-20260519-02 の本命パターン（単一真実源からの生成）を適用でき、
  #1496 の 3 表記問題が構造的に再発しなくなる
- `EmptyStateLabels` / `theme` と同じ注入・threading 設計で、既存の
  パターンに乗る（学習コストが低い）

**デメリット**

- `BUILTIN_STYLE_SOURCE` が静的リテラルでなくなる（組み立て関数化）。
  シート全文を目視したいときに 1 ステップ挟まる
- locale 変更ごとにシート re-parse が走る（ただしキャッシュにより
  locale 切替時の 1 回のみ。シートは ~500 行で parse は軽量）

### 案2: 解決後のスタイルに対するラベル置換

`resolveStyles()` の結果に対し、「builtin 由来の badge-label」だけを注入
ラベルで差し替える後処理を入れる。

**メリット**

- シートの組み立てを変えなくてよい

**デメリット**

- 「この badgeLabel は builtin 由来か、ユーザー上書きか」という **provenance
  追跡** が新たに必要になる。現在の resolved style は出所を持たないため、
  カスケード実装への侵襲が大きい
- ユーザーが builtin と同じ文字列を明示指定したケース等、誤置換の
  エッジケースを潰しにくい

### 案3: builtin シートから badge-label を撤去し、renderer 側でフォールバック

builtin シートはラベルを持たず、resolved style に badgeLabel が無いときに
renderer が注入マップ（annotation 名 → ラベル）から引く。

**メリット**

- シートは色・アイコンだけになり、ラベルの locale 問題がシートから消える

**デメリット**

- 「badge-label 未指定」と「builtin デフォルト」の区別が消える —
  ユーザーが *ラベル無しバッジ* を意図して `badge-label` を書かない場合と
  衝突し、カスケードの読み筋が変わる（後方非互換）
- renderer がバッジ描画時に「どのアノテーション由来か」を意識する必要が
  あり、複数アノテーション優先順位ロジック（`svg-renderer.ts:1736-`）に
  注入マップ参照が絡んで複雑化する

## 比較

| 観点 | 案1: シート生成+注入 | 案2: 解決後置換 | 案3: renderer フォールバック |
| --- | --- | --- | --- |
| カスケード意味論 | 無変更 | provenance 追跡が必要 | 「未指定」の意味が変わる |
| 単一真実源（TPL-20260519-02） | reference-data から生成で達成 | 達成されない（3 箇所のまま） | 部分的（ラベルのみ） |
| 変更量 | 中（シート組み立て + threading） | 大（resolver 侵襲） | 大（renderer 侵襲） |
| 後方互換 | 維持（デフォルト en） | 維持 | 一部非互換 |
| 既存パターンとの整合 | EmptyStateLabels / theme と同型 | 前例なし | 前例なし |

## Related TPLs

- [TPL-20260519-02](../test-perspectives/TPL-20260519-02-shared-vocabulary-dual-representation.md) — 同一語彙の複数表現 drift。本設計の引き金（@deprecated の 3 表記）であり、案1 の「reference-data からの生成」はこの TPL の本命対処パターン
- [TPL-20260510-06](../test-perspectives/TPL-20260510-06-display-mode-cross-surface.md) — グローバルレンダリング切替の全描画面点検。locale は theme と同じ cross-surface 次元であり、`theme-meta.test.ts` と同型の全エントリポイント列挙テストを要求する
- [TPL-20260510-11](../test-perspectives/TPL-20260510-11-parallel-function-parity.md) — 並列関数ファミリの parameter parity。`badgeLabels` オプションを compile / build*Svg ファミリ全員に通すこと（#1494 の emptyStateLabels と同じ落とし穴）

## 現時点の方針

**案1 を採用する** — カスケード意味論を変えずに locale 次元を足せる唯一の案
であり、reference-data を単一真実源にすることで #1496 の表記不一致が構造的に
再発しなくなる。`EmptyStateLabels`（文字列注入）と ADR-20260522-01（theme
threading）という確立済みパターンの合成で、新規概念を導入しない。

### 実装の指針

1. `default-style.ts`: アノテーション 4 ブロックを `buildAnnotationRules(theme, labels?)` で組み立てる。色・アイコンは theme 別テーブル（既存リテラル値を移設）、ラベルは `labels?.<key> ?? referenceData.annotations[].defaultBadge.label.en`
2. `getBuiltinStyleSheet(theme, badgeLabels?)`: キャッシュを `(theme + ラベル組)` キーの Map に変更。`AnnotationBadgeLabels` 型を export
3. threading: `compileProject` / `compileProjectOrgView` / `buildAllLayersSvg` 等、`getBuiltinStyleSheet` を呼ぶ全エントリポイントにオプションを追加（`theme-meta.test.ts` の列挙にラベル軸を追加）
4. app: `useAnnotationBadgeLabels()` hook を追加（i18n キー `badge.deprecated` 等を en/ja 両テーブルに追加）。`AppShell` / 各 view hook から `emptyStateLabels` と並べて渡す
5. ja ラベルは reference-data の ja（非推奨 / NEW / 実験的 / 移行先）に従う — 旧 builtin の「廃止予定」は ja でも「非推奨」に変わる（表記統一）
6. テスト:
   - builtin シート（無注入時）のラベル === reference-data en の parity テスト（単一真実源フェンス、TPL-20260519-02）
   - 注入ラベルが SVG に出る / ユーザー `.krs.style` の `badge-label` が注入より勝つ
   - dark / light × en / ja のキャッシュが混線しない
7. AT: `docs/acceptance/` に追加。TC:
   - app で locale を en ↔ ja に切り替えると `@deprecated` バッジラベルが Deprecated ↔ 非推奨 に追従する（人間確認）
   - ユーザー `.krs.style` で `badge-label` を上書きした場合は locale 切替に追従しない（上書き優先、人間確認）
8. ADR 昇格: 実装完了後 `docs/adr/` に昇格し、本 Design Doc は同 PR で削除する

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: デフォルト（無注入）のバッジラベルが 廃止予定/実験的/移行先 → Deprecated/Experimental/Migration target に変わる（#1507 で意図した変更を本実装に内包）。ja locale の app 利用者は 非推奨/実験的/移行先 が表示されるようになる。`.krs.style` で上書きしているユーザーは無影響
- ドキュメント更新: `docs/spec/i18n.md` に注入口（`AnnotationBadgeLabels`）を追記。`docs/spec/tags-annotations.md` は reference-data から生成のため自動追従
- 既存テスト: `svg-renderer.test.ts` / `cross-view-rendering.test.ts` の builtin ラベル断言を en 表記に更新（#1507 の差分を再利用）

## 未解決の問い

1. **注入オプションの形**: `AnnotationBadgeLabels` を `EmptyStateLabels` とは別オプションとして増やすか、両者を包む単一の `CoreLabels` バンドルに統合するか。別オプション案は既存 API 無変更で増分が素直、統合案は「core への文字列注入口」が 1 つにまとまるが `EmptyStateLabels` の API 変更（または deprecation）を伴う
2. **`@new` の扱い**: reference-data では en/ja とも "NEW"。注入可能キーに含めるか（一貫性優先）、locale 不変として除外するか（最小 API 優先）
3. **CLI の locale**: 今回は注入口のみ作り CLI はデフォルト en とするが、`karasu render --locale ja` を将来サポートする際の翻訳テーブルの置き場所（CLI 内に最小テーブルを持つ / app と共有パッケージ化）はここでは決めない — この前提でよいか
