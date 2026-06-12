# タグ・アノテーション リファレンス

> [English](tags-annotations.md) · **日本語**（このファイル）

## タグ（`[...]`）

タグは**アーキテクチャ上の意味**を宣言する。スタイルはタグを受けて変わる。
タグは意味の宣言であり、見た目の直接指定ではない。見た目の制御は `.krs.style` で行う。

<!-- gen:reference:tags — DO NOT EDIT. Generated from packages/core/src/builtins/reference-data.ts; run `pnpm gen:reference`. -->
| タグ | 意味 | デフォルト描画への影響 |
|------|------|------------------------|
| `[external]` | システム境界の外側 | 枠線を破線、色をグレー系に |
| `[async]` | 非同期通信（エッジ用） | 破線矢印 |
| `[sync]` | 同期通信（エッジ用、デフォルト） | 実線矢印（デフォルト） |
| `[human]` | 人間の利用者 | user ノードにのみ使用。デフォルトスタイルへの影響なし |
| `[ai]` | AIエージェント | user ノードにのみ使用。デフォルトスタイルへの影響なし |
| `[mobile]` | モバイルネイティブアプリ（client） | `client` ノード用の認識済み form-factor タグ |
| `[web]` | ブラウザ SPA（client） | `client` ノード用の認識済み form-factor タグ |
| `[desktop]` | デスクトップアプリ（client） | `client` ノード用の認識済み form-factor タグ |
| `[cli]` | コマンドラインツール / SDK（client） | `client` ノード用の認識済み form-factor タグ |
| `[device]` | IoT / 専用端末 / KIOSK（client） | `client` ノード用の認識済み form-factor タグ |
| `[extension]` | ホストアプリのプラグイン — Chrome / VS Code / Figma 等（client） | `client` ノード用の認識済み form-factor タグ |
| `[embed]` | 第三者サイトに埋め込まれるウィジェット / SDK（client） | `client` ノード用の認識済み form-factor タグ |
| `[table]` | テーブル系リソース（シェイプ: cylinder） | cylinder シェイプで描画 |
| `[queue]` | キュー系リソース（シェイプ: queue） | queue シェイプで描画 |
| `[api]` | API系リソース（シェイプ: hexagon） | hexagon シェイプで描画 |
| `[storage]` | ストレージ系リソース（シェイプ: cloud） | cloud シェイプで描画 |
<!-- /gen:reference:tags -->

> `client` 用の 7 つの form-factor タグは karasu が **認識** している。将来的に kind 固有のアイコン（#823 Phase 2）やレイアウトヒント（Phase 6）に反応する予定。リスト外のタグも `client` に付与可能で、その場合は通常のユーザー定義タグとして扱われる。

### 記述例

```
service Payment "決済サービス" [external]
ECommerce --> Inventory "在庫を同期する" [async]
user Customer "顧客" [human]
user AIAgent "注文自動化エージェント" [ai]
```

---

## アノテーション（`@...`）

アノテーションは**ライフサイクル・状態**を表すメタ情報。タグとは別の概念。

<!-- gen:reference:annotations — DO NOT EDIT. Generated from packages/core/src/builtins/reference-data.ts; run `pnpm gen:reference`. -->
| アノテーション | 意味 | デフォルト描画 |
|----------------|------|----------------|
| `@deprecated` | 廃止予定 | ⚠バッジ、ノードを半透明に |
| `@new` | 新規追加 | ✦バッジ |
| `@experimental` | 実験的 | ⚗バッジ |
| `@migration_target` | 移行先 | →バッジ |
<!-- /gen:reference:annotations -->

### 記述例

複数付与可。タグとの併用も可。

```
service Legacy "旧システム" [external] @deprecated @migration_target
service NewAPI "新API"                 @new @experimental
```

#### domain の移行期共存

`@deprecated` または `@migration_target` を `domain` に付与すると、
同一システム内で同じ ID を持つ `domain` の共存が許容される（移行期のモデリング）。
`@migration_target` が付いている方がナビゲーションの優先先になる。

```krs
system OrderSystem {
  service LegacyService {
    domain Contract @deprecated {   // 移行元 — 廃止予定
      -> Billing
    }
  }
  service NewService {
    domain Contract @migration_target {  // 移行先 — ナビゲーション優先
      -> Billing
    }
  }
}
```

> `@deprecated` 単独、または `@migration_target` 単独、どちらか一方が付いていれば重複を許容する。
> どちらにも付いていない場合はエラーのまま。

---

## client capability

