---
"karasu-vscode": patch
---

Move the language client and server to the 10.x line together, so both sides of the extension speak LSP protocol 3.18.2. They were on 9.x, and the two packages pin the protocol exactly — taking either side alone leaves the client and server disagreeing about the protocol version, which makes editor ↔ preview cursor sync land on the wrong line rather than not move at all (#2337). Nothing user-facing changes on its own, but the pair now moves as a unit, and Dependabot groups the three packages so a future update cannot split them again.
