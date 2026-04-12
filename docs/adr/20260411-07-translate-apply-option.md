# ADR-0075: `karasu apply` サブコマンド — stdin + `applyKrsPatch` を core に移動

- **日付**: 2026-04-11
- **ステータス**: 決定済み
- **関連**: Issue #464, Issue #447, [ADR-0030](20260409-02-cli-translate-command.md), [ADR-0076](20260412-02-cli-mutation-subcommands.md)

## 背景

`karasu translate` コマンドは docker-compose / k8s / OpenAPI / SQL DDL を `.krs` スキャフォールドに変換する。`-o <path>` で新規ファイル書き出しか、stdout 出力のみが可能で、既存の `.krs` ファイルに翻訳結果を反映する手段がなかった。

一方 #447 で実装した `applyKrsPatch`（`packages/app/src/utils/krs-patch.ts`）は Chat UI から AST ベースの `append` / `replace` / `remove` パッチを `.krs` ソースへ適用する関数で、CLI と重複することになる。

**やりたいこと**: インフラ構成が更新されたとき、translate の結果を既存の `.krs` ファイルに反映したい。既存ノードがあれば更新（replace）、なければ追記（append）する。

## 決定

### 1. `applyKrsPatch` を `@karasu-tools/core` に移動

```
packages/core/src/patch/krs-patch.ts   ← applyKrsPatch, PatchOperation, findNodeById, searchNode
```

`packages/core/src/index.ts` から export：

```ts
export { applyKrsPatch } from "./patch/krs-patch.js";
export type { PatchOperation } from "./patch/krs-patch.js";
```

`packages/app/src/utils/krs-patch.ts` は re-export バレルに差し替える：

```ts
export { applyKrsPatch } from "@karasu-tools/core";
```

app 側の既存テスト（`krs-patch.test.ts`）は import パスの変更なしに維持できる。

### 2. `karasu apply <krs-file>` 独立サブコマンド（案2）

```sh
karasu translate --from compose docker-compose.yml | karasu apply deploy.krs
```

stdin から `.krs` 形式のテキストを受け取り、`<krs-file>` にパッチを適用して書き戻す。

### 3. 動作フロー

```
stdin から translated .krs を読む
  ↓
Parser.parse(stdin) でトップレベルブロックの ID 一覧を取得
  ↓
対象ファイルを読む（存在しなければ空文字列）
  ↓
stdin の各ブロックに対して:
  - 同 ID のノードが対象ファイルに存在する → replace
  - 存在しない → append
  ↓
結果を <krs-file> に書き戻す
```

### 4. エッジケース

| 状況 | 挙動 |
|---|---|
| 対象ファイルが存在しない | 新規作成、stdin の内容をそのまま書き出す |
| stdin が空 | stderr にエラー `Error: stdin is empty — pipe translated .krs content to apply`、exit code 1 |

### 5. ノード ID の自動解決

stdin の `.krs` を parse してトップレベルブロックの ID を取り出し、対象ファイルに同 ID のノードがあるかを判定する。ユーザーが ID を指定する必要はない。`--replace <node-id>` のようなフラグは不要。

## 理由

- **`translate` の責務を壊さない**: `translate` は純粋な変換のまま（副作用なし）。`--apply` / `--overwrite` フラグを追加すると single-responsibility が崩れ `-o` との意味重複も生じる
- **Unix pipe の composability**: kubectl / kustomize など既存 CLI と同じ体験で、translate 以外のソース（手書き、別ツール）にも使える
- **`applyKrsPatch` を `core` に移動**: app / cli / lsp 等で同じロジックを共有でき、実装の重複を排除できる
- **ID 自動解決**: ユーザーが対象ノード ID を事前に知っている必要がなく、translate の出力に含まれる ID から自動判定できる
- **stdin 経由**: 引数の数による挙動切替は直感的でない。`apply` と `append` / `insert`（ADR-0076）の一貫したインターフェースになる

## 却下した案

### 案1: `translate --apply <file>` / `--overwrite` フラグ

`translate` が副作用（ファイル書き込み）を持ち single-responsibility が崩れる。`--apply` と `--overwrite` の組み合わせが直感的でなく、`-o` との意味重複が生じる。

### 案3: `apply --replace <node-id>` フラグ

対象ノード ID をユーザーが事前に知っている必要があり、stdin 内容から自動解決できるのでフラグは不要。

## スコープ外（別 ADR）

- `karasu remove <node-id> <krs-file>` → ADR-0076
- `karasu append <krs-file>`（stdin） → ADR-0076
- `karasu insert <parent-id> <krs-file>`（stdin） → ADR-0076
