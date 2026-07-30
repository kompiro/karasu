/**
 * The `.krs` / `.krs.style` language version implemented by this build.
 *
 * Single source of truth for the language axis (ADR-2124): independent from
 * every package's npm semver. The spec docs (docs/spec/syntax.md / style.md
 * and their ja variants) state the same version as the canonical token
 * `.krs language v<version>`; language-version.test.ts guards the two
 * representations against drift (TPL-1296). The version moves per
 * ADR-1314 semantics: additive changes bump v1.x, breaking changes require
 * v2.0.
 */
export const KRS_LANGUAGE_VERSION = "1.0";
