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
4. `topic:` ラベルが `topics` と 1 対 1 に対応し、`pnpm run lint:config-topics-sync:labels` が通る。
   topics を変える PR では、同じチェックが required check の `Validate` で走り、ずれていれば落ちる
5. 改名・削除した topic の旧ラベルを持つ Issue が無い（`gh issue list --state all --limit 1000 --label "topic: <old>"` が空。
   `--limit` を省くと 30 件までしか返らない）

ラベル操作（4 と 5）は、**topics の変更を push する前に行う**（削除だけは下の例外）。`Validate` が config と
ラベルを突き合わせるので、ラベルが追いついていない PR は通らない。ラベルを操作しても `Validate` は再実行されないので、
push の後に操作したら `gh run rerun --failed <run-id>` で再実行する。

- **追加**: `gh label create "topic: <name>"`。PR を取り下げたらラベルを消す
- **改名**: `gh label edit "topic: <old>" --name "topic: <new>"`。付いている Issue はそのまま新しい名前に移る。
  delete + create で代えると、付いていた Issue からラベルが外れる。PR を取り下げたら名前を戻す
- **削除**: 消したラベルは戻せないので、レビューで削除に合意するまでは行わない。それまで PR の `Validate` は赤い。
  合意したら、`gh issue list --state all --limit 1000 --label "topic: <old>"` の Issue をそれぞれ別の topic へ付け替え、
  同じコマンドが空を返すことを確かめてから `gh label delete "topic: <old>"` を実行し、`Validate` を再実行する

改名・削除では、マージまでのあいだラベルが main の `topics` より先に進む。その間は、照合が走る別の PR
（`adr.config.json`・`tpl.config.json`・`scripts/lint/config-topics-sync.ts` を変える PR）も `Validate` で落ちるので、
そうした PR は 1 本ずつ通す。仕組みと却下した案は [#3314](https://github.com/kompiro/karasu/issues/3314)。
