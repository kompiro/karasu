---
"@karasu-tools/core": minor
"karasu": minor
---

system view の "Group by: team" グループ化を compare（diff）モードでも有効化した。`compileSystemDiff` が `groupBy` / `collapsedGroups` / `collapsedCategories` / `interactive` を受け取り、diff の after-slice を team 境界フレームで囲み、⊖ category 折り畳みコントロールも compare モードで機能するようになった（#1873, ADR-1858 の follow-up）。
