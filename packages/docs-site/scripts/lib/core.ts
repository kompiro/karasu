// Single re-export point for @karasu-tools/core. The docs-site scripts run
// under tsx (not a bundler/Node loader with the `development` exports
// condition wired up), so they cannot import the `@karasu-tools/core`
// package specifier: core's `exports` map resolves the default/import
// conditions to `./dist/index.js`, which would require a build step before
// `pnpm run sync` works. Importing the workspace `src/index.ts` directly
// sidesteps that, at the cost of a fragile deep-relative path — so that path
// is centralized here exactly once and every other module imports from this
// file instead (see the `@karasu-tools/core` devDependency in package.json
// for the honest dependency-graph edge).
export {
  compileProject,
  findOpenableExample,
  type DiagramType,
  type DirEntry,
  type FileSystemProvider,
} from "../../../core/src/index.ts";
