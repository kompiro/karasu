import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RESERVED_TOP_SEGMENTS, SPA_ROUTE_SEGMENTS, STATIC_ROUTE_SEGMENTS } from "./routes.js";
import { buildProjectPath } from "./hooks/useProjectNavigation.js";

/**
 * Drift guard between the three places that must agree about which paths the
 * bare-permalink catch-all may not touch (#1961, TPL-1961):
 *
 *   1. `routes.ts`               — the table the route guard reads
 *   2. `public/_routes.json`     — which requests reach the Worker at all
 *   3. `useProjectNavigation.ts` — the SPA route that actually exists
 *
 * The failure this prevents is remote from its cause: someone adds an SPA route,
 * forgets one of the other two, and a page that worked yesterday starts taking a
 * pointless GitHub round-trip — or, if `_routes.json` disagrees, never reaches
 * the Function that was supposed to handle it. Neither shows up in the PR that
 * causes it, which is why the check lives with the definition rather than in the
 * catch-all's own tests (TPL-1480: fire on the change that breaks it).
 */

interface RoutesConfig {
  version: number;
  include: string[];
  exclude: string[];
}

const routesConfig: RoutesConfig = JSON.parse(
  readFileSync(fileURLToPath(new URL("../public/_routes.json", import.meta.url)), "utf8"),
);

describe("_routes.json", () => {
  it("includes everything, so a newly added Function is never missed", () => {
    // Only `exclude` needs maintenance: with `include: ["/*"]`, adding
    // functions/foo.ts routes to it automatically.
    expect(routesConfig.include).toEqual(["/*"]);
  });

  it.each([...SPA_ROUTE_SEGMENTS])("excludes the SPA route /%s/*", (segment) => {
    // Without this the catch-all pays two GitHub fetches before handing
    // /projects/<id> back to the SPA — ~200 ms instead of ~4 ms on reload.
    expect(routesConfig.exclude).toContain(`/${segment}/*`);
  });

  it.each([...STATIC_ROUTE_SEGMENTS])("excludes the static directory /%s/*", (segment) => {
    // The build emits ~190 chunks under /assets; without the exclusion every one
    // of them costs a Worker invocation on every page load.
    expect(routesConfig.exclude).toContain(`/${segment}/*`);
  });

  it("excludes the SPA entry itself", () => {
    expect(routesConfig.exclude).toContain("/");
    expect(routesConfig.exclude).toContain("/index.html");
  });

  it("stays inside Cloudflare's limits (100 rules, 100 chars each)", () => {
    const rules = [...routesConfig.include, ...routesConfig.exclude];
    expect(rules.length).toBeLessThanOrEqual(100);
    for (const rule of rules) expect(rule.length).toBeLessThanOrEqual(100);
  });

  it("only excludes paths the route table knows about", () => {
    // An exclusion the table does not know about is a path the Function can
    // never see again — deliberate is fine, silent is not.
    const knownRoots = new Set([...RESERVED_TOP_SEGMENTS]);
    const wildcardRoots = routesConfig.exclude
      .filter((rule) => rule.endsWith("/*"))
      .map((rule) => rule.slice(1, -2));
    for (const root of wildcardRoots) expect(knownRoots).toContain(root);
  });
});

describe("SPA project route", () => {
  it("is built from the same segment the guard reserves", () => {
    // The URL the SPA pushes and the segment the catch-all declines are now the
    // same constant; this asserts the wiring rather than a copied string.
    const path = buildProjectPath("abc");
    const [, segment] = path.split("/");
    expect(RESERVED_TOP_SEGMENTS.has(segment)).toBe(true);
  });
});
