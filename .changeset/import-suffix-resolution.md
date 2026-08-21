---
"@karasu-tools/core": minor
"karasu": minor
---

`import { … }` entries resolve by the shared suffix rule (#2088 slice D2, #2576): a nested node can be imported by any suffix of its full path (`import { Checkout.Payment }`), roots are no longer limited to systems, every match is imported (bare-id parity), and non-uniform multi-matches draw the new `import-target-ambiguous` warning. `import-path-not-found` now reports the segment that emptied the candidate pool under right-to-left narrowing.
