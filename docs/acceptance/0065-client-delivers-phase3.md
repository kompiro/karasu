---
type: product
---

# AT-0065: `service.delivers` (Phase 3 of `client` kind)

## 概要

`service.delivers <ClientId>[, ...]` プロパティが parser / validator / renderer の各層を
通過し、レンダリング結果に通信エッジとは見分けが付く線で「配信」関係が表れることを確認する
（Issue [#853](https://github.com/kompiro/karasu/issues/853)、設計は
`docs/adr/20260428-06-client-mcp-modeling.md` の Q4 / Phase 3）。

自動テストで covered:

- parser が `delivers <Id>` / `delivers A, B` を受理して `ServiceNode.properties.delivers` に格納する
- 非 service ノードに `delivers` を書くと診断エラーになる
- 解決対象が `client` でない場合に `delivers-target-not-client` 警告が出る
- formatter が `delivers ...` 行をラウンドトリップ可能に出力する
- `extractView` が `service -> client` の synthetic edge を `tags: ["delivers"]` で生成する

## 前提条件

- 本 Phase 3 の変更が PR ブランチに含まれている
- アプリを起動できる

## 受け入れ条件

### 1. BFF サンプルが描画される

`examples/feature-samples/bff-delivers.krs` を ProjectMode で開き、system 図に以下が表示されることを目視確認する。

1. `Customer`（user）/ `NextServer`（service）/ `WebApp`（client）/ `OrderService`（service）の 4 ノードが見える
2. `Customer → WebApp` / `WebApp → NextServer` / `NextServer → OrderService` の通信エッジが描かれる
3. **`NextServer → WebApp` の `delivers` 関係が、通信エッジとは別の線種（破線）と別の色で描かれている**
4. 警告パネルに `delivers-target-not-client` などのエラーが出ていない

### 2. ターゲットの誤りで警告が出る

エディタで以下を入力する:

```krs
system S {
  service NextServer {
    delivers Missing
  }
}
```

警告パネルに「service "NextServer" delivers target "Missing" is not a client node」相当のメッセージが出る（言語切替時に日本語化される）。
