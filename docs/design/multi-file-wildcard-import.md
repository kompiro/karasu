# Multi-file System Composition via Wildcard Import

- **日付**: 2026-04-04
- **ステータス**: 完了
- **関連**: [ADR-0053](../adr/0053-project-and-filesystem.md), Issue #281

## 背景・課題

現在、複数ファイルにまたがるシステム定義を統合するには、インポート先のノードを一つずつ列挙する必要がある。

```krs
import { OrderService, ShippingDomain, InventoryService } from "team-ec.krs"
```

この形式では、チームが新しいサービスを追加するたびにエントリファイル側も変更しなければならない。
ファイル分割の本来の目的である「チームごとのコードオーナーシップ」を達成できない。

加えて、現在の単一パス解決では **ファイルの読み込み順に依存したエラー** が発生しうる。
たとえば `OrderService -> PaymentService` というエッジが `OrderService` のファイルに書かれていても、
`PaymentService` がまだロードされていなければ参照エラーになる。

## 制約・前提

- 既存の `import { X } from "file.krs"` 構文との後方互換性を保つ
- インポートグラフは DAG でなければならない（循環インポートは警告して無視）
- `ImportDeclaration.ids: string[]` は既に存在する型。`ids = []` をワイルドカードの意味に使う
- ファイルシステムアクセスは `FileSystemProvider` 経由（ブラウザ・Node.js 両対応）

## 検討した選択肢

### 案1: ワイルドカード構文 `import "file.krs"`

`{...} from` を省略した形でファイルパスのみを指定する。

```krs
import "team-ec.krs"
import "team-payment.krs"
```

**メリット**:
- 構文が短く意図が明確（「このファイルの全システムを取り込む」）
- `ids: []` を「ワイルドカード」として扱うことで AST 型変更が不要
- `{ }` がないことで named import との区別がパース時点で確定する

**デメリット**:
- `import` キーワードの後に `{` ではなく文字列リテラルが来ることを、パーサーが理解できるよう変更が必要

### 案2: 専用キーワード `include "file.krs"`

別キーワードを導入して意味を明確に分ける。

**メリット**: `import` と `include` の意味が名前で区別できる

**デメリット**:
- 新規キーワードの追加は字句解析・パーサー・ドキュメント全体への波及が大きい
- JavaScript/TypeScript 系の慣習では `import` で十分に意味を区別できる

→ **案1 を採用**。既存の型インフラを変更せず、字句解析も変更不要。

## 設計詳細

### 構文の拡張

2 種類のインポート形式が共存する。

| 形式 | 意味 |
|------|------|
| `import "file.krs"` | そのファイルの全ブロック（system / deploy / organization）をマージ（ワイルドカード） |
| `import { X } from "file.krs"` | 指定した名前のノードのみをマージ（既存動作） |

パーサーの `parseNodeImport()` の変更箇所:

```
import キーワードを消費
  ↓ 次のトークンが StringLiteral?
  ├─ Yes → ワイルドカード: { ids: [], path, loc } を返す
  └─ No  → 既存の named import ロジック（{ X, Y } from "path"）
```

### 同名システムのマージ

複数ファイルが同じ `system ECPlatform` を宣言した場合、`children` と `edges` をマージする。

```
# team-ec.krs
system ECPlatform {
  service OrderService { -> PaymentService }
}

# team-payment.krs
system ECPlatform {
  service PaymentService
}

# マージ結果
system ECPlatform
  service OrderService
  service PaymentService
  edge: OrderService -> PaymentService
```

**重複 ID の扱い**:
- 同一 system 内に同じ `id` を持つ子ノードが複数ファイルから来た場合 → **error** diagnostic
- エッジは `(from, to)` ペアで重複チェックし、重複は無視

### deploy / organization ブロックのマージ

ワイルドカードインポートでは `system` に加えて `deploy` と `organization` ブロックもマージする。

| ブロック種別 | マージ戦略 |
|------------|-----------|
| `system` | 同名 system は children + edges をマージ。重複 ID は error |
| `deploy` | 同名 deploy ブロックは nodes をマージ。重複 node ID は error |
| `organization` | 同名 organization ブロックは teams をマージ。重複 team ID は error |

これにより、たとえばインフラ担当チームが `deploy` ブロックを別ファイルで管理し、エントリファイルがワイルドカードで取り込むという構成が可能になる。

### Case B: system ブロック外のサービス

ワイルドカードインポートされたファイルにトップレベル（system 非所属）のサービスがある場合、
パース時ではなく **マージ時** に warning を出す。

```
"OrderService" is declared outside any system block — system membership is ambiguous
```

これにより、standalone スニペットとして使用されるファイルはパース時にエラーにならない。

### 2 パス解決

`ImportResolver` を 2 パス構成に変更する。

**Pass 1 — ファイルロード**
- エントリから再帰的に全ファイルを読み込み、`Map<filePath, KrsFile>` を構築
- 循環検出は `visitedKrs` Set で行う（既存と同様）
- パース diagnostics を収集

**Pass 2 — マージ**
- エントリファイルからインポートグラフをトップダウンに走査
- 各インポートをマージ（named / wildcard それぞれの処理）
- エッジ参照の検証は Pass 2 完了後に全マージ済みノードを対象に行う

```
resolve(entryPath)
  ├── Pass 1: loadFileMap(entryPath) → Map<filePath, KrsFile>
  ├── Pass 2: mergeFromEntry(fileMap, entryPath) → KrsFile
  └── resolveStyles(...) → StyleSheet[]
```

Pass 1 でファイルが全ロードされているため、ファイル読み込み順依存のエラーがなくなる。

## 比較

| 観点 | 現在（単一パス） | 変更後（2 パス） |
|------|----------------|----------------|
| ファイル読み込み順依存 | あり | なし |
| ワイルドカード import | 非対応 | 対応 |
| 同名 system マージ | なし | children + edges をマージ |
| 重複 ID 検出 | なし | マージ時に error |
| Case B 警告 | なし | マージ時に warning |

## 現時点の方針

- 案1（`import "file.krs"` 構文）を採用
- `ImportDeclaration.ids = []` でワイルドカードを表現（型変更なし）
- `ImportResolver` を 2 パス構成にリファクタリング
- 既存の named import 動作は変更しない

## 未解決の問い

### ディレクトリ単位の auto-load（#292 関連）

`import "teams/"` のようにディレクトリを指定して配下の全 `.krs` ファイルを一括インポートする案。

**メリット**:
- チームが新ファイルを追加するだけでエントリファイルの変更が不要
- 「ディレクトリ = チームの所有範囲」という直感的な構造が表現できる
- ファイル列挙の管理コストがゼロ

**デメリット**:
- ファイルシステムの glob/readdir が必要になり、`FileSystemProvider` インターフェースを拡張しなければならない
- 読み込み順序が OS やファイルシステムに依存するため、決定論的な結果を得るには明示的なソートが必要
- 意図しないファイル（`.draft.krs` など）が混入しやすい
- ブラウザ環境では `readdir` 相当の API がなく、Virtual FS 実装が複雑になる

**結論**:
- 現時点では `import "file.krs"` の単ファイル形式のみ実装する
- ディレクトリ auto-load は `FileSystemProvider` の拡張が必要な独立した機能として、別 Issue（#292 参照）で検討する

### `import * from "file.krs"` 構文への変更

JavaScript 風の `import * from "file.krs"` は今回は不採用。
`import "file.krs"` で意図が十分に伝わるため、構文の複雑化は不要と判断。
