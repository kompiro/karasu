import { describe, it, expect } from "vitest";
import { compile } from "./compile.js";

/**
 * `OrgCompileResult.teamDependencies` is an accessor, not a value.
 *
 * The join walks every edge of every container and builds two indices, and
 * almost no org compile reads it: `karasu render --view org`, the docs-site
 * example renderer and the VS Code webview never touch the field, and the app
 * reads it only while the dependency mode is open (#2636).
 *
 * This is fenced rather than left to review because the laziness is invisible
 * at the call site and trivially undone — the first attempt built the accessor
 * on a carrier object and **spread** it into the result, which reads every own
 * enumerable property and so ran the derivation on every compile anyway. The
 * types were identical and every other test stayed green.
 */
const MODEL = `
system Shop {
  service Checkout { domain Cart { Cart -> Authorization "authorize" } }
  service Payments { domain Authorization {} }
}
organization Shop {
  team checkout { owns Checkout }
  team payments { owns Payments }
}
`;

describe("OrgCompileResult.teamDependencies is derived lazily", () => {
  it("is an accessor on the result, so an untouched compile does no work", () => {
    const result = compile(MODEL, { diagramType: "org" });
    const descriptor = Object.getOwnPropertyDescriptor(result, "teamDependencies");
    expect(descriptor).toBeDefined();
    expect(typeof descriptor!.get).toBe("function");
    expect(descriptor!.value).toBeUndefined();
  });

  it("still reads like a plain field, and derives the same report every time", () => {
    const result = compile(MODEL, { diagramType: "org" });
    if (result.diagramType !== "org") throw new Error("expected an org compile");
    const first = result.teamDependencies;
    expect(first.dependencies.map((d) => `${d.fromTeam}->${d.toTeam}`)).toEqual([
      "checkout->payments",
    ]);
    // Memoized: the second read is the same object, not a second walk.
    expect(result.teamDependencies).toBe(first);
  });

  it("is enumerable, so the field is not invisible to a plain reader", () => {
    const result = compile(MODEL, { diagramType: "org" });
    expect(Object.keys(result)).toContain("teamDependencies");
  });
});
