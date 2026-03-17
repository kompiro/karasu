# AT-0001: SVGビルダーとシェイプレジストリの導入

- **日付**: 2026-03-16
- **関連ADR**: なし
- **対象**: `packages/core/src/renderer/` のリファクタリング

## 概要

SVG要素の生成をJSX風の `el()` ヘルパーに統一し、シェイプ定義をレジストリで管理できるようにする。

## 受け入れ条件

### AC-1: el() によるSVG要素生成

- [ ] `el("rect", { x: 0, y: 0, width: 100, height: 50 })` が `<rect x="0" y="0" width="100" height="50"/>` を返す
- [ ] `el("g", { class: "nodes" }, "<rect .../>")` が子要素を含む `<g>` タグを返す
- [ ] `undefined` / `null` / `false` の属性値はスキップされる
- [ ] 属性値に含まれる `&`, `<`, `>`, `"` がエスケープされる

### AC-2: シェイプレジストリ

- [ ] `registerShape("diamond", fn)` で関数を登録し、`getShape("diamond")` で取得できる
- [ ] `hasShape("box")` が組み込みシェイプに対して `true` を返す
- [ ] `getRegisteredShapeNames()` が登録済み全シェイプ名を返す
- [ ] `clearRegistry()` でレジストリをリセットできる

### AC-3: 組み込みシェイプの維持

- [ ] `box`, `person`, `cylinder`, `queue`, `hexagon`, `cloud` の6シェイプが自動登録される
- [ ] 既存のSVGレンダリング結果が変わらない（既存テスト全通過）

### AC-4: registerIcon によるアイコン登録

- [ ] `registerIcon({ name: "test", body: "<circle .../>", viewBoxWidth: 24, viewBoxHeight: 24 })` で登録後、`getShape("test")` が有効なレンダー関数を返す
- [ ] レンダー関数が `<g transform="translate(x, y) scale(sx, sy)">` でアイコンを配置する

### AC-5: レンダラーの統一

- [ ] `svg-renderer.ts`, `edge-routing.ts`, `shapes.ts` がすべて `el()` を使用している
- [ ] テンプレートリテラルによる直接的なSVG文字列組み立てが排除されている

## 検証方法

```bash
npm run build        # ビルド成功
npx vitest run       # 全テスト通過（72テスト）
```
