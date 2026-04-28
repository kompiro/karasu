---
type: product
---

# AT-0069: client.resource — card badge + detail panel list

## 概要

`client { resource <kind> "<name>" }` の SVG レンダリングを **件数バッジ** に集約し、詳細は `NodeDetailPanel` の "Storage resources" セクションに移動したことを確認する
（Issue [#914](https://github.com/kompiro/karasu/issues/914)、設計は [ADR-20260428-06](../adr/20260428-06-client-mcp-modeling.md)）。

Phase 5 (#855) では resource 行が 1 件につき 1 行カード上にレンダリングされ、6 件並ぶとカードが縦長になっていた。本変更ではカード上は `📦 ×N` の単一行に圧縮し、強制 3 段レイアウト (Phase 6) との相性を回復する。

## 受け入れ条件

### 1. カード上のバッジ

以下の `.krs` を開いたとき、`WebApp` のカードに `📦 ×2` のバッジが 1 行だけ表示される。`📦 localStorage "preferences"` のような per-line テキストは出ない。

```krs
system Demo {
  client WebApp [web] {
    resource localStorage "preferences"
    resource indexedDB "outbox"
  }
}
```

バッジ要素には `data-client-resource-count="2"` が付与される（e2e / accessibility 用）。SVG `<title>` 子要素にホバーで `localStorage "preferences", indexedDB "outbox"` のような一覧が見える。

### 2. resource ゼロ件のクライアントにはバッジ非表示

```krs
system Demo {
  client Bare [web] { label "Bare" }
}
```

`📦` を含むテキストもバッジ要素も出ない。

### 3. カード高さが resource 件数に依存しない

resource を 0 件のクライアントと 6 件のクライアントを並べたとき、カードの高さが等しい（バッジ 1 行 + メタ行は同じ）。

### 4. NodeDetailPanel に詳細セクション

クライアントノードをクリックして開く `NodeDetailPanel` に "📦 Storage resources" セクションが現れ、宣言順で `<kind> — <name>` のリストが表示される。

例:

```
📦 Storage resources
  localStorage   preferences
  indexedDB      outbox
  keychain       session-key
```

resource を持たないクライアントでは同セクションは出ない。`service` 等の他 kind のノードでも出ない。

### 5. ロケール対応

セクションタイトルは locale=en で `📦 Storage resources`、locale=ja で `📦 ストレージリソース`。

## 自動化された検証

- `packages/core/src/renderer/svg-renderer.test.ts` — `renders a single resource count badge` / `emits no resource badge when the client has zero resources`
- `packages/core/src/renderer/layout.test.ts` — `keeps client card height stable regardless of resource count`
- `packages/app/src/components/NodeDetailPanel.test.tsx` — `storage resources section (Issue #914)` describe ブロック

## スコープ外

- per-kind icon バッジ差別化（`localStorage` と `indexedDB` で違う絵文字を出すなど）
- diff モードでの resource 追加/削除のハイライト
- resource attributes（TTL / 暗号化など）

## 関連

- 親 Issue: [#823](https://github.com/kompiro/karasu/issues/823) — `client` kind MVP の最終追跡
- 本 Issue: [#914](https://github.com/kompiro/karasu/issues/914)
- ADR: [`docs/adr/20260428-06-client-mcp-modeling.md`](../adr/20260428-06-client-mcp-modeling.md)
- 先行 AT: [`docs/acceptance/0066-client-kind-phase5-resource.md`](0066-client-kind-phase5-resource.md)
