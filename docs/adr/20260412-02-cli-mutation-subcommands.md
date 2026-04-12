# ADR-20260412-02: CLI 変更系サブコマンド — `karasu remove` / `append` / `insert`

- **日付**: 2026-04-12
- **ステータス**: 決定済み
- **関連**: Issue #469, Issue #470, Issue #471, [ADR-20260411-07](20260411-07-translate-apply-option.md)

## 背景

ADR-20260411-07 では `karasu apply` の設計を確定させ、`karasu remove` と `karasu append` は「別途検討する操作系コマンド」として先送りした。`applyKrsPatch`（`@karasu-tools/core`）はすでに `append` / `replace` / `remove` の 3 オペレーションを実装済みで、CLI から直接呼び出せる状態にあった。加えて、既存の `append` はトップレベル追記のみで、親ノードの子として挿入するニーズ（`karasu insert`）に対応するには新しい `insert-child` オペレーションが必要だった。

## 決定

3 つの変更系コマンドを追加する。`applyKrsPatch` のシグネチャは `apply` / `append` / `insert` すべてで共有し、`remove` のみ位置引数ベースとする。

### 1. `karasu remove <node-id> <krs-file>`（位置引数）

指定ノードを `<krs-file>` からインプレース削除。ファイル不在・ノード未検出のいずれも exit code 1。

**設計判断**: `remove` は「何を削除するか」が常に明確（node-id）で stdin から受け取るべき情報がない。位置引数のみのシンプルなインターフェースで十分。`apply` / `append` / `insert` との非対称は許容する。

### 2. `karasu append <krs-file>`（stdin）

```sh
echo 'service NewService {}' | karasu append arch.krs
```

stdin から `.krs` コードを読み込み、`<krs-file>` の末尾にトップレベルブロックとして追記する。ファイル不在時は新規作成。stdin が空なら stderr にエラー + exit code 1。

### 3. `karasu insert <parent-id> <krs-file>`（stdin）

```sh
echo 'service NewService {}' | karasu insert ECommerce arch.krs
```

stdin から `.krs` コードを読み込み、`<parent-id>` で指定したノードの子として挿入する。ファイル不在・parent 未検出は必ずエラー（`append` と異なり新規作成しない）。

### 4. `applyKrsPatch` に `insert-child` オペレーション追加

```ts
applyKrsPatch(source, "insert-child", parentNodeId, content)
```

**アルゴリズム**: 親ノードの `loc.end.offset`（閉じ `}` の位置 inclusive）へのスプライスで子ノードを挿入する。

- 閉じ `}` の直前行のホワイトスペースから親のインデント（`closingIndent`）を検出
- 子の indent は `closingIndent + "  "`
- content が複数行の場合、非空行の最小インデントを strip してから `childIndent` を付与
- 空ブロック `system Foo {}` の場合は改行を補完

具体例：

```
入力: system ECommerce { service OrderService {} }
コマンド: echo 'service PaymentService {}' | karasu insert ECommerce arch.krs

結果:
  system ECommerce {
    service OrderService {}
    service PaymentService {}
  }
```

### 5. `karasu apply` vs `karasu append` の違い

| | `karasu apply` | `karasu append` |
|---|---|---|
| 既存ノード（同 ID）がある場合 | replace | 末尾に追記（重複可能性あり） |
| 新規ノードの場合 | append | append |
| 用途 | `translate` 結果の反映（差分更新） | 手書きスニペットの追加 |

`append` は常に末尾追記のみを行う「シンプルな書き込みコマンド」として位置づける。既存ノードの ID 重複チェックは行わない（それは `apply` の責務）。

## 理由

- **stdin 一貫性**: `apply` / `append` / `insert` が stdin 経由で統一されており、pipe で合成できる。引数の数による挙動切替（案3）は直感的でない
- **`remove` の位置引数は許容**: `remove` は情報源が単純（node-id のみ）なため stdin 対称化は過剰。`apply` とは別系統として割り切る
- **`insert-child` オペレーションの追加**: 親ブロック全体を書き直して `apply` で replace する代替手段より、子ノードだけを pipe できる方がユーザーにとって自然
- **インデント計算の自動化**: ユーザーが content のインデントを意識する必要がなく、親ブロックのインデントレベルから自動計算される
- **append と insert を別コマンドに分離**: `append` はトップレベル追記のみと明確に定義し、子ノード挿入は `insert` として独立させることで意図と実装が一致する

## 却下した案

### 案1（`append`）: 位置引数のみ `karasu append '<krs-code>' <krs-file>`

シェルのエスケープが必要（引用符、`$`、改行が含まれると煩雑）。複数行ブロックは実用的でない（`$'\n'` や HEREDOC が必要）。他ツールからの出力を pipe で渡せない。

### 案3（`append`）: 位置引数 + stdin の両対応

引数の数による挙動切替が直感的でなく、`karasu append arch.krs` と `karasu append 'service Foo {}' arch.krs` で最後の引数の意味が変わるように見え混乱を招く。`apply` との一貫性が崩れる。

### 代替手段（`insert` 不要論）: 親ブロック全体を書き直して `apply` で replace

技術的には可能だが、ユーザーが親ブロックの現在の内容を把握した上でブロック全体を書き直す必要があり、煩雑。

## 実装コスト見積もり

| ファイル | 行数（追加） |
|---|---|
| `packages/core/src/patch/krs-patch.ts` — `insert-child` 追加 | ~35 |
| `packages/core/src/patch/krs-patch.test.ts` — `insert-child` テスト | ~50 |
| `packages/cli/src/insert.ts` | ~35 |
| `packages/cli/src/insert.test.ts` | ~70 |
| `packages/cli/src/insert.e2e.test.ts` | ~100 |
| `packages/cli/src/index.ts` — `insert` 登録 | ~18 |

**合計**: 約 310 行（`remove` の実装規模と同程度）
