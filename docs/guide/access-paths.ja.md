# アクセス経路とクライアントのモデリングガイド

> [English](access-paths.md) · **日本語**（このファイル）
>
> 📚 ガイドシリーズ 第4章 / 全5章 ｜ ← 前章: [進化・移行](evolution.ja.md) ｜ 次章 →: [伝達](communicating-diagrams.ja.md)

プロダクトのアーキテクチャを描くとき、サービスの内部構造（`service → domain → usecase`）と同じくらい重要なのが **アクセス経路** — 「誰が、どの面（クライアント）を介して、何（サービス）に到達するか」です。エンドユーザーは普通サービスを直接叩きません。モバイルアプリや Web フロントを経由します。この **`user → client → service`** の系統を、karasu は専用の語彙でモデル化します。

このガイドは、web / mobile / BFF / AI エージェントを含むプロダクトの「面」を karasu で描くアーキテクト向けです。正確な構文は [`docs/spec/syntax.ja.md`](../spec/syntax.ja.md) を参照してください。`.krs` スニペットは検証済みです。

---

## 0. system の二系統 — アクセス経路とサービス階層

karasu の `system` には 2 つの系統が同居します（[`docs/concepts.ja.md`](../concepts.ja.md) の三面構造）。

```
system
├─ user → client → service              （アクセス経路：誰が、どの面を介して、何に到達するか）
└─ service → domain → usecase → resource （サービス階層：各サービスの内部構造）
```

[境界設計ガイド](service-team-design.ja.md) と [オンボーディングガイド](onboarding.ja.md) が主に下段（サービス階層）を扱ったのに対し、このガイドは上段（アクセス経路）に焦点を当てます。

---

## 1. `user` — 人間と AI エージェント

`user` はシステムを駆動するアクターです。タグで人間（`[human]`）と AI エージェント（`[ai]`）を区別し、`role` で業務上の役割を一行で記述します。

```krs
system Shop {
  user Customer [human] {
    label "購入者"
    role "商品を購入する一般ユーザー"
  }
  user Ops [ai] {
    label "運用エージェント"
    role "在庫を監視して自動発注する AI"
  }
}
```

AI エージェントを `[ai]` の `user` として一級に描けるのが karasu の特徴です。「人間の購入者」と「自動化エージェント」が同じシステムをどう駆動するかを並置できます。

> `role` は **authz primitive ではありません** — RBAC の permission や `requires role` 述語ではなく、「このユーザーが何をするか」の要約です。認可制約は `description` の `アクセス:` 規約と policy リンクで表します（[`docs/spec/syntax.ja.md`](../spec/syntax.ja.md) の認可ノート節）。

---

## 2. `client` — 自社が出荷するソフトウェア

`client` は **エンドユーザーの委譲で動く、自社が配布するクライアントソフトウェア** です。`user` と `service` の間に位置します。form-factor タグで種類を示します。

| タグ | Form factor |
|------|-------------|
| `[mobile]` | iOS / Android ネイティブアプリ |
| `[web]` | 自社オリジンで動く SPA |
| `[desktop]` | デスクトップアプリ（Electron / ネイティブ） |
| `[cli]` | エンドユーザーに配布する CLI / SDK |
| `[device]` | IoT / 専用端末 / KIOSK |
| `[extension]` | 他アプリがホストする拡張（ブラウザ / IDE 拡張） |
| `[embed]` | サードパーティ Web に埋め込む widget / SDK |

```krs
client MobileApp [mobile] {
  label "モバイルアプリ"
  description "iOS / Android 向け公式アプリ"
}
client WebApp [web] {
  label "Web アプリ"
}
```

> **`client` と `user` の境界**: `client` は **プロジェクト自身が配布するソフトウェア** に限ります。サードパーティのブラウザ・IDE・外部 AI エージェントがシステムを利用する場合は、`client` ではなく `user`（`[human]` / `[ai]`）でモデル化します。「自分たちが出荷したか」が判断基準です（[ADR-20260428-06](../adr/20260428-06-client-mcp-modeling.md)）。

---

## 3. アクセス経路を引く

`user -> client -> service` をエッジで繋ぎ、到達経路を描きます。

```krs
system Shop {
  user Customer [human] { label "購入者" }

  client MobileApp [mobile] { label "モバイルアプリ" }
  client WebApp [web]       { label "Web アプリ" }

  service Backend {
    label "バックエンド"
    domain Order { label "受注" }
  }

  Customer  -> MobileApp "アプリを使う"
  Customer  -> WebApp    "ブラウザで使う"
  MobileApp -> Backend   "API 呼び出し"
  WebApp    -> Backend   "API 呼び出し"
}
```

これで「購入者はモバイルと Web の 2 つの面からバックエンドに到達する」が俯瞰で読めます。クライアントとサービスの間の通常の API 呼び出しは普通の `->` で書きます。

---

## 4. `handles` — クライアント/サービスが公開するドメイン

