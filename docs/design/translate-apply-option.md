# karasu apply: translate 結果を既存 .krs ファイルへ適用する

- **日付**: 2026-04-11
- **ステータス**: 検討中
- **関連**:
  - [#464 feat(core/cli): extract applyKrsPatch to core and add --apply option to translate command](https://github.com/kompiro/karasu/issues/464)
  - [#447 structural krs editing via Chat](https://github.com/kompiro/karasu/issues/447)
  - [structural-krs-patch.md](./structural-krs-patch.md) — `applyKrsPatch` の設計と `append` / `replace` / `remove` の仕様
  - [ADR-0030](../adr/0030-cli-translate-command.md) — translate コマンドの設計

## 背景・課題

`karasu translate` コマンドは docker-compose / k8s / OpenAPI / SQL DDL を `.krs` スキャフォールドに変換する。
現状は `-o <path>` で新規ファイルへの書き出しか、stdout 出力のみが可能。

一方、#447 で実装した `applyKrsPatch`（`packages/app/src/utils/krs-patch.ts`）は
Chat UI から AST ベースの `append` / `replace` / `remove` パッチを `.krs` ソースへ適用する関数で、
CLI との間で同じロジックが重複することになる。

**やりたいこと:**

インフラ構成が更新されたとき、translate の結果を既存の `.krs` ファイルに反映したい。
既存ノードがあれば更新（replace）、なければ追記（append）する。

```sh
# translate 結果を stdout に出しつつ、pipe で apply に渡す
karasu translate --from compose docker-compose.yml | karasu apply deploy.krs

# 既存ノードがあれば replace、なければ append される
# translate -o はそのまま新規書き出し用として維持
karasu translate --from compose docker-compose.yml -o deploy.krs
```

Unix の composability を活かし、`translate` は副作用なし（純粋変換）のまま保ち、
`apply` サブコマンドが既存ファイルへの書き込みを担う。

## 制約・前提

- `applyKrsPatch` のロジックは app / cli / lsp 等で共有したい → `@karasu-tools/core` へ移動が必要
- `translate` が生成するのは常に**トップレベルブロック**（`deploy { }`, `service { }`, `database { }` など）
- `karasu apply` は stdin から .krs を読み込み、対象ファイルへパッチを適用する
- `translate -o` は既存動作のまま維持する
- `karasu remove` / `karasu append` などの操作系コマンドは別 Issue で検討する

## 検討した選択肢

### 案1: translate に `--apply` / `--overwrite` フラグを追加する

```sh
karasu translate --from compose docker-compose.yml --apply deploy.krs
karasu translate --from compose docker-compose.yml --apply deploy.krs --overwrite
```

**デメリット:**
- `translate` が副作用（ファイル書き込み）を持つようになり、単一責務が崩れる
- `--apply` と `--overwrite` の組み合わせが直感的でない（`--overwrite` が `--apply` に依存する）
- `-o` との意味的な重複・混乱が生じる

**結論:** 採用しない。

---

### 案2: `karasu apply` を独立したサブコマンドにする（**採用**）

```sh
karasu translate --from compose docker-compose.yml | karasu apply deploy.krs
```

**メリット:**
- `translate` は純粋な変換のまま（副作用なし）
- Unix pipe で composable — translate 以外のソースにも使える
- kubectl / kustomize などの既存 CLI と同じ体験
- `apply` の責務が明確（stdin から .krs を受け取り、ファイルへ適用）

**デメリット:**
- 2コマンドの組み合わせが必要（単体では完結しない）

**結論:** 採用する。

---

### 案3: `apply` に `--replace <node-id>` フラグを追加する

```sh
karasu translate --from compose docker-compose.yml | karasu apply deploy.krs --replace DeployFoo
```

**デメリット:**
- 対象ノード ID をユーザーが事前に知っている必要がある
- translate の出力に含まれる ID から自動判定できるのでフラグは不要

**結論:** 採用しない。ID は stdin の内容から自動解決する。

## 比較

| | 案1 (translate に追加) | 案2 (apply サブコマンド) | 案3 (--replace フラグ) |
|---|---|---|---|
| translate の責務 | 崩れる（副作用あり） | 維持される | 維持される |
| composability | 低 | 高 | 中 |
| ユーザーの認知コスト | 低（1コマンド） | 中（pipe） | 高（ID指定） |
| 拡張性 | 低 | 高（apply 単体でも使える） | 低 |

## 現時点の方針

### applyKrsPatch の移動先

**`packages/core/src/patch/krs-patch.ts`** に移動する。

```
packages/core/src/
└── patch/
    └── krs-patch.ts   ← applyKrsPatch, PatchOperation, findNodeById, searchNode
```

`packages/core/src/index.ts` から追加 export する:

```ts
export { applyKrsPatch } from "./patch/krs-patch.js";
export type { PatchOperation } from "./patch/krs-patch.js";
```

`packages/app/src/utils/krs-patch.ts` は re-export バレルに差し替える:

```ts
// packages/app/src/utils/krs-patch.ts
export { applyKrsPatch } from "@karasu-tools/core";
export type { PatchOperation } from "@karasu-tools/core";
```

app 側の既存テスト (`krs-patch.test.ts`) は import パスの変更なしに維持できる。

---

### `karasu apply` サブコマンドの設計

```sh
karasu apply <krs-file>
```

stdin から `.krs` 形式のテキストを受け取り、`<krs-file>` にパッチを適用して書き戻す。

**動作フロー:**

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

**ノード ID の自動解決:**

stdin の .krs を parse してトップレベルブロックの ID を取り出し、
対象ファイルに同 ID のノードがあるかを判定する。
ユーザーが ID を指定する必要はない。

**ファイルが存在しない場合:**

対象ファイルが存在しない場合は新規作成し、stdin の内容をそのまま書き出す。

**stdin が空の場合:**

エラーメッセージを stderr に出力して終了コード 1 で終了する。

```
Error: stdin is empty — pipe translated .krs content to apply
```

---

### スコープ外（別 Issue で検討）

以下の操作系コマンドは本 Issue のスコープ外とし、別途設計・実装する:

| コマンド | 概要 |
|---|---|
| `karasu remove <node-id> <krs-file>` | 指定ノードを削除 |
| `karasu append <karasu_code> <krs-file>` | 指定コードを末尾に追記 |

---

### テスト方針

| テスト種別 | 対象 | 内容 |
|---|---|---|
| 単体テスト (core) | `applyKrsPatch` | 既存の `krs-patch.test.ts` を core パッケージに移動 |
| 単体テスト (app) | re-export バレル | 移動後も app からのインポートが機能することを確認 |
| E2E テスト (cli) | `karasu apply` | replace / append / 新規作成 / stdin 空エラー |

### アクセプタンステスト

- `applyKrsPatch` が `@karasu-tools/core` から import できる
- 既存の app 側テスト（`krs-patch.test.ts`）がすべて pass する
- `karasu translate --from compose docker-compose.yml | karasu apply deploy.krs` で既存ノードが replace される
- 対象ファイルにノードが存在しない場合は append される
- 対象ファイルが存在しない場合は新規作成される
- stdin が空のとき stderr にエラーが出て終了コード 1 になる
- `translate -o` の既存動作が変わらない

## 未解決の問い

（なし）