`capability <name>` は client が利用許可を要求する **デバイス / ブラウザの capability** を宣言する。構文は [`docs/spec/syntax.ja.md`](./syntax.ja.md#client-capability) を参照。

identifier セットは **オープン** — 任意の kebab-case 識別子を受け付け、推奨セット外の名前でも警告は出さない。これにより業界固有デバイスや社内専用機能など、ドメイン固有の capability も自由に表現できる。下記の推奨セットは、バリデータやエディタツールが想定する最も典型的なケースを網羅する。

### 推奨 capability 識別子

| グループ | 識別子 |
|----------|--------|
| Web / browser | `camera`, `microphone`, `geolocation`, `notification`, `push`, `clipboard`, `webauthn`, `bluetooth`, `usb`, `midi`, `screen-wake-lock`, `accelerometer`, `gyroscope`, `storage-access` |
| Mobile（追加分） | `contacts`, `calendar`, `photo-library`, `face-id`, `touch-id`, `background-processing`, `local-network`, `bluetooth-le-peripheral` |
| Desktop（追加分） | `file-system-access`, `global-shortcuts`, `auto-launch`, `screen-recording` |
| IoT / device（追加分） | `gpio`, `serial`, `zigbee`, `lora`, `nfc`, `rfid` |

### 命名規約

- **kebab-case** を使用（`screen-wake-lock`, `face-id`）。
- 該当する Web Permissions API / W3C 名がある場合はそちらを優先（`geolocation`, `notification`）。
- OS 固有の識別子（`android.permission.CAMERA` 等）は避け、抽象的な機能名を使う。
- 推奨セット外の名前を使う場合は `description` を添えて、他の読者が何を指すか把握できるようにする。

### `capability` ではないもの

| 概念 | 記述する場所 |
|------|--------------|
| 操作に紐づくストレージ（`localStorage`, `indexedDB`, `keychain`） | `resource <storageKind> "<name>"` |
| HTTP セッション / 認証クレデンシャル | 別語彙。#834 で追跡 |
| 実行時の認可（RBAC permission bundle、ライセンス / フィーチャーフラグ） | karasu はモデル化しない — [ADR-20260511-02](../adr/20260511-02-no-runtime-authz-modeling.md) 参照。`user.role` プロパティは actor-archetype ラベルであり authz primitive ではない — [ADR-20260511-04](../adr/20260511-04-user-role-keyword-clarification.md) 参照 |

---

## タグとアノテーションの違い

| | タグ | アノテーション |
|---|------|--------------|
| 表す内容 | アーキテクチャ上の位置・役割 | ライフサイクル・開発状態 |
| 例 | `[external]`（境界の外） | `@deprecated`（廃止予定） |
| スタイルへの影響 | `.krs.style` のタグセレクタで制御 | `.krs.style` のアノテーションセレクタで制御 |

---

## システム自動付与タグ（System-assigned tags）

以下のタグはユーザーが `.krs` ファイルに記述するものではなく、ツールが自動的に付与する。
`.krs.style` のタグセレクタで参照・上書きできる。

### エッジへの自動タグ

| タグ | 付与条件 | デフォルトスタイル |
|-----|---------|-----------------|
| `[implicit]` | domain エッジから派生した暗黙のサービス間エッジ | アンバー（`#F59E0B`）。線種は元のドメインエッジの `kind` に従う（`[async]` で破線、`[sync]` で実線） |
| `[async]` | `-->` で宣言されたエッジ | 破線 |
| `[sync]` | `->` で宣言されたエッジ | 実線 |
| `[cyclic]` | 循環依存検出時 | 赤（`#EF4444`）実線 |
| `[write]` | usecase→resource の合成エッジで、対象 resource の `operations` に `create` / `update` / `delete` が含まれる場合 | `stroke-width: 2`、ラベル `"W"` |
| `[read]` | usecase→resource の合成エッジで read-only と分類される場合（write 動詞なし、または `operations` 省略） | `stroke-width: 1.5`、ラベル `"R"` |

> `[implicit]` は色（アンバー）で「派生」を表し、線種は同期/非同期の区別に使う。
> 同一サービスペア間に sync と async の両方のドメインエッジがある場合は、kind ごとに別の暗黙エッジとして派生される。
>
> `[write]` / `[read]` は usecase→resource の合成エッジに対してのみ自動付与される。**明示的なエッジに手で書かないこと** — 構文上はパーサが受け付けるが、意味（対象 resource の `operations` を write-dominates 分類した結果）は合成エッジに対してしか成立しない。線幅の階層は意図的に `read (1.5) < write (2) < cyclic (2.5)` の順で、循環依存が最も目立つ軸として残るようにしている。

### カスタマイズ例

```krs.style
edge[implicit] {
  color: purple;
  border-style: dotted;
}
```

---

## チーム連絡先コンベンション（`team` + `link`）

組織クエリ（「このサービスのオーナーチームは？」「影響するチームに連絡したい」）を AI チャットで利用するには、
`service` や `domain` ノードに `team` プロパティと `link` プロパティを追加する。

```krs
service ECommerce {
  label "ECサイト"
  team "ECチーム"
  link "https://slack.com/archives/C..." "ECチーム Slack"
  link "https://notion.so/..."          "チームページ"
}
```

### `team` プロパティ

チーム名を文字列で記述する。AI はこの値を組織クエリの回答で使用する。

```krs
service Payment {
  team "Fintechチーム"
}
```

### `link` プロパティ（チーム連絡先）

`link "<url>" "<label>"` の形式で連絡先 URL を追加する。
ラベルに以下のキーワードが含まれる場合、AI はチーム連絡先として認識する：

| キーワード例 | 用途 |
|---|---|
| `Slack` | Slack チャンネル |
| `Teams` | Microsoft Teams チャンネル |
| `チームページ` | Notion や Confluence などのチームページ |
| `Runbook` | オンコール・運用手順書 |

### 使用例（AI チャットでのクエリ）

モデルに上記の情報を記述しておくと、Chat タブで以下のようなクエリが可能になる：

```
Q: "Order サービスに依存しているチームを教えて"
A: - Fintechチーム（Payment サービス）
     → https://slack.com/... (Fintechチーム Slack)
   - Platformチーム（Notification サービス）
     → https://slack.com/... (Platformチーム Slack)

Q: "オンボーディングで最初に会うべき人は？"
A: ECommerce（最もエッジが多い）: ECチーム
     → https://notion.so/... (チームページ)
```
