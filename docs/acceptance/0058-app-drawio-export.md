---
type: product
---

# AT-0058: App — draw.io Export from Preview Toolbar

## 概要

プレビュー UI のエクスポートメニューから `.drawio` ファイルをダウンロードでき、
ダウンロードした `.drawio` が draw.io / diagrams.net で開けることを確認する。
CLI 側の draw.io エクスポート (#649 / AT-0057) と同じ出力を、端末を起動せず
ブラウザだけで得られることが本 AT の価値。

## 前提条件

- `pnpm -w --filter @karasu-tools/app build` が成功している、または preview UI が起動している
- プロジェクトが読み込まれている状態（Memory Mode / Project Mode どちらでも可）

## 検証項目

### 1. メニューからのエクスポート

- [ ] プレビュー上部のツールバー右側に `↓ Export SVG` と `▾` の分割ボタンが表示されている
- [ ] `▾` をクリックするとドロップダウンに以下 3 項目が並ぶ:
  - Export Drill-down SVG
  - Export All Diagrams SVG
  - **Export draw.io (mxGraph XML)** ← 今回追加
- [ ] `Export draw.io (mxGraph XML)` をクリックすると `.drawio` ファイルがダウンロードされる
- [ ] ダウンロードファイル名が `.drawio` 拡張子で終わっている

### 2. 中身の妥当性

- [ ] ダウンロードした `.drawio` をテキストエディタで開くと `<mxfile host="karasu" ...>` で始まる XML である
- [ ] `<diagram>` 要素が複数含まれる（system のドリルダウン各レイヤ / Deploy / Organization 相当）
- [ ] ノード cell に `data-karasu-id` / `data-karasu-kind` が付いている

### 3. draw.io で開く

以下のいずれかで開いて確認:

- diagrams.net Web（https://app.diagrams.net/）
- VS Code 拡張 `hediet.vscode-drawio`
- draw.io Desktop

- [ ] ロードエラーが出ない
- [ ] 左下のタブで System ▸ ... / Deploy / Organization を切り替えできる
- [ ] 各ノードが kind に応じた shape / 色で描画されている（`user` = actor、`database` = cylinder 等）
- [ ] `«service»` / `«domain»` などのステレオタイプラベル、`@annotation` / `#tag` バッジが表示されている

### 4. 無効化条件

- [ ] プロジェクトが読み込まれていない（`entryPath` 未設定）状態では
      `Export draw.io (mxGraph XML)` メニュー項目が `disabled` 状態になっている

### 5. CLI との一致

同じ `.krs` に対して CLI と app のエクスポート結果が一致することを確認:

```bash
karasu render <entry> --format drawio --output /tmp/cli.drawio
# app からダウンロードしたファイルを /tmp/app.drawio として保存
diff /tmp/cli.drawio /tmp/app.drawio
```

- [ ] `diff` がファイル末尾の改行以外で差を出さない（同じパイプラインを通るため）

## 備考

- 本 AT は「app から draw.io 出力を取り出せること」を確認する受入テスト。
  draw.io 側の個別表現（shape / 色 / バッジ）の詳細は AT-0057 でカバー済み。
- i18n（ボタンラベル多言語化）は follow-up で扱う。
