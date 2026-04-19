---
type: product
---

# AT-0057: draw.io Export (mxGraph XML)

## 概要

`karasu render <file> --format drawio` がプロジェクトを draw.io (mxGraph XML) 形式に
エクスポートし、draw.io desktop / web で開いて閲覧・編集できることを確認する。
karasu のレイアウト座標を流用した「レイアウト調整の逃げ道」として機能する。

## 前提条件

- `pnpm build` が成功している
- draw.io desktop (https://www.diagrams.net/) または diagrams.net Web 版にアクセスできる
- 任意のサンプル `.krs` ファイル。本 AT では `examples/ec-platform/05-multifile/system.krs` を使用する

## 検証項目

### 1. 既定（マルチページ）出力

```
node packages/cli/dist/index.js render examples/ec-platform/05-multifile/system.krs \
  --format drawio --output /tmp/ecplatform.drawio
```

- [ ] コマンドが終了コード 0 で完了する
- [ ] `/tmp/ecplatform.drawio` が生成される
- [ ] ファイル冒頭が `<?xml version="1.0" encoding="UTF-8"?>` で始まり、`<mxfile host="karasu" ...>` が続く
- [ ] `<diagram id="system" name="System">` と `<diagram id="deploy" name="Deploy">` の 2 ページが含まれる（`system.krs` に deploy ブロックが無い場合は system ページのみでも可）

### 2. draw.io で開く

- [ ] `/tmp/ecplatform.drawio` を draw.io (desktop または diagrams.net Web) で開ける
- [ ] パース / ロードエラーが表示されない
- [ ] System / Deploy タブが切り替えられる（マルチページ出力の場合）
- [ ] 各ノードが karasu の SVG 描画と似た位置関係で配置されている（厳密なピクセル一致は不要）
- [ ] コンテナ（system / service）が入れ子の枠として描画され、中のノードが一緒に動く

### 3. アノテーション→スタイル

`examples/migration/` のように `@external` / `@deprecated` / `@migration_target` を含むサンプルで確認する:

- [ ] `@external` が付いたノードは灰色・破線で描画される
- [ ] `@deprecated` が付いたノードは赤系ストロークと斜体ラベルで描画される
- [ ] `@migration_target` が付いたノードはオレンジ系の強調スタイルになる

### 4. 単一 view の指定

```
node packages/cli/dist/index.js render examples/ec-platform/05-multifile/system.krs \
  --format drawio --view system --output /tmp/system-only.drawio
```

- [ ] 出力された `.drawio` ファイルに含まれる `<diagram>` は 1 つだけ

### 5. org view は未対応

```
node packages/cli/dist/index.js render examples/org/index.krs \
  --format drawio --view org
```

- [ ] コマンドが終了コード 1 で終了する
- [ ] stderr に `--format drawio does not support --view org` 旨のメッセージが出る

### 6. 未知フォーマットのリジェクト

```
node packages/cli/dist/index.js render examples/ec-platform/05-multifile/system.krs \
  --format xyz
```

- [ ] コマンドが終了コード 1 で終了する
- [ ] stderr に `unknown --format "xyz"` が含まれる

### 7. karasu 固有メタデータの保持

draw.io で任意のセルを右クリック → Edit Geometry / Edit Style ではなく、左サイドバー「Arrange」タブまたは XML 直接閲覧で:

- [ ] セル要素に `data-karasu-id`、`data-karasu-kind` のカスタム属性が残っている
- [ ] 集約された implicit edge（"N domain edges" ラベルが付いたエッジ）に `data-karasu-aggregated` が残っている

## 備考

- 本 AT では `org` view は対象外。org view 対応は別 Issue で扱う（`docs/design/drawio-export.md` 参照）。
- `.krs` は唯一の真実源であり、draw.io 側で編集した結果は karasu に戻らない。round-trip は非目標。
