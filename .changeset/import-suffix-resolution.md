---
"@karasu-tools/core": minor
"karasu": minor
---

`import { … }` entries resolve by the shared suffix rule (#2088 slice D2, #2576): a nested node can be imported by any suffix of its full path (`import { Checkout.Payment }`), roots are no longer limited to systems, every match is imported (bare-id parity), and non-uniform multi-matches draw the new `import-target-ambiguous` warning. `import-path-not-found` now reports the segment that emptied the candidate pool under right-to-left narrowing. Each entry of a named import carries its own source range, so `import-id-not-found` / `import-path-not-found` / `import-target-ambiguous` underline the entry that failed instead of the whole statement. A named import whose path roots at a `database` / `queue` / `storage` block now takes part in the S4.5 reopen protocol like a whole-file import does, reporting `infra-redeclared-across-files` and `infra-leaf-redeclared-silently` instead of merging two declarations silently.
