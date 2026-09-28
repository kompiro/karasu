---
"karasu": minor
---

Add `karasu capabilities --json`, which reports the CLI version, every command with its flags, and any deprecated or removed names with their replacements, so skills and scripts can check what the installed CLI accepts. Renamed commands and flags now keep working under their old names until the next major release: an old name runs its replacement and prints one fixed-format line to stderr (`karasu: deprecated: 'old' -> 'new' (since X, removal Y)`), and a removed name fails with the same line instead of "unknown command" (#2961).
