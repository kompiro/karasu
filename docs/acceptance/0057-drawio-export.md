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

- [x] コマンドが終了コード 0 で完了する
  > ✅ Automated — `packages/cli/src/render-drawio.e2e.test.ts` › `default --format drawio writes a multipage mxfile (host=karasu)`
- [x] `/tmp/ecplatform.drawio` が生成される
  > ✅ Automated — `packages/cli/src/render-drawio.e2e.test.ts` › `default --format drawio writes a multipage mxfile (host=karasu)`（`--output` 先のファイルを読み戻して assert）
- [x] ファイル冒頭が `<?xml version="1.0" encoding="UTF-8"?>` で始まり、`<mxfile host="karasu" ...>` が続く
  > ✅ Automated — `packages/cli/src/render-drawio.e2e.test.ts` › `default --format drawio writes a multipage mxfile (host=karasu)`
- [x] 少なくとも以下のページが含まれる:
  > ✅ Automated — `packages/cli/src/render-drawio.e2e.test.ts` › `default --format drawio writes a multipage mxfile (host=karasu)`（deploy / organization ブロックを持つ `examples/ja/getting-started/index.krs` で 4 種のページを assert）/ `multi-file project exports drill-down pages with breadcrumb names`（import 解決後の drill-down 名）。ページ分割の contract 自体は `packages/core/src/exporter/drawio/build-drawio-project.test.ts` › `emits one page per drillable level (top + each system / service / domain / usecase with children)` / `bundles system drill-down, deploy, and org pages together` が fence する。
  - `<diagram id="system" name="System">` — トップレベル
  - `<diagram id="system_..." name="System ▸ ..."` — system / service / domain / usecase の各ドリルダウン
  - `<diagram id="deploy" name="Deploy">` — deploy ブロックがあるとき
  - `<diagram id="org" name="Organization">` — organization ブロックがあるとき

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
  > 🟡 Partially automated — ステレオタイプ付きラベルの生成は `packages/core/src/exporter/drawio/drawio-style.test.ts` › `prefixes the kind as a UML-style stereotype above the label` で fence（draw.io 上の見た目は手動）
- [ ] `user` ノードが UML アクター形（棒人間）で描画される
  > 🟡 Partially automated — style 文字列は `packages/core/src/exporter/drawio/drawio-style.test.ts` › `applies kind-specific shape (user → umlActor)` および `packages/core/src/exporter/drawio/drawio-exporter.test.ts` › `applies kind-specific shape overrides (user → umlActor, database → cylinder3)` で fence（描画結果は手動）
- [ ] `database` / `table` / `bucket` / `storage` ノードがシリンダー形で描画される
  > 🟡 Partially automated — database は `packages/core/src/exporter/drawio/drawio-exporter.test.ts` › `applies kind-specific shape overrides (user → umlActor, database → cylinder3)` で fence（table / bucket / storage の style と描画結果は手動）
- [ ] `usecase` ノードが楕円で描画される
- [ ] `service` / `domain` / deploy kind（oci / lambda / jar ...）が
      それぞれ異なる淡い背景色で塗り分けられている
  > 🟡 Partially automated — service の fill は `packages/core/src/exporter/drawio/drawio-style.test.ts` › `applies kind-specific fill color (service)` で fence（他 kind の色と描画結果は手動）

> manual / visual review — UML ステレオタイプ・形状・配色の視覚的確認は draw.io でのレンダリング結果を目視で判定する。

### 4. アノテーション→スタイル

`examples/ja/migration/` のように `@external` / `@deprecated` / `@migration_target` を含むサンプルで確認する:

- [ ] `@external` が付いたノードは灰色・破線で描画される
  > 🟡 Partially automated — style 導出は `packages/core/src/exporter/drawio/drawio-style.test.ts` › `applies the external annotation overrides` で fence（描画結果は手動）
- [ ] `@deprecated` が付いたノードは赤系ストロークと斜体ラベルで描画される
  > 🟡 Partially automated — 赤系ストロークの優先は `packages/core/src/exporter/drawio/drawio-style.test.ts` › `lets annotation overrides win over kind overrides (deprecated wins on stroke)` で fence（斜体ラベルと描画結果は手動）
- [ ] `@migration_target` が付いたノードはオレンジ系の強調スタイルになる
  > 🟡 Partially automated — `@migration_target` バッジの出力は `packages/core/src/exporter/drawio/drawio-exporter.test.ts` › `surfaces container tags/annotations supplied via metadata` で fence（オレンジ強調スタイルの描画は手動）
