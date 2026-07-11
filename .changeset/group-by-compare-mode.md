---
"@karasu-tools/core": minor
"karasu": minor
---

system view の "Group by: team" グループ化を compare（diff）モードでも有効化した。`compileSystemDiff` が `groupBy` / `collapsedGroups` / `interactive` を受け取り、diff の after-slice を team 境界フレームで囲めるようになった（#1873, ADR-20260711-03 の follow-up）。
