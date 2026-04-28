---
type: product
---

# AT-0064: `client` kind — Phase 1 minimal end-to-end

## 概要

`.krs` 言語に `client` kind が追加され、parser から renderer まで end-to-end で動作することを確認する
（Issue [#849](https://github.com/kompiro/karasu/issues/849)、設計は [#823](https://github.com/kompiro/karasu/issues/823) / `docs/adr/20260428-06-client-mcp-modeling.md`）。

Phase 1 のスコープは「最小実装」: kind の追加・サブタイプタグの予約・既定 card レンダリング・Getting Started への露出まで。
`delivers` / `handles` / `resource` / 強制レイアウト / 専用 icon は後続 Phase で扱う。

## 前提条件

- main または PR ブランチに本 Phase 1 の変更がマージされている
- `examples/getting-started/` を新規プロジェクトとしてアプリで開ける状態

## 受け入れ条件

### 1. Getting Started に `client` が見える

1. アプリを起動する
2. 「Getting Started (日本語)」プロジェクトを開く
3. system 図に `モバイルアプリ` のノードが描画されている
4. 同ノードは `service` の青色とは異なる色（紫系）でレンダリングされている
5. `Customer → MobileApp → ECommerce` の経路がエッジとして表示されている
6. 警告パネルにエラーは出ていない

### 2. 認識される 7 種の form-factor タグがすべて受理される

エディタで以下の `.krs` を入力したとき、parse error が出ないことを確認する。

```krs
system T {
  client A [mobile]
  client B [web]
  client C [desktop]
  client D [cli]
  client E [device]
  client F [extension]
  client G [embed]
}
```

### 2b. 認識タグ以外のユーザー定義タグも書ける（karasu のタグ仕様）

タグは開いた語彙のため、認識タグ以外のタグも `client` に付けてよい。以下が parse error を出さないことを確認する。

```krs
system T {
  client X [mobile] [v2] [critical]
  client Y [my-team-internal-tag]
  client Z
}
```

`[v2]` `[critical]` `[my-team-internal-tag]` のような未認識タグはユーザー定義タグとして扱われ、スタイルセレクタで装飾できる。karasu は何の警告も出さない。

### 3. system 外の `client` で警告

以下の `.krs` を開くと WarningPanel に「Client "..." is not assigned to any system」が表示される。

```krs
client OrphanApp [web] { label "Orphan" }
```

### 4. 英語ロケールでも例が機能する

ロケールを English に切り替え、「Getting Started (English)」プロジェクトを開いたとき、`Mobile App` ノードが描画され、警告が出ないことを確認する。

## 自動化された検証

- `packages/core/src/parser/parser.test.ts` — `client` kind / 7 subtype タグ / role property reject の各テスト
- `packages/core/src/resolver/warnings.test.ts` — `unassigned-client` 警告
- `packages/core/src/renderer/svg-renderer.test.ts` — `service` と異なる色で描画されることのチェック

## スコープ外

- 専用 SVG icon（Phase 2 / Issue #851）
- `service.delivers <ClientId>`（Phase 3 / Issue #853）
- `client.handles` および `service.handles` の再エクスポート（Phase 4 / Issue #854）
- `resource <storageKind>`（Phase 5 / Issue #855）
- `user → client → service` 強制レイアウト（Phase 6 / Issue #856）

## 関連

- 親 Issue: [#823](https://github.com/kompiro/karasu/issues/823)
- 本 Phase: [#849](https://github.com/kompiro/karasu/issues/849)
- 設計ドキュメント: `docs/adr/20260428-06-client-mcp-modeling.md`
