---
"@karasu-tools/core": minor
"karasu": minor
---

Add the `entity` node kind — a conceptual domain entity declared as a `domain` child. An entity carries a name, relations to other entities (`->` / `-->`, one edge per association, origin = the reference-holding entity), and an optional `table <Infra>.<sub>` physical mapping — never attributes. New diagnostics: `entity-not-in-domain` (error) for misplacement and `entity-anchor-collision` (warning) for deep-link namespace clashes. The entity view, `resource` → entity resolution, and `translate --from db` scaffolding follow in later PRs (#1870).
