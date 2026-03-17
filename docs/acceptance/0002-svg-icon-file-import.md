# AT-0002: SVGファイルのインポート構造

- **日付**: 2026-03-16
- **関連ADR**: ADR-0005
- **対象**: SVGアイコンファイルの外部読み込みとレジストリ登録

## 概要

svg-icon スキルで作成した `.svg` ファイルをそのまま保持し、マニフェスト（`icons.json`）経由で読み込み・レジストリ登録できるようにする。SVGファイル内のサンプルテキスト（`krs-label` / `krs-description`）からテキスト配置位置を抽出する。

## 受け入れ条件

### AC-1: SVGファイルのプレビュー可能性

- [ ] `packages/core/icons/database.svg` がブラウザやエディタで直接プレビューできる
- [ ] プレビュー時にサンプルテキスト（"Database", "Stores user data"）が表示される
- [ ] アイコンの完成形（シェイプ＋テキスト配置）がSVGファイル単体で確認できる

### AC-2: parseSvgIcon によるSVG解析

- [ ] `<svg viewBox="0 0 160 80">` から `viewBoxWidth: 160`, `viewBoxHeight: 80` を抽出する
- [ ] `<text class="krs-label" x="80" y="42" text-anchor="middle">` から `labelSlot: { x: 80, y: 42, textAnchor: "middle" }` を抽出する
- [ ] `<text class="krs-description" ...>` から `descriptionSlot` を抽出する
- [ ] `krs-label` / `krs-description` のテキスト要素が `body` から除去される
- [ ] 他のSVG要素（`<ellipse>`, `<path>` 等）は `body` に保持される
- [ ] viewBox が未指定の場合、デフォルト `24x24` になる
- [ ] テキストスロットが存在しないSVGでも `labelSlot` / `descriptionSlot` が `undefined` になりエラーにならない

### AC-3: マニフェストによる一括登録

- [ ] `icons.json` の `{ "icons": [{ "name": "database", "file": "database.svg" }] }` 形式で定義できる
- [ ] `resolveIconManifest(manifest, { "database.svg": svgContent })` でマニフェスト内の全アイコンが登録される
- [ ] `svgContents` に対応するファイルがない場合、そのエントリはスキップされる（エラーにならない）

### AC-4: loadAndRegisterIcon / loadAndRegisterIcons

- [ ] `loadAndRegisterIcon("db", svgString)` で解析＋登録が一括で行われる
- [ ] `loadAndRegisterIcons({ "a": svg1, "b": svg2 })` で複数アイコンを一括登録できる
- [ ] 登録後 `getShape("db")` と `getIconDef("db")` の両方が有効な値を返す

### AC-5: テキストスロットによるテキスト配置

- [ ] アイコンシェイプのノードで、`labelSlot` の座標（viewBox→ノード空間に変換済み）にラベルが配置される
- [ ] `descriptionSlot` がある場合、説明テキストがその座標に配置される
- [ ] テキストスロットがないアイコンでは、従来通りノード中央にテキストが配置される
- [ ] 組み込みシェイプ（box, person 等）のテキスト配置は影響を受けない

### AC-6: app 側の統合

- [ ] `useKarasu.ts` でマニフェスト読み込みとアイコン登録がモジュールロード時に実行される
- [ ] `.krs.style` で `shape: database` を指定するとアイコンシェイプが使用される
- [ ] `vite-env.d.ts` で `?raw` / JSON インポートの型が正しく解決される
- [ ] `npm run build` が app を含めて成功する

### AC-7: SvgIconDef の拡張

- [ ] `SvgIconTextSlot` 型が `{ x: number, y: number, textAnchor?: string }` を持つ
- [ ] `SvgIconDef` に `labelSlot?: SvgIconTextSlot` と `descriptionSlot?: SvgIconTextSlot` が追加されている
- [ ] `getIconDef(name)` でアイコン定義（テキストスロット含む）を取得できる

### AC-8: 公開API

- [ ] `parseSvgIcon`, `loadAndRegisterIcon`, `loadAndRegisterIcons` が `@karasu/core` からエクスポートされている
- [ ] `resolveIconManifest`, `IconManifest`, `IconManifestEntry` が `@karasu/core` からエクスポートされている
- [ ] `getIconDef`, `SvgIconTextSlot` が `@karasu/core` からエクスポートされている

## 検証方法

```bash
npm run build        # ビルド成功（core + app）
npx vitest run       # 全テスト通過（83テスト、svg-icon-loader.test.ts の11テスト含む）
```

### 手動確認

1. `packages/core/icons/database.svg` をブラウザで開き、アイコンとサンプルテキストが表示されることを確認
2. app で以下の `.krs.style` を使用し、database シェイプが描画されることを確認：
   ```css
   service {
     shape: database;
   }
   ```
