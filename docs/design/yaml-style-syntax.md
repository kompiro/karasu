# YAML スタイル構文への移行検討

- **日付**: 2026-03-23
- **ステータス**: 取りやめ
- **関連**: [GitHub Issue #13](https://github.com/kompiro/karasu/issues/13), [GitHub Issue #7](https://github.com/kompiro/karasu/issues/7), [AST 再構成](ast-restructure.md), [.krs 構文リファレンス](../spec/syntax.md), [GitHub Issue #5](https://github.com/kompiro/karasu/issues/5)

## 背景・課題

### ブレース構文の問題

現在の `.krs` はブレースベース（`{ }`）でブロックを表現している。

```
system "ECプラットフォーム" {
  service ECommerce "ECサイト" {
    domain "受注" {
      usecase "注文を受け付ける" {
        resource "注文テーブル"
      }
    }
  }
}
```

ネストが深くなると以下の問題が顕在化する。

1. **閉じブレースの対応が困難** — 4〜5段のネストで `}` が連続し、どのブロックを閉じているか読みにくい
2. **description の表現力不足** — Issue #5 / AST 再構成で `"""` トリプルクォートによる複数行 Markdown を導入したが、YAML のパイプ記法（`|`）の方がより自然にマークダウンを記述できる
3. **冗長性** — プロパティ値の記述に `"` は必要だが、`{ }` のペアは構造をインデントで既に表現しているため冗長

### 現在の Lexer/Parser の状況

Issue #5 の AST 再構成は完了済み（PR #10 でマージ）。現在のパーサーは以下の構造。

- **Lexer**: `{` → `LeftBrace`, `}` → `RightBrace` を単純にトークン化
- **Parser**: 再帰下降。`parseBlockContentsWithProperties()` が `{ }` 内のプロパティ・子ノード・エッジを処理
- **プロパティ**: `description`, `team`, `role`, `link` は `{ }` 内のキーワードとして解析
- **deploy ブロック**: `runtime`, `realizes` 等も同様に `{ }` 内で解析

構文変更は Lexer 層での INDENT/DEDENT トークン生成と、Parser 層での `{ }` → INDENT/DEDENT 対応が中心となる。

## 制約・前提

- **`@import` は変更しない** — Issue #7 で明示
- **AST 型は最小限の変更** — Issue #5 で導入した discriminated union 構造はそのまま維持。`LinkEntry.label` の削除と `link` → `links` の改名のみ
- **エッジ宣言 (`->`, `-->`) は変更しない** — 構文上そのまま
- **プレリリース段階** — 後方互換を保つ必要はない
- **物理図 (`deploy`) も同様に移行対象** — ブレースで記述しているすべてのブロックが対象
- **`.krs.style` は対象外** — CSS ライクな構文であり、YAML 化の対象には含めない

## 検討した選択肢

### 案1: 完全移行（ブレース廃止）

`{ }` を全面的に廃止し、`:` + インデントのみにする。

```yaml
system "ECプラットフォーム":
  service ECommerce "ECサイト":
    description: |
      商品管理と注文処理を担うコアサービス。
    team: "EC開発チーム"

    domain "受注":
      usecase "注文を受け付ける":
        resource "注文テーブル"
```

**メリット:**
- 構文が一貫しており、学習コストが低い
- 閉じブレースのマッチングが不要になり可読性が向上
- YAML に慣れたユーザーにとって直感的

**デメリット:**
- Lexer に INDENT/DEDENT トークン生成のロジックが必要（Python 方式）
- インデントのミスがパースエラーに直結し、デバッグが難しい場合がある
- Monaco Editor のブラケットマッチング等の組み込み機能が使えなくなる

### 案2: ハイブリッド（ブレースとコロン共存）

`{ }` と `:` + インデントの両方を許容する。

```yaml
# コロン記法
system "ECプラットフォーム":
  service ECommerce "ECサイト":
    description: |
      商品管理と注文処理

# ブレース記法（従来通り）
deploy "本番環境" {
  oci "inventory-service" {
    image: "inventory:2.1.0"
    runtime: "Node.js 20"
  }
}
```

**メリット:**
- 段階的な移行が可能
- ユーザーが好みの記法を選択できる
- 短いブロック（deploy ノードのプロパティ列挙など）はブレースの方が読みやすいケースもある

**デメリット:**
- パーサーの複雑度が大幅に増加（2つの記法を同時にサポート）
- ファイル内に混在すると統一感が失われる
- リンターや formatter での正規化ルールが複雑になる

### 案3: プロパティのみコロン記法（ブロックはブレース維持）

ブロック構造は `{ }` を維持しつつ、プロパティの記述のみを `key: value` に変更する。

```
system "ECプラットフォーム" {
  service ECommerce "ECサイト" {
    description: |
      商品管理と注文処理を担うコアサービス。
    team: "EC開発チーム"

    domain "受注" {
      usecase "注文を受け付ける" {
        resource "注文テーブル"
      }
    }
  }
}
```

**メリット:**
- INDENT/DEDENT トークン生成が不要（最も実装コストが低い）
- ブロック構造の明確さを維持しつつ、プロパティの可読性が向上
- `description: |` で複数行 Markdown を自然に記述できる
- Monaco Editor の bracket matching がそのまま使える

**デメリット:**
- ネスト深度の問題（閉じブレース連続）は解消されない
- Issue #7 の目標である「YAML スタイル」とは中途半端に異なる

## 比較

| 観点 | 案1: 完全移行 | 案2: ハイブリッド | 案3: プロパティのみ |
|------|-------------|-----------------|------------------|
| ネスト可読性 | ◎ 大幅改善 | ○ 選択次第 | △ 変わらず |
| 複数行 description | ◎ パイプ記法 | ◎ パイプ記法 | ◎ パイプ記法 |
| パーサー実装コスト | △ INDENT/DEDENT 必要 | × 2記法サポート | ◎ 最小限 |
| 構文の一貫性 | ◎ 統一 | × 混在リスク | ○ ブレース統一 |
| エディタ支援 | △ インデント依存 | ○ 部分的 | ◎ bracket matching |
| 学習コスト | ○ YAML 既知なら低い | △ 2つの記法 | ◎ 既存知識で十分 |
| 将来の拡張性 | ○ | △ 複雑度蓄積 | ○ |

## Lexer 設計: INDENT/DEDENT トークン生成（案1・案2 の場合）

案1 または案2 を採用する場合、Python 方式の INDENT/DEDENT トークン生成が必要になる。

### アルゴリズム概要

```
indent_stack = [0]  // 初期インデント
indent_unit = 0     // 未検出

for each logical_line:
  spaces = count_leading_spaces(line)

  if spaces > indent_stack.top():
    if indent_unit == 0:
      indent_unit = spaces - indent_stack.top()  // 最初の INDENT で幅を検出
    else if (spaces - indent_stack.top()) != indent_unit:
      emit ERROR("inconsistent indentation")
    indent_stack.push(spaces)
    emit INDENT

  while spaces < indent_stack.top():
    indent_stack.pop()
    emit DEDENT

  // 行の残りをトークン化
```

### 考慮点

1. **インデント幅** — ファイル内一貫であれば任意。最初の INDENT で検出し、以降不一致はエラー
2. **空行の扱い** — 空行（空白のみの行）はインデント計算に含めない
3. **コメント行** — コメントのみの行もインデント計算から除外
4. **タブとスペースの混在** — 禁止する（エラーとする）
5. **ファイル末尾** — 残りの DEDENT を全て emit する
6. **パイプ記法内** — `description: |` の後のブロックは raw テキストとして扱い、INDENT/DEDENT を生成しない

### トークン列の例

```yaml
system "ECプラットフォーム":
  service ECommerce "ECサイト":
    description: "商品管理と注文処理"
  service Payment "決済サービス" [external]
```

↓ トークン列

```
System, StringLiteral("ECプラットフォーム"), Colon, NEWLINE,
  INDENT,
  Service, Identifier(ECommerce), StringLiteral("ECサイト"), Colon, NEWLINE,
    INDENT,
    Description, Colon, StringLiteral("商品管理と注文処理"), NEWLINE,
    DEDENT,
  Service, Identifier(Payment), StringLiteral("決済サービス"), LeftBracket, Identifier(external), RightBracket, NEWLINE,
  DEDENT,
EOF
```

### 新規トークン

| トークン | 説明 |
|---------|------|
| `Indent` | インデントレベルの増加 |
| `Dedent` | インデントレベルの減少 |
| `Newline` | 論理行の終端 |
| `Pipe` | `\|` — 複数行テキストの開始 |
| `Dash` | `-` — リストアイテムの開始 |

## プロパティ構文の変更

### 現行（スペース区切り）→ 提案（コロン区切り）

| プロパティ | 現行 | 提案 |
|-----------|------|------|
| description（単行） | `description "text"` | `description: "text"` |
| description（複数行） | `description """..."""` | `description: \|` + ブロック |
| team | `team "name"` | `team: "name"` |
| role | `role "name"` | `role: "name"` |
| link | `link "url" "label"` | `links:` + YAML リスト（ラベル廃止、複数可） |
| runtime | `runtime "value"` | `runtime: "value"` |
| realizes | `realizes Identifier` | `realizes: Identifier` |
| image | `image "value"` | `image: "value"` |
| schedule | `schedule "cron"` | `schedule: "cron"` |

`link` は `links` に改名し、YAML リスト記法で複数 URL を記述する。ラベルは廃止し、必要な場合は `description` 内に Markdown リンクで記述する。
パイプ記法（`|`）は `"""` トリプルクォートの代替となる。

### links のリスト記法

```yaml
service ECommerce "ECサイト":
  links:
    - "https://wiki.example.com/ec"
    - "https://figma.com/file/xxx"
```

- `links:` の後に INDENT + `- "url"` を並べる
- `-` は YAML のシーケンスアイテムと同じ記法
- リストが1件でもリスト記法を使う（一貫性のため）
- `links` が不要な場合は省略可

### パイプ記法の詳細

```yaml
description: |
  商品管理と注文処理を担うコアサービス。

  ## 責務
  - 商品カタログの管理
  - 注文ライフサイクルの管理
  - **決済サービス**との連携
```

- `|` の直後は改行が必須
- 後続行のインデントは `description:` の行より深い必要がある
- 最初の非空行のインデント位置を基準として、共通の先頭空白を除去
- 空行はブロック終了とみなさない（次のインデントが浅い行で終了）
- `"""` トリプルクォートは廃止する（パイプ記法に統一）

## Parser への影響

### 変更概要

| 現行 | 変更後 |
|------|--------|
| `expect(LeftBrace)` | `expect(Colon)` + `expect(Indent)` |
| `expect(RightBrace)` | `expect(Dedent)` |
| `parseBlockContentsWithProperties()` の終了条件 `RightBrace` | 終了条件 `Dedent` |
| プロパティの値取得 `advance()` | `expect(Colon)` + `advance()` |

再帰下降パーサーの構造自体は変わらない。ブロックの開始・終了トークンが変わるだけで、ネストの処理ロジックは同一。

### エラーリカバリ

INDENT/DEDENT ベースのパーサーでは、インデントのずれがエラーの原因になりやすい。以下の戦略を検討する。

1. **曖昧なインデントの警告** — 前の行と同レベルでも意味が変わるケースを検出して警告
2. **インデント修正の suggestion** — エラー時にインデントの期待値を diagnostic に含める
3. **レキサーレベルでの回復** — 不正なインデントは最も近い有効なレベルに補正して DEDENT を生成

## 移行計画

### フェーズ1: Lexer の INDENT/DEDENT 対応

1. Lexer に INDENT/DEDENT/NEWLINE トークン生成を実装
2. パイプ記法（`|`）による複数行テキストの Lexer 対応
3. `"""` トリプルクォートを廃止
4. `{ }` トークンの廃止（`.krs` ファイル内）

### フェーズ2: Parser の移行

1. Parser のブロック開始・終了をコロン + INDENT/DEDENT に変更
2. プロパティ解析時に `Colon` を期待するよう変更
3. `link` → `links` リスト記法に変更。`Dash` トークンの解析を追加
4. 全テストケースを新構文に書き換え

### フェーズ3: ドキュメント・UI の更新

1. 構文リファレンス (`docs/spec/syntax.md`) を更新
2. app 側のデフォルトテンプレート（`project-manager.ts` の `DEFAULT_KRS`）を新構文に更新
3. サンプルファイル・テストフィクスチャの書き換え

## 完全な構文例

```yaml
@import "default.krs.style"

system "ECプラットフォーム":
  user Customer "顧客" [human]:
    role: "商品を購入する一般ユーザー"
    links:
      - "https://example.com/persona/customer"

  user Admin "管理者" [human]:
    role: "システムを運用する担当者"

  service ECommerce "ECサイト":
    description: |
      商品管理と注文処理を担うコアサービス。

      ## 責務
      - 商品カタログの管理
      - 注文の受付と処理
      - [設計Wiki](https://wiki.example.com/ec)
    team: "EC開発チーム"
    links:
      - "https://wiki.example.com/ec"
      - "https://figma.com/file/xxx"

  service Payment "決済サービス" [external]

  Customer  -> ECommerce "商品を購入する"
  ECommerce -> Payment   "決済を処理する"

service ECommerce "ECサイト":
  domain "受注":
    description: "注文の受付からキャンセルまでの業務"
    links:
      - "https://miro.com/board/123"
      - "https://confluence.example.com/order-flow"

    usecase "注文を受け付ける":
      resource "注文テーブル" [table]
      resource "在庫API" [external, api]

    usecase "注文をキャンセルする"

deploy "本番環境":
  oci "inventory-service":
    image: "inventory:2.1.0"
    runtime: "Node.js 20"
    realizes: Inventory

  job "monthly-billing":
    schedule: "0 0 1 * *"
    runtime: "Java 21"
    realizes: Billing
```

## 方針: 案1（完全移行）を採用

以下の理由から案1を採用する。

- karasu はプレリリース段階であり、破壊的変更のコストが低い
- ネスト可読性の改善が Issue #7 の主要な動機であり、案3 ではこれを解決できない
- 案2 のハイブリッドはパーサー複雑度と構文の一貫性の両面でデメリットが大きい
- INDENT/DEDENT の実装は確立されたアルゴリズムであり、技術的リスクは限定的

## 決定事項

1. **インデント幅** — ファイル内一貫であれば任意。最初の INDENT で幅を検出し、以降一貫性をチェックする。不一致はエラーとする。
2. **コロンの要否** — ボディ（プロパティまたは子ノード）を持つ場合のみ `:` が必要。ボディなしの1行宣言では不要。
3. **`links` プロパティ** — `link` → `links` に改名。YAML リスト記法（`- "url"`）で複数指定可能。ラベルは廃止し、必要な場合は `description` 内に Markdown リンクで記述する。
4. **AST 型** — Lexer/Parser のみ変更する。現在の AST 型（`KrsNode`, `DeployNode` 等）はブレース/コロンに依存しない。ただし `LinkEntry` から `label` フィールドを削除し、`url: string` + `loc: SourceRange` のみとする。
5. **エディタ支援** — YAML の language configuration を参考に、Monaco の `onEnterRules` でインデント自動挿入を実装する。
6. **`.krs.style`** — CSS ライクな `{ }` 構文を維持。別の構文体系として問題なし。

## 取りやめの経緯

壁打ちの結果、以下の理由から YAML スタイルへの移行を断念した。

1. **エッジ宣言との根本的な非整合** — `Customer -> ECommerce "..."` はkarasuの中心的な記法だが、YAML の構造上に置き場がない。`edges:` ブロックに押し込むと可読性が大きく落ちる。

2. **「YAML ライクだが YAML ではない」問題** — `services:` コンテナを導入しても、エッジ宣言が混在する時点で YAML の規則を破る。ユーザーに混乱を生む。

3. **パイプ記法の実装コスト** — `description: |` はインデント検知が必要であり、「ブレース構文を維持しつつパイプ記法だけ追加する」案3は実装コスト最小という前提が崩れる。インデント検知をするなら全部やるか、やらないかの二択になる。

4. **現行ブレース構文で十分** — `description` の複数行は `"""` トリプルクォートで解決済み。ブレース構文を維持することが最もシンプルな判断。
