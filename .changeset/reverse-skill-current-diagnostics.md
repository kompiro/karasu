---
"karasu-skills": patch
---

The `reverse-architecture` skill now describes what the CLI actually reports (#3640). It knows that `karasu fmt` keeps `@draft(confidence: ...)`, that most bare entity relation targets warn, and which id collisions draw no diagnostic. The bundled references now say the `reverse-architecture` skill reverses repositories, and that only a qualified entity relation is exempt from the edge scope check.
