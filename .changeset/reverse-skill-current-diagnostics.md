---
"karasu-skills": patch
---

The `reverse-architecture` skill now describes what the CLI actually reports (#3640). The CLI prints diagnostic messages without codes, so the skill's validation steps match on message text; before, its greps for codes came back empty even on a broken model. It also knows that `karasu fmt` keeps `@draft(confidence: ...)`, that most bare entity relation targets warn, and that any infra id equal to a service or domain id draws no diagnostic. The bundled references now say the `reverse-architecture` skill reverses repositories, and that only a qualified entity relation is exempt from the edge scope check.
