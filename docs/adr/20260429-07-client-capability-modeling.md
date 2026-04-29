---
id: ADR-20260429-07
title: client の capability 軸 — device / browser permission の語彙設計
status: accepted
date: 2026-04-29
topic: core-concepts
related_to:
  - ADR-20260428-06
scope:
  packages:
    - core
    - app
assumptions:
  - "grep: packages/core/src/types/ast.ts :: ClientCapability"
  - "grep: packages/core/src/lexer/lexer.ts :: capability"
  - "grep: packages/core/src/parser/parser.ts :: parseClientCapability"
  - "grep: packages/core/src/resolver/warnings.ts :: detectDuplicateClientCapabilities"
  - "file: docs/spec/syntax.md"
  - "file: docs/spec/tags-annotations.md"
  - "file: docs/acceptance/1002-client-capability.md"
---

# ADR-20260429-07: client の capability 軸 — device / browser permission の語彙設計

- **日付**: 2026-04-29 (Design Doc 作成・実装・ADR 昇格)
- **ステータス**: 決定済み — 実装完了 (PR #1026)
- **関連**: Issue #837, ADR-20260428-06 (`client` kind 導入), Issue #823 (client / MCP 親), Issue #832 (認可), Issue #834 (security 親 — credential / cookie), `docs/spec/syntax.md`, `docs/spec/tags-annotations.md`, `docs/acceptance/1002-client-capability.md`

## 背景

ADR-20260428-06 で `client` kind を導入した際、`resource <storageKind> "<name>"` は **「操作-tied storage（localStorage / indexedDB / opfs / file / keychain など）」** に意味を絞ることに決めた。
その結果、camera / geolocation / notification / bluetooth / webauthn といった **デバイス・ブラウザ機能の許諾（capability / permission）** を `resource` の中に押し込めない状態になっていた。

```
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

## 決定

`client` body 直下に **`capability <name>`（フラット形式）または `capability <name> { label "..." description "..." }`（ブロック形式）** を導入する。識別子集合は **オープン**（任意の識別子を受け入れ、推奨集合は規範のみ）。バリデーションは同 client 内の **重複宣言の警告のみ**（`client-capability-duplicate`）。レンダリングは `📦 ×N` resource バッジと並んで `🔐 ×N` capability バッジを 1 行で出す。

## 理由

### 用語の整理 — `capability` を採る理由

`resource` / `capability` / `permission` / authentication credential が混ざりやすいので軸を切った:

| 軸 | 例 | 性質 | karasu での扱い |
|---|---|---|---|
| **操作-tied storage**（resource） | localStorage, IndexedDB, OPFS, keychain, file | クライアントが読み書きするデータ保管庫 | `resource <storageKind> "<name>"` (ADR-20260428-06) |
| **device/browser capability** | camera, geolocation, notification, bluetooth, webauthn, USB | OS / ブラウザに permission を要求する機能 | **本 ADR** |
| **HTTP セッション / 認証 credential** | cookie, refresh token, OIDC session | プロトコルが自動送信する secret | Issue #834 |
| **ランタイム認可** | role / license / plan / feature flag | usecase 実行可否の判定 | Issue #832 |

`capability` を採った理由:

- karasu は **modeling tool** であり、ランタイムの prompt / grant ではなく **「クライアントが何を必要とするか」** を語る。`capability`（できること／必要なこと）が抽象軸として自然
- `permission` は OS パーミッションビット、ファイル ACL、認可（#832）などとの語彙衝突が発生しやすい
- POSIX capability、capability-based security、Web Capabilities Project 等で確立した用語であり、海外読者にも通じやすい

### 構文 — フラット + ブロック併用

ADR-20260428-06 の `resource` フラット原則と対称にし、補足が必要な場合のみブロック形式に降りられる構造を採った:

```
client OrderClient [mobile] {
  label "Customer mobile app"
  handles Order, Catalog
  resource keychain "session"

  // 短縮形: 補足が要らない capability はフラット 1 行
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

- 大半のケース（capability 1〜3 個）はフラット 1 行で済む
- 「なぜこの権限を要求するか」は脅威モデリング・ストア審査の本質情報なので、書きたい場合の構造化された置き場（label / description）を提供
- 他のノード（`client` / `service` / `domain` / `usecase`）と同じく `label` / `description` を `{ ... }` ブロック内で書ける統一感
- `usecase` 階層への将来の拡張パスは案 A → ブロック → usecase の順に機械変換可能で塞がれない
- 将来 annotation で `@when` 等を加えるのも上乗せとして可能

kebab-case 識別子（`screen-wake-lock`, `face-id` 等）への対応のため、parser が連続する `<ident>-<ident>` を 1 つの capability 名に stitch する。

### 識別子集合 — オープン推奨集合

karasu は modeling tool であり、想定外の使われ方（業界特有のデバイス、未来のブラウザ API、社内独自の権限軸）が必ず出る。そのため capability の識別子集合は **クローズドな予約セットではなく、推奨集合（recommended set）** として扱う:

- **任意の識別子を `capability` として書ける**（unknown も警告なし）
- 推奨集合は「迷ったらこの名前を使ってほしい」という規範であり、強制ではない
- LSP / エディタ補完や docs 上のリファレンスは推奨集合をベースにする
- 推奨集合外の名前を使った場合、書き手の責任で意味が一意になるよう description を添える運用

推奨集合（`docs/spec/tags-annotations.md` に正式記載）:

- **Web / ブラウザ系**: `camera` / `microphone` / `geolocation` / `notification` / `push` / `clipboard` / `webauthn` / `bluetooth` / `usb` / `midi` / `screen-wake-lock` / `accelerometer` / `gyroscope` / `storage-access`
- **Mobile 追加**: `contacts` / `calendar` / `photo-library` / `face-id` / `touch-id` / `background-processing` / `local-network` / `bluetooth-le-peripheral`
- **Desktop 追加**: `file-system-access` / `global-shortcuts` / `auto-launch` / `screen-recording`
- **IoT 追加**: `gpio` / `serial` / `zigbee` / `lora` / `nfc` / `rfid`

### バリデーション — 重複のみ

- **重複宣言**（`client-capability-duplicate`）: 同 capability を同 client 内で 2 度宣言した場合は warning（明確なバグであり false positive がない）
- **不明な capability の警告は入れない**: 識別子集合をオープンに保つ方針と整合する。typo は LSP の補完候補で支援する
- **subtype との整合警告は入れない**: `client [cli] { capability camera }` のような組み合わせも、想定外のツール用途を排除しない

### レンダリング — `🔐 ×N` バッジ

ADR-20260428-06 の `📦 ×N` resource バッジパターンを踏襲し、capability も card 高さを bound するため `🔐 ×N` の単一バッジで表示する。フルリスト（label / description 含む）は `NodeDetailPanel` に展開する。capability ごとの icon 差別化は将来の拡張余地として残す。

## 却下した案

### 案 B: ブロックラッパ構文（`capabilities { ... }`）

```
client ScannerApp [mobile] {
  capabilities {
    camera
    geolocation
    notification
  }
}
```

- 多数の capability を持つクライアント（PWA で 10 個など）でも視認性が保てる
- が、`resource` だけフラット、`capability` だけブロックという非対称が生まれ、ADR-20260428-06 のフラット原則と外れる
- 1〜2 個しか capability がない大半のケースで冗長
- → 却下

### 案 C: scope 修飾を MVP 必須（`capability camera @when "qr-scan"`）

- 脅威モデリングで「camera は QR スキャン専用」という重要情報が表に出るのは魅力
- が、annotation の意味（自由テキスト vs 予約語）が曖昧になり、書き手も「どこまで書けばいいのか」迷う
- usecase 階層（将来）に降りれば構造で表現できる
- → 却下（annotation 文法は予約済みなので破壊的変更にならず将来追加可能）

### `permission` キーワード

- OS / ストア審査の語彙そのもので具体性は高い
- が、OS パーミッションビット、ファイル ACL、認可（#832）などとの語彙衝突が起こる
- modeling 文脈では `capability`（できること／必要なこと）の方が抽象軸として自然
- → 却下

### クローズドな予約セット（識別子の whitelist）

- typo を validator で防げるメリットはある
- が、想定外の使われ方（業界特有のデバイス、未来のブラウザ API、社内独自軸）を排除してしまい、modeling tool として表現力を狭める
- typo 抑制は LSP の補完で代替する
- → 却下
