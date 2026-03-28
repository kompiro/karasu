# ADR-0012: スタイル解決パイプラインの一元化

- **日付**: 2026-03-28
- **ステータス**: 決定済み

## 背景

スタイルのデフォルト値と解決ロジックが複数箇所に分散し、重複と不整合が生じていた。

| 場所 | 内容 |
|------|------|
| `style-resolver.ts` | `DEFAULT_NODE_STYLE`、`SHAPE_KEYWORDS` 等の TypeScript 定数 |
| `org-styles.ts` | 上記と同一内容の `DEFAULT_NODE_STYLE`、`SHAPE_KEYWORDS`、`toResolvedNodeStyle()` が重複 |
| `BUILTIN_STYLE_SOURCE` | `.krs.style` 形式の文字列定数（`default-style.ts`） |

また、`org-styles.ts` の `resolveOrgStyles()` は `resolveStyles()` と独立したパイプラインで動作していたため、
`team` / `member` ノードに builtin stylesheet のカスケードが届いていなかった。
これはユーザーが `.krs.style` でスタイルをオーバーライドできないことを意味し、ADR-0004 の方針（CSS カスケードで制御）と矛盾していた。

## 決定

**すべてのノード種別のデフォルトスタイルを `BUILTIN_STYLE_SOURCE` に定義し、
`resolveStyles()` を唯一のスタイル解決エントリポイントとする。**

具体的には以下を採用する。

1. `BUILTIN_STYLE_SOURCE`（`default-style.ts`）にすべてのノード種別（`team`、`member` を含む）のデフォルトルールを定義する
2. `resolveStyles()` に `organizations?: OrganizationBlock[]` を追加し、org ノードも同一カスケードで解決する
3. `org-styles.ts` の重複ヘルパー（`DEFAULT_NODE_STYLE`、`SHAPE_KEYWORDS`、`toResolvedNodeStyle()`）を削除し、`resolveOrgStyles()` を廃止する
4. `renderOrgView()` のシグネチャを `(slice, styleMap, defaultStyle)` から `(slice, styles: ResolvedStyles)` に変更する

## 理由

- **単一の信頼できる情報源**: デフォルトスタイルが `BUILTIN_STYLE_SOURCE` のみに存在するため、変更箇所が一か所に絞られる
- **カスケードの統一**: builtin → user スタイルシートの優先順位がすべてのノード種別に一貫して適用される
- **ユーザーがすべてオーバーライド可能**: `team { background-color: #FF0000; }` のように `.krs.style` で任意のデフォルトを上書きできる
- **コード重複の排除**: `toResolvedNodeStyle()`、`SHAPE_KEYWORDS` の重複が解消される

## 結果

- `resolveOrgStyles()` は廃止される。呼び出し側は `resolveStyles()` を使うこと
- `org-styles.ts` は `resolveStyles()` に統合されたため削除または空ファイルになる
- `DEFAULT_NODE_STYLE` はルールが一切マッチしない場合のフォールバックとして `style-resolver.ts` に残す（`BUILTIN_STYLE_SOURCE` が正常にパースされれば通常は使われない）

## 関連

- [ADR-0004](0004-css-inspired-styling.md) — CSS インスパイアのスタイリングシステム（カスケードの方針）
- [ADR-0011](0011-deployment-diagram-design.md) — deploy ノードへの同パターン先行適用（#30）
- `docs/design/builtin-style-and-reference.md` — ビルトインスタイル一元化の設計
- [#81](https://github.com/kompiro/karasu/issues/81) — org ノードの unified style pipeline 統合