- [ ] 付与された全ての annotation が `@name` の小さなオレンジ文字として
      ラベル上に表示される（スタイル未定義のカスタム annotation も含む）
  > 🟡 Partially automated — `packages/core/src/exporter/drawio/drawio-exporter.test.ts` › `includes tags and annotations from metadata in label and data attrs`（`@deprecated` バッジと `data-karasu-annotations` を assert。色味は手動）
- [ ] tag が付いているノードで、`#name` の小さな青文字ラベルが表示される
      （例: `examples/ja/migration/` の `#human` タグ）
  > 🟡 Partially automated — `packages/core/src/exporter/drawio/drawio-exporter.test.ts` › `includes tags and annotations from metadata in label and data attrs`（`#payment` / `#pii` バッジと `data-karasu-tags` を assert。青文字の見た目は手動）

> manual / visual review — annotation / tag 由来のスタイル変化（破線・斜体・色味）は draw.io 描画上の視覚チェック。

### 5. 単一 view の指定

```
node packages/cli/dist/index.js render examples/ja/ec-platform/05-multifile/system.krs \
  --format drawio --view system --output /tmp/system-only.drawio
```

- [x] 出力された `.drawio` ファイルに含まれる `<diagram>` は system 系ページ（トップ + 各 drill-down）のみで、deploy / org のページは含まれない
  > ✅ Automated — `packages/cli/src/render-drawio.e2e.test.ts` › `--view system emits only the system pages (top + drill-downs)`（deploy / organization ブロックを持つ入力で除外を assert）

> Note: system view のドリルダウン対応（§1 参照 — drillable な各レベルを別ページに emit）以降、`--view system` は 1 ページではなく system 系の複数ページを出力する。本 AT 初版の「`<diagram>` は 1 つだけ」は当時の単一ページ実装に基づく記述で、現仕様では view の選別（deploy / org を含めない）が §5 の contract。

### 6. org view 単独指定

```
node packages/cli/dist/index.js render examples/ja/org/system.krs \
  --format drawio --view org --output /tmp/org-only.drawio
```

- [x] コマンドが終了コード 0 で完了する
  > ✅ Automated — `packages/cli/src/render-drawio.e2e.test.ts` › `--view org emits only the org diagram and exits 0`
- [x] 出力された `.drawio` に `<diagram id="org" ...>` のみが含まれる（system / deploy は出ない）
  > ✅ Automated — `packages/cli/src/render-drawio.e2e.test.ts` › `--view org emits only the org diagram and exits 0`（`<diagram>` がちょうど 1 つであることも assert）。単一 org → `id="org"` の contract は `packages/core/src/exporter/drawio/build-drawio-project.test.ts` › `emits a single org page when there is one organization` が fence する。

### 7. 未知フォーマットのリジェクト

```
node packages/cli/dist/index.js render examples/ja/ec-platform/05-multifile/system.krs \
  --format xyz
```

- [x] コマンドが終了コード 1 で終了する
  > ✅ Automated — `packages/cli/src/cli-arg-validation.test.ts` › `render rejects unknown --format with exit 1`
- [x] stderr に `unknown --format "xyz"` が含まれる
  > ✅ Automated — `packages/cli/src/cli-arg-validation.test.ts` › `render rejects unknown --format with exit 1`（隣接する validation path も `render rejects unknown --theme with exit 1` / `diff rejects unknown --view with exit 1` で fence）

### 8. karasu 固有メタデータの保持

draw.io で任意のセルを右クリック → Edit Geometry / Edit Style ではなく、左サイドバー「Arrange」タブまたは XML 直接閲覧で:

- [x] セル要素に `data-karasu-id`、`data-karasu-kind` のカスタム属性が残っている
  > ✅ Automated — `packages/cli/src/render-drawio.e2e.test.ts` › `drawio cells carry data-karasu-* attributes (id / kind, aggregated on aggregated edges)`、および `packages/core/src/exporter/drawio/drawio-exporter.test.ts` › `renders a node as a vertex cell with absolute geometry when no container encloses it`
- [x] 集約された implicit edge（"N domain edges" ラベルが付いたエッジ）に `data-karasu-aggregated` が残っている
  > ✅ Automated — `packages/cli/src/render-drawio.e2e.test.ts` › `drawio cells carry data-karasu-* attributes (id / kind, aggregated on aggregated edges)`（`2 domain edges` ラベルの実 fixture で assert）、および `packages/core/src/exporter/drawio/drawio-exporter.test.ts` › `renders edges as edge cells with source/target and aggregated attribute when applicable`

## 備考

- `.krs` は唯一の真実源であり、draw.io 側で編集した結果は karasu に戻らない。round-trip は非目標。
