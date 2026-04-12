# CLI mutation subcommands: karasu append / karasu remove

- **日付**: 2026-04-12
- **ステータス**: 検討中
- **関連**:
  - [#469 feat(cli): add karasu apply command](https://github.com/kompiro/karasu/issues/469)
  - [#470 feat(cli): add karasu remove command](https://github.com/kompiro/karasu/issues/470)
  - [#471 feat(cli): add karasu append command](https://github.com/kompiro/karasu/issues/471)
  - [#491 feat(cli): add karasu remove command (PR)](https://github.com/kompiro/karasu/pull/491)
  - [translate-apply-option.md](./translate-apply-option.md) — `karasu apply` の設計。`remove` / `append` は別 Issue に分離
  - [structural-krs-patch.md](./structural-krs-patch.md) — `applyKrsPatch` の設計と各オペレーションの仕様

## 背景・課題

`translate-apply-option.md` では `karasu apply` の設計を確定させ、
`karasu remove` と `karasu append` を「別 Issue で検討する操作系コマンド」として先送りした。

`applyKrsPatch`（`@karasu-tools/core`）はすでに `append` / `replace` / `remove` の 3 オペレーションを実装済みで、
CLI から直接呼び出せる状態にある。

本ドキュメントでは、先送りされた 2 つのコマンドの **インターフェース設計**と **既存コマンドとの一貫性** を検討する。

## 制約・前提

- `applyKrsPatch` は `@karasu-tools/core` からインポートして使う（実装の重複なし）
- `karasu apply` は stdin のみを受け付ける（引数なし）
- `karasu remove` は `<node-id> <krs-file>` の位置引数のみ（stdin 不要）
- `.krs` スニペットは複数行になることが多いが、1 行で書けるケースも多い
- Unix pipe との composability を保つ

## karasu remove の設計（実装済み: #491）

```sh
karasu remove <node-id> <krs-file>
```

- `<node-id>` で指定したノードを `<krs-file>` からインプレース削除
- ファイルが存在しない場合は code 1 で終了
- 指定ノードが見つからない場合は code 1 で終了

**設計上の判断:**
`remove` は「何を削除するか」が常に明確（node-id）で、stdin から受け取るべき情報がない。
位置引数のみのシンプルなインターフェースで十分。`apply` / `append` との非対称は許容する。

## karasu append のインターフェース設計

### 案1: 位置引数のみ

```sh
karasu append '<krs-code>' <krs-file>
```

**メリット:**
- シェルで完結する（pipe 不要）
- 短いスニペットをインラインで渡せる

**デメリット:**
- シェルのエスケープが必要（引用符、`$`、改行が含まれると煩雑）
- 複数行のブロックは実用的でない（`$'\n'` や HEREDOC が必要）
- 他ツールからの出力を pipe で渡せない

**結論:** 採用しない。実用上の制約が大きい。

---

### 案2: stdin のみ（`karasu apply` と完全に対称）

```sh
echo 'service Foo {}' | karasu append arch.krs
```

**メリット:**
- `karasu apply` と完全に一貫したインターフェース（stdin → ファイル）
- 複数行スニペットも自然に扱える
- 他ツールの出力を pipe で渡せる（composable）

**デメリット:**
- 1 行スニペットでも `echo '...' |` が必要で冗長に感じる場面がある

**結論:** 採用する。`apply` との一貫性と composability を優先する。

---

### 案3: 位置引数 + stdin の両対応

```sh
karasu append 'service Foo {}' arch.krs   # 位置引数
echo 'service Foo {}' | karasu append arch.krs   # stdin
```

コマンドの第 1 引数がコードならそれを使い、引数が 1 つ（ファイルのみ）なら stdin を読む。

**メリット:**
- 両方のユースケースに対応できる

**デメリット:**
- 引数の数による挙動の切り替えは直感的でない
- `karasu append arch.krs` と `karasu append 'service Foo {}' arch.krs` では
  最後の引数の意味（ファイル vs コード）が変わるように見え、混乱を招く
- テスト・ドキュメントの複雑さが増す
- `apply` との一貫性が崩れる（`apply` は引数なし＝stdin のみ）

**結論:** 採用しない。`apply` との一貫性を壊してまで対応する価値がない。

## 比較

| | 案1（位置引数のみ） | 案2（stdin のみ） | 案3（両対応） |
|---|---|---|---|
| `karasu apply` との一貫性 | 低 | 高 | 中 |
| 短いスニペットの利便性 | 高 | 中（`echo '...' \|`） | 高 |
| 複数行スニペットの扱い | 難 | 容易 | 容易 |
| composability | 低 | 高 | 高 |
| インターフェースの明確さ | 高 | 高 | 低 |
| 実装・テストの複雑さ | 低 | 低 | 中 |

## karasu append のスコープ: トップレベル追記 vs 子ノード挿入

`karasu append` のユースケースとして「既存の `system` ブロックの子として `service` を追加したい」
というケースが考えられる。

```sh
# やりたいこと（例）
echo 'service NewService {}' | karasu append --parent ECommerce arch.krs
# 期待する結果: system ECommerce { ... service NewService {} } に挿入される
```

### 子ノード挿入を `karasu append` に含めない理由

**制約1: `applyKrsPatch("append")` はトップレベル追記のみ**

現在の `applyKrsPatch` の `append` オペレーションは文字列末尾への単純な結合で実装されており、
親ノードを指定した挿入は対応していない（`structural-krs-patch.md` でも `insert-child` は
実装コストを理由に先送りされた）。

**制約2: 子ノード挿入には新しい `applyKrsPatch` オペレーションが必要**

親ノードの `loc.end.offset`（閉じ `}` の直前）に挿入するロジックが必要で、
現在の `append` / `replace` / `remove` の 3 オペレーションでは表現できない。

**代替手段: `karasu apply` で replace として扱う**

親ブロック全体を書き直して `karasu apply` に渡すことで、子ノードの追加を表現できる:

```sh
# system ECommerce に service NewService を追加する場合
echo 'system ECommerce {
  service OrderService {}
  service NewService {}
}' | karasu apply arch.krs
# → 既存の system ECommerce ブロックが上記の内容で replace される
```

この方法の制限: ユーザーが親ブロックの現在の内容を把握した上でブロック全体を書き直す必要がある。

**採用する方針: `karasu insert <parent-id> <krs-file>` を別コマンドとして実装する**

`karasu append` はトップレベル追記のみと明確に定義し、
子ノード挿入は `karasu insert` として独立させる。
本 Issue (#471) のスコープに含め、同時に実装する。

---

## 現時点の方針

### 採用する設計（案2: stdin のみ）

```sh
karasu append <krs-file>
```

stdin から `.krs` コードを読み込み、`<krs-file>` の末尾にトップレベルブロックとして追記する。
ファイルが存在しない場合は新規作成する。

**使用例:**

```sh
# 手書きスニペットをパイプで渡す
echo 'service NewService { label: "新サービス" }' | karasu append arch.krs

# HEREDOC で複数行スニペットを渡す
cat <<'EOF' | karasu append arch.krs
service NewService {
  label: "新サービス"
  usecase Foo {}
}
EOF

# translate との組み合わせ（apply と対称的に使える）
karasu translate --from openapi api.yaml --service FooService | karasu append arch.krs
```

**`karasu apply` との違い:**

| | `karasu apply` | `karasu append` |
|---|---|---|
| 既存ノード（同 ID）がある場合 | replace（更新） | 末尾に追記（重複可能性あり） |
| 新規ノードの場合 | append（追記） | append（追記） |
| 用途 | `translate` 結果の反映（差分更新） | 手書きスニペットの追加 |

`append` は常に末尾追記のみを行う「シンプルな書き込みコマンド」として位置づける。
既存ノードの ID 重複チェックは行わない（それは `apply` の責務）。

### エラー処理

| 状況 | 挙動 |
|---|---|
| stdin が空 | stderr にエラーメッセージ、code 1 で終了 |
| `<krs-file>` が存在しない | 新規作成して書き込む |

## karasu insert の設計

### インターフェース

```sh
echo 'service NewService {}' | karasu insert <parent-id> <krs-file>
```

stdin から `.krs` コードを読み込み、`<parent-id>` で指定したノードの子として挿入する。

```sh
# 使用例: system ECommerce の子として service を追加
echo 'service NewService { label: "新サービス" }' | karasu insert ECommerce arch.krs

# HEREDOC で複数行スニペット
cat <<'EOF' | karasu insert ECommerce arch.krs
service NewService {
  usecase Foo {}
}
EOF
```

`karasu append` / `karasu apply` との一貫性を保ち、stdin 経由のみとする。

### `applyKrsPatch` への `insert-child` オペレーション追加

**シグネチャ:**

```ts
applyKrsPatch(source, "insert-child", parentNodeId, content)
```

**アルゴリズム:**

`loc.end.offset` が親ノードの閉じ `}` の位置（inclusive）を指すため、
そこへのスプライスで子ノードを挿入できる。

```
source: "system ECommerce {\n  service OrderService {}\n}"
                                                         ↑ loc.end.offset (= index of `}`)

beforeClose = source.slice(0, loc.end.offset)
            = "system ECommerce {\n  service OrderService {}\n"
afterClose  = source.slice(loc.end.offset)
            = "}"
```

**インデント計算:**

閉じ `}` の直前にある行の先頭ホワイトスペース（= 親ブロックの indent level）を基に、
子の indent を `closingIndent + "  "` として決定する。

```ts
const lastNewline = beforeClose.lastIndexOf('\n');
const lineAfterLastNewline = lastNewline >= 0 ? beforeClose.slice(lastNewline + 1) : '';
const closingIndent = lineAfterLastNewline.match(/^(\s*)/)?.[1] ?? '';
const childIndent = closingIndent + '  ';
```

**content への indent 適用:**

content が複数行の場合、相対インデントを保持したまま `childIndent` を付与する。

```ts
// 1. 非空行の最小インデントを求める（content 自体のインデントを正規化）
const nonEmptyLines = content.split('\n').filter(l => l.trim());
const minIndent = nonEmptyLines.reduce((min, line) => {
  const indent = line.match(/^(\s*)/)?.[1] ?? '';
  return indent.length < min.length ? indent : min;
}, nonEmptyLines[0]?.match(/^(\s*)/)?.[1] ?? '');

// 2. 各行: minIndent を strip して childIndent を付与
const indentedContent = content
  .split('\n')
  .map(line => line.trim() ? childIndent + line.slice(minIndent.length) : '')
  .join('\n');
```

**スプライス:**

```ts
// 空ブロック `system Foo {}` は beforeClose が \n で終わらないため調整
const needsNewline = !beforeClose.endsWith('\n');
return {
  ok: true,
  source: beforeClose
    + (needsNewline ? '\n' : '')
    + indentedContent
    + '\n'
    + closingIndent
    + afterClose,
};
```

**具体例:**

```
入力ファイル:
  system ECommerce {
    service OrderService {}
  }

コマンド:
  echo 'service PaymentService {}' | karasu insert ECommerce arch.krs

結果:
  system ECommerce {
    service OrderService {}
    service PaymentService {}
  }
```

```
空ブロックへの挿入:
  system ECommerce {}

結果:
  system ECommerce {
    service PaymentService {}
  }
```

```
多段ネストへの挿入:
  system ECommerce {
    system SubSystem {
      service Existing {}
    }
  }

  echo 'service New {}' | karasu insert SubSystem arch.krs

結果:
  system ECommerce {
    system SubSystem {
      service Existing {}
      service New {}
    }
  }
```

**エラー処理:**

| 状況 | 挙動 |
|---|---|
| `<parent-id>` が見つからない | stderr にエラー、code 1 |
| stdin が空 | stderr にエラー、code 1 |
| ファイルが存在しない | stderr にエラー、code 1（`append` と異なり新規作成しない） |

`append` はファイル不在時に新規作成するが、`insert` は親ノードを探す必要があるため、
ファイルが存在しない場合は必ずエラーとする。

### 実装コスト見積もり

| ファイル | 変更内容 | 行数（追加） |
|---|---|---|
| `packages/core/src/patch/krs-patch.ts` | `insert-child` ケース追加（アルゴリズム本体） | ~35 行 |
| `packages/core/src/patch/krs-patch.test.ts` | `insert-child` テスト | ~50 行 |
| `packages/cli/src/insert.ts` | `insert()` 関数（stdin + file I/O） | ~35 行 |
| `packages/cli/src/insert.test.ts` | ユニット・統合テスト | ~70 行 |
| `packages/cli/src/insert.e2e.test.ts` | E2E テスト（ネスト・空ブロック等） | ~100 行 |
| `packages/cli/src/index.ts` | `karasu insert` コマンド登録 | ~18 行 |

**合計: 約 310 行** — `karasu remove` の実装規模（約 420 行）と同程度。

`insert-child` のコア実装は `remove` の ~7 行（before/after スプライス + ホワイトスペース除去）に対し
インデント計算が加わる分やや複雑だが、~35 行で収まる見込み。

## 未解決の問い

（なし）
