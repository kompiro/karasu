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
