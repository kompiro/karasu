---
type: product
---

# AT-0066: `client` kind — Phase 4 `handles` cross-reference and re-export

## 概要

`client` と `service` の両方で `handles <DomainId>[, ...]` プロパティが書けるようになり、接続トポロジに対する **expose ルール** が検証されることを確認する
（Issue [#854](https://github.com/kompiro/karasu/issues/854)、設計は `docs/adr/20260428-06-client-mcp-modeling.md` Phase 4 行）。

Phase 4 のスコープは `handles` のパースと validator の警告。Renderer での視覚化は別フェーズ（Phase 6 のレイアウト等）。

## 前提条件

- Phase 1 (#849) と Phase 2 (#851) が main にマージされている
- 任意の `.krs` を編集できる状態

## 受け入れ条件

### 1. 直接接続: `client → service.owns` が解決する

```krs
system S {
  client WebApp [web] { handles Order }
  service Backend { domain Order {} }
  WebApp -> Backend
}
```

WarningPanel に `unresolved-handles` 警告が出ないことを確認する。

### 2. BFF チェーン: `client → BFF.handles → backend.owns` が解決する

```krs
system S {
  client WebApp [web] { handles Order }
  service Bff { handles Order }
  service Backend { domain Order {} }
  WebApp -> Bff
  Bff -> Backend
}
```

WarningPanel に `unresolved-handles` 警告が出ないことを確認する。

### 3. タイポで警告が出る

```krs
system S {
  client WebApp [web] { handles Ordr }
  service Backend { domain Order {} }
  WebApp -> Backend
}
```

WarningPanel に「client "WebApp" declares handles "Ordr" but no outgoing edge target exposes that domain」（日本語ロケールでは "WebApp の handles "Ordr" を expose する送信先エッジが見つかりません"）と表示される。

### 4. エッジ抜けで警告が出る

```krs
system S {
  client WebApp [web] { handles Order }
  service Backend { domain Order {} }
  // edge missing
}
```

`unresolved-handles` 警告が出る。

### 5. BFF が re-export を宣言し忘れた場合警告が出る

```krs
system S {
  client WebApp [web] { handles Order }
  service Bff {}                 // forgot `handles Order`
  service Backend { domain Order {} }
  WebApp -> Bff
  Bff -> Backend
}
```

WebApp の `handles Order` が解決しないため警告が出る（暗黙的なパススルーは採用していない、という設計上の意図を確認）。

### 6. カンマ区切り / 複数行どちらも書ける

```krs
client A [web] { handles X, Y, Z }
client B [web] {
  handles X
  handles Y, Z
}
```

両形式が同じ意味として受理される。

### 7. user / domain / usecase に handles を書くと parse error

```krs
system S {
  user U [human] { handles X }    // → "handles" is only valid for client and service nodes
}
```

エディタ上に diagnostic が表示される。

## 自動化された検証

- `packages/core/src/parser/parser.test.ts` — handles 単体 / カンマリスト / 複数行 / service 側 / 不正 kind の各テスト
- `packages/core/src/resolver/warnings.test.ts` — 直接解決 / BFF チェーン / タイポ / エッジ抜け / BFF 宣言抜け / cycle 安全性 のテスト
- 既存の core (955) / app (549) スイートが引き続き通過

## 既知の制限

- **Top-level (system 外) の `client` / `service` に書いた `handles` は edge を歩いた検証を行わない**: 上位の `unassigned-client` / `unassigned-service` 警告ですでに到達不能であることが示されているため、`unresolved-handles` 警告は重ねて出さない。`handles` のタイポ自体は気付きにくくなるが、いったん system に取り込めば検証が走る。

## スコープ外（次フェーズ）

- usecase / resource 単位の部分再エクスポート（Q14 — 需要が見えてから）
- リネーム再エクスポート（`handles X as Y`）
- `service.delivers <ClientId>` 表現（Phase 3 / Issue #853）
- `resource <storageKind>` 構文（Phase 5 / Issue #855）
- `user → client → service` 強制レイアウト（Phase 6 / Issue #856）

## 関連

- 親 Issue: [#823](https://github.com/kompiro/karasu/issues/823)
- 本 Phase: [#854](https://github.com/kompiro/karasu/issues/854)
- 設計ドキュメント: `docs/adr/20260428-06-client-mcp-modeling.md`
