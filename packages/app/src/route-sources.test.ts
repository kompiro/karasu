import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FUNCTION_ROUTE_SEGMENTS, STATIC_ROUTE_SEGMENTS } from "./routes.js";
import { guardBarePath } from "./render/bare-route.js";

/**
 * The route table (`routes.ts`) checked against the places routes are actually
 * defined, so a route added only where it is defined fails here (TPL-1961).
 *
 * `routes-config.test.ts` checks the table against `_routes.json`; this file
 * closes the other side. The Pages Functions directory is the definition of the
 * sibling Function routes, and `public/` plus Vite's output directory are the
 * definition of the static paths. A new `functions/foo.ts` or `public/foo/`
 * that the table does not reserve would be swallowed by the bare-permalink
 * catch-all and cost a GitHub round-trip on every hit.
 *
 * The SPA's own path routes (`SPA_ROUTE_SEGMENTS`) have no directory to read:
 * the one there is (`/projects/<id>`) is built from the table's constant, which
 * `routes-config.test.ts` checks.
 */

const FUNCTIONS_DIR = fileURLToPath(new URL("../../../functions/", import.meta.url));
const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));

/** Vite's `build.assetsDir`. `vite.config.ts` leaves it at the default. */
const VITE_ASSETS_DIR = "assets";

/** Pages reads these from the output root as configuration; they are never served. */
const PAGES_CONFIG_FILES = new Set(["_redirects", "_routes.json", "_headers"]);

interface RoutesConfig {
  exclude: string[];
}

const routesConfig: RoutesConfig = JSON.parse(readFileSync(`${PUBLIC_DIR}_routes.json`, "utf8"));

/**
 * First path segments the Functions directory routes. Pages builds a route from
 * every `.ts` / `.js` module and every directory; `_`-prefixed entries are not
 * routes (`_lib`), and the root `[[path]]` catch-all is the route the table
 * protects the others from.
 */
function functionSegments(): string[] {
  return readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith("_") && !entry.name.startsWith("[["))
    .filter((entry) => entry.isDirectory() || /\.(ts|js)$/.test(entry.name))
    .filter((entry) => entry.name !== "tsconfig.json")
    .map((entry) => entry.name.replace(/\.(ts|js)$/, ""));
}

const publicEntries = readdirSync(PUBLIC_DIR, { withFileTypes: true }).filter(
  (entry) => !PAGES_CONFIG_FILES.has(entry.name),
);

const staticDirectories = [
  VITE_ASSETS_DIR,
  ...publicEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
];
const staticFiles = publicEntries.filter((entry) => entry.isFile()).map((entry) => entry.name);

describe("functions/", () => {
  it("defines at least one sibling route, so the enumeration is reading something", () => {
    expect(functionSegments().length).toBeGreaterThan(0);
  });

  it.each(functionSegments())("reserves the Function route /%s", (segment) => {
    expect(FUNCTION_ROUTE_SEGMENTS as readonly string[]).toContain(segment);
    expect(guardBarePath(`/${segment}/o/r`)).toBeNull();
  });
});

describe("static paths", () => {
  it.each(staticDirectories)("reserves and excludes the directory /%s", (directory) => {
    expect(STATIC_ROUTE_SEGMENTS as readonly string[]).toContain(directory);
    expect(routesConfig.exclude).toContain(`/${directory}/*`);
    expect(guardBarePath(`/${directory}/o/r`)).toBeNull();
  });

  it.each(staticFiles)("excludes the root file /%s from the Function", (file) => {
    // A root file is one segment, so the guard never reads it as `<owner>/<repo>`;
    // the exclusion saves the Worker invocation (TPL-1961: the route table
    // lists `/`, static files, Functions and SPA routes).
    expect(routesConfig.exclude).toContain(`/${file}`);
    expect(guardBarePath(`/${file}`)).toBeNull();
  });
});
