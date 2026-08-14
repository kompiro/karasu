---
"@karasu-tools/core": minor
"karasu": minor
---

Give each annotation's default badge a per-theme color pair. `defaultBadge.color`
in the reference payload is now `{ dark, light }` instead of a single (dark)
string, and the light palette moves from `default-style.ts` into
`reference-data.ts`, so the built-in stylesheet and any consumer showing a badge
resolve the same value for the active theme. The Reference panel painted the
dark palette under the light theme before this (#2482).
