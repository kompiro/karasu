---
"karasu-skills": minor
---

The `reverse-architecture` skill validates with `karasu check --format json` and judges each finding by its `code`, so it works the same in any locale and stops when the check did not run instead of reading that as "no diagnostics". It no longer sets `LC_ALL=C` or matches message text. `karasu-author` explains the ID at the start of each `karasu check` line and points decisions at the JSON. Both need a karasu CLI with `check --format json` (#3654).
