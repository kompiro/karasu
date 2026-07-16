---
"@karasu-tools/core": patch
"karasu": patch
---

Fix node description truncation on system and deploy cards: CJK characters are now counted at their display width (1.5×), so CJK descriptions are truncated where they visually overflow instead of spilling past the node border, and the ellipsis width is reserved within the text budget so truncated descriptions always fit. Truncated descriptions may end one character earlier than before.
