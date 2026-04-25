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

## 用語の整理: OAuth2 / OIDC からの解きほぐし

ノード種別の境界を曖昧にしたまま議論すると、後で「これは client なのか service なのか」で揉める。
OAuth2 / OIDC が既に同じ問いに答えを出している（**誰の委譲で動くか** で分類している）ので、その語彙に揃える。

| OAuth2/OIDC 概念 | 意味 | karasu でのノード |
|---|---|---|
| **End user (resource owner)** | 操作の主体である人間 | `user [human]` |
| **AI agent / autonomous client** | 人間の代行で動く自律ソフトウェア（Claude, Cursor 等の外部エージェント） | `user [ai]` |
| **Public client** | エンドユーザー端末で動く委譲型クライアント — モバイル / SPA / デスクトップ | `client` ノード（後述） |
| **Confidential client (user-acting)** | サーバーサイドの委譲型クライアント — BFF・サーバー側 SSR・MCP server を提供する側のゲートウェイ | 案による（後述） |
| **Client Credentials grant (M2M)** | ユーザー委譲なしのサービス間通信 — 外部 SaaS API 呼び出し、Webhook、バッチ取込 | `service` ↔ `service`（システム境界をまたぐ場合あり） |
| **Resource server** | API を提供する側 | `service`（と内部の `domain` / `usecase` / `resource`） |

この区分から導かれる結論:

1. **「クライアント」とは "エンドユーザーの委譲で動くソフトウェア"** に絞る。M2M はクライアントではない。
2. **外部 SaaS / Webhook 受信は M2M なので `service → service`** で表現する（追加語彙不要、システム境界をまたぐだけ）。
3. **MCP サーバーはこちら側で提供する `service`**。それを叩く AI エージェントは `user [ai]`。AI エージェント自体（Cursor 等）は我々のプロダクトに含まれないので `client` ノードでは*ない*。
4. **モデル化するのは「我々が出荷するクライアント」だけ** にする。ブラウザ Chrome や Cursor 自体はモデル化しない（人間ユーザーの場合に「Chrome」を書かないのと同じ）。

これにより `client` の定義が一意に決まり、`service` との境界が「ユーザー委譲かどうか」で割り切れる。
案 A における `client` kind 導入は語彙の重複ではなく、OAuth2 が既に切り出している境界をモデルに反映するだけになる。

## 検討した選択肢

### 案 A: 新しい kind `client` を導入する（OAuth2 の "client" 概念に対応）

`system` の中で `service` と並ぶ第一級の論理ノードとして `client` を追加。
**定義**: エンドユーザー（`user [human|ai]`）の委譲で動く、我々が出荷するソフトウェア。
`[mobile|web|desktop]` のサブタイプタグでフォームファクタを分類する（MCP サーバーは `service` 側）。

```
system ECommerce {
  user Customer [human]
  user PartnerAgent [ai]

  client MobileApp [mobile] {
    label "iOS / Android アプリ"
  }
  client WebApp [web] {
    label "ブラウザ SPA"
  }
  client AdminDesktop [desktop] {
    label "管理者向けデスクトップ"
  }

  service OrderService {
    domain Order { ... }
  }

  // 我々が提供する MCP サーバー（service として扱う）
  service OrderMcp {
    label "Order MCP server"
  }

  // 外部 SaaS（M2M、システム境界の外）
  service Stripe @external {
    label "Stripe API"
  }

  Customer     -> MobileApp     // 人間 → public client（Authorization Code + PKCE）
  Customer     -> WebApp
  Customer     -> AdminDesktop
  PartnerAgent -> OrderMcp      // AI エージェント → resource server（MCP）

  MobileApp    -> OrderService  // client → resource server（user-delegated）
  WebApp       -> OrderService
  AdminDesktop -> OrderService
  OrderMcp     -> OrderService  // MCP server → 内部サービス（user-delegated 続き）
  OrderService -> Stripe        // M2M（Client Credentials）
}
```

**メリット**
- 「OAuth2 の client 概念」と一対一に対応する明確な定義を持てる（曖昧さが消える）
- セマンティクスがコードから読み取れる（grep / 集計が容易）
- 専用の形・色・アイコンを割り当てられる（icon mode で電話・ブラウザ・ロボット）
- 「これは client か service か」の判定が委譲フローの有無で決まるため、書き手のバラつきが減る

