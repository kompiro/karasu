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
- 任意のサンプル `.krs` ファイル。本 AT では `examples/ja/ec-platform/05-multifile/system.krs` を使用する

## 検証項目

### 1. 既定（マルチページ）出力

```
node packages/cli/dist/index.js render examples/ja/ec-platform/05-multifile/system.krs \
  --format drawio --output /tmp/ecplatform.drawio
```

- [ ] コマンドが終了コード 0 で完了する
- [ ] `/tmp/ecplatform.drawio` が生成される
- [ ] ファイル冒頭が `<?xml version="1.0" encoding="UTF-8"?>` で始まり、`<mxfile host="karasu" ...>` が続く
- [ ] 少なくとも以下のページが含まれる:
  - `<diagram id="system" name="System">` — トップレベル
  - `<diagram id="system_..." name="System ▸ ..."` — system / service / domain / usecase の各ドリルダウン
  - `<diagram id="deploy" name="Deploy">` — deploy ブロックがあるとき
  - `<diagram id="org" name="Organization">` — organization ブロックがあるとき

> manual / visual review — マルチページ XML の冒頭・diagram 要素の存在は CLI 出力を目視確認する必要がある（ec-platform 一式に依存）。

### 2. draw.io で開く

- [ ] `/tmp/ecplatform.drawio` を draw.io (desktop または diagrams.net Web) で開ける
- [ ] パース / ロードエラーが表示されない
- [ ] System / 各 drill-down / Deploy / Organization のタブが切り替えられる（マルチページ出力の場合）
- [ ] 各 drill-down ページが「System ▸ ECPlatform ▸ Checkout」のようにパンくず状の名前になっている
- [ ] Organization ページで、team が入れ子のコンテナ、member が中のノードとして描画される
- [ ] 各ノードが karasu の SVG 描画と似た位置関係で配置されている（厳密なピクセル一致は不要）
- [ ] コンテナ（system / service）が入れ子の枠として描画され、中のノードが一緒に動く

> manual / visual review — 第三者ツール（draw.io / diagrams.net）での描画結果の検証は外部ツールに依存するため自動化対象外。

### 3. kind の可視化

- [ ] 各ノードのラベル上部に `«service»` / `«domain»` / `«user»` のような
      UML 風ステレオタイプが小さな灰文字で表示される
- [ ] `user` ノードが UML アクター形（棒人間）で描画される
- [ ] `database` / `table` / `bucket` / `storage` ノードがシリンダー形で描画される
- [ ] `usecase` ノードが楕円で描画される
- [ ] `service` / `domain` / deploy kind（oci / lambda / jar ...）が
      それぞれ異なる淡い背景色で塗り分けられている

> manual / visual review — UML ステレオタイプ・形状・配色の視覚的確認は draw.io でのレンダリング結果を目視で判定する。

### 4. アノテーション→スタイル

`examples/ja/migration/` のように `@external` / `@deprecated` / `@migration_target` を含むサンプルで確認する:

- [ ] `@external` が付いたノードは灰色・破線で描画される
- [ ] `@deprecated` が付いたノードは赤系ストロークと斜体ラベルで描画される
- [ ] `@migration_target` が付いたノードはオレンジ系の強調スタイルになる
- [ ] 付与された全ての annotation が `@name` の小さなオレンジ文字として
      ラベル上に表示される（スタイル未定義のカスタム annotation も含む）
- [ ] tag が付いているノードで、`#name` の小さな青文字ラベルが表示される
      （例: `examples/ja/migration/` の `#human` タグ）

> manual / visual review — annotation / tag 由来のスタイル変化（破線・斜体・色味）は draw.io 描画上の視覚チェック。

### 5. 単一 view の指定

```
node packages/cli/dist/index.js render examples/ja/ec-platform/05-multifile/system.krs \
  --format drawio --view system --output /tmp/system-only.drawio
```

- [ ] 出力された `.drawio` ファイルに含まれる `<diagram>` は 1 つだけ

> manual / visual review — `--view system` で生成した出力ファイルの diagram 要素数を実コマンドで確認する。

### 6. org view 単独指定

```
node packages/cli/dist/index.js render examples/ja/org/system.krs \
  --format drawio --view org --output /tmp/org-only.drawio
```

- [ ] コマンドが終了コード 0 で完了する
- [ ] 出力された `.drawio` に `<diagram id="org" ...>` のみが含まれる（system / deploy は出ない）

> manual / visual review — `--view org` 単独指定の出力検証は実 CLI 実行を要するため自動化対象外。

### 7. 未知フォーマットのリジェクト

```
node packages/cli/dist/index.js render examples/ja/ec-platform/05-multifile/system.krs \
  --format xyz
```

- [ ] コマンドが終了コード 1 で終了する
- [ ] stderr に `unknown --format "xyz"` が含まれる

> manual / visual review — エラーパスの exit code / stderr 文言は実 CLI 実行で確認する。

### 8. karasu 固有メタデータの保持

draw.io で任意のセルを右クリック → Edit Geometry / Edit Style ではなく、左サイドバー「Arrange」タブまたは XML 直接閲覧で:

- [ ] セル要素に `data-karasu-id`、`data-karasu-kind` のカスタム属性が残っている
- [ ] 集約された implicit edge（"N domain edges" ラベルが付いたエッジ）に `data-karasu-aggregated` が残っている

> manual / visual review — draw.io 内のセル属性は GUI 経由でしか直接確認できないため目視レビューが必要。

## 備考

- 本 AT では `org` view は対象外。org view 対応は別 Issue で扱う（`docs/design/drawio-export.md` 参照）。
- `.krs` は唯一の真実源であり、draw.io 側で編集した結果は karasu に戻らない。round-trip は非目標。
