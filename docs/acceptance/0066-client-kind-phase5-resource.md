---
type: product
---

# AT-0066: `client` kind — Phase 5 (`resource <storageKind>` で operation-tied storage を表現)

## 概要

`client { resource <storageKind> "<name>" }` フラット構文が parser → validator → renderer まで end-to-end で動作することを確認する
（Issue [#855](https://github.com/kompiro/karasu/issues/855)、設計は [#823](https://github.com/kompiro/karasu/issues/823) / `docs/design/client-mcp-modeling.md`）。

Phase 5 のスコープは 6 種の予約 storage kind（`localStorage` / `sessionStorage` / `indexedDB` / `opfs` / `file` / `keychain`）の受理と、それ以外の kind の拒否、および client カードへのテキスト一覧描画まで。
cookie / credential / device capability などは別 Issue（[#834](https://github.com/kompiro/karasu/issues/834) / [#837](https://github.com/kompiro/karasu/issues/837)）に委譲する。

## 前提条件

- main または PR ブランチに本 Phase 5 の変更がマージされている
- アプリで新規プロジェクトを作成し、空の `index.krs` を編集できる状態

## 受け入れ条件

### 1. 6 種の whitelist 済み storage kind がすべて受理される

新規プロジェクトの `index.krs` に以下を入力する。

```krs
system T {
  client WebApp [web] {
    label "Web"
    resource localStorage "preferences"
    resource sessionStorage "view-state"
    resource indexedDB "outbox"
    resource opfs "drafts"
    resource file "config.json"
    resource keychain "auth-token"
  }
}
```

- 警告パネル / diagnostic banner にエラーが表示されない
- preview の `WebApp` カード上に 6 行の `📦 <kind> "<name>"` が縦に並んで描画される
- カードは resource 行を収めるために自動で縦に伸びている

### 2. whitelist 外の storage kind が拒否される

`index.krs` に以下を入力する。

```krs
system T {
  client WebApp [web] {
    resource cookie "session"
  }
}
```

- diagnostic banner に「Invalid client resource kind "cookie" for resource "session". Allowed kinds: localStorage, sessionStorage, indexedDB, opfs, file, keychain」相当のエラーが赤で表示される
- ロケールを日本語に切り替えると同じエラーが日本語で表示される（`client の resource "session" の種別 "cookie" は無効です` 相当）
- preview には `WebApp` ノードは描画されるが、resource 行は出ない

### 3. resource を持たない `client` も従来どおり描画される

```krs
system T {
  client WebApp [web] { label "Web" }
}
```

- 警告 / エラーは出ない
- preview の `WebApp` カードに resource 行が出ない（Phase 1 と同じ見た目）

### 4. `resource` プロパティは `client` 限定（service / domain / usecase では無効）

`service` ブロック内に `resource indexedDB "outbox"` のような **string literal を伴う** `resource` 文を書くと、従来どおり parser が「`resource indexedDB` の宣言」として扱おうとし、エラーまたは未割当 resource の警告が出る（Phase 5 で挙動を変えない）。

```krs
system T {
  service S {
    resource indexedDB "outbox"   // ← client 限定の構文。service ブロック内では従来の resource 宣言として解釈されるため警告/エラーが出る
  }
}
```

- diagnostic banner / warning panel に何らかのメッセージが出る（client 専用構文として silently 受理されないこと）

## 自動化された検証

- `packages/core/src/parser/parser.test.ts`
  - 6 種の whitelist 済み storage kind がすべて parse される（`parses client resources with all whitelisted storage kinds`）
  - whitelist 外の kind で `client-resource-invalid-kind` 診断が出る（`rejects unknown client resource kind`）
  - resource ブロックを持たない `client` で空配列が返る（`client without resource block parses with empty resources`）
- `packages/core/src/renderer/svg-renderer.test.ts`
  - resource 行が `📦 <kind> "<name>"` のテキストとして描画され、`data-client-resource` 属性が付与される（`renders client resource list inline on the card`）

## スコープ外

- 専用 SVG icon / kind 別の見た目（MVP 後の段階的拡張）
- `usecase` の中に `resource` をネストする案 ii のフル階層（将来 Issue）
- TTL / 暗号化フラグなど per-resource 属性
- 認証 credential / cookie / セッション（[#834](https://github.com/kompiro/karasu/issues/834)）
- デバイス能力（camera / geolocation 等、[#837](https://github.com/kompiro/karasu/issues/837)）

## 関連

- 親 Issue: [#823](https://github.com/kompiro/karasu/issues/823)
- 本 Phase: [#855](https://github.com/kompiro/karasu/issues/855)
- PR: [#884](https://github.com/kompiro/karasu/pull/884)
- 設計ドキュメント: `docs/design/client-mcp-modeling.md`
