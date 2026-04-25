# クライアント / MCP を system 図でどう表現するか

- **日付**: 2026-04-25
- **ステータス**: 検討中
- **関連**: Issue #823, `docs/spec/syntax.md`, `docs/concepts.md`

## 背景・課題

実際の利用シーンでは、ユーザーは直接バックエンドサービスを叩かない。
人間ユーザーは **モバイルアプリ / ブラウザアプリ / デスクトップクライアント** 経由で API を呼び、
AI エージェントは **MCP サーバー** 経由で機能を呼び出す。

```
Customer (human) ──▶ MobileApp ──▶ OrderService
                ──▶ WebApp    ──▶ OrderService
Assistant (ai)   ──▶ OrderMcp  ──▶ OrderService
```

現在の karasu は `user [human|ai]` と `service` は表現できるが、**間に挟まる「クライアント面」を表現する第一級の語彙がない**。
結果として、現状は以下のいずれかになる:

1. `user → service` と書いて、クライアント層を黙って消す（情報量を失う）
2. クライアントを `service` として書く（「自社プロダクトだがユーザー端末で動く」というセマンティクスが落ちる）
3. `user [ai]` の中に MCP を書こうとしても、子ノードを持てる仕様になっていない

## 制約・前提

- 論理（system）・物理（deploy）・組織（organization）の三軸を分けるという原則は維持する（`docs/concepts.md`）
- 既存の `.krs` を壊さない（破壊的変更は最終手段）
- system 図の可読性を保つ。三層（user → client → service）に増えてもレイアウトが破綻しないこと
- AI エージェント自身は karasu 利用組織のものではない（外部のアシスタント・コーディングエージェント等）。「我々が提供する MCP サーバー」と「それを使う AI ユーザー」は別ノード
- 「クライアント」は論理層の概念とする。物理側（deploy）でモバイルアプリ・SPA・デスクトップアプリをどう実体化するかは別軸の議論

## 検討した選択肢

### 案 A: 新しい kind `client` を導入する

`system` の中で `service` と並ぶ第一級の論理ノードとして `client` を追加。
`[mobile|web|desktop|mcp]` のサブタイプタグで種類を分類する。

```
system ECommerce {
  user Customer [human]
  user Assistant [ai]

  client MobileApp [mobile] {
    label "iOS / Android アプリ"
  }
  client WebApp [web] {
    label "ブラウザ SPA"
  }
  client OrderMcp [mcp] {
    label "Order MCP server"
  }

  service OrderService { ... }

  Customer -> MobileApp
  Customer -> WebApp
  Assistant -> OrderMcp
  MobileApp -> OrderService
  WebApp    -> OrderService
  OrderMcp  -> OrderService
}
```

**メリット**
- セマンティクスがコードから読み取れる（grep / 集計が容易）
- 専用の形・色・アイコンを割り当てられる（icon mode で電話・ブラウザ・ロボット）
- 物理側で「クライアントは特殊な配置先（端末・MCP ホスト）」と区別しやすい

**デメリット**
- 仕様の表面積が増える（kind 追加 → パーサ・スタイル・リファレンス・i18n すべてに波及）
- 「では `client` の子ノードは何を持てる？」というネスト議論を新たに開く
- 他の概念（admin UI、CLI、外部システムからのコールバックなど）も後から `client` に押し込まれる圧力が生まれる

### 案 B: 既存の `service` + tag で表現する

`service` のままで、`[client]` `[mcp]` 等のタグで意味付けし、レンダラはタグを見て描画を切り替える。

```
service MobileApp [client] [mobile] {
  label "iOS / Android アプリ"
}
service OrderMcp [mcp] {
  label "Order MCP server"
}

Customer -> MobileApp
MobileApp -> OrderService
```

**メリット**
- 構文変更ゼロ。既存パーサー・バリデータ・スタイル機構をそのまま使える
- 「クライアントも自社が作る独立したビジネス機能の単位」という解釈が自然な現場には素直
- 後から「やっぱり kind に昇格させる」決断は、タグ → kind の機械的な書き換えで可能（逆は難しい）

**デメリット**
- `service` の意味が広がりすぎる。「バックエンドサービス」と「クライアントサービス」を視覚で見分けにくい
- タグはあくまで属性なので、構造的制約（例: client は domain を持てない）をパーサで弾けない
- スタイルシートでタグ駆動の差し替えを書く前提になる（運用負荷）

### 案 C: `user` を拡張してエージェント側の MCP を `user` のサブノードに置く

AI ユーザーから見たときの MCP は「そのエージェントが触る世界」なので、`user` の子として書く。

```
user Assistant [ai] {
  mcp OrderMcp {
    realizes OrderService
  }
}
```

**メリット**
- 「AI エージェントは人間とは違って、こちらが提供する MCP を介して触る」というセマンティクスが構造で表現される
- 人間ユーザーには使わないので影響範囲が局所的

