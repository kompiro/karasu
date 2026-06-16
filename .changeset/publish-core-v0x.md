---
"@karasu-tools/core": minor
---

Publish `@karasu-tools/core` as a standalone v0.x library. The package is no longer `private`: its `exports` point published consumers at the built `dist/` (types + ESM), while a `development` export condition keeps the workspace resolving TS source so `pnpm typecheck` stays build-independent. Adds `repository` / `homepage` / `files` / `publishConfig` / `prepack`, a package README and LICENSE. The TypeScript API is v0.x — no stability promise; breaking changes may land in minor releases (see ADR-20260616-06). The npm org reservation and the actual first publish are gated on the public launch (#1317).
