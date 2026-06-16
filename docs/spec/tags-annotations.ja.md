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

> **shape タグと infra ブロックキーワードの違い。** `[table]` / `[queue]` / `[storage]` は `usecase` 内の `resource` に付ける **shape ヒント**であり、そのノードの描画（cylinder / queue / cloud）を変えるだけで、それ自体はノードもエッジも作らない。同名の infra ブロック **キーワード** `table` / `queue` / `storage`（および `database`）とは **別物**で、後者は system 図上で service が依存する **構造ノード（共有ストア）を宣言**する（[syntax.md](./syntax.md) の *Infra layer* 節を参照）。両者は位置も役割も異なるため衝突しない: キーワードは **宣言の先頭**に立ってノードの *kind* を決め、タグは `[...]` の **接尾辞**で *shape* だけを決める。**共有データストアを first-class ノードとして** モデリングしたいときは infra キーワードを、**usecase ローカルの `resource`** をストア風の形で描きたいだけのときは shape タグを使う。
>
> Related TPLs: [TPL-20260616-03](../test-perspectives/TPL-20260616-03-surface-token-shared-distinct-roles.md) — 表層トークンを共有しつつ役割が異なる語彙は、互いに silent に coerce されず別の役割を保つことを検証する。

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

### アノテーション名はオープンセット

アノテーション名の集合は**オープン** — `@<identifier>` は任意の識別子を受け付け、組み込みセット外の名前に警告は出さない。デフォルトのセマンティクスとバッジ描画を持つのは上記 4 つの組み込みのみで、ユーザー定義アノテーションにはデフォルト描画はないが、`.krs.style` のアノテーションセレクタの正当なターゲットになる（[`docs/spec/style.ja.md`](./style.ja.md#セレクタの種類) を参照）。

未知の名前を黙って受け付ける以上、組み込み名のタイポ（例: `@depracated`）は「バッジが出ない」という形でしか表面化しない。そのため karasu は、組み込みではないが組み込み名と編集距離が近いアノテーション名に対して **info レベルのヒント**（`annotation-possible-typo`）を出す。スタイルシートのアノテーションセレクタに現れる名前についてはヒントを抑制する — セレクタの定義はその名前が意図的なユーザー定義であることの表明とみなす。

```krs
service Billing @team-alpha   // OK: ユーザー定義アノテーション、ヒントなし
service Legacy  @depracated   // info ヒント: "@deprecated" の誤記では？
```

> Related TPLs: [TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md)

### アノテーションのパラメータ

組み込みのライフサイクルアノテーションは、移行 intent を記録する**パラメータ**を `@name(key: "value"[, key: "value"]*)` の形で持てる:

```krs
service Legacy @deprecated(until: "2026-Q3")
service NewSvc @migration_target(from: LegacyMonolith)
```

認識されるキー（組み込み限定）:

| アノテーション | キー | 意味 |
|----------------|------|------|
| `@deprecated` / `@experimental` | `until` | 廃止 / 安定化の目標時期 |
| `@migration_target` | `from` | 移行元のノード |

- **精度による graceful degradation**: `until` の値が日付（`YYYY-MM-DD`）/ 年月（`YYYY-MM`）/ 四半期（`YYYY-Qn`）としてパースできれば machine-usable（ソート / filter 可能）。それ以外の文字列（例: `"来年あたり"`）はそのまま opaque な表示専用値として保持する。opaque 値にバリデーションエラーは出さない。
- **実行時評価はしない**: `until` は記録された **intent** であって期限ではない — karasu は現在日付と比較しない（「期限超過」診断は出さない）。`job.schedule`（保持するが simulate しない）や warn-don't-error の立場と整合。
- **未対応パラメータは黙殺せず warn**: それ以外のアノテーションへのパラメータ、または未認識キーは `annotation-param-unsupported` 警告とともに破棄する（TPL-20260610-01 — 受理する語彙は効果を持つか警告される）。独自アノテーションは当面パラメータ非対応。
- パラメータはアノテーションの**名前リストを変えない**ため、`.krs.style` のアノテーションセレクタ（`@deprecated`）や継承には影響しない。

> Related TPLs: [TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md) — 未認識キー/アノテーションへの `@name(key: …)` は warn され、黙って受理されない。

---

## client capability

`capability <name>` は client が利用許可を要求する **デバイス / ブラウザの capability** を宣言する。構文は [`docs/spec/syntax.ja.md`](./syntax.ja.md#client-の-capability) を参照。

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

## チーム連絡先コンベンション（`owns` + `link`）

組織クエリ（「このサービスのオーナーチームは？」「影響するチームに連絡したい」）を AI チャットで利用するには、
`organization` ブロックでチームを宣言し、`owns` でサービス / ドメインを所有させ、`team` ブロックに連絡先 `link` を添える。

> 旧仕様の `service` / `domain` に直接書く `team "..."` プロパティは **削除された**（[ADR-20260323-03](../adr/20260323-03-organization-diagram.md) の廃止計画に基づく）。オーナーチームは `organization` / `owns` から導出する。

```krs
organization Corp {
  team fintech {
    label "Fintechチーム"
    owns Payment
    link "https://slack.com/archives/C..." "Fintechチーム Slack"
    link "https://notion.so/..."          "チームページ"
  }
}

system Shop {
  service Payment { label "決済" }
}
```

### オーナーシップ（`owns`）

`team` が `owns` で所有する service / domain を列挙する。AI はこの所有関係（パース時に構築される ownerIndex）を組織クエリの回答に使う。

### チームアノテーションと移行中の主オーナー

`team` ブロックは、service / domain と同じく `{` の前にアノテーションを書ける。

```krs
organization Corp {
  team legacy @deprecated {
    owns Payment
  }
  team payments @migration_target(from: "legacy") {
    owns Payment
  }
}
```

`@migration_target` / `@deprecated` は組織ビューでチームのバッジとして描画される（システム図のノードバッジと同じ仕組み）。

逆コンウェイの引き継ぎ中は、1 つのノードを複数の team が `owns` することが正当に起こりうる。`ownerIndex` は 1:1 なので、**主オーナー**を 1 つだけ移行優先度で選ぶ — `@migration_target`（移行先）が勝ち、無印が次、`@deprecated`（移行元）が負ける。同優先度の場合は最初の宣言を保持する。これは domain の移行共存ルール（上記 *Migration annotations* で `@migration_target` ドメインがナビゲーション先になる）と対称である。共同所有そのものは許容される事実で、`duplicate-owner-assignment` の **info** 診断で surface される — error にはならない。

> Related TPLs: [TPL-20260615-01](../test-perspectives/TPL-20260615-01-migration-priority-index-winner.md)（`@migration_target` 優先 / first-wins の規則は全 1:1 index で一貫させる）、[TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md)（共同所有は事実、info register に置く）。

### `link` プロパティ（チーム連絡先）

`team` ブロックに `link "<url>" "<label>"` を添える。
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