`client` と `service` は `handles` で **呼び出し側に公開するドメイン id** を宣言できます。これは検証付きクロスリファレンスで、公開するドメインが 1 ホップの expose ルールで到達可能でなければ `unresolved-handles` 警告が出ます。

```krs
system Shop {
  service Backend {
    domain Order {}      // 自身が所有 — handles 不要
  }
  service Bff {
    handles Order        // 再公開: Order は Backend が所有し、下のエッジ経由で到達
  }
  client WebApp [web] {
    handles Order        // BFF 経由でエンドユーザーに Order を公開
  }

  WebApp -> Bff
  Bff -> Backend
}
```

**expose ルール**: ノード N がドメイン D を expose するのは、(1) N が `domain D` を子に持つ（自身が所有）、または (2) N が `handles D` を宣言し、かつ少なくとも 1 本の outgoing 通信エッジの宛先も D を expose しているとき。ルールは 1 ホップずつ展開されるので、`client → BFF → backend` の各リンクを明示的に宣言する必要があります（暗黙の auto-passthrough はありません）。

これにより「この Web アプリは結局どのドメインをエンドユーザーに見せているのか」が、経路の整合性込みで検証されます。

---

## 5. `delivers` — BFF / SSR パターン

`service` が `client` を **配布する** 関係（Next.js / Rails+React / Laravel+Vue のような BFF / SSR）は `delivers` で宣言します。サーバーサイドのバンドルとブラウザサイドのバンドルは OAuth2 client タイプが異なる別ノードとして扱い、`delivers` で結びます。

```krs
service NextBff {
  label "Next.js BFF"
  delivers WebApp           // 単一
}
service Gateway {
  delivers WebApp, AdminUI  // カンマ区切り
}
client WebApp [web] {}
client AdminUI [desktop] {}
```

`delivers` の各エントリは、system view 上で service から参照先 client への **破線エッジ** に合成されます。`delivers` は宣言的プロパティで、新しいエッジ種別ではありません。client と service 間の通常の API 呼び出しは引き続き `->` で書きます。参照先が `client` に解決できないと `delivers-target-not-client` 警告が出ます。

---

## 6. クライアント側の `resource` と `capability`

クライアントは固有の状態と権限を持ちます。これらを描くと、プロダクトの「面」のセキュリティ・データ局所性が見えます。

**`resource <storageKind> "<name>"`** — クライアント上のローカルストレージ。`localStorage` / `sessionStorage` / `indexedDB` / `opfs` / `file` / `keychain` の 6 種から選びます（認証クレデンシャルが黙って紛れ込まないよう種別を限定）。

**`capability <name>`** — クライアントが要求するデバイス / ブラウザ capability（camera / geolocation / notification など）。任意の kebab-case 識別子を受け付けます。

```krs
client MobileApp [mobile] {
  label "モバイルアプリ"
  handles Order
  resource localStorage "preferences"
  resource indexedDB "outbox"          // オフライン送信キュー
  capability notification
  capability camera {
    description "QR コード読み取り"      // なぜこの capability か（脅威モデリング用メモ）
  }
}
```

`resource` は client が読み書きするストレージ、`capability` は OS / browser が許可を与える機能、という別概念です。SVG カードはそれぞれ `📦 ×N` / `🔐 ×N` のカウントバッジで表示し、完全リストは詳細パネルに出ます。

> cookie / session / 生クレデンシャルのストレージ、および脅威モデリングそのものは意図的に対象外です（karasu は基礎事実をモデル化するが、セキュリティ規律の shape は語彙に固定しない — [ADR-20260430-01](../adr/20260430-01-security-modeling-stance.md)）。

---

## 7. まとめ — 面と内部を別系統で描く

アクセス経路（`user → client → service`）はプロダクトの **入口の地図** を、サービス階層（`service → domain → usecase`）は各サービスの **内部構造** を描きます。両者を同じ `system` の中に持ちつつ、ドリルダウンで見る系統を切り替えられるのが karasu の設計です。

完全な例は [`examples/ec-platform/02.5-clients.krs`](../../examples/ec-platform/02.5-clients.krs)（client + handles + delivers + resource）と、MCP / AI エージェントを含む [`examples/client-mcp/`](../../examples/client-mcp/) を参照してください。

---

## さらに学ぶ

- 関連ガイド: [境界設計](service-team-design.ja.md) / [オンボーディング](onboarding.ja.md) / [進化](evolution.ja.md) / [伝達](communicating-diagrams.ja.md)
- 正確な構文（user / client / handles / delivers）: [`docs/spec/syntax.ja.md`](../spec/syntax.ja.md)
- client を独立 kind にした理由: [ADR-20260428-06](../adr/20260428-06-client-mcp-modeling.md)
- クライアント例: [`examples/ec-platform/02.5-clients.krs`](../../examples/ec-platform/02.5-clients.krs)、[`examples/client-mcp/`](../../examples/client-mcp/)