**デメリット**
- 仕様の表面積が増える（kind 追加 → パーサ・スタイル・リファレンス・i18n すべてに波及）
- 「`client` の子ノードは何を持てる？」というネスト議論を新たに開く（最初は子なしでよい）
- 公開直後は examples / バリデータ未対応の領域があり、移行期間が必要

#### BFF（Next.js / Remix / Nuxt 等）の二重性

Next.js のような BFF は **サーバー（API routes・SSR・セッション保持）と、配信されるブラウザ側コード（React など）の二つの実体** を持つ。
OAuth2 でいうと、BFF サーバー側は **confidential client**（refresh token をサーバーに保管できる側）であり、配信されたブラウザコードは **public client**。両者はセキュリティモデル・保管できる秘匿情報・脅威面が異なるため、karasu の図でも *別ノードとして書ける* べき。

提案する書き方:

```
system ECommerce {
  user Customer [human]

  // BFF サーバー（confidential client + 内部 service の側面）
  service NextServer {
    label "Next.js BFF"
    delivers WebApp           // 配信物として WebApp client を公開
  }

  // 配信されるブラウザ側のクライアント（public client）
  client WebApp [web] {
    label "Customer SPA"
    handles Order, Catalog    // どの domain を扱うか（後述）
    storage cookie "session"
    storage localStorage "preferences"
    storage indexedDB "outbox"
  }

  service OrderService { domain Order { ... } domain Catalog { ... } }

  Customer  -> WebApp           // ユーザー操作
  WebApp    -> NextServer       // BFF への通信（同一オリジン Cookie）
  NextServer -> OrderService   // user-delegated で backend を叩く
}
```

要点:

- `service` 側は「BFF サーバー」、`client` 側は「ブラウザで動くアプリ」と名前で分ける（`Next…`／`WebApp` 等）。
- 二者の関係は新プロパティ `delivers <ClientId>` で明示（`service` から `client` への配信関係）。`realizes` の物理対応とは別軸の論理対応。
- 物理 deploy では BFF は単一の `oci` / `lambda` として実体化され、`realizes NextServer` で繋ぐ。配信されるアセットは `assets` ユニットとして `realizes WebApp` で繋ぐ。

##### `delivers` (配信) と通信エッジ (API 呼び出し) は別軸

`delivers` は **「このサーバーがこのクライアントを packaging して送り出す」配信関係** を表す。
`<ClientId> -> <ServiceId>` の通常エッジは **API 呼び出し / 依存** を表す。
両者は別軸なので、`delivers` が登場するのは「ある `service` が `client` の配信責任を持つ」場合に限る。

| アーキテクチャ | `delivers` | `client -> service` エッジ |
|---|---|---|
| 純粋 SPA / SSG | なし（CDN は logical な service ではなく deploy 側） | あり（直接 backend を叩く） |
| ネイティブモバイル / デスクトップ | なし（App Store / インストーラ経由でシステム境界外） | あり |
| BFF / SSR | あり（`NextServer delivers WebApp`） | あり（`WebApp -> NextServer`） |
| 古典的 SSR (CGI / JSP) | なし（client ノード自体がない） | なし（同上） |

純粋 SPA + Mobile + Desktop の例:

```
system ECommerce {
  user Customer [human]
  client WebApp [web]
  client MobileApp [mobile]
  client DesktopApp [desktop]
  service OrderService { ... }

  Customer     -> WebApp
  Customer     -> MobileApp
  Customer     -> DesktopApp
  WebApp       -> OrderService     // 直接 backend を叩く（delivers なし）
  MobileApp    -> OrderService
  DesktopApp   -> OrderService
}
```

ここでは `delivers` は一度も登場しない。配信は deploy 図側で `assets`（SPA）/ App Store 配布 / インストーラ等が担うが、それは logical な system 図のスコープ外。

#### `client` が保持できる構造

実装フェーズで具体化する想定だが、本ドキュメントで方向だけ決める:

| プロパティ / 子ノード | 意味 | 例 |
|---|---|---|
| `handles <DomainId>[, ...]` | このクライアントが UI 上で扱う domain への参照（drill-down 用ヒント） | `handles Order, Catalog` |
| `storage <kind> "<name>"` | クライアントがローカルに保持する状態 | `storage cookie "session"` |
| `storage` の `kind` | `cookie` / `localStorage` / `sessionStorage` / `indexedDB` / `opfs` / `keychain` / `file` | — |

`storage` は**セキュリティ議論で頻出**（例: refresh token を localStorage に置くか HttpOnly Cookie に置くかは既知の論点）なので、kind ごとに視覚化できると価値が出る。
`handles` は logical/physical の `realizes` と類似の「論理対応リンク」で、クライアント単独の図でも「このアプリが触るドメイン」が読み取れる。

