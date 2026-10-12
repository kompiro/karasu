---
"@karasu-tools/core": patch
"karasu": patch
---

Keep nodes and edges apart when their ids only differ by where a dot or `->` sits (#2819). `owns Shop.Api` (the `Api` inside `Shop`) and `owns "Shop.Api"` (a top-level service with that id) now record two owners instead of one, so the false `duplicate-owner-assignment` / `duplicate-boundary-assignment` goes away, a node whose id contains a dot (`service "a.b"`) is drawn inside its team or boundary frame, the org view shows one button per reference (`→ Shop.Api` / `→ "Shop.Api"`), and compare mode gives `a -> "b->c"` and `"a->b" -> c` their own diff states. Models without `.`, `"`, `\` or `->` in their ids render exactly as before. `karasu team-dependencies` now writes such a path with its quotes (`Shop."a.b"`) in the `path` / `fromPath` / `toPath` / `insidePath` fields.
