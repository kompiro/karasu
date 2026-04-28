---
type: product
---

# AT-0067: `client` kind — Phase 7 (examples expansion)

## 概要

`client` MVP の機能（kind / `delivers` / `handles` / `resource`）を盛り込んだ examples が ProjectMode のシード内容として正しく登録され、アプリで開いたときに警告なく描画されることを確認する
（Issue [#857](https://github.com/kompiro/karasu/issues/857)、設計は [#823](https://github.com/kompiro/karasu/issues/823) / `docs/adr/20260428-06-client-mcp-modeling.md`）。

Phase 7 では既存の `getting-started`（Phase 1 で更新済）に加えて、以下の 2 つを追加する:

1. **`examples/client-mcp/`** — `client` + `delivers` + `handles`（再エクスポート）+ `resource` + `[external]` + MCP 風 service を盛った独立サンプル
2. **`examples/ec-platform/02.5-clients.krs`** — `02-users` と `03-domains` の間に挟むチュートリアルステップ

## 前提条件

- main または PR ブランチに本 Phase 7 の変更がマージされている
- ブラウザに既存のプロジェクトが OPFS に残っていない（初回シード経路を確認するため、シークレットウィンドウや OPFS の手動クリア後に検証する）

## 受け入れ条件

### 1. 初回起動時に新しいサンプルがシードされる

1. シークレットウィンドウまたは OPFS をクリアした状態でアプリを開く
2. プロジェクトセレクタに以下が並んでいる:
   - `getting-started`（ロケールにより日/英いずれか）
   - `01-system` 〜 `07-cross-system`（`02.5-clients` を含む）
   - `client-mcp`
3. それぞれを開いてエラーバナー / 警告パネルが空であることを確認する

### 2. `02.5-clients` がチュートリアルの順序として違和感なく並ぶ

1. プロジェクトセレクタで `02.5-clients` を選ぶ
2. system 図に `MobileApp [mobile]` / `WebApp [web]` の 2 ノードが描画される
3. それぞれのカード上に `📦 localStorage "preferences"` のような resource 行が並ぶ
4. `ECommerce` から各 client へ `delivers` のエッジ（dashed）が描画されている
5. `Customer` / `Admin` → `MobileApp`/`WebApp` → `ECommerce` の通信エッジが描画される
6. WarningPanel に `unresolved-handles` が出ていない

### 3. `client-mcp` が完全な MVP 機能セットを示す

1. プロジェクトセレクタで `client-mcp` を選ぶ
2. system 図に以下のノードがある:
   - users: `Customer [human]`, `PartnerAgent [ai]`
   - clients: `MobileApp [mobile]`, `ClaudeDesktop [desktop]`
   - services: `MobileBff`, `OrderService`, `OrderMcp [external]`
3. `MobileBff` から `MobileApp` への `delivers` エッジが描画される
4. `MobileApp` カードに 3 行（localStorage / indexedDB / keychain）、`ClaudeDesktop` カードに 2 行（opfs / file）の resource が表示される
5. `MobileApp.handles Order` / `ClaudeDesktop.handles Order` / `MobileBff.handles Order` / `OrderMcp.handles Order` が `unresolved-handles` 警告なしで通っている（経路: client → BFF/MCP → OrderService）
6. `OrderService` をドリルダウンすると `domain Order` の中に 3 つの usecase（PlaceOrder / CancelOrder / QueryOrder）と `OrderTable` resource が見える

### 4. `examples.ts` と `examples/` がずれていない

`pnpm build:cli`（または `pnpm typecheck`）の後、以下のスクリプトで両者の文字列が一致することを確認する。

```sh
node -e "
const fs = require('fs');
const ex = require('./packages/core/dist/index.cjs');
const expect = (label, file, content) => {
  const disk = fs.readFileSync(file, 'utf8');
  if (disk !== content) { console.error('MISMATCH:', label); process.exit(1); }
};
expect('client-mcp', 'examples/client-mcp/index.krs', ex.CLIENT_MCP_PROJECT.files[0].content);
expect('02.5-clients', 'examples/ec-platform/02.5-clients.krs', ex.EC_PLATFORM_PROJECTS[2].files[0].content);
console.log('ok');
"
```

実行結果が `ok` になり、終了コードが 0 になる。

## 自動化された検証

- `packages/app/src/hooks/useProjectInitialization.test.ts` — シード時に `EC_PLATFORM_PROJECTS.length + 1`（getting-started）+ 1（client-mcp）回 `pm.createProject` が呼ばれ、最後の呼び出しが `CLIENT_MCP_PROJECT` であること
- 既存の core パーサテスト（Phase 1〜5 で網羅済）— 新しい examples の構文要素は全て個別テストでカバー済

## スコープ外

- `getting-started` の更新（Phase 1 で完了済）
- 詳細な MCP / capability シナリオ（[#834](https://github.com/kompiro/karasu/issues/834) / [#837](https://github.com/kompiro/karasu/issues/837)）
- 強制レイアウト（`user → client → service` 三層配置）— [#856](https://github.com/kompiro/karasu/issues/856) Phase 6

## 関連

- 親 Issue: [#823](https://github.com/kompiro/karasu/issues/823)
- 本 Phase: [#857](https://github.com/kompiro/karasu/issues/857)
- 設計ドキュメント: `docs/adr/20260428-06-client-mcp-modeling.md`
