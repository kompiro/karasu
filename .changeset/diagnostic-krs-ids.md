---
"@karasu-tools/core": minor
"karasu": minor
---

Every diagnostic now has a short ID that does not change with the locale, and the CLI prints it right after the severity word: `Warning[KRS041]: index.krs:3:3: ...`, `theme.krs.style:1:18 error[KRS086]: ...`. Look an ID up in the `ID` column of the diagnostics catalog. A script that matched the old `^Warning: ` prefix no longer matches: read `karasu check <file> --format json` instead, which prints the findings as one JSON document with a `schemaVersion` and each diagnostic's locale-independent `code` and `params`. The diagnostic lines are now meant for people and may change shape in a minor release; the JSON, command names, flags and exit codes stay compatible. Core exports the ID registry as `DIAGNOSTIC_IDS` (#3654).
