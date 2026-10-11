---
"@karasu-tools/core": patch
"karasu": patch
"karasu-skills": patch
---

`karasu diff` now reports the after model's resolver warnings, once per diff on both the default bundled output and `--view`, in the same `Warning:` / `Info:` format as `karasu render`, with each warning naming the file it came from. The diff also stops printing every diagnostic twice and no longer reports a false circular style import when both sides import the same style sheet (#2879).
