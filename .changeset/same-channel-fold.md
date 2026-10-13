---
"@karasu-tools/core": patch
"karasu": patch
---

Edges between two cards in adjacent rows no longer fold back inside the channel between them. When both ends of a route drop into that one channel, the route now crosses it as a single run, so a pair of edges drawn both ways between the two cards no longer shares a vertical segment (#3134).
