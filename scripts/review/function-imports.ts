// What a Cloudflare Pages Function imports, read from its syntax tree, and the
// checks the review-tier guard runs on it (#3799). Used by `tier.test.ts`;
// kept apart so that test holds only the policy and the expected result.
//
// The tree comes from @babel/parser, so a comment or a string is never read as
// an import, and a call named `from` is just a call. Each `import`, `export …
// from`, `import()`, `require()`, `import x = require()` and `import("…")` type
// is read; one whose specifier is not a plain string is reported, because the
// guard cannot tell what it loads.

import { existsSync, statSync } from "node:fs";
import { isBuiltin } from "node:module";
import { dirname, relative, resolve, sep } from "node:path";
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
  const plugins: ParserPlugin[] = /\.[cm]?tsx?$/.test(fileName)
    ? fileName.endsWith("x")
      ? ["typescript", "jsx"]
      : ["typescript"]
    : ["jsx"];
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
      case "CallExpression": {
        const callee = node.callee as Node;
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
 * Checks each file (repo paths, POSIX) and the modules it imports directly:
 * both must be on the boundary, a package or built-in must be in the policy,
 * and every specifier must be a string that resolves. Returns one line per
 * problem, and the repo files the functions import.
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
  for (const file of files) {
    if (!onBoundary(file)) problems.push(`${file}: off the boundary`);
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
        if (!policy.packages.has(name)) problems.push(`${at}: package "${name}" is not allowed`);
      } else {
        const target = resolveFile(resolve(root, dirname(file), specifier));
        if (target === null) {
          problems.push(`${at}: "${specifier}" does not resolve`);
          continue;
        }
        // The classifier's globs are POSIX; `relative` uses a backslash on Windows.
        const path = relative(root, target).split(sep).join("/");
        imported.add(path);
        if (path.startsWith("../") || !onBoundary(path))
          problems.push(`${at}: ${path} is off the boundary`);
      }
    }
  }
  return { problems, imported: [...imported] };
}

/** `@scope/name/sub` → `@scope/name`, `name/sub` → `name`. */
const packageName = (specifier: string) => {
  const parts = specifier.split("/");
  return parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
};

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
// A written `.js` names the `.ts` it is compiled from, as the bundler reads it.
const COMPILED_FROM: Record<string, string[]> = {
  ".js": [".ts", ".tsx"],
  ".jsx": [".tsx"],
  ".mjs": [".mts"],
  ".cjs": [".cts"],
};

const isFile = (path: string) => existsSync(path) && statSync(path).isFile();

/** The file a relative specifier loads, as the bundler resolves it, or null. */
function resolveFile(path: string): string | null {
  if (isFile(path)) return path;
  const ext = Object.keys(COMPILED_FROM).find((e) => path.endsWith(e));
  if (ext) {
    for (const from of COMPILED_FROM[ext]) {
      const candidate = path.slice(0, -ext.length) + from;
      if (isFile(candidate)) return candidate;
    }
  }
  for (const base of [path, `${path}/index`]) {
    for (const e of SOURCE_EXTENSIONS) if (isFile(base + e)) return base + e;
  }
  return null;
}

// A Babel node, loosely typed: the walk only reads `type` and a few fields.
// oxlint-disable-next-line typescript/no-explicit-any
type Node = { type: string; loc?: { start: { line: number } } } & Record<string, any>;

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