これらは `client` の MVP には含めず、まず kind 導入と `delivers` だけ最初に入れ、`handles` / `storage` は別 PR で段階的に増やす。

#### SPA / SSG は単一の `client` で済む

BFF 二重性が問題になるのは「サーバー側に固有のロジックがある」ケース（SSR・API routes・セッション保持・エッジ関数）に限る。
**純粋な SPA**（例: バックエンド API を直接叩く React アプリ）や **SSG**（例: Astro / Hugo / Next.js の static export）は、配信元が CDN や静的ホストでありロジックを持たないため、`service` を立てる必要はなく `client [web]` 一つで表現できる。

```
system ECommerce {
  user Customer [human]
  client WebApp [web] {
    label "Customer SPA"
  }
  service OrderService { ... }

  Customer -> WebApp
  WebApp   -> OrderService     // 直接 backend に対して Authorization Code + PKCE
}
```

判定の目安（**ブラウザ側にアプリケーションとしての固有性があるか**で割る）:

| 形態 | `service` を立てるか | `client` を立てるか | `delivers` | 備考 |
|---|---|---|---|---|
| 純粋 SPA（CRA / Vite + React など） | 不要 | **必要** | なし | 配信は CDN（deploy 側） |
| SSG（Astro / Hugo / Next.js export） | 不要 | **必要** | なし | 配信は CDN |
| **BFF / SSR（Next.js / Remix / Nuxt）** | **必要** | **必要** | **あり** | サーバーが JS フロントを配信＋自身も confidential client |
| **サーバーフレームワーク + JS フロントエンド配信（Rails + React、Laravel + Vue 等）** | **必要** | **必要** | **あり** | 構造は BFF と同じ — アセットパイプラインが配信責任を持つ |
| Server Components + Server Actions のみ（ブラウザ JS 最小） | 必要 | 任意 | 任意 | クライアント側の意味が薄ければ省略可 |
| 軽量 JS shim 中心（Hotwire / Turbo / Livewire / HTMX） | 必要 | 大抵 不要 | 任意 | JS は転送補助で、アプリ識別を持たないため `service` のみで十分 |
| 純粋なサーバーレンダリング（ERB / JSP / Blade / 古典 PHP テンプレートのみ、JS なし） | **必要** | **不要** | なし | ブラウザは「サーバー出力のビュー」。Cookie セッションも server 側 |
| ネイティブモバイル / デスクトップアプリ | — | **必要** | なし | 配信物ではなくプロダクトそのもの。配布は App Store / インストーラ（deploy 側） |

判定基準（一行サマリ）:

> **アプリケーションサーバーが、ブラウザで独立して動く JS アプリケーションを出荷しているか？**
> Yes なら `service` + `client` + `delivers` の三点セット。No なら `service` 単独。

「独立して動く JS アプリケーション」の見分け方:
- ブラウザ側にルーター / 状態管理 / OAuth2 public client 識別 / ローカルストレージのいずれかが存在する → **Yes**
- JS は単なる転送ヘルパー（Hotwire / HTMX のように `<turbo-frame>` 等で部分更新するだけ） → **No**
- 「JS 1 ファイルしか書いてない」「Alpine.js でちょっと動的にしてるだけ」レベル → **No**

#### サーバーフレームワークが JS フロントエンドを配信する例

Rails の asset pipeline (Sprockets / Propshaft / jsbundling-rails) や Laravel の Vite 統合は、サーバーフレームワーク自身が React/Vue/Svelte 等の SPA バンドルを配信する。
これは **アセットパイプラインが配信責任を持つ BFF パターン** であり、Next.js / Remix と全く同じ書き方になる。

```
system ECommerce {
  user Customer [human]

  // Rails アプリ自身（API + アセット配信の二役）
  service RailsApp {
    label "Rails app server"
    delivers WebApp           // asset pipeline 経由で配信
  }

  client WebApp [web] {
    label "Customer SPA (React)"
  }

  service OrderService { ... }

  Customer -> WebApp
  WebApp   -> RailsApp
  RailsApp -> OrderService
}
```

Laravel + Vue、Django + React、Spring Boot + Vite なども同じ構造。
「アプリケーションサーバーが JS フロントを出荷する」かどうかが分岐点であり、サーバー側の言語・フレームワークは関係ない。

