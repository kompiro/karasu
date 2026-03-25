---
name: acceptance-test
description: >
  Create acceptance test records in docs/acceptance/.
  Trigger when the user says: "アクセプタンステスト", "受け入れテスト", "ATを作成",
  "acceptance test", "create AT", or similar phrases requesting acceptance test documentation.
---

# Acceptance Test Record Skill

実装予定の機能や変更に対するアクセプタンステスト記録を `docs/acceptance/` に作成する。

## 手順

1. `docs/acceptance/` 内の既存ファイルを確認し、次の連番を決定する（`NNNN-` 形式、ゼロ埋め4桁）
2. ユーザーに以下を確認する（明示されていない場合）：
   - 対象となる機能・変更の概要
   - 関連するADR（あれば）
   - 対象コード・モジュール
3. 対象の既存コード、仕様ドキュメント、ADRを読み、実装の詳細を把握する
4. 変更対象ファイルから `type` を推論する：
   - `packages/` 配下のファイルのみ変更 → `type: product`
   - `packages/` 以外（`.claude/`, `docs/` 等）のみ変更 → `type: tool`
   - 両方含む場合 → ユーザーに確認する
5. 受け入れ条件（AC）を具体的かつ検証可能な形で記述する
6. ファイルを作成し、ユーザーにレビューを依頼する

## ファイル形式

```markdown
---
type: product  # または tool
---

# AT-NNNN: タイトル

- **日付**: YYYY-MM-DD
- **関連ADR**: ADR-XXXX または なし
- **対象**: 対象モジュール・ファイルの説明

## 概要

変更の目的と背景を1〜2文で記述。

## 受け入れ条件

### AC-N: 条件グループ名

- [ ] 具体的かつ検証可能な条件
- [ ] 入力と期待出力が明確な条件
- [ ] エッジケースやエラーケースも含む

## 検証方法

（自動テストコマンド、手動確認手順など）
```

## 受け入れ条件の書き方ガイドライン

- **具体的**: 「正しく動作する」ではなく「`fn(input)` が `expected` を返す」のように書く
- **検証可能**: チェックボックスで完了を判断できる粒度にする
- **グループ化**: 関連する条件を AC-N 単位でまとめ、各グループに説明的な名前を付ける
- **網羅的**: 正常系・異常系・エッジケース・公開APIを漏れなくカバーする
- **独立的**: 各ACは他のACに依存せず、単独で検証できることが望ましい

## 命名規則

- ファイル名: `docs/acceptance/NNNN-kebab-case-title.md`
- 連番は既存ファイルの最大番号 + 1
- タイトルは機能・変更を端的に表す英語のkebab-case
