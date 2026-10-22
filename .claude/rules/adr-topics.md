---
paths:
  - "adr.config.json"
  - "tpl.config.json"
---

# topics を変えたら、同じ語彙の写しをすべて揃える

`topics` の語彙は `adr.config.json`・`tpl.config.json`・ADR と TPL の frontmatter・
`docs/adr/README.md`「トピック別」の見出し・repo の `topic: *` ラベルに写されている。

**到達状態**: topics の追加・改名・削除を終えたとき、次がすべて成り立っている。

1. `pnpm run lint:config-topics-sync` が通る（`tpl.config.json` と `adr.config.json` の `topics` が一致）
2. `pnpm adr:validate` と `pnpm tpl:validate` が通る（改名・削除した topic を frontmatter に持つ ADR / TPL が無い）
3. `docs/adr/README.md`「トピック別」に、追加・改名した topic の見出しがあり、削除した topic の見出しが無い
4. `topic:` ラベルが `topics` と 1 対 1 に対応し、次のコマンドが何も出力しない:

   ```bash
   diff <(jq -r '.topics[] | "topic: " + .' adr.config.json | sort) \
        <(gh label list --limit 300 --json name --jq '.[].name' | grep '^topic: ' | sort)
   ```

5. 改名・削除した topic の旧ラベルを持つ Issue が無い（`gh issue list --state all --label "topic: <old>"` が空）

4 と 5 はラベル操作なので、変更の種類で実行の時期が違う:

- **追加**: `gh label create "topic: <name>"` は PR のマージ前に実行してよい。付いている Issue が無いので、
  PR を取り下げたらラベルを消せば元に戻る
- **改名**: PR のマージ後に `gh label edit "topic: <old>" --name "topic: <new>"` を実行する。付いている
  Issue はそのまま新しい名前に移る。delete + create で代えると、付いていた Issue からラベルが外れる
- **削除**: PR のマージ後に、`gh issue list --state all --label "topic: <old>"` の Issue をそれぞれ別の
  topic へ付け替えてから `gh label delete "topic: <old>"` を実行する

マージ後に実行するラベル操作は、PR 本文にコマンドとして書いておく。
