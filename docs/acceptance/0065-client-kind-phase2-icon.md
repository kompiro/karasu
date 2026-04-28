---
type: product
---

# AT-0065: `client` kind — Phase 2 builtin icon

## 概要

`client` kind に専用の builtin SVG icon を割り当て、icon mode で `service` などとは異なる絵柄で描画されることを確認する
（Issue [#851](https://github.com/kompiro/karasu/issues/851)、設計は `docs/adr/20260428-06-client-mcp-modeling.md` Phase 2 行）。

Phase 2 のスコープは「単一の汎用 client icon」。サブタイプタグごとの icon 差別化（`[mobile]` と `[desktop]` で違う絵）は MVP 後の段階的拡張。

## 前提条件

- Phase 1 (#849) が main にマージされている
- `examples/getting-started/` を新規プロジェクトで開ける状態

## 受け入れ条件

### 1. icon mode で `client` 専用の絵が表示される

1. アプリを起動する
2. 「Getting Started (日本語)」プロジェクトを開く
3. preview の表示モードを「Icon Mode」（◇ Icon Mode ボタン）に切り替える
4. `モバイルアプリ` ノードに **デバイス画面 + アプリグリッド** の絵柄（`packages/core/icons/client.svg`）が描画される
5. `service` ノード（ECommerce / Notification 等）の歯車絵柄、`user` ノード（Customer 等）の人物絵柄と明確に異なる
6. 警告パネルにエラーは出ていない

### 2. shape mode から icon mode への切り替えで一貫している

- shape mode では Phase 1 と同じ紫色のカード（`#6D28D9`）
- icon mode では client の SVG icon
- 切り替えても label / description などのテキスト情報は欠落しない

### 3. ユーザー定義スタイルが client icon を上書きできる

カスケード順序の確認。以下の `.krs.style` を当てると、client は box シェイプ（紫の四角）に戻る：

```krs.style
client { shape: box; }
```

> 重要：icon theme は cascade の最後に適用されるため、ユーザーが `shape: box;` などを書いても icon が優先される。  
> 逆に「ユーザーがあえて icon を外したい場合」は `client { shape: box; }` で上書きできる…のは原則 builtin theme のレイヤだが、現行 cascade では icon theme が最後で勝つため明示の URL 書きが必要（`client { shape: url("box-shape"); }` のような書き方は今は無いので、style.md の説明と併せて確認）。

このシナリオは将来 cascade 改修の議論材料として残しておくのみで、Phase 2 の合否には含めない。

## 自動化された検証

- `packages/core/src/index.test.ts` — `getIconThemeStyleSheet()` が `client` ノードに `{ url: "client" }` shape を割り当てる
- 既存の icon-mode 関連テスト群が引き続きすべて通過

## スコープ外（次フェーズ）

- サブタイプタグ別の icon 差別化（`[mobile]` `[web]` `[desktop]` `[cli]` `[device]` `[extension]` `[embed]`）
- `service.delivers` 表現（Phase 3 / Issue #853）
- `client.handles` クロスリファレンス（Phase 4 / Issue #854）
- `resource <storageKind>` 構文（Phase 5 / Issue #855）
- `user → client → service` 強制レイアウト（Phase 6 / Issue #856）

## 関連

- 親 Issue: [#823](https://github.com/kompiro/karasu/issues/823)
- 本 Phase: [#851](https://github.com/kompiro/karasu/issues/851)
- 設計ドキュメント: `docs/adr/20260428-06-client-mcp-modeling.md`
