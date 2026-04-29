# Client capability axis — `capability` の語彙設計

- **日付**: 2026-04-29
- **ステータス**: 検討中（壁打ち）
- **関連**: Issue #837, ADR-20260428-06 (`client` kind 導入), Issue #823 (client/MCP 親), Issue #832 (認可), Issue #834 (security 親 — credential / cookie), `docs/spec/syntax.md`, `docs/spec/tags-annotations.md`

## 背景・課題

ADR-20260428-06 で `client` kind を導入した際、`resource <storageKind> "<name>"` は **「操作-tied storage（localStorage / indexedDB / opfs / file / keychain など）」** に意味を絞ることに決めた。
その結果、camera / geolocation / notification / bluetooth / webauthn といった **デバイス・ブラウザ機能の許諾（capability / permission）** を `resource` の中に押し込めない状態になっている。

```
// やりたい表現の例
client ScannerApp [mobile] {
  capability camera        // QR スキャン用にカメラを使う
  capability geolocation   // 配達追跡で位置情報を使う
  capability notification  // プッシュ通知を出す
}
```

これは modeling の問題で、ランタイムの permission engine を作るわけではない。
目的は **「このクライアントは端末/ブラウザのどの機能を要求するか」をアーキテクチャレベルで読み取れるようにする** こと。
ユースケース:

- 権限の妥当性レビュー（このアプリ本当に位置情報必要？）
- App Store / プライバシー審査の準備材料
- 脅威モデリング — 拡大した攻撃面を可視化する
- ネイティブマニフェスト（`AndroidManifest.xml` / `Info.plist` / `manifest.json`）との対応取り（将来）

## 制約・前提

- ADR-20260428-06 の決定（`client` kind, `resource <storageKind>` の意味の絞り方）を維持する
- Issue #834（security 親 — credential / cookie / session）と語彙が衝突しないこと。capability は **「OS/ブラウザに permission を要求する device feature」** に絞り、認証 credential はここでは扱わない
- 既存 `.krs` を壊さない（追加構文）
- karasu は modeling tool であり、permission grant のランタイム表現は持たない
- 「我々が出荷するクライアント」のみが対象（ADR-20260428-06 の `client` 定義を継承）

## 用語の整理

`resource` / `capability` / `permission` / authentication credential が混ざりやすいので軸を切る。

| 軸 | 例 | 性質 | karasu での扱い |
|---|---|---|---|
| **操作-tied storage**（resource） | localStorage, IndexedDB, OPFS, keychain, file | クライアントが読み書きするデータ保管庫 | `resource <storageKind> "<name>"` (ADR-20260428-06) |
| **device/browser capability**（本 Doc の対象） | camera, geolocation, notification, bluetooth, webauthn, USB | OS / ブラウザに permission を要求する機能 | **本 Doc で設計** |
| **HTTP セッション / 認証 credential** | cookie, refresh token, OIDC session | プロトコルが自動送信する secret | Issue #834 |
| **ランタイム認可** | role / license / plan / feature flag | usecase 実行可否の判定 | Issue #832 |

これら 4 軸はすべて意味と寿命が違う。一つの構文に押し込めると後で必ず歪むので、最初から別 keyword で切る。

### `capability` vs `permission` — どちらを採るか

| 観点 | `capability` | `permission` |
|---|---|---|
| Web Permissions API の語彙 | "permission name" だが概念名は **capability** が広く使われる | OS / ブラウザの UI ダイアログでユーザーに見える文言 |
| Android | `<uses-permission>` | OS / ストア審査の語彙そのもの |
| iOS / Info.plist | `NS<Feature>UsageDescription` キー（"Privacy" 群） | Apple 用語は "permission" |
| OS（POSIX / capability-based security） | "capability" は ambient authority と区別された明示的権能を指す確立した用語 | "permission" はファイルパーミッション等を指して既に load されている |
| 抽象度 | 「能力（できること）」— 端末の機能要件を語る | 「許諾」— ユーザー操作によって付与される瞬間に焦点 |
| modeling 文脈での自然さ | 「このクライアントは camera **capability** を要する」が読みやすい | 「camera **permission** を要求する」は実装の挙動寄り |

**推奨**: `capability` を採る。

