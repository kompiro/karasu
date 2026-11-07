---
"karasu-skills": patch
---

The `reverse-architecture` skill now describes what the CLI actually reports (#3640). The CLI prints translated diagnostic messages without codes, so the skill's validation steps run under `LC_ALL=C` and match on message text; before, its greps for codes came back empty even on a broken model. It also knows that `karasu fmt` keeps `@draft(confidence: ...)`, that most bare entity relation targets warn, and which id collisions draw no diagnostic. `karasu-author` no longer says `karasu check` prints a code. The bundled references now say the `reverse-architecture` skill reverses repositories, and that only a qualified entity relation is exempt from the edge scope check.
