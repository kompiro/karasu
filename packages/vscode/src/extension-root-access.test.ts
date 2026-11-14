import { readFileSync, readdirSync } from "node:fs";
import * as path from "node:path";
import { transformSync } from "esbuild";
import { describe, expect, it } from "vitest";

/**
 * TPL-1024 items 2 and 4: the extension reads its own install folder only
 * through `extension-assets.ts`, which resolves names from `PACKAGED_ASSETS`.
 * That keeps every runtime asset on the list the `.vsix` is checked against,
 * and every failed lookup reported.
 *
 * The check parses each source file with esbuild, the parser that builds the
 * extension, rather than matching text. `mangleProps` reports the folder
 * members (`asAbsolutePath`, `extensionUri`, `extensionPath`) however they are
 * reached: `a.b`, `a["b"]`, destructuring, through any alias of the context.
 * `define` reports the module-relative globals (`__dirname`, `__filename`,
 * `import.meta`, `require.resolve`), and respects shadowing. `cwd` is listed
 * because a path relative to the working directory is the other way to find
 * files next to the code.
 */
const SRC = import.meta.dirname;
const GATEWAY = "extension-assets.ts";
const FOLDER_MEMBERS = /^(asAbsolutePath|extensionUri|extensionPath|cwd)$/;
const MARKER = "__KARASU_EXTENSION_ROOT_ACCESS__";
const FOLDER_GLOBALS = ["__dirname", "__filename", "import.meta", "require.resolve"];

/** The folder members and globals `code` reaches. */
function folderAccess(code: string): string[] {
  const result = transformSync(code, {
    loader: "ts",
    format: "esm",
    mangleProps: FOLDER_MEMBERS,
    mangleQuoted: true,
    mangleCache: {},
    define: Object.fromEntries(FOLDER_GLOBALS.map((name) => [name, MARKER])),
  });
  const members = Object.keys(result.mangleCache ?? {});
  return result.code.includes(MARKER) ? [...members, "a module-relative global"] : members;
}

function runtimeSources(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.endsWith(".d.ts"))
    .sort();
}

describe("the extension reaches its own folder only through extension-assets.ts (TPL-1024)", () => {
  it.each([
    ["a member", "export const f = (c: any) => c.asAbsolutePath('out/x.js');"],
    ["a quoted member", "export const f = (c: any) => c['extensionUri'];"],
    ["a destructured member", "export const f = ({ extensionPath }: any) => extensionPath;"],
    [
      "an alias",
      "export const f = (c: any) => { const d = c; const { extensionUri: u } = d; return u; };",
    ],
    ["an object key", "export const host = (c: any) => ({ extensionUri: c });"],
    ["__dirname", "export const p = __dirname + '/x';"],
    ["import.meta", "export const p = import.meta.url;"],
    ["process.cwd()", "export const p = process.cwd();"],
  ])("sees %s", (_shape, code) => {
    expect(folderAccess(code)).not.toEqual([]);
  });

  it("ignores names that only appear in types or are shadowed", () => {
    expect(
      folderAccess(
        "interface H { extensionUri: string } export const f = (__dirname: string) => __dirname;",
      ),
    ).toEqual([]);
  });

  it("finds the folder reads in the gateway, so the scan sees real code", () => {
    expect(runtimeSources()).toContain(GATEWAY);
    expect(folderAccess(readFileSync(path.join(SRC, GATEWAY), "utf8"))).toEqual(
      expect.arrayContaining(["asAbsolutePath", "extensionUri"]),
    );
  });

  it("finds no folder read in any other source file", () => {
    const sources = runtimeSources().filter((name) => name !== GATEWAY);
    expect(sources).toContain("extension.ts");
    const offenders = sources.flatMap((name) => {
      const found = folderAccess(readFileSync(path.join(SRC, name), "utf8"));
      return found.length === 0 ? [] : [`${name}: ${found.join(", ")}`];
    });
    expect(offenders).toEqual([]);
  });
});
