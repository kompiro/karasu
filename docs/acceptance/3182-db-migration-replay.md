---
type: product
---

# AT: `translate --from db` がマイグレーション履歴を順に再生する（#3182）

- **日付**: 2026-10-17
- **関連 Issue**: [#3182](https://github.com/kompiro/karasu/issues/3182)
- **対象ファイル**: `packages/core/src/translate/db.ts`（`parseTables`）

> `CREATE TABLE` だけを読んでいたため、ORM のマイグレーション履歴を渡すと、削除済みの表や作り直しの一時表まで出力していた。文を順に再生し、履歴の最後に残る表だけを出す。

## 受け入れ条件

### AC-1: 履歴の最後に残る表だけが出る

- [x] AT-A: drizzle の作り直し（`CREATE __new_x` → `DROP x` → `ALTER TABLE __new_x RENAME TO x`）と途中の `DROP TABLE` を含む履歴から、残る表 1 つだけが元の名前で出る

  > ✅ Automated — `packages/core/src/translate/db.test.ts` › `a migration history is replayed in order (#3182)` › `keeps only the tables a drizzle-style rebuild leaves behind`

- [x] AT-B: `DROP TABLE` は `IF EXISTS`、schema 付きの名前、引用符、カンマ区切りの複数名を消し、存在しない表を名指しても何も起きない。名前の照合は大文字小文字を区別しない

  > ✅ Automated — `packages/core/src/translate/db.test.ts` › `a migration history is replayed in order (#3182)` › `drops every table a DROP TABLE names, with IF EXISTS and a schema`
  >
  > ✅ Automated — `packages/core/src/translate/db.test.ts` › `a migration history is replayed in order (#3182)` › `matches names case-insensitively and ignores RENAME COLUMN`

- [x] AT-E: `-- …` と `/* … */` の中の文は再生しない。引用符の中のコメント記号はコメントとして扱わない

  > ✅ Automated — `packages/core/src/translate/db.test.ts` › `a migration history is replayed in order (#3182)` › `skips statements inside comments, but not comment markers inside quotes`

### AC-2: 改名と作り直しが関連を保つ

- [x] AT-C: `RENAME TO` または MySQL の `RENAME TABLE`（複数の組は左から順に）で改名した表を指していた FK は新しい名前を指し、表は元の位置に残る。大文字小文字だけの改名でも表は消えない

  > ✅ Automated — `packages/core/src/translate/db.test.ts` › `a migration history is replayed in order (#3182)` › `moves the foreign keys that pointed at a renamed table to its new name`
  >
  > ✅ Automated — `packages/core/src/translate/db.test.ts` › `a migration history is replayed in order (#3182)` › `follows MySQL's RENAME TABLE, pair by pair`
  >
  > ✅ Automated — `packages/core/src/translate/db.test.ts` › `a migration history is replayed in order (#3182)` › `keeps a table whose rename changes only the letter case`

- [x] AT-D: 作り直した表は前の定義を置き換えて新しい位置に出る。`IF NOT EXISTS` の `CREATE` は既存の表を残す

  > ✅ Automated — `packages/core/src/translate/db.test.ts` › `a migration history is replayed in order (#3182)` › `lets a recreated table replace the earlier one, at its new position`
  >
  > ✅ Automated — `packages/core/src/translate/db.test.ts` › `a migration history is replayed in order (#3182)` › `keeps the first table when a later CREATE says IF NOT EXISTS`

## 手動確認

N/A — 自動テストですべて覆っている
