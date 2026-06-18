---
"karasu": patch
---

Pin the `karasu` CLI's published `files` to the single esbuild bundle (`dist/index.js`) instead of the whole `dist/` directory. The bundle is the only runtime artifact; the previous `["dist"]` whole-directory glob would also pack any stray `tsc` emit (`*.test.js` / `*.d.ts` / `*.map`) left in the gitignored `dist/`, making the tarball non-deterministic. The published surface is now exactly `dist/index.js` + `THIRD_PARTY_NOTICES.md`, regardless of `dist/` hygiene. Fixes #1681.
