---
"karasu": patch
---

The `karasu` npm package is about 15MB smaller. The preview app that `karasu serve` ships no longer bundles the Monaco editor, which serve mode never shows: the app build drops from 16MB to 1.7MB (#3138). Serve mode no longer shows Share: its links pointed at the local server, so no one else could open them.
