// What a Cloudflare Pages Function imports, and the checks the review-tier
// guard runs on it (#3799). Used by `tier.test.ts`; kept apart so that test
// holds only the policy and the expected result.
//
// Two readers, each for what it alone can tell:
//
// - esbuild, which wrangler bundles the functions with, resolves each import
//   the bundle keeps, with wrangler's options. The guard does not resolve a
//   path itself, so it checks the file the bundle loads: extension order, a
//   written `.js` naming a `.ts`, a directory's `package.json`, a link's real
//   path. An import the bundle drops (`import type`, an unused binding in a
//   `.ts` file) loads nothing and is not checked.
// - @babel/parser reads the syntax tree, so a specifier computed at run time
//   (`import(name)`, `require("" + x)`) is reported with its line: esbuild
//   leaves such a call alone, so it never reaches the resolver.
//
// `require` itself is banned in `functions/**` by lint, so `import()` is the
// only run-time load a function can write.

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isBuiltin } from "node:module";
import { join, relative, resolve, sep } from "node:path";
import { type ParserPlugin, parse } from "@babel/parser";
import { build, type Plugin } from "esbuild";

/**
 * One import a file writes. `specifier` is null when it is computed at run
 * time; `call` is true for `import()` and `require()`.
 */
export interface ImportSite {
  line: number;
  specifier: string | null;
  call: boolean;
}

/** The imports in `text`, or the parse error when it does not parse. */
export function readImports(
  fileName: string,
  text: string,
): { imports: ImportSite[] } | { error: string } {
  // What esbuild also builds: decorators and `accessor` fields. Babel 8 no longer
  // reads `assert` on an import; such a file reports "does not parse".
  const plugins: ParserPlugin[] = ["decorators", "decoratorAutoAccessors"];
  if (/\.[cm]?tsx?$/.test(fileName)) plugins.push("typescript");
  if (!/\.[cm]?ts$/.test(fileName)) plugins.push("jsx");
  let program: unknown;
  try {
    program = parse(text, { sourceType: "module", plugins }).program;
  } catch (error) {
    return { error: (error as Error).message };
  }

  const imports: ImportSite[] = [];
  const add = (node: Node, arg: Node | undefined, call = false) =>
    imports.push({ line: node.loc?.start.line ?? 0, specifier: literal(arg), call });
  walk(program, (node) => {
    switch (node.type) {
      case "ImportDeclaration":
      case "ExportAllDeclaration":
        add(node, node.source);
        break;
      case "ExportNamedDeclaration":
        if (node.source) add(node, node.source);
        break;
      case "ImportExpression":
        add(node, node.source, true);
        break;
      case "CallExpression":
      case "OptionalCallExpression": {
        const callee = unwrap(node.callee as Node);
        const isImport = callee.type === "Import";
        const isRequire = callee.type === "Identifier" && callee.name === "require";
        if (isImport || isRequire) add(node, (node.arguments as Node[])[0], true);
        break;
      }
      case "TSExternalModuleReference":
        add(node, node.expression);
        break;
      case "TSImportType":
        add(node, node.source);
        break;
    }
  });
  return { imports };
}

/** What may be imported besides repo files on the boundary. */
export interface ImportPolicy {
  /** Package names, such as `@resvg/resvg-wasm`. */
  packages: ReadonlySet<string>;
  /** Node built-ins, written with the `node:` prefix. */
  builtins: ReadonlySet<string>;
}

/**
 * The files under `dir` (repo paths, POSIX), as wrangler finds the functions:
 * a symbolic link to a file is listed under its own path, a linked directory
 * is walked, and a directory whose name looks like a source (`v1.js/`) is not
 * listed itself.
 */
export function listFiles(root: string, dir: string): string[] {
  return readdirSync(resolve(root, dir), { recursive: true, withFileTypes: true })
    .map((entry) => join(entry.parentPath, entry.name))
    .filter(isFile)
    .map((path) => toRepoPath(root, path));
}

/**
 * Checks each function (repo paths, POSIX) and the modules it imports
 * directly: both must be on the boundary, a package or built-in must be in
 * the policy, and every specifier must be a string that resolves. A symbolic
 * link is judged by the file it points to, since that is what gets bundled.
 * Returns one line per problem, and the repo files the functions import.
 */
