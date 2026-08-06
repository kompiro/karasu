/**
 * What workerd checks at startup, checked here instead.
 *
 * A Workers entry may export a default handler and classes the runtime binds,
 * and nothing else. Exporting a string constant from it — trivially done by
 * pointing `main` at a barrel — makes the runtime refuse to start, and no
 * other signal in this repository notices: types pass, the suite passes, and
 * the failure appears the first time someone runs `wrangler dev` or deploys.
 */
import { describe, expect, it } from "vitest";
import * as entry from "./worker.js";

describe("the Workers entry", () => {
  it("exports only shapes the runtime accepts", () => {
    const { default: handler, ...named } = entry;
    expect(typeof handler.fetch).toBe("function");
    // Every named export must be a class the runtime can bind. Anything else
    // is what breaks startup.
    expect(Object.entries(named).filter(([, value]) => typeof value !== "function")).toEqual([]);
  });

  it("does not re-export the barrel", () => {
    // The way this breaks is someone adding `export * from "./index.js"` here
    // for convenience, which puts every constant back on the entry.
    expect(Object.keys(entry)).toEqual(["default"]);
  });
});