理由:
- karasu は **modeling tool** であり、ランタイムの prompt / grant ではなく **「クライアントが何を必要とするか」** を語る。`capability`（できること／必要なこと）が抽象軸として自然
- `permission` は OS パーミッションビット、ファイル ACL、認可（#832）などとの語彙衝突が発生しやすい
- POSIX capability、capability-based security、Web Capabilities Project 等で確立した用語であり、海外読者にも通じやすい

採らない代替:
- `uses camera` のような動詞ベース — 短いが他の動詞プロパティ（`handles` / `delivers` / `realizes`）とパターンが合わず、検索性も劣る
- 両方エイリアス — 仕様の表面積が増える、書き手のバラつきが増える

## 検討した選択肢

### 案 A: フラット宣言（`resource` と同じ位置）

`client` ボディ直下に `capability <name>` を並べる。`resource` と同じレベル。

```
client ScannerApp [mobile] {
  label "Field worker app"
  handles Order, Delivery
  resource keychain "session"
  capability camera
  capability geolocation
  capability notification
}
```

**メリット**
- ADR-20260428-06 の `resource` フラット宣言と完全に対称。学習コストが小さい
- パーサ拡張は keyword 1 つの追加で済む
- 案 i（client フラット）との一貫性: 将来 `usecase` の中に降ろす拡張パスもそのまま開いている

**デメリット**
- capability が多くなる（10 個など）と client ボディが縦に伸びる
- 「capability グループ」を視覚的に区切れない（resource と混在で並ぶ）

### 案 B: ブロック構文（`capabilities { ... }`）

```
client ScannerApp [mobile] {
  handles Order
  resource keychain "session"
  capabilities {
    camera
    geolocation
    notification
  }
}
```

**メリット**
- 多数の capability を持つクライアント（PWA で 10 個など）でも視認性が保てる
- 「権限まとめ」セクションとして読みやすい

**デメリット**
- パーサ・AST に新ブロック型を追加する必要があり、実装表面積が増える
- ADR-20260428-06 のフラット原則と外れる（`resource` だけフラット、`capability` だけブロックという非対称が生まれる）
- 1〜2 個しか capability がない大半のケースで冗長

### 案 C: scope 修飾付き（`capability camera @when "qr-scan"`）

宣言時に annotation で利用文脈を補える。

```
client ScannerApp [mobile] {
  capability camera @when "qr-scan"
  capability geolocation @when "background"
  capability notification @scope "order-updates"
}
```

**メリット**
- 脅威モデリングで「camera は QR スキャン専用」という重要情報が表に出る
- 将来 `usecase` 単位の capability 関連付けへの橋渡しになる

**デメリット**
- annotation の意味（自由テキスト vs 予約語）が曖昧になる
- MVP として decode が増え、書き手も「どこまで書けばいいのか」迷う
- usecase 階層（案 ii / Issue 後継）に降りれば構造で表現できるため、annotation で先回りする必要は薄い

## 比較

| 観点 | 案 A: フラット | 案 B: ブロック | 案 C: scope 修飾 |
|---|---|---|---|
| 既存（`resource`）との対称性 | 強 | 弱 | 強（A の上乗せ） |
| パーサ拡張コスト | 小 | 中 | 中（annotation parse） |
| 多 capability 時の可読性 | 中 | 高 | 中 |
| 1〜3 個の典型ケース | 高 | 低（冗長） | 高 |
| 将来 `usecase` 階層への移行 | 機械変換可能 | 機械変換可能 | 機械変換可能（情報を保持） |
| 書き手のバラつき | 小 | 小 | 中（書く/書かないの判断） |

## 現時点の方針（推奨）

**案 A（フラット宣言）を MVP として採る**。ただし `label` / `description` を書きたい場合はブロック形式 `capability <name> { label "..." description "..." }` も許す（他の karasu ノードの宣言形式と統一）。`@when` / `@scope` 等の追加修飾は **将来オプション** として残す（annotation の文法は予約済みなので構文側の変更不要）。

```
client OrderClient [mobile] {
  label "Customer mobile app"
  handles Order, Catalog
  resource keychain "session"

  // 短縮形: 補足が要らない capability はフラット 1 行で書く
  capability notification

  // ブロック形式: 「なぜ要るのか」を残したい場合
  capability camera {
    label "QR scanning"
    description "Used to scan QR codes attached to inspection items"
  }
  capability geolocation {
    description "Continuous tracking during delivery"
  }
}
```

