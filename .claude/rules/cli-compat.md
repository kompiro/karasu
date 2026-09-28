---
paths:
  - "packages/cli/src/index.ts"
  - "packages/cli/src/deprecations.ts"
  - "packages/cli/src/agent-surface.json"
---

# CLI の後方互換ルール

**到達状態**: `packages/cli/src/agent-surface.json` に載っているコマンドとフラグは、
今も登録されているか、`packages/cli/src/deprecations.ts` の `DEPRECATIONS` に
項目がある。`pnpm --filter karasu test -- compat` が通れば成り立っている。

利用者の手元の skill は自動更新されず、古い名前で CLI を呼び続ける（#2961）。
そのため、コマンドやフラグの名前を変える・消す変更では、既定の「古いものを
置き換える」編集より本ルールを優先し、**古い名前を `DEPRECATIONS` に 1 行足して
別名として残す**。

- 項目: `kind`（`command` / `flag`）、`name`（古い名前）、`command`（flag のとき）、
  `replacement`、`since`（この変更が入る CLI の版）、`removal`（次の major。0.x の間は
  `1.0.0`）。
- 別名は `--help` に出ず、呼ぶと固定形式の 1 行を stderr に出して代わりを実行する。
  代わりに機械的に読み替えられない変更（引数の意味が変わる等）は、古いコマンドを
  そのまま残し、改めて設計する。
- 別名を消すのは major のリリースだけ。消した項目は `removed: true` にして表に残す
  （墓標）。項目を表から消さない。
- 新しいコマンドやフラグを足したら `agent-surface.json` にも足す。足した名前は
  互換の約束に入る。
- `.claude/skills/**` の記述は新しい名前に書き換える（`pnpm lint:skill-cli-refs` が
  古い名前を落とす）。

方針の全体は `docs/release.md`「CLI の後方互換」。
