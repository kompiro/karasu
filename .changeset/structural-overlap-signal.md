---
"@karasu-tools/core": minor
"karasu": minor
---

Report structural overlap — a node owned by one team living inside a node owned by another (#2637). No edge crosses that boundary, so the team-dependency join is blind to it, yet the two teams still have to agree on the enclosing structure. Both ends must declare `owns`: an inherited owner is by definition the enclosing team, so inheritance never reads as an overlap. `karasu team-dependencies` gives it its own markdown section and a `structural-overlap` row in csv, and the org tab's dependency graph counts it in the footer rather than staying silent about a fact it cannot draw. Slice C of #2597.