理由:
- ADR-20260428-06 の `resource` フラット原則と対称で、学習コストが最小
- 大半の現実ケース（capability 1〜3 個）はフラット 1 行で済む
- 「なぜこの権限を要求するか」は脅威モデリング・ストア審査の本質情報なので、書きたい場合の構造化された置き場（label / description）を最初から提供する
- 他のノード（`client` / `service` / `domain` / `usecase` / `resource`）と同じく `label` / `description` を `{ ... }` ブロック内で書ける統一感を保つ
- `usecase` 階層（将来の案 ii）に降ろす拡張パスは案 A → ブロック → usecase の順に機械変換可能で塞がれない
- 将来 annotation で `@when` 等を加えるのも上乗せとして可能（破壊的変更にならない）

採らない代替:
- 案 B（`capabilities { ... }` ラッパブロック）は対称性の崩れと冗長さで却下
- 案 C（`@when` 修飾を MVP 必須）は表面積を膨らませる。`description` で当面しのげる

## 推奨する capability セット（オープン推奨集合）

karasu は modeling tool であり、想定外の使われ方（業界特有のデバイス、未来のブラウザ API、社内独自の権限軸）が必ず出る。
そのため capability の識別子集合は **クローズドな予約セットではなく、推奨集合（recommended set）** として扱う:

- **任意の識別子を `capability` として書ける**（unknown も警告なし）
- 下記の推奨集合は「迷ったらこの名前を使ってほしい」という規範であり、強制ではない
- LSP / エディタ補完や docs 上のリファレンスは推奨集合をベースにする
- 推奨集合外の名前を使った場合、書き手の責任で意味が一意になるよう description を添える運用

### Web / ブラウザ系（共通）

`camera` / `microphone` / `geolocation` / `notification` / `push` / `clipboard` / `webauthn` / `bluetooth` / `usb` / `midi` / `screen-wake-lock` / `accelerometer` / `gyroscope` / `storage-access`

### Mobile 追加

`contacts` / `calendar` / `photo-library` / `face-id` / `touch-id` / `background-processing` / `local-network` / `bluetooth-le-peripheral`

> `face-id` / `touch-id` は WebAuthn / platform authenticator と紛らわしいが、ネイティブ生体認証 API を直接呼ぶケースを表す。WebAuthn 経由なら `webauthn` を使う。

### Desktop 追加

`file-system-access` / `global-shortcuts` / `auto-launch` / `screen-recording`

### IoT 追加

`gpio` / `serial` / `zigbee` / `lora` / `nfc` / `rfid`

> 例: ハンディターミナル（`client [device]`）が `zigbee` を在庫管理サーバーへの通信路として要求する、KIOSK が `nfc` で IC カード読み取りを行う、といったケース。

### 命名規則

- **kebab-case** で揃える（`screen-wake-lock`, `face-id`）
- Web Permissions API / W3C 仕様の名前を優先する（`geolocation`, `notification`）
- OS 固有名は避け、抽象機能名を選ぶ（×`android.permission.CAMERA`, ◯`camera`）
- 推奨集合外でも書き手が一貫して使う限り許容する

### 推奨集合の拡張

需要が出た capability は推奨集合に都度追加する。`docs/spec/tags-annotations.md` 等の更新で対応し、コード側のホワイトリスト変更は不要（オープン集合のため）。

## バリデーション

### 必須チェック（MVP）

- **重複宣言**: 同 capability を同 client 内で 2 度宣言した場合は **warning**（明確なバグであり false positive がない）

### あえて入れないチェック

- **不明な capability の警告**: 入れない。識別子集合をオープンに保つ方針（推奨集合の節を参照）と整合する。typo は LSP の補完候補で支援する想定で、validator は黙って通す
- **subtype との整合警告**: 入れない。`client [cli] { capability camera }` のような組み合わせも、想定外のツール用途（例えば CLI が動画キャプチャ用 binary を起動する）を排除しない。書き手の判断に委ねる

### スコープ外（将来）

