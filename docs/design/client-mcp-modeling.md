# クライアント / MCP を system 図でどう表現するか

- **日付**: 2026-04-25 (作成) / 2026-04-26 (Q1–Q14 全決定)
- **ステータス**: 決定済み（実装フェーズへ）
- **関連**: Issue #823, Issue #832 (認可は別 Issue), Issue #834 (security 関連トピックの親 — credential / cookie 等はそちらで扱う), Issue #837 (capability 軸 — camera / geolocation 等の能力許諾), `docs/spec/syntax.md`, `docs/concepts.md`

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
  service Stripe [external] {
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
    handles Order, Catalog            // どの domain を扱うか（後述）
    resource localStorage "preferences"
    resource indexedDB "outbox"
    // 認証 credential / cookie の表現は Issue #834 で扱う
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

#### `client` の内部構造: 現在案 vs `service` 同型案

`client` がどんな子要素・プロパティを持てるかには 2 つの設計方針がある。

##### 案 i: フラット参照型（先行ドラフト）

`client` 直下に `handles` 参照と `resource` プロパティをフラットに並べる。

```
client WebApp [web] {
  handles Order, Catalog
  resource localStorage "preferences"
  resource indexedDB "outbox"
}
```

| 要素 | 意味 |
|---|---|
| `handles <DomainId>[, ...]` | このクライアントが UI 上で扱う domain への*参照* |
| `resource <kind> "<name>"` | クライアントが保持する操作-tied storage（フラット） |

> 認証 credential / cookie / セッションといった HTTP プロトコル由来の cross-cutting な要素は本ドキュメントでは扱わない（Issue #834 を参照）。`resource` は **「特定の操作で読み書きするストレージ」** に絞る。

**`handles` の整合性検査ルール（重要）**:
`handles` を単なる飾りに終わらせないため、バリデータで以下のチェックを行う:

> 各 `client.handles <DomainId>` について、その `client` から出ている通信エッジ (`->`) の直接の到達先 `service` の子 `domain` 集合を集め、`DomainId` がそのいずれにも含まれなければ **warning** を出す。

これにより以下が静的に検出できる:

- ドメイン名のタイプミス
- 接続先 service の取り違え（例: `handles Order` と書いたが `CatalogService` にしか繋がっていない）
- エッジの貼り忘れ
- `service` 側でドメインが消えた／改名されたのに `client` 側を更新し忘れた

エッジのスコープに関する判断:

- **直接の到達先のみ**を対象とする（`client -> BFF service -> backend service` の推移閉包は取らない）。
- `delivers` エッジは「配信」であり API 呼び出しではないので、`handles` の検査では数えない。
- BFF パターンの推移はバリデータで暗黙に追わず、**`service` 側で再エクスポートを明示する** 構文 `service.handles` で表現する（次節）。

この検査が成立することで、`handles` は「書いておくと意味がある」レベルから「書かないと不整合が見えなくなる」レベルに格上げされる（`realizes` / `owns` と同格の役割になる）。

**`service` 側の `handles` は再エクスポート (passthrough) を表す**

BFF や API ゲートウェイは「自分が定義したわけではない domain を、呼び出し側に向けて公開する」ことが普通にある。
その場合 `client.handles X` は BFF を経由するため、BFF 側にも何らかの目印が必要になる。
`handles` キーワードを `service` でも許容し、**「呼び出し側に対して expose する domain」** という意味で統一する。

```
service OrderService {
  domain Order { ... }       // owned
  domain Catalog { ... }
}

service NextServer {
  handles Order, Catalog     // re-export: 自分は owns しないが、呼び出し側に公開する
  delivers WebApp
}

client WebApp [web] {
  handles Order, Catalog
}

WebApp -> NextServer -> OrderService
```

**統一された "expose" の定義**:

> ノード N が domain D を *expose* するとは、以下のいずれかが成り立つこと:
> 1. N が D を子に持つ（`domain D { ... }`、つまり *owns*）
> 2. N が `handles D` を宣言しており、かつ N から出ている通信エッジ (`->`) の直接の到達先のいずれかが D を *expose* する

**統一された検査ルール**:

- `client.handles D` または `service.handles D` のいずれも、上記 2 の条件で検査する（再帰は 1 ホップずつ展開）
- N 自身が D を owns している場合に冗長な `handles D` が書かれても警告は出さない（許容）。書かないのが推奨
- 推移は明示宣言が連鎖することで自然に成立する: `client → BFF (handles X) → backend (owns X)` の形が一直線に検証される

**自動パススルーは採らない理由**:

「BFF が backend に edge を持つなら backend の全 domain を自動再公開」とする設計は楽だが、誤った over-exposure を許す。
再エクスポートは*意図*なので、TypeScript の `export { X } from './m'`、Rust の `pub use` と同じく明示的な宣言で書かせるほうが安全。

**BFF 以外の用途**:

- API ゲートウェイ・リバースプロキシ・edge worker でも同じ構文で「どの domain を経路上で公開するか」を表現できる
- マイクロサービス間でも、`OrderService` が `BillingService` の `Invoice` ドメインを部分的に経路として通している、といったケースを `handles Invoice` で表現できる
- 再エクスポート対象を厳密に絞ることで、「依存はあるが公開はしない」という *internal dependency* と区別できる

**今後の拡張余地（別途検討）**:

- `usecase` 単位の部分再エクスポート（`handles Order { ViewOrders, PlaceOrder }` のような書き方）。BFF が一部 usecase だけを公開するケース。
- `handles X as Y` のようなリネーム再エクスポート（言語間の用語ゆれを吸収）。MVP には不要。

##### 案 ii: `service` 同型の階層構造（domain → usecase → resource）

`service` と同じく `client → domain → usecase → resource` の階層を持たせる。
ブラウザ/端末ストレージは `resource` の新 kind として表現する。

```
client WebApp [web] {
  domain Order {
    usecase ViewOrders {
      resource sessionStorage "view-state"
    }
    usecase PlaceOrder {
      resource localStorage "cart"
      resource indexedDB "outbox"
    }
  }
  domain Catalog {
    usecase BrowseProducts {
      resource indexedDB "catalog-cache"
    }
  }

}
```

| 要素 | 意味 |
|---|---|
| `domain` (子) | このクライアント*内*の bounded context（DDD と同じ語彙） |
| `usecase` (孫) | UI 上の操作 |
| `resource` (ひ孫) | usecase が触る storage |
| `resource` の kind | `localStorage` / `sessionStorage` / `indexedDB` / `opfs` / `file` / `keychain` |

> 認証 credential / cookie / デバイス能力（camera / geolocation 等）は `resource` の対象外。security 関連は Issue #834 で扱う。

##### 比較

| 観点 | 案 i (フラット参照) | 案 ii (`service` 同型) |
|---|---|---|
| 構文の表面積 | 小（プロパティ 2 種） | 大（`client → domain → usecase → resource` フル階層） |
| `service` との対称性 | 弱（参照のみ） | 強（同じ語彙） |
| ストレージと操作の対応 | 表現できない（storage はクライアント全体に紐づく） | 可能（`usecase` の `resource` として個別に紐付く） |
| 「どの操作が何を保管するか」 | 表に出ない | 構造から読み取れる（refresh token がどの usecase で使われるか等） |
| クライアント側 bounded context | 表現できない（domain はサーバー側のみ） | 表現できる（オフライン PWA 等で client が独自モデルを持つケース） |
| ユーザーごとの操作可能範囲の差 | `handles` 参照の差で表現可能 | `domain`/`usecase` 構造の差で表現可能（より細粒度） |
| 同じ業務概念の二重宣言 | 起きない（参照のみ） | 起きうる（client 側 `domain Order` と service 側 `domain Order` の関係付けが課題） |
| MVP 実装コスト | 小 | 中〜大（パーサー、バリデータ、レンダラ全てに波及） |
| drill-down との親和性 | 弱（client は葉ノード） | 強（client が drill-down 可能になる） |

##### ユーザーごとの差をどう書くか（user の議論に戻る）

「同じバックエンドサービスでも、Customer 向けの SPA と Admin 向けデスクトップでは触れる範囲が違う」というのは現実的なケース。
案 i / 案 ii どちらでも表現はできるが、表現の重みが違う:

```
// 案 i: 参照の集合の違いで表す
client CustomerWebApp [web] { handles Order, Catalog }
client AdminDesktop  [desktop] { handles Order, Catalog, Inventory, UserManagement }

// 案 ii: 構造そのものの違いで表す
client CustomerWebApp [web] {
  domain Order { usecase PlaceOrder { ... } usecase ViewOrders { ... } }
  domain Catalog { usecase BrowseProducts { ... } }
}
client AdminDesktop [desktop] {
  domain Order { usecase RefundOrder { ... } usecase OverrideShipping { ... } }
  domain Catalog { ... }
  domain Inventory { ... }
  domain UserManagement { ... }
}
```

案 ii のほうが「同じ Order ドメインでも Customer は注文する側、Admin は返品処理側」のように **クライアントごとの usecase の違い** まで写し取れる。
案 i ではドメイン名のリストが違うところまでしか表現されない。

##### 同名 domain の二重宣言問題（案 ii の課題）

案 ii では `service.OrderService.domain Order` と `client.CustomerWebApp.domain Order` の両方が存在する。
これは DDD 的には正当（同じ業務概念に対するクライアント側コンテキストとサーバー側コンテキスト）だが、karasu の現行 syntax は「domain は service の子のみ」を前提としている。
案 ii を採るなら以下のいずれかが必要:

- **案 ii-a**: 同名は別ノードとして扱い、明示的なクロスリファレンス（例: `client.domain Order { realizes service.OrderService.domain Order }` のような新リンク）で繋ぐ
- **案 ii-b**: 名前空間を分け、レンダラで「同じ業務概念を指している」ことを推測表示する
- **案 ii-c**: クライアント側 `domain` 内では `usecase` のみ書き、`domain` 自体はサーバー側からの参照（`@references service.OrderService.Order` のような書き方）にする

##### 現時点の方針（暫定）

**案 i から始め、案 ii は将来オプションとして残す**。理由:

- 多くのクライアントは「サーバーの API を叩いて表示する」薄いラッパで、独立した bounded context を持たない。フル階層は過剰になりやすい。
- ストレージのセキュリティ議論（refresh token をどこに置くか）は「クライアント全体に紐づく属性」として表現するだけでも十分なケースが多い。
- 案 ii は「オフラインファースト PWA」「複雑な SPA で独自ドメインモデルを持つ」「セキュリティ監査でストレージ → 操作の対応を厳密に書きたい」場面で価値が出るが、それは MVP の後で需要が見えてから実装する方が安全。
- 案 i → 案 ii の移行は機械変換可能（`handles X` を `domain X { }` に展開できる）。逆は情報が失われる。
- **`handles` を整合性検査の対象にすることで、案 i の弱点（参照が飾り化する）を解消できる**。接続先サービスが公開しているドメインの部分集合であることを CI で保証できれば、フラットでも実用的な役割を果たす。

ただし**案 ii の余地を構文設計時点から残しておく**のは大事。具体的には:

- `client { ... }` のボディは将来 `domain` を子として受け入れられるように、最初からブロック記法を許す
- `storage <kind> "<name>"` は将来 `resource <kind> "<name>"` に統一可能なように命名を慎重にする（あるいは最初から `resource <storageKind> "<name>"` で揃える）
- `handles` は将来 `realizes` 系の言語拡張で同じ意味を吸収できるよう、独立した predicate として実装しておく

**ストレージの kind 名についての結論**: 最初から `resource` の語彙を使い、`storage` という独立プロパティは導入しない。

```
client WebApp [web] {
  handles Order, Catalog
  resource localStorage "preferences"
  resource indexedDB "outbox"
}
```

これで後で `usecase` の中に移動するのが自然になる（リネーム不要）。
認証 credential / cookie の表現は Issue #834（security 親）に委譲。

これらは `client` の MVP には含めず、まず kind 導入と `delivers` だけ最初に入れ、`handles` / `resource` は別 PR で段階的に増やす。

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

| 形態 | 推奨ノード | サブタイプタグ | メモ |
|---|---|---|---|
| CLI ツール / SDK（自社配布） | `client` | `[cli]` | `~/.config` 等に状態を保管。認証 credential 自体の扱いは Issue #834 |
| IoT 端末 / 専用端末 / KIOSK | `client` | `[device]` | 端末固有 ID を持つ Public client。証明書ベース認証は Issue #834 |
| ブラウザ / IDE / デザインツール拡張 | `client` | `[extension]` | host アプリのプラグインポイントに常駐するコード |
| 埋め込みウィジェット / 配布 SDK (Stripe Checkout、Intercom 等) | `client` | `[embed]` | 第三者サイトに埋め込まれて動く我々のコード |

これらすべて `[mobile|web|desktop]` と並ぶフォームファクタタグとして扱える。タグセットは順次拡張すれば良い。

##### 別種の `service`（外部・ゲートウェイ・処理基盤）

| 形態 | 推奨ノード | メモ |
|---|---|---|
| IdP / フェデレーション認証 (Auth0 / Okta / Cognito 等) | `service [external]` | 我々の system 境界外。`OurService → IdP` で OIDC discovery / token issuance を表現 |
| API ゲートウェイ / リバースプロキシ (Kong / Envoy / nginx) | `service` | 単純な転送なら省略可。フィルタやレート制御を意識的に書きたいときだけノードにする |
| Edge worker (Cloudflare Workers / Vercel Edge) | `service`（必要なら `delivers`） | SSR / 配信責任があれば BFF パターンと同じ二重実体 |
| ストリーム / イベント処理 (Kafka consumer / Stream processor) | `service` | edge は Pub/Sub 型 (`service → broker → service`) になる |
| Webhook 受信エンドポイント | `service` | 第三者 SaaS から `service [external] -> OurService` で表現 |
| MQTT / 専用プロトコル broker | `service [external]` または社内 `service` | IoT パターンで `client [device] -> Broker -> backend service` |

##### 判定が微妙なハイブリッド

| 形態 | 推奨アプローチ |
|---|---|
| **チャットボット (Slack App / Teams Bot / GitHub App)** | 我々がホストする `service`（受信エンドポイント）として書く。エンドユーザーは Slack 等の host platform にログインしており、bot は token exchange / OBO で内部 service を叩く。ボットの「クライアント面」は host platform 内に閉じるので `client` ノードは作らない |
| **我々が外部 MCP サーバーを呼ぶ側になるケース** | 内部 `service` から外部 `service [external]` を呼ぶ M2M。`client` 概念は登場しない（ユーザー委譲ではなく Client Credentials）。MCP であることはプロトコル詳細であり、必要なら呼び出し側 `usecase` にタグを付けて表す |
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
M2M はそのまま `service ↔ service`、外部 SaaS / Webhook も `service [external]`（または既存の system 境界外サービス表現）で済むため、`client` 以外の新概念は要らない。

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

## 別 Issue で扱う論点

- **ユーザー属性に応じた usecase の認可** (ロール / ライセンス / プラン / 機能フラグ) — Issue #832。
  本ドキュメントのスコープ外。語彙が衝突しないよう、`role` / `license` / `group` / `plan` / `requires` / `allows` / `policy` を将来の認可語彙として予約候補と認識しておく。
  `client.handles` (UI 上の枠) と `usecase.requires` (実行時認可) は二段で組み合わせて使う想定。

## 未解決の問い と推奨案

各問いに **推奨案** と **判断の重み** を付ける。`★承認待ち` はユーザー判断を仰ぎたい論点、`★`（自動判断）は他の決定から導出できるためユーザーが拒否しなければそのまま採用。

### Q1. `client` のサブタイプタグセット ✅ 決定

最初に予約するのは **7 種**:

```
[mobile] [web] [desktop] [cli] [device] [extension] [embed]
```

| タグ | 意味 | 例 |
|---|---|---|
| `[mobile]` | iOS / Android ネイティブアプリ | App Store / Google Play 配布 |
| `[web]` | 自社オリジンで動く SPA | React / Vue / Svelte のフル機能 SPA |
| `[desktop]` | デスクトップアプリ | Electron / ネイティブ |
| `[cli]` | コマンドラインツール / SDK | 自社 CLI、配布 SDK |
| `[device]` | IoT / 専用端末 / KIOSK | 証明書ベース認証など |
| `[extension]` | ホストアプリのプラグインとして動く | Chrome 拡張 / VS Code 拡張 / Figma plugin / Slack app フロント側 |
| `[embed]` | 第三者ウェブコンテンツに埋め込まれる | Stripe Checkout / Intercom widget / Disqus |

`[extension]` はホストアプリ種別を抽象化する意図的な統合で、ブラウザ拡張も IDE 拡張もデザインツールプラグインも同じセマンティクスで扱う（具体的なホストは description / annotation / 追加タグで補う）。
`[embed]` は実行コンテキスト（第三者オリジン、iframe sandbox、postMessage 通信）が独立しているため `[extension]` とは別軸。

### Q2. 外部サービスの表現 ✅ 決定

**既存の `[external]` タグをそのまま使う**。新たな構文・アノテーションは導入しない。

```
service Stripe [external] {
  label "Stripe API"
}

OurService -> Stripe       // M2M
```

理由:
- `[external]` は既に karasu のタグ仕様（`docs/spec/tags-annotations.md`）に「システム境界の外」を表す予約タグとして定義済み（dashed border / グレー基調のレンダリングが既定）。
- karasu のタグ vs アノテーションの区分（タグ = アーキテクチャ位置 / 役割、アノテーション = ライフサイクル / 状態）に照らすと、外部は明確に位置の話なので**タグが正しい**。
- 既存仕様を再利用するため、本 Doc のために追加実装することは何もない（client / MCP 文脈での例示が増えるだけ）。

採らない代替:
- `@external` アノテーション化 — タグ vs アノテーション軸を混ぜることになり既存仕様と矛盾する
- 新 kind `external_service` — 検索性は上がるが論理 vs 外部の二軸が kind に混ざる

### Q3. MCP サーバーへのマーカー ✅ 決定

**特別なマーカーを付けない**。MCP サーバーは通常の `service` として扱う。

```
service OrderMcp {
  label "Order MCP server"
  handles Order, Catalog
}

PartnerAgent [ai] -> OrderMcp     // user [ai] → service のエッジで AI 向け経路は表現される
OrderMcp        -> OrderService
```

理由:
- MCP は API プロトコル選択の一つ。`@rest` / `@graphql` / `@grpc` を `service` に付けないのと同じく、`@mcp` も付ける必然性がない
- AI エージェントが叩いていることは `user [ai] -> service` のエッジで既に読み取れる
- プロトコル可視化が必要になったら **usecase 単位のタグ** (`[mcp]` / `[rest]` / `[graphql]` 等) で表現する方が現実的（一つの service が複数プロトコルで一部 usecase を公開するパターンが多い）

スコープ外（将来 Issue）: usecase レベルのプロトコルタグ。

### Q4. `delivers` の構文 ✅ 決定

**プロパティ式** で表現する。

```
service NextServer {
  label "Next.js BFF"
  delivers WebApp           // 配信は宣言的プロパティ
}

client WebApp [web] { ... }

WebApp -> NextServer        // API 通信は通常エッジ
```

理由:
- `delivers` は配信責任を表す宣言的属性。`realizes`（deploy → logical）/ `owns`（team → logical）と同じ宣言的プロパティ系統に揃える
- 通信エッジ (`->`) と並べて新エッジ種別 (`-delivers->`) を入れると、配信（静的）と API 呼び出し（実行時）が視覚的に同列で混ざる
- grep 性は `delivers ` の検索で担保される
- 複数 client を配信する場合は `delivers WebApp, AdminUI` のようにカンマ区切り

採らない代替: 新エッジ `<ServiceId> -delivers-> <ClientId>`。配信と呼び出しが矢印で混在する点が許容できない。

### Q5. `client` の内部構造を `service` 同型にするか ✅ 決定

**案 i（フラット参照型）で MVP リリース、構文は案 ii 互換に予約**。

```
client WebApp [web] {
  label "Customer SPA"
  handles Order, Catalog
  resource localStorage "preferences"
  resource indexedDB "outbox"
}
```

理由:
- 多くのクライアントは「サーバーの API を叩いて表示する」薄いラッパで、独立した bounded context を持たないため案 ii は過剰
- 案 i → 案 ii の移行は機械変換可能（`handles X` → `domain X { }`）、逆は情報が失われる
- `handles` を整合性検査の対象（Q10）にすることで案 i の弱点（参照の飾り化）を解消できる

案 ii 互換のための予約:
- `client { ... }` ボディは将来 `domain` 子を受け入れられる構文形にしておく
- `resource` は最初から `service` と同じ語彙で書く（将来 `usecase` の中に移動するときリネーム不要）
- `handles` は将来 `realizes` 系の言語拡張に置き換え可能な independent predicate として実装

スコープ外（将来の別 Issue）: `client → domain → usecase → resource` フル階層（案 ii）。

### Q6. ストレージは `storage` 独立 vs `resource <storageKind>` 統合 ✅ 決定

**`resource <storageKind> "<name>"` に統合**。
理由: 案 i → 案 ii の移行コストを最小化（リネーム不要）。`service` 側の `resource` と語彙が揃う。

### Q7. `resource` の kind セット ✅ 決定

最初に予約する `resource` kind:
**`localStorage` / `sessionStorage` / `indexedDB` / `opfs` / `file` / `keychain`**

すべて **「操作（usecase）に紐づくストレージ」** という共通セマンティクスを持つ。
`localStorage` / `sessionStorage` / `indexedDB` / `opfs` / `file` は明示的にコードが読み書きするストレージで、特定の usecase の文脈で扱える。
`keychain` は OS 提供のセキュアな鍵保管（モバイル / デスクトップ）で、操作の入出力として登場する。

スコープ外（別 Issue）:
- **`cookie` / 認証 credential** — Issue #834（security 親）で扱う。HTTP プロトコルが自動送信する request-scoped な要素であり、操作-tied storage と意味が異なる。脅威モデル / OAuth2 client type / コンプライアンスといった security 全般の文脈で語彙を決める方が筋が通る。
- **デバイス能力 (`camera` / `geolocation` / `notification` / `push` / `bluetooth` / `webauthn`)** — 保管ではなく能力許諾。別軸として将来 `capability` / `permission` 予約候補で検討。

### Q8. `cookie` 等の安全属性 ✅ 決定（委譲）

**Issue #834（security 親）に委譲**。
本 Doc では `cookie` は扱わない。`resource` の安全属性が将来必要になる場合は同じネスト記法（`resource <kind> "<name>" { ... }`）の形で拡張可能だが、MVP には含めない。

### Q9. 同名 domain の二重宣言（案 ii の課題） ✅ 決定

MVP は案 i 採用のため**発生せず保留**。案 ii を将来採る際に再検討。

### Q10. `handles` の検査ルール・再エクスポート構文 ✅ 決定

以下を **MVP 同梱**:

- 検査ルール: `client.handles X` / `service.handles X` どちらも、直接の通信エッジ先のノードが X を expose していなければ **warning**
- 再エクスポート: `service.handles X` で表現
- キーワード統一: `client` / `service` で同じ `handles`（自身が owns しているかは `domain` 子の有無で区別）

### Q11. system 図のレイアウトヒント ✅ 決定

**MVP で強制レイアウトを採用**。`user → client → service` の三層を上から下へ並べる。

ルール:
- レンダラは三層をそれぞれ別の行（または列）として配置する
- 同一層内の並び順はユーザーの記述順を尊重する
- `delivers` 関係（service が client を配信）は通信エッジとは別軸で描画する（線種・色を変える等は実装の判断）
- 例外: `client` を持たないグラフ（古典的 SSR のみ等）は user → service の二層に落ちる

理由:
- 実際の通信フローは「人 → 端末上のクライアント → サーバー側のサービス」と上から下へ流れることが大半で、強制配置することで読み手の認知負荷が減る
- 自由レイアウトに任せると、書き手によって配置がバラついて図が読みにくくなる
- 例外（古典的 SSR で `client` 不在）は二層に縮約することで自然に対応できる

### Q12. examples の配置 ✅ 決定

**三段構成**で対応する。

1. **`examples/client-mcp/` を新設**: client + delivers + handles + 外部 service + MCP server を盛った最小サンプルを 1 本置く。クライアント / MCP / 外部サービスのシナリオに集中した実例。
2. **`examples/getting-started/index.krs` と `examples/getting-started-en/index.krs` を更新**: 既存のサンプルに `client` ノードを少なくとも 1 つ追加する。例: Customer (user) → MobileApp (client) → ECommerce (service) のような形で、Getting Started を読んだ人が `client` 概念を最初から理解できるようにする。
3. **`examples/ec-platform/` のステップ列に挿入**: 既存の `01-system.krs` → `02-users.krs` → `03-domains.krs` の流れに `02.5-clients.krs`（または同等のファイル）を入れて、users → clients → domains の順で段階的に説明する。

理由: `client` は MVP の主役であり、Getting Started とチュートリアル両方に登場させないと「あとから追加された付録」感が出る。専用 `client-mcp/` の最小サンプルと、既存例の段階的更新を併用する。

### Q13. MVP のスコープ ✅ 決定

これまでの決定の集約:

**含むもの**:
- `client` kind を新設（`[mobile|web|desktop|cli|device|extension|embed]` 7 種のサブタイプタグ予約）
- `service` の境界表現は既存 `[external]` タグを使う（新構文なし）。MCP は通常の `service` で扱い、特別マーカーは付けない
- `service.delivers <ClientId>` プロパティ
- `client.handles <DomainId>` / `service.handles <DomainId>`（再エクスポート）+ 接続トポロジに対する検査 warning
- `client { resource <storageKind> "<name>" }` フラット構文（kind は `localStorage` / `sessionStorage` / `indexedDB` / `opfs` / `file` / `keychain` の 6 種）
- **`user → client → service` 三層を上から下に強制配置するレイアウト**（client 不在時は user → service の二層）
- **icon 対応**: `client` kind に対応する builtin SVG（`packages/core/icons/icons.json`）+ icon-theme stylesheet エントリ（`packages/core/src/builtins/icon-theme.ts`）。`service` と視覚的に明確に区別できることを目標とする
- **examples**: `examples/client-mcp/` 新設 + `examples/getting-started/` / `getting-started-en/` への `client` 追加 + `examples/ec-platform/` のステップ拡充

**スコープ外（別 Issue）**:
- `client → domain → usecase → resource` フル階層（案 ii）
- `usecase` / `resource` 単位の部分再エクスポート、リネーム再エクスポート
- サブタイプタグ別の icon 差別化（`[mobile]` と `[desktop]` で違う icon を出す等）— MVP 後の段階的拡張
- デバイス能力 / 権限の `capability` 軸 — Issue #837
- 認可（#832）
- 認証 credential / cookie / セッション / 脅威モデル（security 親 #834）

### Q14. 再エクスポートの粒度 ✅ 決定

**MVP は domain 単位のみ**。`usecase` / `resource` 単位の部分再エクスポートは需要が見えてから別 Issue で追加。
