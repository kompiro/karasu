---
"@karasu-tools/core": minor
"karasu": minor
---

`.krs.style` can now set a team frame's colour in the system view under *Group by: team*. A team is one entity with two renderings — the card in the org tree view and the frame here — so `team`, `#<TeamId>` and the new `team#<TeamId>` compound address both, each property landing on the part of the frame that answers to the part of the card it paints. Teams no sheet names keep the muted dashed frame: the built-in sheet's `team { … }` styles the card only. Also fixes `karasu fmt` re-emitting `boundary#<id>` as the wider bare `boundary`. See #2269 / ADR-2269.
