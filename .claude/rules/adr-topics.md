---
paths:
  - "adr.config.json"
---

# ADR topics と `topic:` ラベルを揃える

**到達状態**: `adr.config.json` の `topics` と、repo の `topic: *` ラベルが 1 対 1 に
対応している。次のコマンドが何も出力しない。

```sh
diff <(jq -r '.topics[] | "topic: " + .' adr.config.json | sort) \
     <(gh label list --limit 300 --json name --jq '.[].name' | grep '^topic: ' | sort)
```

`topics` を増やしたら同じ PR で `gh label create "topic: <name>"` を、消したら
`gh label delete "topic: <name>"`、名前を変えたら `gh label edit "topic: <old>" --name "topic: <new>"`
を実行する（rename は付いている Issue を保つので、delete + create より優先する）。
ラベルは PR のマージを待たずに作ってよいが、PR 本文に実行したコマンドを書いて残す。

背景: Issue は ADR と同じ語彙で `topic:` ラベルを付けて分類する（`docs/process.md`
「Issue トピックラベル」）。食い違いの機械的な検出は
[#3314](https://github.com/kompiro/karasu/issues/3314) で検討中。
