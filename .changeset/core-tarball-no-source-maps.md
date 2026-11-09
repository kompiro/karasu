---
"@karasu-tools/core": patch
---

The published package no longer carries `.map` files. They pointed at TypeScript sources the package does not include, so no tool could follow them, and they made up almost half of the files in the tarball. Compiled test files are now excluded too, should a build ever emit them (TPL-1681).
