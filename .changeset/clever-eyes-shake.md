---
"@karasu-tools/core": patch
"karasu": patch
"karasu-vscode": patch
---

A `client` owned by a team now shows the `👥` owner chip on its system-view card and the team row in the detail panel, and a `client` a deploy unit `realizes` now gets the deploy-view jump button — both were silently dropped even though `owns` / `realizes` resolved (Issue #2157, following ADR-1720). The chip and the detail panel now show the team's declared `label` (falling back to its id), matching how `Group by: team` frames title themselves; navigation still resolves by team id.