- usecase 単位での capability 利用追跡（`capability camera` を宣言したが実際にどの usecase で使うか）— 案 ii（フル階層）の議論に持ち越し
- ネイティブマニフェストとの整合チェック — 別ツール
- runtime permission grant のシミュレーション — modeling tool のスコープ外

## 物理側（deploy）との関係

物理側で capability を直接扱う必要は **MVP では出ない**。
将来、native manifest 生成（`AndroidManifest.xml` / `Info.plist` / browser `manifest.json`）の opt-in tooling を作る場合、deploy unit kind（`mobile-app` / `assets` / `desktop-app`）と論理側 `client.capability` の対応を別 Issue で設計する。

## レンダリング

MVP は client ノードのテキスト表示で十分。`resource` と同じ扱いで、ノード本体に `📷 camera`, `📍 geolocation` のような行を追加する（icon は実装判断）。
将来、capability ごとの icon 差別化や、edge / annotation での視覚化が必要になれば段階的に拡張する。

## 想定されるユースケースでの検証

### ケース 1: QR スキャナー mobile アプリ

```
system Field {
  user FieldWorker [human]
  client ScannerApp [mobile] {
    label "Field scanner"
    handles Inspection
    resource keychain "session"
    capability camera         // QR スキャン
    capability geolocation    // 検査地点記録
  }
  service InspectionService { domain Inspection { ... } }
  FieldWorker -> ScannerApp -> InspectionService
}
```

→ 「このアプリはカメラと位置情報を要求する」が一目で読める。プライバシーレビューの議論基盤になる。

### ケース 2: PWA + プッシュ通知

```
client CustomerWeb [web] {
  handles Order
  resource indexedDB "outbox"
  resource opfs "attachments"
  capability notification
  capability push
  capability storage-access  // 3rd-party context での storage
}
```

→ Web 系の権限がフラットに並び、SPA / PWA の特徴が見える。

### ケース 3: ブラウザ拡張

```
client InvoiceHelper [extension] {
  handles Invoice
  capability clipboard
  capability storage-access
}
```

→ extension 固有の permission 軸（`clipboard`, `storage-access`）が表現できる。

### ケース 4: ハンディターミナル（IoT × 通信路）

```
client WarehouseTerminal [device] {
  label "Handheld inventory terminal"
  handles Inventory
  capability zigbee {
    description "Communication path to in-warehouse inventory hub"
  }
  capability nfc {
    description "RFID tag scanning for shelf inventory"
  }
}
```

→ 「IoT 端末がどんな通信・読み取り経路を要求するか」を modeling 上で読み取れる。validator は推奨集合外でも警告しない。

### ケース 5: 推奨集合外の独自 capability

```
client SignageDisplay [device] {
  label "Digital signage"
  capability remote-config-fetch {
    description "Pulls layout updates from internal CMS over LAN"
  }
}
```

→ 推奨集合に無い識別子でも警告は出ない。description で意味を補い、書き手の責任で一貫した命名を保つ運用。

## MVP のスコープ

### 含むもの

- `capability <name>` フラット構文 + `capability <name> { label "..." description "..." }` ブロック構文（`client` ボディ直下）
- 推奨 capability 集合のドキュメント化（コード側はオープン受容のためホワイトリスト不要）
- バリデーション: 同一 client 内での重複宣言 warning のみ
- レンダリング: client ノード内テキスト表示（icon は最小）
- `docs/spec/syntax.md` / `docs/spec/tags-annotations.md` の更新（推奨集合の章を追加）
- `examples/getting-started/` および `examples/getting-started-en/` の MobileApp client に `capability notification` を 1 行追加
- `examples/client-mcp/` への capability ブロック構文を含むリッチな例

### スコープ外（別 Issue）

- usecase 単位の capability 利用追跡
- `@when` / `@scope` annotation
- ネイティブマニフェスト生成 / 整合チェック
- capability 別 icon の細分化
- `service` 側の capability 概念（サーバーが OS capability を要求するケース — 出てきたら #834 配下で別 Issue）
- runtime permission engine 連携

## 受け入れテスト（draft）

> 実装フェーズで `docs/acceptance/` に正式追記。本 Doc では outline のみ。