**デメリット**
- モバイル/ウェブ/デスクトップという人間側のクライアントは依然として表現できない（B か A の併用が必要）
- `user` ノードが「誰か」と「その人がどう触るか」を兼ね、責務が混ざる
- MCP は実体としてはバックエンドにデプロイされるサービスである（`realizes` の方向と矛盾しやすい）

## 比較

| 観点 | 案 A: `client` kind | 案 B: tag のみ | 案 C: `user` 拡張 |
|---|---|---|---|
| 表現できる範囲 | mobile / web / desktop / mcp すべて | すべて（運用次第） | mcp のみ |
| 既存破壊 | なし（追加） | なし | なし（追加プロパティ） |
| 仕様変更コスト | 大（kind 追加） | 極小 | 中 |
| 視覚的識別 | 強い（kind 別アイコン） | 弱（タグ次第） | 弱 |
| 構造的制約の検査 | 可能 | 不可 | 可能（局所） |
| 物理（deploy）への波及 | 必要（client 種別の配置先を考える） | 任意 | 不要（user 側の話） |
| 後戻りやすさ | 後でタグへ降格は容易ではない | 後で kind へ昇格は容易 | C 単独では足りないので併用前提 |

## 現時点の方針（推奨）

**案 B から始め、必要が確認できた時点で案 A に昇格させる**。

理由:
- 構文の表面積を増やさずに、ユーザーが書きたいと言っている表現自体は今日から可能
- 「`[client]` `[mcp]` タグを実際にどう書きたいか」が examples / 利用者から集まったあとで kind 昇格を判断できる
- B → A への移行は「タグ付き service」を「client kind」に書き換える機械変換で済む（逆方向は意味の縮退になる）

伴う作業:
1. `docs/spec/tags-annotations.md` に `[client]` `[mobile]` `[web]` `[desktop]` `[mcp]` を予約タグとして追記
2. ビルトインスタイルで `service[client]` `service[mcp]` などの選択子に違う色/形を割り当て、視覚的に分離
3. `examples/` に「client + MCP」を含む小さなサンプルを 1 本追加
4. system 図のレンダラがこれらタグを見て、エッジ方向や配置のヒントに使うかは別途検討

将来、案 A へ昇格する判断材料:
- examples / 実利用で「タグでは限界」（構造的検査が欲しい・物理側で別扱いしたい等）が再現性を持って観測されること
- B のスタイルシート対応で発散が見える（書き手によって `[client]` `[frontend]` `[ui]` のような揺れが大量発生する等）

## エッジ方向と意味について

人間ユーザーは「使う」のでクライアント方向への矢印は素直。
AI ユーザーが MCP に向かうエッジも同様。
クライアント → サービス側のエッジは「呼び出す / 依存する」の既定セマンティクスでよく、新しい `edge kind` は導入しない方針とする。

## 物理側との関係（メモ）

物理側（deploy）に `mobile-app` / `spa` / `desktop-app` / `mcp-server` のような新 kind を追加するかは本ドキュメントのスコープ外とする。
論理側で `service[client]` と書けても、deploy 側で `oci` / `assets` / `artifact` のいずれかに `realizes` で繋ぐことは可能なので、当面は既存 deploy kind を流用できる。
新 kind が必要になるかは、論理側の運用が落ち着いてから判断する。

## 想定されるユースケースでの検証

```
system ECommerce {
  user Customer [human]
  user PartnerAgent [ai]

  service MobileApp [client] [mobile]
  service WebApp [client] [web]
  service AdminDesktop [client] [desktop]
  service OrderMcp [mcp]

  service OrderService {
    domain Order { ... }
  }

  Customer -> MobileApp
  Customer -> WebApp
  Customer -> AdminDesktop
  PartnerAgent -> OrderMcp
  MobileApp     -> OrderService
  WebApp        -> OrderService
  AdminDesktop  -> OrderService
  OrderMcp      -> OrderService
}
```

- 三層（user → client → backend service）が構文として表現できる
- AI エージェントの経路と人間の経路が並列に並ぶ
- どれが「クライアント面」かはタグで判定でき、レンダラがアイコン/色を振れる

## 未解決の問い

1. **B 案の予約タグセットは妥当か**
   - `[client]` を必須として `[mobile]/[web]/[desktop]` をサブタイプとするのか、`[mobile-client]` のように 1 タグで表すか。
2. **「外部からのコールバック / 第三者 SaaS」もここに含めるか**
   - Webhook で叩かれる API、SDK 統合などは「クライアント」と呼ぶか別概念にするか。
3. **MCP は `[mcp]` 単独で十分か**
   - `[client] [mcp]` のように一般化するか、別カテゴリとして扱うか。
4. **system 図のレイアウトヒント**
   - クライアント層を強制的に user とサービスの間に置く（自動レイアウト）か、ユーザーの記述順に任せるか。
5. **examples のレベル**
   - `examples/getting-started/` に組み込むか、別の `examples/client-mcp/` を作るか。
