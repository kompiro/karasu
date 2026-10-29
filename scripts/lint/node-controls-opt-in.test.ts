/**
 * Every surface that wires up the per-node buttons has to ask for them.
 *
 * Since #2420 the i / D buttons are drawn only when the caller passes
 * `nodeControls: true`, so a viewer that handles `data-info-button` clicks but
 * forgets the option loses the button silently — nothing throws, the diagram
 * just quietly stops offering the affordance. That is exactly what happened to
 * the VS Code webview when the buttons first rode the `interactive` flag: six
 * ExTester cases went red for a one-line omission that no type check could see.
 *
 * The check pairs the two facts that must move together: a source file that
 * handles a button click, and the same package asking for the button. It lives
 * here, where every surface's source can be read side by side.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../..");

// The VS Code preview runs the app's viewer since #3312, so the app's entry
// below covers it; it no longer has a handler or a compile call of its own.
const SURFACES = [
  {
    name: "app system view",
    handler: "packages/app/src/components/PreviewPane.tsx",
    caller: "packages/app/src/hooks/useSystemView.ts",
    handles: ["data-info-button", "data-deploy-button"],
  },
];

describe.each(SURFACES)("$name", ({ handler, caller, handles }) => {
  it.each(handles)("handles a click on %s", (attr) => {
    // Named one by one rather than as an alternation: an "either" would let a
    // surface that dropped one of them keep passing.
    expect(readFileSync(join(root, handler), "utf8")).toContain(attr);
  });

  it("asks the renderer to draw the buttons it handles", () => {
    expect(readFileSync(join(root, caller), "utf8")).toMatch(/nodeControls:\s*true/);
  });
});
