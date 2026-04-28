---
type: tool
---

# AT-0009: AT type フロントマターによる product/tool 分類

- **日付**: 2026-03-25
- **関連 Issue**: #51
- **対象**: `docs/acceptance/*.md`、`.claude/skills/qa/SKILL.md`、`.claude/skills/acceptance-test/SKILL.md`

## 概要

AT ファイルにフロントマター `type: product | tool` を追加し、`/qa` スキルが product の AT のみを対象にすること、`/acceptance-test` スキルが変更対象ファイルから type を推論することを検証する。

## 受け入れ条件

### AC-1: /qa スキルのフィルタリング

- [ ] `/qa` を実行し、生成されたチェックリストに `type: tool` の AT（例: AT-0007-qa-skill、AT-0008）が含まれないことを確認
- [ ] `type: product` の AT（例: AT-0006）の手動確認項目が含まれることを確認
- [ ] `type` フィールドなしの AT が存在する場合、product として扱われ含まれることを確認

> manual / visual review — Claude スキル経由の対話的フローで、生成チェックリストの中身を目視確認する必要があるため自動化対象外。

### AC-2: /acceptance-test スキルの type 推論

- [ ] `packages/` 配下のみ変更した場合、生成される AT に `type: product` が設定される
- [ ] `.claude/` 等 `packages/` 以外のみ変更した場合、`type: tool` が設定される
- [ ] 両方が含まれる場合、type をユーザーに確認するプロンプトが表示される

> manual / visual review — `/acceptance-test` スキルとの対話で type 推論を確認するため自動化対象外。