物理側（deploy）の対応:
- SPA / SSG: `assets` ユニットが `realizes WebApp`（CDN 配信）
- BFF / サーバーフレームワーク + JS フロント: サーバー側ユニット（`oci` / `lambda` / `war` 等）が `realizes RailsApp` 等、配信される JS バンドルの `assets` ユニットが `realizes WebApp`（二段構成）
- 純粋なサーバーレンダリング (JS なし) / 軽量 shim のみ: サーバー側ユニットが `realizes <ServiceId>` のみ。`client` ノードがないので一段

#### その他のアーキテクチャ判定

これまでの議論で出ていない代表的なパターンを整理する。判定基準は同じ — **ユーザー委譲があるか**、**ブラウザ/端末側に固有のプログラム識別があるか**、**配信責任を負う `service` があるか**。

##### 別種の `client`（フォームファクタ違い）

| 形態 | 推奨ノード | サブタイプタグ案 | メモ |
|---|---|---|---|
| CLI ツール / SDK（自社配布） | `client` | `[cli]` | 認証情報を `~/.config` などに保管 → `storage file "credentials"` |
| IoT 端末 / 専用端末 / KIOSK | `client` | `[device]` | 端末固有 ID を持つ Public client。証明書ベース認証も多い |
| ブラウザ拡張 (Chrome / Edge 拡張) | `client` | `[browser-extension]` | 我々が配布。ブラウザ host とは別の identity |
| マーケットプレイス型プラグイン (VS Code / Figma 等) | `client` | `[plugin]` | host アプリ内で動く我々のコード |
| 埋め込みウィジェット / 配布 SDK (Stripe Checkout、Intercom 等) | `client` | `[embed]` | 第三者サイトに埋め込まれて動く我々のコード |

これらすべて `[mobile|web|desktop]` と並ぶフォームファクタタグとして扱える。タグセットは順次拡張すれば良い。

##### 別種の `service`（外部・ゲートウェイ・処理基盤）

| 形態 | 推奨ノード | メモ |
|---|---|---|
| IdP / フェデレーション認証 (Auth0 / Okta / Cognito 等) | `service @external` | 我々の system 境界外。`OurService → IdP` で OIDC discovery / token issuance を表現 |
| API ゲートウェイ / リバースプロキシ (Kong / Envoy / nginx) | `service` | 単純な転送なら省略可。フィルタやレート制御を意識的に書きたいときだけノードにする |
| Edge worker (Cloudflare Workers / Vercel Edge) | `service`（必要なら `delivers`） | SSR / 配信責任があれば BFF パターンと同じ二重実体 |
| ストリーム / イベント処理 (Kafka consumer / Stream processor) | `service` | edge は Pub/Sub 型 (`service → broker → service`) になる |
| Webhook 受信エンドポイント | `service` | 第三者 SaaS から `service @external -> OurService` で表現 |
| MQTT / 専用プロトコル broker | `service @external` または社内 `service` | IoT パターンで `client [device] -> Broker -> backend service` |

##### 判定が微妙なハイブリッド

| 形態 | 推奨アプローチ |
|---|---|
| **チャットボット (Slack App / Teams Bot / GitHub App)** | 我々がホストする `service`（受信エンドポイント）として書く。エンドユーザーは Slack 等の host platform にログインしており、bot は token exchange / OBO で内部 service を叩く。ボットの「クライアント面」は host platform 内に閉じるので `client` ノードは作らない |
| **我々が外部 MCP サーバーを呼ぶ側になるケース** | 内部 `service` から外部 `service @external [mcp]` を呼ぶ M2M。`client` 概念は登場しない（ユーザー委譲ではなく Client Credentials） |
| **OBO (On-Behalf-Of) / Token Exchange (RFC 8693)** | `service → service` の通常エッジで表現。当面は装飾なし。将来的にユーザー委譲継続を強調したい場合は `@user-delegated` のような edge アノテーションを検討（本ドキュメント時点では追加しない） |
| **PWA (Progressive Web App)** | `client [web]` のまま。`storage opfs / indexedDB` を多用するという表現になる |
| **ハイブリッドモバイル (Capacitor / React Native)** | フォームファクタは `[mobile]`（App Store 配布、端末権限を使う）。Web 技術ベースであることは実装詳細であり論理層には出さない |

これらは MVP の最初のリリースには必須ではないが、サブタイプタグの予約セットを最初に広めに取るか、最低限から始めて追加するかの判断材料になる。

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

**案 A（`client` kind 新設）を採る**。

