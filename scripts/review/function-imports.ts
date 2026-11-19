// What a Cloudflare Pages Function imports, read from its syntax tree, and the
// checks the review-tier guard runs on it (#3799). Used by `tier.test.ts`;
// kept apart so that test holds only the policy and the expected result.
//
// The tree comes from @babel/parser, so a comment or a string is never read as
// an import, and a call named `from` is just a call. Each `import`, `export …
// from`, `import()`, `require()`, `import x = require()` and `import("…")` type
// is read; one whose specifier is not a plain string is reported, because the
// guard cannot tell what it loads.

import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { isBuiltin } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { type ParserPlugin, parse } from "@babel/parser";

/** One import a file writes. `specifier` is null when it is computed at run time. */
export interface ImportSite {
  line: number;
  specifier: string | null;
}

/** The imports in `text`, or the parse error when it does not parse. */
export function readImports(
  fileName: string,
  text: string,
): { imports: ImportSite[] } | { error: string } {
  // What esbuild also builds: decorators, `accessor` fields, `assert` on an import.
  const plugins: ParserPlugin[] = [
    "decorators",
    "decoratorAutoAccessors",
    "deprecatedImportAssert",
  ];
  if (/\.[cm]?tsx?$/.test(fileName)) plugins.push("typescript");
  if (!/\.[cm]?ts$/.test(fileName)) plugins.push("jsx");
  let program: unknown;
  try {
    program = parse(text, { sourceType: "module", plugins }).program;
  } catch (error) {
    return { error: (error as Error).message };
  }

  const imports: ImportSite[] = [];
  const add = (node: Node, arg: Node | undefined) =>
    imports.push({ line: node.loc?.start.line ?? 0, specifier: literal(arg) });
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
        add(node, node.source);
        break;
      case "CallExpression":
      case "OptionalCallExpression": {
        const callee = unwrap(node.callee as Node);
        const isImport = callee.type === "Import";
        const isRequire = callee.type === "Identifier" && callee.name === "require";
        if (isImport || isRequire) add(node, (node.arguments as Node[])[0]);
        break;
      }
      case "TSExternalModuleReference":
        add(node, node.expression);
        break;
      case "TSImportType":
        add(
          node,
          (node.argument as Node).type === "TSLiteralType" ? node.argument.literal : node.argument,
        );
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
 * Checks each file (repo paths, POSIX) and the modules it imports directly:
 * both must be on the boundary, a package or built-in must be in the policy,
 * and every specifier must be a string that resolves. A symbolic link is
 * judged by the file it points to, since that is what gets bundled. Returns
 * one line per problem, and the repo files the functions import.
 */
export function checkImports(options: {
  root: string;
  files: readonly string[];
  read: (path: string) => string;
  policy: ImportPolicy;
  onBoundary: (path: string) => boolean;
}): { problems: string[]; imported: string[] } {
  const { root, files, read, policy, onBoundary } = options;
  const problems: string[] = [];
  const imported = new Set<string>();
  // Real paths on both sides, so a root reached through a link still contains its files.
  const realRoot = realpathSync(root);
  const offBoundary = (path: string) => path.startsWith("../") || !onBoundary(path);
  for (const file of files) {
    const onDisk = resolve(root, file);
    const real = existsSync(onDisk) ? toRepoPath(realRoot, realpathSync(onDisk)) : file;
    if (offBoundary(file)) problems.push(`${file}: off the boundary`);
    else if (offBoundary(real)) problems.push(`${file}: links to ${real}, off the boundary`);
    const result = readImports(file, read(file));
    if ("error" in result) {
      problems.push(`${file}: does not parse: ${result.error}`);
      continue;
    }
    for (const { line, specifier } of result.imports) {
      const at = `${file}:${line}`;
      if (specifier === null) {
        problems.push(`${at}: computed import specifier`);
      } else if (isBuiltin(specifier)) {
        const name = specifier.startsWith("node:") ? specifier : `node:${specifier}`;
        if (!policy.builtins.has(name))
          problems.push(`${at}: Node built-in "${name}" is not allowed`);
      } else if (!/^[./]/.test(specifier)) {
        const name = packageName(specifier);
        if (!policy.packages.has(name)) {
          problems.push(`${at}: package "${name}" is not allowed`);
        } else if (specifier.split("/").some((part) => part === "." || part === "..")) {
          // `pkg/../../x` can load a repo file when the package has no `exports`.
          problems.push(`${at}: "${specifier}" leaves the package`);
        }
      } else {
        const target = resolveFile(resolve(root, dirname(file), specifier));
        if (target === null) {
          problems.push(`${at}: "${specifier}" does not resolve`);
          continue;
        }
        const path = toRepoPath(realRoot, realpathSync(target));
        imported.add(path);
        if (offBoundary(path)) problems.push(`${at}: ${path} is off the boundary`);
      }
    }
  }
  return { problems, imported: [...imported] };
}

// The classifier's globs are POSIX; `relative` uses a backslash on Windows.
const toRepoPath = (root: string, path: string) => relative(root, path).split(sep).join("/");

/** `@scope/name/sub` → `@scope/name`, `name/sub` → `name`. */
const packageName = (specifier: string) => {
  const parts = specifier.split("/");
  return parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
};

// esbuild's default `resolveExtensions`, in its order: wrangler bundles the
// functions with it, so a specifier loads the file it picks.
const SOURCE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".css", ".json"];
// A written `.js` names the `.ts` it is compiled from, as esbuild reads it.
const COMPILED_FROM: Record<string, string[]> = {
  ".js": [".ts", ".tsx"],
  ".jsx": [".ts", ".tsx"],
  ".mjs": [".mts"],
  ".cjs": [".cts"],
};

const isFile = (path: string) => existsSync(path) && statSync(path).isFile();

/**
 * The file a relative specifier loads, or null, in esbuild's order: the path
 * as written, then with each extension appended (`b.js` → `b.js.ts`), then
 * with a written `.js` rewritten (`b.js` → `b.ts`), then the directory's index.
 */
function resolveFile(path: string): string | null {
  if (isFile(path)) return path;
  for (const e of SOURCE_EXTENSIONS) if (isFile(path + e)) return path + e;
  const ext = Object.keys(COMPILED_FROM).find((e) => path.endsWith(e));
  if (ext) {
    for (const from of COMPILED_FROM[ext]) {
      const candidate = path.slice(0, -ext.length) + from;
      if (isFile(candidate)) return candidate;
    }
  }
  for (const e of SOURCE_EXTENSIONS) if (isFile(`${path}/index${e}`)) return `${path}/index${e}`;
  return null;
}

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
