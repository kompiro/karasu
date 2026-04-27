---
type: product
---

# AT-0063: Deploy-only file renders without a system block

## 概要

`system` ブロックを持たず `deploy` ブロックのみを含む `.krs` ファイルを開いたとき、
Deploy タブが自動で選択され、deploy 図が正しく描画されることを確認する
（Issue [#766](https://github.com/kompiro/karasu/issues/766)）。

## 前提条件

`examples/deploy-only/index.krs` に以下の内容が存在する。

```krs
deploy Production {
  label "本番環境"

  oci "web" {
    label "Web フロント"
    image "web:1.0.0"
    runtime "Node.js 22 / Next.js"
    realizes Storefront
  }

  lambda "order-handler" {
    label "注文ハンドラ"
    runtime "Node.js 22"
    realizes OrderAPI
  }

  assets "static-assets" {
    label "静的アセット"
    runtime "CloudFront / S3"
  }
}
```

## 受け入れ基準

### 1. deploy-only ファイルを開くと Deploy タブが自動で選ばれる

- **操作**: `examples/deploy-only/index.krs` をプレビューに読み込ませる。
- **期待**:
  - タブバーの `Deploy` がアクティブ状態になっている。
  - プレビューキャンバスに 3 つのコンテナ（`Storefront`, `OrderAPI`, そして `Unclassified`）が描画されている。
  - `"No nodes to render"` のプレースホルダが出ていない。

### 2. System タブは空だが操作可能である

- **操作**: タブバーで `System` をクリックする。
- **期待**:
  - System タブに切り替わり、`"No nodes to render"` のプレースホルダが表示される。
  - Deploy タブに戻ると、deploy 図がそのまま描画される。

### 3. 一度 System に戻したら再スイッチされない

- **操作**:
  1. deploy-only ファイルを開く（自動で Deploy になる）
  2. `System` タブに手動で切り替える
  3. ファイル内容を編集して再コンパイルを誘発する（例: `runtime "..."` を書き換える）
- **期待**:
  - 再コンパイル後も `System` タブが選択されたままで、自動的に Deploy に戻されない。

### 4. 別の deploy-only ファイルに切り替えると再び自動選択される

- **操作**: 同じプロジェクト内にもう1つ deploy-only の `.krs` を追加し、ファイルツリーで選び直す。
- **期待**:
  - 選び直した直後、Deploy タブが自動で選択される。

### 5. system + deploy のファイルでは自動選択されない（regression check）

- **操作**: `examples/deploy/system.krs` のような `system` と `deploy` 両方を含むファイルを開く。
- **期待**:
  - 既存挙動どおり、初期タブは `System` のままで自動スイッチされない。

## 自動化範囲

- `packages/app/src/hooks/useAutoSwitchToDeploy.test.ts` が Hook の分岐を網羅する。
- deploy-only ファイルのコア側レンダリングは既存の `packages/core/src/renderer/deploy-renderer.test.ts` で担保される。
- ユーザーが実際にタブ切替を視認する部分のみ手動検証とする。
