---
type: product
---

# AT-0006: Built-in Style & Reference Panel

- **日付**: 2026-03-23
- **関連 Issue**: #8
- **関連設計**: [ADR-20260322-01](../adr/20260322-01-builtin-style-and-reference.md)

## 検証コマンド

```bash
npm run build    # TypeScript + Vite ビルド成功
npx vitest run   # 230 テスト通過
npm run lint     # 新規の warning/error なし
npm run format:check  # フォーマット OK
```

## AC-1: ビルトインスタイルの適用（Phase 1）

### AC-1.1: ユーザースタイルなしでもデフォルト描画される

- [ ] Memory モードでアプリを開き、サンプル KRS が正しく描画されることを確認
- [ ] user ノードが人型シェイプ（`shape: user`）で表示される
- [ ] service ノードが青系ボックスで表示される
- [ ] `[external]` タグ付きノードが破線枠・グレー系で表示される
- [ ] async エッジ（`-->`）が破線矢印で表示される

### AC-1.2: リソースタグによるシェイプ自動適用

- [ ] KRS エディタで `resource DB "DB" [table]` を追加し、cylinder シェイプで表示されることを確認
- [ ] `resource Q "Queue" [queue]` → queue シェイプ
- [ ] `resource API "API" [api]` → hexagon シェイプ
- [ ] `resource S3 "Storage" [storage]` → cloud シェイプ

### AC-1.3: ユーザースタイルによるオーバーライド

- [ ] Project モードで `.krs.style` ファイルを作成し、`resource { shape: hexagon; }` と記述
- [ ] resource ノードが hexagon シェイプで表示される（ビルトインの box を上書き）

### AC-1.4: 存在しないスタイルファイルのインポート

- [ ] `.krs` ファイルに `@import "nonexistent.krs.style"` を記述
- [ ] 警告パネルに warning（error ではない）が表示される
- [ ] 描画はビルトインスタイルで正常に行われる

## AC-2: 冗長なデフォルトの削除（Phase 2）

### AC-2.1: 新規プロジェクトにスタイルファイルが作成されない

- [ ] Project モードで新規プロジェクトを作成
- [ ] ファイルツリーに `default.krs.style` が存在しないことを確認
- [ ] `index.krs` に `@import` 行が含まれていないことを確認
- [ ] 描画が正常に行われることを確認

## AC-3: リファレンスパネル（Phase 4）

### AC-3.1: パネルの開閉

- [ ] ブレッドクラム右端の "?" ボタンをクリック → リファレンスパネルがスライドイン
- [ ] パネルの "×" ボタンまたはオーバーレイ部分をクリック → パネルが閉じる

### AC-3.2: Syntax タブ

- [ ] ノード種別一覧テーブルが表示される（system, service, domain, usecase, resource, user）
- [ ] 各種別の含有関係と使用可能プロパティが表示される
- [ ] エッジ構文の例が表示される

### AC-3.3: Styles タブ

- [ ] セレクタ構文と詳細度スコアの一覧が表示される
- [ ] スタイルプロパティ一覧が表示される（background-color, shape 等）
- [ ] シェイプキーワード一覧が表示される

### AC-3.4: Tags & Annotations タブ

- [ ] タグ一覧テーブルが表示される（external, async, sync, human, ai, table, queue, api, storage）
- [ ] アノテーション一覧テーブルが表示される（deprecated, new, experimental, migration_target）
- [ ] 各アノテーションにバッジプレビューが表示される

### AC-3.5: Built-in Theme タブ

- [ ] ビルトインスタイルシートのソースコードが表示される
- [ ] "Copy" ボタンでクリップボードにコピーされる
- [ ] コピー後 "Copied!" と一時的に表示される

### AC-3.6: 両モード対応

- [ ] Memory モードでリファレンスパネルが動作する
- [ ] Project モードでリファレンスパネルが動作する
