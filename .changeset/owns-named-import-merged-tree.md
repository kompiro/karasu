---
"@karasu-tools/core": patch
"karasu": patch
---

Fix a false `owns-target-not-found` warning on named imports. A team owning a node brought in by `import { X } from "./f.krs"` warned even though the merged model resolves it, while the identical declaration reached through `import "./f.krs"` did not. The `owns` valid-target set is now derived from the merged tree instead of the per-file `nodePathIndex`, so the verdict no longer depends on the import form — and a top-level (system-less) `service` is recognised as an ownable target in single-file models too (#2082).
