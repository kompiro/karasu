---
"@karasu-tools/core": patch
"karasu": patch
"karasu-skills": patch
---

When a `system`, `deploy` or `organization` is reopened across files, its `label` and `description` now come from the file closest to the open file, as the syntax reference says. A value carried up from two imports down used to beat one a single import down when its branch was imported first; with whole-file and directory imports the result no longer depends on the order of the `import` lines (#3713). The `system-property-conflict` warning now points at the declaration that lost, and is reported once per losing value instead of once per intermediate merge.
