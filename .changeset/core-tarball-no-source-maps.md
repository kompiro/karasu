---
"@karasu-tools/core": patch
"karasu": patch
---

The published `@karasu-tools/core` no longer carries `.map` files, and its compiled files no longer end in a `sourceMappingURL` comment. The maps pointed at TypeScript sources the package does not include, so no tool could follow them, and they made up almost half of the files in the tarball. Compiled test files are now excluded too, should a build ever emit them (TPL-1681).