export async function checkImports(options: {
  root: string;
  files: readonly string[];
  policy: ImportPolicy;
  onBoundary: (path: string) => boolean;
}): Promise<{ problems: string[]; imported: string[] }> {
  const { root, files, policy, onBoundary } = options;
  const problems: string[] = [];
  const imported = new Set<string>();
  // Real paths on both sides, so a root reached through a link still contains its files.
  const realRoot = realpathSync(root);
  const offBoundary = (path: string) => path.startsWith("../") || !onBoundary(path);
  for (const file of files) {
    const onDisk = resolve(root, file);
    const real = toRepoPath(realRoot, realpathSync(onDisk));
    if (offBoundary(file)) problems.push(`${file}: off the boundary`);
    else if (offBoundary(real)) problems.push(`${file}: links to ${real}, off the boundary`);

    const result = readImports(file, readFileSync(onDisk, "utf-8"));
    if ("error" in result) {
      problems.push(`${file}: does not parse: ${result.error}`);
      continue;
    }
    const lineOf = (specifier: string, call: boolean) => {
      const sites = result.imports.filter((s) => s.specifier === specifier);
      const site = sites.find((s) => s.call === call) ?? sites[0];
      return site ? `${file}:${site.line}` : file;
    };

    let bundle: Bundle;
    try {
      bundle = await bundledImports(realRoot, onDisk);
    } catch (error) {
      problems.push(`${file}: does not build: ${(error as Error).message}`);
      continue;
    }
    // A call the bundle does not resolve stays a run-time `require` /
    // `import()`, such as `require?.(x)` or `(0, require)(x)`; the guard
    // cannot tell what it loads, so it fails, as a computed specifier does.
    // esbuild reports specifiers, not call sites, so this misses such a call
    // beside a bundled one of the same specifier: the lint rule that bans
    // `require` in `functions/**` closes that (`.oxlintrc.json`), and `import`
    // has no optional or indirect form.
    const keptCalls = new Set(bundle.imports.filter((b) => b.call).map((b) => b.specifier));
    for (const { line, specifier, call } of result.imports) {
      if (specifier === null) problems.push(`${file}:${line}: computed import specifier`);
      else if (call && !keptCalls.has(specifier))
        problems.push(`${file}:${line}: "${specifier}" is loaded at run time, not bundled`);
    }
    // The walk is one level: esbuild reads another module's imports only when
    // the guard did not expect it to, so that module goes unchecked.
    for (const other of bundle.otherImporters)
      problems.push(
        `${file}: esbuild read the imports of ${toRepoPath(realRoot, other)}, unchecked`,
      );

    for (const { specifier, call, target } of bundle.imports) {
      const at = lineOf(specifier, call);
      if (target === "builtin") {
        const name = specifier.startsWith("node:") ? specifier : `node:${specifier}`;
        if (!policy.builtins.has(name))
          problems.push(`${at}: Node built-in "${name}" is not allowed`);
        continue;
      }
      if (!/^[./]/.test(specifier)) {
        const name = packageName(specifier);
        if (!policy.packages.has(name)) {
          problems.push(`${at}: package "${name}" is not allowed`);
          continue;
        }
        if (specifier.split("/").some((part) => part === "." || part === "..")) {
          // `pkg/../../x` can load a repo file when the package has no `exports`.
          problems.push(`${at}: "${specifier}" leaves the package`);
          continue;
        }
      }
      if (target === null) {
        problems.push(`${at}: "${specifier}" does not resolve`);
        continue;
      }
      const path = toRepoPath(realRoot, realpathSync(target));
      // An allowed package is checked by its name. A package name that lands on
      // a repo file (a tsconfig `paths` or `browser` alias) is that file.
      if (!/^[./]/.test(specifier) && (path.startsWith("../") || path.includes("node_modules/")))
        continue;
      imported.add(path);
      if (offBoundary(path)) problems.push(`${at}: ${path} is off the boundary`);
    }
  }
  return { problems, imported: [...imported] };
}

/**
 * One import the bundle keeps, resolved by esbuild: the file it loads,
 * `builtin`, or null when it does not resolve.
 */
interface BundledImport {
  specifier: string;
  /** Kept as `require()` or `import()`, not as a declaration. */
  call: boolean;
  target: string | "builtin" | null;
}