- AT-A: `client X [mobile] { capability camera }` がフラット形式で parse / render できる
- AT-B: `capability camera { label "QR" description "..." }` ブロック形式で parse / render できる
- AT-C: 推奨集合外の識別子（`capability foo`）でも parse / render が成功し、警告は出ない
- AT-D: 同 capability の重複宣言で warning
- AT-E: `examples/getting-started/` および `examples/getting-started-en/` の MobileApp client に capability が追加され、render 結果に capability 行が出る
- AT-F: `examples/client-mcp/` にブロック形式の capability を含むクライアントが追加され、label / description が render に反映される
- AT-G: docs（`docs/spec/syntax.md` / `docs/spec/tags-annotations.md`）に `capability` の構文と推奨集合が追加される
- AT-H（manual）: ドキュメントを読んだ第三者が `capability` と `resource` の役割の違いを理解できる

## 決定事項のサマリ（旧「未解決の問い」を確定）

### D1. capability にサブタグは付けない ✅ 決定

```
capability bluetooth [le]    // 採らない
```

`bluetooth` / `bluetooth-le` / `bluetooth-classic` のように **別識別子** で表現する。subtype tag 構文は `client` の形態タグと表記が混ざり、混乱の元になるため。

### D2. capability に label / description を許す ✅ 決定

```
capability geolocation {
  label "配達追跡用"
  description "Continuous tracking for the courier dashboard"
}
```

理由:
- 「なぜこの権限を要求するか」は脅威モデリング・ストア審査の本質情報なので、書きたい場合の構造化された置き場が要る
- 他のノード（`client` / `service` / `domain` / `usecase` / `resource`）は `label` / `description` をプロパティとして持っており、capability だけ持たないのは非対称
- フラット形式 `capability camera` も維持するため、補足が要らないケースは 1 行で済む

### D3. getting-started に capability を出す ✅ 決定

`examples/getting-started/index.krs` および `examples/getting-started-en/index.krs` の MobileApp client に `capability notification` 等を 1 行追加する。読み手に「こういう軸がある」と早期に伝える方が、後付けで紹介するより `client` の輪郭がはっきりする。

### D4. Phase 分割は実装着手時に判断 🟡 保留

実装着手時に規模を見積もり、1 PR に収まれば独立 1 PR、大きくなれば分割する。
分割する場合の自然な切れ目: (a) parser + AST + 重複 warning, (b) renderer + examples, (c) docs。

### D5. capability の識別子集合はオープン ✅ 決定（Q6 を再定義）

karasu は modeling tool であり、想定外の使われ方が必ず出る。識別子集合を **クローズドな予約セットではなく推奨集合** として扱う:

- 任意の識別子を `capability` として書ける（unknown も警告なし）
- 推奨集合は「迷ったらこの名前を使ってほしい」という規範
- LSP / エディタ補完や docs リファレンスは推奨集合をベースにする
- 推奨集合外の名前を使った場合、書き手の責任で description を添える運用

これに伴い、subtype mismatch（`[cli]` + camera 等）の警告も廃止。重複宣言警告のみ残す。

### D6. IoT 系も推奨集合に含める ✅ 決定

ハンディターミナルが `zigbee` を在庫サーバーとの通信路として要求する、KIOSK が `nfc` で IC カードを読む、といった現実ケースがある。IoT 追加: `gpio` / `serial` / `zigbee` / `lora` / `nfc` / `rfid`。

## 参考: Issue #837 で挙がった open question への回答

| #837 の問い | 本 Doc での結論 |
|---|---|
| 1. keyword: `capability` vs `permission` vs `uses` | **`capability`** |
| 2. scope qualifier (`@when` / `@scope`) | MVP では採らない、annotation 余地は残す。`label` / `description` で当面しのぐ |
| 3. 推奨集合 | web / mobile / desktop / IoT 計 30+ 種を推奨集合として提示、需要で拡張 |
| 4. placement: flat vs `capabilities { }` | **flat 単独 + `capability X { ... }` ブロック併用**（案 A 拡張） |
| 5. ネイティブマニフェスト連携 | スコープ外、構文側で塞がない |
| 6. 未使用警告 | MVP では出さない（usecase 階層がないため）。将来 |

## ADR 昇格の見通し

実装が完了し examples / docs が揃った段階で `docs/adr/YYYYMMDD-NN-client-capability-modeling.md` に昇格予定。
ADR-20260428-06 を `related_to` で参照する。