OAuth2/OIDC の語彙で「クライアント＝エンドユーザーから委譲されて動くソフトウェア」と一意に定義できることが分かったので、
タグ駆動（案 B）では失っていた境界 — 「これは委譲型か、M2M か」 — を kind に正面から載せる方が、書き手のバラつきが少なく長期的に安定する。
M2M はそのまま `service ↔ service`、外部 SaaS / Webhook も `service @external`（または既存の system 境界外サービス表現）で済むため、`client` 以外の新概念は要らない。

伴う作業（実装フェーズの粗いスケルトン、本ドキュメントでは決定だけ残す）:
1. `client` kind をパーサ・型・バリデータに追加（`[mobile|web|desktop]` サブタイプタグを予約）
2. ビルトインスタイル / icon mode で `client` 種別ごとのアイコンを割り当て（電話・ブラウザ・ノート PC 等）
3. `docs/spec/syntax.md` / `docs/concepts.md` を更新し、OAuth2 用語との対応を明記
4. `examples/` に「client + MCP service + 外部 SaaS」を含む小サンプルを 1 本追加
5. レンダラのレイアウト: `user → client → service` の三層を「user 行・client 行・service 行」のように緩く揃えるかは別途検証（最初は強制レイアウトしない）

破壊的変更ではない（既存 `.krs` で `client` を使っていなければ影響なし）。

## エッジ方向と意味について

`user → client` は「使う」、`client → service` は OAuth2 の Authorization Code 系で「ユーザー委譲で叩く」。
`service ↔ service` は M2M（Client Credentials）に対応。
セマンティクスとしては既定のエッジで十分で、新しい `edge kind` は導入しない。
将来、認可フロー別にエッジ装飾を変えたくなった場合のみ annotation で表現する余地を残す（`@user-delegated` / `@m2m` 等は本ドキュメント時点では決定しない）。

## 物理側との関係（メモ）

物理側（deploy）に `mobile-app` / `spa` / `desktop-app` / `mcp-server` のような新 kind を追加するかは本ドキュメントのスコープ外とする。
論理側で `client` と書けても、deploy 側で `oci` / `assets` / `artifact` のいずれかに `realizes` で繋げば既存 deploy kind を流用できる。
新 kind が必要かは、論理側の運用が落ち着いてから判断する。

## 想定されるユースケースでの検証

「案 A」セクションのコード例参照。
そこで以下が表現できることを確認した:

- 人間ユーザーが mobile / web / desktop の三系統のクライアントを使う（Authorization Code + PKCE）
- AI エージェントが我々の MCP サーバー（`service`）を叩く
- 我々のサービスが外部 SaaS（Stripe）を呼ぶ M2M（Client Credentials）
- 三層（user → client → backend service）が構文として明示される
- どれが client / service / external かが kind とアノテーションだけで読み解ける

## 未解決の問い

1. **`client` のサブタイプタグセット**
   - `[mobile]/[web]/[desktop]` で十分か、それとも `[cli]`（コマンドラインツール）`[device]`（IoT / 専用端末）等も最初から予約するか。
2. **外部サービスの表現**
   - 外部 SaaS / 第三者システムを `service @external` のようにアノテーションで表現するか、kind を分けるか。本ドキュメントは前者前提だが、別途決定が必要。
3. **MCP サーバーへのマーカー**
   - 我々の MCP サーバーは `service` で十分か、`@mcp` アノテーションで「これは AI エージェント向けプロトコル面」と明示すべきか。後者の方がレンダラで色/アイコンを差し替えやすい。
4. **`delivers` の構文・意味の正式化**
   - `service.delivers <ClientId>` で十分か、`<ServiceId> -delivers-> <ClientId>` のような新エッジ種別の方が grep 性が高いか。
5. **`storage` の kind セット**
   - `cookie / localStorage / sessionStorage / indexedDB / opfs / keychain / file` で過不足ないか。`secure-cookie` のような安全フラグを別軸で持つか。
6. **`handles` と既存ノード参照との整合**
   - `realizes`（deploy → logical）/ `owns`（team → logical）と並ぶ第三の論理対応リンクを追加することの是非。
7. **system 図のレイアウトヒント**
   - クライアント層を強制的に user とサービスの間に揃えるか、ユーザーの記述順に任せるか。
8. **examples の配置**
   - `examples/getting-started/` に統合するか、別の `examples/client-mcp/` を作るか。
9. **MVP のスコープ**
   - `client` kind と `[mobile|web|desktop]` サブタイプ + `delivers` だけを最初に出し、`handles` / `storage` は段階追加で良いか。
