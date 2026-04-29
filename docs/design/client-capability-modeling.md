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

**案 A（フラット宣言）を MVP として採る**。`@when` / `@scope` 等の修飾は **将来オプション** として残す（annotation の文法は予約済みなので構文側の変更不要）。

```
client OrderClient [mobile] {
  label "Customer mobile app"
  handles Order, Catalog
  resource keychain "session"
  capability camera
  capability geolocation
  capability notification
}
```

理由:
- ADR-20260428-06 の `resource` フラット原則と対称で、学習コストが最小
- 大半の現実ケース（capability 1〜3 個）に最適化される
- `usecase` 階層（将来の案 ii）に降ろす拡張パスは案 A → ブロック → usecase の順に機械変換可能で塞がれない
- 将来 annotation で `@when` 等を加えるのも上乗せとして可能（破壊的変更にならない）

採らない代替:
- 案 B（ブロック）は対称性の崩れと冗長さで却下
- 案 C（修飾必須）は MVP の表面積を膨らませる。useful だが先回りしすぎ

## 予約する capability セット（MVP）

最初に予約するセットは **「複数 OS / プラットフォームを横断する代表的な機能」** に絞る。
プラットフォーム固有の細かい permission（例: Android の `READ_EXTERNAL_STORAGE`）はマニフェスト出力時の話で、modeling には不要。

### Web / ブラウザ系（共通）

`camera` / `microphone` / `geolocation` / `notification` / `push` / `clipboard` / `webauthn` / `bluetooth` / `usb` / `midi` / `screen-wake-lock` / `accelerometer` / `gyroscope` / `storage-access`

### Mobile 追加

`contacts` / `calendar` / `photo-library` / `face-id` / `touch-id` / `background-processing` / `local-network` / `bluetooth-le-peripheral`

> `face-id` / `touch-id` は WebAuthn / platform authenticator と紛らわしいが、ネイティブ生体認証 API を直接呼ぶケースを表す。WebAuthn 経由なら `webauthn` を使う。

### Desktop 追加

`file-system-access` / `global-shortcuts` / `auto-launch` / `screen-recording`

### IoT 追加

`gpio` / `serial` / `zigbee` / `lora`

### 命名規則

- **kebab-case** で揃える（`screen-wake-lock`, `face-id`）
- Web Permissions API / W3C 仕様の名前を優先する（`geolocation`, `notification`）
- OS 固有名は避け、抽象機能名を選ぶ（×`android.permission.CAMERA`, ◯`camera`）
- 不明な capability は parser で warning（typo 検出のため。fatal にはしない — 仕様外の長尾ケースは存在する）

### 将来追加の方針

新規 capability は需要が出たら都度追加。MVP セットを最初から完璧に揃える必要はない（ホワイトリスト方式 + warning）。

## バリデーション

### 必須チェック（MVP）

- **不明な capability**: 予約セット外の name は **warning**（fatal にはしない）。typo（`geoloaction`）の検出が目的
- **重複宣言**: 同 capability の 2 度宣言は **warning**
- **subtype との整合**: `client [cli] { capability camera }` のように、形態的にあり得ない組み合わせは **warning**（CLI ツールが camera を要求するのは普通ない）。ホワイトリスト的にゆるく。

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

### ケース 4: 形態不一致の警告

```
client AdminCLI [cli] {
  capability camera   // ← validator warning: cli + camera は通常ない
}
```

## MVP のスコープ

### 含むもの

- `capability <name>` フラット構文（`client` ボディ直下）
- 予約 capability セット（上記 web / mobile / desktop / IoT 計 30 種前後）
- バリデーション: unknown capability warning / 重複 warning / subtype mismatch warning（ゆるい）
- レンダリング: client ノード内テキスト表示（icon は最小）
- `docs/spec/syntax.md` / `docs/spec/tags-annotations.md` の更新
- `examples/client-mcp/` への capability 例示の追加

### スコープ外（別 Issue）

- usecase 単位の capability 利用追跡
- `@when` / `@scope` annotation
- ネイティブマニフェスト生成 / 整合チェック
- capability 別 icon の細分化
- `service` 側の capability 概念（サーバーが OS capability を要求するケース — 出てきたら #834 配下で別 Issue）
- runtime permission engine 連携

## 受け入れテスト（draft）

> 実装フェーズで `docs/acceptance/` に正式追記。本 Doc では outline のみ。

- AT-A: `client X [mobile] { capability camera }` が parse / render / examples で確認できる
- AT-B: 不明な capability（`capability foo`）で warning、parse は成功
- AT-C: 同 capability の重複宣言で warning
- AT-D: `client [cli] { capability camera }` で subtype mismatch warning
- AT-E: `examples/client-mcp/` に capability を含むクライアントが追加され、render 結果に capability 行が出る
- AT-F: docs（`docs/spec/syntax.md` / `docs/spec/tags-annotations.md`）に `capability` の記述が追加される
- AT-G（manual）: ドキュメントを読んだ第三者が `capability` と `resource` の役割の違いを理解できる

## 未解決の問い

### Q1. capability の値はサブタグ拡張を許すか

```
capability bluetooth [le]            // BLE 限定
capability bluetooth [classic, le]   // 両方
```

**推奨**: MVP では **採らない**。`bluetooth` 一語で表現し、必要なら `bluetooth-le` を別 capability として予約セットに追加する。サブタグは将来検討。

### Q2. capability に label / description を付けられるか

```
capability geolocation { label "配達追跡用" }
```

**推奨**: MVP では **採らない**（フラット 1 行のシンプルさを保つ）。将来 `@when` annotation で似た情報を載せられる。

### Q3. `examples/getting-started/` への追加

ADR-20260428-06 で `getting-started` には `client` を追加した。capability も同様に getting-started に出すか？

**推奨**: **出さない**。getting-started は最小学習導線であり、capability は応用編。`examples/client-mcp/` のリッチな例で見せれば十分。

### Q4. Phase 計画

ADR-20260428-06 が 8 phase に分けたのと同様、capability も独立 phase でリリースするか、`client` MVP の延長 PR でまとめるか。

**推奨**: **独立 1 PR で投入**。capability は `client` MVP 完了後の追加トピックなので、ADR-20260428-06 の 8 phase 構造とは独立。実装規模も中程度（1 PR でレビューに収まる想定）。

## 参考: Issue #837 で挙がった open question への回答

| #837 の問い | 本 Doc での結論 |
|---|---|
| 1. keyword: `capability` vs `permission` vs `uses` | **`capability`** |
| 2. scope qualifier (`@when` / `@scope`) | MVP では採らない、annotation 余地は残す |
| 3. 予約セット | web 14 + mobile 8 + desktop 4 + IoT 4 種程度を初期予約、需要で追加 |
| 4. placement: flat vs `capabilities { }` | **flat**（案 A） |
| 5. ネイティブマニフェスト連携 | スコープ外、構文側で塞がない |
| 6. 未使用警告 | MVP では出さない（usecase 階層がないため）。将来 |

## ADR 昇格の見通し

実装が完了し examples / docs が揃った段階で `docs/adr/YYYYMMDD-NN-client-capability-modeling.md` に昇格予定。
ADR-20260428-06 を `related_to` で参照する。
