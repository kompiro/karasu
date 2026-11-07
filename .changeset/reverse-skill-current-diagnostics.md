---
"karasu-skills": patch
---

The `reverse-architecture` skill now describes current CLI behaviour (#3640). `karasu fmt` keeps `@draft(confidence: ...)`, a bare cross-domain entity relation warns `edge-endpoint-not-at-scope` instead of being silent, and `service` vs `domain` id collisions warn. The checker script the skill asks for now only has to find qualified targets that name no entity. The bundled tag and annotation reference also says that reversing runs in your agent session, not in karasu-nest.
