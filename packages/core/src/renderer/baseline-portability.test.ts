import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compile } from "../index.js";
import { DY_CENTER, DY_HANGING } from "./svg-builder.js";

/**
 * #2473: karasu's SVG must not depend on `dominant-baseline`.
 *
 * The attribute lives in the SVG text module, and rasterizers outside the
 * browser drop it without a word — the text then sits on its baseline, 3 to
 * 4.5px above where the card centres it at the sizes karasu emits. Vertical
 * placement rides `dy` in em units instead, which is core SVG 1.1.
 *
 * Guarded from two sides because either alone leaks: the source check catches
 * a new call site before it can reach any diagram, and the output check
 * catches a path this test does not name.
 */

const RENDERER_DIR = join(import.meta.dirname);

const MODEL = `system S {
  user Customer [human] { label "Customer" description "buys things" }
  service Shop @deprecated { label "Shop" description "sells things" }
  database Db { label "Orders" table t }
  queue Events { label "Events" queue-item e }
  storage Media { label "Media" bucket b }
  Customer -> Shop "buy"
  Shop -> Db "read"
  Shop -> Events "publish"
  Shop -> Media "store"
}
deploy "prod" {
  oci ShopBox { label "Shop box" image "shop:1" realizes Shop }
}
organization O {
  team Platform { label "Platform" owns Shop }
}`;

describe("SVG baseline portability", () => {
  it("emits no dominant-baseline from any renderer module", () => {
    const offenders = readdirSync(RENDERER_DIR)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .filter((f) => /"dominant-baseline"\s*:/.test(readFileSync(join(RENDERER_DIR, f), "utf8")));
    expect(offenders).toEqual([]);
  });

  it.each(["system", "deploy", "org"] as const)("emits none in the %s view either", (view) => {
    const svg = compile(MODEL, { diagramType: view, nodeControls: true }).svg;
    expect(svg).not.toContain("dominant-baseline");
    // Not passing on an empty render.
    expect(svg).toContain("<text");
  });

  // The org view places its text by baseline already, so it has nothing to
  // convert — asserting the replacement there would fail for the right reason
  // and read as a regression. The views that centre text are these.
  it.each(["system", "deploy"] as const)("centres the %s view's text on dy", (view) => {
    expect(compile(MODEL, { diagramType: view, nodeControls: true }).svg).toContain(
      `dy="${DY_CENTER}"`,
    );
  });

  it("uses the hanging offset for the icon slot's description", () => {
    // Reached only through an SVG icon that declares a description slot, which
    // a plain compile has no way to register — so this holds the call site
    // rather than the output.
    const source = readFileSync(join(RENDERER_DIR, "svg-renderer.ts"), "utf8");
    expect(source).toContain("dy: DY_HANGING");
    expect(DY_HANGING).not.toBe(DY_CENTER);
  });
});