/** What esbuild read in one function. */
interface Bundle {
  imports: BundledImport[];
  /** Modules other than the entry whose imports esbuild asked to resolve. */
  otherImporters: Set<string>;
}

// What wrangler passes esbuild that decides which file an import loads
// (workers-sdk `packages/wrangler/src/deployment-bundle/bundle.ts`): no
// `platform`, so esbuild's `browser` and its `mainFields`; these conditions;
// `.js` read as JSX; no `preserveSymlinks`, so a link resolves from its target.
const WRANGLER_CONDITIONS = ["workerd", "worker", "browser"];
const WRANGLER_LOADER = { ".js": "jsx", ".mjs": "jsx", ".cjs": "jsx" } as const;

/**
 * The imports esbuild keeps in `entry`, each resolved by esbuild itself. Only
 * the entry's own imports are followed: each is marked external once it is
 * resolved, so nothing it imports in turn is read.
 */
async function bundledImports(root: string, entry: string): Promise<Bundle> {
  const imports: BundledImport[] = [];
  const otherImporters = new Set<string>();
  // esbuild names a linked entry by its target (no `preserveSymlinks`).
  const importer = realpathSync(entry);
  const RESOLVING = Symbol("resolving");
  const direct: Plugin = {
    name: "direct-imports",
    setup(b) {
      b.onResolve({ filter: /.*/ }, async (args) => {
        if (args.kind === "entry-point" || args.pluginData === RESOLVING) return undefined;
        if (args.importer !== importer) {
          // Only a file a template import expands reaches here, and the
          // template already fails as computed; anything else is reported.
          otherImporters.add(args.importer);
          return { path: args.path, external: true };
        }
        const call = args.kind === "require-call" || args.kind === "dynamic-import";
        if (isBuiltin(args.path)) {
          imports.push({ specifier: args.path, call, target: "builtin" });
        } else {
          // A package name too, since tsconfig `paths` or a `browser` map can
          // point it at a repo file.
          const r = await b.resolve(args.path, {
            kind: args.kind,
            importer: args.importer,
            resolveDir: args.resolveDir,
            pluginData: RESOLVING,
          });
          imports.push({ specifier: args.path, call, target: r.errors.length > 0 ? null : r.path });
        }
        return { path: args.path, external: true };
      });
    },
  };
  await build({
    entryPoints: [entry],
    absWorkingDir: root,
    bundle: true,
    write: false,
    format: "esm",
    conditions: WRANGLER_CONDITIONS,
    loader: WRANGLER_LOADER,
    logLevel: "silent",
    plugins: [direct],
  });
  return { imports, otherImporters };
}

// The classifier's globs are POSIX; `relative` uses a backslash on Windows.
const toRepoPath = (root: string, path: string) => relative(root, path).split(sep).join("/");

/** `@scope/name/sub` → `@scope/name`, `name/sub` → `name`. */
const packageName = (specifier: string) => {
  const parts = specifier.split("/");
  return parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
};

const isFile = (path: string) => existsSync(path) && statSync(path).isFile();

// A Babel node, loosely typed: the walk only reads `type` and a few fields.
// oxlint-disable-next-line typescript/no-explicit-any
type Node = { type: string; loc?: { start: { line: number } } } & Record<string, any>;

/** The expression under `x as T`, `x!`, `x satisfies T`, `<T>x` and `(0, x)`. */
function unwrap(node: Node): Node {
  switch (node.type) {
    case "TSAsExpression":
    case "TSNonNullExpression":
    case "TSSatisfiesExpression":
    case "TSTypeAssertion":
    case "ParenthesizedExpression":
      return unwrap(node.expression as Node);
    case "SequenceExpression":
      return unwrap((node.expressions as Node[]).at(-1) as Node);
    default:
      return node;
  }
}

/** A plain string specifier, or null when it is computed. */
function literal(node: Node | undefined): string | null {
  if (node?.type === "StringLiteral") return node.value as string;
  if (node?.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0].value.cooked as string;
  }
  return null;
}

function walk(value: unknown, visit: (node: Node) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  if (typeof (value as Node).type === "string") visit(value as Node);
  for (const [key, child] of Object.entries(value)) {
    if (
      key !== "loc" &&
      key !== "leadingComments" &&
      key !== "trailingComments" &&
      key !== "innerComments"
    ) {
      walk(child, visit);
    }
  }
}
